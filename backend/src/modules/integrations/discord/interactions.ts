import { createPublicKey, verify } from 'node:crypto';
import express, { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../core/db/client.js';
import { contacts, discordLinkCodes, memberships, users, workspaces } from '../../../core/db/schema/index.js';
import { audit } from '../../../core/audit/index.js';
import { activity } from '../../../core/activity/index.js';
import { sha256 } from '../../../core/crypto/index.js';
import { integrationEvents } from '../../../core/integration-events/index.js';
import { leadHooks } from '../../../core/lead-hooks.js';
import { logger } from '../../../core/logger.js';
import { realtime } from '../../../core/realtime/index.js';
import { normalizePhone } from '../../crm/phone.js';
import { discordApi, type DiscordConfig } from './api.js';
import { discordConfig } from './config.js';

const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

export function verifySignature(publicKeyHex: string, signatureHex: string, timestamp: string, rawBody: Buffer): boolean {
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.concat([Buffer.from(timestamp), rawBody]), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

const EPHEMERAL = 64;
const reply = (content: string) => ({ type: 4, data: { content, flags: EPHEMERAL } });
const modal = {
  type: 9,
  data: {
    custom_id: 'enquire_modal',
    title: 'Ask Margalla Estates',
    components: [
      { type: 1, components: [{ type: 4, custom_id: 'name', label: 'Your name', style: 1, required: true, max_length: 80 }] },
      { type: 1, components: [{ type: 4, custom_id: 'phone', label: 'Phone number (with country code)', style: 1, required: true, max_length: 20, placeholder: '+923001234567' }] },
      { type: 1, components: [{ type: 4, custom_id: 'need', label: 'What are you looking for?', style: 2, required: true, max_length: 1000 }] },
    ],
  },
};

const fieldValues = (components: any[]) => Object.fromEntries(components.flatMap((r) => r.components ?? []).map((c: any) => [c.custom_id, String(c.value ?? '').trim()]));

// Edits the deferred "thinking" response once background work finishes.
const followUp = (cfg: DiscordConfig, token: string, content: string) =>
  discordApi(cfg.botToken, 'PATCH', `/webhooks/${cfg.appId}/${token}/messages/@original`, { content }, { auth: false }).catch((e) => logger.warn('discord follow-up failed', { err: String(e?.message ?? e) }));

async function enquiry(ws: string, userId: string, username: string, f: Record<string, string>) {
  const phone = normalizePhone(f.phone ?? '');
  const result = await db.transaction(async (tx) => {
    let [c] = await tx.select().from(contacts).where(and(eq(contacts.workspaceId, ws), eq(contacts.discordUserId, userId)));
    let created = false;
    if (!c) {
      [c] = await tx.select().from(contacts).where(and(eq(contacts.workspaceId, ws), eq(contacts.phone, phone))); // I1.5: known number attaches
      if (c) await tx.update(contacts).set({ discordUserId: userId }).where(eq(contacts.id, c.id));
    }
    if (!c) {
      [c] = await tx.insert(contacts).values({ workspaceId: ws, name: f.name || username, phone, discordUserId: userId }).returning();
      created = true;
      await audit.record(tx, { workspaceId: ws, actorId: null, action: 'contact.created', targetType: 'contact', targetId: c!.id, after: { name: c!.name, source: 'discord' } });
    }
    await leadHooks.createLead(tx, { workspaceId: ws, contactId: c!.id, source: 'discord', message: f.need, actorId: null, dedupeOpen: true });
    await activity.record(tx, { workspaceId: ws, entity: { contactId: c!.id }, type: 'note', actorId: null, data: { body: f.need, via: 'discord /enquire' } });
    return { contactId: c!.id, created };
  });
  realtime.publish(ws, { type: 'lead.created', ids: { contactId: result.contactId } });
}

async function stop(ws: string, userId: string, username: string) {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(contacts).where(and(eq(contacts.workspaceId, ws), eq(contacts.discordUserId, userId)));
    const reason = 'Sent /stop on Discord';
    if (c) {
      await tx.update(contacts).set({ optedOut: true, optOutReason: reason, version: sql`${contacts.version} + 1` }).where(eq(contacts.id, c.id));
      await audit.record(tx, { workspaceId: ws, actorId: null, action: 'contact.opt_out_changed', targetType: 'contact', targetId: c.id, before: { optedOut: c.optedOut }, after: { optedOut: true, reason } });
    } else {
      const [n] = await tx.insert(contacts).values({ workspaceId: ws, name: username, discordUserId: userId, optedOut: true, optOutReason: reason }).returning();
      await audit.record(tx, { workspaceId: ws, actorId: null, action: 'contact.created', targetType: 'contact', targetId: n!.id, after: { name: username, optedOut: true, source: 'discord' } });
    }
  });
}

