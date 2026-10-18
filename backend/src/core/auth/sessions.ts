import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memberships, rolePermissions, roles, sessions } from '../db/schema/index.js';
import { env } from '../env.js';
import { randomToken, sha256 } from '../crypto/index.js';
import { ALL_PERMISSIONS, isPermission, type Permission } from '../rbac/permissions.js';
import { unauthorized } from '../errors.js';
import type { AuthContext } from './context.js';

export const COOKIE = 'relay_sid';
const SEVEN_DAYS = 7 * 24 * 3600 * 1000;

const cookieOpts = (): CookieOptions => ({
  httpOnly: true,
  secure: env.secureCookies,
  sameSite: 'lax',
  path: '/',
  maxAge: SEVEN_DAYS,
});

export async function createSession(res: Response, userId: string, workspaceId: string) {
  const token = randomToken(32);
  await db.insert(sessions).values({
    userId,
    workspaceId,
    tokenHash: sha256(token),
    csrfToken: randomToken(16),
    expiresAt: new Date(Date.now() + SEVEN_DAYS),
  });
  res.cookie(COOKIE, token, cookieOpts());
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export async function loadPermissions(roleId: string, baseLevel: string): Promise<Set<Permission>> {
  if (baseLevel === 'owner') return new Set(ALL_PERMISSIONS);
  const rows = await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  return new Set(rows.map((r) => r.p).filter(isPermission));
}

export async function authenticate(token: string): Promise<AuthContext | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      workspaceId: sessions.workspaceId,
      membershipId: memberships.id,
      roleId: memberships.roleId,
      availability: memberships.availability,
      baseLevel: roles.baseLevel,
    })
    .from(sessions)
    .innerJoin(memberships, and(eq(memberships.userId, sessions.userId), eq(memberships.workspaceId, sessions.workspaceId), eq(memberships.active, true)))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  return { ...row, permissions: await loadPermissions(row.roleId, row.baseLevel) };
}

export const sessionMiddleware: RequestHandler = async (req, _res, next) => {
  try {
    const token = readCookie(req, COOKIE);
    if (token) req.auth = (await authenticate(token)) ?? undefined;
    next();
  } catch (e) {
    next(e);
  }
};

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized('Your session has expired', 'Sign in again'));
  next();
}

export const revokeSession = (sessionId: string) => db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
export const revokeAllForUser = (userId: string, workspaceId?: string) =>
  db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), workspaceId ? eq(sessions.workspaceId, workspaceId) : undefined));
