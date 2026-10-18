import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import {
  activities,
  assignmentRules,
  contacts,
  leadAssignments,
  leads,
  memberships,
  users,
  workspaces,
} from '../../core/db/schema/index.js';
import type {
  AssignmentReason,
  AssignmentRules,
  Candidate,
  EscalationLevel,
  Lead,
  LeadSource,
  LeadState,
  MemberStatus,
  SkippedCandidate,
} from './domain/index.js';
import type { DbOrTx, Tx } from './ports.js';

export interface LeadRecord extends Lead {
  workspaceId: string;
  contactId: string;
  opportunityId: string | null;
  acknowledgedAt: Date | null;
  closedAt: Date | null;
}

export type NewLead = Omit<LeadRecord, 'id' | 'version' | 'ownerHistory'>;

export interface RulesRecord {
  rules: AssignmentRules;
  rrCursor: string | null;
}

export interface MemberRecord {
  userId: string;
  name: string;
  status: MemberStatus;
}

export interface ContactRecord {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface AssignmentRecord {
  id: string;
  userId: string;
  userName: string;
  assignedAt: Date;
  endedAt: Date | null;
  reason: AssignmentReason;
  endReason: string | null;
  level: number;
  skipped: SkippedCandidate[];
}

export interface PageCursor {
  createdAt: Date;
  id: string;
}

export interface LeadListFilter {
  status?: LeadState;
  ownerId?: string;
  source?: LeadSource;
  limit: number;
  cursor?: PageCursor;
}

export type ListedLead = LeadRecord & { contactName: string };

export interface LeadRepo {
  withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  lockLead(tx: Tx, workspaceId: string, leadId: string): Promise<LeadRecord | null>;
  lockLeadById(tx: Tx, leadId: string): Promise<LeadRecord | null>;
  getLead(q: DbOrTx | null, workspaceId: string, leadId: string): Promise<LeadRecord | null>;
  insertLead(tx: Tx, lead: NewLead): Promise<LeadRecord>;
  updateLead(tx: Tx, next: LeadRecord, expectedVersion: number): Promise<LeadRecord | null>;
  lockRules(tx: Tx, workspaceId: string): Promise<RulesRecord>;
  getRules(workspaceId: string): Promise<AssignmentRules>;
  saveCursor(tx: Tx, workspaceId: string, cursor: string | null): Promise<void>;
  saveRules(tx: Tx, workspaceId: string, rules: AssignmentRules): Promise<void>;
  candidates(tx: Tx, workspaceId: string): Promise<Candidate[]>;
  member(q: DbOrTx | null, workspaceId: string, userId: string): Promise<MemberRecord | null>;
  ownerHistory(tx: Tx, leadId: string): Promise<string[]>;
  openAssignment(
    tx: Tx,
    a: { workspaceId: string; leadId: string; userId: string; reason: AssignmentReason; level: number; at: Date },
  ): Promise<string>;
  closeAssignment(tx: Tx, leadId: string, endReason: string, at: Date): Promise<void>;
  lockDueLeads(tx: Tx, now: Date, limit: number, skipIds: string[], workspaceId?: string): Promise<LeadRecord[]>;
  lockOwnedOpenLeads(tx: Tx, workspaceId: string, userId: string): Promise<LeadRecord[]>;
  nextDueAt(): Promise<Date | null>;
  listLeads(workspaceId: string, f: LeadListFilter): Promise<ListedLead[]>;
  recoveryCandidates(
    workspaceId: string,
    f: { now: Date; idleSeconds: number; ownerId?: string; limit: number; cursor?: PageCursor },
  ): Promise<ListedLead[]>;
  assignments(workspaceId: string, leadId: string): Promise<AssignmentRecord[]>;
  findOpenLeadForContact(tx: Tx, workspaceId: string, contactId: string): Promise<LeadRecord | null>;
  getContact(q: DbOrTx | null, workspaceId: string, contactId: string): Promise<ContactRecord | null>;
  findOrCreateContact(
    tx: Tx,
    workspaceId: string,
    c: { name: string; phone: string | null; email: string | null },
  ): Promise<{ contact: ContactRecord; created: boolean }>;
  workspaceBySlug(slug: string): Promise<{ id: string; name: string } | null>;
}

type LeadRow = typeof leads.$inferSelect;

function toRecord(r: LeadRow): LeadRecord {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    contactId: r.contactId,
    opportunityId: r.opportunityId,
    source: r.source,
    state: r.status,
    ownerId: r.ownerId,
    version: r.version,
    createdAt: r.createdAt,
    firstAssignedAt: r.firstAssignedAt,
    assignedAt: r.assignedAt,
    firstAcknowledgedAt: r.firstAckAt,
    acknowledgedAt: r.acknowledgedAt,
    ackDeadline: r.ackDeadline,
    lastActionAt: r.lastActionAt,
    escalationLevel: r.escalationLevel,
    escalationCount: r.escalationCount,
    ownerHistory: [],
    ownerAway: r.ownerAway,
    closedAt: r.closedAt,
  };
}

