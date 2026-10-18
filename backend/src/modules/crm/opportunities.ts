import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { activities, appointments, contacts, opportunities, payments, pipelines, stages, users } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { activity } from '../../core/activity/index.js';
import { getOr404, inWorkspace, updateVersioned } from '../../core/db/scoped.js';
import { decodeCursor, escapeLike, orderBy, page } from '../../core/http/list.js';
import { badRequest, forbidden } from '../../core/errors.js';
import type { AuthContext } from '../../core/auth/context.js';
import { assertRequiredFields, validateCustom } from './custom.js';
import { assertActiveMember, diff } from './shared.js';

export interface OppFilters {
  limit: number;
  cursor?: string;
  q?: string;
  sort?: string;
  dir: 'asc' | 'desc';
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
  contactId?: string;
}

const listSelect = {
  id: opportunities.id,
  name: opportunities.name,
  pipelineId: opportunities.pipelineId,
  stageId: opportunities.stageId,
  stageName: stages.name,
  contactId: opportunities.contactId,
  contactName: contacts.name,
  ownerId: opportunities.ownerId,
  ownerName: users.name,
  valueCents: opportunities.valueCents,
  currency: opportunities.currency,
  version: opportunities.version,
  createdAt: opportunities.createdAt,
};

function where(ws: string, f: OppFilters) {
  return inWorkspace(
    opportunities,
    ws,
    and(
      f.q ? ilike(opportunities.name, `%${escapeLike(f.q)}%`) : undefined,
      f.pipelineId ? eq(opportunities.pipelineId, f.pipelineId) : undefined,
      f.stageId ? eq(opportunities.stageId, f.stageId) : undefined,
      f.ownerId ? eq(opportunities.ownerId, f.ownerId) : undefined,
      f.contactId ? eq(opportunities.contactId, f.contactId) : undefined,
    ),
  );
}

const base = () => db.select(listSelect).from(opportunities).innerJoin(stages, eq(stages.id, opportunities.stageId)).innerJoin(contacts, eq(contacts.id, opportunities.contactId)).leftJoin(users, eq(users.id, opportunities.ownerId));

export async function listOpportunities(a: AuthContext, f: OppFilters) {
  const offset = decodeCursor(f.cursor);
  const canValue = a.permissions.has('crm.view_values');
  // Sorting by value would leak ordering to users who cannot see values.
  const sort = !canValue && f.sort === 'value_cents' ? undefined : f.sort;
  const rows = await base()
    .where(where(a.workspaceId, f))
    .orderBy(...orderBy({ name: opportunities.name, value_cents: opportunities.valueCents, created_at: opportunities.createdAt }, 'created_at', sort, f.dir, opportunities.id))
    .limit(f.limit + 1)
    .offset(offset);
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(opportunities).where(where(a.workspaceId, f))) as [{ n: number }];
  return page(rows, f.limit, offset, n);
}

export const exportOpportunities = (ws: string, f: OppFilters) => base().where(where(ws, f)).orderBy(opportunities.createdAt).limit(5000);

export async function getOpportunity(ws: string, id: string) {
  const opp = await getOr404(db, opportunities, ws, id, 'Opportunity');
  const [contact] = await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email }).from(contacts).where(eq(contacts.id, opp.contactId));
  const [stage] = await db.select().from(stages).where(eq(stages.id, opp.stageId));
  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, opp.pipelineId));
  const [owner] = opp.ownerId ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, opp.ownerId)) : [];
  const [pays, appts, acts] = await Promise.all([
    db.select().from(payments).where(and(eq(payments.workspaceId, ws), eq(payments.opportunityId, id))).orderBy(desc(payments.createdAt)),
    db.select().from(appointments).where(and(eq(appointments.workspaceId, ws), eq(appointments.opportunityId, id))).orderBy(desc(appointments.startsAt)),
    db
      .select({ id: activities.id, type: activities.type, actorId: activities.actorId, actorName: users.name, data: activities.data, createdAt: activities.createdAt })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.actorId))
      .where(and(eq(activities.workspaceId, ws), eq(activities.opportunityId, id)))
      .orderBy(desc(activities.createdAt))
      .limit(50),
  ]);
  return { opportunity: opp, contact: contact ?? null, stage, pipeline, owner: owner ?? null, payments: pays, appointments: appts, activities: acts };
}

interface CreateInput {
  pipelineId: string;
  stageId?: string;
  contactId: string;
  name: string;
  valueCents?: number;
  currency?: string;
  ownerId?: string | null;
  custom?: Record<string, unknown>;
}

