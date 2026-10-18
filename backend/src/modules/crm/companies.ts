import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { companies, contacts } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { getOr404, inWorkspace, updateVersioned } from '../../core/db/scoped.js';
import { decodeCursor, escapeLike, orderBy, page } from '../../core/http/list.js';
import type { AuthContext } from '../../core/auth/context.js';
import { diff } from './shared.js';

export async function listCompanies(ws: string, q: { limit: number; cursor?: string; q?: string; sort?: string; dir: 'asc' | 'desc' }) {
  const offset = decodeCursor(q.cursor);
  const where = inWorkspace(companies, ws, q.q ? or(ilike(companies.name, `%${escapeLike(q.q)}%`), ilike(companies.domain, `%${escapeLike(q.q)}%`)) : undefined);
  const rows = await db
    .select()
    .from(companies)
    .where(where)
    .orderBy(...orderBy({ name: companies.name, created_at: companies.createdAt }, 'created_at', q.sort, q.dir, companies.id))
    .limit(q.limit + 1)
    .offset(offset);
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(where)) as [{ n: number }];
  return page(rows, q.limit, offset, n);
}

export async function getCompany(ws: string, id: string) {
  const company = await getOr404(db, companies, ws, id, 'Company');
  const people = await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email }).from(contacts).where(and(eq(contacts.workspaceId, ws), eq(contacts.companyId, id)));
  return { company, contacts: people };
}

export async function createCompany(a: AuthContext, i: { name: string; domain?: string | null; phone?: string | null; address?: string | null }) {
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(companies).values({ workspaceId: a.workspaceId, ...i }).returning();
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'company.created', targetType: 'company', targetId: c!.id, after: { name: c!.name } });
    return c!;
  });
}

export async function updateCompany(a: AuthContext, id: string, version: number, patch: { name?: string; domain?: string | null; phone?: string | null; address?: string | null }) {
  return db.transaction(async (tx) => {
    const cur = await getOr404(tx, companies, a.workspaceId, id, 'Company');
    const d = diff(cur as Record<string, unknown>, patch);
    const c = await updateVersioned(tx, companies, a.workspaceId, id, version, { ...patch, updatedAt: new Date() }, 'Company');
    if (d.changed.length) await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'company.updated', targetType: 'company', targetId: id, before: d.before, after: d.after });
    return c;
  });
}

export async function deleteCompany(a: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const cur = await getOr404(tx, companies, a.workspaceId, id, 'Company');
    await tx.delete(companies).where(and(eq(companies.workspaceId, a.workspaceId), eq(companies.id, id))); // contacts.company_id is SET NULL
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'company.deleted', targetType: 'company', targetId: id, before: { name: cur.name } });
  });
}
