import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../core/db/client.js';
import { integrationConnections, memberships, userConnections, users } from '../../../core/db/schema/index.js';
import { audit } from '../../../core/audit/index.js';
import { encrypt } from '../../../core/crypto/index.js';
import { env } from '../../../core/env.js';
import { asyncHandler, forbidden, unauthorized } from '../../../core/errors.js';
import { integrationEvents } from '../../../core/integration-events/index.js';
import { logger } from '../../../core/logger.js';
import { requirePermission } from '../../../core/rbac/index.js';
import { ProviderError } from '../errors.js';
import { consentUrl, exchangeCode, signState, verifyState, type Purpose } from './oauth.js';

const back = (qs: Record<string, string>) => `${env.APP_URL.replace(/\/$/, '')}/settings/integrations?${new URLSearchParams(qs)}`;
const TTL = { link: 24 * 3600_000, session: 15 * 60_000 };

export const googleRouter = Router();

// Entry point: a logged-in user, or a signed link made by an admin (so the Google account owner needs no session).
googleRouter.get('/integrations/google/connect', asyncHandler(async (req, res) => {
  const q = z.object({ purpose: z.enum(['calendar', 'mailbox']).optional(), token: z.string().optional() }).parse(req.query);
  let state: string;
  let purpose: Purpose;
  if (q.token) {
    const s = verifyState(q.token);
    if (!s) throw unauthorized('This connect link is invalid or has expired', 'Ask an admin for a new link');
    state = q.token;
    purpose = s.p;
  } else {
    if (!req.auth) throw unauthorized('Sign in to connect Google');
    purpose = q.purpose ?? 'calendar';
    if (purpose === 'mailbox' && !req.auth.permissions.has('integrations.manage')) throw forbidden('Only users who manage integrations can connect the agency mailbox');
    state = signState({ userId: req.auth.userId, workspaceId: req.auth.workspaceId, purpose, ttlMs: TTL.session });
  }
  res.redirect(302, consentUrl(purpose, state));
}));

export async function makeConnectLink(workspaceId: string, userId: string, purpose: Purpose) {
  const token = signState({ userId, workspaceId, purpose, ttlMs: TTL.link });
  const base = (env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
  return { url: `${base}/api/integrations/google/connect?token=${encodeURIComponent(token)}`, expiresAt: new Date(Date.now() + TTL.link) };
}

googleRouter.post('/integrations/google/connect-link', requirePermission('integrations.manage'), asyncHandler(async (req, res) => {
  const b = z.object({ purpose: z.enum(['calendar', 'mailbox']), userId: z.string().uuid().optional() }).strict().parse(req.body);
  const userId = b.userId ?? req.auth!.userId;
  const [m] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.workspaceId, req.auth!.workspaceId), eq(memberships.userId, userId), eq(memberships.active, true)));
  if (!m) throw forbidden('That user is not an active member');
  res.status(201).json(await makeConnectLink(req.auth!.workspaceId, userId, b.purpose));
}));

googleRouter.get('/integrations/google/callback', async (req, res) => {
  const q = z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }).safeParse(req.query);
  const p: { code?: string; state?: string; error?: string } = q.success ? q.data : {};
  const state = p.state ? verifyState(p.state) : null;
  if (!state) return void res.redirect(302, back({ google: 'error', reason: 'This connect link is invalid or has expired' }));
  const ws = state.w;
  try {
    if (!p.code) throw new ProviderError(p.error === 'access_denied' ? 'Google access was not granted' : 'Google did not return an authorisation code', false, 'denied');
    const tokens = await exchangeCode(p.code);
    const once = await integrationEvents.recordInbound({ workspaceId: ws, provider: 'google', type: `oauth.${state.p}`, externalId: state.n, result: 'ok', httpStatus: 302, ref: tokens.email });
    if (once.duplicate) throw new ProviderError('This connect link was already used. Ask an admin for a new one', false, 'link_used');

    if (state.p === 'calendar') {
      const values = { workspaceId: ws, userId: state.u, provider: 'google' as const, encryptedTokens: encrypt(JSON.stringify(tokens)), externalAccount: tokens.email ?? null, status: 'connected' as const, needsReconnect: false, tokenExpiresAt: new Date(tokens.expiresAt), updatedAt: new Date() };
      await db.transaction(async (tx) => {
        await tx.insert(userConnections).values(values).onConflictDoUpdate({ target: [userConnections.userId, userConnections.provider], set: values });
        await audit.record(tx, { workspaceId: ws, actorId: state.u, action: 'integration.connected', targetType: 'integration', targetId: 'google_calendar', after: { account: tokens.email } });
      });
    } else {
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, state.u));
      const values = { workspaceId: ws, provider: 'gmail' as const, status: 'connected' as const, encryptedConfig: encrypt(JSON.stringify(tokens)), secretLast4: null, lastOkAt: new Date(), lastError: null, updatedAt: new Date() };
      await db.transaction(async (tx) => {
        await tx.insert(integrationConnections).values(values).onConflictDoUpdate({ target: [integrationConnections.workspaceId, integrationConnections.provider], set: values });
        await audit.record(tx, { workspaceId: ws, actorId: user?.id ?? null, action: 'integration.connected', targetType: 'integration', targetId: 'email', after: { mailbox: tokens.email } });
      });
    }
    res.redirect(302, back({ google: 'connected', purpose: state.p, account: tokens.email ?? '' }));
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : 'Connecting Google failed. Please try again';
    logger.error('google callback failed', { err: e instanceof Error ? e.message : String(e) });
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'google', type: `oauth.${state.p}`, result: 'error', error: msg }).catch(() => {});
    res.redirect(302, back({ google: 'error', reason: msg }));
  }
});

// Calendar connection status for every member (I3.7).
googleRouter.get('/integrations/google/users', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const ws = req.auth!.workspaceId;
  const members = await db.select({ userId: users.id, name: users.name, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.workspaceId, ws), eq(memberships.active, true)));
  const conns = await db.select().from(userConnections).where(and(eq(userConnections.workspaceId, ws), eq(userConnections.provider, 'google')));
  res.json({
    items: members.map((m) => {
      const c = conns.find((x) => x.userId === m.userId);
      const status = !c ? 'not_connected' : c.needsReconnect || c.status === 'error' ? 'needs_reconnect' : 'connected';
      return { userId: m.userId, name: m.name, status, account: c?.externalAccount ?? null, bookable: status === 'connected', reason: status === 'not_connected' ? 'Has not connected a Google Calendar' : status === 'needs_reconnect' ? 'Calendar connection expired; needs to reconnect' : null };
    }),
  });
}));

