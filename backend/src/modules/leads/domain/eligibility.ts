import type { AssignmentRules, EligibilityResult, Member } from './types.js';

export function isEligible(
  member: Member,
  openLeadCount: number,
  rules: Pick<AssignmentRules, 'maxOpenLeads'>,
): EligibilityResult {
  if (member.status === 'on_leave') return { eligible: false, reason: 'on_leave' };
  if (member.status === 'offline') return { eligible: false, reason: 'offline' };
  if (member.status === 'busy') return { eligible: false, reason: 'busy' };
  if (openLeadCount >= rules.maxOpenLeads) return { eligible: false, reason: 'at_capacity' };
  return { eligible: true };
}
