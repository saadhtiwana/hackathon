import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors.js';
import { clearSessionCookie, createSession, requireAuth, revokeAllForUser, revokeSession } from '../../core/auth/sessions.js';
import { db } from '../../core/db/client.js';
import { memberships } from '../../core/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { login, meSummary, signup } from './service.js';
import { acceptInvite } from '../users/service.js';

const password = z.string().min(8, 'Use at least 8 characters').max(200);
const email = z.string().trim().toLowerCase().email().max(200);

const signupBody = z.object({ workspaceName: z.string().trim().min(2).max(80), name: z.string().trim().min(1).max(80), email, password }).strict();
const loginBody = z.object({ email, password: z.string().min(1).max(200), workspaceId: z.string().uuid().optional() }).strict();
const acceptBody = z.object({ token: z.string().min(10).max(200), name: z.string().trim().min(1).max(80), password }).strict();

export const authRouter = Router();

authRouter.post(
  '/auth/signup',
  asyncHandler(async (req, res) => {
    const body = signupBody.parse(req.body);
    const { user, workspace } = await signup(body);
    await createSession(res, user.id, workspace.id);
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email }, workspace: { id: workspace.id, name: workspace.name } });
  }),
);

authRouter.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const body = loginBody.parse(req.body);
    const { user, workspaceId } = await login({ ...body, ip: req.ip ?? 'unknown' });
    await createSession(res, user.id, workspaceId);
    res.json({ user: { id: user.id, name: user.name, email: user.email }, workspaceId });
  }),
);

authRouter.post(
  '/auth/accept-invite',
  asyncHandler(async (req, res) => {
    const body = acceptBody.parse(req.body);
    const { user, workspaceId } = await acceptInvite(body);
    await createSession(res, user.id, workspaceId);
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email }, workspaceId });
  }),
);

authRouter.post(
  '/auth/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeSession(req.auth!.sessionId);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

authRouter.post(
  '/auth/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeAllForUser(req.auth!.userId);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    const s = await meSummary(a.userId, a.workspaceId, a.roleId);
    const [m] = await db.select({ availability: memberships.availability, telegramLinked: memberships.telegramChatId }).from(memberships).where(eq(memberships.id, a.membershipId));
    res.json({ ...s, permissions: [...a.permissions], availability: m?.availability ?? a.availability, telegramLinked: !!m?.telegramLinked });
  }),
);
