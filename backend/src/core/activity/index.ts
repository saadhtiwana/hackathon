import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../db/client.js';
import { activities, leads } from '../db/schema/index.js';
import { leadHooks } from '../lead-hooks.js';
import { realtime } from '../realtime/index.js';

export type ActivityType = (typeof activities.$inferInsert)['type'];

export interface ActivityEvent {
  workspaceId: string;
  entity: { contactId?: string | null; opportunityId?: string | null; leadId?: string | null };
  type: ActivityType;
  actorId: string | null; // null = system
  data: Record<string, unknown>;
}

export const activity = {
  // Writes the timeline row, tells the lead engine a recorded action happened, and notifies connected clients.
  async record(d: DbOrTx, e: ActivityEvent): Promise<void> {
    const [row] = await d
      .insert(activities)
      .values({
        workspaceId: e.workspaceId,
        contactId: e.entity.contactId ?? null,
        opportunityId: e.entity.opportunityId ?? null,
        leadId: e.entity.leadId ?? null,
        type: e.type,
        actorId: e.actorId,
        data: e.data,
      })
      .returning({ id: activities.id });

    const leadIds = new Set<string>();
    if (e.entity.leadId) leadIds.add(e.entity.leadId);
    else if (e.entity.contactId) {
      const open = await d
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.workspaceId, e.workspaceId), eq(leads.contactId, e.entity.contactId), inArray(leads.status, ['assigned', 'acknowledged'])));
      for (const l of open) leadIds.add(l.id);
    }
    for (const leadId of leadIds) await leadHooks.onActivity(d as Tx, { leadId, actorId: e.actorId, type: e.type });

    realtime.publish(e.workspaceId, {
      type: 'activity.created',
      ids: { activityId: row?.id, contactId: e.entity.contactId, opportunityId: e.entity.opportunityId, leadId: e.entity.leadId },
    });
  },
};
