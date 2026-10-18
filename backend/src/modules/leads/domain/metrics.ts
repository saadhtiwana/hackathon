import type { AssignmentReason, Lead } from './types.js';

// Seconds from first assignment to first acknowledgement; null until acknowledged.
export function timeToFirstResponse(lead: Pick<Lead, 'firstAssignedAt' | 'firstAcknowledgedAt'>): number | null {
  if (!lead.firstAssignedAt || !lead.firstAcknowledgedAt) return null;
  return (lead.firstAcknowledgedAt.getTime() - lead.firstAssignedAt.getTime()) / 1000;
}

// Only window-expiry reassignments count; manual and owner_unavailable are reported separately.
export function isEscalation(reason: AssignmentReason): boolean {
  return reason === 'ack_expired';
}

// Section 7: these recorded actions by the owner count as acknowledgement. Assignment, field edits, payments and escalations do not.
const ACK_ACTIVITY_TYPES = new Set(['lead_ack', 'note', 'message', 'call_log', 'stage_change', 'appointment']);

export function countsAsAcknowledgement(activityType: string): boolean {
  return ACK_ACTIVITY_TYPES.has(activityType);
}
