import { Router } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../core/db/client.js';
import { activities, contacts, conversations, leads, messages, users } from '../../core/db/schema/index.js';
import { asyncHandler, notFound, unprocessable } from '../../core/errors.js';
import { decodeCursor, page } from '../../core/http/list.js';
import { maskValues, requirePermission } from '../../core/rbac/index.js';

const uuid = z.string().uuid();
export const activitiesRouter = Router();

// Time-ordered log for one contact, opportunity or lead, newest first.
activitiesRouter.get('/activities', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const q = z.object({ contactId: uuid.optional(), opportunityId: uuid.optional(), leadId: uuid.optional(), limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().optional() }).parse(req.query);
  if (!q.contactId && !q.opportunityId && !q.leadId) throw unprocessable('Pass contactId, opportunityId or leadId', undefined, 'filter_required');
  const ws = req.auth!.workspaceId;
  const offset = decodeCursor(q.cursor);
  const rows = await db
    .select({ id: activities.id, type: activities.type, actorId: activities.actorId, actorName: users.name, data: activities.data, createdAt: activities.createdAt })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .where(and(eq(activities.workspaceId, ws), q.contactId ? eq(activities.contactId, q.contactId) : undefined, q.opportunityId ? eq(activities.opportunityId, q.opportunityId) : undefined, q.leadId ? eq(activities.leadId, q.leadId) : undefined))
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(q.limit + 1)
    .offset(offset);
  const p = page(rows, q.limit, offset, rows.length);
  res.json(maskValues({ items: p.items.map(({ actorName, ...r }) => ({ ...r, actor: r.actorId ? { id: r.actorId, name: actorName } : null })), nextCursor: p.nextCursor }, req.auth!.permissions.has('crm.view_values')));
}));

// The enquiry that started a lead: first inbound message (email) or the note left at intake.
activitiesRouter.get('/leads/:id/enquiry', requirePermission('crm.view'), asyncHandler(async (req, res) => {
  const a = req.auth!;
  const [lead] = await db.select().from(leads).where(and(eq(leads.workspaceId, a.workspaceId), eq(leads.id, uuid.parse(req.params.id))));
  if (!lead || (!a.permissions.has('leads.reassign') && lead.ownerId !== a.userId)) throw notFound('Lead');
  const [contact] = await db.select({ id: contacts.id, name: contacts.name, email: contacts.email, phone: contacts.phone }).from(contacts).where(eq(contacts.id, lead.contactId));
  const [m] = await db
    .select({ body: messages.body, at: messages.createdAt, conversationId: messages.conversationId, channel: conversations.channel })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(conversations.workspaceId, a.workspaceId), eq(conversations.contactId, lead.contactId), eq(messages.direction, 'in')))
    .orderBy(asc(messages.createdAt))
    .limit(1);
  let body = m?.body ?? null;
  let at: Date | null = m?.at ?? null;
  if (!body) {
    const [n] = await db.select({ data: activities.data, at: activities.createdAt }).from(activities).where(and(eq(activities.workspaceId, a.workspaceId), eq(activities.leadId, lead.id), eq(activities.type, 'note'))).orderBy(asc(activities.createdAt)).limit(1);
    body = ((n?.data as { body?: string } | undefined)?.body as string | undefined) ?? null;
    at = n?.at ?? null;
  }
  let subject: string | null = null;
  if (body && m && body.includes('\n\n')) {
    const parts = body.split('\n\n');
    subject = parts[0]!;
    body = parts.slice(1).join('\n\n');
  }
  res.json({ subject, body, receivedAt: at ?? lead.createdAt, channel: m?.channel ?? lead.source, conversationId: m?.conversationId ?? null, contact });
}));
