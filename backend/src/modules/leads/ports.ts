// Core services the lead engine uses, gathered in one place so tests can swap them for fakes.
import { audit, type AuditEvent } from '../../core/audit/index.js';
import type { Tx } from '../../core/db/client.js';
import { activities } from '../../core/db/schema/index.js';
import { outbox } from '../../core/outbox/index.js';
import { realtime } from '../../core/realtime/index.js';

export type { DbOrTx, Tx } from '../../core/db/client.js';
export type { AuditEvent };

export type ActivityType = (typeof activities.$inferInsert)['type'];

export interface ActivityEvent {
  workspaceId: string;
  entity: { contactId?: string; opportunityId?: string; leadId?: string };
  type: ActivityType;
  actorId: string | null;
  data: Record<string, unknown>;
}

export interface OutboxJobInput {
  workspaceId: string;
  kind: string;
  payload: Record<string, unknown>;
  runAt?: Date;
  maxAttempts?: number;
}

export type LeadEventType =
  | 'lead.created' | 'lead.assigned' | 'lead.acknowledged' | 'lead.escalated' | 'lead.reassigned' | 'lead.closed'
  | 'recovery.changed';

export interface RealtimeEvent {
  type: LeadEventType;
  ids: Record<string, string | null>;
  userIds?: string[];
}

export interface Ports {
  audit: { record(tx: Tx, e: AuditEvent): Promise<void> };
  activity: { record(tx: Tx, e: ActivityEvent): Promise<void> };
  outbox: { enqueue(tx: Tx, job: OutboxJobInput): Promise<string> };
  realtime: { publish(workspaceId: string, event: RealtimeEvent): void };
}

export const ports: Ports = {
  audit,

  // Not core activity.record: that one calls leadHooks.onActivity, and the engine's own timeline rows
  // (assignments, escalations, acknowledgements) must not re-enter the engine mid-transaction.
  activity: {
    async record(tx, e) {
      const [row] = await tx
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
      realtime.publish(e.workspaceId, {
        type: 'activity.created',
        ids: { activityId: row.id, contactId: e.entity.contactId, leadId: e.entity.leadId },
      });
    },
  },

  outbox,

  realtime,
};
