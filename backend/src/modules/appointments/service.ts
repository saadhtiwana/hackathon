import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { appointments, contacts, memberships, opportunities, users } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { activity } from '../../core/activity/index.js';
import { getOr404 } from '../../core/db/scoped.js';
import { env } from '../../core/env.js';
import { AppError, conflict, unprocessable } from '../../core/errors.js';
import { integrationEvents } from '../../core/integration-events/index.js';
import { notify } from '../../core/notifications/index.js';
import { realtime } from '../../core/realtime/index.js';
import type { AuthContext } from '../../core/auth/context.js';
import { ProviderError } from '../integrations/errors.js';
import { createEvent, deleteEvent, freeBusy, patchEvent } from '../integrations/google/calendar.js';
import { userCalendarStore, type TokenStore } from '../integrations/google/tokens.js';

type Appt = typeof appointments.$inferSelect;

async function activeMember(ws: string, userId: string) {
  const [m] = await db.select({ name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.workspaceId, ws), eq(memberships.userId, userId), eq(memberships.active, true)));
  if (!m) throw unprocessable('That user is not an active member of this workspace', undefined, 'unknown_user');
  return m;
}

// Explains in plain words why someone cannot be booked (I3.7).
function plain(e: unknown, who: string): AppError {
  if (e instanceof AppError) return e;
  const pe = e instanceof ProviderError ? e : new ProviderError('Unexpected problem talking to Google Calendar', true, 'unexpected');
  if (pe.code === 'not_connected') return new AppError(422, 'calendar_not_connected', `${who} has not connected a Google Calendar, so they cannot be booked`, 'Ask them to connect their calendar under Integrations');
  if (pe.code === 'needs_reconnect') return new AppError(422, 'calendar_needs_reconnect', `${who}'s Google Calendar connection expired or was revoked`, 'Ask them to reconnect their calendar under Integrations');
  return new AppError(pe.temporary ? 503 : 422, pe.code, pe.message, pe.temporary ? 'Google is having trouble; try again in a moment' : undefined);
}

async function calendarCall<T>(ws: string, userId: string, who: string, type: string, fn: (store: TokenStore) => Promise<T>): Promise<T> {
  try {
    const out = await fn(userCalendarStore(ws, userId));
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'google', type, result: 'ok', ref: userId });
    return out;
  } catch (e) {
    const err = plain(e, who);
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'google', type, result: 'error', error: err.message, ref: userId }).catch(() => {});
    throw err;
  }
}

export async function busyTimes(a: AuthContext, userId: string, from: Date, to: Date) {
  const m = await activeMember(a.workspaceId, userId);
  const busy = await calendarCall(a.workspaceId, userId, m.name, 'calendar.freebusy', (s) => freeBusy(s, from, to));
  return { busy, from: from.toISOString(), to: to.toISOString() };
}

const describe = (name: string, phone: string | null, email: string | null, id: string, notes?: string | null) =>
  [notes, `Customer: ${name}${phone ? `, ${phone}` : ''}${email ? `, ${email}` : ''}`, `Contact record: ${env.APP_URL.replace(/\/$/, '')}/contacts/${id}`].filter(Boolean).join('\n\n');

export async function createAppointment(a: AuthContext, i: { userId: string; contactId: string; opportunityId?: string; start: Date; end: Date; timeZone: string; title: string; notes?: string; force?: boolean }) {
  const ws = a.workspaceId;
  const member = await activeMember(ws, i.userId);
  const contact = await getOr404(db, contacts, ws, i.contactId, 'Contact');
  if (i.opportunityId) await getOr404(db, opportunities, ws, i.opportunityId, 'Opportunity');

  // Overlap check against the employee's real calendar, which also contains appointments made here (I3.4).
  const busy = await calendarCall(ws, i.userId, member.name, 'calendar.freebusy', (s) => freeBusy(s, i.start, i.end));
  const conflicts = busy.filter((b) => new Date(b.start) < i.end && new Date(b.end) > i.start);
  if (conflicts.length && !i.force) throw conflict(`${member.name} is busy at that time`, 'Choose another time, or book anyway', 'calendar_conflict', { conflicts });

  const ev = await calendarCall(ws, i.userId, member.name, 'calendar.event.create', (s) => createEvent(s, { title: i.title, description: describe(contact.name, contact.phone, contact.email, contact.id, i.notes), start: i.start, end: i.end, timeZone: i.timeZone, attendeeEmail: contact.email }));
  const appt = await db.transaction(async (tx) => {
    const [row] = await tx.insert(appointments).values({ workspaceId: ws, userId: i.userId, contactId: i.contactId, opportunityId: i.opportunityId ?? null, googleEventId: ev.id, title: i.title, notes: i.notes ?? null, startsAt: i.start, endsAt: i.end, timezone: i.timeZone, status: 'scheduled' }).returning();
    await audit.record(tx, { workspaceId: ws, actorId: a.userId, action: 'appointment.created', targetType: 'appointment', targetId: row!.id, after: { userId: i.userId, contactId: i.contactId, startsAt: i.start, endsAt: i.end, timeZone: i.timeZone, forced: !!(conflicts.length && i.force) } });
    await activity.record(tx, { workspaceId: ws, entity: { contactId: i.contactId, opportunityId: i.opportunityId }, type: 'appointment', actorId: a.userId, data: { appointmentId: row!.id, event: 'created', title: i.title, startsAt: i.start, withUser: member.name, timeZone: i.timeZone } });
    return row!;
  });
  if (i.userId !== a.userId) await notify(db, { workspaceId: ws, userId: i.userId, kind: 'appointment_booked', title: `Appointment booked: ${i.title}`, body: `With ${contact.name}`, href: '/appointments' });
  realtime.publish(ws, { type: 'appointment.updated', ids: { appointmentId: appt.id, contactId: i.contactId, userId: i.userId } });
  return { ...appt, calendarLink: ev.htmlLink, inviteSentTo: contact.email ?? null };
}

