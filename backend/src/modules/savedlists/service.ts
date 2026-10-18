import { and, asc, eq, gte, ilike, isNull, lt, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { companies, contactTags, contacts, customFields, opportunities, savedLists, stages, users } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { getOr404 } from '../../core/db/scoped.js';
import { badRequest, forbidden, unprocessable } from '../../core/errors.js';
import { decodeCursor, escapeLike, page } from '../../core/http/list.js';
import type { AuthContext } from '../../core/auth/context.js';
import { z } from 'zod';

export type Entity = 'contacts' | 'opportunities';
const dbEntity = (e: Entity) => (e === 'contacts' ? ('contact' as const) : ('opportunity' as const));
const apiEntity = (e: 'contact' | 'opportunity'): Entity => (e === 'contact' ? 'contacts' : 'opportunities');

export const criterion = z.object({ field: z.string().min(1).max(60), op: z.enum(['is', 'is_not', 'contains', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'on']), value: z.union([z.string().max(300), z.number(), z.boolean()]) });
export type Criterion = z.infer<typeof criterion>;
export const criteria = z.array(criterion).min(1).max(10);

const FIELDS: Record<Entity, Record<string, { label: string; ops: Criterion['op'][] }>> = {
  contacts: {
    name: { label: 'Name', ops: ['contains', 'is'] },
    email: { label: 'Email', ops: ['contains', 'is'] },
    phone: { label: 'Phone', ops: ['contains', 'is'] },
    tag: { label: 'Tag', ops: ['is', 'is_not'] },
    owner: { label: 'Owner', ops: ['is', 'is_not'] },
    company: { label: 'Company', ops: ['is', 'is_not'] },
    created: { label: 'Created', ops: ['before', 'after', 'on'] },
    opted_out: { label: 'Opted out', ops: ['is'] },
  },
  opportunities: {
    name: { label: 'Name', ops: ['contains', 'is'] },
    stage: { label: 'Stage', ops: ['is', 'is_not'] },
    pipeline: { label: 'Pipeline', ops: ['is', 'is_not'] },
    owner: { label: 'Owner', ops: ['is', 'is_not'] },
    tag: { label: 'Contact tag', ops: ['is', 'is_not'] },
    value: { label: 'Value', ops: ['gt', 'gte', 'lt', 'lte', 'is'] },
    created: { label: 'Created', ops: ['before', 'after', 'on'] },
  },
};

// What the filter bar can offer, including this workspace's custom fields.
export async function schemaFor(ws: string, a: AuthContext) {
  const custom = await db.select().from(customFields).where(eq(customFields.workspaceId, ws)).orderBy(asc(customFields.position));
  const mk = (e: Entity) => [
    ...Object.entries(FIELDS[e]).filter(([k]) => k !== 'value' || a.permissions.has('crm.view_values')).map(([key, f]) => ({ key, ...f, kind: 'builtin' as const })),
    ...custom.filter((c) => c.entity === dbEntity(e)).map((c) => ({ key: `custom:${c.id}`, label: c.name, kind: 'custom' as const, type: c.type, options: c.options, ops: (c.type === 'number' ? ['is', 'gt', 'lt'] : c.type === 'date' ? ['before', 'after', 'on'] : c.type === 'checkbox' ? ['is'] : c.type === 'dropdown' ? ['is', 'is_not'] : ['contains', 'is']) as Criterion['op'][] })),
  ];
  return { contacts: mk('contacts'), opportunities: mk('opportunities') };
}

const num = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw unprocessable('A number is required for this filter', undefined, 'invalid_criteria');
  return n;
};
const date = (v: unknown) => {
  const d = new Date(String(v));
  if (Number.isNaN(+d)) throw unprocessable('A valid date is required for this filter', undefined, 'invalid_criteria');
  return d;
};
const uuid = (v: unknown) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(v))) throw unprocessable('A valid record is required for this filter', undefined, 'invalid_criteria');
  return String(v);
};

