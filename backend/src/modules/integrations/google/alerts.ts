import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../core/db/client.js';
import { contacts, leads, memberships, users, workspaces } from '../../../core/db/schema/index.js';
import { audit } from '../../../core/audit/index.js';
import { env } from '../../../core/env.js';
import { asyncHandler, unprocessable } from '../../../core/errors.js';
import { integrationEvents } from '../../../core/integration-events/index.js';
import { outbox, type OutboxJob } from '../../../core/outbox/index.js';
import { requireAuth } from '../../../core/auth/sessions.js';
import { requirePermission } from '../../../core/rbac/index.js';
import { ProviderError } from '../errors.js';
import { notify } from '../../../core/notifications/index.js';
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
  const SOURCE: Record<string, string> = { email: 'Email', webform: 'Web form', manual: 'Manual', whatsapp: 'WhatsApp', discord: 'Discord' };
  const sourceLabel = SOURCE[source] ?? source;
  const [wsRow] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, ws));
  const subject = type === 'alert.escalation' ? `Lead escalated to you: ${name} (${sourceLabel})` : `New lead assigned to you: ${name} (${sourceLabel})`;
  const why =
    type === 'alert.lead_assigned'
      ? 'A new lead was assigned to you. Please acknowledge it before the window runs out.'
      : p.reason === 'ack_expired'
        ? `Nobody acknowledged it in time, so it was passed to you${p.level ? ` (level ${p.level})` : ''}${p.kind === 'manager' ? ' as the manager' : ''}.`
        : p.reason === 'no_eligible_employee'
          ? 'Nobody on the team was available, so it was sent to you.'
          : 'It was escalated to you.';
  const body = [`Lead: ${name}`, `Source: ${sourceLabel}`, why, '', `Open lead: ${link}`, '', `Sent by Relay for ${wsRow?.name ?? 'your workspace'}`].join('\n');
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ec;font-family:Inter,Arial,sans-serif;color:#17140f"><div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #e6e2d8;border-radius:12px;padding:24px"><p style="margin:0 0 4px;font-size:12px;color:#6b665c;letter-spacing:.02em;text-transform:uppercase">${type === 'alert.escalation' ? 'Lead escalated to you' : 'New lead assigned to you'}</p><h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${esc(name)}</h1><p style="margin:0 0 4px;font-size:14px"><strong>Source:</strong> ${esc(sourceLabel)}</p><p style="margin:12px 0 20px;font-size:14px;line-height:1.5">${esc(why)}</p><a href="${esc(link)}" style="display:inline-block;background:#17140f;color:#fffdf8;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px">Open lead</a></div><p style="margin:14px 4px 0;font-size:12px;color:#8a857a">Sent by Relay for ${esc(wsRow?.name ?? 'your workspace')}</p></div></body></html>`;

  await notify(db, { workspaceId: ws, userId: p.toUserId, kind: type === 'alert.escalation' ? 'lead_escalated' : 'lead_assigned', title: subject, body: why, href: p.linkPath ?? `/leads/${p.leadId}` });
  const store = mailboxStore(ws);
  try {
    const tokens = await store.load();
    if (!tokens) return void (await record('error', 'not delivered: the agency mailbox is not connected'));
    const from = tokens.email ?? (await profile(store)).emailAddress;
    const reply = await agencyAddress(ws);
    const sent = await sendEmail(store, { from, to, subject, body, html, replyTo: reply });
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

// Invite email, sent from the agency mailbox through the outbox so it retries like alerts do.
outbox.registerHandler('email.invite', async (job) => {
  const p = job.payload as { to: string; workspaceName: string; inviterName: string; roleName: string; inviteUrl: string; expiresAt: string };
  const store = mailboxStore(job.workspaceId);
  try {
    const tokens = await store.load();
    if (!tokens) {
      await integrationEvents.recordOutbound({ workspaceId: job.workspaceId, provider: 'gmail', type: 'invite.email', result: 'error', error: 'not sent: the agency mailbox is not connected; copy the invite link instead', ref: p.to });
      return;
    }
    const from = tokens.email ?? (await profile(store)).emailAddress;
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const text = `${p.inviterName} invited you to ${p.workspaceName} on Relay as ${p.roleName}.\n\nAccept the invite: ${p.inviteUrl}\n\nThe link works for 7 days.\n\nSent by Relay for ${p.workspaceName}`;
    const html = `<!doctype html><html><body style="margin:0;background:#f4f2ec;font-family:Inter,Arial,sans-serif;color:#17140f"><div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #e6e2d8;border-radius:12px;padding:24px"><h1 style="margin:0 0 12px;font-size:22px">You're invited to ${esc(p.workspaceName)}</h1><p style="margin:0 0 20px;font-size:14px;line-height:1.5">${esc(p.inviterName)} invited you to join as <strong>${esc(p.roleName)}</strong> on Relay.</p><a href="${esc(p.inviteUrl)}" style="display:inline-block;background:#17140f;color:#fffdf8;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px">Accept invite</a><p style="margin:16px 0 0;font-size:12px;color:#6b665c">The link works for 7 days.</p></div><p style="margin:14px 4px 0;font-size:12px;color:#8a857a">Sent by Relay for ${esc(p.workspaceName)}</p></div></body></html>`;
    const sent = await sendEmail(store, { from, to: p.to, subject: `You're invited to ${p.workspaceName} on Relay`, body: text, html, replyTo: await agencyAddress(job.workspaceId) });
    await integrationEvents.recordOutbound({ workspaceId: job.workspaceId, provider: 'gmail', type: 'invite.email', result: 'ok', ref: sent.id });
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError('Unexpected problem sending the invite', true, 'unexpected');
    await integrationEvents.recordOutbound({ workspaceId: job.workspaceId, provider: 'gmail', type: 'invite.email', result: 'error', error: pe.message, ref: p.to });
    if (pe.temporary && job.attempts < job.maxAttempts) throw pe;
  }
});
