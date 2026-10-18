import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../core/db/client.js';
import { asyncHandler } from '../../core/errors.js';
import { requireAuth } from '../../core/auth/sessions.js';
import { requirePermission } from '../../core/rbac/index.js';
import { getWorkspace, updateWorkspace } from './service.js';

const tz = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, 'Unknown time zone');

const patch = z
  .object({ name: z.string().trim().min(2).max(80), timezone: tz, defaultCurrency: z.string().length(3).toUpperCase() })
  .partial()
  .strict();

export const workspaceRouter = Router();

workspaceRouter.get(
  '/workspace',
  requireAuth,
  asyncHandler(async (req, res) => {
    const w = await getWorkspace(db, req.auth!.workspaceId);
    res.json({ workspace: { id: w.id, name: w.name, slug: w.slug, timezone: w.timezone, defaultCurrency: w.defaultCurrency } });
  }),
);

workspaceRouter.patch(
  '/workspace',
  requirePermission('settings.manage'),
  asyncHandler(async (req, res) => {
    const body = patch.parse(req.body);
    const w = await db.transaction((tx) => updateWorkspace(tx, req.auth!.userId, req.auth!.workspaceId, body));
    res.json({ workspace: { id: w.id, name: w.name, slug: w.slug, timezone: w.timezone, defaultCurrency: w.defaultCurrency } });
  }),
);