export async function updateAppointment(a: AuthContext, id: string, patch: { start?: Date; end?: Date; timeZone?: string; title?: string; notes?: string; force?: boolean }) {
  const ws = a.workspaceId;
  const cur = await getOr404(db, appointments, ws, id, 'Appointment');
  if (cur.status !== 'scheduled') throw conflict('Only a scheduled appointment can be changed', undefined, 'not_scheduled');
  const member = await activeMember(ws, cur.userId);
  const start = patch.start ?? cur.startsAt;
  const end = patch.end ?? cur.endsAt;
  if (end <= start) throw unprocessable('The end must be after the start', undefined, 'invalid_range');
  const timeZone = patch.timeZone ?? cur.timezone;
  if ((patch.start || patch.end) && !patch.force) {
    const busy = await calendarCall(ws, cur.userId, member.name, 'calendar.freebusy', (s) => freeBusy(s, start, end));
    const conflicts = busy.filter((b) => new Date(b.start) < end && new Date(b.end) > start && Math.abs(+new Date(b.start) - +cur.startsAt) > 1000); // ignore the event being moved
    if (conflicts.length) throw conflict(`${member.name} is busy at that time`, 'Choose another time, or move it anyway', 'calendar_conflict', { conflicts });
  }
  const contact = await getOr404(db, contacts, ws, cur.contactId, 'Contact');
  if (cur.googleEventId) {
    await calendarCall(ws, cur.userId, member.name, 'calendar.event.update', (s) => patchEvent(s, cur.googleEventId!, { title: patch.title, description: describe(contact.name, contact.phone, contact.email, contact.id, patch.notes ?? cur.notes), start, end, timeZone }));
  }
  const next = await db.transaction(async (tx) => {
    const [row] = await tx.update(appointments).set({ startsAt: start, endsAt: end, timezone: timeZone, title: patch.title ?? cur.title, notes: patch.notes ?? cur.notes, updatedAt: new Date() }).where(eq(appointments.id, id)).returning();
    await audit.record(tx, { workspaceId: ws, actorId: a.userId, action: 'appointment.rescheduled', targetType: 'appointment', targetId: id, before: { startsAt: cur.startsAt, endsAt: cur.endsAt, title: cur.title }, after: { startsAt: start, endsAt: end, title: row!.title } });
    await activity.record(tx, { workspaceId: ws, entity: { contactId: cur.contactId, opportunityId: cur.opportunityId }, type: 'appointment', actorId: a.userId, data: { appointmentId: id, event: 'rescheduled', from: cur.startsAt, to: start, withUser: member.name } });
    return row!;
  });
  realtime.publish(ws, { type: 'appointment.updated', ids: { appointmentId: id, contactId: cur.contactId, userId: cur.userId } });
  return next;
}

export async function cancelAppointment(a: AuthContext, id: string) {
  const ws = a.workspaceId;
  const cur = await getOr404(db, appointments, ws, id, 'Appointment');
  if (cur.status === 'cancelled') return cur;
  const member = await activeMember(ws, cur.userId);
  if (cur.googleEventId) {
    try {
      await calendarCall(ws, cur.userId, member.name, 'calendar.event.delete', (s) => deleteEvent(s, cur.googleEventId!));
    } catch (e) {
      // Already gone on Google's side counts as cancelled; anything else is surfaced.
      if (!(e instanceof AppError) || !/not found|404|deleted|gone/i.test(e.message)) throw e;
    }
  }
  const next = await db.transaction(async (tx) => {
    const [row] = await tx.update(appointments).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(appointments.id, id)).returning();
    await audit.record(tx, { workspaceId: ws, actorId: a.userId, action: 'appointment.cancelled', targetType: 'appointment', targetId: id, before: { status: cur.status } });
    await activity.record(tx, { workspaceId: ws, entity: { contactId: cur.contactId, opportunityId: cur.opportunityId }, type: 'appointment', actorId: a.userId, data: { appointmentId: id, event: 'cancelled', title: cur.title, startsAt: cur.startsAt } });
    return row!;
  });
  realtime.publish(ws, { type: 'appointment.updated', ids: { appointmentId: id, contactId: cur.contactId, userId: cur.userId } });
  return next;
}

export async function listAppointments(ws: string, f: { userId?: string; contactId?: string; opportunityId?: string; from?: Date; to?: Date; includeCancelled?: boolean; limit: number }) {
  const rows = await db
    .select({ id: appointments.id, userId: appointments.userId, userName: users.name, contactId: appointments.contactId, contactName: contacts.name, opportunityId: appointments.opportunityId, title: appointments.title, notes: appointments.notes, startsAt: appointments.startsAt, endsAt: appointments.endsAt, timezone: appointments.timezone, status: appointments.status })
    .from(appointments)
    .innerJoin(contacts, eq(contacts.id, appointments.contactId))
    .innerJoin(users, eq(users.id, appointments.userId))
    .where(and(eq(appointments.workspaceId, ws), f.userId ? eq(appointments.userId, f.userId) : undefined, f.contactId ? eq(appointments.contactId, f.contactId) : undefined, f.opportunityId ? eq(appointments.opportunityId, f.opportunityId) : undefined, gte(appointments.startsAt, f.from ?? new Date()), f.to ? lte(appointments.startsAt, f.to) : undefined, f.includeCancelled ? undefined : ne(appointments.status, 'cancelled')))
    .orderBy(asc(appointments.startsAt))
    .limit(f.limit);
  return { items: rows };
}
