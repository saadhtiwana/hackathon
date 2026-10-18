import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, unprocessable } from '../../core/errors.js';
import { requirePermission } from '../../core/rbac/index.js';
import * as svc from './service.js';

const uuid = z.string().uuid();
const tz = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, 'Unknown IANA time zone');

const create = z
  .object({ userId: uuid, contactId: uuid, opportunityId: uuid.optional(), start: z.coerce.date(), end: z.coerce.date(), timeZone: tz, title: z.string().trim().min(1).max(160), notes: z.string().trim().max(2000).optional(), force: z.boolean().optional() })
  .strict()
  .refine((b) => b.end > b.start, { message: 'The end must be after the start', path: ['end'] });

export const appointmentsRouter = Router();

appointmentsRouter.get('/users/:id/busy', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
  if (q.to <= q.from || +q.to - +q.from > 31 * 86400_000) throw unprocessable('Use a range of up to 31 days', undefined, 'invalid_range');
  res.json(await svc.busyTimes(req.auth!, uuid.parse(req.params.id), q.from, q.to));
}));

appointmentsRouter.get('/appointments', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const q = z.object({ userId: uuid.optional(), contactId: uuid.optional(), opportunityId: uuid.optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), includeCancelled: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
  res.json(await svc.listAppointments(req.auth!.workspaceId, q));
}));

appointmentsRouter.post('/appointments', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  res.status(201).json({ appointment: await svc.createAppointment(req.auth!, create.parse(req.body)) });
}));

appointmentsRouter.patch('/appointments/:id', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  const b = z.object({ start: z.coerce.date().optional(), end: z.coerce.date().optional(), timeZone: tz.optional(), title: z.string().trim().min(1).max(160).optional(), notes: z.string().trim().max(2000).optional(), force: z.boolean().optional() }).strict().parse(req.body);
  res.json({ appointment: await svc.updateAppointment(req.auth!, uuid.parse(req.params.id), b) });
}));

appointmentsRouter.delete('/appointments/:id', requirePermission('crm.edit'), asyncHandler(async (req, res) => {
  res.json({ appointment: await svc.cancelAppointment(req.auth!, uuid.parse(req.params.id)) });
}));
