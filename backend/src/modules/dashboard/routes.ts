import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { requireAuth } from '../../core/auth/sessions.js';
import { maskValues } from '../../core/rbac/index.js';
import { FIGURES, dashboard, getPrefs, records, setPrefs } from './service.js';

const scope = z.enum(['me', 'company']).optional();

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const q = z.object({ scope, range: z.enum(['today', 'week', 'month']).optional() }).parse(req.query);
  res.json(maskValues(await dashboard(req.auth!, q.scope, q.range), req.auth!.permissions.has('crm.view_values')));
}));

dashboardRouter.get('/dashboard/records/:figure', requireAuth, asyncHandler(async (req, res) => {
  const q = z.object({ scope, limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
  res.json({ items: await records(req.auth!, String(req.params.figure), q.scope, q.limit) });
}));

dashboardRouter.get('/dashboard/prefs', requireAuth, asyncHandler(async (req, res) => {
  res.json({ ...(await getPrefs(req.auth!.workspaceId, req.auth!.userId)), figures: FIGURES });
}));

dashboardRouter.put('/dashboard/prefs', requireAuth, asyncHandler(async (req, res) => {
  const b = z.object({ hidden: z.array(z.string().max(40)).max(20) }).strict().parse(req.body);
  res.json(await setPrefs(req.auth!.workspaceId, req.auth!.userId, b.hidden));
}));
