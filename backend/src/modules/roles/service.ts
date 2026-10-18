import { and, count, eq } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { memberships, rolePermissions, roles } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js';
import { ALL_PERMISSIONS, isPermission } from '../../core/rbac/permissions.js';
import type { AuthContext } from '../../core/auth/context.js';

async function permsOf(roleId: string, base: string): Promise<string[]> {
  if (base === 'owner') return [...ALL_PERMISSIONS];
  const rows = await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  return rows.map((r) => r.p).sort();
}

export async function listRoles(workspaceId: string) {
  const rs = await db.select().from(roles).where(eq(roles.workspaceId, workspaceId)).orderBy(roles.createdAt);
  const counts = await db.select({ roleId: memberships.roleId, n: count() }).from(memberships).where(eq(memberships.workspaceId, workspaceId)).groupBy(memberships.roleId);
  const byRole = new Map(counts.map((c) => [c.roleId, c.n]));
  return Promise.all(rs.map(async (r) => ({ id: r.id, name: r.name, baseLevel: r.baseLevel, memberCount: byRole.get(r.id) ?? 0, permissions: await permsOf(r.id, r.baseLevel) })));
}

function checkPerms(perms: string[]) {
  const bad = perms.filter((p) => !isPermission(p));
  if (bad.length) throw badRequest(`Unknown permissions: ${bad.join(', ')}`, undefined, 'unknown_permission');
  return [...new Set(perms)];
}

async function getRole(workspaceId: string, id: string) {
  const [r] = await db.select().from(roles).where(and(eq(roles.workspaceId, workspaceId), eq(roles.id, id)));
  if (!r) throw notFound('Role');
  return r;
}

export async function createRole(actor: AuthContext, i: { name: string; baseLevel: 'admin' | 'user'; permissions: string[] }) {
  const perms = checkPerms(i.permissions);
  if (i.baseLevel === 'admin' && actor.baseLevel !== 'owner') throw forbidden('Only the Owner can create admin-level roles');
  return db.transaction(async (tx) => {
    const dup = await tx.select({ id: roles.id }).from(roles).where(and(eq(roles.workspaceId, actor.workspaceId), eq(roles.name, i.name)));
    if (dup.length) throw conflict('A role with this name already exists', undefined, 'role_exists');
    const [r] = await tx.insert(roles).values({ workspaceId: actor.workspaceId, name: i.name, baseLevel: i.baseLevel }).returning();
    if (perms.length) await tx.insert(rolePermissions).values(perms.map((permission) => ({ roleId: r!.id, workspaceId: actor.workspaceId, permission })));
    await audit.record(tx, { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'role.created', targetType: 'role', targetId: r!.id, after: { name: r!.name, baseLevel: r!.baseLevel, permissions: perms.sort() } });
    return { id: r!.id, name: r!.name, baseLevel: r!.baseLevel, permissions: perms.sort() };
  });
}

export async function updateRole(actor: AuthContext, id: string, patch: { name?: string; permissions?: string[] }) {
  const role = await getRole(actor.workspaceId, id);
  if (role.baseLevel === 'owner') throw forbidden('The Owner role cannot be changed');
  if (role.baseLevel === 'admin' && actor.baseLevel !== 'owner') throw forbidden('Only the Owner can change admin-level roles');
  const next = patch.permissions ? checkPerms(patch.permissions) : undefined;
  return db.transaction(async (tx) => {
    const before = { name: role.name, permissions: await permsOf(role.id, role.baseLevel) };
    if (patch.name && patch.name !== role.name) {
      const dup = await tx.select({ id: roles.id }).from(roles).where(and(eq(roles.workspaceId, actor.workspaceId), eq(roles.name, patch.name)));
      if (dup.length) throw conflict('A role with this name already exists', undefined, 'role_exists');
      await tx.update(roles).set({ name: patch.name }).where(eq(roles.id, role.id));
    }
    if (next) {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      if (next.length) await tx.insert(rolePermissions).values(next.map((permission) => ({ roleId: role.id, workspaceId: actor.workspaceId, permission })));
    }
    const after = { name: patch.name ?? role.name, permissions: (next ?? before.permissions).slice().sort() };
    await audit.record(tx, { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'role.permissions_changed', targetType: 'role', targetId: role.id, before, after });
    return { id: role.id, baseLevel: role.baseLevel, ...after };
  });
}

export async function deleteRole(actor: AuthContext, id: string) {
  const role = await getRole(actor.workspaceId, id);
  if (role.baseLevel === 'owner') throw forbidden('The Owner role cannot be deleted');
  if (role.baseLevel === 'admin' && actor.baseLevel !== 'owner') throw forbidden('Only the Owner can delete admin-level roles');
  await db.transaction(async (tx) => {
    const [{ n }] = (await tx.select({ n: count() }).from(memberships).where(eq(memberships.roleId, id))) as [{ n: number }];
    if (n > 0) throw conflict(`${n} member(s) still have this role`, 'Move them to another role first', 'role_in_use');
    await tx.delete(roles).where(eq(roles.id, id));
    await audit.record(tx, { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'role.deleted', targetType: 'role', targetId: id, before: { name: role.name, baseLevel: role.baseLevel } });
  });
}
