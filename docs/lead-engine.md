# Lead Engine

Scope: F3.1-F3.9 and the section 7 metric definitions.

| File | Role |
|---|---|
| `modules/leads/domain/` | pure rules, no IO; every function takes `now` |
| `modules/leads/repo.ts` | Drizzle queries, always filtered by `workspace_id` (except the cross-workspace sweep) |
| `modules/leads/service.ts` | transactions, locking, audit, activity, realtime, outbox |
| `modules/leads/routes.ts` | HTTP and zod validation only |
| `modules/leads/ports.ts` | the core services the engine calls (swappable in tests) |
| `modules/leads/index.ts` | builds the service, registers `leadHooks` with `core/lead-hooks`, exports the router |

## 1. Lead state machine

| From | To | Trigger |
|---|---|---|
| (new) | unassigned | intake with a source label: `webform`, `whatsapp` or `manual` |
| unassigned | assigned | assignment picks an Available member |
| assigned | acknowledged | owner clicks Acknowledge or records an action |
| assigned | assigned (new owner) | escalation (window expired) |
| assigned | assigned (new owner) | owner set to On leave / Offline |
| assigned | assigned (new owner) | manual reassignment |
| assigned | unassigned (stuck) | no candidate at any level; lead enters recovery queue |
| unassigned | unassigned (stuck) | nobody eligible at intake; lead enters recovery queue |
| unassigned (stuck) | assigned | manager reassigns |
| acknowledged | acknowledged (new owner) | manual reassignment by a manager; clears the acknowledgement |
| acknowledged | closed | owner or manager closes the lead |
| assigned, unassigned | closed | manager closes the lead |

- Every write increments `version`. Every transition into `assigned` sets `assigned_at` and `ack_deadline`, ends the previous `lead_assignments` row and opens a new one (the custody chain; `owner_history` is read from the ended rows).
- Manual reassignment of an acknowledged lead returns it to `assigned` with a fresh window.
- `closed` is terminal for this engine.

## 2. Definitions (section 7)

- **Assigned time**: `assigned_at`, the moment of the last assignment of any kind.
- **Acknowledged**: owner clicked Acknowledge, or recorded a note, message, call log, stage change or appointment on the lead. Activity types that count: `lead_ack`, `note`, `message`, `call_log`, `stage_change`, `appointment` (`countsAsAcknowledgement`); `assignment`, `field_edit`, `payment` and `lead_escalation` do not. A counting action by any team member sets `last_action_at`; by the owner while `assigned` it also acknowledges. Activity with no actor (system, or an inbound customer message) changes nothing, so a customer writing repeatedly does not hide a neglected lead.
- **Time to first response**: `first_acknowledged_at - first_assigned_at`, in seconds. Later reassignments do not reset it.
- **Escalation**: reassignment with reason `ack_expired`. Manual reassignment (`manual`) and absence reassignment (`owner_unavailable`) are counted separately and never as escalations.
- **Recovery item**: not closed, and unacknowledged past its window (including stuck leads with no owner), or `escalation_count >= 2`, or idle for `idle_seconds`. Reason codes: `unacked_overdue`, `escalated_multiple`, `idle`; each comes with display text.
- **Available employee**: status Available and open-lead count below `max_open_leads`. Busy, On leave and Offline never receive leads; reasons reported are `busy`, `on_leave`, `offline`, `at_capacity`.

## 3. Assignment

- Round-robin over members sorted by user id; the cursor is the user id that received the last lead, so roster changes cannot break it.
- Ineligible members are skipped with a reason (`busy`, `on_leave`, `offline`, `at_capacity`, `excluded`). The list is stored on the `assignment` activity and returned per custody row by `GET /leads/:id`, so the UI can show who was passed over and why.
- A lead with no eligible member stays `unassigned` and shows in the recovery queue straight away.
- The cursor (`assignment_rules.rr_cursor`) is advanced in the same transaction as the assignment. That transaction locks the workspace's `assignment_rules` row, which serialises assignments per workspace, so two leads arriving together cannot both take the last free slot of a member.
- Web form and messaging intake attach to the contact's open lead (adding a note) instead of opening a second one; manual entry always creates a lead.
- Manual reassignment (`leads.reassign`) needs the current `version`, an active member who is Available, and someone other than the current owner. Capacity is not enforced for a manager's explicit choice. It restarts the chain at level 0 with a fresh `ack_window_seconds` window and does not change `escalation_count`.
- Closing: the owner or anyone with `leads.reassign`. Closed leads keep their last owner for reporting.

