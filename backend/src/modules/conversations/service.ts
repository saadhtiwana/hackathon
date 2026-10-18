import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db, type Tx } from '../../core/db/client.js';
import { contacts, conversations, leads, messages, users } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { activity } from '../../core/activity/index.js';
import { getOr404 } from '../../core/db/scoped.js';
import { conflict, forbidden, notFound } from '../../core/errors.js';
import { integrationEvents } from '../../core/integration-events/index.js';
import { leadHooks } from '../../core/lead-hooks.js';
import { outbox, type OutboxJob } from '../../core/outbox/index.js';
import { realtime } from '../../core/realtime/index.js';
import type { AuthContext } from '../../core/auth/context.js';
import { discordConfig } from '../integrations/discord/config.js';
import { dmChannel, sendChannelMessage } from '../integrations/discord/api.js';
import { ProviderError } from '../integrations/errors.js';
import { markError, markOk } from '../integrations/service.js';
import { discordAdapter } from '../integrations/discord/adapter.js';

export const CHANNEL = 'discord';

// ---- inbound ----

export interface InboundDm {
  userId: string;
  username: string;
  channelId: string;
  messageId: string;
  content: string;
  at?: Date;
}

type ContactRow = typeof contacts.$inferSelect;

export async function conversationFor(tx: Tx, ws: string, contact: ContactRow, channelId: string | null, channel: string = CHANNEL) {
  const [ex] = await tx.select().from(conversations).where(and(eq(conversations.workspaceId, ws), eq(conversations.contactId, contact.id), eq(conversations.channel, channel)));
  if (ex) {
    if (channelId && ex.externalChannelId !== channelId) await tx.update(conversations).set({ externalChannelId: channelId }).where(eq(conversations.id, ex.id));
    return ex;
  }
  const [c] = await tx.insert(conversations).values({ workspaceId: ws, contactId: contact.id, ownerId: contact.ownerId, channel, externalChannelId: channelId }).returning();
  return c!;
}

// Stores one customer message. Returns false when this Discord message id was already stored (I1.8).
export async function storeInbound(tx: Tx, ws: string, contact: ContactRow, channelId: string | null, messageId: string, body: string, at?: Date, channel: string = CHANNEL) {
  const convo = await conversationFor(tx, ws, contact, channelId, channel);
  const [m] = await tx.insert(messages).values({ workspaceId: ws, conversationId: convo.id, providerSid: messageId, direction: 'in', body, status: 'received', createdAt: at ?? new Date() }).onConflictDoNothing().returning({ id: messages.id });
  if (!m) return null;
  await tx.update(conversations).set({ lastMessageAt: at ?? new Date() }).where(eq(conversations.id, convo.id));
  await activity.record(tx, { workspaceId: ws, entity: { contactId: contact.id }, type: 'message', actorId: null, data: { conversationId: convo.id, messageId: m.id, direction: 'in', channel, preview: body.replace(/\s+/g, ' ').slice(0, 80) } });
  return { conversationId: convo.id, messageId: m.id };
}

export async function matchContactByDiscord(tx: Tx, ws: string, discordUserId: string) {
  const [c] = await tx.select().from(contacts).where(and(eq(contacts.workspaceId, ws), eq(contacts.discordUserId, discordUserId)));
  return c ?? null;
}

// A customer DM. Unknown senders become a contact plus a lead (F3.1, I1.5).
export async function handleInboundDm(ws: string, m: InboundDm): Promise<'stored' | 'duplicate' | 'ignored'> {
  const rec = await integrationEvents.recordInbound({ workspaceId: ws, provider: 'discord', type: 'dm.message', externalId: m.messageId, result: 'ok', ref: m.channelId });
  if (rec.duplicate) return 'duplicate';
  try {
    const staff = await db.execute(sql`select 1 from memberships where workspace_id = ${ws} and discord_user_id = ${m.userId} limit 1`);
    if (staff.rows.length) {
      if (rec.id) await integrationEvents.markResult(rec.id, 'ok', 'ignored: sender is a staff member');
      return 'ignored';
    }
    const out = await db.transaction(async (tx) => {
      let contact = await matchContactByDiscord(tx, ws, m.userId);
      let created = false;
      if (!contact) {
        [contact] = await tx.insert(contacts).values({ workspaceId: ws, name: m.username, discordUserId: m.userId, custom: {} }).returning();
        created = true;
        await audit.record(tx, { workspaceId: ws, actorId: null, action: 'contact.created', targetType: 'contact', targetId: contact!.id, after: { name: m.username, source: 'discord' } });
      }
      const stored = await storeInbound(tx, ws, contact!, m.channelId, m.messageId, m.content, m.at);
      if (created) await leadHooks.createLead(tx, { workspaceId: ws, contactId: contact!.id, source: 'discord', message: m.content, actorId: null, dedupeOpen: true });
      return stored;
    });
    if (out) realtime.publish(ws, { type: 'message.received', ids: { conversationId: out.conversationId, messageId: out.messageId } });
    return out ? 'stored' : 'duplicate';
  } catch (e) {
    // Forget the dedupe row so the next backfill picks this message up again.
    if (rec.id) await integrationEvents.forget(rec.id);
    throw e;
  }
}

