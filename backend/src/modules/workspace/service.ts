import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Tx } from '../../core/db/client.js';
import { assignmentRules, memberships, pipelines, rolePermissions, roles, stages, users, workspaces } from '../../core/db/schema/index.js';
import { ALL_PERMISSIONS, USER_PERMISSIONS } from '../../core/rbac/permissions.js';
import { audit } from '../../core/audit/index.js';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace';

export const DEFAULT_STAGES = [
  { name: 'New', isWon: false, isLost: false },
  { name: 'Qualified', isWon: false, isLost: false },
  { name: 'Proposal', isWon: false, isLost: false },
  { name: 'Won', isWon: true, isLost: false },
  { name: 'Lost', isWon: false, isLost: true },
];

export async function createPipelineWithStages(tx: Tx, workspaceId: string, name: string, isDefault: boolean, stageDefs = DEFAULT_STAGES) {
  const [pipeline] = await tx.insert(pipelines).values({ workspaceId, name, isDefault }).returning();
  const rows = await tx
    .insert(stages)
    .values(stageDefs.map((s, i) => ({ workspaceId, pipelineId: pipeline!.id, name: s.name, position: i, isWon: s.isWon, isLost: s.isLost })))
    .returning();
  return { pipeline: pipeline!, stages: rows };
}

export async function createWorkspace(
  tx: Tx,
  i: { name: string; slug?: string; timezone?: string; currency?: string },
) {
  const slug = i.slug ?? `${slugify(i.name)}-${randomBytes(3).toString('hex')}`;
  const [workspace] = await tx
    .insert(workspaces)
    .values({ name: i.name, slug, timezone: i.timezone ?? 'UTC', defaultCurrency: i.currency ?? 'USD' })
    .returning();
  const ws = workspace!.id;

  const mk = async (name: string, baseLevel: 'owner' | 'admin' | 'user', perms: readonly string[]) => {
    const [r] = await tx.insert(roles).values({ workspaceId: ws, name, baseLevel }).returning();
    if (perms.length) await tx.insert(rolePermissions).values(perms.map((permission) => ({ roleId: r!.id, workspaceId: ws, permission })));
    return r!;
  };
  const owner = await mk('Owner', 'owner', ALL_PERMISSIONS);
  const admin = await mk('Admin', 'admin', ALL_PERMISSIONS);
  const user = await mk('User', 'user', USER_PERMISSIONS);

  await createPipelineWithStages(tx, ws, 'Sales', true);
  await tx.insert(assignmentRules).values({
    workspaceId: ws,
    ackWindowSeconds: 300,
    maxOpenLeads: 20,
    idleSeconds: 86400,
    escalationLevels: [
      { kind: 'next_eligible', seconds: 300 },
      { kind: 'manager', seconds: 600 },
    ],
  });
  return { workspace: workspace!, roles: { owner, admin, user } };
}

export async function addMember(tx: Tx, workspaceId: string, userId: string, roleId: string) {
  const [m] = await tx.insert(memberships).values({ workspaceId, userId, roleId }).returning();
  return m!;
}

export async function getWorkspace(tx: Tx | typeof import('../../core/db/client.js').db, id: string) {
  const [w] = await tx.select().from(workspaces).where(eq(workspaces.id, id));
  return w!;
}

export async function updateWorkspace(
  tx: Tx,
  actorId: string,
  id: string,
  patch: { name?: string; timezone?: string; defaultCurrency?: string },
) {
  const before = await getWorkspace(tx, id);
  const [after] = await tx.update(workspaces).set(patch).where(eq(workspaces.id, id)).returning();
  await audit.record(tx, {
    workspaceId: id,
    actorId,
    action: 'workspace.updated',
    targetType: 'workspace',
    targetId: id,
    before: { name: before.name, timezone: before.timezone, defaultCurrency: before.defaultCurrency },
    after: { name: after!.name, timezone: after!.timezone, defaultCurrency: after!.defaultCurrency },
  });
  return after!;
}

