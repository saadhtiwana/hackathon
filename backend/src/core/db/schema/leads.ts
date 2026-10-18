import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { assignmentReason, leadSource, leadStatus } from './enums.js';
import { createdAt, id, tstz, updatedAt } from './_helpers.js';
import { contacts, opportunities } from './crm.js';
import { users, workspaces } from './workspace.js';

const ws = () => uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' });

// Column names map to leads/domain/types.ts Lead: status=state, owner_id=ownerId, first_ack_at=firstAcknowledgedAt,
// ack_deadline=ackDeadline, owner_away=ownerAway. ownerHistory = owner of each lead_assignments row for the lead.
export const leads = pgTable(
  'leads',
  {
    id: id(),
    workspaceId: ws(),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    source: leadSource('source').notNull(),
    status: leadStatus('status').notNull().default('unassigned'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }), // single owner column (F3.8)
    assignedAt: tstz('assigned_at'),
    ackDeadline: tstz('ack_deadline'),
    acknowledgedAt: tstz('acknowledged_at'),
    firstAssignedAt: tstz('first_assigned_at'),
    firstAckAt: tstz('first_ack_at'),
    escalationLevel: integer('escalation_level').notNull().default(0),
    escalationCount: integer('escalation_count').notNull().default(0),
    lastActionAt: tstz('last_action_at').notNull().defaultNow(),
    ownerAway: boolean('owner_away').notNull().default(false),
    version: integer('version').notNull().default(1),
    closedAt: tstz('closed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('leads_workspace_idx').on(t.workspaceId),
    index('leads_ws_status_idx').on(t.workspaceId, t.status),
    index('leads_owner_status_idx').on(t.ownerId, t.status),
    index('leads_ack_deadline_idx').on(t.ackDeadline).where(sql`${t.status} = 'assigned'`),
    index('leads_contact_idx').on(t.contactId),
  ],
);

export const leadAssignments = pgTable(
  'lead_assignments',
  {
    id: id(),
    workspaceId: ws(),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    assignedAt: tstz('assigned_at').notNull().defaultNow(),
    endedAt: tstz('ended_at'),
    reason: assignmentReason('reason').notNull(),
    endReason: text('end_reason'), // acknowledged | escalated | reassigned | owner_unavailable | closed
    level: integer('level').notNull().default(0),
  },
  (t) => [
    index('lead_assignments_workspace_idx').on(t.workspaceId),
    index('lead_assignments_lead_idx').on(t.leadId, t.assignedAt),
    index('lead_assignments_user_idx').on(t.userId),
    // at most one open assignment per lead
    uniqueIndex('lead_assignments_one_open_uq').on(t.leadId).where(sql`${t.endedAt} is null`),
  ],
);

// escalation_levels item: {kind:'next_eligible'|'backup'|'manager', user_id?:string, seconds:number}; array index+1 = domain level.
export const assignmentRules = pgTable(
  'assignment_rules',
  {
    id: id(),
    workspaceId: ws(),
    ackWindowSeconds: integer('ack_window_seconds').notNull().default(300),
    maxOpenLeads: integer('max_open_leads').notNull().default(20),
    idleSeconds: integer('idle_seconds').notNull().default(86400),
    escalationLevels: jsonb('escalation_levels').notNull().default([]),
    acknowledgedOnLeavePolicy: text('acknowledged_on_leave_policy').notNull().default('keep_flag_recover'),
    rrCursor: uuid('rr_cursor').references(() => users.id, { onDelete: 'set null' }), // user id that received the last lead
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('assignment_rules_workspace_uq').on(t.workspaceId)],
);
