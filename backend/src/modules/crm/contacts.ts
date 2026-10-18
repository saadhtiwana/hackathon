import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { activities, appointments, companies, contactTags, contacts, conversations, opportunities, payments, stages, tags, users } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { activity } from '../../core/activity/index.js';
import { getOr404, inWorkspace, updateVersioned } from '../../core/db/scoped.js';
import { decodeCursor, escapeLike, orderBy, page } from '../../core/http/list.js';
import { conflict } from '../../core/errors.js';
import type { AuthContext } from '../../core/auth/context.js';
import { validateCustom } from './custom.js';
import { cancelAppointment } from '../appointments/service.js';
import { assertActiveMember, diff } from './shared.js';

export interface ContactFilters {
  limit: number;
  cursor?: string;
  q?: string;
  sort?: string;
  dir: 'asc' | 'desc';
  ownerId?: string;
  companyId?: string;
  tagId?: string;
  createdFrom?: Date;
  createdTo?: Date;
}

function filterWhere(ws: string, f: Omit<ContactFilters, 'limit' | 'dir'>) {
  const like = f.q ? `%${escapeLike(f.q)}%` : null;
  return inWorkspace(
    contacts,
    ws,
    and(
      like ? or(ilike(contacts.name, like), ilike(contacts.phone, like), ilike(contacts.email, like)) : undefined,
      f.ownerId ? eq(contacts.ownerId, f.ownerId) : undefined,
      f.companyId ? eq(contacts.companyId, f.companyId) : undefined,
      f.createdFrom ? gte(contacts.createdAt, f.createdFrom) : undefined,
      f.createdTo ? lte(contacts.createdAt, f.createdTo) : undefined,
      f.tagId ? sql`exists (select 1 from ${contactTags} ct where ct.contact_id = ${contacts.id} and ct.tag_id = ${f.tagId})` : undefined,
    ),
  );
}

const listSelect = {
  id: contacts.id,
  name: contacts.name,
  phone: contacts.phone,
  email: contacts.email,
  companyId: contacts.companyId,
  companyName: companies.name,
  ownerId: contacts.ownerId,
  ownerName: users.name,
  optedOut: contacts.optedOut,
  version: contacts.version,
  createdAt: contacts.createdAt,
};

export async function listContacts(ws: string, f: ContactFilters) {
  const offset = decodeCursor(f.cursor);
  const where = filterWhere(ws, f);
  const rows = await db
    .select(listSelect)
    .from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .leftJoin(users, eq(users.id, contacts.ownerId))
    .where(where)
    .orderBy(...orderBy({ name: contacts.name, created_at: contacts.createdAt, email: contacts.email }, 'created_at', f.sort, f.dir, contacts.id))
    .limit(f.limit + 1)
    .offset(offset);
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(where)) as [{ n: number }];
  return page(rows, f.limit, offset, n);
}

export async function exportContacts(ws: string, f: ContactFilters) {
  const rows = await db.select(listSelect).from(contacts).leftJoin(companies, eq(companies.id, contacts.companyId)).leftJoin(users, eq(users.id, contacts.ownerId)).where(filterWhere(ws, f)).orderBy(contacts.createdAt).limit(5000);
  return rows;
}

