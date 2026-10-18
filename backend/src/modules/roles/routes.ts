import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { requireAuth } from '../../core/auth/sessions.js';
import { PERMISSIONS, requirePermission } from '../../core/rbac/index.js';
import { createRole, deleteRole, listRoles, updateRole } from './service.js';

const name = z.string().trim().min(2).max(60);
const perms = z.array(z.string()).max(50);

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

rolesRouter.get('/permissions', requirePermission('users.manage'), (_req, res) => {
  res.json({ items: PERMISSIONS });
});
rolesRouter.get('/roles', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  res.json({ items: await listRoles(req.auth!.workspaceId) });
}));
rolesRouter.post('/roles', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const body = z.object({ name, baseLevel: z.enum(['admin', 'user']), permissions: perms }).strict().parse(req.body);
  res.status(201).json({ role: await createRole(req.auth!, body) });
}));
rolesRouter.patch('/roles/:id', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const body = z.object({ name: name.optional(), permissions: perms.optional() }).strict().parse(req.body);
  res.json({ role: await updateRole(req.auth!, z.string().uuid().parse(req.params.id), body) });
}));
rolesRouter.delete('/roles/:id', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  await deleteRole(req.auth!, z.string().uuid().parse(req.params.id));
  res.status(204).end();
}));
