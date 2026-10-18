export type MemberStatus = 'available' | 'busy' | 'on_leave' | 'offline';

export type LeadState = 'unassigned' | 'assigned' | 'acknowledged' | 'closed';

export type IneligibleReason = 'on_leave' | 'offline' | 'busy' | 'at_capacity';

export type SkipReason = IneligibleReason | 'excluded';

export type AssignmentReason = 'initial' | 'ack_expired' | 'manual' | 'owner_unavailable';

export type EscalationKind = 'next_eligible' | 'backup' | 'manager';

export type LeadSource = 'webform' | 'whatsapp' | 'manual' | 'discord' | 'email';

// Only one policy is implemented: acknowledged leads stay with an away owner, flagged, until idle or reassigned.
export type AcknowledgedOnLeavePolicy = 'keep_flag_recover';

export interface Member {
  userId: string;
  status: MemberStatus;
}

export interface Candidate extends Member {
  openLeadCount: number;
}

// Matches GET/PUT /assignment-rules. Level N of the chain is escalationLevels[N - 1].
export interface AssignmentRules {
  strategy: 'round_robin';
  maxOpenLeads: number;
  ackWindowSeconds: number;
  idleSeconds: number;
  escalationLevels: EscalationLevel[];
  acknowledgedOnLeavePolicy: AcknowledgedOnLeavePolicy;
}

// userId is required for backup and manager levels and ignored for next_eligible.
export interface EscalationLevel {
  kind: EscalationKind;
  seconds: number;
  userId?: string;
}

export interface Lead {
  id: string;
  source: LeadSource;
  state: LeadState;
  ownerId: string | null;
  version: number;
  createdAt: Date;
  firstAssignedAt: Date | null;
  assignedAt: Date | null;
  firstAcknowledgedAt: Date | null;
  ackDeadline: Date | null;
  lastActionAt: Date;
  escalationLevel: number;
  escalationCount: number;
  ownerHistory: string[];
  ownerAway: boolean;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: IneligibleReason };

export interface SkippedCandidate {
  userId: string;
  reason: SkipReason;
}

export interface AssignResult {
  userId: string | null;
  nextCursor: string | null;
  skipped: SkippedCandidate[];
}

export type EscalationReason = EscalationKind | 'no_candidate' | 'not_pending';

export interface EscalationStep {
  targetUserId: string | null;
  level: number;
  reason: EscalationReason;
  deadline: Date | null;
}

export type RecoveryCode = 'unacked_overdue' | 'escalated_multiple' | 'idle';

export interface RecoveryReason {
  code: RecoveryCode;
  text: string;
}

export type AvailabilityAction =
  | { type: 'reassign'; leadId: string; excludeUserId: string; reason: 'owner_unavailable' }
  | { type: 'flag_owner_away'; leadId: string }
  | { type: 'clear_owner_away'; leadId: string };
