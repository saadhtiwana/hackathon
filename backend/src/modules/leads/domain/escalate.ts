import { isEligible } from './eligibility.js';
import type {
  AssignmentReason,
  AssignmentRules,
  Candidate,
  EscalationKind,
  EscalationLevel,
  EscalationStep,
  Lead,
} from './types.js';

export function deadlineFrom(now: Date, seconds: number): Date {
  return new Date(now.getTime() + seconds * 1000);
}

function findTarget(
  kind: EscalationKind,
  level: EscalationLevel,
  lead: Lead,
  candidates: Candidate[],
  rules: Pick<AssignmentRules, 'maxOpenLeads'>,
): string | null {
  const sorted = [...candidates].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

  if (kind === 'next_eligible') {
    const history = new Set(lead.ownerHistory);
    if (lead.ownerId) history.add(lead.ownerId);
    const pool = sorted.filter((c) => !history.has(c.userId) && isEligible(c, c.openLeadCount, rules).eligible);
    const after = lead.ownerId ? pool.find((c) => c.userId > lead.ownerId!) : undefined;
    return (after ?? pool[0])?.userId ?? null;
  }

  // backup and manager must be Available but are exempt from the open-lead cap
  if (!level.userId || level.userId === lead.ownerId) return null;
  const hit = sorted.find((c) => c.userId === level.userId && c.status === 'available');
  return hit?.userId ?? null;
}

export function nextStep(
  lead: Lead,
  escalationLevels: EscalationLevel[],
  candidates: Candidate[],
  now: Date,
  rules: Pick<AssignmentRules, 'maxOpenLeads'> = { maxOpenLeads: Number.MAX_SAFE_INTEGER },
): EscalationStep {
  if (lead.state !== 'assigned') {
    return { targetUserId: null, level: lead.escalationLevel, reason: 'not_pending', deadline: null };
  }

  // lead.escalationLevel is the 1-based level reached so far (0 = initial window), so the next one is at that index
  for (let i = lead.escalationLevel; i < escalationLevels.length; i++) {
    const l = escalationLevels[i];
    const target = findTarget(l.kind, l, lead, candidates, rules);
    if (target) return { targetUserId: target, level: i + 1, reason: l.kind, deadline: deadlineFrom(now, l.seconds) };
  }

  return {
    targetUserId: null,
    level: Math.max(escalationLevels.length, lead.escalationLevel),
    reason: 'no_candidate',
    deadline: null,
  };
}

// A timer may fire only if the lead is still pending and its version matches the one the timer was armed with.
export function shouldFire(lead: Lead, timerVersion: number, now: Date): boolean {
  return (
    lead.state === 'assigned' &&
    lead.version === timerVersion &&
    lead.ackDeadline !== null &&
    lead.ackDeadline.getTime() <= now.getTime()
  );
}

export function applyAssignment(
  lead: Lead,
  targetUserId: string,
  level: number,
  deadline: Date,
  reason: AssignmentReason,
  now: Date,
): Lead {
  const history = lead.ownerId ? [...lead.ownerHistory, lead.ownerId] : lead.ownerHistory;
  return {
    ...lead,
    state: 'assigned',
    ownerId: targetUserId,
    version: lead.version + 1,
    firstAssignedAt: lead.firstAssignedAt ?? now,
    assignedAt: now,
    ackDeadline: deadline,
    escalationLevel: level,
    escalationCount: reason === 'ack_expired' ? lead.escalationCount + 1 : lead.escalationCount,
    ownerHistory: history,
    ownerAway: false,
  };
}
