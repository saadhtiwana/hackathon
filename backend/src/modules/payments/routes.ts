import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { requirePermission } from '../../core/rbac/index.js';
import * as svc from './service.js';
import { revenueSummary } from './revenue.js';

const uuid = z.string().uuid();
const status = z.enum(['requested', 'paid', 'expired', 'failed', 'refunded', 'partially_refunded']);

export const paymentsRouter = Router();

// Public, no login: the page Stripe sends customers back to.
paymentsRouter.get('/public/payments/:id', asyncHandler(async (req, res) => {
  const p = await svc.publicPayment(String(req.params.id));
  if (!p) return void res.status(404).json({ error: { code: 'not_found', message: 'Payment not found' } });
  res.json(p);
}));

const createBody = z
  .object({
    amount: z.number().positive().max(1_000_000_000).optional(),
    amountCents: z.number().int().positive().max(100_000_000_000).optional(),
    currency: z.string().length(3).optional(),
    description: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((b) => (b.amount === undefined) !== (b.amountCents === undefined), 'Send either amount or amountCents');

paymentsRouter.post('/opportunities/:id/payments', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = createBody.parse(req.body);
  const amountCents = b.amountCents ?? Math.round(b.amount! * 100);
  res.status(201).json({ payment: await svc.createPaymentRequest(req.auth!, uuid.parse(req.params.id), { amountCents, currency: b.currency, description: b.description }) });
}));

paymentsRouter.get('/payments/summary', requirePermission('crm.view_values'), asyncHandler(async (req, res) => {
  const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
  res.json(await revenueSummary(req.auth!.workspaceId, q));
}));

paymentsRouter.get('/payments', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().optional(), status: status.optional(), opportunityId: uuid.optional(), contactId: uuid.optional() }).parse(req.query);
  res.json(await svc.listPayments(req.auth!.workspaceId, q));
}));

paymentsRouter.get('/payments/:id', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  res.json(await svc.getPayment(req.auth!.workspaceId, uuid.parse(req.params.id)));
}));

paymentsRouter.post('/payments/:id/expire', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  res.json(await svc.expirePayment(req.auth!, uuid.parse(req.params.id)));
}));

paymentsRouter.post('/payments/:id/send', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.sendPaymentLink(req.auth!, uuid.parse(req.params.id)));
}));
