import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { audit } from '../../core/audit/index.js';
import { db } from '../../core/db/client.js';
import { listQuery } from '../../core/http/list.js';
import { maskValues, requirePermission } from '../../core/rbac/index.js';
import * as svc from './service.js';
import { normalizePhone } from './phone.js';
import { toCsv } from './shared.js';

const uuid = z.string().uuid();
const version = z.number().int().min(1);
const custom = z.record(z.string(), z.unknown());
const phone = z.string().trim().min(1).max(30).transform(normalizePhone);
const optStr = (n: number) => z.string().trim().max(n).transform((s) => s || null).nullable().optional();
const id = (req: { params: Record<string, string | string[] | undefined> }) => uuid.parse(req.params.id);

const contactFilters = listQuery.extend({
  ownerId: uuid.optional(),
  companyId: uuid.optional(),
  tagId: uuid.optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
});
const oppFilters = listQuery.extend({ pipelineId: uuid.optional(), stageId: uuid.optional(), ownerId: uuid.optional(), contactId: uuid.optional() });

export const crmRouter = Router();

const csv = (res: import('express').Response, name: string, body: string) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(body);
};

// ---- contacts ----
crmRouter.get('/contacts', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json(await svc.listContacts(req.auth!.workspaceId, contactFilters.parse(req.query)));
}));

crmRouter.get('/contacts/export', requirePermission('crm.export'), asyncHandler(async (req, res) => {
  const a = req.auth!;
  const rows = await svc.exportContacts(a.workspaceId, { ...contactFilters.parse(req.query), limit: 5000 });
  await db.transaction((tx) => audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'export.contacts', targetType: 'contact', targetId: null, after: { rows: rows.length } }));
  csv(res, 'contacts.csv', toCsv(['name', 'phone', 'email', 'companyName', 'ownerName', 'optedOut', 'createdAt'], rows));
}));

crmRouter.post('/contacts', requirePermission('crm.create'), asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().trim().min(1).max(120), phone: phone.nullable().optional(), email: z.string().trim().toLowerCase().email().max(200).nullable().optional(), companyId: uuid.nullable().optional(), ownerId: uuid.nullable().optional(), custom: custom.optional() }).strict().parse(req.body);
  res.status(201).json({ contact: await svc.createContact(req.auth!, body) });
}));

crmRouter.get('/contacts/:id', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const d = await svc.getContact(req.auth!.workspaceId, id(req));
  res.json(maskValues(d, req.auth!.permissions.has('crm.view_values')));
}));

crmRouter.patch('/contacts/:id', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const { version: v, ...patch } = z.object({ version, name: z.string().trim().min(1).max(120).optional(), phone: phone.nullable().optional(), email: z.string().trim().toLowerCase().email().max(200).nullable().optional(), companyId: uuid.nullable().optional(), ownerId: uuid.nullable().optional(), custom: custom.optional() }).strict().parse(req.body);
  res.json({ contact: await svc.updateContact(req.auth!, id(req), v, patch) });
}));

crmRouter.put('/contacts/:id/opt-out', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = z.object({ optedOut: z.boolean(), reason: z.string().trim().max(300).optional() }).strict().parse(req.body);
  res.json({ contact: await svc.setOptOut(req.auth!, id(req), b.optedOut, b.reason) });
}));

crmRouter.delete('/contacts/:id', requirePermission('crm.delete'), asyncHandler(async (req, res) => {
  await svc.deleteContact(req.auth!, id(req));
  res.status(204).end();
}));

crmRouter.put('/contacts/:id/tags', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = z.object({ tagIds: z.array(uuid).max(50) }).strict().parse(req.body);
  res.json({ tags: await svc.setContactTags(req.auth!, id(req), b.tagIds) });
}));

crmRouter.get('/tags', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json({ items: await svc.listTags(req.auth!.workspaceId) });
}));
crmRouter.post('/tags', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(40) }).strict().parse(req.body);
  res.status(201).json({ tag: await svc.createTag(req.auth!, b.name) });
}));

// ---- companies ----
const companyFields = { name: z.string().trim().min(1).max(120), domain: optStr(120), phone: optStr(30), address: optStr(300) };

crmRouter.get('/companies', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json(await svc.listCompanies(req.auth!.workspaceId, listQuery.parse(req.query)));
}));
crmRouter.post('/companies', requirePermission('crm.create'), asyncHandler(async (req, res) => {
  res.status(201).json({ company: await svc.createCompany(req.auth!, z.object(companyFields).strict().parse(req.body)) });
}));
crmRouter.get('/companies/:id', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json(maskValues(await svc.getCompany(req.auth!.workspaceId, id(req)), canValues(req)));
}));
crmRouter.patch('/companies/:id', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const { version: v, ...patch } = z.object({ version, ...companyFields, name: companyFields.name.optional() }).strict().parse(req.body);
  res.json({ company: await svc.updateCompany(req.auth!, id(req), v, patch) });
}));
crmRouter.delete('/companies/:id', requirePermission('crm.delete'), asyncHandler(async (req, res) => {
  await svc.deleteCompany(req.auth!, id(req));
  res.status(204).end();
}));

// ---- opportunities ----
const money = z.number().int().min(0).max(1_000_000_000_000);
const currency = z.string().length(3).toUpperCase();
const canValues = (req: import('express').Request) => req.auth!.permissions.has('crm.view_values');

crmRouter.get('/opportunities', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json(maskValues(await svc.listOpportunities(req.auth!, oppFilters.parse(req.query)), canValues(req)));
}));

