import { ProviderError, classify } from '../errors.js';

const BASE = 'https://discord.com/api/v10';

// Discord error codes mapped to something a person can act on.
const CODES: Record<number, string> = {
  50007: 'This person only accepts direct messages from people they share a server with, and has them turned off',
  50001: 'The bot does not have access to that channel or server',
  50013: 'The bot is missing a permission it needs',
  10013: 'That Discord user no longer exists',
  10003: 'That Discord channel no longer exists',
  50035: 'Discord rejected the message content',
  40003: 'Too many direct messages were opened too quickly; wait a moment',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function discordApi<T = any>(token: string, method: string, path: string, body?: unknown, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'RelayCRM (https://relay.example, 1.0)' };
  if (opts.auth !== false) headers.Authorization = `Bot ${token}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    let r: Response;
    try {
      r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      if (attempt < 3) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw classify(undefined, e instanceof Error ? e.message : 'network error');
    }
    if (r.status === 429) {
      // Honour retry_after, then try again (I5.5).
      const j = (await r.json().catch(() => ({}))) as { retry_after?: number };
      const wait = Math.min(Math.ceil((j.retry_after ?? 1) * 1000), 5000);
      if (attempt < 3) {
        await sleep(wait);
        continue;
      }
      throw new ProviderError('Discord is rate limiting requests; try again shortly', true, 'rate_limited', 429);
    }
    if (r.status >= 500) {
      if (attempt < 3) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw classify(r.status, '');
    }
    if (r.status === 204) return undefined as T;
    const json = (await r.json().catch(() => ({}))) as { code?: number; message?: string };
    if (!r.ok) {
      const plain = (json.code && CODES[json.code]) || json.message || `Discord rejected the request (${r.status})`;
      const err = classify(r.status, plain);
      err.code = json.code ? `discord_${json.code}` : err.code;
      if (r.status === 401) err.message = 'Discord rejected the bot token; reconnect with a valid token';
      else if (r.status !== 429) err.message = plain;
      throw err;
    }
    return json as T;
  }
  throw new ProviderError('Discord did not respond', true, 'unreachable');
}

export interface DiscordConfig {
  appId: string;
  publicKey: string;
  botToken: string;
  customerGuildId: string;
  staffGuildId: string;
  botId?: string;
  botName?: string;
}

export const dmChannel = async (token: string, userId: string): Promise<string> => (await discordApi<{ id: string }>(token, 'POST', '/users/@me/channels', { recipient_id: userId })).id;
export const sendChannelMessage = (token: string, channelId: string, content: string) => discordApi<{ id: string }>(token, 'POST', `/channels/${channelId}/messages`, { content: content.slice(0, 2000) });
