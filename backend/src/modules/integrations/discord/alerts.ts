import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { db } from '../../../core/db/client.js';
import { contacts, discordLinkCodes, integrationEvents as eventsTable, leads, memberships, outboxJobs, users } from '../../../core/db/schema/index.js';
import { audit } from '../../../core/audit/index.js';
import { sha256 } from '../../../core/crypto/index.js';
import { env } from '../../../core/env.js';
import { asyncHandler } from '../../../core/errors.js';
import { integrationEvents } from '../../../core/integration-events/index.js';
import { outbox, type OutboxJob } from '../../../core/outbox/index.js';
import { requireAuth } from '../../../core/auth/sessions.js';
import { requirePermission } from '../../../core/rbac/index.js';
import { ProviderError } from '../errors.js';
import { dmChannel, sendChannelMessage } from './api.js';
import { discordConfig } from './config.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export async function createLinkCode(ws: string, userId: string) {
  const code = newCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await db.transaction(async (tx) => {
    await tx.update(discordLinkCodes).set({ usedAt: new Date() }).where(and(eq(discordLinkCodes.workspaceId, ws), eq(discordLinkCodes.userId, userId)));
    await tx.insert(discordLinkCodes).values({ workspaceId: ws, userId, codeHash: sha256(code), expiresAt });
  });
  return { code, expiresAt, command: `/link code:${code}` };
}

// ---- delivery (I4.1, I4.2) ----

const KIND_TEXT: Record<string, string> = { next_eligible: 'passed to the next available teammate', backup: 'passed to the designated backup', manager: 'passed to a manager' };

async function deliver(job: OutboxJob, type: 'alert.escalation' | 'alert.lead_assigned', text: (ctx: { contactName: string; source: string; link: string }) => string) {
  const p = job.payload as { leadId: string; toUserId: string; source?: string; linkPath?: string };
  const ws = job.workspaceId;
  const [m] = await db.select({ discordUserId: memberships.discordUserId }).from(memberships).where(and(eq(memberships.workspaceId, ws), eq(memberships.userId, p.toUserId)));
  const record = (result: 'ok' | 'error', error?: string, ref?: string) => integrationEvents.recordOutbound({ workspaceId: ws, provider: 'discord', type, result, error, ref: ref ?? `${p.leadId}:${p.toUserId}` });

  if (!m?.discordUserId) return void (await record('error', 'not delivered: Discord not linked'));
  const cfg = await discordConfig(ws);
  if (!cfg) return void (await record('error', 'not delivered: Discord is not connected'));

  const [row] = await db.select({ name: contacts.name, source: leads.source }).from(leads).innerJoin(contacts, eq(contacts.id, leads.contactId)).where(and(eq(leads.workspaceId, ws), eq(leads.id, p.leadId)));
  const link = `${env.APP_URL.replace(/\/$/, '')}${p.linkPath ?? `/leads/${p.leadId}`}`;
  const content = text({ contactName: row?.name ?? 'A lead', source: p.source ?? row?.source ?? 'unknown', link });
  try {
    const channel = await dmChannel(cfg.botToken, m.discordUserId);
    const sent = await sendChannelMessage(cfg.botToken, channel, content);
    await record('ok', undefined, sent.id);
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError('Unexpected problem sending the alert', true, 'unexpected');
    await record('error', `${pe.message} (attempt ${job.attempts} of ${job.maxAttempts})`);
    if (pe.temporary && job.attempts < job.maxAttempts) throw pe; // outbox retries with backoff, max 5
  }
}

outbox.registerHandler('notify.escalation', (job) => {
  const p = job.payload as { reason?: string; level?: number; kind?: string };
  return deliver(job, 'alert.escalation', ({ contactName, source, link }) =>
    [`Lead escalated to you: ${contactName}`, `Source: ${source}`, `Why: ${p.reason === 'ack_expired' ? 'the acknowledgement window ran out' : (p.reason ?? 'escalated')}${p.kind ? `, ${KIND_TEXT[p.kind] ?? p.kind}` : ''}${p.level ? ` (level ${p.level})` : ''}`, `Open: ${link}`].join('\n'));
});

outbox.registerHandler('notify.lead_assigned', (job) =>
  deliver(job, 'alert.lead_assigned', ({ contactName, source, link }) => [`New lead assigned to you: ${contactName}`, `Source: ${source}`, `Acknowledge it before the window runs out: ${link}`].join('\n')),
);

// ---- admin visibility (I4.4) ----

export async function listAlerts(ws: string) {
  const [events, jobs] = await Promise.all([
    db.select().from(eventsTable).where(and(eq(eventsTable.workspaceId, ws), eq(eventsTable.provider, 'discord'), like(eventsTable.type, 'alert.%'))).orderBy(desc(eventsTable.createdAt)).limit(100),
    db.select().from(outboxJobs).where(and(eq(outboxJobs.workspaceId, ws), inArray(outboxJobs.kind, ['notify.escalation', 'notify.lead_assigned']), inArray(outboxJobs.status, ['pending', 'running', 'failed']))).orderBy(desc(outboxJobs.createdAt)).limit(100),
  ]);
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]));
  const fromJobs = jobs.map((j) => {
    const p = j.payload as { toUserId?: string; leadId?: string };
    return { id: j.id, source: 'queue', kind: j.kind, status: j.status === 'failed' ? 'failed' : 'retrying', toUserId: p.toUserId ?? null, toUserName: p.toUserId ? names.get(p.toUserId) ?? null : null, leadId: p.leadId ?? null, attempts: j.attempts, maxAttempts: j.maxAttempts, error: j.lastError, at: j.createdAt };
  });
  const fromEvents = events.map((e) => {
    const [leadId, toUserId] = (e.ref ?? '').split(':');
    return { id: e.id, source: 'delivery', kind: e.type, status: e.result === 'ok' ? 'delivered' : 'not_delivered', toUserId: toUserId ?? null, toUserName: toUserId ? names.get(toUserId) ?? null : null, leadId: leadId ?? null, attempts: null, maxAttempts: null, error: e.error, at: e.createdAt };
  });
  return [...fromJobs, ...fromEvents].sort((a, b) => +b.at - +a.at);
}

// ---- routes ----

export const discordRouter = Router();

discordRouter.post('/me/notifications/discord/link-code', requireAuth, asyncHandler(async (req, res) => {
  res.status(201).json(await createLinkCode(req.auth!.workspaceId, req.auth!.userId));
}));

discordRouter.get('/me/notifications/discord', requireAuth, asyncHandler(async (req, res) => {
  const [m] = await db.select({ id: memberships.discordUserId }).from(memberships).where(eq(memberships.id, req.auth!.membershipId));
  res.json({ linked: !!m?.id, discordUserId: m?.id ? `••••${m.id.slice(-4)}` : null });
}));

discordRouter.delete('/me/notifications/discord', requireAuth, asyncHandler(async (req, res) => {
  await db.transaction(async (tx) => {
    await tx.update(memberships).set({ discordUserId: null }).where(eq(memberships.id, req.auth!.membershipId));
    await audit.record(tx, { workspaceId: req.auth!.workspaceId, actorId: req.auth!.userId, action: 'notifications.discord_unlinked', targetType: 'user', targetId: req.auth!.userId });
  });
  res.status(204).end();
}));

discordRouter.get('/integrations/discord/alerts', requirePermission('integrations.manage'), asyncHandler(async (req, res) => {
  res.json({ items: await listAlerts(req.auth!.workspaceId) });
}));
