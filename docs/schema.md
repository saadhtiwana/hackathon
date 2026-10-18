# Database Schema

Source of truth: `backend/src/core/db/schema/` (Drizzle, one file per module). Migrations in `backend/drizzle/`. Postgres on Neon; UUID primary keys (`gen_random_uuid()`); all timestamps `timestamptz`.

## Rules

- Every workspace-owned table has `workspace_id uuid NOT NULL`, an index starting with it, and `ON DELETE CASCADE` to `workspaces` (audit_log uses RESTRICT). Every query filters by it.
- Only `workspaces`, `users` and `login_attempts` have no `workspace_id` (global or pre-auth).
- Every FK states its ON DELETE: parent-owned rows CASCADE, optional references SET NULL, history and role references RESTRICT.
- Money is integer cents plus currency. Instants are UTC; appointments also keep the IANA timezone.
- Optimistic concurrency: `version` on `leads` and `opportunities`; writes use `WHERE version = ?`.

## Tables

| Module | Tables |
|---|---|
| workspace | workspaces, users, roles, role_permissions, memberships, sessions, invites, login_attempts |
| crm | companies, contacts, tags, contact_tags, pipelines, stages, custom_fields, stage_required_fields, opportunities, saved_lists |
| activities | activities |
| leads | leads, lead_assignments, assignment_rules |
| messaging | conversations, messages |
| payments | payments |
| appointments | appointments |
| integrations | integration_connections, user_connections, integration_events, outbox_jobs |
| audit | audit_log, dashboard_prefs |

## Key constraints

- `users.email` unique (global); a user joins workspaces through `memberships` (unique `workspace_id, user_id`) which carry `role_id`, `availability`, `telegram_chat_id`, notify prefs.
- `roles.base_level` is owner | admin | user; permissions live in `role_permissions` as text keys (see `docs/api.md`), not tied to role names.
- `sessions.token_hash` unique (raw token only in the cookie).
- `contacts`: unique `(workspace_id, phone)` where phone is not null (E.164); `opted_out` + `opt_out_reason`; `custom` jsonb.
- `opportunities.custom` jsonb keyed by `custom_fields.id`; `stage_required_fields` drives F2.4.
- `activities`: exactly one of contact/opportunity/lead is normally set; `actor_id` null = system.
- `conversations`: unique `(workspace_id, contact_id, channel)`. `messages.provider_sid` unique (I1.8); `retry_of` self-FK.
- `payments.provider_session_id` unique (I2.4); statuses requested | paid | expired | failed | refunded | partially_refunded; collected = paid amount minus `refunded_cents`.
- `integration_events`: unique `(provider, workspace_id, external_id)` for inbound rows, used for webhook dedupe.
- `integration_connections` unique `(workspace_id, provider)`; `encrypted_config` is an AES-GCM envelope, never sent to clients; only `secret_last4` is displayable.
- `user_connections` unique `(user_id, provider)`; `needs_reconnect` set when a Google refresh fails.
- `outbox_jobs`: partial index on `run_at` where status = pending; `locked_at` for claim-by-lock; `attempts`/`max_attempts` for retry.
- `audit_log`: BEFORE UPDATE/DELETE row trigger and BEFORE TRUNCATE trigger raise `audit_log is append-only` (migration `0001`).

## Lead fields vs `leads/domain/types.ts`

| Domain `Lead` | Column |
|---|---|
| state | leads.status (unassigned, assigned, acknowledged, closed) |
| ownerId | leads.owner_id (single owner column, F3.8) |
| version | leads.version |
| createdAt | leads.created_at |
| firstAssignedAt | leads.first_assigned_at |
| assignedAt | leads.assigned_at |
| firstAcknowledgedAt | leads.first_ack_at |
| ackDeadline | leads.ack_deadline |
| lastActionAt | leads.last_action_at |
| escalationLevel / escalationCount | leads.escalation_level / escalation_count |
| ownerHistory | owner of each `lead_assignments` row for the lead (ordered by assigned_at) |
| ownerAway | leads.owner_away |
| AssignmentReason | lead_assignments.reason (initial, ack_expired, manual, owner_unavailable) |
| AssignmentRules.* | assignment_rules.ack_window_seconds, max_open_leads, idle_seconds |
| EscalationLevel | assignment_rules.escalation_levels[i] = `{kind, user_id?, seconds}`; domain `level` = index + 1, `userIds` = `[user_id]` |
| round-robin cursor | assignment_rules.rr_cursor (user id of last assignee) |

`lead_assignments` has a partial unique index allowing one open row (`ended_at IS NULL`) per lead, a second guard for F3.8.

## Commands

`npm run generate` (new migration from schema changes), `npm run migrate` (uses `DATABASE_URL_DIRECT`), then commit both the schema and the generated SQL.
