import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import { db, type Tx } from '../../core/db/client.js';
import { customFields, opportunities, pipelines, stageRequiredFields, stages } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { getOr404 } from '../../core/db/scoped.js';
import { badRequest, conflict } from '../../core/errors.js';
import type { AuthContext } from '../../core/auth/context.js';
import { createPipelineWithStages } from '../workspace/service.js';

export async function listPipelines(ws: string) {
  const [ps, ss, fs, req] = await Promise.all([
    db.select().from(pipelines).where(eq(pipelines.workspaceId, ws)).orderBy(asc(pipelines.createdAt)),
    db.select().from(stages).where(eq(stages.workspaceId, ws)).orderBy(asc(stages.position)),
    db.select().from(customFields).where(and(eq(customFields.workspaceId, ws), eq(customFields.entity, 'opportunity'))).orderBy(asc(customFields.position)),
    db.select().from(stageRequiredFields).where(eq(stageRequiredFields.workspaceId, ws)),
  ]);
  return ps.map((p) => ({
    ...p,
    stages: ss.filter((s) => s.pipelineId === p.id).map((s) => ({
      ...s,
      requiredFieldIds: req.filter((r) => r.stageId === s.id).map((r) => r.fieldId),
    })),
    fields: fs.filter((f) => f.pipelineId === null || f.pipelineId === p.id),
  }));
}

export async function createPipeline(a: AuthContext, name: string) {
  return db.transaction(async (tx) => {
    const { pipeline, stages: st } = await createPipelineWithStages(tx, a.workspaceId, name, false);
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'pipeline.created', targetType: 'pipeline', targetId: pipeline.id, after: { name } });
    return { ...pipeline, stages: st };
  });
}

export async function updatePipeline(a: AuthContext, id: string, patch: { name?: string; isDefault?: boolean }) {
  return db.transaction(async (tx) => {
    const cur = await getOr404(tx, pipelines, a.workspaceId, id, 'Pipeline');
    if (patch.isDefault) await tx.update(pipelines).set({ isDefault: false }).where(eq(pipelines.workspaceId, a.workspaceId));
    const [p] = await tx.update(pipelines).set(patch).where(eq(pipelines.id, id)).returning();
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'pipeline.updated', targetType: 'pipeline', targetId: id, before: { name: cur.name, isDefault: cur.isDefault }, after: { name: p!.name, isDefault: p!.isDefault } });
    return p!;
  });
}

export async function deletePipeline(a: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const cur = await getOr404(tx, pipelines, a.workspaceId, id, 'Pipeline');
    const [{ n: total }] = (await tx.select({ n: count() }).from(pipelines).where(eq(pipelines.workspaceId, a.workspaceId))) as [{ n: number }];
    if (total <= 1) throw conflict('A workspace needs at least one pipeline', undefined, 'last_pipeline');
    const [{ n }] = (await tx.select({ n: count() }).from(opportunities).where(eq(opportunities.pipelineId, id))) as [{ n: number }];
    if (n > 0) throw conflict(`${n} opportunities are in this pipeline`, 'Move or delete them first', 'pipeline_not_empty');
    await tx.delete(pipelines).where(eq(pipelines.id, id));
    if (cur.isDefault) {
      const [next] = await tx.select({ id: pipelines.id }).from(pipelines).where(eq(pipelines.workspaceId, a.workspaceId)).limit(1);
      if (next) await tx.update(pipelines).set({ isDefault: true }).where(eq(pipelines.id, next.id));
    }
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'pipeline.deleted', targetType: 'pipeline', targetId: id, before: { name: cur.name } });
  });
}

async function resequence(tx: Tx, pipelineId: string, orderedIds: string[]) {
  for (const [i, sid] of orderedIds.entries()) await tx.update(stages).set({ position: i }).where(eq(stages.id, sid));
}

