import { and, desc, eq, gte, isNull, like, lte, sql } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { auditLog, users } from '../../core/db/schema/index.js';
import { decodeCursor, escapeLike, page } from '../../core/http/list.js';

export interface AuditFilters {
  limit: number;
  cursor?: string;
  action?: string; // exact event, or a prefix ending in "*" such as "lead.*"
  actorId?: string; // user id, or "system"
  targetType?: string;
  from?: Date;
  to?: Date;
}

// Read-only on purpose: there is no write path here, and the database refuses UPDATE and DELETE (F4.3).
export async function listAudit(ws: string, f: AuditFilters) {
  const offset = decodeCursor(f.cursor);
  const where = and(
    eq(auditLog.workspaceId, ws),
    f.action ? (f.action.endsWith('*') ? like(auditLog.action, `${escapeLike(f.action.slice(0, -1))}%`) : eq(auditLog.action, f.action)) : undefined,
    f.actorId ? (f.actorId === 'system' ? isNull(auditLog.actorId) : eq(auditLog.actorId, f.actorId)) : undefined,
    f.targetType ? eq(auditLog.targetType, f.targetType) : undefined,
    f.from ? gte(auditLog.createdAt, f.from) : undefined,
    f.to ? lte(auditLog.createdAt, f.to) : undefined,
  );
  const rows = await db
    .select({ id: auditLog.id, actorId: auditLog.actorId, actorName: users.name, action: auditLog.action, targetType: auditLog.targetType, targetId: auditLog.targetId, before: auditLog.before, after: auditLog.after, createdAt: auditLog.createdAt })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(f.limit + 1)
    .offset(offset);
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where)) as [{ n: number }];
  const p = page(rows, f.limit, offset, n);
  return { ...p, items: p.items.map(({ actorName, ...r }) => ({ ...r, actor: r.actorId ? { id: r.actorId, name: actorName } : null })) };
}

export async function auditFacets(ws: string) {
  const [actions, actors] = await Promise.all([
    db.selectDistinct({ action: auditLog.action }).from(auditLog).where(eq(auditLog.workspaceId, ws)).orderBy(auditLog.action),
    db.selectDistinct({ id: users.id, name: users.name }).from(auditLog).innerJoin(users, eq(users.id, auditLog.actorId)).where(eq(auditLog.workspaceId, ws)).orderBy(users.name),
  ]);
  return { actions: actions.map((a) => a.action), actors };
}
