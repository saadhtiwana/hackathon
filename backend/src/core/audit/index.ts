import { auditLog } from '../db/schema/index.js';
import type { DbOrTx } from '../db/client.js';

export interface AuditEvent {
  workspaceId: string;
  actorId: string | null; // null = system
  action: string;
  targetType: string;
  targetId: string | null;
  before?: unknown;
  after?: unknown;
}

export const audit = {
  async record(d: DbOrTx, e: AuditEvent): Promise<void> {
    await d.insert(auditLog).values({
      workspaceId: e.workspaceId,
      actorId: e.actorId,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      before: e.before ?? null,
      after: e.after ?? null,
    });
  },
};
