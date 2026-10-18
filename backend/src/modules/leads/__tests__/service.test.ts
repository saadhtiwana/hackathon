import { describe, expect, it } from 'vitest';
import { timeToFirstResponse } from '../domain/index.js';
import type { Permission } from '../../../core/rbac/permissions.js';
import { createLeadService, type Viewer } from '../service.js';
import { at, defaultRules, setup, T0 } from './fakes.js';

const W = 'W';
const viewer = (userId: string, perms: Permission[] = []): Viewer => ({ workspaceId: W, userId, permissions: new Set(perms) });
const manager = viewer('mg', ['leads.reassign', 'leads.manage_rules']);

function world(members: [string, ('available' | 'busy' | 'on_leave' | 'offline')?][] = [['a'], ['b'], ['bk'], ['mg']]) {
  const env = setup({ t: T0 });
  for (const [id, st] of members) env.addMember(W, id, st);
  const svc = createLeadService({ repo: env.repo, ports: env.ports, now: () => env.now.t, log: () => {} });
  const newLead = async () => {
    const contactId = env.addContact(W);
    return svc.createLead(env.tx, { workspaceId: W, contactId, source: 'webform' });
  };
  return { ...env, svc, newLead };
}

describe('createLead', () => {
  it('assigns round-robin with a 30s deadline and records who was skipped', async () => {
    const w = world([['a'], ['b', 'busy'], ['c', 'on_leave'], ['d']]);
    const l1 = await w.newLead();
    const l2 = await w.newLead();
    const l3 = await w.newLead();
    expect([l1.ownerId, l2.ownerId, l3.ownerId]).toEqual(['a', 'd', 'a']);
    expect(l1).toMatchObject({ state: 'assigned', ackDeadline: at(30), firstAssignedAt: T0, version: 2 });
    const assign = w.acts.find((a) => a.type === 'assignment' && a.entity.leadId === l1.id)!;
    expect(assign.data.skipped).toEqual([
      { userId: 'b', reason: 'busy' },
      { userId: 'c', reason: 'on_leave' },
    ]);
    expect(w.audits.filter((a) => a.targetId === l1.id).map((a) => a.action)).toEqual(['lead.created', 'lead.assigned']);
    expect(w.events.filter((e) => e.ids.leadId === l1.id).map((e) => e.type)).toEqual(['lead.created', 'lead.assigned']);
  });

  it('respects the open-lead cap', async () => {
    const w = world([['a'], ['b']]);
    w.setRules(W, defaultRules({ maxOpenLeads: 1, escalationLevels: [] }));
    await w.newLead();
    await w.newLead();
    const third = await w.newLead();
    expect(third.ownerId).toBeNull();
    const skip = w.acts.find((a) => a.entity.leadId === third.id && a.type === 'assignment')!;
    expect(skip.data.skipped).toEqual([
      { userId: 'a', reason: 'at_capacity' },
      { userId: 'b', reason: 'at_capacity' },
    ]);
  });

  it('with nobody eligible the lead goes to the manager and shows in the recovery queue', async () => {
    const w = world([['a', 'offline'], ['b', 'busy']]);
    const l = await w.newLead();
    expect(l).toMatchObject({ state: 'assigned', ownerId: 'mg' });
    const q = await w.svc.recoveryQueue(W, { userId: 'mg', canSeeAll: true });
    expect(q.items.map((i) => [i.lead.id, i.reasons[0].code])).toEqual([[l.id, 'escalated_multiple']]);
    expect(w.audits.map((a) => a.action)).toContain('lead.escalated');
    expect(w.jobs.map((j) => j.kind)).toContain('notify.escalation');
  });
});

