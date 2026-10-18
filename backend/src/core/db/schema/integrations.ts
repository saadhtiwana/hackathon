import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { connectionStatus, eventDirection, outboxStatus, provider } from './enums.js';
import { createdAt, id, tstz, updatedAt } from './_helpers.js';
import { users, workspaces } from './workspace.js';

const ws = () => uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' });

export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: id(),
    workspaceId: ws(),
    provider: provider('provider').notNull(),
    status: connectionStatus('status').notNull().default('not_connected'),
    encryptedConfig: text('encrypted_config'), // AES-GCM envelope, never returned to clients
    secretLast4: text('secret_last4'),
    lastOkAt: tstz('last_ok_at'),
    lastErrorAt: tstz('last_error_at'),
    lastError: text('last_error'),
    updatedAt: updatedAt(),
  },
  (t) => [index('integration_connections_workspace_idx').on(t.workspaceId), uniqueIndex('integration_connections_ws_provider_uq').on(t.workspaceId, t.provider)],
);

export const userConnections = pgTable(
  'user_connections',
  {
    id: id(),
    workspaceId: ws(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: provider('provider').notNull(), // google | telegram
    encryptedTokens: text('encrypted_tokens'),
    externalAccount: text('external_account'),
    status: connectionStatus('status').notNull().default('connected'),
    needsReconnect: boolean('needs_reconnect').notNull().default(false),
    tokenExpiresAt: tstz('token_expires_at'),
    updatedAt: updatedAt(),
  },
  (t) => [index('user_connections_workspace_idx').on(t.workspaceId), uniqueIndex('user_connections_user_provider_uq').on(t.userId, t.provider)],
);

export const integrationEvents = pgTable(
  'integration_events',
  {
    id: id(),
    workspaceId: ws(),
    direction: eventDirection('direction').notNull(),
    provider: provider('provider').notNull(),
    type: text('type').notNull(),
    externalId: text('external_id'),
    result: text('result').notNull(), // ok | rejected | duplicate | error
    httpStatus: integer('http_status'),
    error: text('error'),
    ref: text('ref'),
    createdAt: createdAt(),
  },
  (t) => [
    index('integration_events_workspace_idx').on(t.workspaceId, t.createdAt),
    // dedupe key for inbound events; outbound rows may omit external_id
    uniqueIndex('integration_events_dedupe_uq').on(t.provider, t.workspaceId, t.externalId).where(sql`${t.direction} = 'in' and ${t.externalId} is not null`),
  ],
);

export const outboxJobs = pgTable(
  'outbox_jobs',
  {
    id: id(),
    workspaceId: ws(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAt: tstz('run_at').notNull().defaultNow(),
    lastError: text('last_error'),
    lockedAt: tstz('locked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('outbox_jobs_workspace_idx').on(t.workspaceId),
    index('outbox_jobs_due_idx').on(t.runAt).where(sql`${t.status} = 'pending'`),
  ],
);

// One-time codes an employee types as /link <code> in the staff Discord server (I4.3).
export const discordLinkCodes = pgTable(
  'discord_link_codes',
  {
    id: id(),
    workspaceId: ws(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    usedAt: tstz('used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('discord_link_codes_workspace_idx').on(t.workspaceId)],
);