// Turns the criteria into one AND-ed condition, evaluated against the database every time the list is opened (F2.6).
function condition(entity: Entity, a: AuthContext, c: Criterion): SQL {
  const ws = a.workspaceId;
  const known = FIGURE_CHECK(entity, c);
  void known;
  const t = entity === 'contacts' ? contacts : opportunities;
  const created = t.createdAt;
  const tagExists = (contactCol: SQL | typeof contacts.id | typeof opportunities.contactId, tag: string) => sql`exists (select 1 from ${contactTags} ct where ct.contact_id = ${contactCol} and ct.tag_id = ${tag})`;

  if (c.field === 'created') {
    const d = date(c.value);
    if (c.op === 'before') return lt(created, d);
    if (c.op === 'after') return gte(created, new Date(d.getTime() + 86400_000));
    return and(gte(created, d), lt(created, new Date(d.getTime() + 86400_000)))!;
  }
  if (c.field === 'name') return c.op === 'is' ? sql`lower(${t.name}) = lower(${String(c.value)})` : ilike(t.name, `%${escapeLike(String(c.value))}%`);
  if (c.field === 'owner') {
    if (String(c.value) === 'none') return c.op === 'is' ? isNull(t.ownerId) : sql`${t.ownerId} is not null`;
    return c.op === 'is' ? eq(t.ownerId, uuid(c.value)) : sql`${t.ownerId} is distinct from ${uuid(c.value)}`;
  }
  if (c.field === 'tag') {
    const col = entity === 'contacts' ? contacts.id : opportunities.contactId;
    return c.op === 'is' ? tagExists(col, uuid(c.value)) : sql`not ${tagExists(col, uuid(c.value))}`;
  }
  if (entity === 'contacts') {
    if (c.field === 'email') return c.op === 'is' ? sql`lower(${contacts.email}) = lower(${String(c.value)})` : ilike(contacts.email, `%${escapeLike(String(c.value))}%`);
    if (c.field === 'phone') return c.op === 'is' ? eq(contacts.phone, String(c.value)) : ilike(contacts.phone, `%${escapeLike(String(c.value))}%`);
    if (c.field === 'company') return c.op === 'is' ? eq(contacts.companyId, uuid(c.value)) : sql`${contacts.companyId} is distinct from ${uuid(c.value)}`;
    if (c.field === 'opted_out') return eq(contacts.optedOut, c.value === true || c.value === 'true');
  } else {
    if (c.field === 'stage') return c.op === 'is' ? eq(opportunities.stageId, uuid(c.value)) : ne(opportunities.stageId, uuid(c.value));
    if (c.field === 'pipeline') return c.op === 'is' ? eq(opportunities.pipelineId, uuid(c.value)) : ne(opportunities.pipelineId, uuid(c.value));
    if (c.field === 'value') {
      if (!a.permissions.has('crm.view_values')) throw forbidden('You cannot filter by opportunity value', 'Ask an admin for the crm.view_values permission');
      const v = num(c.value) * 100; // criteria are entered in major units
      return { gt: sql`${opportunities.valueCents} > ${v}`, gte: sql`${opportunities.valueCents} >= ${v}`, lt: sql`${opportunities.valueCents} < ${v}`, lte: sql`${opportunities.valueCents} <= ${v}`, is: sql`${opportunities.valueCents} = ${v}` }[c.op as 'gt' | 'gte' | 'lt' | 'lte' | 'is'] ?? sql`true`;
    }
  }
  if (c.field.startsWith('custom:')) {
    const id = uuid(c.field.slice(7));
    const raw = sql`(${t.custom} ->> ${id})`;
    if (c.op === 'contains') return sql`${raw} ilike ${`%${escapeLike(String(c.value))}%`}`;
    if (c.op === 'is') return typeof c.value === 'number' ? sql`${raw} ~ '^-?[0-9.]+$' and ${raw}::numeric = ${c.value}` : sql`lower(${raw}) = lower(${String(c.value)})`;
    if (c.op === 'is_not') return sql`${raw} is distinct from ${String(c.value)}`;
    if (c.op === 'gt' || c.op === 'lt') return sql`${raw} ~ '^-?[0-9.]+$' and ${raw}::numeric ${sql.raw(c.op === 'gt' ? '>' : '<')} ${num(c.value)}`;
    if (c.op === 'before' || c.op === 'after' || c.op === 'on') {
      const d = date(c.value).toISOString().slice(0, 10);
      return sql`${raw} ~ '^\\d{4}-\\d{2}-\\d{2}' and left(${raw}, 10) ${sql.raw(c.op === 'before' ? '<' : c.op === 'after' ? '>' : '=')} ${d}`;
    }
  }
  void ws;
  throw unprocessable(`Unsupported filter: ${c.field} ${c.op}`, undefined, 'invalid_criteria');
}

function FIGURE_CHECK(entity: Entity, c: Criterion) {
  if (c.field.startsWith('custom:')) return true;
  const f = FIELDS[entity][c.field];
  if (!f) throw unprocessable(`"${c.field}" cannot be filtered on ${entity}`, undefined, 'invalid_criteria');
  if (!f.ops.includes(c.op)) throw unprocessable(`"${f.label}" does not support "${c.op}"`, undefined, 'invalid_criteria');
  return true;
}

