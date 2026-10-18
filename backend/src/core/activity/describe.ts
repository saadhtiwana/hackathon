import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';

type Row = { type: string; actorName?: string | null; data: unknown };

const REASON: Record<string, string> = { initial: 'round-robin', ack_expired: 'window expired', manual: 'manual reassignment', owner_unavailable: 'owner unavailable' };

// Names referenced inside activity data, looked up once for a batch of rows.
export async function nameMap(rows: Row[]): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const r of rows) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    for (const k of ['toUserId', 'fromUserId', 'withUserId']) if (typeof d[k] === 'string') ids.add(d[k] as string);
  }
  if (!ids.size) return new Map();
  const found = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...ids]));
  return new Map(found.map((u) => [u.id, u.name]));
}

// One plain sentence per activity, so every screen shows the same details.
export function describe(r: Row, names: Map<string, string>): string | null {
  const d = (r.data ?? {}) as Record<string, any>;
  const who = (id?: string | null) => (id ? (names.get(id) ?? 'someone') : null);
  switch (r.type) {
    case 'assignment':
      return d.toUserId ? `Assigned to ${who(d.toUserId)}${d.reason ? ` (${REASON[d.reason] ?? d.reason})` : ''}` : (d.stuck ? 'No one was available to take it' : null);
    case 'lead_escalation':
      if (d.exhausted) return 'Escalated past all levels';
      return d.toUserId ? `Escalated to ${who(d.toUserId)}${d.level ? ` (level ${d.level})` : ''}: window expired${d.fallback ? ' (nobody else available)' : ''}` : null;
    case 'lead_ack':
      return `Acknowledged by ${r.actorName ?? 'the owner'}`;
    case 'message':
      return d.direction === 'in' ? `Message received: ${d.preview ?? ''}`.trim() : `Message sent${d.preview ? `: ${d.preview}` : ''}`;
    case 'appointment':
      return d.event === 'created' ? `Appointment booked: ${d.title ?? ''}${d.withUser ? ` with ${d.withUser}` : ''}` : d.event === 'rescheduled' ? 'Appointment rescheduled' : d.event === 'cancelled' ? 'Appointment cancelled' : null;
    case 'payment':
      return d.event === 'link_sent' ? 'Payment link emailed' : d.status ? `Payment ${String(d.status).replace('_', ' ')}` : null;
    case 'stage_change':
      return d.from && d.to ? `Moved from ${d.from} to ${d.to}` : null;
    default:
      return null;
  }
}
