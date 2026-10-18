import { Client, GatewayIntentBits, Partials, type Message } from 'discord.js';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../../core/db/client.js';
import { conversations, integrationConnections } from '../../../core/db/schema/index.js';
import { decrypt } from '../../../core/crypto/index.js';
import { logger } from '../../../core/logger.js';
import { integrationEvents } from '../../../core/integration-events/index.js';
import type { DiscordConfig } from './api.js';

interface Entry {
  client: Client;
  online: boolean;
}

const entries = new Map<string, Entry>();
let ensuring = false;
// Inbound handling lives in the conversations module; loaded lazily to avoid an import cycle.
const inbound = () => import('../../conversations/service.js');

async function toInbound(m: Message) {
  return { userId: m.author.id, username: m.author.username, channelId: m.channelId, messageId: m.id, content: m.content || '[attachment]', at: m.createdAt };
}

// Replays recent DM history per known DM channel so nothing is lost while the process was down. Dedupe is by message id.
async function backfill(ws: string, client: Client) {
  const rows = await db.select({ channel: conversations.externalChannelId }).from(conversations).where(and(eq(conversations.workspaceId, ws), isNotNull(conversations.externalChannelId)));
  const { handleInboundDm } = await inbound();
  let stored = 0;
  for (const r of rows) {
    try {
      const ch = await client.channels.fetch(r.channel!);
      if (!ch || !ch.isTextBased() || !('messages' in ch)) continue;
      const batch = await ch.messages.fetch({ limit: 50 });
      for (const m of [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)) {
        if (m.author.bot) continue;
        if ((await handleInboundDm(ws, await toInbound(m))) === 'stored') stored++;
      }
    } catch (e) {
      logger.warn('discord backfill skipped a channel', { err: e instanceof Error ? e.message : String(e) });
    }
  }
  if (stored) logger.info('discord backfill stored messages', { stored });
}

async function login(ws: string, cfg: DiscordConfig, withContent: boolean): Promise<Client> {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages];
  if (withContent) intents.push(GatewayIntentBits.MessageContent);
  const client = new Client({ intents, partials: [Partials.Channel, Partials.Message] });
  client.on('messageCreate', async (m) => {
    if (m.author.bot || m.guildId) return; // customer DMs only
    try {
      const { handleInboundDm } = await inbound();
      await handleInboundDm(ws, await toInbound(m.partial ? await m.fetch() : m));
    } catch (e) {
      logger.error('discord inbound failed', { err: e instanceof Error ? e.message : String(e) });
      await integrationEvents.recordInbound({ workspaceId: ws, provider: 'discord', type: 'dm.message', result: 'error', error: e instanceof Error ? e.message : 'processing failed', ref: m.id }).catch(() => {});
    }
  });
  client.on('error', (e) => logger.error('discord client error', { err: e.message }));
  const ready = new Promise<void>((resolve) => client.once('clientReady', () => resolve()));
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Discord gateway did not become ready within 30s')), 30_000).unref());
  try {
    await Promise.race([client.login(cfg.botToken).then(() => ready), timeout]);
  } catch (e) {
    await client.destroy().catch(() => {});
    throw e;
  }
  return client;
}

export const gateways = {
  isOnline: (ws: string) => !!entries.get(ws)?.online,

  async start(ws: string, cfg: DiscordConfig) {
    await this.stop(ws);
    let client: Client;
    try {
      client = await login(ws, cfg, true);
    } catch (e) {
      if (!/disallowed intents/i.test(String((e as Error).message))) throw e;
      // The Message Content intent is not enabled in the developer portal; DMs still deliver content, guild messages do not.
      logger.warn('discord message content intent unavailable, starting without it');
      client = await login(ws, cfg, false);
    }
    entries.set(ws, { client, online: true });
    client.on('shardDisconnect', () => {
      const e = entries.get(ws);
      if (e) e.online = false;
    });
    client.on('shardResume', () => {
      const e = entries.get(ws);
      if (e) e.online = true;
    });
    logger.info('discord gateway online', { workspaceId: ws });
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'discord', type: 'gateway.online', result: 'ok', ref: cfg.botName ?? cfg.botId });
    backfill(ws, client).catch((e) => logger.error('discord backfill failed', { err: e instanceof Error ? e.message : String(e) }));
  },

  async stop(ws: string) {
    const e = entries.get(ws);
    if (!e) return;
    entries.delete(ws);
    await e.client.destroy();
  },

  // Called on server boot: reconnects every workspace that has Discord connected.
  async startAll() {
    await this.ensureAll();
  },

  // Starts any connected workspace that is not online; also run on an interval so a connection made elsewhere is picked up.
  async ensureAll() {
    if (ensuring) return;
    ensuring = true;
    try {
      await this.ensureAllInner();
    } finally {
      ensuring = false;
    }
  },

  async ensureAllInner() {
    const rows = await db.select().from(integrationConnections).where(and(eq(integrationConnections.provider, 'discord'), eq(integrationConnections.status, 'connected')));
    for (const r of rows) {
      try {
        if (r.encryptedConfig && !entries.get(r.workspaceId)?.online) await this.start(r.workspaceId, JSON.parse(decrypt(r.encryptedConfig)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('discord gateway failed to start', { workspaceId: r.workspaceId, err: msg });
        await integrationEvents.recordOutbound({ workspaceId: r.workspaceId, provider: 'discord', type: 'gateway.online', result: 'error', error: `Gateway could not start: ${msg}` }).catch(() => {});
      }
    }
  },
};
