import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { customFields, pipelines, stageRequiredFields, stages } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { getOr404 } from '../../core/db/scoped.js';
import { badRequest } from '../../core/errors.js';
import type { AuthContext } from '../../core/auth/context.js';

type Entity = 'contact' | 'opportunity';
type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'checkbox';

export async function listFields(ws: string, entity: Entity, pipelineId?: string) {
  return db
    .select()
    .from(customFields)
    .where(
      and(
        eq(customFields.workspaceId, ws),
        eq(customFields.entity, entity),
        pipelineId ? or(isNull(customFields.pipelineId), eq(customFields.pipelineId, pipelineId)) : undefined,
      ),
    )
    .orderBy(asc(customFields.position), asc(customFields.createdAt));
}

export async function createField(
  a: AuthContext,
  i: { entity: Entity; pipelineId?: string | null; name: string; type: FieldType; options?: string[] },
) {
  if (i.type === 'dropdown' && !(i.options && i.options.length)) throw badRequest('A dropdown needs at least one option', 'Enter the choices, separated by commas');
  if (i.entity === 'contact' && i.pipelineId) throw badRequest('Contact fields are shared across pipelines');
  return db.transaction(async (tx) => {
    if (i.pipelineId) await getOr404(tx, pipelines, a.workspaceId, i.pipelineId, 'Pipeline');
    const [field] = await tx
      .insert(customFields)
      .values({
        workspaceId: a.workspaceId,
        entity: i.entity,
        pipelineId: i.entity === 'opportunity' ? (i.pipelineId ?? null) : null,
        name: i.name,
        type: i.type,
        options: i.type === 'dropdown' ? (i.options ?? []) : null,
      })
      .returning();
    await audit.record(tx, {
      workspaceId: a.workspaceId,
      actorId: a.userId,
      action: 'field.created',
      targetType: 'custom_field',
      targetId: field!.id,
      after: { name: field!.name, entity: field!.entity, type: field!.type },
    });
    return field!;
  });
}

export async function updateField(a: AuthContext, id: string, patch: { name?: string; options?: string[] }) {
  return db.transaction(async (tx) => {
    const cur = await getOr404(tx, customFields, a.workspaceId, id, 'Field');
    const [field] = await tx
      .update(customFields)
      .set({ name: patch.name ?? cur.name, options: patch.options ?? cur.options })
      .where(and(eq(customFields.workspaceId, a.workspaceId), eq(customFields.id, id)))
      .returning();
    await audit.record(tx, {
      workspaceId: a.workspaceId,
      actorId: a.userId,
      action: 'field.updated',
      targetType: 'custom_field',
      targetId: id,
      before: { name: cur.name },
      after: { name: field!.name },
    });
    return field!;
  });
}

export async function deleteField(a: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const cur = await getOr404(tx, customFields, a.workspaceId, id, 'Field');
    await tx.delete(customFields).where(and(eq(customFields.workspaceId, a.workspaceId), eq(customFields.id, id)));
    await audit.record(tx, {
      workspaceId: a.workspaceId,
      actorId: a.userId,
      action: 'field.deleted',
      targetType: 'custom_field',
      targetId: id,
      before: { name: cur.name },
    });
  });
}

export async function setRequiredFields(a: AuthContext, stageId: string, fieldIds: string[]) {
  return db.transaction(async (tx) => {
    const stage = await getOr404(tx, stages, a.workspaceId, stageId, 'Stage');
    const unique = [...new Set(fieldIds)];
    if (unique.length) {
      const found = await tx
        .select({ id: customFields.id })
        .from(customFields)
        .where(and(eq(customFields.workspaceId, a.workspaceId), eq(customFields.entity, 'opportunity')));
      const ok = new Set(found.map((f) => f.id));
      const missing = unique.filter((id) => !ok.has(id));
      if (missing.length) throw badRequest('One of those fields does not belong to this workspace', 'Pick opportunity fields from this workspace');
    }
    await tx.delete(stageRequiredFields).where(and(eq(stageRequiredFields.workspaceId, a.workspaceId), eq(stageRequiredFields.stageId, stageId)));
    if (unique.length) {
      await tx.insert(stageRequiredFields).values(unique.map((fieldId) => ({ workspaceId: a.workspaceId, stageId, fieldId })));
    }
    await audit.record(tx, {
      workspaceId: a.workspaceId,
      actorId: a.userId,
      action: 'stage.required_fields',
      targetType: 'stage',
      targetId: stageId,
      after: { stage: stage.name, fieldIds: unique },
    });
    return unique;
  });
}
