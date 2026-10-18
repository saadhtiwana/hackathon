import type { AssignmentRules, AvailabilityAction, Lead, MemberStatus, Member } from './types';

const AWAY: MemberStatus[] = ['on_leave', 'offline'];

export function onAvailabilityChange(
  member: Member,
  newStatus: MemberStatus,
  ownedLeads: Lead[],
  _rules: Pick<AssignmentRules, 'maxOpenLeads'>,
): AvailabilityAction[] {
  const actions: AvailabilityAction[] = [];
  const goingAway = AWAY.includes(newStatus);

  for (const lead of ownedLeads) {
    if (lead.ownerId !== member.userId) continue;
    if (lead.state === 'assigned' && goingAway) {
      actions.push({ type: 'reassign', leadId: lead.id, excludeUserId: member.userId, reason: 'owner_unavailable' });
    } else if (lead.state === 'acknowledged') {
      if (goingAway && !lead.ownerAway) actions.push({ type: 'flag_owner_away', leadId: lead.id });
      else if (!goingAway && lead.ownerAway) actions.push({ type: 'clear_owner_away', leadId: lead.id });
    }
  }
  return actions;
}
