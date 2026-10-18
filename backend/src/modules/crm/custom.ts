import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { DbOrTx } from '../../core/db/client.js';
import { customFields, stageRequiredFields } from '../../core/db/schema/index.js';
import { unprocessable } from '../../core/errors.js';

type Entity = 'contact' | 'opportunity';

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

function typeOk(type: string, options: unknown, v: unknown): boolean {
  switch (type) {
    case 'text': return typeof v === 'string' && v.length <= 2000;
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'date': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
    case 'dropdown': return typeof v === 'string' && Array.isArray(options) && options.includes(v);
    case 'checkbox': return typeof v === 'boolean';
    default: return false;
  }
}

// Custom values are keyed by field id. Unknown ids and wrong types are rejected so data stays consistent (Q4).
export async function validateCustom(d: DbOrTx, workspaceId: string, entity: Entity, pipelineId: string | null, custom: Record<string, unknown>) {
  const ids = Object.keys(custom);
  if (!ids.length) return;
  const fields = await d
    .select()
    .from(customFields)
    .where(and(eq(customFields.workspaceId, workspaceId), eq(customFields.entity, entity), inArray(customFields.id, ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i))), pipelineId ? or(isNull(customFields.pipelineId), eq(customFields.pipelineId, pipelineId)) : isNull(customFields.pipelineId)));
  const byId = new Map(fields.map((f) => [f.id, f]));
  const bad: Record<string, string> = {};
  for (const id of ids) {
    const f = byId.get(id);
    const v = custom[id];
    if (!f) bad[id] = 'Unknown field for this record';
    else if (!isEmpty(v) && !typeOk(f.type, f.options, v)) bad[id] = `${f.name} must be a valid ${f.type}`;
  }
  if (Object.keys(bad).length) throw unprocessable('Some custom fields are invalid', undefined, 'invalid_custom_fields', { fields: bad });
}

// F2.4: a stage can require fields; the move is blocked until they are filled.
export async function assertRequiredFields(d: DbOrTx, workspaceId: string, stageId: string, stageName: string, custom: Record<string, unknown>) {
  const req = await d
    .select({ id: customFields.id, name: customFields.name })
    .from(stageRequiredFields)
    .innerJoin(customFields, eq(customFields.id, stageRequiredFields.fieldId))
    .where(and(eq(stageRequiredFields.workspaceId, workspaceId), eq(stageRequiredFields.stageId, stageId)));
  const missing = req.filter((f) => isEmpty(custom[f.id]));
  if (missing.length) {
    throw unprocessable(`Fill in ${missing.map((m) => m.name).join(', ')} before moving to ${stageName}`, 'Complete the required fields, then move the opportunity again', 'required_fields_missing', { fields: missing });
  }
}
