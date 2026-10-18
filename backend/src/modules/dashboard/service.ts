import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { appointments, contacts, dashboardPrefs, leadAssignments, leads, memberships, payments, users, workspaces } from '../../core/db/schema/index.js';
import { leadHooks } from '../../core/lead-hooks.js';
import type { AuthContext } from '../../core/auth/context.js';
import { forbidden } from '../../core/errors.js';
import { collectedCents, openPipelineByStage, projectedCents } from '../payments/revenue.js';

export const FIGURES = ['newLeadsToday', 'pipelineValue', 'avgFirstResponse', 'recoveryQueue', 'escalations24h', 'availability', 'upcomingAppointments', 'collectedThisMonth', 'myLeads', 'leadsTrend', 'payments', 'needsAttention'] as const;
export type Figure = (typeof FIGURES)[number];

export type Scope = 'company' | 'me';
export type Range = 'today' | 'week' | 'month';

const PAYMENT_STATUSES = ['paid', 'requested', 'expired', 'failed', 'refunded', 'partially_refunded'] as const;

// Owner and Admin (or anyone allowed to reassign leads) see the company; everyone else sees their own desk (F5.4).
export const canSeeCompany = (a: AuthContext) => a.baseLevel !== 'user' || a.permissions.has('leads.reassign');

export function resolveScope(a: AuthContext, requested?: Scope): Scope {
  if (requested === 'company' && !canSeeCompany(a)) throw forbidden('Company-wide figures are for managers and admins');
  return requested ?? (canSeeCompany(a) ? 'company' : 'me');
}

async function tzOf(ws: string) {
  const [w] = await db.select({ tz: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, ws));
  return w?.tz ?? 'UTC';
}

// Start of "today" and "this month" in the workspace time zone, as UTC instants.
async function windows(ws: string) {
  const tz = await tzOf(ws);
  const r = await db.execute(sql`select (date_trunc('day', now() at time zone ${tz}) at time zone ${tz}) as day, (date_trunc('week', now() at time zone ${tz}) at time zone ${tz}) as week, (date_trunc('month', now() at time zone ${tz}) at time zone ${tz}) as month`);
  const row = r.rows[0] as { day: Date; week: Date; month: Date };
  return { tz, day: new Date(row.day), week: new Date(row.week), month: new Date(row.month) };
}

const DAY = 86400_000;

// One definition per figure, shared by the totals and the records behind them, so counts always match the lists (F5.2, F5.3).
function preds(ws: string, scope: Scope, me: string, w: { day: Date; month: Date }, now: Date) {
  return {
    newLeads: and(eq(leads.workspaceId, ws), gte(leads.createdAt, w.day), scope === 'me' ? eq(leads.ownerId, me) : undefined),
    // automatic escalations only; manual and absence reassignments are counted separately
    escalations: and(eq(leadAssignments.workspaceId, ws), eq(leadAssignments.reason, 'ack_expired'), gte(leadAssignments.assignedAt, new Date(now.getTime() - DAY)), scope === 'me' ? eq(leadAssignments.userId, me) : undefined),
    reassignments: and(eq(leadAssignments.workspaceId, ws), inArray(leadAssignments.reason, ['manual', 'owner_unavailable']), gte(leadAssignments.assignedAt, new Date(now.getTime() - DAY)), scope === 'me' ? eq(leadAssignments.userId, me) : undefined),
    appointments: and(eq(appointments.workspaceId, ws), eq(appointments.status, 'scheduled'), gte(appointments.startsAt, now), lt(appointments.startsAt, new Date(now.getTime() + 7 * DAY)), scope === 'me' ? eq(appointments.userId, me) : undefined),
    paid: and(eq(payments.workspaceId, ws), inArray(payments.status, ['paid', 'partially_refunded', 'refunded']), gte(payments.paidAt, w.month), scope === 'me' ? eq(payments.requestedBy, me) : undefined),
  };
}

const count = async (q: Promise<Array<{ n: number }>>) => (await q)[0]?.n ?? 0;

