import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, type Tx } from '../../core/db/client.js';
import { invites, leads, memberships, roles, users } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { randomToken, sha256 } from '../../core/crypto/index.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../core/errors.js';
import { hashPassword, verifyPassword } from '../../core/auth/password.js';
import { revokeAllForUser } from '../../core/auth/sessions.js';
import type { AuthContext } from '../../core/auth/context.js';
import { leadHooks } from '../../core/lead-hooks.js';
import { realtime } from '../../core/realtime/index.js';
import { env } from '../../core/env.js';
import { addMember } from '../workspace/service.js';

export type Availability = 'available' | 'busy' | 'on_leave' | 'offline';

export async function listMembers(workspaceId: string) {
  return db
    .select({
      id: users.id,
      membershipId: memberships.id,
      name: users.name,
      email: users.email,
      roleId: memberships.roleId,
      roleName: roles.name,
      baseLevel: roles.baseLevel,
      availability: memberships.availability,
      active: memberships.active,
      telegramLinked: memberships.telegramChatId,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(users.name)
    .then((rows) => rows.map((r) => ({ ...r, telegramLinked: !!r.telegramLinked })));
}

async function loadTarget(tx: Tx, workspaceId: string, userId: string) {
  const [t] = await tx
    .select({ membershipId: memberships.id, roleId: memberships.roleId, active: memberships.active, availability: memberships.availability, baseLevel: roles.baseLevel, roleName: roles.name })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  if (!t) throw notFound('User');
  return t;
}

async function loadRole(tx: Tx, workspaceId: string, roleId: string) {
  const [r] = await tx.select().from(roles).where(and(eq(roles.workspaceId, workspaceId), eq(roles.id, roleId)));
  if (!r) throw badRequest('Role does not exist in this workspace', undefined, 'unknown_role');
  return r;
}

// Admin cannot touch the Owner, and only the Owner may hand out or remove admin-level roles (F1.2).
function assertCanManage(actor: AuthContext, targetBase: string, newBase?: string) {
  if (targetBase === 'owner' && actor.baseLevel !== 'owner') throw forbidden('Only the Owner can modify the Owner');
  if (targetBase === 'owner') throw forbidden('The Owner role cannot be changed', 'Ownership transfer is not supported');
  if (newBase === 'owner') throw forbidden('The Owner role cannot be assigned', 'A workspace has exactly one Owner');
  if (actor.baseLevel !== 'owner' && (targetBase === 'admin' || newBase === 'admin')) throw forbidden('Only the Owner can grant or remove admin access');
}

export async function createInvite(actor: AuthContext, i: { email: string; roleId: string }) {
  return db.transaction(async (tx) => {
    const role = await loadRole(tx, actor.workspaceId, i.roleId);
    assertCanManage(actor, 'user', role.baseLevel);
    const email = i.email.toLowerCase();
    const [member] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, actor.workspaceId), eq(users.email, email)));
    if (member) throw conflict('This person is already in the workspace', undefined, 'already_member');
    const token = randomToken(24);
    const [inv] = await tx
      .insert(invites)
      .values({ workspaceId: actor.workspaceId, email, roleId: role.id, tokenHash: sha256(token), invitedBy: actor.userId, expiresAt: new Date(Date.now() + 7 * 86400_000) })
      .returning();
    await audit.record(tx, { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'user.invited', targetType: 'invite', targetId: inv!.id, after: { email, roleId: role.id, role: role.name } });
    return { id: inv!.id, email, roleId: role.id, expiresAt: inv!.expiresAt, inviteUrl: `${env.APP_URL.replace(/\/$/, '')}/accept-invite?token=${token}` };
  });
}

export const listInvites = (workspaceId: string) =>
  db
    .select({ id: invites.id, email: invites.email, roleId: invites.roleId, expiresAt: invites.expiresAt, acceptedAt: invites.acceptedAt })
    .from(invites)
    .where(and(eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));

export async function revokeInvite(actor: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const rows = await tx.delete(invites).where(and(eq(invites.workspaceId, actor.workspaceId), eq(invites.id, id), isNull(invites.acceptedAt))).returning();
    if (!rows.length) throw notFound('Invite');
    await audit.record(tx, { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'invite.revoked', targetType: 'invite', targetId: id, before: { email: rows[0]!.email } });
  });
}

