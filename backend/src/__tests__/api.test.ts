import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { db } from '../core/db/client.js';
import { customFields, stageRequiredFields } from '../core/db/schema/index.js';
import { decrypt, encrypt, maskSecret } from '../core/crypto/index.js';
import { integrationEvents } from '../core/integration-events/index.js';
import { maskValues } from '../core/rbac/index.js';
import { addMemberAs, app, defaultPipeline, del, newAgent, origin, PASSWORD, patch, post, put, signupOwner, uniq } from './helpers.js';

async function contact(a: Parameters<typeof post>[0], name = 'Test Contact') {
  const r = await post(a, '/api/contacts', { name, phone: `+9230${Math.floor(10000000 + Math.random() * 89999999)}` });
  expect(r.status).toBe(201);
  return r.body.contact as { id: string; version: number };
}

describe('workspace isolation (F1.6, Q2)', () => {
  it('returns 404 for another workspace id on read, update and delete', async () => {
    const a = await signupOwner();
    const b = await signupOwner();
    const c = await contact(a.agent);
    expect((await b.agent.get(`/api/contacts/${c.id}`)).status).toBe(404);
    expect((await patch(b.agent, `/api/contacts/${c.id}`, { version: 1, name: 'x' })).status).toBe(404);
    expect((await del(b.agent, `/api/contacts/${c.id}`)).status).toBe(404);
    const list = await b.agent.get('/api/contacts');
    expect(list.body.items).toHaveLength(0);
    expect((await a.agent.get(`/api/contacts/${c.id}`)).status).toBe(200);
  });
});

describe('server-side permissions (F1.5)', () => {
  it('rejects a direct API call without the permission', async () => {
    const owner = await signupOwner();
    const user = await addMemberAs(owner, 'User');
    const c = await contact(owner.agent);
    const r = await del(user.agent, `/api/contacts/${c.id}`);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('forbidden');
    expect((await user.agent.get('/api/roles')).status).toBe(403);
    expect((await request(app).get('/api/contacts')).status).toBe(401);
  });

  it('rejects state-changing requests from a foreign origin', async () => {
    const owner = await signupOwner();
    const r = await owner.agent.post('/api/contacts').set('Origin', 'https://evil.example').send({ name: 'x' });
    expect(r.status).toBe(403);
  });
});

describe('field-level protection (F1.4)', () => {
  it('masks opportunity values for a User in list, detail and export', async () => {
    const owner = await signupOwner();
    const user = await addMemberAs(owner, 'User');
    const { pipelineId } = await defaultPipeline(owner.agent);
    const c = await contact(owner.agent);
    const o = await post(owner.agent, '/api/opportunities', { pipelineId, contactId: c.id, name: 'Big deal', valueCents: 12345600 });
    expect(o.status).toBe(201);
    expect(o.body.opportunity.valueCents).toBe(12345600);

    const list = await user.agent.get('/api/opportunities');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('valueCents');
    const detail = await user.agent.get(`/api/opportunities/${o.body.opportunity.id}`);
    expect(JSON.stringify(detail.body)).not.toContain('valueCents');
    const viaContact = await user.agent.get(`/api/contacts/${c.id}`);
    expect(JSON.stringify(viaContact.body)).not.toContain('valueCents');

    const ownerList = await owner.agent.get('/api/opportunities');
    expect(ownerList.body.items[0].valueCents).toBe(12345600);
    expect(maskValues({ a: [{ valueCents: 1, n: 2 }] }, false)).toEqual({ a: [{ n: 2 }] });
  });
});