// ---- access ----

export const canSeeAll = (a: AuthContext) => a.permissions.has('leads.reassign');

// Ownership follows the open lead when there is one, otherwise the conversation or contact owner.
async function ownersFor(ws: string, rows: Array<{ contactId: string; ownerId: string | null }>) {
  const ids = [...new Set(rows.map((r) => r.contactId))];
  const map = new Map<string, string | null>();
  if (ids.length) {
    const open = await db.select({ contactId: leads.contactId, ownerId: leads.ownerId }).from(leads).where(and(eq(leads.workspaceId, ws), inArray(leads.contactId, ids), inArray(leads.status, ['assigned', 'acknowledged'])));
    for (const l of open) map.set(l.contactId, l.ownerId);
  }
  return (r: { contactId: string; ownerId: string | null }) => (map.has(r.contactId) ? map.get(r.contactId)! : r.ownerId);
}

export async function listConversations(a: AuthContext, q: { scope: 'mine' | 'unassigned' | 'all'; limit: number }) {
  if (q.scope !== 'mine' && !canSeeAll(a)) throw forbidden('Only managers can see other people\'s conversations');
  const rows = await db
    .select({ id: conversations.id, contactId: conversations.contactId, contactName: contacts.name, optedOut: contacts.optedOut, channel: conversations.channel, ownerId: conversations.ownerId, contactOwnerId: contacts.ownerId, lastMessageAt: conversations.lastMessageAt })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(conversations.workspaceId, a.workspaceId))
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))
    .limit(500);
  const ownerOf = await ownersFor(a.workspaceId, rows.map((r) => ({ contactId: r.contactId, ownerId: r.ownerId ?? r.contactOwnerId })));
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]));
  const last = rows.length ? await db.execute(sql`select distinct on (conversation_id) conversation_id, body, direction, status from messages where conversation_id in (${sql.join(rows.map((r) => sql`${r.id}`), sql`,`)}) order by conversation_id, created_at desc`) : { rows: [] };
  const lastBy = new Map((last.rows as Array<{ conversation_id: string; body: string; direction: string; status: string }>).map((r) => [r.conversation_id, r]));
  const items = rows
    .map((r) => {
      const ownerId = ownerOf({ contactId: r.contactId, ownerId: r.ownerId ?? r.contactOwnerId });
      const l = lastBy.get(r.id);
      return { id: r.id, contactId: r.contactId, contactName: r.contactName, optedOut: r.optedOut, channel: r.channel, ownerId, ownerName: ownerId ? names.get(ownerId) ?? null : null, lastMessageAt: r.lastMessageAt, lastMessage: l ? { body: l.body.slice(0, 120), direction: l.direction, status: l.status } : null };
    })
    .filter((r) => (q.scope === 'all' ? true : q.scope === 'unassigned' ? !r.ownerId : r.ownerId === a.userId));
  return { items: items.slice(0, q.limit) };
}

async function accessible(a: AuthContext, id: string) {
  const convo = await getOr404(db, conversations, a.workspaceId, id, 'Conversation');
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, convo.contactId));
  const ownerOf = await ownersFor(a.workspaceId, [{ contactId: convo.contactId, ownerId: convo.ownerId ?? contact!.ownerId }]);
  const ownerId = ownerOf({ contactId: convo.contactId, ownerId: convo.ownerId ?? contact!.ownerId });
  if (!canSeeAll(a) && ownerId !== a.userId) throw notFound('Conversation'); // not yours: indistinguishable from missing (I1.6)
  return { convo, contact: contact!, ownerId };
}

export async function getConversation(a: AuthContext, id: string, q: { limit: number; before?: Date }) {
  const { convo, contact, ownerId } = await accessible(a, id);
  const rows = await db
    .select({ id: messages.id, direction: messages.direction, body: messages.body, status: messages.status, errorCode: messages.errorCode, errorMessage: messages.errorMessage, retryOf: messages.retryOf, sentBy: messages.sentBy, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, id), q.before ? lt(messages.createdAt, q.before) : undefined))
    .orderBy(desc(messages.createdAt))
    .limit(q.limit);
  const [owner] = ownerId ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, ownerId)) : [];
  return {
    conversation: { id: convo.id, channel: convo.channel, contactId: contact.id, contactName: contact.name, optedOut: contact.optedOut, optOutReason: contact.optOutReason, owner: owner ?? null, lastMessageAt: convo.lastMessageAt },
    messages: rows.reverse(),
  };
}

// ---- outbound ----

function assertCanMessage(contact: ContactRow, channel: string = CHANNEL) {
  if (contact.optedOut) throw conflict(`${contact.name} opted out of messages${contact.optOutReason ? `: ${contact.optOutReason}` : ''}`, 'Ask them to message you first, or clear the opt-out on the contact if they asked to be contacted again', 'opted_out', { reason: contact.optOutReason });
  if (channel === 'email') {
    if (!contact.email) throw conflict(`${contact.name} has no email address on file`, 'Add an email address to the contact first', 'no_email');
    return;
  }
  if (!contact.discordUserId) throw conflict(`${contact.name} has no Discord account on file`, 'They need to message the bot or use /enquire in the customer server first', 'no_discord_id');
}

