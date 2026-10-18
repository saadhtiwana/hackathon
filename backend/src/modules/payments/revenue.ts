import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { opportunities, payments, stages, workspaces } from '../../core/db/schema/index.js';

// One definition of each money figure (section 7); the dashboard and every list read these (Q12).
// Figures are in the workspace default currency.

async function defaultCurrency(ws: string) {
  const [w] = await db.select({ c: workspaces.defaultCurrency }).from(workspaces).where(eq(workspaces.id, ws));
  return w?.c ?? 'USD';
}

const REALISED = ['paid', 'partially_refunded', 'refunded'] as const;

// Collected = payments confirmed by the provider webhook, minus confirmed refunds.
export async function collectedCents(ws: string, range?: { from?: Date; to?: Date; requestedBy?: string }) {
  const cur = await defaultCurrency(ws);
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${payments.amountCents} - ${payments.refundedCents}), 0)::bigint` })
    .from(payments)
    .where(and(eq(payments.workspaceId, ws), eq(payments.currency, cur), inArray(payments.status, [...REALISED]), range?.from ? gte(payments.paidAt, range.from) : undefined, range?.to ? lte(payments.paidAt, range.to) : undefined, range?.requestedBy ? eq(payments.requestedBy, range.requestedBy) : undefined));
  return Number(r?.n ?? 0);
}

export async function refundedCents(ws: string) {
  const cur = await defaultCurrency(ws);
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${payments.refundedCents}), 0)::bigint` }).from(payments).where(and(eq(payments.workspaceId, ws), eq(payments.currency, cur)));
  return Number(r?.n ?? 0);
}

// Payment requests not yet paid.
export async function unpaidRequestedCents(ws: string) {
  const cur = await defaultCurrency(ws);
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint` })
    .from(payments)
    .where(and(eq(payments.workspaceId, ws), eq(payments.currency, cur), eq(payments.status, 'requested')));
  return Number(r?.n ?? 0);
}

// Open pipeline value: opportunities not in a won or lost stage, grouped by stage.
export async function openPipelineByStage(ws: string, ownerId?: string) {
  const cur = await defaultCurrency(ws);
  return db
    .select({ stageId: stages.id, stageName: stages.name, pipelineId: stages.pipelineId, position: stages.position, valueCents: sql<number>`coalesce(sum(${opportunities.valueCents}), 0)::bigint`.mapWith(Number), count: sql<number>`count(${opportunities.id})::int` })
    .from(stages)
    .leftJoin(opportunities, and(eq(opportunities.stageId, stages.id), eq(opportunities.currency, cur), ownerId ? eq(opportunities.ownerId, ownerId) : undefined))
    .where(and(eq(stages.workspaceId, ws), eq(stages.isWon, false), eq(stages.isLost, false)))
    .groupBy(stages.id)
    .orderBy(stages.pipelineId, stages.position);
}

// Projected = open opportunity values plus payment requests not yet paid.
export async function projectedCents(ws: string) {
  const stagesRows = await openPipelineByStage(ws);
  const open = stagesRows.reduce((n, s) => n + s.valueCents, 0);
  return { openPipelineCents: open, unpaidRequestedCents: await unpaidRequestedCents(ws), projectedCents: open + (await unpaidRequestedCents(ws)) };
}

export async function revenueSummary(ws: string, range?: { from?: Date; to?: Date }) {
  const [collected, refunded, projected] = await Promise.all([collectedCents(ws, range), refundedCents(ws), projectedCents(ws)]);
  return { currency: await defaultCurrency(ws), collectedCents: collected, refundedCents: refunded, ...projected };
}