describe('role hierarchy (F1.2)', () => {
  it('lets an Admin not modify the Owner', async () => {
    const owner = await signupOwner();
    const admin = await addMemberAs(owner, 'Admin');
    const roles = (await owner.agent.get('/api/roles')).body.items as Array<{ id: string; name: string }>;
    const userRole = roles.find((r) => r.name === 'User')!;
    const r = await patch(admin.agent, `/api/users/${owner.userId}`, { roleId: userRole.id });
    expect(r.status).toBe(403);
    const d = await patch(admin.agent, `/api/users/${owner.userId}`, { active: false });
    expect(d.status).toBe(403);
    expect((await owner.agent.get('/api/me')).body.role.name).toBe('Owner');
  });

  it('audits custom role changes', async () => {
    const owner = await signupOwner();
    const r = await post(owner.agent, '/api/roles', { name: 'Sales Manager', baseLevel: 'user', permissions: ['crm.view', 'crm.view_values'] });
    expect(r.status).toBe(201);
    const up = await patch(owner.agent, `/api/roles/${r.body.role.id}`, { permissions: ['crm.view'] });
    expect(up.status).toBe(200);
    const rows = await db.execute(sql`select action, before, after from audit_log where workspace_id = ${owner.workspaceId} and action like 'role.%' order by created_at`);
    expect(rows.rows.map((x) => x.action)).toEqual(['role.created', 'role.permissions_changed']);
  });
});