function toColumns(l: NewLead) {
  return {
    workspaceId: l.workspaceId,
    contactId: l.contactId,
    opportunityId: l.opportunityId,
    source: l.source,
    status: l.state,
    ownerId: l.ownerId,
    assignedAt: l.assignedAt,
    ackDeadline: l.ackDeadline,
    acknowledgedAt: l.acknowledgedAt,
    firstAssignedAt: l.firstAssignedAt,
    firstAckAt: l.firstAcknowledgedAt,
    escalationLevel: l.escalationLevel,
    escalationCount: l.escalationCount,
    lastActionAt: l.lastActionAt,
    ownerAway: l.ownerAway,
    closedAt: l.closedAt,
  };
}

// DB stores escalation levels with snake_case user_id; the domain and API use userId.
type StoredLevel = { kind: EscalationLevel['kind']; seconds: number; user_id?: string };
const levelsFromDb = (v: unknown): EscalationLevel[] =>
  ((v as StoredLevel[] | null) ?? []).map((l) => ({ kind: l.kind, seconds: l.seconds, ...(l.user_id && { userId: l.user_id }) }));
const levelsToDb = (levels: EscalationLevel[]): StoredLevel[] =>
  levels.map((l) => ({ kind: l.kind, seconds: l.seconds, ...(l.userId && { user_id: l.userId }) }));

type RulesRow = typeof assignmentRules.$inferSelect;
const toRules = (r: RulesRow): AssignmentRules => ({
  strategy: 'round_robin',
  maxOpenLeads: r.maxOpenLeads,
  ackWindowSeconds: r.ackWindowSeconds,
  idleSeconds: r.idleSeconds,
  escalationLevels: levelsFromDb(r.escalationLevels),
  acknowledgedOnLeavePolicy: 'keep_flag_recover',
});

// Mirrors the assignment_rules column defaults.
const DEFAULT_RULES: AssignmentRules = {
  strategy: 'round_robin',
  maxOpenLeads: 20,
  ackWindowSeconds: 300,
  idleSeconds: 86400,
  escalationLevels: [],
  acknowledgedOnLeavePolicy: 'keep_flag_recover',
};

const OPEN: LeadState[] = ['assigned', 'acknowledged'];

function pageAfter(cursor: PageCursor | undefined, dir: 'asc' | 'desc'): SQL | undefined {
  if (!cursor) return undefined;
  const cmp = dir === 'desc' ? lt : gt;
  return or(cmp(leads.createdAt, cursor.createdAt), and(eq(leads.createdAt, cursor.createdAt), cmp(leads.id, cursor.id)));
}

const listedColumns = { lead: leads, contactName: contacts.name };

