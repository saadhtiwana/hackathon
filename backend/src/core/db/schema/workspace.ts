import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { availability, baseLevel } from './enums.js';
import { createdAt, id, tstz, updatedAt } from './_helpers.js';

export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  timezone: text('timezone').notNull().default('UTC'),
  defaultCurrency: text('default_currency').notNull().default('USD'),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
});

export const roles = pgTable(
  'roles',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseLevel: baseLevel('base_level').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('roles_workspace_idx').on(t.workspaceId), uniqueIndex('roles_ws_name_uq').on(t.workspaceId, t.name)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] }), index('role_permissions_workspace_idx').on(t.workspaceId)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'restrict' }),
    availability: availability('availability').notNull().default('available'),
    availabilityChangedAt: tstz('availability_changed_at'),
    telegramChatId: text('telegram_chat_id'),
    discordUserId: text('discord_user_id'),
    alertEmail: text('alert_email'),
    notifyOnEscalation: boolean('notify_on_escalation').notNull().default(true),
    notifyOnMessage: boolean('notify_on_message').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('memberships_workspace_idx').on(t.workspaceId),
    uniqueIndex('memberships_ws_user_uq').on(t.workspaceId, t.userId),
    uniqueIndex('memberships_ws_discord_uq').on(t.workspaceId, t.discordUserId).where(sql`${t.discordUserId} is not null`),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    csrfToken: text('csrf_token').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_workspace_idx').on(t.workspaceId), index('sessions_user_idx').on(t.userId)],
);

export const invites = pgTable(
  'invites',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: tstz('expires_at').notNull(),
    acceptedAt: tstz('accepted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('invites_workspace_idx').on(t.workspaceId)],
);

// Pre-auth table: no workspace yet at login time.
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: id(),
    email: text('email').notNull(),
    ip: text('ip'),
    success: boolean('success').notNull(),
    attempts: integer('attempts').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index('login_attempts_email_idx').on(t.email, t.createdAt)],
);

export { updatedAt };