export async function getContact(ws: string, id: string) {
  const contact = await getOr404(db, contacts, ws, id, 'Contact');
  const [company] = contact.companyId ? await db.select().from(companies).where(and(eq(companies.workspaceId, ws), eq(companies.id, contact.companyId))) : [];
  const [owner] = contact.ownerId ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, contact.ownerId)) : [];
  const [opps, tagRows, convos, pays, appts, acts] = await Promise.all([
    db
      .select({ id: opportunities.id, name: opportunities.name, pipelineId: opportunities.pipelineId, stageId: opportunities.stageId, stageName: stages.name, valueCents: opportunities.valueCents, currency: opportunities.currency, version: opportunities.version })
      .from(opportunities)
      .innerJoin(stages, eq(stages.id, opportunities.stageId))
      .where(and(eq(opportunities.workspaceId, ws), eq(opportunities.contactId, id)))
      .orderBy(desc(opportunities.createdAt)),
    db.select({ id: tags.id, name: tags.name }).from(contactTags).innerJoin(tags, eq(tags.id, contactTags.tagId)).where(and(eq(contactTags.workspaceId, ws), eq(contactTags.contactId, id))),
    db.select().from(conversations).where(and(eq(conversations.workspaceId, ws), eq(conversations.contactId, id))),
    db.select().from(payments).where(and(eq(payments.workspaceId, ws), eq(payments.contactId, id))).orderBy(desc(payments.createdAt)),
    db.select().from(appointments).where(and(eq(appointments.workspaceId, ws), eq(appointments.contactId, id))).orderBy(desc(appointments.startsAt)),
    db
      .select({ id: activities.id, type: activities.type, actorId: activities.actorId, actorName: users.name, data: activities.data, createdAt: activities.createdAt })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.actorId))
      .where(and(eq(activities.workspaceId, ws), eq(activities.contactId, id)))
      .orderBy(desc(activities.createdAt))
      .limit(50),
  ]);
  return { contact, company: company ?? null, owner: owner ?? null, tags: tagRows, opportunities: opps, conversations: convos, payments: pays, appointments: appts, activities: acts };
}

interface ContactInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  companyId?: string | null;
  ownerId?: string | null;
  custom?: Record<string, unknown>;
}

async function checkRefs(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], ws: string, i: Partial<ContactInput>) {
  if (i.companyId) await getOr404(tx, companies, ws, i.companyId, 'Company');
  if (i.ownerId) await assertActiveMember(tx, ws, i.ownerId);
  if (i.custom) await validateCustom(tx, ws, 'contact', null, i.custom);
}

async function phoneTaken(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], ws: string, phone: string, exceptId?: string) {
  const [dup] = await tx.select({ id: contacts.id, name: contacts.name }).from(contacts).where(and(eq(contacts.workspaceId, ws), eq(contacts.phone, phone)));
  if (dup && dup.id !== exceptId) throw conflict(`${dup.name} already uses this phone number`, 'Open the existing contact instead', 'duplicate_phone', { existingId: dup.id });
}

export async function createContact(a: AuthContext, i: ContactInput) {
  return db.transaction(async (tx) => {
    await checkRefs(tx, a.workspaceId, i);
    if (i.phone) await phoneTaken(tx, a.workspaceId, i.phone);
    const [c] = await tx.insert(contacts).values({ workspaceId: a.workspaceId, name: i.name, phone: i.phone ?? null, email: i.email ?? null, companyId: i.companyId ?? null, ownerId: i.ownerId ?? null, custom: i.custom ?? {} }).returning();
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'contact.created', targetType: 'contact', targetId: c!.id, after: { name: c!.name, phone: c!.phone, email: c!.email } });
    await activity.record(tx, { workspaceId: a.workspaceId, entity: { contactId: c!.id }, type: 'field_edit', actorId: a.userId, data: { event: 'created' } });
    return c!;
  });
}

export async function updateContact(a: AuthContext, id: string, version: number, patch: Partial<ContactInput>) {
  return db.transaction(async (tx) => {
    const cur = await getOr404(tx, contacts, a.workspaceId, id, 'Contact');
    await checkRefs(tx, a.workspaceId, patch);
    if (patch.phone) await phoneTaken(tx, a.workspaceId, patch.phone, id);
    const merged = patch.custom ? { ...(cur.custom as Record<string, unknown>), ...patch.custom } : undefined;
    const d = diff(cur as unknown as Record<string, unknown>, { ...patch, custom: merged });
    const c = await updateVersioned(tx, contacts, a.workspaceId, id, version, { ...patch, ...(merged ? { custom: merged } : {}), updatedAt: new Date() }, 'Contact');
    if (d.changed.length) {
      await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'contact.updated', targetType: 'contact', targetId: id, before: d.before, after: d.after });
      const rest = d.changed.filter((k) => k !== 'ownerId');
      if (rest.length) await activity.record(tx, { workspaceId: a.workspaceId, entity: { contactId: id }, type: 'field_edit', actorId: a.userId, data: { changes: Object.fromEntries(rest.map((k) => [k, { from: d.before[k], to: d.after[k] }])) } });
      if (d.changed.includes('ownerId')) await activity.record(tx, { workspaceId: a.workspaceId, entity: { contactId: id }, type: 'assignment', actorId: a.userId, data: { from: d.before.ownerId ?? null, to: d.after.ownerId ?? null } });
    }
    return c;
  });
}