export const pgLeadRepo: LeadRepo = {
  withTx: (fn) => db.transaction(fn),

  async lockLead(tx, workspaceId, leadId) {
    const [r] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)))
      .for('update');
    return r ? toRecord(r) : null;
  },

  // For core hooks that pass only a lead id; their callers have already scoped the lead to a workspace.
  async lockLeadById(tx, leadId) {
    const [r] = await tx.select().from(leads).where(eq(leads.id, leadId)).for('update');
    return r ? toRecord(r) : null;
  },

  async getLead(q, workspaceId, leadId) {
    const [r] = await (q ?? db).select().from(leads).where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, leadId)));
    return r ? toRecord(r) : null;
  },

  async insertLead(tx, lead) {
    const [r] = await tx.insert(leads).values({ ...toColumns(lead), createdAt: lead.createdAt }).returning();
    return toRecord(r);
  },

  async updateLead(tx, next, expectedVersion) {
    const { workspaceId: _w, contactId: _c, ...cols } = toColumns(next);
    const [r] = await tx
      .update(leads)
      .set({ ...cols, version: next.version, updatedAt: sql`now()` })
      .where(and(eq(leads.workspaceId, next.workspaceId), eq(leads.id, next.id), eq(leads.version, expectedVersion)))
      .returning();
    return r ? { ...toRecord(r), ownerHistory: next.ownerHistory } : null;
  },

  async lockRules(tx, workspaceId) {
    await tx.insert(assignmentRules).values({ workspaceId }).onConflictDoNothing();
    const [r] = await tx.select().from(assignmentRules).where(eq(assignmentRules.workspaceId, workspaceId)).for('update');
    return { rules: toRules(r), rrCursor: r.rrCursor };
  },

  // Read-only; a workspace without a row yet gets the column defaults.
  async getRules(workspaceId) {
    const [r] = await db.select().from(assignmentRules).where(eq(assignmentRules.workspaceId, workspaceId));
    return r ? toRules(r) : { ...DEFAULT_RULES };
  },

  async saveCursor(tx, workspaceId, cursor) {
    await tx.update(assignmentRules).set({ rrCursor: cursor }).where(eq(assignmentRules.workspaceId, workspaceId));
  },

  async saveRules(tx, workspaceId, rules) {
    await tx
      .update(assignmentRules)
      .set({
        ackWindowSeconds: rules.ackWindowSeconds,
        maxOpenLeads: rules.maxOpenLeads,
        idleSeconds: rules.idleSeconds,
        escalationLevels: levelsToDb(rules.escalationLevels),
        acknowledgedOnLeavePolicy: rules.acknowledgedOnLeavePolicy,
        updatedAt: sql`now()`,
      })
      .where(eq(assignmentRules.workspaceId, workspaceId));
  },

  async candidates(tx, workspaceId) {
    const open = tx
      .select({ ownerId: leads.ownerId, n: sql<number>`count(*)::int`.as('n') })
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), inArray(leads.status, OPEN)))
      .groupBy(leads.ownerId)
      .as('open');
    const rows = await tx
      .select({ userId: memberships.userId, status: memberships.availability, n: open.n })
      .from(memberships)
      .leftJoin(open, eq(open.ownerId, memberships.userId))
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.active, true)));
    return rows.map((r) => ({ userId: r.userId, status: r.status, openLeadCount: r.n ?? 0 }));
  },

  async member(q, workspaceId, userId) {
    const [r] = await (q ?? db)
      .select({ userId: memberships.userId, name: users.name, status: memberships.availability })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId), eq(memberships.active, true)));
    return r ?? null;
  },

  async ownerHistory(tx, leadId) {
    const rows = await tx
      .select({ userId: leadAssignments.userId })
      .from(leadAssignments)
      .where(and(eq(leadAssignments.leadId, leadId), sql`${leadAssignments.endedAt} is not null`))
      .orderBy(asc(leadAssignments.assignedAt));
    return rows.map((r) => r.userId);
  },

  async openAssignment(tx, a) {
    const [r] = await tx
      .insert(leadAssignments)
      .values({ workspaceId: a.workspaceId, leadId: a.leadId, userId: a.userId, reason: a.reason, level: a.level, assignedAt: a.at })
      .returning({ id: leadAssignments.id });
    return r.id;
  },

  async closeAssignment(tx, leadId, endReason, at) {
    await tx
      .update(leadAssignments)
      .set({ endedAt: at, endReason })
      .where(and(eq(leadAssignments.leadId, leadId), isNull(leadAssignments.endedAt)));
  },

  // Across workspaces: called by the scheduler. SKIP LOCKED lets overlapping sweeps split the work instead of colliding.
  async lockDueLeads(tx, now, limit, skipIds, workspaceId) {
    const rows = await tx
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.status, 'assigned'),
          lte(leads.ackDeadline, now),
          workspaceId ? eq(leads.workspaceId, workspaceId) : undefined,
          skipIds.length ? notInArray(leads.id, skipIds) : undefined,
        ),
      )
      .orderBy(asc(leads.ackDeadline))
      .limit(limit)
      .for('update', { skipLocked: true });
    return rows.map(toRecord);
  },

  async lockOwnedOpenLeads(tx, workspaceId, userId) {
    const rows = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.ownerId, userId), inArray(leads.status, OPEN)))
      .orderBy(asc(leads.id))
      .for('update');
    return rows.map(toRecord);
  },

  async nextDueAt() {
    const [r] = await db
      .select({ at: sql<Date | null>`min(${leads.ackDeadline})`.mapWith((v) => (v ? new Date(v) : null)) })
      .from(leads)
      .where(eq(leads.status, 'assigned'));
    return r?.at ?? null;
  },

  async listLeads(workspaceId, f) {
    const rows = await db
      .select(listedColumns)
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(
        and(
          eq(leads.workspaceId, workspaceId),
          f.status && eq(leads.status, f.status),
          f.ownerId ? eq(leads.ownerId, f.ownerId) : undefined,
          f.source && eq(leads.source, f.source),
          pageAfter(f.cursor, 'desc'),
        ),
      )
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(f.limit);
    return rows.map((r) => ({ ...toRecord(r.lead), contactName: r.contactName }));
  },

  // Same conditions as domain recoveryReasons, so every row returned has at least one reason.
  async recoveryCandidates(workspaceId, f) {
    const idleBefore = new Date(f.now.getTime() - f.idleSeconds * 1000);
    const rows = await db
      .select(listedColumns)
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(
        and(
          eq(leads.workspaceId, workspaceId),
          ne(leads.status, 'closed'),
          f.ownerId ? eq(leads.ownerId, f.ownerId) : undefined,
          or(
            eq(leads.status, 'unassigned'),
            and(eq(leads.status, 'assigned'), lte(leads.ackDeadline, f.now)),
            sql`${leads.escalationCount} >= 2`,
            lte(leads.lastActionAt, idleBefore),
          ),
          pageAfter(f.cursor, 'asc'),
        ),
      )
      .orderBy(asc(leads.createdAt), asc(leads.id))
      .limit(f.limit);
    return rows.map((r) => ({ ...toRecord(r.lead), contactName: r.contactName }));
  },

  async assignments(workspaceId, leadId) {
    const rows = await db
      .select({ a: leadAssignments, userName: users.name })
      .from(leadAssignments)
      .innerJoin(users, eq(users.id, leadAssignments.userId))
      .where(and(eq(leadAssignments.workspaceId, workspaceId), eq(leadAssignments.leadId, leadId)))
      .orderBy(asc(leadAssignments.assignedAt));
    const acts = await db
      .select({ data: activities.data })
      .from(activities)
      .where(and(eq(activities.workspaceId, workspaceId), eq(activities.leadId, leadId), inArray(activities.type, ['assignment', 'lead_escalation'])));
    const skippedBy = new Map<string, SkippedCandidate[]>();
    for (const { data } of acts) {
      const d = data as { assignmentId?: string; skipped?: SkippedCandidate[] };
      if (d.assignmentId) skippedBy.set(d.assignmentId, d.skipped ?? []);
    }
    return rows.map(({ a, userName }) => ({
      id: a.id,
      userId: a.userId,
      userName,
      assignedAt: a.assignedAt,
      endedAt: a.endedAt,
      reason: a.reason,
      endReason: a.endReason,
      level: a.level,
      skipped: skippedBy.get(a.id) ?? [],
    }));
  },

  async findOpenLeadForContact(tx, workspaceId, contactId) {
    const [r] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.contactId, contactId), ne(leads.status, 'closed')))
      .orderBy(desc(leads.createdAt))
      .limit(1)
      .for('update');
    return r ? toRecord(r) : null;
  },

  async getContact(q, workspaceId, contactId) {
    const [r] = await (q ?? db)
      .select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, contactId)));
    return r ?? null;
  },

  // Temporary: modules/crm has no contacts service yet. Matches phone first (unique per workspace), then email.
  async findOrCreateContact(tx, workspaceId, c) {
    const cols = { id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email };
    const find = async () => {
      if (c.phone) {
        const [r] = await tx.select(cols).from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.phone, c.phone)));
        if (r) return r;
      }
      if (c.email) {
        const [r] = await tx
          .select(cols)
          .from(contacts)
          .where(and(eq(contacts.workspaceId, workspaceId), sql`lower(${contacts.email}) = ${c.email}`))
          .orderBy(asc(contacts.createdAt))
          .limit(1);
        if (r) return r;
      }
      return null;
    };
    const existing = await find();
    if (existing) return { contact: existing, created: false };
    // ON CONFLICT keeps the transaction alive if a concurrent submit inserted the same phone first
    const [inserted] = await tx.insert(contacts).values({ workspaceId, ...c }).onConflictDoNothing().returning(cols);
    if (inserted) return { contact: inserted, created: true };
    const raced = await find();
    if (!raced) throw new Error('contact insert conflicted but no match found');
    return { contact: raced, created: false };
  },

  async workspaceBySlug(slug) {
    const [r] = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.slug, slug));
    return r ?? null;
  },
};
