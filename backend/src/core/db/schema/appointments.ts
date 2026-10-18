import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { appointmentStatus } from './enums.js';
import { createdAt, id, tstz, updatedAt } from './_helpers.js';
import { contacts, opportunities } from './crm.js';
import { users, workspaces } from './workspace.js';

export const appointments = pgTable(
  'appointments',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    googleEventId: text('google_event_id'),
    title: text('title').notNull(),
    notes: text('notes'),
    startsAt: tstz('starts_at').notNull(),
    endsAt: tstz('ends_at').notNull(),
    timezone: text('timezone').notNull(), // IANA name; instants are stored as timestamptz (UTC)
    status: appointmentStatus('status').notNull().default('scheduled'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('appointments_workspace_idx').on(t.workspaceId),
    index('appointments_user_time_idx').on(t.userId, t.startsAt),
    index('appointments_contact_idx').on(t.contactId),
  ],
);
