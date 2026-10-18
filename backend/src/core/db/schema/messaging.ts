import { type AnyPgColumn, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { messageDirection, messageStatus } from './enums.js';
import { createdAt, id, tstz } from './_helpers.js';
import { contacts, opportunities } from './crm.js';
import { users, workspaces } from './workspace.js';

const ws = () => uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' });

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    workspaceId: ws(),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    channel: text('channel').notNull().default('whatsapp'),
    lastMessageAt: tstz('last_message_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('conversations_workspace_idx').on(t.workspaceId),
    uniqueIndex('conversations_contact_channel_uq').on(t.workspaceId, t.contactId, t.channel),
    index('conversations_owner_idx').on(t.ownerId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    workspaceId: ws(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    providerSid: text('provider_sid'),
    direction: messageDirection('direction').notNull(),
    body: text('body').notNull(),
    status: messageStatus('status').notNull().default('queued'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    retryOf: uuid('retry_of').references((): AnyPgColumn => messages.id, { onDelete: 'set null' }),
    attempts: integer('attempts').notNull().default(0),
    sentBy: uuid('sent_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('messages_workspace_idx').on(t.workspaceId),
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    uniqueIndex('messages_provider_sid_uq').on(t.providerSid),
  ],
);