async function queueOutbound(tx: Tx, a: AuthContext, convo: typeof conversations.$inferSelect, contact: ContactRow, body: string, retryOf?: string) {
  const channel = convo.channel;
  const [m] = await tx.insert(messages).values({ workspaceId: a.workspaceId, conversationId: convo.id, direction: 'out', body, status: 'queued', sentBy: a.userId, retryOf: retryOf ?? null }).returning();
  await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, convo.id));
  await outbox.enqueue(tx, { workspaceId: a.workspaceId, kind: `${channel}.send`, payload: { messageId: m!.id } });
  // A message from the owner counts as an acknowledgement of the open lead.
  await activity.record(tx, { workspaceId: a.workspaceId, entity: { contactId: contact.id }, type: 'message', actorId: a.userId, data: { conversationId: convo.id, messageId: m!.id, direction: 'out', channel } });
  return m!;
}

export async function sendMessage(a: AuthContext, conversationId: string, body: string) {
  const { convo, contact } = await accessible(a, conversationId);
  assertCanMessage(contact, convo.channel);
  const m = await db.transaction((tx) => queueOutbound(tx, a, convo, contact, body));
  realtime.publish(a.workspaceId, { type: 'message.status', ids: { conversationId: convo.id, messageId: m.id } });
  return m;
}

export async function sendToContact(a: AuthContext, contactId: string, body: string, channel: string = CHANNEL) {
  const contact = await getOr404(db, contacts, a.workspaceId, contactId, 'Contact');
  assertCanMessage(contact, channel);
  const m = await db.transaction(async (tx) => queueOutbound(tx, a, await conversationFor(tx, a.workspaceId, contact, null, channel), contact, body));
  realtime.publish(a.workspaceId, { type: 'message.status', ids: { messageId: m.id, contactId } });
  return m;
}

export async function retryMessage(a: AuthContext, messageId: string) {
  const [orig] = await db.select().from(messages).where(and(eq(messages.workspaceId, a.workspaceId), eq(messages.id, messageId)));
  if (!orig) throw notFound('Message');
  const { convo, contact } = await accessible(a, orig.conversationId);
  if (orig.status !== 'failed' || orig.direction !== 'out') throw conflict('Only a failed outgoing message can be retried', undefined, 'not_retryable');
  assertCanMessage(contact, convo.channel);
  const m = await db.transaction((tx) => queueOutbound(tx, a, convo, contact, orig.body, orig.id));
  realtime.publish(a.workspaceId, { type: 'message.status', ids: { conversationId: convo.id, messageId: m.id } });
  return m;
}

export async function setStatus(ws: string, m: typeof messages.$inferSelect, patch: Partial<typeof messages.$inferInsert>) {
  await db.update(messages).set(patch).where(eq(messages.id, m.id));
  realtime.publish(ws, { type: 'message.status', ids: { conversationId: m.conversationId, messageId: m.id } });
}

// Outbox handler for kind "discord.send". Temporary errors rethrow so the outbox retries with backoff; permanent ones fail the message visibly (I1.7).
export async function deliverMessage(job: OutboxJob) {
  const ws = job.workspaceId;
  const id = String(job.payload.messageId);
  const [m] = await db.select().from(messages).where(and(eq(messages.workspaceId, ws), eq(messages.id, id)));
  if (!m || m.status === 'sent') return;
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, m.conversationId));
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, convo!.contactId));
  const fail = async (code: string, message: string) => setStatus(ws, m, { status: 'failed', errorCode: code, errorMessage: message, attempts: job.attempts });

  if (contact!.optedOut) return fail('opted_out', `Contact opted out${contact!.optOutReason ? `: ${contact!.optOutReason}` : ''}`);
  const cfg = await discordConfig(ws);
  if (!cfg) return fail('not_connected', 'Discord is not connected for this workspace');
  if (!contact!.discordUserId) return fail('no_discord_id', 'Contact has no Discord account on file');

  try {
    let channel = convo!.externalChannelId;
    if (!channel) {
      channel = await dmChannel(cfg.botToken, contact!.discordUserId);
      await db.update(conversations).set({ externalChannelId: channel }).where(eq(conversations.id, convo!.id));
    }
    const sent = await sendChannelMessage(cfg.botToken, channel, m.body);
    await setStatus(ws, m, { status: 'sent', providerSid: sent.id, errorCode: null, errorMessage: null, attempts: job.attempts });
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'discord', type: 'dm.send', externalId: undefined, result: 'ok', ref: sent.id });
    await markOk(ws, discordAdapter);
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError('Unexpected problem sending the message', true, 'unexpected');
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'discord', type: 'dm.send', result: 'error', httpStatus: pe.httpStatus, error: pe.message, ref: m.id });
    if (pe.temporary && job.attempts < job.maxAttempts) throw pe;
    if (pe.code === 'auth_failed') await markError(ws, discordAdapter, pe.message);
    await fail(pe.code, pe.message);
  }
}

outbox.registerHandler('discord.send', deliverMessage);
