import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { maskValues, requirePermission } from '../../core/rbac/index.js';
import { auditFacets, listAudit } from './service.js';

export const auditRouter = Router();

// GET only: no endpoint edits or deletes history (F4.3).
auditRouter.get('/audit', requirePermission('audit.view'), asyncHandler(async (req, res) => {
  const q = z
    .object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      cursor: z.string().optional(),
      action: z.string().max(80).optional(),
      actorId: z.union([z.string().uuid(), z.literal('system')]).optional(),
      targetType: z.string().max(40).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })
    .parse(req.query);
  res.json(maskValues(await listAudit(req.auth!.workspaceId, q), req.auth!.permissions.has('crm.view_values')));
}));

auditRouter.get('/audit/facets', requirePermission('audit.view'), asyncHandler(async (req, res) => {
  res.json(await auditFacets(req.auth!.workspaceId));
}));