## 4. Escalation chain

- Levels are configured as an ordered list `escalationLevels: [{kind, userId?, seconds}]` (same shape as `/assignment-rules`); level N is entry N, starting at 1. Kinds are `next_eligible`, `backup`, `manager`; `backup` and `manager` name one `userId`. Add more entries for more levels.
- The first window uses `ack_window_seconds` (level 0); level N's `seconds` is the window given to the person escalated to at level N.
- `next_eligible`: next eligible member after the current owner (id order, wrapping), skipping anyone who already owned the lead.
- `backup` / `manager`: the designated user, if Available and not the current owner; exempt from `max_open_leads`.
- A level with no target is skipped; the next level is tried. The current owner is never the target.
- No target at any remaining level: the lead is stuck, owner is cleared, and it appears in the recovery queue for a manager.
- Windows are in seconds, so 30-second windows are valid.

## 5. Owner goes On leave / Offline

- Unacknowledged leads: reassigned immediately (reason `owner_unavailable`, owner excluded from the pick, fresh window).
- Already-acknowledged leads (F3.6 policy, `acknowledgedOnLeavePolicy: "keep_flag_recover"`, returned by `/assignment-rules` so the UI can show it): stay with the owner, are flagged "owner away" on the lead and in lists, enter the recovery queue after `idle_seconds` with reason `idle` (text notes owner away), and a manager can reassign them.
- Flag is cleared when the owner returns to Available or Busy.
- `PUT /me/availability` updates the membership, then calls `leadHooks.onAvailabilityChange` in the same transaction; the hook returns `{reassigned, flaggedAway}`.
- Busy changes nothing for existing leads; it only stops new ones.

## 6. Guaranteeing F3.8

- Ownership is a single `owner_id` column on the lead, so two simultaneous owners cannot be represented.
- `lead_assignments` has a partial unique index allowing one open row per lead, a second guard.
- Every mutation runs in one transaction that first locks the lead row (`SELECT ... FOR UPDATE`). Lock order is always lead rows (by id) then the workspace's `assignment_rules` row, so paths cannot deadlock each other.
- The sweep claims one due lead per short transaction with `FOR UPDATE SKIP LOCKED`: overlapping sweeps (two ticks, a tick plus a timer, two instances) split the work instead of colliding. Under the lock it re-checks `shouldFire` (still `assigned`, deadline passed).
- The write is `UPDATE ... WHERE id = ? AND version = ?`; zero rows means someone else won, and the transaction rolls back.
- A committed escalation moves `ack_deadline` forward, so a later sweep for the same expiry finds nothing due. Two expiries of the same lead therefore produce exactly one escalation (tested with three concurrent sweeps against Postgres).
- A sweep processing a lead more than 120 s past its deadline (timers were down, e.g. after a restart) still escalates it once and notes `escalated late after server restart` with `lateBySeconds` in the audit entry.

## 7. Service API

Hooks, registered with `core/lead-hooks` when `modules/leads/index.ts` is imported. Shapes follow `core/lead-hooks.ts`:

