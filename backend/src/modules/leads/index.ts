// Public surface of the leads module. Other modules reach it only through core/lead-hooks (docs/modules.md).
import { setLeadHooks } from '../../core/lead-hooks.js';
import { ports } from './ports.js';
import { pgLeadRepo } from './repo.js';
import { leadsRouter as buildRouter, type RouterOptions } from './routes.js';
import { createLeadService } from './service.js';

export const leadService = createLeadService({ repo: pgLeadRepo, ports });

export const leadHooks = {
  createLead: leadService.createLead,
  acknowledge: leadService.acknowledgeHook,
  onActivity: leadService.onActivity,
  onAvailabilityChange: leadService.onAvailabilityChange,
  sweep: (now: Date) => leadService.sweep(now),
  reassign: leadService.reassignHook,
  recoveryQueue: async (workspaceId: string, viewer: { userId: string; canSeeAll: boolean }) =>
    (await leadService.recoveryQueue(workspaceId, viewer)).items,
  // earliest ack deadline of any pending lead, so the scheduler can arm a timer instead of waiting for the next tick
  nextDueAt: leadService.nextDueAt,
};

// core types onAvailabilityChange as Promise<void>; the counts stay available on leadHooks above
setLeadHooks({
  ...leadHooks,
  onAvailabilityChange: async (tx, i) => {
    await leadService.onAvailabilityChange(tx, i);
  },
});

// Mount inside the /api router: api.use(leadsRouter)
export const leadsRouter = buildRouter(leadService);
export const createLeadsRouter = (opts?: RouterOptions) => buildRouter(leadService, opts);

export type { LeadService, Viewer } from './service.js';
