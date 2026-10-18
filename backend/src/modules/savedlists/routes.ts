import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { maskValues, requirePermission } from '../../core/rbac/index.js';
import { criteria, createSaved, deleteSaved, evaluate, listSaved, resultsFor, schemaFor, updateSaved } from './service.js';

const uuid = z.string().uuid();
const entity = z.enum(['contacts', 'opportunities']);
const paging = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().optional() });

export const savedListsRouter = Router();

savedListsRouter.get('/saved-lists', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json({ items: await listSaved(req.auth!.workspaceId) });
}));

savedListsRouter.get('/saved-lists/schema', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json(await schemaFor(req.auth!.workspaceId, req.auth!));
}));

// Evaluate criteria without saving, for the filter bar's live preview.
savedListsRouter.post('/saved-lists/preview', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const b = z.object({ entity, criteria }).merge(paging).strict().parse(req.body);
  res.json(maskValues(await evaluate(req.auth!, b.entity, b.criteria, b), req.auth!.permissions.has('crm.view_values')));
}));

savedListsRouter.post('/saved-lists', requirePermission('crm.create'), asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(80), entity, criteria }).strict().parse(req.body);
  res.status(201).json({ list: await createSaved(req.auth!, b) });
}));

savedListsRouter.patch('/saved-lists/:id', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(80).optional(), criteria: criteria.optional() }).strict().parse(req.body);
  res.json({ list: await updateSaved(req.auth!, uuid.parse(req.params.id), b) });
}));

savedListsRouter.delete('/saved-lists/:id', requirePermission('crm.delete'), asyncHandler(async (req, res) => {
  await deleteSaved(req.auth!, uuid.parse(req.params.id));
  res.status(204).end();
}));

savedListsRouter.get('/saved-lists/:id/results', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json(maskValues(await resultsFor(req.auth!, uuid.parse(req.params.id), paging.parse(req.query)), req.auth!.permissions.has('crm.view_values')));
}));