export async function createOpportunity(a: AuthContext, i: CreateInput) {
  if (i.valueCents !== undefined && !a.permissions.has('crm.view_values')) throw forbidden('You cannot set opportunity values', 'Ask an admin for the crm.view_values permission');
  return db.transaction(async (tx) => {
    await getOr404(tx, pipelines, a.workspaceId, i.pipelineId, 'Pipeline');
    await getOr404(tx, contacts, a.workspaceId, i.contactId, 'Contact');
    if (i.ownerId) await assertActiveMember(tx, a.workspaceId, i.ownerId);
    let stageId = i.stageId;
    if (stageId) {
      const st = await getOr404(tx, stages, a.workspaceId, stageId, 'Stage');
      if (st.pipelineId !== i.pipelineId) throw badRequest('Stage belongs to a different pipeline', undefined, 'stage_pipeline_mismatch');
    } else {
      const [first] = await tx.select().from(stages).where(eq(stages.pipelineId, i.pipelineId)).orderBy(stages.position).limit(1);
      if (!first) throw badRequest('This pipeline has no stages', undefined, 'no_stages');
      stageId = first.id;
    }
    if (i.custom) await validateCustom(tx, a.workspaceId, 'opportunity', i.pipelineId, i.custom);
    const [o] = await tx
      .insert(opportunities)
      .values({ workspaceId: a.workspaceId, pipelineId: i.pipelineId, stageId, contactId: i.contactId, ownerId: i.ownerId ?? a.userId, name: i.name, valueCents: i.valueCents ?? 0, currency: i.currency ?? 'PKR', custom: i.custom ?? {} })
      .returning();
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'opportunity.created', targetType: 'opportunity', targetId: o!.id, after: { name: o!.name, stageId, valueCents: o!.valueCents } });
    await activity.record(tx, { workspaceId: a.workspaceId, entity: { contactId: i.contactId, opportunityId: o!.id }, type: 'field_edit', actorId: a.userId, data: { event: 'created', name: o!.name } });
    return o!;
  });
}

interface UpdateInput {
  name?: string;
  valueCents?: number;
  currency?: string;
  ownerId?: string | null;
  custom?: Record<string, unknown>;
}

export async function updateOpportunity(a: AuthContext, id: string, version: number, patch: UpdateInput) {
  if ((patch.valueCents !== undefined || patch.currency !== undefined) && !a.permissions.has('crm.view_values')) throw forbidden('You cannot change opportunity values', 'Ask an admin for the crm.view_values permission');
  return db.transaction(async (tx) => {
    const cur = await getOr404(tx, opportunities, a.workspaceId, id, 'Opportunity');
    if (patch.ownerId) await assertActiveMember(tx, a.workspaceId, patch.ownerId);
    if (patch.custom) await validateCustom(tx, a.workspaceId, 'opportunity', cur.pipelineId, patch.custom);
    const merged = patch.custom ? { ...(cur.custom as Record<string, unknown>), ...patch.custom } : undefined;
    const d = diff(cur as unknown as Record<string, unknown>, { ...patch, custom: merged });
    const o = await updateVersioned(tx, opportunities, a.workspaceId, id, version, { ...patch, ...(merged ? { custom: merged } : {}), updatedAt: new Date() }, 'Opportunity');
    if (d.changed.length) {
      await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'opportunity.updated', targetType: 'opportunity', targetId: id, before: d.before, after: d.after });
      const rest = d.changed.filter((k) => k !== 'ownerId');
      if (rest.length) await activity.record(tx, { workspaceId: a.workspaceId, entity: { contactId: cur.contactId, opportunityId: id }, type: 'field_edit', actorId: a.userId, data: { changes: Object.fromEntries(rest.map((k) => [k, { from: d.before[k], to: d.after[k] }])) } });
      if (d.changed.includes('ownerId')) await activity.record(tx, { workspaceId: a.workspaceId, entity: { contactId: cur.contactId, opportunityId: id }, type: 'assignment', actorId: a.userId, data: { from: d.before.ownerId ?? null, to: d.after.ownerId ?? null } });
    }
    return o;
  });
}

export async function moveOpportunity(a: AuthContext, id: string, version: number, stageId: string, custom?: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    const cur = await getOr404(tx, opportunities, a.workspaceId, id, 'Opportunity');
    const target = await getOr404(tx, stages, a.workspaceId, stageId, 'Stage');
    if (target.pipelineId !== cur.pipelineId) throw badRequest('Stage belongs to a different pipeline', undefined, 'stage_pipeline_mismatch');
    if (custom) await validateCustom(tx, a.workspaceId, 'opportunity', cur.pipelineId, custom);
    const merged = { ...(cur.custom as Record<string, unknown>), ...(custom ?? {}) };
    await assertRequiredFields(tx, a.workspaceId, target.id, target.name, merged);
    const [from] = await tx.select({ name: stages.name }).from(stages).where(eq(stages.id, cur.stageId));
    const o = await updateVersioned(tx, opportunities, a.workspaceId, id, version, { stageId, custom: merged, updatedAt: new Date() }, 'Opportunity');
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'opportunity.stage_changed', targetType: 'opportunity', targetId: id, before: { stageId: cur.stageId, stage: from?.name }, after: { stageId, stage: target.name } });
    await activity.record(tx, { workspaceId: a.workspaceId, entity: { contactId: cur.contactId, opportunityId: id }, type: 'stage_change', actorId: a.userId, data: { from: from?.name, to: target.name, fromId: cur.stageId, toId: stageId } });
    return o;
  });
}

export async function deleteOpportunity(a: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const cur = await getOr404(tx, opportunities, a.workspaceId, id, 'Opportunity');
    await tx.delete(opportunities).where(and(eq(opportunities.workspaceId, a.workspaceId), eq(opportunities.id, id)));
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'opportunity.deleted', targetType: 'opportunity', targetId: id, before: { name: cur.name, stageId: cur.stageId, valueCents: cur.valueCents } });
  });
}
