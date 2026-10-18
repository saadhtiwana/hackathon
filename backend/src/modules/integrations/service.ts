import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { integrationConnections, integrationEvents, userConnections } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { decrypt, encrypt } from '../../core/crypto/index.js';
import { integrationEvents as events } from '../../core/integration-events/index.js';
import { AppError, badRequest, notFound } from '../../core/errors.js';
import { decodeCursor, encodeCursor } from '../../core/http/list.js';
import { logger } from '../../core/logger.js';
import type { AuthContext } from '../../core/auth/context.js';
import type { AdapterContext, ProviderAdapter } from './adapter.js';
import { ProviderError } from './errors.js';
import { getAdapter, listAdapters } from './registry.js';
import { consentUrl, googleConfigured } from './google/adapter.js';
import { randomToken } from '../../core/crypto/index.js';

const mask = (last4: string | null) => (last4 ? `••••${last4}` : null);

async function getRow(ws: string, a: ProviderAdapter) {
  const [row] = await db.select().from(integrationConnections).where(and(eq(integrationConnections.workspaceId, ws), eq(integrationConnections.provider, a.dbProvider)));
  return row ?? null;
}

export async function loadConfig(ws: string, adapter: ProviderAdapter): Promise<Record<string, any> | null> {
  const row = await getRow(ws, adapter);
  if (!row?.encryptedConfig) return null;
  try {
    return JSON.parse(decrypt(row.encryptedConfig));
  } catch {
    return null;
  }
}

export async function markOk(ws: string, a: ProviderAdapter) {
  await db.update(integrationConnections).set({ status: 'connected', lastOkAt: new Date(), lastError: null, updatedAt: new Date() }).where(and(eq(integrationConnections.workspaceId, ws), eq(integrationConnections.provider, a.dbProvider)));
}

// Failures only flip this one integration's status; no other route is affected (I5.8).
export async function markError(ws: string, a: ProviderAdapter, message: string) {
  await db.update(integrationConnections).set({ status: 'error', lastErrorAt: new Date(), lastError: message, updatedAt: new Date() }).where(and(eq(integrationConnections.workspaceId, ws), eq(integrationConnections.provider, a.dbProvider)));
}

function plain(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof AppError) throw e;
  if ((e as { name?: string })?.name === 'ZodError') throw e;
  logger.error('integration call failed', { err: e instanceof Error ? e.message : String(e) });
  return new ProviderError('Unexpected problem talking to the provider', true, 'unexpected');
}

export async function listIntegrations(a: AuthContext) {
  const ws = a.workspaceId;
  const rows = await db.select().from(integrationConnections).where(eq(integrationConnections.workspaceId, ws));
  const errors = await db
    .select({ provider: integrationEvents.provider, type: integrationEvents.type, error: integrationEvents.error, createdAt: integrationEvents.createdAt })
    .from(integrationEvents)
    .where(and(eq(integrationEvents.workspaceId, ws)))
    .orderBy(desc(integrationEvents.createdAt))
    .limit(200);
  const userConns = await db.select().from(userConnections).where(and(eq(userConnections.workspaceId, ws), eq(userConnections.provider, 'google')));

  return listAdapters().map((ad) => {
    const lim = ad.describeLimits();
    const recentErrors = errors.filter((e) => e.provider === ad.dbProvider && e.error).slice(0, 5).map((e) => ({ type: e.type, message: e.error, at: e.createdAt }));
    if (ad.perUser) {
      const ok = userConns.filter((u) => u.status === 'connected' && !u.needsReconnect);
      const bad = userConns.filter((u) => u.needsReconnect || u.status === 'error');
      return {
        provider: ad.id, label: ad.label, perUser: true,
        status: ok.length ? 'connected' : bad.length ? 'error' : 'not_connected',
        connectedUsers: ok.length, needsReconnect: bad.length, configured: googleConfigured(),
        lastOkAt: null, lastErrorAt: null, lastError: null, secretMasked: null, recentErrors, limits: lim,
      };
    }
    const row = rows.find((r) => r.provider === ad.dbProvider);
    return {
      provider: ad.id, label: ad.label, perUser: false,
      status: row?.status ?? 'not_connected',
      lastOkAt: row?.lastOkAt ?? null, lastErrorAt: row?.lastErrorAt ?? null, lastError: row?.lastError ?? null,
      secretMasked: mask(row?.secretLast4 ?? null), recentErrors, limits: lim,
    };
  });
}

function adapterOr404(id: string) {
  const ad = getAdapter(id);
  if (!ad) throw notFound('Integration');
  return ad;
}