describe('acknowledge and activity', () => {
  it('only the owner can acknowledge; time to first response is measured from first assignment', async () => {
    const w = world();
    const l = await w.newLead();
    await expect(w.svc.acknowledge(viewer('b'), l.id)).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    w.now.t = at(12);
    const acked = await w.svc.acknowledge(viewer('a'), l.id);
    expect(acked).toMatchObject({ state: 'acknowledged', firstAcknowledgedAt: at(12) });
    expect(timeToFirstResponse(acked)).toBe(12);
    // repeated clicks are harmless
    expect((await w.svc.acknowledge(viewer('a'), l.id)).version).toBe(acked.version);
  });

  it('a note by the owner counts as acknowledgement; field edits and customer messages do not', async () => {
    const w = world();
    const l = await w.newLead();
    w.now.t = at(5);
    await w.svc.onActivity(w.tx, { workspaceId: W, leadId: l.id, actorId: 'a', type: 'field_edit' });
    expect(w.state.leads.get(l.id)!.state).toBe('assigned');
    await w.svc.onActivity(w.tx, { workspaceId: W, leadId: l.id, actorId: null, type: 'message' });
    expect(w.state.leads.get(l.id)!.lastActionAt).toEqual(T0);
    await w.svc.onActivity(w.tx, { workspaceId: W, leadId: l.id, actorId: 'b', type: 'note' });
    expect(w.state.leads.get(l.id)).toMatchObject({ state: 'assigned', lastActionAt: at(5) });
    await w.svc.onActivity(w.tx, { workspaceId: W, leadId: l.id, actorId: 'a', type: 'call_log' });
    expect(w.state.leads.get(l.id)).toMatchObject({ state: 'acknowledged', firstAcknowledgedAt: at(5) });
  });
});

describe('sweep', () => {
  it('escalates through the chain with per-level windows, then stays with the manager', async () => {
    const w = world();
    const l = await w.newLead();
    expect(l.ownerId).toBe('a');

    expect(await w.svc.sweep(at(29))).toEqual({ escalated: 0, recovered: 0 });
    expect(await w.svc.sweep(at(30))).toEqual({ escalated: 1, recovered: 0 });
    expect(w.state.leads.get(l.id)).toMatchObject({ ownerId: 'b', escalationLevel: 1, ackDeadline: at(60), escalationCount: 1 });

    await w.svc.sweep(at(60));
    expect(w.state.leads.get(l.id)).toMatchObject({ ownerId: 'bk', escalationLevel: 2, ackDeadline: at(90) });
    await w.svc.sweep(at(90));
    expect(w.state.leads.get(l.id)).toMatchObject({ ownerId: 'mg', escalationLevel: 3, escalationCount: 3 });
    // chain exhausted: the lead stays with the manager, with no new assignment, timer or count
    expect(await w.svc.sweep(at(120))).toEqual({ escalated: 0, recovered: 1 });
    expect(w.state.leads.get(l.id)).toMatchObject({ state: 'assigned', ownerId: 'mg', ackDeadline: null, escalationCount: 3 });
    expect(await w.svc.sweep(at(180))).toEqual({ escalated: 0, recovered: 0 });
    expect(w.state.leads.get(l.id)).toMatchObject({ ownerId: 'mg', escalationCount: 3 });

    const custody = w.state.assignments.filter((a) => a.leadId === l.id).map((a) => [a.userId, a.reason, a.endReason]);
    expect(custody.slice(0, 4)).toEqual([
      ['a', 'initial', 'escalated'],
      ['b', 'ack_expired', 'escalated'],
      ['bk', 'ack_expired', 'escalated'],
      ['mg', 'ack_expired', null], // still with the manager, assignment stays open
    ]);
    const q = await w.svc.recoveryQueue(W, { userId: 'mg', canSeeAll: true });
    expect(q.items[0].reasons.map((r) => r.code)).toEqual(['escalated_multiple']);
  });

  it('enqueues the external escalation notice with the lead details', async () => {
    const w = world();
    const l = await w.newLead();
    await w.svc.sweep(at(30));
    expect(w.jobs.filter((j) => j.kind === 'notify.escalation')).toEqual([
      {
        workspaceId: W,
        kind: 'notify.escalation',
        payload: { leadId: l.id, toUserId: 'b', fromUserId: 'a', source: 'webform', reason: 'ack_expired', level: 1, kind: 'next_eligible', linkPath: `/leads/${l.id}` },
      },
    ]);
  });

  it('the same lead expiring twice produces one step', async () => {
    const w = world();
    const l = await w.newLead();
    await Promise.all([w.svc.sweep(at(30)), w.svc.sweep(at(30))]);
    await w.svc.sweep(at(30));
    expect(w.state.leads.get(l.id)).toMatchObject({ ownerId: 'b', escalationCount: 1 });
    expect(w.audits.filter((a) => a.action === 'lead.escalated')).toHaveLength(1);
  });

  it('notes a late escalation after downtime', async () => {
    const w = world();
    await w.newLead();
    await w.svc.sweep(at(30 + 600));
    const e = w.audits.find((a) => a.action === 'lead.escalated')!;
    expect(e.after).toMatchObject({ note: 'escalated late after server restart', lateBySeconds: 600 });
  });

  it('acknowledged leads never escalate', async () => {
    const w = world();
    const l = await w.newLead();
    await w.svc.acknowledge(viewer('a'), l.id);
    expect(await w.svc.sweep(at(300))).toEqual({ escalated: 0, recovered: 0 });
  });

  it('a failing lead does not block the rest and is rolled back', async () => {
    const w = world();
    const l1 = await w.newLead();
    const l2 = await w.newLead();
    const enqueue = w.ports.outbox.enqueue;
    w.ports.outbox.enqueue = async (tx, job) => {
      if (job.payload.leadId === l1.id) throw new Error('boom');
      return enqueue(tx, job);
    };
    const before = w.events.length;
    expect(await w.svc.sweep(at(30))).toEqual({ escalated: 1, recovered: 0 });
    expect(w.state.leads.get(l1.id)).toMatchObject({ ownerId: 'a', version: 2 });
    expect(w.state.leads.get(l2.id)!.escalationCount).toBe(1);
    expect(w.events.slice(before).map((e) => e.ids.leadId)).toEqual([l2.id]);
  });

  it('reports the next due deadline for the scheduler', async () => {
    const w = world();
    expect(await w.svc.nextDueAt()).toBeNull();
    await w.newLead();
    expect(await w.svc.nextDueAt()).toEqual(at(30));
  });
});

