import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../core/db/client.js';
import { contacts, leads, memberships, users } from '../../../core/db/schema/index.js';
import { audit } from '../../../core/audit/index.js';
import { env } from '../../../core/env.js';
import { asyncHandler, unprocessable } from '../../../core/errors.js';
import { integrationEvents } from '../../../core/integration-events/index.js';
import { outbox, type OutboxJob } from '../../../core/outbox/index.js';
import { requireAuth } from '../../../core/auth/sessions.js';
import { requirePermission } from '../../../core/rbac/index.js';
import { ProviderError } from '../errors.js';
import { agencyAddress } from '../../conversations/email.js';
import { listAlerts } from '../discord/alerts.js';
import { profile, sendEmail } from './gmail.js';
import { mailboxStore } from './tokens.js';

const KIND_TEXT: Record<string, string> = { next_eligible: 'passed to the next available teammate', backup: 'passed to the designated backup', manager: 'passed to a manager' };

type Type = 'alert.escalation' | 'alert.lead_assigned';

// Emails the target from the agency mailbox. Temporary failures throw so the outbox retries with backoff, max 5 (I4.4).
async function emailAlert(job: OutboxJob, type: Type) {
  const p = job.payload as { leadId: string; toUserId: string; source?: string; reason?: string; level?: number; kind?: string; linkPath?: string };
  const ws = job.workspaceId;
  const record = (result: 'ok' | 'error', error?: string, ref?: string) => integrationEvents.recordOutbound({ workspaceId: ws, provider: 'gmail', type, result, error, ref: ref ?? `${p.leadId}:${p.toUserId}` });

  const [m] = await db.select({ alertEmail: memberships.alertEmail, esc: memberships.notifyOnEscalation, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.workspaceId, ws), eq(memberships.userId, p.toUserId)));
  if (!m) return void (await record('error', 'not delivered: recipient is not in the workspace'));
  if (type === 'alert.escalation' && !m.esc) return void (await record('error', 'not delivered: the recipient turned escalation alerts off'));
  const to = m.alertEmail ?? m.email;

  const [row] = await db.select({ name: contacts.name, source: leads.source }).from(leads).innerJoin(contacts, eq(contacts.id, leads.contactId)).where(and(eq(leads.workspaceId, ws), eq(leads.id, p.leadId)));
  const name = row?.name ?? 'A lead';
  const source = p.source ?? row?.source ?? 'unknown';
  const link = `${env.APP_URL.replace(/\/$/, '')}${p.linkPath ?? `/leads/${p.leadId}`}`;
  const subject = type === 'alert.escalation' ? `Lead escalated to you: ${name}` : `New lead assigned to you: ${name}`;
  const why = p.reason === 'ack_expired' ? 'the acknowledgement window ran out' : (p.reason ?? 'escalated');
  const body =
    type === 'alert.escalation'
      ? [`Lead: ${name}`, `Source: ${source}`, `Reason: ${why}${p.kind ? `, ${KIND_TEXT[p.kind] ?? p.kind}` : ''}`, ...(p.level ? [`Level: ${p.level}`] : []), '', `Open the lead: ${link}`].join('\n')
      : [`Lead: ${name}`, `Source: ${source}`, '', `Acknowledge it before the window runs out: ${link}`].join('\n');

  const store = mailboxStore(ws);
  try {
    const tokens = await store.load();
    if (!tokens) return void (await record('error', 'not delivered: the agency mailbox is not connected'));
    const from = tokens.email ?? (await profile(store)).emailAddress;
    const reply = await agencyAddress(ws);
    const sent = await sendEmail(store, { from, to, subject, body, replyTo: reply });
    await record('ok', undefined, sent.id);
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError('Unexpected problem sending the alert', true, 'unexpected');
    await record('error', `${pe.message} (attempt ${job.attempts} of ${job.maxAttempts})`, `${p.leadId}:${p.toUserId}`);
    if (pe.temporary && job.attempts < job.maxAttempts) throw pe;
  }
}

// Alerts go out by email from the agency mailbox.
outbox.registerHandler('notify.escalation', (job) => emailAlert(job, 'alert.escalation'));
outbox.registerHandler('notify.lead_assigned', (job) => emailAlert(job, 'alert.lead_assigned'));

export const notificationsRouter = Router();

notificationsRouter.get('/integrations/email/alerts', requirePermission('integrations.manage'), asyncHandler(async (req, res) => {
  res.json({ items: await listAlerts(req.auth!.workspaceId, 'gmail') });
}));

notificationsRouter.get('/me/notifications', requireAuth, asyncHandler(async (req, res) => {
  const [m] = await db.select({ alertEmail: memberships.alertEmail, esc: memberships.notifyOnEscalation, msg: memberships.notifyOnMessage, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, req.auth!.membershipId));
  res.json({ alertEmail: m?.alertEmail ?? null, effectiveEmail: m?.alertEmail ?? m?.email, notifyOnEscalation: m?.esc ?? true, notifyOnMessage: m?.msg ?? false });
}));

notificationsRouter.put('/me/notifications', requireAuth, asyncHandler(async (req, res) => {
  const b = z.object({ alertEmail: z.string().trim().toLowerCase().email().max(200).nullable().optional(), notifyOnEscalation: z.boolean().optional(), notifyOnMessage: z.boolean().optional() }).strict().parse(req.body);
  if (!Object.keys(b).length) throw unprocessable('Nothing to update');
  const set: Partial<typeof memberships.$inferInsert> = {};
  if (b.alertEmail !== undefined) set.alertEmail = b.alertEmail;
  if (b.notifyOnEscalation !== undefined) set.notifyOnEscalation = b.notifyOnEscalation;
  if (b.notifyOnMessage !== undefined) set.notifyOnMessage = b.notifyOnMessage;
  await db.transaction(async (tx) => {
    await tx.update(memberships).set(set).where(eq(memberships.id, req.auth!.membershipId));
    await audit.record(tx, { workspaceId: req.auth!.workspaceId, actorId: req.auth!.userId, action: 'notifications.updated', targetType: 'user', targetId: req.auth!.userId, after: b });
  });
  res.json({ ok: true });
}));
