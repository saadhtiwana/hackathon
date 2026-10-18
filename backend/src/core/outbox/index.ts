import { and, asc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '../db/client.js';
import { outboxJobs } from '../db/schema/index.js';
import { logger } from '../logger.js';

export interface OutboxJob {
  id: string;
  workspaceId: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number; // including the current one
  maxAttempts: number;
}

export type OutboxHandler = (job: OutboxJob) => Promise<void>;

const handlers = new Map<string, OutboxHandler>();

const BATCH = 20;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;
// a job left running this long was claimed by a process that died
const STALE_LOCK_MS = 5 * 60_000;

export const backoffMs = (attempt: number) => Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));

const plainError = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

export const outbox = {
  // Call inside the transaction that makes the state change, so the job exists only if the change commits.
  async enqueue(
    d: DbOrTx,
    job: { workspaceId: string; kind: string; payload: Record<string, unknown>; runAt?: Date; maxAttempts?: number },
  ): Promise<string> {
    const [row] = await d
      .insert(outboxJobs)
      .values({
        workspaceId: job.workspaceId,
        kind: job.kind,
        payload: job.payload,
        runAt: job.runAt ?? new Date(),
        maxAttempts: job.maxAttempts ?? 5,
      })
      .returning({ id: outboxJobs.id });
    return row.id;
  },

  // Handlers must be idempotent: a crash after the send but before marking done runs the job again.
  registerHandler(kind: string, handler: OutboxHandler): void {
    handlers.set(kind, handler);
  },

  // Claims due jobs with SKIP LOCKED so concurrent drains never run the same job, then runs them outside the claim transaction.
  async drain(now: Date = new Date()): Promise<{ done: number; retried: number; failed: number }> {
    const out = { done: 0, retried: 0, failed: 0 };
    const kinds = [...handlers.keys()];
    if (!kinds.length) return out;

    const claimed = await db.transaction(async (tx) => {
      const due = await tx
        .select({ id: outboxJobs.id })
        .from(outboxJobs)
        .where(
          and(
            inArray(outboxJobs.kind, kinds),
            or(
              and(eq(outboxJobs.status, 'pending'), lte(outboxJobs.runAt, now)),
              and(eq(outboxJobs.status, 'running'), lt(outboxJobs.lockedAt, new Date(now.getTime() - STALE_LOCK_MS))),
            ),
          ),
        )
        .orderBy(asc(outboxJobs.runAt))
        .limit(BATCH)
        .for('update', { skipLocked: true });
      if (!due.length) return [];
      return tx
        .update(outboxJobs)
        .set({ status: 'running', lockedAt: now, attempts: sql`${outboxJobs.attempts} + 1` })
        .where(inArray(outboxJobs.id, due.map((r) => r.id)))
        .returning();
    });

    for (const row of claimed) {
      const job: OutboxJob = {
        id: row.id,
        workspaceId: row.workspaceId,
        kind: row.kind,
        payload: row.payload as Record<string, unknown>,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
      };
      try {
        await handlers.get(row.kind)!(job);
        await db.update(outboxJobs).set({ status: 'done', lockedAt: null, lastError: null }).where(eq(outboxJobs.id, row.id));
        out.done++;
      } catch (err) {
        const msg = plainError(err);
        if (row.attempts >= row.maxAttempts) {
          await db
            .update(outboxJobs)
            .set({ status: 'failed', lockedAt: null, lastError: `Gave up after ${row.attempts} attempts. Last error: ${msg}` })
            .where(eq(outboxJobs.id, row.id));
          logger.error('outbox job failed permanently', { jobId: row.id, kind: row.kind, err: msg });
          out.failed++;
        } else {
          await db
            .update(outboxJobs)
            .set({
              status: 'pending',
              lockedAt: null,
              runAt: new Date(Date.now() + backoffMs(row.attempts)),
              lastError: `Attempt ${row.attempts} of ${row.maxAttempts} failed, will retry. Error: ${msg}`,
            })
            .where(eq(outboxJobs.id, row.id));
          out.retried++;
        }
      }
    }
    return out;
  },
};