crmRouter.get('/opportunities/export', requirePermission('crm.export'), asyncHandler(async (req, res) => {
  const a = req.auth!;
  const rows = await svc.exportOpportunities(a.workspaceId, { ...oppFilters.parse(req.query), limit: 5000 });
  await db.transaction((tx) => audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'export.opportunities', targetType: 'opportunity', targetId: null, after: { rows: rows.length } }));
  const cols = ['name', 'stageName', 'contactName', 'ownerName', ...(canValues(req) ? ['valueCents', 'currency'] : []), 'createdAt'];
  csv(res, 'opportunities.csv', toCsv(cols, rows));
}));

crmRouter.post('/opportunities', requirePermission('crm.create'), asyncHandler(async (req, res) => {
  const b = z.object({ pipelineId: uuid, stageId: uuid.optional(), contactId: uuid, name: z.string().trim().min(1).max(160), valueCents: money.optional(), currency: currency.optional(), ownerId: uuid.nullable().optional(), custom: custom.optional() }).strict().parse(req.body);
  res.status(201).json(maskValues({ opportunity: await svc.createOpportunity(req.auth!, b) }, canValues(req)));
}));

crmRouter.get('/opportunities/:id', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json(maskValues(await svc.getOpportunity(req.auth!.workspaceId, id(req)), canValues(req)));
}));

crmRouter.patch('/opportunities/:id', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const { version: v, ...patch } = z.object({ version, name: z.string().trim().min(1).max(160).optional(), valueCents: money.optional(), currency: currency.optional(), ownerId: uuid.nullable().optional(), custom: custom.optional() }).strict().parse(req.body);
  res.json(maskValues({ opportunity: await svc.updateOpportunity(req.auth!, id(req), v, patch) }, canValues(req)));
}));

crmRouter.post('/opportunities/:id/move', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = z.object({ stageId: uuid, version, custom: custom.optional() }).strict().parse(req.body);
  res.json(maskValues({ opportunity: await svc.moveOpportunity(req.auth!, id(req), b.version, b.stageId, b.custom) }, canValues(req)));
}));

crmRouter.delete('/opportunities/:id', requirePermission('crm.delete'), asyncHandler(async (req, res) => {
  await svc.deleteOpportunity(req.auth!, id(req));
  res.status(204).end();
}));

// ---- pipelines and stages ----
crmRouter.get('/pipelines', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json({ items: await svc.listPipelines(req.auth!.workspaceId) });
}));
crmRouter.post('/pipelines', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(80) }).strict().parse(req.body);
  res.status(201).json({ pipeline: await svc.createPipeline(req.auth!, b.name) });
}));
crmRouter.patch('/pipelines/:id', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(80).optional(), isDefault: z.boolean().optional() }).strict().parse(req.body);
  res.json({ pipeline: await svc.updatePipeline(req.auth!, id(req), b) });
}));
crmRouter.delete('/pipelines/:id', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  await svc.deletePipeline(req.auth!, id(req));
  res.status(204).end();
}));
crmRouter.post('/pipelines/:id/stages', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(60), isWon: z.boolean().optional(), isLost: z.boolean().optional(), position: z.number().int().min(0).optional() }).strict().parse(req.body);
  res.status(201).json({ stage: await svc.addStage(req.auth!, id(req), b) });
}));
crmRouter.put('/pipelines/:id/stages/order', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const b = z.object({ stageIds: z.array(uuid).min(1).max(50) }).strict().parse(req.body);
  res.json({ stages: await svc.reorderStages(req.auth!, id(req), b.stageIds) });
}));
crmRouter.patch('/stages/:id', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(60).optional(), isWon: z.boolean().optional(), isLost: z.boolean().optional() }).strict().parse(req.body);
  res.json({ stage: await svc.updateStage(req.auth!, id(req), b) });
}));
crmRouter.delete('/stages/:id', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const q = z.object({ moveTo: uuid.optional() }).parse(req.query);
  await svc.deleteStage(req.auth!, id(req), q.moveTo);
  res.status(204).end();
}));

const fieldType = z.enum(['text', 'number', 'date', 'dropdown', 'checkbox']);
const entity = z.enum(['contact', 'opportunity']);

crmRouter.get('/custom-fields', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const q = z.object({ entity, pipelineId: uuid.optional() }).parse(req.query);
  res.json({ items: await svc.listFields(req.auth!.workspaceId, q.entity, q.pipelineId) });
}));
crmRouter.post('/custom-fields', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const b = z.object({ entity, pipelineId: uuid.nullable().optional(), name: z.string().trim().min(1).max(80), type: fieldType, options: z.array(z.string().trim().min(1).max(80)).max(30).optional() }).strict().parse(req.body);
  res.status(201).json({ field: await svc.createField(req.auth!, b) });
}));
crmRouter.patch('/custom-fields/:id', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(80).optional(), options: z.array(z.string().trim().min(1).max(80)).max(30).optional() }).strict().parse(req.body);
  res.json({ field: await svc.updateField(req.auth!, id(req), b) });
}));
crmRouter.delete('/custom-fields/:id', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  await svc.deleteField(req.auth!, id(req));
  res.status(204).end();
}));
crmRouter.put('/stages/:id/required-fields', requirePermission('settings.manage'), asyncHandler(async (req, res) => {
  const b = z.object({ fieldIds: z.array(uuid).max(30) }).strict().parse(req.body);
  res.json({ fieldIds: await svc.setRequiredFields(req.auth!, id(req), b.fieldIds) });
}));
crmRouter.post('/activities/notes', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = z.object({ contactId: uuid.optional(), opportunityId: uuid.optional(), leadId: uuid.optional(), body: z.string().trim().min(1).max(4000) }).strict().parse(req.body);
  res.status(201).json({ activity: await svc.addNote(req.auth!, b) });
}));
