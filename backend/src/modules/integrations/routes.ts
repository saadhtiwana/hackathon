import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { requireAnyPermission, requirePermission } from '../../core/rbac/index.js';
import * as svc from './service.js';

const provider = z.string().min(1).max(40);
const paging = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().optional() });

export const integrationsRouter = Router();

integrationsRouter.get('/integrations', requireAnyPermission('integrations.manage', 'audit.view'), asyncHandler(async (req, res) => {
  res.json({ items: await svc.listIntegrations(req.auth!) });
}));

integrationsRouter.post('/integrations/:provider/connect', requirePermission('integrations.manage'), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.connect(req.auth!, provider.parse(req.params.provider), req.body ?? {}));
}));

integrationsRouter.post('/integrations/:provider/test', requirePermission('integrations.manage'), asyncHandler(async (req, res) => {
  res.json(await svc.testConnection(req.auth!, provider.parse(req.params.provider)));
}));

integrationsRouter.delete('/integrations/:provider', requirePermission('integrations.manage'), asyncHandler(async (req, res) => {
  await svc.disconnect(req.auth!, provider.parse(req.params.provider));
  res.status(204).end();
}));

integrationsRouter.get('/integrations/:provider/events', requireAnyPermission('integrations.manage', 'audit.view'), asyncHandler(async (req, res) => {
  res.json(await svc.syncHistory(req.auth!, provider.parse(req.params.provider), paging.parse(req.query)));
}));
