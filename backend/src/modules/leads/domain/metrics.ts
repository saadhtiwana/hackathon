import type { AssignmentReason, Lead } from './types';

// Seconds from first assignment to first acknowledgement; null until acknowledged.
export function timeToFirstResponse(lead: Pick<Lead, 'firstAssignedAt' | 'firstAcknowledgedAt'>): number | null {
  if (!lead.firstAssignedAt || !lead.firstAcknowledgedAt) return null;
  return (lead.firstAcknowledgedAt.getTime() - lead.firstAssignedAt.getTime()) / 1000;
}

// Only window-expiry reassignments count; manual and owner_unavailable are reported separately.
export function isEscalation(reason: AssignmentReason): boolean {
  return reason === 'ack_expired';
}