async function link(ws: string, userId: string, code: string): Promise<string> {
  const normalized = code.trim().toUpperCase();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(discordLinkCodes).where(and(eq(discordLinkCodes.workspaceId, ws), eq(discordLinkCodes.codeHash, sha256(normalized))));
    if (!row || row.usedAt || row.expiresAt < new Date()) return 'That code is invalid or has expired. Generate a new one in Relay and try again.';
    const [other] = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.workspaceId, ws), eq(memberships.discordUserId, userId)));
    if (other) await tx.update(memberships).set({ discordUserId: null }).where(eq(memberships.id, other.id));
    await tx.update(memberships).set({ discordUserId: userId }).where(and(eq(memberships.workspaceId, ws), eq(memberships.userId, row.userId)));
    await tx.update(discordLinkCodes).set({ usedAt: new Date() }).where(eq(discordLinkCodes.id, row.id));
    const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, row.userId));
    await audit.record(tx, { workspaceId: ws, actorId: row.userId, action: 'notifications.discord_linked', targetType: 'user', targetId: row.userId, after: { discordUserId: userId } });
    return `Linked. You will get lead alerts here, ${u?.name ?? ''}.`.trim();
  });
}

async function runDeferred(cfg: DiscordConfig, token: string, work: () => Promise<string>) {
  try {
    await followUp(cfg, token, await work());
  } catch (e) {
    const msg = (e as { code?: string; message?: string })?.code === 'invalid_phone' ? 'That phone number does not look right. Use the international format, for example +923001234567.' : 'Something went wrong on our side. Please try again in a moment.';
    logger.error('discord interaction failed', { err: e instanceof Error ? e.message : String(e) });
    await followUp(cfg, token, msg);
  }
}

// Mounted before the JSON parser: the signature covers the raw bytes (I1.2).
export const discordInteractionsRouter = Router();

discordInteractionsRouter.post('/:workspaceId', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const ws = req.params.workspaceId!;
  if (!/^[0-9a-f-]{36}$/i.test(ws)) return void res.status(404).json({ error: { code: 'not_found', message: 'Unknown workspace' } });
  const [w] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, ws));
  if (!w) return void res.status(404).json({ error: { code: 'not_found', message: 'Unknown workspace' } });

  const cfg = await discordConfig(ws);
  const sig = req.header('x-signature-ed25519') ?? '';
  const ts = req.header('x-signature-timestamp') ?? '';
  if (!cfg || !Buffer.isBuffer(req.body) || !verifySignature(cfg.publicKey, sig, ts, req.body)) {
    await integrationEvents.recordInbound({ workspaceId: ws, provider: 'discord', type: 'interaction', result: 'rejected', httpStatus: 401, error: 'signature verification failed' });
    return void res.status(401).json({ error: { code: 'bad_signature', message: 'Invalid request signature' } });
  }

  const i = JSON.parse(req.body.toString('utf8'));
  if (i.type === 1) return void res.json({ type: 1 }); // PING
  const rec = await integrationEvents.recordInbound({ workspaceId: ws, provider: 'discord', type: `interaction.${i.data?.name ?? i.data?.custom_id ?? i.type}`, externalId: i.id, result: 'ok', httpStatus: 200 });
  if (rec.duplicate) return void res.json(reply('Already received.'));

  const user = i.member?.user ?? i.user;
  const userId: string = user?.id;
  const username: string = user?.global_name || user?.username || 'Discord user';
  const guild: string | undefined = i.guild_id;

  try {
    if (i.type === 2) {
      const name = i.data?.name;
      if (name === 'enquire' && guild === cfg.customerGuildId) return void res.json(modal);
      if (name === 'stop' && guild === cfg.customerGuildId) {
        res.json({ type: 5, data: { flags: EPHEMERAL } });
        return void (await runDeferred(cfg, i.token, async () => (await stop(ws, userId, username), 'Done. We will not message you again. You can use /enquire any time to start over.')));
      }
      if (name === 'link' && guild === cfg.staffGuildId) {
        const code = String(i.data?.options?.find((o: any) => o.name === 'code')?.value ?? '');
        res.json({ type: 5, data: { flags: EPHEMERAL } });
        return void (await runDeferred(cfg, i.token, () => link(ws, userId, code)));
      }
      return void res.json(reply('That command is not available in this server.'));
    }
    if (i.type === 5 && i.data?.custom_id === 'enquire_modal' && guild === cfg.customerGuildId) {
      const f = fieldValues(i.data.components ?? []);
      res.json({ type: 5, data: { flags: EPHEMERAL } });
      return void (await runDeferred(cfg, i.token, async () => (await enquiry(ws, userId, username, f), `Thanks ${f.name || username}. A member of our team will message you here on Discord shortly.`)));
    }
    res.json(reply('Unsupported interaction.'));
  } catch (e) {
    if (rec.id) await integrationEvents.markResult(rec.id, 'error', e instanceof Error ? e.message : 'failed');
    logger.error('discord interaction error', { err: e instanceof Error ? e.message : String(e) });
    if (!res.headersSent) res.json(reply('Something went wrong on our side. Please try again.'));
  }
});
