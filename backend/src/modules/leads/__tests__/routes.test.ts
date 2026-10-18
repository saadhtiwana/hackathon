import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorMiddleware } from '../../../core/errors.js';
import type { AuthContext } from '../../../core/auth/context.js';
import { leadsRouter } from '../routes.js';
import { createLeadService } from '../service.js';
import { setup, T0 } from './fakes.js';

const W = 'W';
const OTHER = 'W2';
const env = setup({ t: T0 });
for (const id of ['a', 'b', 'mg']) env.addMember(W, id);
env.addMember(OTHER, 'x');
env.state.workspaces.push({ id: W, name: 'Acme', slug: 'acme' });
const svc = createLeadService({ repo: env.repo, ports: env.ports, now: () => env.now.t, log: () => {} });

// stands in for core session middleware: x-test-user = "workspace:user:perm1,perm2"
function testAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.header('x-test-user');
  if (h) {
    const [workspaceId, userId, perms] = h.split(':');
    req.auth = { workspaceId, userId, permissions: new Set(perms ? perms.split(',') : []) } as AuthContext;
  }
  next();
}

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(testAuth);
  app.use('/api', leadsRouter(svc, { rateLimit: { max: 3, windowMs: 60_000 }, now: () => env.now.t }));
  app.use(errorMiddleware);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const call = async (method: string, path: string, user?: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(user && { 'x-test-user': user }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const ALL = 'crm.view,crm.create,crm.edit,leads.reassign,leads.manage_rules';
const MGR = `${W}:mg:${ALL}`;

async function makeLead() {
  const contactId = env.addContact(W);
  return svc.createLead(env.tx, { workspaceId: W, contactId, source: 'manual' });
}

describe('leads routes', () => {
  it('requires a session', async () => {
    const r = await call('GET', '/leads');
    expect(r).toEqual({ status: 401, body: { error: { code: 'unauthorized', message: 'Sign in to continue' } } });
  });

  it('creates a manual lead and returns it with the countdown', async () => {
    const r = await call('POST', '/leads', MGR, { name: 'Ali', phone: '+92 321 0000000', message: 'walk-in' });
    expect(r.status).toBe(201);
    expect(r.body.lead).toMatchObject({ source: 'manual', status: 'assigned', ackRemainingSeconds: 30 });
    expect(r.body.lead.ownerHistory).toBeUndefined();
  });

  it('validates input with field errors', async () => {
    const r = await call('POST', '/leads', MGR, { name: 'Ali', email: 'not-an-email' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('validation_failed');
    expect(Object.keys(r.body.error.fields)).toEqual(['email']);
  });

  it('returns detail with the custody chain and skipped reasons', async () => {
    const l = await makeLead();
    const r = await call('GET', `/leads/${l.id}`, MGR);
    expect(r.status).toBe(200);
    expect(r.body.ackRemainingSeconds).toBe(30);
    expect(r.body.assignments).toHaveLength(1);
    expect(r.body.assignments[0]).toMatchObject({ userId: l.ownerId, reason: 'initial', skipped: [] });
  });

  it('a lead id from another workspace is 404', async () => {
    const l = await makeLead();
    const r = await call('GET', `/leads/${l.id}`, `${OTHER}:x:${ALL}`);
    expect(r.status).toBe(404);
    expect((await call('POST', `/leads/${l.id}/reassign`, `${OTHER}:x:${ALL}`, { toUserId: crypto.randomUUID(), version: 1 })).status).toBe(404);
    expect((await call('GET', '/leads/not-a-uuid', MGR)).status).toBe(404);
  });

  it('reassign without leads.reassign is 403', async () => {
    const l = await makeLead();
    const r = await call('POST', `/leads/${l.id}/reassign`, `${W}:a:crm.view,crm.edit`, { toUserId: crypto.randomUUID(), version: l.version });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('forbidden');
  });

  it('reassign with a stale version is 409', async () => {
    const l = await makeLead();
    const target = l.ownerId === 'a' ? 'b' : 'a';
    // fake user ids are not uuids, so the happy path goes through the service directly
    const r = await call('POST', `/leads/${l.id}/reassign`, MGR, { toUserId: crypto.randomUUID(), version: l.version + 5 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'version_conflict', hint: 'Reload the lead and try again' });
    const ok = await svc.reassign({ workspaceId: W, userId: 'mg', permissions: new Set(['leads.reassign']) }, { leadId: l.id, toUserId: target, version: l.version });
    expect(ok.ownerId).toBe(target);
  });

  it('acknowledge by a non-owner is 403 and by the owner is 200', async () => {
    const l = await makeLead();
    const other = l.ownerId === 'a' ? 'b' : 'a';
    expect((await call('POST', `/leads/${l.id}/acknowledge`, `${W}:${other}:crm.view`)).status).toBe(403);
    const r = await call('POST', `/leads/${l.id}/acknowledge`, `${W}:${l.ownerId}:crm.view`);
    expect(r.status).toBe(200);
    expect(r.body.lead).toMatchObject({ status: 'acknowledged', ackRemainingSeconds: null });
  });

  it('closes a lead', async () => {
    const l = await makeLead();
    const r = await call('POST', `/leads/${l.id}/close`, MGR, { outcome: 'won' });
    expect(r.body.lead.status).toBe('closed');
  });

  it('recovery queue needs leads.reassign', async () => {
    expect((await call('GET', '/leads/recovery', `${W}:a:crm.view`)).status).toBe(403);
    const r = await call('GET', '/leads/recovery', MGR);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.items)).toBe(true);
  });

  it('paginates the list', async () => {
    const first = await call('GET', '/leads?limit=2', MGR);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect((await call('GET', '/leads?cursor=garbage', MGR)).body.error.code).toBe('invalid_cursor');
  });

  it('assignment rules round-trip and need leads.manage_rules', async () => {
    expect((await call('GET', '/assignment-rules', `${W}:a:crm.view`)).status).toBe(403);
    const got = await call('GET', '/assignment-rules', MGR);
    expect(got.body).toMatchObject({ strategy: 'round_robin', acknowledgedOnLeavePolicy: 'keep_flag_recover' });
    const put = await call('PUT', '/assignment-rules', MGR, { ...got.body, ackWindowSeconds: 30, escalationLevels: [{ kind: 'next_eligible', seconds: 30 }] });
    expect(put.status).toBe(200);
    expect(put.body.escalationLevels).toEqual([{ kind: 'next_eligible', seconds: 30 }]);
    expect((await call('PUT', '/assignment-rules', MGR, { ...got.body, ackWindowSeconds: 1 })).status).toBe(400);
  });
});

describe('public web form', () => {
  it('describes the form for a known workspace only', async () => {
    const r = await call('GET', '/public/forms/acme');
    expect(r.body.workspaceName).toBe('Acme');
    expect((await call('GET', '/public/forms/nope')).status).toBe(404);
  });

  it('creates a webform lead, ignores honeypot hits and unknown slugs with the same response, then rate limits', async () => {
    const before = env.state.leads.size;
    const ok = await call('POST', '/public/leads/acme', undefined, { name: 'Web Visitor', email: 'visitor@example.com' });
    expect(ok).toEqual({ status: 201, body: { ok: true } });
    expect(env.state.leads.size).toBe(before + 1);
    expect([...env.state.leads.values()].at(-1)!.source).toBe('webform');

    const bot = await call('POST', '/public/leads/acme', undefined, { name: 'Bot', email: 'b@example.com', website: 'http://spam' });
    expect(bot).toEqual(ok);
    const unknown = await call('POST', '/public/leads/ghost-co', undefined, { name: 'X', email: 'x@example.com' });
    expect(unknown).toEqual(ok);
    expect(env.state.leads.size).toBe(before + 1);

    await call('POST', '/public/leads/acme', undefined, { name: 'Again', email: 'v2@example.com' });
    const limited = await call('POST', '/public/leads/acme', undefined, { name: 'Again', email: 'v3@example.com' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('too_many_requests');
  });
});
