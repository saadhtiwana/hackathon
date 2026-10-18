import { Router, type Request } from 'express';
import { z } from 'zod';
import { badRequest, notFound, tooMany } from '../../core/errors.js';
import { parse } from '../../core/http/validate.js';
import { requirePermission } from '../../core/rbac/index.js';
import type { LeadRecord, PageCursor } from './repo.js';
import { ackRemainingSeconds, type LeadService, type Viewer } from './service.js';

export interface RouterOptions {
  rateLimit?: { max: number; windowMs: number };
  now?: () => Date;
}

const uuid = z.uuid();
const status = z.enum(['unassigned', 'assigned', 'acknowledged', 'closed']);
const source = z.enum(['webform', 'whatsapp', 'manual']);
const limit = z.coerce.number().int().min(1).max(200).default(50);
const cursor = z.string().max(200).optional();

const listQuery = z.object({ status: status.optional(), ownerId: uuid.optional(), source: source.optional(), mine: z.enum(['true', 'false']).optional(), limit, cursor });
const pageQuery = z.object({ limit, cursor });
const createBody = z.object({
  contactId: uuid.optional(),
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.email().max(320).optional(),
  message: z.string().max(5000).optional(),
});
const reassignBody = z.object({ toUserId: uuid, version: z.number().int().min(1) });
const closeBody = z.object({ outcome: z.string().trim().max(200).optional() });
const level = z.object({ kind: z.enum(['next_eligible', 'backup', 'manager']), userId: uuid.optional(), seconds: z.number().int().min(10).max(604800) });
const rulesBody = z.object({
  ackWindowSeconds: z.number().int().min(10).max(604800),
  maxOpenLeads: z.number().int().min(1).max(10000),
  idleSeconds: z.number().int().min(10).max(2592000),
  escalationLevels: z.array(level).max(10),
  acknowledgedOnLeavePolicy: z.literal('keep_flag_recover').default('keep_flag_recover'),
  strategy: z.literal('round_robin').default('round_robin'),
});
const webFormBody = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().max(40).optional(),
  email: z.email().max(320).optional(),
  message: z.string().max(5000).optional(),
  website: z.string().max(500).optional(), // honeypot: real visitors never see or fill it
});
const slug = z.string().min(1).max(100).regex(/^[a-z0-9-]+$/);

function leadId(req: Request): string {
  const r = uuid.safeParse(req.params.id);
  if (!r.success) throw notFound('Lead');
  return r.data;
}

const encodeCursor = (c: PageCursor | null) =>
  c ? Buffer.from(JSON.stringify({ t: c.createdAt.toISOString(), id: c.id })).toString('base64url') : null;

function decodeCursor(raw: string | undefined): PageCursor | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { t: string; id: string };
    const createdAt = new Date(v.t);
    if (Number.isNaN(createdAt.getTime()) || !uuid.safeParse(v.id).success) throw new Error();
    return { createdAt, id: v.id };
  } catch {
    throw badRequest('Invalid cursor', 'Start again from the first page', 'invalid_cursor');
  }
}

const viewer = (req: Request): Viewer => req.auth!;

// Fixed window per key. In-memory, so each server instance counts separately.
export function rateLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const t = now();
    if (hits.size > 10000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    const h = hits.get(key);
    if (!h || h.resetAt <= t) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      return true;
    }
    h.count++;
    return h.count <= max;
  };
}

export function leadsRouter(service: LeadService, opts: RouterOptions = {}) {
  const r = Router();
  const now = opts.now ?? (() => new Date());
  const allow = rateLimiter(opts.rateLimit?.max ?? 5, opts.rateLimit?.windowMs ?? 60_000);

  const toJson = (l: LeadRecord & { contactName?: string }) => {
    const { ownerHistory: _h, ...rest } = l;
    return { ...rest, status: l.state, ackRemainingSeconds: ackRemainingSeconds(l, now()) };
  };

  // ---- public web form (no session)

  r.get('/public/forms/:workspaceSlug', async (req, res) => {
    res.json(await service.publicForm(parse(slug, req.params.workspaceSlug)));
  });

  r.post('/public/leads/:workspaceSlug', async (req, res) => {
    if (!allow(`${req.ip}|${req.params.workspaceSlug}`)) {
      throw tooMany('Too many submissions', 'Try again in a minute');
    }
    const s = parse(slug, req.params.workspaceSlug);
    const body = parse(webFormBody, req.body);
    // same response for bots, unknown workspaces and real submissions
    if (!body.website) await service.submitWebForm(s, body);
    res.status(201).json({ ok: true });
  });

  // ---- app routes

  r.get('/leads', requirePermission('crm.view'), async (req, res) => {
    const q = parse(listQuery, req.query);
    const out = await service.list(viewer(req), { ...q, mine: q.mine === 'true', cursor: decodeCursor(q.cursor) });
    res.json({ items: out.items.map(toJson), nextCursor: encodeCursor(out.nextCursor) });
  });

  r.post('/leads', requirePermission('crm.create'), async (req, res) => {
    const lead = await service.createManual(viewer(req), parse(createBody, req.body));
    res.status(201).json({ lead: toJson(lead) });
  });

  // before /leads/:id so "recovery" is not read as an id
  r.get('/leads/recovery', requirePermission('leads.reassign'), async (req, res) => {
    const q = parse(pageQuery, req.query);
    const v = viewer(req);
    const out = await service.recoveryQueue(v.workspaceId, { userId: v.userId, canSeeAll: true }, { limit: q.limit, cursor: decodeCursor(q.cursor) });
    res.json({ items: out.items.map((i) => ({ lead: toJson(i.lead), reasons: i.reasons })), nextCursor: encodeCursor(out.nextCursor) });
  });

  r.get('/leads/:id', requirePermission('crm.view'), async (req, res) => {
    const d = await service.get(viewer(req), leadId(req));
    res.json({
      lead: toJson(d.lead),
      contact: d.contact,
      assignments: d.assignments,
      ackRemainingSeconds: d.ackRemainingSeconds,
      recoveryReasons: d.recoveryReasons,
    });
  });

  r.post('/leads/:id/acknowledge', requirePermission('crm.view'), async (req, res) => {
    res.json({ lead: toJson(await service.acknowledge(viewer(req), leadId(req))) });
  });

  r.post('/leads/:id/reassign', requirePermission('leads.reassign'), async (req, res) => {
    const id = leadId(req);
    const body = parse(reassignBody, req.body);
    res.json({ lead: toJson(await service.reassign(viewer(req), { leadId: id, ...body })) });
  });

  r.post('/leads/:id/close', requirePermission('crm.edit'), async (req, res) => {
    const id = leadId(req);
    const body = parse(closeBody, req.body ?? {});
    res.json({ lead: toJson(await service.close(viewer(req), { leadId: id, outcome: body.outcome })) });
  });

  r.get('/assignment-rules', requirePermission('leads.manage_rules'), async (req, res) => {
    res.json(await service.getRules(viewer(req).workspaceId));
  });

  r.put('/assignment-rules', requirePermission('leads.manage_rules'), async (req, res) => {
    res.json(await service.putRules(viewer(req), parse(rulesBody, req.body)));
  });

  return r;
}
