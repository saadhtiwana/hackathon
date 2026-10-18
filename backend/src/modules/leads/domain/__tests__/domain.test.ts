import { describe, expect, it } from 'vitest';
import { onAvailabilityChange } from '../availability.js';
import { pickAssignee } from '../assign.js';
import { isEligible } from '../eligibility.js';
import { applyAssignment, nextStep, shouldFire } from '../escalate.js';
import { countsAsAcknowledgement, isEscalation, timeToFirstResponse } from '../metrics.js';
import { recoveryReasons } from '../recovery.js';
import type { EscalationLevel } from '../types.js';
import { at, cand, lead, T0 } from './helpers.js';

const rules = { maxOpenLeads: 3, ackWindowSeconds: 30, idleSeconds: 60 };

describe('eligibility', () => {
  it('reports why a member is skipped', () => {
    expect(isEligible({ userId: 'a', status: 'on_leave' }, 0, rules)).toEqual({ eligible: false, reason: 'on_leave' });
    expect(isEligible({ userId: 'a', status: 'offline' }, 0, rules)).toEqual({ eligible: false, reason: 'offline' });
    expect(isEligible({ userId: 'a', status: 'busy' }, 0, rules)).toEqual({ eligible: false, reason: 'busy' });
    expect(isEligible({ userId: 'a', status: 'available' }, 3, rules)).toEqual({ eligible: false, reason: 'at_capacity' });
    expect(isEligible({ userId: 'a', status: 'available' }, 2, rules)).toEqual({ eligible: true });
  });
});

describe('pickAssignee', () => {
  it('skips ineligible members with reasons', () => {
    const r = pickAssignee(
      [cand('a', 'on_leave'), cand('b', 'busy'), cand('c', 'offline'), cand('d', 'available', 3), cand('e')],
      rules,
      null,
    );
    expect(r.userId).toBe('e');
    expect(r.skipped).toEqual([
      { userId: 'a', reason: 'on_leave' },
      { userId: 'b', reason: 'busy' },
      { userId: 'c', reason: 'offline' },
      { userId: 'd', reason: 'at_capacity' },
    ]);
  });

  it('is fair and wraps the cursor', () => {
    const cs = [cand('c'), cand('a'), cand('b')];
    let cursor: string | null = null;
    const picks: string[] = [];
    for (let i = 0; i < 7; i++) {
      const r = pickAssignee(cs, rules, cursor);
      picks.push(r.userId!);
      cursor = r.nextCursor;
    }
    expect(picks).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a']);
  });

  it('continues past a cursor user who left the roster', () => {
    expect(pickAssignee([cand('a'), cand('c')], rules, 'b').userId).toBe('c');
  });

  it('honours exclusions and keeps the cursor when nobody qualifies', () => {
    const r = pickAssignee([cand('a'), cand('b', 'busy')], rules, 'x', ['a']);
    expect(r.userId).toBeNull();
    expect(r.nextCursor).toBe('x');
    expect(r.skipped).toContainEqual({ userId: 'a', reason: 'excluded' });
  });
});

describe('nextStep', () => {
  const levels: EscalationLevel[] = [
    { kind: 'next_eligible', seconds: 30 },
    { kind: 'backup', seconds: 45, userId: 'bk' },
    { kind: 'manager', seconds: 60, userId: 'mg' },
  ];
  const pool = [cand('a'), cand('b'), cand('bk'), cand('mg')];

  it('walks levels with configured seconds and never returns the owner', () => {
    let l = lead();
    const s1 = nextStep(l, levels, pool, at(30), rules);
    expect(s1).toMatchObject({ targetUserId: 'b', level: 1, reason: 'next_eligible' });
    expect(s1.deadline).toEqual(at(60));

    l = applyAssignment(l, s1.targetUserId!, s1.level, s1.deadline!, 'ack_expired', at(30));
    const s2 = nextStep(l, levels, pool, at(60), rules);
    expect(s2).toMatchObject({ targetUserId: 'bk', level: 2, reason: 'backup' });
    expect(s2.deadline).toEqual(at(105));

    l = applyAssignment(l, s2.targetUserId!, s2.level, s2.deadline!, 'ack_expired', at(60));
    const s3 = nextStep(l, levels, pool, at(105), rules);
    expect(s3).toMatchObject({ targetUserId: 'mg', level: 3, reason: 'manager' });
    expect(s3.deadline).toEqual(at(165));
    expect(l.escalationCount).toBe(2);
  });

  it('falls through an empty level to the next one', () => {
    const s = nextStep(lead(), levels, [cand('a'), cand('bk', 'available', 3)], at(30), rules);
    expect(s).toMatchObject({ targetUserId: 'bk', level: 2, reason: 'backup' });
  });

  it('is stuck when no candidate exists', () => {
    const s = nextStep(lead(), levels, [cand('a'), cand('bk', 'on_leave'), cand('mg', 'offline'), cand('b', 'busy')], at(30), rules);
    expect(s).toMatchObject({ targetUserId: null, level: 3, reason: 'no_candidate', deadline: null });
  });

  it('skips a backup level whose designated user is the current owner', () => {
    const s = nextStep(lead({ ownerId: 'bk', escalationLevel: 1 }), levels, [cand('bk'), cand('mg')], at(30), rules);
    expect(s).toMatchObject({ targetUserId: 'mg', level: 3, reason: 'manager', deadline: at(90) });
  });

  it('does not step a lead that is no longer pending', () => {
    const s = nextStep(lead({ state: 'acknowledged' }), levels, pool, at(30), rules);
    expect(s.reason).toBe('not_pending');
    expect(s.targetUserId).toBeNull();
  });

  it('turns two expiries of the same version into one step', () => {
    const l = lead();
    const fired: string[] = [];
    let cur = l;
    for (const timerVersion of [1, 1]) {
      if (!shouldFire(cur, timerVersion, at(30))) continue;
      const s = nextStep(cur, levels, pool, at(30), rules);
      cur = applyAssignment(cur, s.targetUserId!, s.level, s.deadline!, 'ack_expired', at(30));
      fired.push(s.targetUserId!);
    }
    expect(fired).toEqual(['b']);
    expect(cur.version).toBe(2);
    expect(cur.escalationCount).toBe(1);
  });

  it('does not fire before the deadline', () => {
    expect(shouldFire(lead(), 1, at(29))).toBe(false);
    expect(shouldFire(lead(), 1, at(30))).toBe(true);
  });

  it('works with 30-second windows end to end', () => {
    const l = lead({ ackDeadline: deadlineAfter(30) });
    expect(shouldFire(l, 1, at(30))).toBe(true);
    expect(nextStep(l, levels, pool, at(30), rules).deadline).toEqual(at(60));
  });
});

