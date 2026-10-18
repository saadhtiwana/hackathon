import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from '../../../core/crypto/index.js';
import { env } from '../../../core/env.js';
import { ProviderError, classify } from '../errors.js';

export type Purpose = 'calendar' | 'mailbox';

const SCOPES: Record<Purpose, string[]> = {
  calendar: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy'],
  mailbox: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
};

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);

export interface OAuthState {
  u: string; // user the connection belongs to (or acts for)
  w: string; // workspace
  p: Purpose;
  n: string; // nonce, redeemed once at the callback
  e: number; // expiry, ms
}

const sign = (body: string) => createHmac('sha256', env.SESSION_SECRET).update(`oauth.${body}`).digest('base64url');

// The callback hits the API host directly with no cookie, so the state carries who and why, signed.
export function signState(i: { userId: string; workspaceId: string; purpose: Purpose; ttlMs: number }): string {
  const s: OAuthState = { u: i.userId, w: i.workspaceId, p: i.purpose, n: randomBytes(12).toString('base64url'), e: Date.now() + i.ttlMs };
  const body = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyState(token: string): OAuthState | null {
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as OAuthState;
    return s.e > Date.now() && (s.p === 'calendar' || s.p === 'mailbox') ? s : null;
  } catch {
    return null;
  }
}

export function consentUrl(purpose: Purpose, state: string): string {
  if (!googleConfigured()) throw new ProviderError('Google sign-in is not configured on the server', false, 'not_configured');
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES[purpose].join(' '),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  scope?: string;
  historyId?: string;
  // Mailbox only: the plus-address customers write to, and when the mailbox was connected.
  agencyEmail?: string;
  connectedAt?: number;
}

async function tokenCall(params: Record<string, string>) {
  let r: Response;
  try {
    r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }), signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw classify(undefined, e instanceof Error ? e.message : 'network error');
  }
  const j = (await r.json().catch(() => ({}))) as Record<string, any>;
  if (!r.ok) {
    if (j.error === 'invalid_grant') throw new ProviderError('Google access was revoked or has expired. Reconnect the Google account', false, 'needs_reconnect', r.status);
    throw classify(r.status, j.error_description ?? j.error ?? 'Google rejected the request');
  }
  return j;
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const j = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: process.env.GOOGLE_REDIRECT_URI! });
  if (!j.refresh_token) throw new ProviderError('Google did not return offline access. Remove the app from your Google account permissions and connect again', false, 'no_refresh_token');
  let email: string | undefined;
  if (j.id_token) {
    try {
      email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1]!, 'base64url').toString()).email;
    } catch {
      /* email stays unknown */
    }
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000, email, scope: j.scope };
}

export async function refreshAccess(t: GoogleTokens): Promise<GoogleTokens> {
  const j = await tokenCall({ grant_type: 'refresh_token', refresh_token: t.refreshToken });
  return { ...t, accessToken: j.access_token, expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
}

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(10_000) }).catch(() => {});
}

// ahmad@gmail.com + workspace slug "margalla-estates" -> ahmad+margalla@gmail.com
export function agencyAddressFor(mailbox: string, workspaceSlug: string): string {
  const [local, domain] = mailbox.toLowerCase().split('@');
  const tag = (workspaceSlug.split('-')[0] || 'agency').replace(/[^a-z0-9]/g, '');
  return `${(local ?? '').split('+')[0]}+${tag}@${domain}`;
}