export async function acceptInvite(i: { token: string; name: string; password: string }) {
  const [inv] = await db.select().from(invites).where(and(eq(invites.tokenHash, sha256(i.token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
  if (!inv) throw badRequest('This invite is invalid or has expired', 'Ask your admin for a new invite link', 'invite_invalid');

  return db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(eq(users.email, inv.email));
    if (user) {
      if (!(await verifyPassword(user.passwordHash, i.password))) throw badRequest('An account with this email exists; enter its password to join', undefined, 'email_in_use');
    } else {
      [user] = await tx.insert(users).values({ email: inv.email, name: i.name, passwordHash: await hashPassword(i.password) }).returning();
    }
    await addMember(tx, inv.workspaceId, user!.id, inv.roleId);
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inv.id));
    await audit.record(tx, { workspaceId: inv.workspaceId, actorId: user!.id, action: 'invite.accepted', targetType: 'user', targetId: user!.id, after: { email: inv.email, roleId: inv.roleId } });
    return { user: user!, workspaceId: inv.workspaceId };
  });
}

export async function updateMember(actor: AuthContext, userId: string, patch: { roleId?: string; active?: boolean }) {
  const result = await db.transaction(async (tx) => {
    const target = await loadTarget(tx, actor.workspaceId, userId);
    const newRole = patch.roleId ? await loadRole(tx, actor.workspaceId, patch.roleId) : undefined;
    assertCanManage(actor, target.baseLevel, newRole?.baseLevel);
    if (patch.active === false && userId === actor.userId) throw unprocessable('You cannot deactivate yourself');

    const set: Partial<typeof memberships.$inferInsert> = {};
    if (newRole) set.roleId = newRole.id;
    if (patch.active !== undefined) set.active = patch.active;
    if (patch.active === false) {
      set.availability = 'offline';
      set.availabilityChangedAt = new Date();
    }
    await tx.update(memberships).set(set).where(eq(memberships.id, target.membershipId));

    if (newRole && newRole.id !== target.roleId) {
      await audit.record(tx, { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'user.role_changed', targetType: 'user', targetId: userId, before: { roleId: target.roleId, role: target.roleName }, after: { roleId: newRole.id, role: newRole.name } });
    }
    if (patch.active !== undefined && patch.active !== target.active) {
      await audit.record(tx, { workspaceId: actor.workspaceId, actorId: actor.userId, action: patch.active ? 'user.reactivated' : 'user.deactivated', targetType: 'user', targetId: userId, before: { active: target.active }, after: { active: patch.active } });
      if (!patch.active) await leadHooks.onAvailabilityChange(tx, { workspaceId: actor.workspaceId, userId, status: 'offline' });
    }
    return { deactivated: patch.active === false };
  });
  if (result.deactivated) await revokeAllForUser(userId, actor.workspaceId);
  realtime.publish(actor.workspaceId, { type: 'availability.changed', ids: { userId } });
}

export async function setAvailability(actor: AuthContext, userId: string, status: Availability) {
  return db.transaction(async (tx) => {
    const target = await loadTarget(tx, actor.workspaceId, userId);
    if (userId !== actor.userId && actor.baseLevel === 'user' && !actor.permissions.has('users.manage')) {
      throw forbidden('You can only change your own availability');
    }
    if (target.baseLevel === 'owner' && actor.baseLevel !== 'owner' && userId !== actor.userId) throw forbidden('Only the Owner can modify the Owner');
    if (!target.active) throw unprocessable('This user is deactivated');

    await tx.update(memberships).set({ availability: status, availabilityChangedAt: new Date() }).where(eq(memberships.id, target.membershipId));
    if (target.availability !== status) {
      await audit.record(tx, { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'availability.changed', targetType: 'user', targetId: userId, before: { availability: target.availability }, after: { availability: status } });
      const r = await leadHooks.onAvailabilityChange(tx, { workspaceId: actor.workspaceId, userId, status, actorId: actor.userId });
      if (r) return { status, reassigned: r.reassigned, flaggedAway: r.flaggedAway };
    }
    return { status, reassigned: 0, flaggedAway: 0 };
  }).then((r) => {
    realtime.publish(actor.workspaceId, { type: 'availability.changed', ids: { userId } });
    return r;
  });
}

export async function availabilityBoard(workspaceId: string) {
  const members = await listMembers(workspaceId);
  const open = await db.select({ ownerId: leads.ownerId, status: leads.status }).from(leads).where(eq(leads.workspaceId, workspaceId));
  const counts = new Map<string, number>();
  for (const l of open) if (l.ownerId && (l.status === 'assigned' || l.status === 'acknowledged')) counts.set(l.ownerId, (counts.get(l.ownerId) ?? 0) + 1);
  return members.filter((m) => m.active).map((m) => ({ userId: m.id, name: m.name, status: m.availability, openLeads: counts.get(m.id) ?? 0 }));
}
