import { and, eq } from 'drizzle-orm';
import { db } from '../../../core/db/client.js';
import { integrationConnections, userConnections } from '../../../core/db/schema/index.js';
import { decrypt, encrypt } from '../../../core/crypto/index.js';
import { ProviderError, classify, withRetry } from '../errors.js';
import { refreshAccess, type GoogleTokens } from './oauth.js';

export interface TokenStore {
  load(): Promise<GoogleTokens | null>;
  save(t: GoogleTokens): Promise<void>;
  markBad(reason: string): Promise<void>;
  markOk(): Promise<void>;
  label: string;
}

export const userCalendarStore = (ws: string, userId: string, label = 'Google Calendar'): TokenStore => ({
  label,
  async load() {
    const [r] = await db.select().from(userConnections).where(and(eq(userConnections.workspaceId, ws), eq(userConnections.userId, userId), eq(userConnections.provider, 'google')));
    if (!r?.encryptedTokens) return null;
    if (r.needsReconnect) throw new ProviderError('This Google Calendar connection needs to be reconnected', false, 'needs_reconnect');
    return JSON.parse(decrypt(r.encryptedTokens));
  },
  async save(t) {
    await db.update(userConnections).set({ encryptedTokens: encrypt(JSON.stringify(t)), tokenExpiresAt: new Date(t.expiresAt), updatedAt: new Date() }).where(and(eq(userConnections.userId, userId), eq(userConnections.provider, 'google')));
  },
  async markBad() {
    await db.update(userConnections).set({ needsReconnect: true, status: 'error', updatedAt: new Date() }).where(and(eq(userConnections.userId, userId), eq(userConnections.provider, 'google')));
  },
  async markOk() {},
});

export const mailboxStore = (ws: string): TokenStore => ({
  label: 'the agency mailbox',
  async load() {
    const [r] = await db.select().from(integrationConnections).where(and(eq(integrationConnections.workspaceId, ws), eq(integrationConnections.provider, 'gmail')));
    if (!r?.encryptedConfig) return null;
    if (r.status === 'error' && /reconnect/i.test(r.lastError ?? '')) throw new ProviderError('The agency mailbox needs to be reconnected', false, 'needs_reconnect');
    return JSON.parse(decrypt(r.encryptedConfig));
  },
  async save(t) {
    await db.update(integrationConnections).set({ encryptedConfig: encrypt(JSON.stringify(t)), updatedAt: new Date() }).where(and(eq(integrationConnections.workspaceId, ws), eq(integrationConnections.provider, 'gmail')));
  },
  async markBad(reason) {
    await db.update(integrationConnections).set({ status: 'error', lastErrorAt: new Date(), lastError: reason, updatedAt: new Date() }).where(and(eq(integrationConnections.workspaceId, ws), eq(integrationConnections.provider, 'gmail')));
  },
  async markOk() {
    await db.update(integrationConnections).set({ status: 'connected', lastOkAt: new Date(), lastError: null, updatedAt: new Date() }).where(and(eq(integrationConnections.workspaceId, ws), eq(integrationConnections.provider, 'gmail')));
  },
});

// Returns a valid access token, refreshing it on the server when it is close to expiring (I3.2).
export async function accessToken(store: TokenStore): Promise<{ token: string; tokens: GoogleTokens }> {
  let t = await store.load();
  if (!t) throw new ProviderError(`${store.label} is not connected`, false, 'not_connected');
  if (t.expiresAt - 60_000 <= Date.now()) {
    try {
      t = await withRetry(() => refreshAccess(t!));
      await store.save(t);
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'needs_reconnect') await store.markBad(e.message);
      throw e;
    }
  }
  return { token: t.accessToken, tokens: t };
}

// Authenticated Google API call with retry on temporary failures; 401 forces one refresh.
export async function googleFetch<T = any>(store: TokenStore, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  return withRetry(async () => {
    const { token } = await accessToken(store);
    let r: Response;
    try {
      r = await fetch(url, { method: init.method ?? 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw classify(undefined, e instanceof Error ? e.message : 'network error');
    }
    if (r.status === 204) return undefined as T;
    const j = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      const msg = j?.error?.message ?? `Google rejected the request (${r.status})`;
      const err = classify(r.status, msg);
      if (r.status === 401) {
        await store.markBad('Google rejected the access token; reconnect the account');
        err.code = 'needs_reconnect';
        err.message = 'Google access was revoked or has expired. Reconnect the Google account';
      } else if (r.status === 403 && /insufficient|scope/i.test(msg)) {
        err.message = 'The Google account did not grant the permissions needed; reconnect and accept all of them';
      } else if (r.status !== 429 && r.status < 500) err.message = msg;
      err.httpStatus = r.status;
      throw err;
    }
    return j as T;
  });
}