describe('reassign', () => {
  it('rejects a stale version and unavailable targets', async () => {
    const w = world([['a'], ['b'], ['c', 'on_leave'], ['mg']]);
    const l = await w.newLead();
    await expect(w.svc.reassign(manager, { leadId: l.id, toUserId: 'b', version: l.version - 1 })).rejects.toMatchObject({ status: 409, code: 'version_conflict' });
    await expect(w.svc.reassign(manager, { leadId: l.id, toUserId: 'c', version: l.version })).rejects.toMatchObject({ status: 422, code: 'assignee_unavailable' });
    await expect(w.svc.reassign(manager, { leadId: l.id, toUserId: 'zz', version: l.version })).rejects.toMatchObject({ status: 422 });
    await expect(w.svc.reassign(manager, { leadId: 'nope', toUserId: 'b', version: 1 })).rejects.toMatchObject({ status: 404 });
  });

  it('moves an acknowledged lead with a fresh window and is not an escalation', async () => {
    const w = world();
    const l = await w.newLead();
    const acked = await w.svc.acknowledge(viewer('a'), l.id);
    w.now.t = at(100);
    const r = await w.svc.reassign(manager, { leadId: l.id, toUserId: 'b', version: acked.version });
    expect(r).toMatchObject({ ownerId: 'b', state: 'assigned', ackDeadline: at(130), escalationCount: 0, escalationLevel: 0 });
    expect(w.state.assignments.filter((a) => a.leadId === l.id).map((a) => [a.userId, a.reason, a.endReason])).toEqual([
      ['a', 'initial', 'reassigned'],
      ['b', 'manual', null],
    ]);
    expect(w.audits.map((a) => a.action)).toContain('lead.reassigned');
    expect(w.audits.map((a) => a.action)).not.toContain('lead.escalated');
  });
});

