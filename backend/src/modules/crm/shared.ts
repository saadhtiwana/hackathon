import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../core/db/client.js';
import { memberships } from '../../core/db/schema/index.js';
import { badRequest } from '../../core/errors.js';

export async function assertActiveMember(d: DbOrTx, workspaceId: string, userId: string) {
  const [m] = await d.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId), eq(memberships.active, true)));
  if (!m) throw badRequest('Owner must be an active member of this workspace', undefined, 'unknown_owner');
}

export function diff<T extends Record<string, unknown>>(before: T, patch: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const old = before[k];
    if (JSON.stringify(old) !== JSON.stringify(v)) {
      b[k] = old;
      a[k] = v;
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}

const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}