export async function dashboard(a: AuthContext, requested?: Scope, range: Range = 'today') {
  const ws = a.workspaceId;
  const scope = resolveScope(a, requested);
  const now = new Date();
  const w = await windows(ws);
  const p = preds(ws, scope, a.userId, w, now);
  const canValues = a.permissions.has('crm.view_values');
  const from = range === 'month' ? w.month : range === 'week' ? w.week : w.day;
  const mine = scope === 'me';

  const [newLeads, escalations, reassignments, avg, recovery, appts, apptList, collected, stagesRows, board, hidden] = await Promise.all([
    count(db.select({ n: sql<number>`count(*)::int` }).from(leads).where(p.newLeads)),
    count(db.select({ n: sql<number>`count(*)::int` }).from(leadAssignments).where(p.escalations)),
    count(db.select({ n: sql<number>`count(*)::int` }).from(leadAssignments).where(p.reassignments)),
    // Time to first response (section 7): first assignment to first acknowledgement, for leads first acknowledged in the last 30 days.
    db
      .select({ s: sql<number | null>`avg(extract(epoch from (${leads.firstAckAt} - ${leads.firstAssignedAt})))::float`, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.workspaceId, ws), sql`${leads.firstAckAt} is not null and ${leads.firstAssignedAt} is not null`, gte(leads.firstAckAt, new Date(now.getTime() - 30 * DAY)), scope === 'me' ? eq(leads.ownerId, a.userId) : undefined)),
    leadHooks.recoveryQueue(ws, { userId: a.userId, canSeeAll: scope === 'company' }),
    count(db.select({ n: sql<number>`count(*)::int` }).from(appointments).where(p.appointments)),
    db
      .select({ id: appointments.id, title: appointments.title, startsAt: appointments.startsAt, timezone: appointments.timezone, userName: users.name, contactName: contacts.name })
      .from(appointments)
      .innerJoin(users, eq(users.id, appointments.userId))
      .innerJoin(contacts, eq(contacts.id, appointments.contactId))
      .where(p.appointments)
      .orderBy(appointments.startsAt)
      .limit(6),
    collectedCents(ws, { from: w.month, requestedBy: scope === 'me' ? a.userId : undefined }),
    // stage counts are shown to everyone; values are stripped by maskValues without crm.view_values
    openPipelineByStage(ws, scope === 'me' ? a.userId : undefined),
    db
      .select({ userId: users.id, name: users.name, status: memberships.availability })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, ws), eq(memberships.active, true), scope === 'me' ? eq(memberships.userId, a.userId) : undefined)),
    getPrefs(ws, a.userId),
  ]);

  const [rangeLeads, trend, byStatus, projected] = await Promise.all([
    count(db.select({ n: sql<number>`count(*)::int` }).from(leads).where(and(eq(leads.workspaceId, ws), gte(leads.createdAt, from), mine ? eq(leads.ownerId, a.userId) : undefined))),
    leadsTrend(ws, w.tz, range === 'month' ? 30 : 7, mine ? a.userId : null),
    db
      .select({ status: payments.status, n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint`.mapWith(Number), refunded: sql<number>`coalesce(sum(${payments.refundedCents}), 0)::bigint`.mapWith(Number) })
      .from(payments)
      .where(and(eq(payments.workspaceId, ws), gte(payments.createdAt, from), mine ? eq(payments.requestedBy, a.userId) : undefined))
      .groupBy(payments.status),
    canValues && !mine ? projectedCents(ws).then((p) => p.projectedCents) : Promise.resolve(null),
  ]);

  const open = await db
    .select({ ownerId: leads.ownerId, n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.workspaceId, ws), inArray(leads.status, ['assigned', 'acknowledged'])))
    .groupBy(leads.ownerId);
  const openBy = new Map(open.map((o) => [o.ownerId, o.n]));
  const counts = { available: 0, busy: 0, on_leave: 0, offline: 0 } as Record<string, number>;
  for (const m of board) counts[m.status] = (counts[m.status] ?? 0) + 1;

  return {
    scope,
    generatedAt: now.toISOString(),
    timezone: w.tz,
    hidden: hidden.hidden,
    newLeadsToday: newLeads,
    pipelineValue: { byStage: stagesRows, totalCents: canValues ? stagesRows.reduce((n, s) => n + s.valueCents, 0) : null },
    avgFirstResponse: { seconds: avg[0]?.s ?? null, sample: avg[0]?.n ?? 0, windowDays: 30 },
    recoveryQueue: recovery.length,
    escalations24h: { automatic: escalations, manualReassignments: reassignments },
    availability: { counts, members: board.map((m) => ({ ...m, openLeads: openBy.get(m.userId) ?? 0 })) },
    upcomingAppointments: { count: appts, items: apptList },
    collectedThisMonthCents: collected,
    range: { key: range, from: from.toISOString() },
    newLeads: rangeLeads,
    trend,
    paymentsByStatus: PAYMENT_STATUSES.map((st) => {
      const r = byStatus.find((b) => b.status === st);
      return { status: st, count: r?.n ?? 0, amountCents: r?.amount ?? 0, refundedCents: r?.refunded ?? 0 };
    }),
    projectedCents: projected,
  };
}

// Daily leads created vs leads first acknowledged, in the workspace time zone, oldest first.
async function leadsTrend(ws: string, tz: string, days: number, ownerId: string | null) {
  const owner = ownerId ? sql`and l.owner_id = ${ownerId}::uuid` : sql``;
  const r = await db.execute(sql`
    with d as (
      select generate_series(date_trunc('day', now() at time zone ${tz}) - ((${days - 1})::int * interval '1 day'), date_trunc('day', now() at time zone ${tz}), interval '1 day') as day
    )
    select to_char(d.day, 'YYYY-MM-DD') as date,
      (select count(*) from leads l where l.workspace_id = ${ws}::uuid ${owner} and (l.created_at at time zone ${tz}) >= d.day and (l.created_at at time zone ${tz}) < d.day + interval '1 day')::int as leads,
      (select count(*) from leads l where l.workspace_id = ${ws}::uuid ${owner} and l.first_ack_at is not null and (l.first_ack_at at time zone ${tz}) >= d.day and (l.first_ack_at at time zone ${tz}) < d.day + interval '1 day')::int as acknowledged
    from d order by d.day`);
  return (r.rows as Array<{ date: string; leads: number; acknowledged: number }>).map((x) => ({ date: x.date, leads: Number(x.leads), acknowledged: Number(x.acknowledged) }));
}

// The records behind a figure, built from the same predicates as the totals.
export async function records(a: AuthContext, figure: string, requested: Scope | undefined, limit: number) {
  const ws = a.workspaceId;
  const scope = resolveScope(a, requested);
  const now = new Date();
  const w = await windows(ws);
  const p = preds(ws, scope, a.userId, w, now);

  switch (figure) {
    case 'new-leads':
      return db
        .select({ id: leads.id, contactName: contacts.name, source: leads.source, status: leads.status, ownerName: users.name, at: leads.createdAt })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .leftJoin(users, eq(users.id, leads.ownerId))
        .where(p.newLeads)
        .orderBy(desc(leads.createdAt))
        .limit(limit)
        .then((r) => r.map((x) => ({ id: x.id, title: x.contactName, detail: `${x.source}, ${x.status}${x.ownerName ? `, owner ${x.ownerName}` : ''}`, at: x.at, href: `/leads/${x.id}` })));
    case 'escalations':
      return db
        .select({ id: leadAssignments.id, leadId: leadAssignments.leadId, contactName: contacts.name, toName: users.name, level: leadAssignments.level, at: leadAssignments.assignedAt })
        .from(leadAssignments)
        .innerJoin(leads, eq(leads.id, leadAssignments.leadId))
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .innerJoin(users, eq(users.id, leadAssignments.userId))
        .where(p.escalations)
        .orderBy(desc(leadAssignments.assignedAt))
        .limit(limit)
        .then((r) => r.map((x) => ({ id: x.id, title: x.contactName, detail: `escalated to ${x.toName}, level ${x.level}`, at: x.at, href: `/leads/${x.leadId}` })));
    case 'recovery': {
      const items = (await leadHooks.recoveryQueue(ws, { userId: a.userId, canSeeAll: scope === 'company' })) as Array<{ lead?: { id: string; contactName?: string; contact?: { name?: string } }; reasons?: Array<{ text: string }> }>;
      return items.slice(0, limit).map((x, i) => ({ id: x.lead?.id ?? String(i), title: x.lead?.contactName ?? x.lead?.contact?.name ?? 'Lead', detail: (x.reasons ?? []).map((r) => r.text).join('; '), at: null, href: x.lead?.id ? `/leads/${x.lead.id}` : '/recovery' }));
    }
    case 'payments':
      return db
        .select({ id: payments.id, amount: payments.amountCents, refunded: payments.refundedCents, currency: payments.currency, contactName: contacts.name, at: payments.paidAt })
        .from(payments)
        .innerJoin(contacts, eq(contacts.id, payments.contactId))
        .where(p.paid)
        .orderBy(desc(payments.paidAt))
        .limit(limit)
        .then((r) => r.map((x) => ({ id: x.id, title: x.contactName, detail: `${(x.amount - x.refunded) / 100} ${x.currency} collected`, at: x.at, href: `/payments` })));
    case 'appointments':
      return db
        .select({ id: appointments.id, title: appointments.title, contactName: contacts.name, userName: users.name, at: appointments.startsAt })
        .from(appointments)
        .innerJoin(contacts, eq(contacts.id, appointments.contactId))
        .innerJoin(users, eq(users.id, appointments.userId))
        .where(p.appointments)
        .orderBy(appointments.startsAt)
        .limit(limit)
        .then((r) => r.map((x) => ({ id: x.id, title: `${x.title} with ${x.contactName}`, detail: x.userName, at: x.at, href: '/appointments' })));
    default:
      return [];
  }
}

export async function getPrefs(ws: string, userId: string) {
  const [r] = await db.select({ hidden: dashboardPrefs.hidden }).from(dashboardPrefs).where(and(eq(dashboardPrefs.workspaceId, ws), eq(dashboardPrefs.userId, userId)));
  return { hidden: ((r?.hidden as string[] | undefined) ?? []).filter((h) => (FIGURES as readonly string[]).includes(h)) };
}

export async function setPrefs(ws: string, userId: string, hidden: string[]) {
  const clean = [...new Set(hidden.filter((h) => (FIGURES as readonly string[]).includes(h)))];
  await db.insert(dashboardPrefs).values({ workspaceId: ws, userId, hidden: clean }).onConflictDoUpdate({ target: [dashboardPrefs.workspaceId, dashboardPrefs.userId], set: { hidden: clean } });
  return { hidden: clean };
}
