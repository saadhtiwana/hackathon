import { index, jsonb, pgTable, uuid } from 'drizzle-orm/pg-core';
import { activityType } from './enums.js';
import { createdAt, id } from './_helpers.js';
import { contacts, opportunities } from './crm.js';
import { leads } from './leads.js';
import { users, workspaces } from './workspace.js';

export const activities = pgTable(
  'activities',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    type: activityType('type').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }), // null = system
    data: jsonb('data').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('activities_workspace_idx').on(t.workspaceId),
    index('activities_contact_idx').on(t.contactId, t.createdAt),
    index('activities_opportunity_idx').on(t.opportunityId, t.createdAt),
    index('activities_lead_idx').on(t.leadId, t.createdAt),
  ],
);
