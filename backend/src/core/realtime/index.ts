import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { env } from '../env.js';
import { safeEqual } from '../crypto/index.js';
import { asyncHandler, unauthorized } from '../errors.js';
import { requireAuth } from '../auth/sessions.js';

export interface RealtimeEvent {
  type: string;
  ids?: Record<string, string | null | undefined>;
  userIds?: string[];
}

interface Client {
  res: Response;
  userId: string;
}

// In-process hub: the free tier runs a single instance, so no pub/sub backplane.
const clients = new Map<string, Set<Client>>();

export const realtime = {
  publish(workspaceId: string, event: RealtimeEvent): void {
    const set = clients.get(workspaceId);
    if (!set) return;
    const payload = `data: ${JSON.stringify({ type: event.type, ids: event.ids ?? {} })}\n\n`;
    for (const c of set) {
      if (event.userIds && !event.userIds.includes(c.userId)) continue;
      c.res.write(payload);
    }
  },
  clientCount: () => [...clients.values()].reduce((n, s) => n + s.size, 0),
};

const TTL_MS = 60_000;
const sign = (body: string) => createHmac('sha256', env.SESSION_SECRET).update(body).digest('base64url');

export function issueTicket(userId: string, workspaceId: string) {
  const exp = Date.now() + TTL_MS;
  const body = Buffer.from(JSON.stringify({ u: userId, w: workspaceId, e: exp })).toString('base64url');
  return { ticket: `${body}.${sign(body)}`, expiresAt: new Date(exp).toISOString() };
}

export function verifyTicket(ticket: string): { userId: string; workspaceId: string } | null {
  const [body, sig] = ticket.split('.');
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof p.e !== 'number' || p.e < Date.now()) return null;
    return { userId: p.u, workspaceId: p.w };
  } catch {
    return null;
  }
}

export const realtimeApiRouter = Router();
realtimeApiRouter.get(
  '/realtime/ticket',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(issueTicket(req.auth!.userId, req.auth!.workspaceId));
  }),
);

// Mounted at /realtime (outside /api); the browser connects here directly with a short-lived ticket.
export const realtimeStreamRouter = Router();
realtimeStreamRouter.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin && env.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  next();
});
realtimeStreamRouter.get('/stream', (req: Request, res: Response, next) => {
  const t = verifyTicket(String(req.query.ticket ?? ''));
  if (!t) return next(unauthorized('Realtime ticket is invalid or expired', 'Request a new ticket'));
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': connected\n\n');
  const client: Client = { res, userId: t.userId };
  let set = clients.get(t.workspaceId);
  if (!set) clients.set(t.workspaceId, (set = new Set()));
  set.add(client);
  const beat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(beat);
    set!.delete(client);
    if (!set!.size) clients.delete(t.workspaceId);
  });
});
