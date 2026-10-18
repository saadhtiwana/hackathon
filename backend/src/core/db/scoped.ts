import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { notFound, conflict } from '../errors.js';
import type { DbOrTx } from './client.js';

type WsTable = PgTable & { id: PgColumn; workspaceId: PgColumn };
type VersionedTable = WsTable & { version: PgColumn };

// Every row lookup goes through the session workspace; another workspace's id is indistinguishable from a missing one.
export const inWorkspace = (t: WsTable, workspaceId: string, extra?: SQL) => and(eq(t.workspaceId, workspaceId), extra);

export async function getOr404<T extends WsTable>(d: DbOrTx, t: T, workspaceId: string, id: string, what = 'Record'): Promise<T['$inferSelect']> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound(what);
  const [row] = await d.select().from(t as PgTable).where(and(eq(t.workspaceId, workspaceId), eq(t.id, id))).limit(1);
  if (!row) throw notFound(what);
  return row as T['$inferSelect'];
}

// Optimistic concurrency: caller sends the version it read; a mismatch is a 409 instead of a silent overwrite (Q4).
export async function updateVersioned<T extends VersionedTable>(
  d: DbOrTx,
  t: T,
  workspaceId: string,
  id: string,
  expectedVersion: number,
  set: Record<string, unknown>,
  what = 'Record',
): Promise<T['$inferSelect']> {
  const rows = await d
    .update(t as PgTable)
    .set({ ...set, version: sql`${t.version} + 1` } as never)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.id, id), eq(t.version, expectedVersion)))
    .returning();
  if (rows.length) return rows[0] as T['$inferSelect'];
  await getOr404(d, t, workspaceId, id, what);
  throw conflict(`${what} was changed by someone else`, 'Reload the record and apply your change again', 'version_conflict');
}
