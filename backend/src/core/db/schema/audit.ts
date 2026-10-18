import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from './_helpers.js';
import { users, workspaces } from './workspace.js';

// Append-only: migration installs a trigger that raises on UPDATE and DELETE.
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }), // null = system
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_workspace_idx').on(t.workspaceId, t.createdAt),
    index('audit_log_action_idx').on(t.workspaceId, t.action),
    index('audit_log_actor_idx').on(t.workspaceId, t.actorId),
  ],
);

export const dashboardPrefs = pgTable(
  'dashboard_prefs',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    hidden: jsonb('hidden').notNull().default([]),
  },
  (t) => [index('dashboard_prefs_workspace_idx').on(t.workspaceId), uniqueIndex('dashboard_prefs_user_uq').on(t.workspaceId, t.userId)],
);
