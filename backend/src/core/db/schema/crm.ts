import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { customFieldEntity, customFieldType } from './enums.js';
import { createdAt, id, updatedAt } from './_helpers.js';
import { users, workspaces } from './workspace.js';

const ws = () => uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' });

export const companies = pgTable(
  'companies',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    domain: text('domain'),
    phone: text('phone'),
    address: text('address'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('companies_workspace_idx').on(t.workspaceId)],
);

export const contacts = pgTable(
  'contacts',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    phone: text('phone'), // E.164
    email: text('email'),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    optedOut: boolean('opted_out').notNull().default(false),
    optOutReason: text('opt_out_reason'),
    custom: jsonb('custom').notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('contacts_workspace_idx').on(t.workspaceId),
    uniqueIndex('contacts_ws_phone_uq').on(t.workspaceId, t.phone).where(sql`${t.phone} is not null`),
    index('contacts_company_idx').on(t.companyId),
    index('contacts_owner_idx').on(t.ownerId),
  ],
);

export const tags = pgTable(
  'tags',
  { id: id(), workspaceId: ws(), name: text('name').notNull(), createdAt: createdAt() },
  (t) => [index('tags_workspace_idx').on(t.workspaceId), uniqueIndex('tags_ws_name_uq').on(t.workspaceId, t.name)],
);

export const contactTags = pgTable(
  'contact_tags',
  {
    workspaceId: ws(),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.tagId] }), index('contact_tags_workspace_idx').on(t.workspaceId)],
);

export const pipelines = pgTable(
  'pipelines',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('pipelines_workspace_idx').on(t.workspaceId)],
);

export const stages = pgTable(
  'stages',
  {
    id: id(),
    workspaceId: ws(),
    pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    isWon: boolean('is_won').notNull().default(false),
    isLost: boolean('is_lost').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('stages_workspace_idx').on(t.workspaceId), index('stages_pipeline_pos_idx').on(t.pipelineId, t.position)],
);

export const customFields = pgTable(
  'custom_fields',
  {
    id: id(),
    workspaceId: ws(),
    entity: customFieldEntity('entity').notNull(),
    pipelineId: uuid('pipeline_id').references(() => pipelines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: customFieldType('type').notNull(),
    options: jsonb('options'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('custom_fields_workspace_idx').on(t.workspaceId), index('custom_fields_pipeline_idx').on(t.pipelineId)],
);

export const stageRequiredFields = pgTable(
  'stage_required_fields',
  {
    workspaceId: ws(),
    stageId: uuid('stage_id').notNull().references(() => stages.id, { onDelete: 'cascade' }),
    fieldId: uuid('field_id').notNull().references(() => customFields.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.stageId, t.fieldId] }), index('stage_required_fields_workspace_idx').on(t.workspaceId)],
);

export const opportunities = pgTable(
  'opportunities',
  {
    id: id(),
    workspaceId: ws(),
    pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'restrict' }),
    stageId: uuid('stage_id').notNull().references(() => stages.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    valueCents: bigint('value_cents', { mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('USD'),
    custom: jsonb('custom').notNull().default({}),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('opportunities_workspace_idx').on(t.workspaceId),
    index('opportunities_stage_idx').on(t.stageId),
    index('opportunities_contact_idx').on(t.contactId),
    index('opportunities_owner_idx').on(t.ownerId),
  ],
);

export const savedLists = pgTable(
  'saved_lists',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    entity: customFieldEntity('entity').notNull(),
    criteria: jsonb('criteria').notNull().default([]),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('saved_lists_workspace_idx').on(t.workspaceId)],
);