export async function connect(a: AuthContext, id: string, input: unknown) {
  const ad = adapterOr404(id);
  const ws = a.workspaceId;
  const ctx: AdapterContext = { workspaceId: ws, actorId: a.userId, config: await loadConfig(ws, ad) };

  if (ad.perUser) {
    const state = randomToken(16);
    return { authUrl: consentUrl(state), state };
  }

  const before = await getRow(ws, ad);
  let result;
  try {
    result = await ad.connect(ctx, input);
  } catch (e) {
    const pe = plain(e);
    await events.recordOutbound({ workspaceId: ws, provider: ad.dbProvider, type: 'connect', result: 'error', httpStatus: pe.httpStatus, error: pe.message });
    if (before) await markError(ws, ad, pe.message);
    throw new AppError(pe.temporary ? 503 : 422, pe.code, pe.message, pe.temporary ? 'This looks temporary; try again in a moment' : 'Check the details and try again');
  }

  // Replace the old endpoint's remote state if we were already connected.
  if (before?.encryptedConfig && ctx.config) await ad.disconnect(ctx).catch(() => {});

  const values = { workspaceId: ws, provider: ad.dbProvider, status: 'connected' as const, encryptedConfig: encrypt(JSON.stringify(result.config)), secretLast4: result.secretLast4, lastOkAt: new Date(), lastError: null, updatedAt: new Date() };
  await db.transaction(async (tx) => {
    await tx.insert(integrationConnections).values(values).onConflictDoUpdate({ target: [integrationConnections.workspaceId, integrationConnections.provider], set: values });
    await audit.record(tx, {
      workspaceId: ws, actorId: a.userId, action: before ? 'integration.reconnected' : 'integration.connected', targetType: 'integration', targetId: ad.id,
      before: before ? { status: before.status, secret: mask(before.secretLast4) } : null,
      after: { status: 'connected', secret: mask(result.secretLast4) },
    });
  });
  await events.recordOutbound({ workspaceId: ws, provider: ad.dbProvider, type: 'connect', result: 'ok' });
  await ad.afterConnect?.(ctx, result.config).catch((e) => logger.error('afterConnect failed', { provider: ad.id, err: e instanceof Error ? e.message : String(e) }));
  return { provider: ad.id, status: 'connected', secretMasked: mask(result.secretLast4) };
}

export async function testConnection(a: AuthContext, id: string) {
  const ad = adapterOr404(id);
  const ws = a.workspaceId;
  const config = await loadConfig(ws, ad);
  if (!ad.perUser && !config) throw badRequest(`${ad.label} is not connected`, 'Connect it first', 'not_connected');
  try {
    await ad.test({ workspaceId: ws, actorId: a.userId, config });
    if (!ad.perUser) await markOk(ws, ad);
    await events.recordOutbound({ workspaceId: ws, provider: ad.dbProvider, type: 'test', result: 'ok' });
    return { ok: true };
  } catch (e) {
    const pe = plain(e);
    if (!ad.perUser) await markError(ws, ad, pe.message);
    await events.recordOutbound({ workspaceId: ws, provider: ad.dbProvider, type: 'test', result: 'error', httpStatus: pe.httpStatus, error: pe.message });
    return { ok: false, error: { code: pe.code, message: pe.message, temporary: pe.temporary } };
  }
}

export async function disconnect(a: AuthContext, id: string) {
  const ad = adapterOr404(id);
  const ws = a.workspaceId;
  if (ad.perUser) {
    await db.delete(userConnections).where(and(eq(userConnections.workspaceId, ws), eq(userConnections.userId, a.userId), eq(userConnections.provider, ad.dbProvider)));
    await audit.record(db, { workspaceId: ws, actorId: a.userId, action: 'integration.disconnected', targetType: 'integration', targetId: ad.id, before: { scope: 'own account' } });
    return;
  }
  const row = await getRow(ws, ad);
  if (!row) throw badRequest(`${ad.label} is not connected`, undefined, 'not_connected');
  const config = await loadConfig(ws, ad);
  let remoteWarning: string | null = null;
  try {
    await ad.disconnect({ workspaceId: ws, actorId: a.userId, config });
  } catch (e) {
    remoteWarning = plain(e).message; // local disconnect still proceeds; the secret is gone either way
  }
  await db.transaction(async (tx) => {
    await tx.delete(integrationConnections).where(eq(integrationConnections.id, row.id));
    await audit.record(tx, { workspaceId: ws, actorId: a.userId, action: 'integration.disconnected', targetType: 'integration', targetId: ad.id, before: { status: row.status, secret: mask(row.secretLast4) }, after: { status: 'not_connected', remoteWarning } });
  });
  await events.recordOutbound({ workspaceId: ws, provider: ad.dbProvider, type: 'disconnect', result: remoteWarning ? 'error' : 'ok', error: remoteWarning ?? undefined });
}

export async function syncHistory(a: AuthContext, id: string, q: { limit: number; cursor?: string }) {
  const ad = adapterOr404(id);
  const offset = decodeCursor(q.cursor);
  const rows = await db
    .select()
    .from(integrationEvents)
    .where(and(eq(integrationEvents.workspaceId, a.workspaceId), eq(integrationEvents.provider, ad.dbProvider)))
    .orderBy(desc(integrationEvents.createdAt), desc(integrationEvents.id))
    .limit(q.limit + 1)
    .offset(offset);
  const more = rows.length > q.limit;
  return { items: (more ? rows.slice(0, q.limit) : rows).map(({ workspaceId: _w, ...e }) => e), nextCursor: more ? encodeCursor(offset + q.limit) : null };
}

