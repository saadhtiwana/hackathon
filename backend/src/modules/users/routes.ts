import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { requireAuth } from '../../core/auth/sessions.js';
import { requireAnyPermission, requirePermission } from '../../core/rbac/index.js';
import { availabilityBoard, createInvite, listInvites, listMembers, revokeInvite, setAvailability, updateMember } from './service.js';

const status = z.enum(['available', 'busy', 'on_leave', 'offline']);
const uuid = z.string().uuid();

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/users', requireAnyPermission('users.manage', 'leads.reassign'), asyncHandler(async (req, res) => {
  res.json({ items: await listMembers(req.auth!.workspaceId) });
}));

usersRouter.post('/users/invites', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const body = z.object({ email: z.string().trim().toLowerCase().email(), roleId: uuid }).strict().parse(req.body);
  res.status(201).json(await createInvite(req.auth!, body));
}));

usersRouter.get('/users/invites', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  res.json({ items: await listInvites(req.auth!.workspaceId) });
}));

usersRouter.delete('/users/invites/:id', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  await revokeInvite(req.auth!, uuid.parse(req.params.id));
  res.status(204).end();
}));

usersRouter.patch('/users/:id', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const body = z.object({ roleId: uuid.optional(), active: z.boolean().optional() }).strict().parse(req.body);
  await updateMember(req.auth!, uuid.parse(req.params.id), body);
  res.json({ items: await listMembers(req.auth!.workspaceId) });
}));

usersRouter.put('/me/availability', asyncHandler(async (req, res) => {
  const { status: s } = z.object({ status }).strict().parse(req.body);
  res.json(await setAvailability(req.auth!, req.auth!.userId, s));
}));

usersRouter.put('/users/:id/availability', asyncHandler(async (req, res) => {
  const { status: s } = z.object({ status }).strict().parse(req.body);
  res.json(await setAvailability(req.auth!, uuid.parse(req.params.id), s));
}));

usersRouter.get('/availability', asyncHandler(async (req, res) => {
  res.json({ items: await availabilityBoard(req.auth!.workspaceId) });
}));
