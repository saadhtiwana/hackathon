import { bigint, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { paymentStatus } from './enums.js';
import { createdAt, id, tstz, updatedAt } from './_helpers.js';
import { contacts, opportunities } from './crm.js';
import { users, workspaces } from './workspace.js';

export const payments = pgTable(
  'payments',
  {
    id: id(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    providerSessionId: text('provider_session_id'),
    paymentIntentId: text('payment_intent_id'),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    status: paymentStatus('status').notNull().default('requested'),
    refundedCents: bigint('refunded_cents', { mode: 'number' }).notNull().default(0),
    url: text('url'),
    description: text('description'),
    failureReason: text('failure_reason'),
    paidAt: tstz('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payments_workspace_idx').on(t.workspaceId),
    uniqueIndex('payments_session_uq').on(t.providerSessionId),
    index('payments_opportunity_idx').on(t.opportunityId),
    index('payments_contact_idx').on(t.contactId),
  ],
);
