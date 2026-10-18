import { z } from 'zod';
import { last4 } from '../../../core/crypto/index.js';
import { ProviderError, classify, withRetry } from '../errors.js';
import type { ProviderAdapter } from '../adapter.js';

const input = z.object({ botToken: z.string().trim().min(20).max(200), guildId: z.string().trim().max(30).optional(), channelId: z.string().trim().max(30).optional() }).strict();

async function whoAmI(token: string) {
  return withRetry(async () => {
    let r: Response;
    try {
      r = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw classify(undefined, e instanceof Error ? e.message : 'network error');
    }
    if (!r.ok) throw classify(r.status, `Discord rejected the request (${r.status})`);
    return (await r.json()) as { id: string; username: string };
  });
}

export const discordAdapter: ProviderAdapter = {
  id: 'discord',
  dbProvider: 'discord',
  label: 'Discord',
  async connect(_ctx, raw) {
    const i = input.parse(raw);
    const me = await whoAmI(i.botToken);
    return { config: { ...i, botId: me.id, botName: me.username }, secretLast4: last4(i.botToken) };
  },
  async test(ctx) {
    const token = ctx.config?.botToken as string | undefined;
    if (!token) throw new ProviderError('Discord is not connected', false, 'not_connected');
    await whoAmI(token);
  },
  async disconnect() {},
  describeLimits: () => ({
    summary: 'Discord is the messaging and alert channel for this workspace.',
    can: ['Receive customer messages from the server and turn them into contacts and leads', 'Reply from the platform as the bot', 'Alert employees when a lead escalates'],
    cannot: [
      'Twilio WhatsApp and Telegram are not usable from Pakistan, which is why Discord is used',
      'Discord has no delivered or read receipts, so messages show sent or failed only',
      'Customers must join your Discord server before they can be messaged',
    ],
  }),
};
