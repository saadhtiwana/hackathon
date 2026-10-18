import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { contacts, conversations, integrationConnections, integrationEvents as eventsTable, messages, workspaces } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { integrationEvents } from '../../core/integration-events/index.js';
import { leadHooks } from '../../core/lead-hooks.js';
import { logger } from '../../core/logger.js';
import { outbox, type OutboxJob } from '../../core/outbox/index.js';
import { realtime } from '../../core/realtime/index.js';
import { emailAdapter } from '../integrations/google/adapter.js';
import { getHeaders, getMessage, listForAddress, profile, sendEmail, type ParsedEmail } from '../integrations/google/gmail.js';
import { agencyAddressFor, type GoogleTokens } from '../integrations/google/oauth.js';
import { mailboxStore } from '../integrations/google/tokens.js';
import { ProviderError } from '../integrations/errors.js';
import { markError, markOk } from '../integrations/service.js';
import { setStatus, storeInbound } from './service.js';

const CHANNEL = 'email';

// ---- inbound: poll the agency mailbox ----

async function handleInbound(ws: string, mailbox: string, m: ParsedEmail): Promise<'stored' | 'duplicate' | 'ignored'> {
  // The Gmail query already limits this to mail delivered to the agency address; people become customers, automated mail is recorded and skipped.
  const skip =
    m.from === mailbox || m.labels.includes('SENT') || !m.from
      ? 'sent by the mailbox itself'
      : m.automated;
  const rec = await integrationEvents.recordInbound({ workspaceId: ws, provider: 'gmail', type: 'email.message', externalId: m.id, result: 'ok', ref: m.threadId, error: skip ? `ignored: ${skip}` : undefined });
  if (rec.duplicate) return 'duplicate';
  if (skip) return 'ignored';
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
      if (created && !stop) await leadHooks.createLead(tx, { workspaceId: ws, contactId: contact!.id, source: 'email', actorId: null, dedupeOpen: true });
      return stored;
    });
    if (out) realtime.publish(ws, { type: 'message.received', ids: { conversationId: out.conversationId, messageId: out.messageId } });
    return out ? 'stored' : 'duplicate';
  } catch (e) {
    if (rec.id) await integrationEvents.forget(rec.id); // let the next poll retry this message
    throw e;
  }
}

// The agency address and the connection time are stored with the mailbox tokens. Older connections get them filled in once.
async function mailboxState(ws: string, store: ReturnType<typeof mailboxStore>, tokens: GoogleTokens) {
  const mailbox = (tokens.email ?? (await profile(store)).emailAddress).toLowerCase();
  let { agencyEmail, connectedAt } = tokens;
  if (!agencyEmail || !connectedAt) {
    const [w] = await db.select({ slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, ws));
    const [first] = await db.select({ at: eventsTable.createdAt }).from(eventsTable).where(and(eq(eventsTable.workspaceId, ws), eq(eventsTable.provider, 'gmail'), eq(eventsTable.type, 'email.poll'))).orderBy(asc(eventsTable.createdAt)).limit(1);
    agencyEmail = agencyEmail ?? agencyAddressFor(mailbox, w?.slug ?? '');
    connectedAt = connectedAt ?? (first?.at ? +first.at : Date.now());
    await store.save({ ...tokens, agencyEmail, connectedAt });
  }
  return { mailbox, agency: agencyEmail.toLowerCase(), connectedAt };
}

export async function agencyAddress(ws: string): Promise<string | null> {
  try {
    const store = mailboxStore(ws);
    const t = await store.load();
    return t ? (await mailboxState(ws, store, t)).agency : null;
  } catch {
    return null;
  }
}

export async function pollMailbox(ws: string): Promise<{ stored: number }> {
  const store = mailboxStore(ws);
  const [row] = await db.select().from(integrationConnections).where(and(eq(integrationConnections.workspaceId, ws), eq(integrationConnections.provider, 'gmail')));
  if (!row || row.status === 'not_connected') return { stored: 0 };
  try {
    const tokens = await store.load();
    if (!tokens) return { stored: 0 };
    const { mailbox, agency, connectedAt } = await mailboxState(ws, store, tokens);
    // Ask Gmail only for mail delivered to the agency address since connection (deliveredto: and after:).
    const ids = await listForAddress(store, agency, Math.floor(connectedAt / 1000));
    const seen = ids.length ? await db.select({ id: eventsTable.externalId }).from(eventsTable).where(and(eq(eventsTable.workspaceId, ws), eq(eventsTable.provider, 'gmail'), eq(eventsTable.type, 'email.message'), inArray(eventsTable.externalId, ids))) : [];
    const known = new Set(seen.map((r) => r.id));
    let stored = 0;
    let skipped = 0;
    for (const id of ids.filter((i) => !known.has(i))) {
      const outcome = await handleInbound(ws, mailbox, await getMessage(store, id));
      if (outcome === 'stored') stored++;
      else if (outcome === 'ignored') skipped++;
    }
    await store.markOk();
    if (stored || skipped) await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'gmail', type: 'email.poll', result: 'ok', ref: `${stored} stored, ${skipped} skipped` });
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
    const { agency } = await mailboxState(ws, store, tokens);
    const sent = await sendEmail(store, { from, to: contact!.email, subject, body: m.body, replyTo: agency, threadId: convo!.externalChannelId, inReplyTo, references });
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