export async function evaluate(a: AuthContext, entity: Entity, crit: Criterion[], q: { limit: number; cursor?: string }) {
  const ws = a.workspaceId;
  const offset = decodeCursor(q.cursor);
  const conds = crit.map((c) => condition(entity, a, c));
  if (entity === 'contacts') {
    const where = and(eq(contacts.workspaceId, ws), ...conds);
    const rows = await db
      .select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email, companyName: companies.name, ownerId: contacts.ownerId, ownerName: users.name, optedOut: contacts.optedOut, createdAt: contacts.createdAt })
      .from(contacts)
      .leftJoin(companies, eq(companies.id, contacts.companyId))
      .leftJoin(users, eq(users.id, contacts.ownerId))
      .where(where)
      .orderBy(contacts.name, contacts.id)
      .limit(q.limit + 1)
      .offset(offset);
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(where)) as [{ n: number }];
    return page(rows, q.limit, offset, n);
  }
  const where = and(eq(opportunities.workspaceId, ws), ...conds);
  const rows = await db
    .select({ id: opportunities.id, name: opportunities.name, stageName: stages.name, contactId: opportunities.contactId, contactName: contacts.name, ownerId: opportunities.ownerId, ownerName: users.name, valueCents: opportunities.valueCents, currency: opportunities.currency, createdAt: opportunities.createdAt })
    .from(opportunities)
    .innerJoin(stages, eq(stages.id, opportunities.stageId))
    .innerJoin(contacts, eq(contacts.id, opportunities.contactId))
    .leftJoin(users, eq(users.id, opportunities.ownerId))
    .where(where)
    .orderBy(opportunities.name, opportunities.id)
    .limit(q.limit + 1)
    .offset(offset);
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(opportunities).where(where)) as [{ n: number }];
  return page(rows, q.limit, offset, n);
}

const shape = (r: typeof savedLists.$inferSelect) => ({ id: r.id, name: r.name, entity: apiEntity(r.entity), criteria: r.criteria as Criterion[], ownerId: r.ownerId, createdAt: r.createdAt });

export async function listSaved(ws: string) {
  const rows = await db.select().from(savedLists).where(eq(savedLists.workspaceId, ws)).orderBy(savedLists.name);
  return rows.map(shape);
}

export async function createSaved(a: AuthContext, i: { name: string; entity: Entity; criteria: Criterion[] }) {
  if (i.criteria.length < 1) throw badRequest('Add at least one criterion');
  i.criteria.forEach((c) => condition(i.entity, a, c)); // validate now, not when someone opens the list
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(savedLists).values({ workspaceId: a.workspaceId, name: i.name, entity: dbEntity(i.entity), criteria: i.criteria, ownerId: a.userId }).returning();
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'saved_list.created', targetType: 'saved_list', targetId: r!.id, after: { name: i.name, entity: i.entity, criteria: i.criteria } });
    return shape(r!);
  });
}

export async function updateSaved(a: AuthContext, id: string, patch: { name?: string; criteria?: Criterion[] }) {
  const cur = await getOr404(db, savedLists, a.workspaceId, id, 'List');
  if (patch.criteria) patch.criteria.forEach((c) => condition(apiEntity(cur.entity), a, c));
  return db.transaction(async (tx) => {
    const [r] = await tx.update(savedLists).set({ ...(patch.name ? { name: patch.name } : {}), ...(patch.criteria ? { criteria: patch.criteria } : {}) }).where(and(eq(savedLists.workspaceId, a.workspaceId), eq(savedLists.id, id))).returning();
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'saved_list.updated', targetType: 'saved_list', targetId: id, before: { name: cur.name, criteria: cur.criteria }, after: { name: r!.name, criteria: r!.criteria } });
    return shape(r!);
  });
}

export async function deleteSaved(a: AuthContext, id: string) {
  const cur = await getOr404(db, savedLists, a.workspaceId, id, 'List');
  await db.transaction(async (tx) => {
    await tx.delete(savedLists).where(and(eq(savedLists.workspaceId, a.workspaceId), eq(savedLists.id, id)));
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'saved_list.deleted', targetType: 'saved_list', targetId: id, before: { name: cur.name } });
  });
}

export async function resultsFor(a: AuthContext, id: string, q: { limit: number; cursor?: string }) {
  const cur = await getOr404(db, savedLists, a.workspaceId, id, 'List');
  const entity = apiEntity(cur.entity);
  return { list: shape(cur), ...(await evaluate(a, entity, cur.criteria as Criterion[], q)) };
}

