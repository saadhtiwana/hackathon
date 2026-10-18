# Modules and Ownership

Backend layout: `backend/src/core/` (shared) and `backend/src/modules/<module>/{routes,service,repo}.ts`. routes = HTTP and zod validation, service = business rules, repo = Drizzle queries. Modules call each other only through service functions and the interfaces below.

## Ownership

| Owner | Scope |
|---|---|
| Saad | core: auth, rbac, audit, activity, realtime, crypto, integration events; workspace; users/roles; basic CRM CRUD (contacts, companies, opportunities); integrations (messaging, payments, calendar, notifications); DB schema and migrations; API contract |
| Abdullah | `modules/leads/**`; job runtime: `core/db/tx.ts`, `core/outbox/`, `core/scheduler/`, `/internal/tick`; audit page; dashboard |
| Ahmad | CRM customization (pipelines, stages, custom fields, stage-required fields, saved lists) and all of `/frontend` |

Folders reserved and left empty for Abdullah: `core/outbox/`, `core/scheduler/`, `core/db/tx.ts`.

## Route prefixes

`/api/*` app routes (session auth). `/health`, `/internal/*` (shared-secret header, called by the scheduler), `/realtime/*` (SSE), `/webhooks/*` (provider signature auth).

## Cross-module interfaces

Every function takes the workspace explicitly; none infers it from ambient state. `Tx` is a Drizzle transaction handle.

```ts
// core/activity
activity.record(tx: Tx, e: {
  workspaceId: string;
  entity: { contactId?: string; opportunityId?: string; leadId?: string };
  type: 'note' | 'stage_change' | 'assignment' | 'field_edit' | 'message' | 'payment' | 'appointment' | 'lead_ack' | 'call_log';
  actorId: string | null;            // null = system
  data: Record<string, unknown>;
}): Promise<void>;

// core/audit  (append-only; DB trigger rejects UPDATE/DELETE)
audit.record(tx: Tx, e: {
  workspaceId: string;
  actorId: string | null;            // null = system
  action: string;                    // e.g. 'lead.escalated', 'role.permissions_changed'
  targetType: string;
  targetId: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void>;

// core/outbox  (Abdullah)
outbox.enqueue(tx: Tx, job: {
  workspaceId: string;
  kind: string;                      // e.g. 'notify.telegram', 'message.send', 'lead.ack_timeout'
  payload: Record<string, unknown>;
  runAt?: Date;                      // default now
  maxAttempts?: number;              // default 5
}): Promise<string>;                 // job id
outbox.registerHandler(kind: string, handler: (job: OutboxJob) => Promise<void>): void;
// handler throws -> retried with backoff until max_attempts; handlers must be idempotent

// core/realtime
realtime.publish(workspaceId: string, event: {
  type: 'lead.created' | 'lead.assigned' | 'lead.escalated' | 'lead.acknowledged' | 'message.received' | 'message.status' | 'payment.updated' | 'appointment.updated' | 'availability.changed';
  data: Record<string, unknown>;
  userIds?: string[];                // omit = whole workspace
}): void;

// core/integration-events
integrationEvents.recordInbound(e: {
  workspaceId: string; provider: 'twilio' | 'stripe' | 'google' | 'telegram';
  type: string; externalId: string; result: 'ok' | 'rejected' | 'duplicate' | 'error';
  httpStatus?: number; error?: string; ref?: string;
}): Promise<{ duplicate: boolean }>;     // unique (provider, workspace, external_id)
integrationEvents.recordOutbound(e: {
  workspaceId: string; provider: string; type: string; externalId?: string;
  result: 'ok' | 'error'; httpStatus?: number; error?: string; ref?: string;
}): Promise<void>;

// core/db/tx.ts  (Abdullah)
withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
lockLead(tx: Tx, leadId: string): Promise<LeadRow>;   // SELECT ... FOR UPDATE

// modules/leads  (Abdullah) - the only entry points other modules may call
leadHooks: {
  createLead(tx: Tx, i: { workspaceId: string; contactId: string; source: 'webform' | 'whatsapp' | 'manual'; opportunityId?: string }): Promise<LeadRow>;
  acknowledge(tx: Tx, i: { leadId: string; actorId: string }): Promise<LeadRow>;
  onActivity(tx: Tx, i: { leadId: string; actorId: string | null; type: string }): Promise<void>;   // counts as acknowledgement when actor is the owner
  onAvailabilityChange(tx: Tx, i: { workspaceId: string; userId: string; status: 'available' | 'busy' | 'on_leave' | 'offline' }): Promise<void>;
  sweep(now: Date): Promise<{ escalated: number; recovered: number }>;   // called from /internal/tick
  reassign(tx: Tx, i: { leadId: string; toUserId: string; actorId: string }): Promise<LeadRow>;
  recoveryQueue(workspaceId: string, viewer: { userId: string; canSeeAll: boolean }): Promise<RecoveryItem[]>;
};
```

Rules: webhooks record the inbound integration event first and stop on `duplicate`; side effects (sends, alerts) go through `outbox.enqueue` in the same transaction as the state change; every state change calls `audit.record` or `activity.record` in that transaction.