describe('login protection (Q1)', () => {
  it('locks out after repeated failures even with the right password', async () => {
    const owner = await signupOwner();
    const a = newAgent();
    for (let i = 0; i < 5; i++) {
      const r = await post(a, '/api/auth/login', { email: owner.email, password: 'wrong-password' });
      expect(r.status).toBe(401);
    }
    const locked = await post(a, '/api/auth/login', { email: owner.email, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('too_many_requests');
  });

  it('logs in, keeps the session and logs out all sessions', async () => {
    const owner = await signupOwner();
    const a = newAgent();
    expect((await post(a, '/api/auth/login', { email: owner.email, password: PASSWORD })).status).toBe(200);
    expect((await a.get('/api/me')).status).toBe(200);
    expect((await post(a, '/api/auth/logout-all')).status).toBe(204);
    expect((await a.get('/api/me')).status).toBe(401);
    expect((await owner.agent.get('/api/me')).status).toBe(401);
  });
});

describe('concurrent edits (Q4)', () => {
  it('returns 409 when a stale version is submitted', async () => {
    const owner = await signupOwner();
    const c = await contact(owner.agent);
    const first = await patch(owner.agent, `/api/contacts/${c.id}`, { version: c.version, name: 'First edit' });
    expect(first.status).toBe(200);
    expect(first.body.contact.version).toBe(c.version + 1);
    const stale = await patch(owner.agent, `/api/contacts/${c.id}`, { version: c.version, name: 'Second edit' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('version_conflict');
  });
});

describe('stage required fields (F2.4)', () => {
  it('blocks a move until required fields are filled', async () => {
    const owner = await signupOwner();
    const { pipelineId, stages } = await defaultPipeline(owner.agent);
    const target = stages.find((s) => s.name === 'Proposal')!;
    const [field] = await db.insert(customFields).values({ workspaceId: owner.workspaceId, entity: 'opportunity', pipelineId, name: 'Site address', type: 'text' }).returning();
    await db.insert(stageRequiredFields).values({ workspaceId: owner.workspaceId, stageId: target.id, fieldId: field!.id });

    const c = await contact(owner.agent);
    const o = await post(owner.agent, '/api/opportunities', { pipelineId, contactId: c.id, name: 'Needs address' });
    const blocked = await post(owner.agent, `/api/opportunities/${o.body.opportunity.id}/move`, { stageId: target.id, version: o.body.opportunity.version });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('required_fields_missing');
    expect(blocked.body.error.message).toContain('Site address');

    const ok = await post(owner.agent, `/api/opportunities/${o.body.opportunity.id}/move`, { stageId: target.id, version: o.body.opportunity.version, custom: { [field!.id]: 'Street 5, F-7' } });
    expect(ok.status).toBe(200);
    expect(ok.body.opportunity.stageId).toBe(target.id);
  });

  it('requires a destination when deleting a stage that holds opportunities', async () => {
    const owner = await signupOwner();
    const { pipelineId, stages } = await defaultPipeline(owner.agent);
    const c = await contact(owner.agent);
    const o = await post(owner.agent, '/api/opportunities', { pipelineId, contactId: c.id, name: 'x', stageId: stages[0]!.id });
    expect(o.status).toBe(201);
    const refused = await del(owner.agent, `/api/stages/${stages[0]!.id}`);
    expect(refused.status).toBe(409);
    const moved = await del(owner.agent, `/api/stages/${stages[0]!.id}?moveTo=${stages[1]!.id}`);
    expect(moved.status).toBe(204);
    const after = await owner.agent.get(`/api/opportunities/${o.body.opportunity.id}`);
    expect(after.body.opportunity.stageId).toBe(stages[1]!.id);
  });
});

describe('audit log is append-only (F4.3)', () => {
  it('rejects UPDATE and DELETE at the database', async () => {
    const owner = await signupOwner();
    await contact(owner.agent);
    const failure = async (q: ReturnType<typeof sql>) => {
      try {
        await db.execute(q);
      } catch (e) {
        const err = e as Error & { cause?: Error };
        return `${err.message} ${err.cause?.message ?? ''}`;
      }
      return '';
    };
    expect(await failure(sql`update audit_log set action = 'tampered' where workspace_id = ${owner.workspaceId}`)).toMatch(/append-only/);
    expect(await failure(sql`delete from audit_log where workspace_id = ${owner.workspaceId}`)).toMatch(/append-only/);
    const n = await db.execute(sql`select count(*)::int as n from audit_log where workspace_id = ${owner.workspaceId} and action = 'contact.created'`);
    expect(n.rows[0]!.n).toBe(1);
  });
});

describe('availability and deactivation', () => {
  it('lets a User set their own status but not others', async () => {
    const owner = await signupOwner();
    const user = await addMemberAs(owner, 'User');
    expect((await put(user.agent, '/api/me/availability', { status: 'on_leave' })).status).toBe(200);
    expect((await put(user.agent, `/api/users/${owner.userId}/availability`, { status: 'offline' })).status).toBe(403);
    expect((await put(owner.agent, `/api/users/${user.userId}/availability`, { status: 'available' })).status).toBe(200);
  });

  it('deactivating a member ends their sessions', async () => {
    const owner = await signupOwner();
    const user = await addMemberAs(owner, 'User');
    expect((await user.agent.get('/api/me')).status).toBe(200);
    expect((await patch(owner.agent, `/api/users/${user.userId}`, { active: false })).status).toBe(200);
    expect((await user.agent.get('/api/me')).status).toBe(401);
  });
});

describe('core helpers', () => {
  it('round-trips AES-GCM and masks secrets (I5.3)', () => {
    const s = 'sk_test_1234567890abcd';
    const enc = encrypt(s);
    expect(enc).not.toContain(s);
    expect(decrypt(enc)).toBe(s);
    expect(() => decrypt(enc.slice(0, -2) + 'AA')).toThrow();
    expect(maskSecret(s)).toBe('••••abcd');
  });

  it('records an inbound integration event once per external id (I1.8, I2.4)', async () => {
    const owner = await signupOwner();
    const ev = { workspaceId: owner.workspaceId, provider: 'stripe' as const, type: 'checkout.session.completed', externalId: `evt_${uniq()}`, result: 'ok' as const };
    expect((await integrationEvents.recordInbound(ev)).duplicate).toBe(false);
    expect((await integrationEvents.recordInbound(ev)).duplicate).toBe(true);
  });

  it('serves health and a request id', async () => {
    const r = await request(app).get('/health');
    expect(r.body).toEqual({ ok: true, db: true });
    expect((await request(app).get('/api/nope').set('Origin', origin)).headers['x-request-id']).toBeTruthy();
  });
});