export async function setOptOut(a: AuthContext, id: string, optedOut: boolean, reason?: string | null) {
  return db.transaction(async (tx) => {
    const cur = await getOr404(tx, contacts, a.workspaceId, id, 'Contact');
    const [c] = await tx.update(contacts).set({ optedOut, optOutReason: optedOut ? (reason ?? null) : null, updatedAt: new Date(), version: sql`${contacts.version} + 1` }).where(and(eq(contacts.workspaceId, a.workspaceId), eq(contacts.id, id))).returning();
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'contact.opt_out_changed', targetType: 'contact', targetId: id, before: { optedOut: cur.optedOut, reason: cur.optOutReason }, after: { optedOut, reason: c!.optOutReason } });
    await activity.record(tx, { workspaceId: a.workspaceId, entity: { contactId: id }, type: 'field_edit', actorId: a.userId, data: { changes: { optedOut: { from: cur.optedOut, to: optedOut } }, reason: reason ?? null } });
    return c!;
  });
}

// Deleting a contact removes its opportunities, leads and conversations. Money records are never destroyed silently.
export async function deleteContact(a: AuthContext, id: string) {
  // Appointments live on employees' real Google calendars: cancel them there first so no orphan events are left behind (Q4).
  await getOr404(db, contacts, a.workspaceId, id, 'Contact');
  const open = await db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.workspaceId, a.workspaceId), eq(appointments.contactId, id), eq(appointments.status, 'scheduled')));
  for (const ap of open) await cancelAppointment(a, ap.id);
  await db.transaction(async (tx) => {
    const cur = await getOr404(tx, contacts, a.workspaceId, id, 'Contact');
    const [pay] = await tx.select({ n: sql<number>`count(*)::int` }).from(payments).where(and(eq(payments.workspaceId, a.workspaceId), eq(payments.contactId, id), inArray(payments.status, ['paid', 'refunded', 'partially_refunded'])));
    if ((pay?.n ?? 0) > 0) throw conflict('This contact has recorded payments', 'Contacts with payment history cannot be deleted; remove the contact from lists instead', 'contact_has_payments');
    await tx.delete(contacts).where(and(eq(contacts.workspaceId, a.workspaceId), eq(contacts.id, id)));
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'contact.deleted', targetType: 'contact', targetId: id, before: { name: cur.name, phone: cur.phone, email: cur.email } });
  });
}

export async function listTags(ws: string) {
  return db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.workspaceId, ws)).orderBy(tags.name);
}

export async function createTag(a: AuthContext, name: string) {
  return db.transaction(async (tx) => {
    const [t] = await tx.insert(tags).values({ workspaceId: a.workspaceId, name }).onConflictDoNothing().returning({ id: tags.id, name: tags.name });
    if (t) return t;
    const [ex] = await tx.select({ id: tags.id, name: tags.name }).from(tags).where(and(eq(tags.workspaceId, a.workspaceId), eq(tags.name, name)));
    return ex!;
  });
}

export async function setContactTags(a: AuthContext, id: string, tagIds: string[]) {
  return db.transaction(async (tx) => {
    await getOr404(tx, contacts, a.workspaceId, id, 'Contact');
    const valid = tagIds.length ? await tx.select({ id: tags.id }).from(tags).where(and(eq(tags.workspaceId, a.workspaceId), inArray(tags.id, tagIds))) : [];
    if (valid.length !== new Set(tagIds).size) throw conflict('Some tags do not exist', undefined, 'unknown_tag');
    await tx.delete(contactTags).where(eq(contactTags.contactId, id));
    if (valid.length) await tx.insert(contactTags).values(valid.map((t) => ({ workspaceId: a.workspaceId, contactId: id, tagId: t.id })));
    await audit.record(tx, { workspaceId: a.workspaceId, actorId: a.userId, action: 'contact.tags_changed', targetType: 'contact', targetId: id, after: { tagIds: valid.map((t) => t.id) } });
    return db.select({ id: tags.id, name: tags.name }).from(contactTags).innerJoin(tags, eq(tags.id, contactTags.tagId)).where(eq(contactTags.contactId, id));
  });
}
