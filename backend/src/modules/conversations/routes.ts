import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { requirePermission } from '../../core/rbac/index.js';
import * as svc from './service.js';

const uuid = z.string().uuid();

export const conversationsRouter = Router();

conversationsRouter.get('/conversations', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const q = z.object({ scope: z.enum(['mine', 'unassigned', 'all']).default('mine'), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
  res.json(await svc.listConversations(req.auth!, q));
}));

conversationsRouter.get('/conversations/:id', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100), before: z.coerce.date().optional() }).parse(req.query);
  res.json(await svc.getConversation(req.auth!, uuid.parse(req.params.id), q));
}));

conversationsRouter.post('/conversations/:id/messages', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = z.object({ body: z.string().trim().min(1).max(2000) }).strict().parse(req.body);
  res.status(201).json({ message: await svc.sendMessage(req.auth!, uuid.parse(req.params.id), b.body) });
}));

conversationsRouter.post('/contacts/:id/messages', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = z.object({ body: z.string().trim().min(1).max(2000) }).strict().parse(req.body);
  res.status(201).json({ message: await svc.sendToContact(req.auth!, uuid.parse(req.params.id), b.body) });
}));

conversationsRouter.post('/messages/:id/retry', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  res.status(201).json({ message: await svc.retryMessage(req.auth!, uuid.parse(req.params.id)) });
}));