describe('onAvailabilityChange', () => {
  it('on leave reassigns only unacknowledged leads and flags acknowledged ones', async () => {
    const w = world([['a'], ['b']]);
    const pending = await w.newLead(); // a
    await w.newLead(); // b
    const acked = await w.newLead(); // a
    await w.svc.acknowledge(viewer('a'), acked.id);
    w.setStatus('a', 'on_leave');

    const r = await w.svc.onAvailabilityChange(w.tx, { workspaceId: W, userId: 'a', status: 'on_leave' });
    expect(r).toEqual({ reassigned: 1, flaggedAway: 1 });
    expect(w.state.leads.get(pending.id)).toMatchObject({ ownerId: 'b', state: 'assigned' });
    expect(w.state.assignments.find((a) => a.leadId === pending.id && a.userId === 'b')!.reason).toBe('owner_unavailable');
    expect(w.state.leads.get(acked.id)).toMatchObject({ ownerId: 'a', state: 'acknowledged', ownerAway: true });

    w.setStatus('a', 'available');
    await w.svc.onAvailabilityChange(w.tx, { workspaceId: W, userId: 'a', status: 'available' });
    expect(w.state.leads.get(acked.id)!.ownerAway).toBe(false);
  });

  it('owner-away acknowledged leads enter recovery after the idle period', async () => {
    const w = world([['a'], ['b']]);
    const l = await w.newLead();
    await w.svc.acknowledge(viewer('a'), l.id);
    await w.svc.onAvailabilityChange(w.tx, { workspaceId: W, userId: 'a', status: 'offline' });
    w.now.t = at(601);
    const q = await w.svc.recoveryQueue(W, { userId: 'mg', canSeeAll: true });
    expect(q.items[0].reasons).toEqual([{ code: 'idle', text: 'No recorded action for 601s (owner away)' }]);
  });
});

describe('visibility and rules', () => {
  it('users without leads.view_all see only their own leads', async () => {
    const w = world([['a'], ['b']]);
    const mine = await w.newLead(); // a
    const theirs = await w.newLead(); // b
    const list = await w.svc.list(viewer('a'), { limit: 10, ownerId: 'b' });
    expect(list.items.map((l) => l.id)).toEqual([mine.id]);
    await expect(w.svc.get(viewer('a'), theirs.id)).rejects.toMatchObject({ status: 404 });
    expect((await w.svc.get(manager, theirs.id)).ackRemainingSeconds).toBe(30);
  });

  it('validates escalation users and audits before and after', async () => {
    const w = world();
    const bad = defaultRules({ escalationLevels: [{ kind: 'backup', seconds: 30 }, { kind: 'manager', seconds: 30, userId: 'ghost' }] });
    await expect(w.svc.putRules(manager, bad)).rejects.toMatchObject({
      status: 422,
      extra: { fields: { 'escalationLevels.0.userId': 'Required for backup', 'escalationLevels.1.userId': 'Not a member of this workspace' } },
    });
    const next = defaultRules({ ackWindowSeconds: 45 });
    await w.svc.putRules(manager, next);
    const a = w.audits.find((x) => x.action === 'assignment_rules.updated')!;
    expect(a).toMatchObject({ actorId: 'mg', before: { ackWindowSeconds: 30 }, after: { ackWindowSeconds: 45 } });
  });
});

describe('web form', () => {
  it('creates a contact and a webform lead, then attaches repeats to the open lead', async () => {
    const w = world();
    w.state.workspaces.push({ id: W, name: 'Acme', slug: 'acme' });
    await w.svc.submitWebForm('acme', { name: 'Sara', phone: '+92 300 1234567', message: 'Need a quote' });
    await w.svc.submitWebForm('acme', { name: 'Sara K', phone: '+923001234567', message: 'Any update?' });
    const leads = [...w.state.leads.values()];
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ source: 'webform', ownerId: 'a' });
    expect([...w.state.contacts.values()].map((c) => c.phone)).toEqual(['+923001234567']);
    expect(w.acts.filter((a) => a.type === 'note').map((a) => a.data.body)).toEqual(['Need a quote', 'Any update?']);
  });

  it('ignores unknown workspaces without error and rejects malformed numbers', async () => {
    const w = world();
    await expect(w.svc.submitWebForm('nobody', { name: 'X', email: 'x@example.com' })).resolves.toBeUndefined();
    expect(w.state.leads.size).toBe(0);
    await expect(w.svc.submitWebForm('nobody', { name: 'X', phone: '12ab' })).rejects.toMatchObject({ status: 400, code: 'invalid_phone' });
  });
});
