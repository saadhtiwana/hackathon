import { isEligible } from './eligibility.js';
import type { AssignResult, AssignmentRules, Candidate, SkippedCandidate } from './types.js';

// rrCursor is the userId that received the previous lead; order is by userId so it survives roster changes.
export function pickAssignee(
  candidates: Candidate[],
  rules: Pick<AssignmentRules, 'maxOpenLeads'>,
  rrCursor: string | null,
  excludeUserIds: string[] = [],
): AssignResult {
  const sorted = [...candidates].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const excluded = new Set(excludeUserIds);
  const skipped: SkippedCandidate[] = [];
  const eligible: Candidate[] = [];

  for (const c of sorted) {
    if (excluded.has(c.userId)) {
      skipped.push({ userId: c.userId, reason: 'excluded' });
      continue;
    }
    const r = isEligible(c, c.openLeadCount, rules);
    if (r.eligible) eligible.push(c);
    else skipped.push({ userId: c.userId, reason: r.reason });
  }

  if (eligible.length === 0) return { userId: null, nextCursor: rrCursor, skipped };

  const after = rrCursor === null ? undefined : eligible.find((c) => c.userId > rrCursor);
  const picked = after ?? eligible[0];
  return { userId: picked.userId, nextCursor: picked.userId, skipped };
}
