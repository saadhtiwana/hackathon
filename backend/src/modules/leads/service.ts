import {
  applyAcknowledge,
  applyAssignment,
  applyStuck,
  countsAsAcknowledgement,
  deadlineFrom,
  isEligible,
  nextStep,
  onAvailabilityChange as availabilityActions,
  pickAssignee,
  recoveryReasons,
  shouldFire,
  type AssignmentReason,
  type AssignmentRules,
  type Candidate,
  type LeadSource,
  type LeadState,
  type MemberStatus,
  type RecoveryReason,
  type SkippedCandidate,
} from './domain/index.js';
import { AppError, conflict, forbidden, notFound as missing, unprocessable } from '../../core/errors.js';
import { normalizePhone } from '../crm/phone.js';
import type { Ports, RealtimeEvent, Tx } from './ports.js';
import type { AssignmentRecord, ContactRecord, LeadRecord, LeadRepo, ListedLead, PageCursor, RulesRecord } from './repo.js';

// A sweep this far past the deadline means timers were not running (restart or missed ticks).
export const LATE_AFTER_SECONDS = 120;
const SWEEP_MAX_PER_CALL = 500;

export interface ServiceDeps {
  repo: LeadRepo;
  ports: Ports;
  now?: () => Date;
  log?: (msg: string, err: unknown) => void;
}

export interface Viewer {
  workspaceId: string;
  userId: string;
  permissions: ReadonlySet<string>;
}

export interface CreateLeadInput {
  workspaceId: string;
  contactId: string;
  source: LeadSource;
  opportunityId?: string;
  actorId?: string | null;
  message?: string;
  // web form and messaging attach to the contact's open lead instead of opening a second one
  dedupeOpen?: boolean;
}

export interface ContactInput {
  name: string;
  phone?: string;
  email?: string;
}

type Fx = { workspaceId: string; event: RealtimeEvent };

const snapshot = (l: LeadRecord) => ({
  status: l.state,
  ownerId: l.ownerId,
  version: l.version,
  ackDeadline: l.ackDeadline,
  escalationLevel: l.escalationLevel,
  escalationCount: l.escalationCount,
  ownerAway: l.ownerAway,
});

const stale = () => conflict('The lead was changed by someone else', 'Reload the lead and try again', 'version_conflict');
const notFound = () => missing('Lead');
const closedLead = () => conflict('The lead is closed', undefined, 'lead_closed');

