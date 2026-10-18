import { and, desc, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { db, type DbOrTx } from '../db/client.js';
import { notifications } from '../db/schema/index.js';
import { asyncHandler } from '../errors.js';
import { requireAuth } from '../auth/sessions.js';
import { realtime } from '../realtime/index.js';

export interface NotifyInput {
  workspaceId: string;
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
}

// Writes the in-app notification and nudges that user's open tabs. Never throws: a failed bell must not fail the action.
export async function notify(d: DbOrTx, n: NotifyInput): Promise<void> {
  try {
    await d.insert(notifications).values({ workspaceId: n.workspaceId, userId: n.userId, kind: n.kind, title: n.title, body: n.body ?? null, href: n.href ?? null });
    realtime.publish(n.workspaceId, { type: 'notification.created', ids: { userId: n.userId }, userIds: [n.userId] });
  } catch {
    /* the bell is best effort */
  }
}

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', requireAuth, asyncHandler(async (req, res) => {
  const a = req.auth!;
  const rows = await db.select().from(notifications).where(and(eq(notifications.workspaceId, a.workspaceId), eq(notifications.userId, a.userId))).orderBy(desc(notifications.createdAt)).limit(30);
  const unread = rows.filter((r) => !r.readAt).length;
  res.json({ items: rows.map(({ workspaceId: _w, userId: _u, ...r }) => r), unread });
}));

notificationsRouter.post('/notifications/read-all', requireAuth, asyncHandler(async (req, res) => {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, req.auth!.userId), isNull(notifications.readAt)));
  res.status(204).end();
}));

notificationsRouter.post('/notifications/:id/read', requireAuth, asyncHandler(async (req, res) => {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, req.auth!.userId), eq(notifications.id, String(req.params.id))));
  res.status(204).end();
}));
