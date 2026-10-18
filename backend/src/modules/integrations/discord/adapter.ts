import { z } from 'zod';
import { last4 } from '../../../core/crypto/index.js';
import { ProviderError } from '../errors.js';
import type { ProviderAdapter } from '../adapter.js';
import { discordApi, type DiscordConfig } from './api.js';
import { clearCommands, registerCommands } from './commands.js';
import { gateways } from './gateway.js';

const snowflake = z.string().trim().regex(/^\d{15,25}$/, 'Must be a Discord id');
const input = z
  .object({
    appId: snowflake,
    publicKey: z.string().trim().regex(/^[0-9a-fA-F]{64}$/, 'Public key must be 64 hex characters'),
    botToken: z.string().trim().min(20).max(200),
    customerGuildId: snowflake,
    staffGuildId: snowflake,
  })
  .strict();

async function check(cfg: DiscordConfig) {
  const me = await discordApi<{ id: string; username: string }>(cfg.botToken, 'GET', '/users/@me');
  const guilds = await discordApi<Array<{ id: string }>>(cfg.botToken, 'GET', '/users/@me/guilds');
  const ids = new Set(guilds.map((g) => g.id));
  for (const [label, id] of [['customer', cfg.customerGuildId], ['staff', cfg.staffGuildId]] as const) {
    if (!ids.has(id)) throw new ProviderError(`The bot is not a member of the ${label} server. Invite it with the OAuth2 link for application ${cfg.appId} and try again`, false, 'bot_not_in_guild');
  }
  return me;
}

export const discordAdapter: ProviderAdapter = {
  id: 'discord',
  dbProvider: 'discord',
  label: 'Discord',
  async connect(_ctx, raw) {
    const cfg = input.parse(raw) as DiscordConfig;
    const me = await check(cfg);
    const commands = await registerCommands(cfg);
    return { config: { ...cfg, botId: me.id, botName: me.username, commands }, secretLast4: last4(cfg.botToken) };
  },
  async afterConnect(ctx, config) {
    await gateways.start(ctx.workspaceId, config as unknown as DiscordConfig);
  },
  async test(ctx) {
    const cfg = ctx.config as DiscordConfig | null;
    if (!cfg?.botToken) throw new ProviderError('Discord is not connected', false, 'not_connected');
    await check(cfg);
    if (!gateways.isOnline(ctx.workspaceId)) await gateways.start(ctx.workspaceId, cfg);
  },
  async disconnect(ctx) {
    const cfg = ctx.config as DiscordConfig | null;
    await gateways.stop(ctx.workspaceId);
    if (cfg?.botToken) await clearCommands(cfg).catch(() => {});
  },
  describeLimits: () => ({
    summary: 'Discord is the messaging and alert channel for this workspace.',
    can: ['Receive customer enquiries and direct messages and turn them into contacts and leads', 'Reply from the platform as the bot', 'Alert employees by direct message when a lead escalates'],
    cannot: [
      'Discord has no delivered or read receipts, so messages show sent or failed only',
      'Customers must join the Margalla Estates Discord server before they can message or be messaged by the bot',
      'Twilio WhatsApp and Telegram are not available from Pakistan, which is why Discord is used',
    ],
  }),
};
