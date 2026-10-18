import { randomUUID } from 'node:crypto';
import type { AssignmentRules, MemberStatus } from '../domain/index.js';
import type { ActivityEvent, AuditEvent, OutboxJobInput, Ports, RealtimeEvent, Tx } from '../ports.js';
import type { AssignmentRecord, ContactRecord, LeadRecord, LeadRepo, ListedLead } from '../repo.js';

export const T0 = new Date('2026-01-01T00:00:00Z');
export const at = (s: number) => new Date(T0.getTime() + s * 1000);

interface Member {
  userId: string;
  name: string;
  status: MemberStatus;
  workspaceId: string;
}

interface Assignment extends Omit<AssignmentRecord, 'userName' | 'skipped'> {
  workspaceId: string;
  leadId: string;
}

interface State {
  leads: Map<string, LeadRecord>;
  assignments: Assignment[];
  contacts: Map<string, ContactRecord & { workspaceId: string }>;
  rules: Map<string, { rules: AssignmentRules; rrCursor: string | null }>;
  members: Member[];
  workspaces: { id: string; name: string; slug: string }[];
}

export const defaultRules = (over: Partial<AssignmentRules> = {}): AssignmentRules => ({
  strategy: 'round_robin',
  maxOpenLeads: 3,
  ackWindowSeconds: 30,
  idleSeconds: 600,
  escalationLevels: [
    { kind: 'next_eligible', seconds: 30 },
    { kind: 'backup', seconds: 30, userId: 'bk' },
    { kind: 'manager', seconds: 30, userId: 'mg' },
  ],
  acknowledgedOnLeavePolicy: 'keep_flag_recover',
  ...over,
});

export function fakePorts() {
  const audits: AuditEvent[] = [];
  const acts: ActivityEvent[] = [];
  const jobs: OutboxJobInput[] = [];
  const events: (RealtimeEvent & { workspaceId: string })[] = [];
  const ports: Ports = {
    audit: { record: async (_tx, e) => void audits.push(e) },
    activity: { record: async (_tx, e) => void acts.push(e) },
    outbox: { enqueue: async (_tx, j) => (jobs.push(j), randomUUID()) },
    realtime: { publish: (workspaceId, e) => void events.push({ workspaceId, ...e }) },
  };
  return { ports, audits, acts, jobs, events };
}

