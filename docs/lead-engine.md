# Lead Engine

Scope: F3.1-F3.9 and the section 7 metric definitions. Pure rules live in `backend/src/modules/leads/domain/`; the service layer applies them inside a transaction.

## 1. Lead state machine

| From | To | Trigger |
|---|---|---|
| (new) | unassigned | intake (web form, message, manual) |
| unassigned | assigned | assignment picks an Available member |
| assigned | acknowledged | owner clicks Acknowledge or records an action |
| assigned | assigned (new owner) | escalation (window expired) |
| assigned | assigned (new owner) | owner set to On leave / Offline |
| assigned | assigned (new owner) | manual reassignment |
| assigned | unassigned (stuck) | no candidate at any level; lead enters recovery queue |
| acknowledged | acknowledged (new owner) | manual reassignment by a manager; clears the acknowledgement |
| acknowledged | closed | owner or manager closes the lead |
| assigned, unassigned | closed | manager closes the lead |

- Every transition into `assigned` increments `version`, sets `assigned_at`, `ack_deadline`, and appends the previous owner to `owner_history`.
- Manual reassignment of an acknowledged lead returns it to `assigned` with a fresh window.
- `closed` is terminal for this engine.

## 2. Definitions (section 7)

- **Assigned time**: `assigned_at`, the moment of the last assignment of any kind.
- **Acknowledged**: owner clicked Acknowledge, or recorded a note, message, call log, stage change or appointment on the lead. Any of these sets `last_action_at`; the first one while `assigned` also moves the state.
- **Time to first response**: `first_acknowledged_at - first_assigned_at`, in seconds. Later reassignments do not reset it.
- **Escalation**: reassignment with reason `ack_expired`. Manual reassignment (`manual`) and absence reassignment (`owner_unavailable`) are counted separately and never as escalations.
- **Recovery item**: not closed, and unacknowledged past its window, or `escalation_count >= 2`, or idle for `idle_seconds`.
- **Available employee**: status Available and open-lead count below `max_open_leads`. Busy, On leave and Offline never receive leads; reasons reported are `busy`, `on_leave`, `offline`, `at_capacity`.

## 3. Assignment

- Round-robin over members sorted by user id; the cursor is the user id that received the last lead, so roster changes cannot break it.
- Ineligible members are skipped with a reason; a lead with no eligible member stays `unassigned` and shows in the recovery queue once idle.
- The cursor is stored per workspace and advanced in the same transaction as the assignment.

## 4. Escalation chain

- Levels are configured as `{level, kind, seconds, userIds?}`; kinds are `next_eligible`, `backup`, `manager`.
- The first window uses `ack_window_seconds`; level N's `seconds` is the window given to the person escalated to at level N.
- `next_eligible`: next eligible member after the current owner (id order, wrapping), skipping anyone who already owned the lead.
- `backup` / `manager`: first designated user who is Available and not the current owner; exempt from `max_open_leads`.
- A level with no target is skipped; the next level is tried. The current owner is never the target.
- No target at any remaining level: the lead is stuck, owner is cleared, and it appears in the recovery queue for a manager.
- Windows are in seconds, so 30-second windows are valid.

## 5. Owner goes On leave / Offline

- Unacknowledged leads: reassigned immediately (reason `owner_unavailable`, owner excluded from the pick, fresh window).
- Already-acknowledged leads (F3.6 policy): stay with the owner, are flagged "owner away" on the lead and in lists, enter the recovery queue after `idle_seconds` with reason `idle` (text notes owner away), and a manager can reassign them.
- Flag is cleared when the owner returns to Available or Busy.
- Busy changes nothing for existing leads; it only stops new ones.

## 6. Guaranteeing F3.8

- Ownership is a single `owner_id` column on the lead, so two simultaneous owners cannot be represented.
- Every mutation runs in one transaction that first locks the lead row (`SELECT ... FOR UPDATE`).
- Each timer job carries the lead `version` it was armed for; `shouldFire` requires `state = assigned`, matching version and an elapsed deadline, otherwise the job is a no-op.
- The write is `UPDATE ... WHERE id = ? AND version = ?`; zero rows updated means someone else won, and the loser does nothing.
- Two expiries of the same version therefore produce exactly one escalation.