| Hook | Notes |
|---|---|
| `createLead(tx, {workspaceId, contactId, source, opportunityId?})` | returns the lead; assigns immediately |
| `acknowledge(tx, {leadId, actorId})` | owner only (403), closed is 409, idempotent |
| `onActivity(tx, {leadId, actorId, type})` | called by `core/activity`; see the Acknowledged definition |
| `onAvailabilityChange(tx, {workspaceId, userId, status})` | returns `{reassigned, flaggedAway}` |
| `sweep(now)` | escalates every due lead; returns `{escalated, recovered}` (recovered = became stuck) |
| `reassign(tx, {leadId, toUserId, actorId})` | as the route, without the version check |
| `recoveryQueue(workspaceId, {userId, canSeeAll})` | `[{lead, reasons}]` |
| `nextDueAt()` | earliest `ack_deadline` of any pending lead, or null; lets the scheduler arm a timer for the exact moment instead of waiting for the next tick |

The service's own transactions publish realtime events only after commit. Hooks run inside the caller's transaction and publish when they return.

## 8. Events

Audit (`audit_log`, actor null = system, before/after = status, owner, version, deadline, level, counts, owner_away):
`lead.created`, `lead.assigned`, `lead.reassigned` (manual or `owner_unavailable`, reason in `after`), `lead.acknowledged` (`via` = button or the activity type), `lead.escalated`, `lead.stuck`, `lead.owner_away`, `lead.owner_back`, `lead.closed`, `assignment_rules.updated`.

Timeline (`activities`): `assignment` (initial, manual, owner_unavailable; with `skipped`), `lead_escalation` (with `level`, `kind`, `skipped`, or `stuck: true`), `lead_ack` (button), `note` (message from the web form or manual entry). The engine writes these rows directly rather than through `core/activity`, which would call back into `onActivity`.

Realtime (`{type, ids}`): `lead.created`, `lead.assigned`, `lead.acknowledged`, `lead.escalated`, `lead.reassigned`, `lead.closed`, `recovery.changed`. `ids` carries `leadId` and, where relevant, `ownerId`, `previousOwnerId`, `contactId`. Assignment events also target the new and previous owner via `userIds`.

Outbox (F3.9): each escalation enqueues `notify.escalation` with `{leadId, toUserId, fromUserId, source, reason: "ack_expired", level, kind, linkPath: "/leads/:id"}` in the escalation transaction. The notification module's handler sends it.

## 9. HTTP

Routes as in `docs/api.md`, mounted inside the `/api` router (`api.use(leadsRouter)`).

- Lead JSON: `{id, contactId, opportunityId, source, status, ownerId, assignedAt, ackDeadline, ackRemainingSeconds, acknowledgedAt, firstAssignedAt, firstAcknowledgedAt, escalationLevel, escalationCount, lastActionAt, ownerAway, version, closedAt, createdAt}`; list items add `contactName`.
- `GET /leads/:id` adds `assignments[]` (`{id, userId, userName, assignedAt, endedAt, reason, endReason, level, skipped[]}`) and `recoveryReasons[]`.
- Lists use keyset cursors (`createdAt`, `id`); `limit` 1-200, default 50.
- Users without `leads.reassign` see only their own leads; anyone else's lead id is a 404, like another workspace's.
- Errors: 404 missing or other workspace, 403 permission or not the owner, 409 `version_conflict` or `lead_closed`, 422 `assignee_unavailable` / `invalid_assignee` / `already_owner` / `validation_failed` (rules), 429 on the public form.
- Public form: zod-validated; phone normalised with the CRM helper (local numbers default to +92); contact matched by phone, then email, inside the workspace, else created. The `website` honeypot, unknown slugs and real submissions all get `201 {ok:true}`, so the response reveals nothing. Rate limit 5 per minute per IP and slug, in memory (per instance).
- Rules: windows 10 s to 7 days, up to 10 levels; `backup`/`manager` levels must name an active member.

## 10. Scheduler contract

`/internal/tick` (every minute) calls `leadHooks.sweep(new Date())`. For second-level precision at demo scale, the scheduler can also call `nextDueAt()` after each tick and after any `lead.assigned`/`lead.escalated`/`lead.reassigned` event, and `setTimeout` a sweep for that moment. Both paths are safe to overlap (section 6). Leads that came due while the server was down are processed on the first sweep after start.
