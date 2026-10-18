// Runs against the database in backend/.env (the Neon dev branch). Each test builds its own throwaway workspace
// and removes it afterwards. Audit rows go to memory here: audit_log is append-only and would pin the workspace.
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import express, { type NextFunction, type Request, type Response } from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { AuthContext } from '../../../core/auth/context.js';
import type { AuditEvent } from '../ports.js';

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn('[leads db tests] skipped: DATABASE_URL is not set in backend/.env');

type Service = ReturnType<typeof import('../service.js').createLeadService>;

describe.skipIf(!hasDb)('lead engine against the dev database', () => {
  // loaded lazily: core env validation throws at import when the database is not configured
  let pool: typeof import('../../../core/db/client.js').pool;
  let pgLeadRepo: typeof import('../repo.js').pgLeadRepo;
  let leadsRouter: typeof import('../routes.js').leadsRouter;
  let errorMiddleware: typeof import('../../../core/errors.js').errorMiddleware;
  let svc: Service;
  const audits: AuditEvent[] = [];

  const created: { workspaces: string[]; users: string[] } = { workspaces: [], users: [] };

  async function workspace(members: { status?: string }[], rules: { levels?: unknown[] } = {}) {
    const tag = randomUUID().slice(0, 8);
    const ws = (await pool.query(`insert into workspaces (name, slug) values ($1, $2) returning id`, [`it ${tag}`, `it-${tag}`])).rows[0].id as string;
    created.workspaces.push(ws);
    const role = (await pool.query(`insert into roles (workspace_id, name, base_level) values ($1, 'User', 'user') returning id`, [ws])).rows[0].id;
    const userIds: string[] = [];
    for (const [i, m] of members.entries()) {
      const u = (await pool.query(`insert into users (email, name, password_hash) values ($1, $2, 'x') returning id`, [`it-${tag}-${i}@example.test`, `Member ${i}`])).rows[0].id as string;
      created.users.push(u);
      await pool.query(`insert into memberships (workspace_id, user_id, role_id, availability) values ($1, $2, $3, $4)`, [ws, u, role, m.status ?? 'available']);
      userIds.push(u);
    }
    await pool.query(
      `insert into assignment_rules (workspace_id, ack_window_seconds, max_open_leads, idle_seconds, escalation_levels) values ($1, 30, 5, 600, $2)`,
      [ws, JSON.stringify(rules.levels ?? [{ kind: 'next_eligible', seconds: 30 }])],
    );
    userIds.sort();
    return { ws, slug: `it-${tag}`, userIds };
  }

  async function newLead(ws: string) {
    const contact = (await pool.query(`insert into contacts (workspace_id, name) values ($1, 'IT contact') returning id`, [ws])).rows[0].id;
    return pgLeadRepo.withTx((tx) => svc.createLead(tx, { workspaceId: ws, contactId: contact, source: 'manual' }));
  }

  const row = async (id: string) => (await pool.query(`select * from leads where id = $1`, [id])).rows[0];
  const inSeconds = (s: number) => new Date(Date.now() + s * 1000);

  beforeAll(async () => {
    ({ pool } = await import('../../../core/db/client.js'));
    ({ pgLeadRepo } = await import('../repo.js'));
    ({ leadsRouter } = await import('../routes.js'));
    ({ errorMiddleware } = await import('../../../core/errors.js'));
    const { ports } = await import('../ports.js');
    const { createLeadService } = await import('../service.js');
    svc = createLeadService({
      repo: pgLeadRepo,
      ports: { ...ports, audit: { record: async (_tx, e) => void audits.push(e) } },
      log: () => {},
    });
    const t = await pool.query(`select to_regclass('public.leads') as t`);
    if (!t.rows[0].t) throw new Error('leads table missing on this database: run npm run migrate first');
  });

  afterEach(async () => {
    for (const ws of created.workspaces.splice(0)) {
      await pool.query(`delete from leads where workspace_id = $1`, [ws]);
      for (const table of ['activities', 'contacts', 'outbox_jobs', 'assignment_rules', 'memberships', 'roles']) {
        await pool.query(`delete from ${table} where workspace_id = $1`, [ws]);
      }
      await pool.query(`delete from workspaces where id = $1`, [ws]);
    }
    if (created.users.length) await pool.query(`delete from users where id = any($1::uuid[])`, [created.users.splice(0)]);
  });

  afterAll(() => pool.end());

  it('assigns with a 30-second window', async () => {
    const { ws, userIds } = await workspace([{}, {}]);
    const before = Date.now();
    const l = await newLead(ws);
    const r = await row(l.id);
    expect(r.status).toBe('assigned');
    expect(r.owner_id).toBe(userIds[0]);
    const window = (new Date(r.ack_deadline).getTime() - before) / 1000;
    expect(window).toBeGreaterThanOrEqual(29);
    expect(window).toBeLessThanOrEqual(31);
  });

  it('two concurrent sweeps escalate the lead exactly once', async () => {
    const { ws } = await workspace([{}, {}, {}]);
    const l = await newLead(ws);
    const at = inSeconds(31);
    const results = await Promise.all([svc.sweep(at, { workspaceId: ws }), svc.sweep(at, { workspaceId: ws }), svc.sweep(at, { workspaceId: ws })]);
    expect(results.reduce((n, r) => n + r.escalated, 0)).toBe(1);
    const r = await row(l.id);
    expect(r.escalation_count).toBe(1);
    expect(r.version).toBe(l.version + 1);
    const open = await pool.query(`select count(*)::int as n from lead_assignments where lead_id = $1 and ended_at is null`, [l.id]);
    expect(open.rows[0].n).toBe(1);
    const jobs = await pool.query(`select payload from outbox_jobs where workspace_id = $1 and kind = 'notify.escalation'`, [ws]);
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0].payload).toMatchObject({ leadId: l.id, reason: 'ack_expired', linkPath: `/leads/${l.id}` });
  });

  it('the same lead expiring twice takes one step', async () => {
    const { ws } = await workspace([{}, {}, {}]);
    const l = await newLead(ws);
    const at = inSeconds(31);
    expect(await svc.sweep(at, { workspaceId: ws })).toEqual({ escalated: 1, recovered: 0 });
    expect(await svc.sweep(at, { workspaceId: ws })).toEqual({ escalated: 0, recovered: 0 });
    expect((await row(l.id)).escalation_count).toBe(1);
  });

  it('with nobody eligible the lead is stuck in the recovery queue', async () => {
    const { ws } = await workspace([{ status: 'busy' }, { status: 'offline' }]);
    const l = await newLead(ws);
    expect((await row(l.id)).status).toBe('unassigned');
    const q = await svc.recoveryQueue(ws, { userId: randomUUID(), canSeeAll: true });
    expect(q.items.map((i) => [i.lead.id, i.reasons[0].code])).toEqual([[l.id, 'unacked_overdue']]);
  });

  it('going on leave reassigns only unacknowledged leads', async () => {
    const { ws, userIds } = await workspace([{}, {}]);
    const [a] = userIds;
    const pending = await newLead(ws); // a
    await newLead(ws); // b
    const acked = await newLead(ws); // a
    await svc.acknowledge({ workspaceId: ws, userId: a, permissions: new Set() }, acked.id);
    const out = await pgLeadRepo.withTx(async (tx) => {
      await tx.execute(sql`update memberships set availability = 'on_leave' where workspace_id = ${ws} and user_id = ${a}`);
      return svc.onAvailabilityChange(tx, { workspaceId: ws, userId: a, status: 'on_leave' });
    });
    expect(out).toEqual({ reassigned: 1, flaggedAway: 1 });
    expect((await row(pending.id)).owner_id).not.toBe(a);
    expect(await row(acked.id)).toMatchObject({ owner_id: a, status: 'acknowledged', owner_away: true });
  });

  it('a stale version is rejected with 409', async () => {
    const { ws, userIds } = await workspace([{}, {}]);
    const l = await newLead(ws);
    const mgr = { workspaceId: ws, userId: userIds[1], permissions: new Set(['leads.reassign'] as const) };
    await expect(svc.reassign(mgr, { leadId: l.id, toUserId: userIds[1], version: l.version + 1 })).rejects.toMatchObject({ status: 409 });
    const ok = await svc.reassign(mgr, { leadId: l.id, toUserId: userIds[1], version: l.version });
    expect(ok.ownerId).toBe(userIds[1]);
  });

  describe('over HTTP', () => {
    async function serve() {
      const app = express();
      app.use(express.json());
      app.use((req: Request, _res: Response, next: NextFunction) => {
        const h = req.header('x-test-user');
        if (h) {
          const [workspaceId, userId, perms] = h.split('|');
          req.auth = { workspaceId, userId, permissions: new Set(perms.split(',')) } as AuthContext;
        }
        next();
      });
      app.use('/api', leadsRouter(svc));
      app.use(errorMiddleware);
      const server = app.listen(0);
      await new Promise((r) => server.once('listening', r));
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      const call = async (method: string, path: string, user?: string, body?: unknown) => {
        const res = await fetch(base + path, {
          method,
          headers: { 'content-type': 'application/json', ...(user && { 'x-test-user': user }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
      };
      return { call, close: () => new Promise<void>((r) => server.close(() => r())) };
    }

    it('cross-workspace id is 404, missing leads.reassign is 403', async () => {
      const one = await workspace([{}, {}]);
      const two = await workspace([{}]);
      const l = await newLead(one.ws);
      const { call, close } = await serve();
      try {
        expect((await call('GET', `/leads/${l.id}`, `${two.ws}|${two.userIds[0]}|crm.view,leads.reassign`)).status).toBe(404);
        const r = await call('POST', `/leads/${l.id}/reassign`, `${one.ws}|${one.userIds[0]}|crm.view`, { toUserId: one.userIds[1], version: l.version });
        expect(r.status).toBe(403);
        const stale = await call('POST', `/leads/${l.id}/reassign`, `${one.ws}|${one.userIds[0]}|leads.reassign`, { toUserId: one.userIds[1], version: 99 });
        expect(stale.status).toBe(409);
      } finally {
        await close();
      }
    });

    it('web form creates a contact and a webform lead', async () => {
      const { ws, slug } = await workspace([{}]);
      const { call, close } = await serve();
      try {
        const r = await call('POST', `/public/leads/${slug}`, undefined, { name: 'Form Visitor', phone: '+92 300 7654321', message: 'Hello' });
        expect(r).toEqual({ status: 201, body: { ok: true } });
      } finally {
        await close();
      }
      const c = await pool.query(`select id, phone from contacts where workspace_id = $1`, [ws]);
      expect(c.rows).toEqual([{ id: expect.any(String), phone: '+923007654321' }]);
      const leads = await pool.query(`select source, status, contact_id from leads where workspace_id = $1`, [ws]);
      expect(leads.rows).toEqual([{ source: 'webform', status: 'assigned', contact_id: c.rows[0].id }]);
    });
  });
});