function deadlineAfter(s: number) {
  return at(s);
}

describe('recoveryReasons', () => {
  it('flags unacked overdue', () => {
    const r = recoveryReasons(lead(), rules, at(40));
    expect(r.map((x) => x.code)).toEqual(['unacked_overdue']);
  });

  it('flags multiple escalations', () => {
    const r = recoveryReasons(lead({ escalationCount: 2, ackDeadline: at(500) }), rules, at(10));
    expect(r.map((x) => x.code)).toEqual(['escalated_multiple']);
  });

  it('flags idle, including owner-away text', () => {
    const r = recoveryReasons(lead({ state: 'acknowledged', ownerAway: true, ackDeadline: null }), rules, at(61));
    expect(r.map((x) => x.code)).toEqual(['idle']);
    expect(r[0].text).toContain('owner away');
  });

  it('returns nothing for healthy and closed leads', () => {
    expect(recoveryReasons(lead(), rules, at(10))).toEqual([]);
    expect(recoveryReasons(lead({ state: 'closed' }), rules, at(9999))).toEqual([]);
  });

  it('combines reasons', () => {
    const r = recoveryReasons(lead({ escalationCount: 2 }), rules, at(100));
    expect(r.map((x) => x.code)).toEqual(['unacked_overdue', 'escalated_multiple', 'idle']);
  });
});

describe('onAvailabilityChange', () => {
  const owner = { userId: 'a', status: 'available' as const };
  const owned = [
    lead({ id: 'u' }),
    lead({ id: 'k', state: 'acknowledged', ackDeadline: null }),
    lead({ id: 'c', state: 'closed', ackDeadline: null }),
  ];

  it('on leave reassigns only unacknowledged leads and flags acknowledged ones', () => {
    expect(onAvailabilityChange(owner, 'on_leave', owned, rules)).toEqual([
      { type: 'reassign', leadId: 'u', excludeUserId: 'a', reason: 'owner_unavailable' },
      { type: 'flag_owner_away', leadId: 'k' },
    ]);
  });

  it('offline behaves like on leave', () => {
    expect(onAvailabilityChange(owner, 'offline', owned, rules)).toHaveLength(2);
  });

  it('busy changes nothing', () => {
    expect(onAvailabilityChange(owner, 'busy', owned, rules)).toEqual([]);
  });

  it('returning clears the owner-away flag', () => {
    const away = [lead({ id: 'k', state: 'acknowledged', ownerAway: true, ackDeadline: null })];
    expect(onAvailabilityChange(owner, 'available', away, rules)).toEqual([{ type: 'clear_owner_away', leadId: 'k' }]);
  });
});

describe('metrics', () => {
  it('computes time to first response from first assignment', () => {
    expect(timeToFirstResponse(lead())).toBeNull();
    expect(timeToFirstResponse(lead({ firstAcknowledgedAt: at(12) }))).toBe(12);
    // a later reassignment does not reset the clock
    expect(timeToFirstResponse(lead({ assignedAt: at(30), firstAcknowledgedAt: at(40) }))).toBe(40);
  });

  it('counts only expiry reassignments as escalations', () => {
    expect(isEscalation('ack_expired')).toBe(true);
    expect(isEscalation('manual')).toBe(false);
    expect(isEscalation('owner_unavailable')).toBe(false);
    expect(isEscalation('initial')).toBe(false);
  });

  it('treats only recorded lead actions as acknowledgement', () => {
    for (const t of ['lead_ack', 'note', 'message', 'call_log', 'stage_change', 'appointment']) {
      expect(countsAsAcknowledgement(t)).toBe(true);
    }
    for (const t of ['assignment', 'field_edit', 'payment', 'lead_escalation']) expect(countsAsAcknowledgement(t)).toBe(false);
  });
});

void T0;
