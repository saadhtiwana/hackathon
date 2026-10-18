import { and, count, eq, gt } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { loginAttempts, memberships, roles, users, workspaces } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { conflict, tooMany, unauthorized } from '../../core/errors.js';
import { hashPassword, verifyPassword } from '../../core/auth/password.js';
import { addMember, createWorkspace } from '../workspace/service.js';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function signup(i: { workspaceName: string; name: string; email: string; password: string }) {
  const email = i.email.toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw conflict('An account with this email already exists', 'Sign in instead', 'email_in_use');
  const passwordHash = await hashPassword(i.password);

  return db.transaction(async (tx) => {
    const { workspace, roles: r } = await createWorkspace(tx, { name: i.workspaceName });
    const [user] = await tx.insert(users).values({ email, name: i.name, passwordHash }).returning();
    await addMember(tx, workspace.id, user!.id, r.owner.id);
    await audit.record(tx, { workspaceId: workspace.id, actorId: user!.id, action: 'workspace.created', targetType: 'workspace', targetId: workspace.id, after: { name: workspace.name } });
    return { user: user!, workspace };
  });
}

// Lockout is per (ip, email): 5 failures inside 15 minutes block further attempts until the oldest ages out.
async function recentFailures(email: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [r] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
  return r?.n ?? 0;
}

export async function login(i: { email: string; password: string; workspaceId?: string; ip: string }) {
  const email = i.email.toLowerCase();
  if ((await recentFailures(email, i.ip)) >= MAX_FAILURES) {
    throw tooMany('Too many failed sign-in attempts', 'Wait 15 minutes and try again');
  }
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = await verifyPassword(user?.passwordHash ?? null, i.password);
  if (!user || !ok) {
    await db.insert(loginAttempts).values({ email, ip: i.ip, success: false });
    throw unauthorized('Email or password is incorrect', 'Check your details and try again');
  }

  const rows = await db
    .select({ membershipId: memberships.id, workspaceId: memberships.workspaceId })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.active, true), i.workspaceId ? eq(memberships.workspaceId, i.workspaceId) : undefined))
    .orderBy(memberships.createdAt);
  const m = rows[0];
  if (!m) throw unauthorized('This account has no active workspace', 'Ask your admin to reactivate you');

  await db.delete(loginAttempts).where(and(eq(loginAttempts.email, email), eq(loginAttempts.ip, i.ip)));
  return { user, workspaceId: m.workspaceId };
}

export async function meSummary(userId: string, workspaceId: string, roleId: string) {
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
  const [w] = await db.select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, timezone: workspaces.timezone, defaultCurrency: workspaces.defaultCurrency }).from(workspaces).where(eq(workspaces.id, workspaceId));
  const [r] = await db.select({ id: roles.id, name: roles.name, baseLevel: roles.baseLevel }).from(roles).where(eq(roles.id, roleId));
  return { user: u!, workspace: w!, role: r! };
}