export function fakeRepo(acts: ActivityEvent[], jobs: OutboxJobInput[], audits: AuditEvent[]) {
  const s: State = { leads: new Map(), assignments: [], contacts: new Map(), rules: new Map(), members: [], workspaces: [] };
  const tx = {} as Tx;
  const clone = (l: LeadRecord) => ({ ...l, ownerHistory: [...l.ownerHistory] });
  const listed = (l: LeadRecord): ListedLead => ({ ...clone(l), contactName: s.contacts.get(l.contactId)?.name ?? '' });
  const rulesFor = (ws: string) => {
    if (!s.rules.has(ws)) s.rules.set(ws, { rules: defaultRules(), rrCursor: null });
    return s.rules.get(ws)!;
  };

  const repo: LeadRepo = {
    // snapshot and restore so a thrown error behaves like a rollback
    async withTx(fn) {
      const saved = {
        leads: new Map([...s.leads].map(([k, v]) => [k, clone(v)])),
        assignments: s.assignments.map((a) => ({ ...a })),
        contacts: new Map(s.contacts),
        rules: new Map([...s.rules].map(([k, v]) => [k, { ...v }])),
        acts: acts.length,
        jobs: jobs.length,
        audits: audits.length,
      };
      try {
        return await fn(tx);
      } catch (e) {
        s.leads = saved.leads;
        s.assignments = saved.assignments;
        s.contacts = saved.contacts;
        s.rules = saved.rules;
        acts.length = saved.acts;
        jobs.length = saved.jobs;
        audits.length = saved.audits;
        throw e;
      }
    },
    async lockLead(_tx, ws, id) {
      const l = s.leads.get(id);
      return l && l.workspaceId === ws ? clone(l) : null;
    },
    async lockLeadById(_tx, id) {
      const l = s.leads.get(id);
      return l ? clone(l) : null;
    },
    async getLead(_q, ws, id) {
      const l = s.leads.get(id);
      return l && l.workspaceId === ws ? clone(l) : null;
    },
    async insertLead(_tx, l) {
      const rec: LeadRecord = { ...l, id: randomUUID(), version: 1, ownerHistory: [] };
      s.leads.set(rec.id, rec);
      return clone(rec);
    },
    async updateLead(_tx, next, expected) {
      const cur = s.leads.get(next.id);
      if (!cur || cur.workspaceId !== next.workspaceId || cur.version !== expected) return null;
      s.leads.set(next.id, clone(next));
      return clone(next);
    },
    async lockRules(_tx, ws) {
      const r = rulesFor(ws);
      return { rules: { ...r.rules }, rrCursor: r.rrCursor };
    },
    async getRules(ws) {
      return { ...rulesFor(ws).rules };
    },
    async saveCursor(_tx, ws, c) {
      rulesFor(ws).rrCursor = c;
    },
    async saveRules(_tx, ws, rules) {
      rulesFor(ws).rules = rules;
    },
    async candidates(_tx, ws) {
      return s.members
        .filter((m) => m.workspaceId === ws)
        .map((m) => ({
          userId: m.userId,
          status: m.status,
          openLeadCount: [...s.leads.values()].filter((l) => l.ownerId === m.userId && (l.state === 'assigned' || l.state === 'acknowledged')).length,
        }));
    },
    async member(_q, ws, userId) {
      const m = s.members.find((x) => x.workspaceId === ws && x.userId === userId);
      return m ? { userId: m.userId, name: m.name, status: m.status } : null;
    },
    async ownerHistory(_tx, leadId) {
      return s.assignments.filter((a) => a.leadId === leadId && a.endedAt).map((a) => a.userId);
    },
    async openAssignment(_tx, a) {
      const id = randomUUID();
      s.assignments.push({ id, workspaceId: a.workspaceId, leadId: a.leadId, userId: a.userId, reason: a.reason, level: a.level, assignedAt: a.at, endedAt: null, endReason: null });
      return id;
    },
    async closeAssignment(_tx, leadId, endReason, when) {
      for (const a of s.assignments) if (a.leadId === leadId && !a.endedAt) Object.assign(a, { endedAt: when, endReason });
    },
    async lockDueLeads(_tx, now, limit, skip, ws) {
      return [...s.leads.values()]
        .filter((l) => (!ws || l.workspaceId === ws) && l.state === 'assigned' && l.ackDeadline && l.ackDeadline <= now && !skip.includes(l.id))
        .sort((a, b) => a.ackDeadline!.getTime() - b.ackDeadline!.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async lockOwnedOpenLeads(_tx, ws, userId) {
      return [...s.leads.values()]
        .filter((l) => l.workspaceId === ws && l.ownerId === userId && (l.state === 'assigned' || l.state === 'acknowledged'))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map(clone);
    },
    async nextDueAt() {
      const ds = [...s.leads.values()].filter((l) => l.state === 'assigned' && l.ackDeadline).map((l) => l.ackDeadline!.getTime());
      return ds.length ? new Date(Math.min(...ds)) : null;
    },
    async listLeads(ws, f) {
      return [...s.leads.values()]
        .filter((l) => l.workspaceId === ws && (!f.status || l.state === f.status) && (!f.ownerId || l.ownerId === f.ownerId) && (!f.source || l.source === f.source))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
        .slice(0, f.limit)
        .map(listed);
    },
    async recoveryCandidates(ws, f) {
      return [...s.leads.values()]
        .filter((l) => l.workspaceId === ws && l.state !== 'closed' && (!f.ownerId || l.ownerId === f.ownerId))
        .slice(0, f.limit)
        .map(listed);
    },
    async assignments(ws, leadId) {
      return s.assignments
        .filter((a) => a.workspaceId === ws && a.leadId === leadId)
        .map(({ workspaceId: _w, leadId: _l, ...a }) => ({
          ...a,
          userName: s.members.find((m) => m.userId === a.userId)?.name ?? '',
          skipped: (acts.find((x) => x.data.assignmentId === a.id)?.data.skipped as AssignmentRecord['skipped']) ?? [],
        }));
    },
    async findOpenLeadForContact(_tx, ws, contactId) {
      const l = [...s.leads.values()].find((x) => x.workspaceId === ws && x.contactId === contactId && x.state !== 'closed');
      return l ? clone(l) : null;
    },
    async getContact(_q, ws, id) {
      const c = s.contacts.get(id);
      return c && c.workspaceId === ws ? { id: c.id, name: c.name, phone: c.phone, email: c.email } : null;
    },
    async findOrCreateContact(_tx, ws, c) {
      const existing = [...s.contacts.values()].find(
        (x) => x.workspaceId === ws && ((c.phone && x.phone === c.phone) || (c.email && x.email === c.email)),
      );
      if (existing) return { contact: existing, created: false };
      const rec = { id: randomUUID(), workspaceId: ws, ...c };
      s.contacts.set(rec.id, rec);
      return { contact: rec, created: true };
    },
    async workspaceBySlug(slug) {
      const w = s.workspaces.find((x) => x.slug === slug);
      return w ? { id: w.id, name: w.name } : null;
    },
  };

  return {
    repo,
    state: s,
    tx,
    addMember(workspaceId: string, userId: string, status: MemberStatus = 'available') {
      s.members.push({ workspaceId, userId, name: userId.toUpperCase(), status });
    },
    setStatus(userId: string, status: MemberStatus) {
      for (const m of s.members) if (m.userId === userId) m.status = status;
    },
    addContact(workspaceId: string, name = 'Customer') {
      const c = { id: randomUUID(), workspaceId, name, phone: null, email: null };
      s.contacts.set(c.id, c);
      return c.id;
    },
    setRules(workspaceId: string, rules: AssignmentRules) {
      s.rules.set(workspaceId, { rules, rrCursor: null });
    },
  };
}

export function setup(now: { t: Date } = { t: T0 }) {
  const p = fakePorts();
  const f = fakeRepo(p.acts, p.jobs, p.audits);
  return { ...p, ...f, now };
}