export async function addStage(a: AuthContext, pipelineId: string, i: { name: string; isWon?: boolean; isLost?: boolean; position?: number }) {
  if (i.isWon && i.isLost) throw badRequest('A stage cannot be both won and lost');
  return db.transaction(async (tx) => {
    await getOr404(tx, pipelines, a.workspaceId, pipelineId, 'Pipeline');
    const existing = await tx.select().from(stages).where(eq(stages.pipelineId, pipelineId)).orderBy(asc(stages.position));
    const [s] = await tx.insert(stages).values({ workspaceId: a.workspaceId, pipelineId, name: i.name, position: existing.length, isWon: !!i.isWon, isLost: !!i.isLost }).returning();
    const order = existing.map((e) => e.id);
    order.splice(Math.min(i.position ?? order.length, order.length), 0, s!.id);
    await resequence(tx, pipelineId, order);
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'stage.created', targetType: 'stage', targetId: s!.id, after: { pipelineId, name: i.name } });
    return { ...s!, position: order.indexOf(s!.id) };
  });
}

export async function updateStage(a: AuthContext, id: string, patch: { name?: string; isWon?: boolean; isLost?: boolean }) {
  return db.transaction(async (tx) => {
    const cur = await getOr404(tx, stages, a.workspaceId, id, 'Stage');
    const won = patch.isWon ?? cur.isWon;
    const lost = patch.isLost ?? cur.isLost;
    if (won && lost) throw badRequest('A stage cannot be both won and lost');
    const [s] = await tx.update(stages).set(patch).where(eq(stages.id, id)).returning();
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'stage.updated', targetType: 'stage', targetId: id, before: { name: cur.name, isWon: cur.isWon, isLost: cur.isLost }, after: { name: s!.name, isWon: s!.isWon, isLost: s!.isLost } });
    return s!;
  });
}

export async function reorderStages(a: AuthContext, pipelineId: string, stageIds: string[]) {
  return db.transaction(async (tx) => {
    await getOr404(tx, pipelines, a.workspaceId, pipelineId, 'Pipeline');
    const cur = await tx.select({ id: stages.id }).from(stages).where(eq(stages.pipelineId, pipelineId)).orderBy(asc(stages.position));
    const same = cur.length === stageIds.length && new Set(stageIds).size === stageIds.length && cur.every((c) => stageIds.includes(c.id));
    if (!same) throw badRequest('stageIds must list every stage of the pipeline exactly once', undefined, 'invalid_order');
    await resequence(tx, pipelineId, stageIds);
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'stages.reordered', targetType: 'pipeline', targetId: pipelineId, before: { order: cur.map((c) => c.id) }, after: { order: stageIds } });
    return tx.select().from(stages).where(eq(stages.pipelineId, pipelineId)).orderBy(asc(stages.position));
  });
}

// Deleting a stage that holds opportunities requires a destination stage in the same pipeline (F2.5).
export async function deleteStage(a: AuthContext, id: string, moveTo?: string) {
  await db.transaction(async (tx) => {
    const cur = await getOr404(tx, stages, a.workspaceId, id, 'Stage');
    const [{ n }] = (await tx.select({ n: count() }).from(opportunities).where(eq(opportunities.stageId, id))) as [{ n: number }];
    const siblings = await tx.select({ id: stages.id }).from(stages).where(and(eq(stages.pipelineId, cur.pipelineId), ne(stages.id, id))).orderBy(asc(stages.position));
    if (!siblings.length) throw conflict('A pipeline needs at least one stage', undefined, 'last_stage');
    if (n > 0) {
      if (!moveTo) throw conflict(`${n} opportunities are in this stage`, 'Choose a stage to move them to', 'stage_not_empty', { opportunityCount: n });
      if (!siblings.some((s) => s.id === moveTo)) throw badRequest('moveTo must be another stage of the same pipeline', undefined, 'invalid_move_target');
      await tx.update(opportunities).set({ stageId: moveTo, version: sql`${opportunities.version} + 1`, updatedAt: new Date() }).where(eq(opportunities.stageId, id));
    }
    await tx.delete(stages).where(eq(stages.id, id));
    await resequence(tx, cur.pipelineId, siblings.map((s) => s.id));
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'stage.deleted', targetType: 'stage', targetId: id, before: { name: cur.name, pipelineId: cur.pipelineId }, after: { movedTo: moveTo ?? null, movedCount: n } });
  });
}

