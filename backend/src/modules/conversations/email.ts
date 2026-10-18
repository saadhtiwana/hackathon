import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { contacts, conversations, integrationConnections, messages, workspaces } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { integrationEvents } from '../../core/integration-events/index.js';
import { leadHooks } from '../../core/lead-hooks.js';
import { logger } from '../../core/logger.js';
import { outbox, type OutboxJob } from '../../core/outbox/index.js';
import { realtime } from '../../core/realtime/index.js';
import { emailAdapter } from '../integrations/google/adapter.js';
import { getHeaders, getMessage, newMessageIds, profile, recentInboxIds, sendEmail, type ParsedEmail } from '../integrations/google/gmail.js';
import { mailboxStore } from '../integrations/google/tokens.js';
import { ProviderError } from '../integrations/errors.js';
import { markError, markOk } from '../integrations/service.js';
import { setStatus, storeInbound } from './service.js';

const CHANNEL = 'email';

// ---- inbound: poll the agency mailbox ----

async function handleInbound(ws: string, mailbox: string, m: ParsedEmail): Promise<'stored' | 'duplicate' | 'ignored'> {
  if (m.from === mailbox || m.labels.includes('SENT') || !m.from) return 'ignored';
  const rec = await integrationEvents.recordInbound({ workspaceId: ws, provider: 'gmail', type: 'email.message', externalId: m.id, result: 'ok', ref: m.threadId });
  if (rec.duplicate) return 'duplicate';
  try {
    const body = m.subject && !/^re:/i.test(m.subject) ? `${m.subject}\n\n${m.text}` : m.text;
    const stop = [m.subject, m.text].some((t) => t.trim().toUpperCase() === 'STOP');
    const out = await db.transaction(async (tx) => {
      let [contact] = await tx.select().from(contacts).where(and(eq(contacts.workspaceId, ws), sql`lower(${contacts.email}) = ${m.from}`)).limit(1);
      let created = false;
      if (!contact) {
        [contact] = await tx.insert(contacts).values({ workspaceId: ws, name: m.fromName, email: m.from, optedOut: stop, optOutReason: stop ? 'Replied STOP by email' : null }).returning();
        created = true;
        await audit.record(tx, { workspaceId: ws, actorId: null, action: 'contact.created', targetType: 'contact', targetId: contact!.id, after: { name: m.fromName, email: m.from, source: 'email' } });
      }
      const stored = await storeInbound(tx, ws, contact!, m.threadId, m.id, body, m.at, CHANNEL);
      if (stop && !created && !contact!.optedOut) {
        await tx.update(contacts).set({ optedOut: true, optOutReason: 'Replied STOP by email', version: sql`${contacts.version} + 1` }).where(eq(contacts.id, contact!.id));
        await audit.record(tx, { workspaceId: ws, actorId: null, action: 'contact.opt_out_changed', targetType: 'contact', targetId: contact!.id, before: { optedOut: false }, after: { optedOut: true, reason: 'Replied STOP by email' } });
      }
      if (created && !stop) await leadHooks.createLead(tx, { workspaceId: ws, contactId: contact!.id, source: 'email', message: body, actorId: null, dedupeOpen: true });
      return stored;
    });
    if (out) realtime.publish(ws, { type: 'message.received', ids: { conversationId: out.conversationId, messageId: out.messageId } });
    return out ? 'stored' : 'duplicate';
  } catch (e) {
    if (rec.id) await integrationEvents.forget(rec.id); // let the next poll retry this message
    throw e;
  }
}

