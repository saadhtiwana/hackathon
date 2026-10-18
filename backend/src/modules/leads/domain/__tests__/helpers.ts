import type { Candidate, Lead, MemberStatus } from '../types';

export const T0 = new Date('2026-01-01T00:00:00Z');
export const at = (s: number) => new Date(T0.getTime() + s * 1000);

export const cand = (userId: string, status: MemberStatus = 'available', openLeadCount = 0): Candidate => ({
  userId,
  status,
  openLeadCount,
});

export const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'L1',
  state: 'assigned',
  ownerId: 'a',
  version: 1,
  createdAt: T0,
  firstAssignedAt: T0,
  assignedAt: T0,
  firstAcknowledgedAt: null,
  ackDeadline: at(30),
  lastActionAt: T0,
  escalationLevel: 0,
  escalationCount: 0,
  ownerHistory: [],
  ownerAway: false,
  ...over,
});
