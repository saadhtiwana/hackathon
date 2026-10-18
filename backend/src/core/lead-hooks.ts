import type { Tx } from './db/client.js';

type Availability = 'available' | 'busy' | 'on_leave' | 'offline';

// Interface owned by the leads module. Until its implementation registers itself, calls are no-ops.
export interface LeadHooks {
  createLead(tx: Tx, i: { workspaceId: string; contactId: string; source: 'webform' | 'whatsapp' | 'manual'; opportunityId?: string }): Promise<unknown>;
  acknowledge(tx: Tx, i: { leadId: string; actorId: string }): Promise<unknown>;
  onActivity(tx: Tx, i: { leadId: string; actorId: string | null; type: string }): Promise<void>;
  onAvailabilityChange(tx: Tx, i: { workspaceId: string; userId: string; status: Availability }): Promise<void>;
  sweep(now: Date): Promise<{ escalated: number; recovered: number }>;
  reassign(tx: Tx, i: { leadId: string; toUserId: string; actorId: string }): Promise<unknown>;
  recoveryQueue(workspaceId: string, viewer: { userId: string; canSeeAll: boolean }): Promise<unknown[]>;
}

const noop: LeadHooks = {
  createLead: async () => null,
  acknowledge: async () => null,
  onActivity: async () => {},
  onAvailabilityChange: async () => {},
  sweep: async () => ({ escalated: 0, recovered: 0 }),
  reassign: async () => null,
  recoveryQueue: async () => [],
};

let impl: LeadHooks = noop;
export const setLeadHooks = (h: Partial<LeadHooks>) => {
  impl = { ...noop, ...h };
};
export const leadHooks: LeadHooks = new Proxy({} as LeadHooks, {
  get: (_t, k: string) => (impl as unknown as Record<string, unknown>)[k],
});