export async function pollMailbox(ws: string): Promise<{ stored: number }> {
  const store = mailboxStore(ws);
  const [row] = await db.select().from(integrationConnections).where(and(eq(integrationConnections.workspaceId, ws), eq(integrationConnections.provider, 'gmail')));
  if (!row || row.status === 'not_connected') return { stored: 0 };
  try {
    const tokens = await store.load();
    if (!tokens) return { stored: 0 };
    const me = (tokens.email ?? (await profile(store)).emailAddress).toLowerCase();
    let ids: string[] = [];
    let historyId = tokens.historyId;
    if (!historyId) {
      // First poll: remember where the mailbox is now; older mail is not imported.
      historyId = (await profile(store)).historyId;
      await store.save({ ...tokens, historyId });
      await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'gmail', type: 'email.poll', result: 'ok', ref: `baseline ${historyId}` });
    } else {
      try {
        const r = await newMessageIds(store, historyId);
        ids = r.ids;
        historyId = r.historyId;
      } catch (e) {
        if (e instanceof ProviderError && e.httpStatus === 404) {
          // History expired: fall back to the most recent inbox mail; dedupe by message id keeps this safe.
          ids = await recentInboxIds(store);
          historyId = (await profile(store)).historyId;
        } else throw e;
      }
    }
    let stored = 0;
    for (const id of ids) {
      const msg = await getMessage(store, id);
      if ((await handleInbound(ws, me, msg)) === 'stored') stored++;
    }
    if (historyId !== tokens.historyId) {
      const fresh = (await store.load()) ?? tokens;
      await store.save({ ...fresh, historyId });
    }
    await store.markOk();
    if (ids.length) await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'gmail', type: 'email.poll', result: 'ok', ref: `${ids.length} new, ${stored} stored` });
    return { stored };
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError('Unexpected problem checking the mailbox', true, 'unexpected');
    logger.error('mailbox poll failed', { err: pe.message });
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'gmail', type: 'email.poll', result: 'error', httpStatus: pe.httpStatus, error: pe.message });
    if (!pe.temporary) await markError(ws, emailAdapter, pe.message);
    return { stored: 0 };
  }
}

let polling = false;
export async function pollAllMailboxes() {
  if (polling) return;
  polling = true;
  try {
    const rows = await db.select({ ws: integrationConnections.workspaceId }).from(integrationConnections).where(and(eq(integrationConnections.provider, 'gmail'), eq(integrationConnections.status, 'connected')));
    for (const r of rows) await pollMailbox(r.ws);
  } finally {
    polling = false;
  }
}

// ---- outbound ----

// Outbox handler for kind "email.send": replies in the customer's thread when there is one.
async function deliverEmail(job: OutboxJob) {
  const ws = job.workspaceId;
  const id = String(job.payload.messageId);
  const [m] = await db.select().from(messages).where(and(eq(messages.workspaceId, ws), eq(messages.id, id)));
  if (!m || m.status === 'sent') return;
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, m.conversationId));
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, convo!.contactId));
  const fail = (code: string, message: string) => setStatus(ws, m, { status: 'failed', errorCode: code, errorMessage: message, attempts: job.attempts });

  if (contact!.optedOut) return fail('opted_out', `Contact opted out${contact!.optOutReason ? `: ${contact!.optOutReason}` : ''}`);
  if (!contact!.email) return fail('no_email', 'Contact has no email address on file');
  const store = mailboxStore(ws);
  try {
    const tokens = await store.load();
    if (!tokens) return fail('not_connected', 'The agency mailbox is not connected');
    const from = tokens.email ?? (await profile(store)).emailAddress;

    let subject = 'Your enquiry';
    let inReplyTo: string | null = null;
    let references: string | null = null;
    const [lastIn] = await db.select({ sid: messages.providerSid }).from(messages).where(and(eq(messages.conversationId, convo!.id), eq(messages.direction, 'in'))).orderBy(desc(messages.createdAt)).limit(1);
    if (lastIn?.sid && convo!.externalChannelId) {
      const h = await getHeaders(store, lastIn.sid);
      inReplyTo = h.messageId;
      references = h.references;
      if (h.subject) subject = /^re:/i.test(h.subject) ? h.subject : `Re: ${h.subject}`;
    } else {
      const [w] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, ws));
      subject = `${w?.name ?? 'Your enquiry'}: message for you`;
    }
    const sent = await sendEmail(store, { from, to: contact!.email, subject, body: m.body, threadId: convo!.externalChannelId, inReplyTo, references });
    if (!convo!.externalChannelId) await db.update(conversations).set({ externalChannelId: sent.threadId }).where(eq(conversations.id, convo!.id));
    await setStatus(ws, m, { status: 'sent', providerSid: sent.id, errorCode: null, errorMessage: null, attempts: job.attempts });
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'gmail', type: 'email.send', result: 'ok', ref: sent.id });
    await markOk(ws, emailAdapter);
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError('Unexpected problem sending the email', true, 'unexpected');
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'gmail', type: 'email.send', result: 'error', httpStatus: pe.httpStatus, error: pe.message, ref: m.id });
    if (pe.temporary && job.attempts < job.maxAttempts) throw pe;
    if (pe.code === 'needs_reconnect') await markError(ws, emailAdapter, pe.message);
    await fail(pe.code, pe.message);
  }
}

outbox.registerHandler('email.send', deliverEmail);
