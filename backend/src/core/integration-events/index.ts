import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { integrationEvents } from '../db/schema/index.js';

type Provider = (typeof integrationEvents.$inferInsert)['provider'];

export interface InboundEvent {
  workspaceId: string;
  provider: Provider;
  type: string;
  externalId?: string | null;
  result: 'ok' | 'rejected' | 'duplicate' | 'error';
  httpStatus?: number;
  error?: string;
  ref?: string;
}

export const integrationEventsApi = {
  // Idempotent on (provider, workspace, external_id): a repeat returns duplicate and writes nothing.
  async recordInbound(e: InboundEvent): Promise<{ duplicate: boolean; id: string | null }> {
    const rows = await db
      .insert(integrationEvents)
      .values({ ...e, direction: 'in', externalId: e.externalId ?? null, httpStatus: e.httpStatus ?? null, error: e.error ?? null, ref: e.ref ?? null })
      .onConflictDoNothing()
      .returning({ id: integrationEvents.id });
    return { duplicate: rows.length === 0, id: rows[0]?.id ?? null };
  },

  async recordOutbound(e: { workspaceId: string; provider: Provider; type: string; externalId?: string; result: 'ok' | 'error'; httpStatus?: number; error?: string; ref?: string }): Promise<void> {
    await db.insert(integrationEvents).values({ ...e, direction: 'out', externalId: e.externalId ?? null, httpStatus: e.httpStatus ?? null, error: e.error ?? null, ref: e.ref ?? null });
  },

  async markResult(id: string, result: 'ok' | 'error', error?: string): Promise<void> {
    await db.update(integrationEvents).set({ result, error: error ?? null }).where(eq(integrationEvents.id, id));
  },
};

export { integrationEventsApi as integrationEvents };