export function createLeadService(deps: ServiceDeps) {
  const { repo, ports } = deps;
  const clock = deps.now ?? (() => new Date());
  const log = deps.log ?? ((msg, err) => console.error(msg, err));

  function flush(fx: Fx[]) {
    for (const f of fx) ports.realtime.publish(f.workspaceId, f.event);
  }

  // Own transaction: realtime events go out only after commit.
  async function run<T>(fn: (tx: Tx, fx: Fx[]) => Promise<T>): Promise<T> {
    const fx: Fx[] = [];
    const out = await repo.withTx((tx) => fn(tx, fx));
    flush(fx);
    return out;
  }

  // Caller's transaction (hooks): commit is theirs, so events go out when the hook returns.
  async function inTx<T>(tx: Tx, fn: (tx: Tx, fx: Fx[]) => Promise<T>): Promise<T> {
    const fx: Fx[] = [];
    const out = await fn(tx, fx);
    flush(fx);
    return out;
  }

  async function write(tx: Tx, next: LeadRecord, prev: LeadRecord): Promise<LeadRecord> {
    const saved = await repo.updateLead(tx, next, prev.version);
    if (!saved) throw stale();
    return saved;
  }

  async function lockOr404(tx: Tx, workspaceId: string, leadId: string) {
    const lead = await repo.lockLead(tx, workspaceId, leadId);
    if (!lead) throw notFound();
    return lead;
  }

  // Round-robin pick for intake and absence; nobody eligible leaves the lead stuck for a manager.
  async function autoAssign(
    tx: Tx,
    fx: Fx[],
    lead: LeadRecord,
    rr: RulesRecord,
    reason: Extract<AssignmentReason, 'initial' | 'owner_unavailable'>,
    actorId: string | null,
    excludeUserIds: string[],
    now: Date,
  ): Promise<LeadRecord> {
    const candidates = await repo.candidates(tx, lead.workspaceId);
    const pick = pickAssignee(candidates, rr.rules, rr.rrCursor, excludeUserIds);
    const fromUserId = lead.ownerId;
    if (fromUserId) await repo.closeAssignment(tx, lead.id, reason === 'owner_unavailable' ? 'owner_unavailable' : 'reassigned', now);

    if (!pick.userId) {
      const next = await write(tx, { ...applyStuck(lead, lead.escalationLevel), acknowledgedAt: null }, lead);
      await ports.activity.record(tx, {
        workspaceId: lead.workspaceId,
        entity: { leadId: lead.id, contactId: lead.contactId },
        type: 'assignment',
        actorId,
        data: { fromUserId, toUserId: null, reason, skipped: pick.skipped, stuck: true },
      });
      await ports.audit.record(tx, {
        workspaceId: lead.workspaceId,
        actorId,
        action: 'lead.stuck',
        targetType: 'lead',
        targetId: lead.id,
        before: snapshot(lead),
        after: { ...snapshot(next), reason, skipped: pick.skipped },
      });
      fx.push({ workspaceId: lead.workspaceId, event: { type: 'recovery.changed', ids: { leadId: lead.id } } });
      return next;
    }

    const assigned = applyAssignment(lead, pick.userId, 0, deadlineFrom(now, rr.rules.ackWindowSeconds), reason, now);
    const next = await write(tx, { ...assigned, acknowledgedAt: null }, lead);
    const assignmentId = await repo.openAssignment(tx, {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      userId: pick.userId,
      reason,
      level: 0,
      at: now,
    });
    await repo.saveCursor(tx, lead.workspaceId, pick.nextCursor);
    rr.rrCursor = pick.nextCursor;
    await ports.activity.record(tx, {
      workspaceId: lead.workspaceId,
      entity: { leadId: lead.id, contactId: lead.contactId },
      type: 'assignment',
      actorId,
      data: { assignmentId, fromUserId, toUserId: pick.userId, reason, level: 0, skipped: pick.skipped },
    });
    await ports.audit.record(tx, {
      workspaceId: lead.workspaceId,
      actorId,
      action: reason === 'initial' ? 'lead.assigned' : 'lead.reassigned',
      targetType: 'lead',
      targetId: lead.id,
      before: snapshot(lead),
      after: { ...snapshot(next), reason, skipped: pick.skipped },
    });
    fx.push({
      workspaceId: lead.workspaceId,
      event: {
        type: reason === 'initial' ? 'lead.assigned' : 'lead.reassigned',
        ids: { leadId: lead.id, ownerId: pick.userId, previousOwnerId: fromUserId },
        userIds: [pick.userId, ...(fromUserId ? [fromUserId] : [])],
      },
    });
    return next;
  }

  async function createLeadIn(tx: Tx, fx: Fx[], i: CreateLeadInput, now: Date): Promise<{ lead: LeadRecord; created: boolean }> {
    const actorId = i.actorId ?? null;
    if (i.dedupeOpen) {
      const open = await repo.findOpenLeadForContact(tx, i.workspaceId, i.contactId);
      if (open) {
        if (i.message) {
          await ports.activity.record(tx, {
            workspaceId: i.workspaceId,
            entity: { leadId: open.id, contactId: i.contactId },
            type: 'note',
            actorId,
            data: { body: i.message, source: i.source },
          });
        }
        return { lead: open, created: false };
      }
    }

    const rr = await repo.lockRules(tx, i.workspaceId);
    const lead = await repo.insertLead(tx, {
      workspaceId: i.workspaceId,
      contactId: i.contactId,
      opportunityId: i.opportunityId ?? null,
      source: i.source,
      state: 'unassigned',
      ownerId: null,
      createdAt: now,
      firstAssignedAt: null,
      assignedAt: null,
      firstAcknowledgedAt: null,
      acknowledgedAt: null,
      ackDeadline: null,
      lastActionAt: now,
      escalationLevel: 0,
      escalationCount: 0,
      ownerAway: false,
      closedAt: null,
    });
    await ports.audit.record(tx, {
      workspaceId: i.workspaceId,
      actorId,
      action: 'lead.created',
      targetType: 'lead',
      targetId: lead.id,
      after: { source: i.source, contactId: i.contactId },
    });
    if (i.message) {
      await ports.activity.record(tx, {
        workspaceId: i.workspaceId,
        entity: { leadId: lead.id, contactId: i.contactId },
        type: 'note',
        actorId,
        data: { body: i.message, source: i.source },
      });
    }
    fx.push({ workspaceId: i.workspaceId, event: { type: 'lead.created', ids: { leadId: lead.id, contactId: i.contactId } } });
    const assigned = await autoAssign(tx, fx, lead, rr, 'initial', actorId, [], now);
    return { lead: assigned, created: true };
  }

  async function acknowledgeIn(tx: Tx, fx: Fx[], lead: LeadRecord, actorId: string, via: string, now: Date) {
    const next = await write(tx, { ...applyAcknowledge(lead, now), acknowledgedAt: now }, lead);
    if (via === 'button') {
      await ports.activity.record(tx, {
        workspaceId: lead.workspaceId,
        entity: { leadId: lead.id, contactId: lead.contactId },
        type: 'lead_ack',
        actorId,
        data: {},
      });
    }
    await ports.audit.record(tx, {
      workspaceId: lead.workspaceId,
      actorId,
      action: 'lead.acknowledged',
      targetType: 'lead',
      targetId: lead.id,
      before: snapshot(lead),
      after: { ...snapshot(next), via },
    });
    fx.push({ workspaceId: lead.workspaceId, event: { type: 'lead.acknowledged', ids: { leadId: lead.id, ownerId: actorId } } });
    return next;
  }

  // Who was passed over on an escalation and why; previous owners count as excluded.
  function escalationSkips(lead: LeadRecord, candidates: Candidate[], rules: AssignmentRules, target: string | null) {
    const prior = new Set([...lead.ownerHistory, ...(lead.ownerId ? [lead.ownerId] : [])]);
    const out: SkippedCandidate[] = [];
    for (const c of candidates) {
      if (c.userId === target) continue;
      if (prior.has(c.userId)) out.push({ userId: c.userId, reason: 'excluded' });
      else {
        const e = isEligible(c, c.openLeadCount, rules);
        if (!e.eligible) out.push({ userId: c.userId, reason: e.reason });
      }
    }
    return out;
  }

  async function escalateOne(tx: Tx, fx: Fx[], lead: LeadRecord, now: Date): Promise<'escalated' | 'stuck' | 'skipped'> {
    if (!shouldFire(lead, lead.version, now)) return 'skipped';
    const rr = await repo.lockRules(tx, lead.workspaceId);
    const candidates = await repo.candidates(tx, lead.workspaceId);
    const withHistory = { ...lead, ownerHistory: await repo.ownerHistory(tx, lead.id) };
    const step = nextStep(withHistory, rr.rules.escalationLevels, candidates, now, rr.rules);
    const lateBySeconds = Math.floor((now.getTime() - lead.ackDeadline!.getTime()) / 1000);
    const late = lateBySeconds > LATE_AFTER_SECONDS ? { note: 'escalated late after server restart', lateBySeconds } : {};
    const skipped = escalationSkips(withHistory, candidates, rr.rules, step.targetUserId);
    await repo.closeAssignment(tx, lead.id, 'escalated', now);

    if (!step.targetUserId) {
      const next = await write(tx, { ...applyStuck(withHistory, step.level), acknowledgedAt: null }, lead);
      await ports.activity.record(tx, {
        workspaceId: lead.workspaceId,
        entity: { leadId: lead.id, contactId: lead.contactId },
        type: 'lead_escalation',
        actorId: null,
        data: { fromUserId: lead.ownerId, toUserId: null, level: step.level, stuck: true, skipped },
      });
      await ports.audit.record(tx, {
        workspaceId: lead.workspaceId,
        actorId: null,
        action: 'lead.stuck',
        targetType: 'lead',
        targetId: lead.id,
        before: snapshot(lead),
        after: { ...snapshot(next), reason: 'ack_expired', skipped, ...late },
      });
      fx.push({ workspaceId: lead.workspaceId, event: { type: 'recovery.changed', ids: { leadId: lead.id } } });
      return 'stuck';
    }

    const assigned = applyAssignment(withHistory, step.targetUserId, step.level, step.deadline!, 'ack_expired', now);
    const next = await write(tx, { ...assigned, acknowledgedAt: null }, lead);
    const assignmentId = await repo.openAssignment(tx, {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      userId: step.targetUserId,
      reason: 'ack_expired',
      level: step.level,
      at: now,
    });
    await ports.activity.record(tx, {
      workspaceId: lead.workspaceId,
      entity: { leadId: lead.id, contactId: lead.contactId },
      type: 'lead_escalation',
      actorId: null,
      data: { assignmentId, fromUserId: lead.ownerId, toUserId: step.targetUserId, level: step.level, kind: step.reason, skipped },
    });
    await ports.audit.record(tx, {
      workspaceId: lead.workspaceId,
      actorId: null,
      action: 'lead.escalated',
      targetType: 'lead',
      targetId: lead.id,
      before: snapshot(lead),
      after: { ...snapshot(next), reason: 'ack_expired', kind: step.reason, skipped, ...late },
    });
    await ports.outbox.enqueue(tx, {
      workspaceId: lead.workspaceId,
      kind: 'notify.escalation',
      payload: {
        leadId: lead.id,
        toUserId: step.targetUserId,
        fromUserId: lead.ownerId,
        source: lead.source,
        reason: 'ack_expired',
        level: step.level,
        kind: step.reason,
        linkPath: `/leads/${lead.id}`,
      },
    });
    fx.push({
      workspaceId: lead.workspaceId,
      event: {
        type: 'lead.escalated',
        ids: { leadId: lead.id, ownerId: step.targetUserId, previousOwnerId: lead.ownerId },
        userIds: [step.targetUserId, ...(lead.ownerId ? [lead.ownerId] : [])],
      },
    });
    if (next.escalationCount >= 2) fx.push({ workspaceId: lead.workspaceId, event: { type: 'recovery.changed', ids: { leadId: lead.id } } });
    return 'escalated';
  }

  async function setOwnerAway(tx: Tx, fx: Fx[], lead: LeadRecord, away: boolean, actorId: string | null) {
    const next = await write(tx, { ...lead, ownerAway: away, version: lead.version + 1 }, lead);
    await ports.audit.record(tx, {
      workspaceId: lead.workspaceId,
      actorId,
      action: away ? 'lead.owner_away' : 'lead.owner_back',
      targetType: 'lead',
      targetId: lead.id,
      before: snapshot(lead),
      after: snapshot(next),
    });
    fx.push({ workspaceId: lead.workspaceId, event: { type: 'recovery.changed', ids: { leadId: lead.id } } });
  }

  async function acknowledgeLead(tx: Tx, fx: Fx[], lead: LeadRecord, actorId: string) {
    if (lead.state === 'closed') throw closedLead();
    if (lead.ownerId !== actorId) throw forbidden('Only the current owner can acknowledge this lead', undefined);
    if (lead.state === 'acknowledged') return lead;
    return acknowledgeIn(tx, fx, lead, actorId, 'button', clock());
  }

  async function reassignLead(tx: Tx, fx: Fx[], lead: LeadRecord, toUserId: string, actorId: string, expectedVersion: number | null) {
    const now = clock();
    if (expectedVersion !== null && lead.version !== expectedVersion) throw stale();
    if (lead.state === 'closed') throw closedLead();
    if (lead.ownerId === toUserId) throw unprocessable('That person already owns the lead', undefined, 'already_owner');
    const target = await repo.member(tx, lead.workspaceId, toUserId);
    if (!target) throw unprocessable('Not an active member of this workspace', undefined, 'invalid_assignee', { fields: { toUserId: 'Unknown user' } });
    if (target.status !== 'available') {
      throw unprocessable(`${target.name} is ${target.status.replace('_', ' ')}`, 'Only Available employees receive leads', 'assignee_unavailable');
    }
    const rr = await repo.lockRules(tx, lead.workspaceId);
    const withHistory = { ...lead, ownerHistory: await repo.ownerHistory(tx, lead.id) };
    if (lead.ownerId) await repo.closeAssignment(tx, lead.id, 'reassigned', now);
    const assigned = applyAssignment(withHistory, toUserId, 0, deadlineFrom(now, rr.rules.ackWindowSeconds), 'manual', now);
    const next = await write(tx, { ...assigned, acknowledgedAt: null }, lead);
    const assignmentId = await repo.openAssignment(tx, { workspaceId: lead.workspaceId, leadId: lead.id, userId: toUserId, reason: 'manual', level: 0, at: now });
    await ports.activity.record(tx, {
      workspaceId: lead.workspaceId,
      entity: { leadId: lead.id, contactId: lead.contactId },
      type: 'assignment',
      actorId,
      data: { assignmentId, fromUserId: lead.ownerId, toUserId, reason: 'manual', level: 0, skipped: [] },
    });
    await ports.audit.record(tx, {
      workspaceId: lead.workspaceId,
      actorId,
      action: 'lead.reassigned',
      targetType: 'lead',
      targetId: lead.id,
      before: snapshot(lead),
      after: { ...snapshot(next), reason: 'manual' },
    });
    fx.push({
      workspaceId: lead.workspaceId,
      event: {
        type: 'lead.reassigned',
        ids: { leadId: lead.id, ownerId: toUserId, previousOwnerId: lead.ownerId },
        userIds: [toUserId, ...(lead.ownerId ? [lead.ownerId] : [])],
      },
    });
    fx.push({ workspaceId: lead.workspaceId, event: { type: 'recovery.changed', ids: { leadId: lead.id } } });
    return next;
  }

  async function lockAny(tx: Tx, workspaceId: string | undefined, leadId: string) {
    const lead = workspaceId ? await repo.lockLead(tx, workspaceId, leadId) : await repo.lockLeadById(tx, leadId);
    if (!lead) throw notFound();
    return lead;
  }

  function canSeeAll(v: Viewer) {
    return v.permissions.has('leads.reassign');
  }

  async function validateLevels(workspaceId: string, rules: AssignmentRules) {
    const fields: Record<string, string> = {};
    for (const [i, l] of rules.escalationLevels.entries()) {
      if (l.kind === 'next_eligible') continue;
      if (!l.userId) fields[`escalationLevels.${i}.userId`] = `Required for ${l.kind}`;
      else if (!(await repo.member(null, workspaceId, l.userId))) fields[`escalationLevels.${i}.userId`] = 'Not a member of this workspace';
    }
    if (Object.keys(fields).length) throw unprocessable('Some escalation levels are invalid', 'Pick an active member for each backup and manager level', 'validation_failed', { fields });
  }

  function contactFields(c: ContactInput) {
    const phone = c.phone?.trim() ? normalizePhone(c.phone) : null;
    const email = c.email?.trim() ? c.email.trim().toLowerCase() : null;
    if (!phone && !email) {
      throw new AppError(400, 'validation_failed', 'Phone or email is required', 'Give at least one way to reach the contact', { fields: { phone: 'Phone or email is required' } });
    }
    return { name: c.name.trim(), phone, email };
  }

  return {
    // ---- hooks (run inside the caller's transaction)

    createLead(tx: Tx, i: CreateLeadInput) {
      return inTx(tx, async (t, fx) => (await createLeadIn(t, fx, i, clock())).lead);
    },

    // Hook shapes follow core/lead-hooks.ts, which passes only the lead id for these.
    acknowledgeHook(tx: Tx, i: { leadId: string; actorId: string; workspaceId?: string }) {
      return inTx(tx, async (t, fx) => acknowledgeLead(t, fx, await lockAny(t, i.workspaceId, i.leadId), i.actorId));
    },

    reassignHook(tx: Tx, i: { leadId: string; toUserId: string; actorId: string; workspaceId?: string }) {
      return inTx(tx, async (t, fx) => reassignLead(t, fx, await lockAny(t, i.workspaceId, i.leadId), i.toUserId, i.actorId, null));
    },

    onActivity(tx: Tx, i: { leadId: string; actorId: string | null; type: string; workspaceId?: string }) {
      return inTx(tx, async (t, fx) => {
        // idle tracks the team's actions; system and customer activity (actorId null) does not count
        if (!countsAsAcknowledgement(i.type) || !i.actorId) return;
        const lead = i.workspaceId ? await repo.lockLead(t, i.workspaceId, i.leadId) : await repo.lockLeadById(t, i.leadId);
        if (!lead || lead.state === 'closed') return;
        const now = clock();
        if (lead.state === 'assigned' && i.actorId === lead.ownerId) {
          await acknowledgeIn(t, fx, lead, i.actorId, i.type, now);
          return;
        }
        await write(t, { ...lead, lastActionAt: now, version: lead.version + 1 }, lead);
      });
    },

    onAvailabilityChange(tx: Tx, i: { workspaceId: string; userId: string; status: MemberStatus; actorId?: string | null }) {
      return inTx(tx, async (t, fx) => {
        const now = clock();
        const actorId = i.actorId ?? i.userId;
        const owned = await repo.lockOwnedOpenLeads(t, i.workspaceId, i.userId);
        const actions = availabilityActions({ userId: i.userId, status: i.status }, i.status, owned, { maxOpenLeads: 0 });
        const byId = new Map(owned.map((l) => [l.id, l]));
        let reassigned = 0;
        let flaggedAway = 0;
        let rr: RulesRecord | null = null;
        for (const a of actions) {
          const lead = byId.get(a.leadId)!;
          if (a.type === 'reassign') {
            rr ??= await repo.lockRules(t, i.workspaceId);
            const withHistory = { ...lead, ownerHistory: await repo.ownerHistory(t, lead.id) };
            await autoAssign(t, fx, withHistory, rr, 'owner_unavailable', actorId, [a.excludeUserId], now);
            reassigned++;
          } else {
            await setOwnerAway(t, fx, lead, a.type === 'flag_owner_away', actorId);
            if (a.type === 'flag_owner_away') flaggedAway++;
          }
        }
        return { reassigned, flaggedAway };
      });
    },

    // ---- scheduler

    // One short transaction per due lead. SKIP LOCKED plus the version check means overlapping sweeps act once per lead.
    // workspaceId narrows the sweep (tests on a shared database); the scheduler sweeps everything.
    async sweep(now: Date = clock(), opts: { workspaceId?: string } = {}): Promise<{ escalated: number; recovered: number }> {
      let escalated = 0;
      let recovered = 0;
      const seen: string[] = [];
      for (let n = 0; n < SWEEP_MAX_PER_CALL; n++) {
        let outcome: 'escalated' | 'stuck' | 'skipped' | 'none';
        try {
          outcome = await run(async (tx, fx) => {
            const [lead] = await repo.lockDueLeads(tx, now, 1, seen, opts.workspaceId);
            if (!lead) return 'none';
            seen.push(lead.id);
            return escalateOne(tx, fx, lead, now);
          });
        } catch (err) {
          // the lead stays due and is retried on the next tick; seen keeps this sweep from looping on it
          log('lead sweep failed', err);
          continue;
        }
        if (outcome === 'none') break;
        if (outcome === 'escalated') escalated++;
        if (outcome === 'stuck') recovered++;
      }
      return { escalated, recovered };
    },

    nextDueAt: () => repo.nextDueAt(),

    // ---- app actions

    acknowledge(viewer: Viewer, leadId: string) {
      return run(async (tx, fx) => acknowledgeLead(tx, fx, await lockOr404(tx, viewer.workspaceId, leadId), viewer.userId));
    },

    reassign(viewer: Viewer, i: { leadId: string; toUserId: string; version: number }) {
      return run(async (tx, fx) => reassignLead(tx, fx, await lockOr404(tx, viewer.workspaceId, i.leadId), i.toUserId, viewer.userId, i.version));
    },

    close(viewer: Viewer, i: { leadId: string; outcome?: string }) {
      return run(async (tx, fx) => {
        const now = clock();
        const lead = await lockOr404(tx, viewer.workspaceId, i.leadId);
        if (lead.state === 'closed') return lead;
        if (lead.ownerId !== viewer.userId && !canSeeAll(viewer)) throw forbidden('Only the owner or a manager can close this lead');
        const next = await write(tx, { ...lead, state: 'closed', closedAt: now, ownerAway: false, version: lead.version + 1 }, lead);
        await repo.closeAssignment(tx, lead.id, 'closed', now);
        await ports.audit.record(tx, {
          workspaceId: lead.workspaceId,
          actorId: viewer.userId,
          action: 'lead.closed',
          targetType: 'lead',
          targetId: lead.id,
          before: snapshot(lead),
          after: { ...snapshot(next), outcome: i.outcome ?? null },
        });
        fx.push({ workspaceId: lead.workspaceId, event: { type: 'lead.closed', ids: { leadId: lead.id } } });
        fx.push({ workspaceId: lead.workspaceId, event: { type: 'recovery.changed', ids: { leadId: lead.id } } });
        return next;
      });
    },

    createManual(viewer: Viewer, i: { contactId?: string; name?: string; phone?: string; email?: string; message?: string }) {
      return run(async (tx, fx) => {
        let contactId = i.contactId;
        if (contactId) {
          if (!(await repo.getContact(tx, viewer.workspaceId, contactId))) {
            throw unprocessable('Contact not found', undefined, 'validation_failed', { fields: { contactId: 'Unknown contact' } });
          }
        } else {
          if (!i.name?.trim()) throw new AppError(400, 'validation_failed', 'Name is required', undefined, { fields: { name: 'Required' } });
          const { contact } = await repo.findOrCreateContact(tx, viewer.workspaceId, contactFields({ name: i.name, phone: i.phone, email: i.email }));
          contactId = contact.id;
        }
        const out = await createLeadIn(
          tx,
          fx,
          { workspaceId: viewer.workspaceId, contactId, source: 'manual', actorId: viewer.userId, message: i.message },
          clock(),
        );
        return out.lead;
      });
    },

    // Public form: unknown workspaces are silently ignored so the response never reveals which slugs exist.
    async submitWebForm(slug: string, i: ContactInput & { message?: string }): Promise<void> {
      const fields = contactFields(i);
      const ws = await repo.workspaceBySlug(slug);
      if (!ws) return;
      await run(async (tx, fx) => {
        const { contact } = await repo.findOrCreateContact(tx, ws.id, fields);
        await createLeadIn(tx, fx, { workspaceId: ws.id, contactId: contact.id, source: 'webform', message: i.message, dedupeOpen: true }, clock());
      });
    },

    async publicForm(slug: string) {
      const ws = await repo.workspaceBySlug(slug);
      if (!ws) throw missing('Form');
      return {
        workspaceName: ws.name,
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'phone', label: 'Phone', type: 'tel', required: false },
          { key: 'email', label: 'Email', type: 'email', required: false },
          { key: 'message', label: 'Message', type: 'textarea', required: false },
        ],
      };
    },

    // ---- reads

    async list(
      viewer: Viewer,
      q: { status?: LeadState; ownerId?: string; source?: LeadSource; mine?: boolean; limit: number; cursor?: PageCursor },
    ) {
      const ownerId = q.mine || !canSeeAll(viewer) ? viewer.userId : q.ownerId;
      const rows = await repo.listLeads(viewer.workspaceId, { ...q, ownerId, limit: q.limit + 1 });
      return page(rows, q.limit);
    },

    async get(viewer: Viewer, leadId: string) {
      const lead = await repo.getLead(null, viewer.workspaceId, leadId);
      if (!lead || (!canSeeAll(viewer) && lead.ownerId !== viewer.userId)) throw notFound();
      const now = clock();
      const [contact, assignments, rules] = await Promise.all([
        repo.getContact(null, viewer.workspaceId, lead.contactId),
        repo.assignments(viewer.workspaceId, lead.id),
        repo.getRules(viewer.workspaceId),
      ]);
      return {
        lead,
        contact: contact as ContactRecord,
        assignments: assignments as AssignmentRecord[],
        ackRemainingSeconds: ackRemainingSeconds(lead, now),
        recoveryReasons: recoveryReasons(lead, rules, now),
      };
    },

    async recoveryQueue(workspaceId: string, viewer: { userId: string; canSeeAll: boolean }, q: { limit: number; cursor?: PageCursor } = { limit: 50 }) {
      const now = clock();
      const rules = await repo.getRules(workspaceId);
      const rows = await repo.recoveryCandidates(workspaceId, {
        now,
        idleSeconds: rules.idleSeconds,
        ownerId: viewer.canSeeAll ? undefined : viewer.userId,
        limit: q.limit + 1,
        cursor: q.cursor,
      });
      const { items, nextCursor } = page(rows, q.limit);
      const withReasons: { lead: ListedLead; reasons: RecoveryReason[] }[] = items
        .map((lead) => ({ lead, reasons: recoveryReasons(lead, rules, now) }))
        .filter((x) => x.reasons.length > 0);
      return { items: withReasons, nextCursor };
    },

    getRules: (workspaceId: string) => repo.getRules(workspaceId),

    putRules(viewer: Viewer, rules: AssignmentRules) {
      return run(async (tx) => {
        await validateLevels(viewer.workspaceId, rules);
        const before = (await repo.lockRules(tx, viewer.workspaceId)).rules;
        await repo.saveRules(tx, viewer.workspaceId, rules);
        await ports.audit.record(tx, {
          workspaceId: viewer.workspaceId,
          actorId: viewer.userId,
          action: 'assignment_rules.updated',
          targetType: 'assignment_rules',
          targetId: viewer.workspaceId,
          before,
          after: rules,
        });
        return rules;
      });
    },
  };
}

export type LeadService = ReturnType<typeof createLeadService>;

export function ackRemainingSeconds(lead: LeadRecord, now: Date): number | null {
  if (lead.state !== 'assigned' || !lead.ackDeadline) return null;
  return Math.max(0, Math.ceil((lead.ackDeadline.getTime() - now.getTime()) / 1000));
}

function page<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null;
  return { items, nextCursor };
}
