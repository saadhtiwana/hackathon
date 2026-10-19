<p align="center">
  <img src="frontend/public/brand/relay-mark.png" alt="Relay" width="88" height="88" />
</p>

<h1 align="center">Relay</h1>

<p align="center">
  <strong>Every lead has exactly one owner.</strong><br />
  A multi-tenant CRM that gives each inbound lead one accountable person, a visible acknowledgement countdown and automatic escalation, with real email, payments and calendar on one customer record.
</p>

<p align="center">
  <a href="https://relay-nascon.vercel.app">Live app</a> ·
  <a href="docs/self-check.md">Judge guide</a> ·
  <a href="docs/api.md">API</a> ·
  <a href="docs/requirements.md">Requirements</a> ·
  <a href="docs/lead-engine.md">Lead engine</a>
</p>

---

## Try it in two minutes

| | |
|---|---|
| **Live app** | https://relay-nascon.vercel.app |
| **API** | https://relay-api-s6yw.onrender.com (`/health`) |
| **Test steps** | [docs/self-check.md](docs/self-check.md) |
| **Public enquiry form** | https://relay-nascon.vercel.app/f/margalla-estates |
| **Customer email address** | `customer@example.com` |
| **Stripe test card** | `4242 4242 4242 4242`, any future date, any CVC |

### Demo logins

Demo access on request: abdullahisdev@gmail.com.


Email the customer address and watch a lead appear with an owner and a countdown. Leave it unacknowledged and it moves to the next person, then a backup, then a manager, and stops there.

## The problem

Small service companies lose revenue when an inbound lead lands on someone who is away, busy or distracted, and nobody notices. Relay makes that impossible:

1. **One owner at any moment.** Enforced by a single owner column, a row lock and a version check, so two people can never hold a lead and two timers can never escalate it twice.
2. **A countdown everyone can see.** The owner is emailed and sees the time left on screen.
3. **Automatic hand-off.** Next eligible person, then a designated backup, then a manager, each with its own configurable time. The chain stops at the last level and the lead never goes ownerless.
4. **Absence is handled.** Setting someone On leave or Offline reassigns their unacknowledged leads immediately.

## What is in the box

| Area | What it does |
|---|---|
| **Lead engine** | Round-robin among Available people under a per-person cap, configurable windows and levels, recovery queue with readable reasons, full custody history |
| **CRM** | Contacts, companies, opportunities, tags, custom fields per pipeline, stage-required fields, saved lists with live results, activity timeline on every record |
| **Messaging** | Customer email in, replies out in the same thread, queued / sent / failed with retry, STOP opt-out, duplicates ignored, signed inbound webhook |
| **Payments** | Stripe Checkout links created from a contact, signed webhooks, paid / expired / failed / refunded tracked, collected kept apart from projected |
| **Calendar** | Per-person Google Calendar over OAuth, busy times, clash warnings, customer invited, reschedule and cancel |
| **Alerts** | Escalation and assignment emails with a deep link that survives sign-in, plus an in-app bell |
| **Security** | Argon2id passwords, DB-backed sessions, server-side permission checks, workspace isolation, field-level masking of deal values |
| **Audit** | Who, what, when, before and after. The database itself rejects edits and deletes |
| **Dashboard** | Live figures that open the exact records they counted, company view for managers, personal view for users |
| **Onboarding** | A guided Get started checklist that ticks itself off from real data |

## Architecture

```
            Browser (Next.js on Vercel)
                     |  /api rewrite, cookie session
                     v
   +-------------------------------------------+
   |  Express API on Render (TypeScript)       |
   |                                           |
   |  modules/  auth . crm . leads . payments  |
   |            conversations . appointments   |
   |            integrations . dashboard . ... |
   |  core/     rbac . audit . activity .      |
   |            outbox . scheduler . realtime  |
   +-----+------------------+-----------------++
         |                  |                 |
         v                  v                 v
   Neon Postgres      Provider adapters   Server-sent events
   (Drizzle)          Stripe . Gmail .    (live updates)
                      Google Calendar
```

- **Separation of concerns (Q14).** Each module has `routes` (HTTP and validation), `service` (business rules) and `repo` (queries). The lead rules are pure functions in `modules/leads/domain` with no database or HTTP, so they are unit tested in isolation.
- **Providers behind adapters.** Messaging, payments and calendar sit behind one adapter interface (`connect`, `test`, `disconnect`, `describeLimits`). Swapping a provider is configuration, not a rewrite.
- **Durable work.** Emails and retries go through a database outbox with backoff. Escalation timers live on the lead rows and are swept on boot and every minute, so restarts lose nothing.
- **Multi-tenant by construction.** Every workspace-owned table carries `workspace_id`; every query filters by the session's workspace, so another workspace's id is a plain 404.

### Why escalation is safe (F3.8, Q5)

```
BEGIN
  SELECT ... FROM leads WHERE id = $1 FOR UPDATE        -- row lock
  check lead.state = 'assigned' and lead.version = timer.version
  UPDATE leads SET owner = $next, version = version + 1 WHERE id = $1 AND version = $v
  insert assignment, audit, activity, outbox(notify.escalation)
COMMIT
```

A second timer for the same lead sees a newer version and does nothing. The full state machine is in [docs/lead-engine.md](docs/lead-engine.md).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, TanStack Query |
| Backend | Node 20+, Express, TypeScript (NodeNext, strict), Zod |
| Data | PostgreSQL on Neon, Drizzle ORM and migrations |
| Auth | Argon2id, server-side sessions, HttpOnly cookie, Origin checks |
| Integrations | Stripe (test mode), Gmail and Google Calendar over OAuth 2.0 |
| Tests | Vitest and Supertest |
| Hosting | Vercel (web), Render free tier (API), Neon (database) |

## Run it locally

Requirements: Node 20+, npm, a Postgres database (a free Neon branch works).

```bash
git clone https://github.com/saadhtiwana/hackathon.git
cd hackathon/backend
npm ci
cp .env.example .env        # Windows: copy .env.example .env
```

Fill `backend/.env`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Postgres URL for the app |
| `DATABASE_URL_DIRECT` | Direct URL used by migrations |
| `SESSION_SECRET` | 32+ random characters |
| `ENCRYPTION_KEY` | 32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `APP_URL`, `ALLOWED_ORIGINS` | Web origin(s) allowed to call the API |
| `PUBLIC_API_URL` | Public API URL, used for webhook addresses |
| `TICK_KEY` | Key for the external cron that calls `/internal/tick` |
| `SEED_PASSWORD` | Password given to the demo users |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth client (calendar and mailbox) |

```bash
npm run migrate     # create the schema
npm run seed        # demo workspaces and users
npm run dev         # API on :3000
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Provider keys (Stripe, Google) are entered in the app under Settings, Integrations and stored encrypted per workspace. Never commit `.env` files.

### Scripts

| Command (in `backend/`) | Does |
|---|---|
| `npm test` | Unit and API tests (the API tests use the configured database) |
| `npm run typecheck` / `npm run build` | Type check and compile |
| `npm run generate` | New migration from schema changes |
| `npm run connect:stripe` | Connects Stripe to the demo workspace from `.secrets/keys.env` |
| `npm run test:email-webhook` | Sends valid, forged, duplicate and stale signed requests to the email webhook |

From the repo root, `npm run deploy:web` builds and deploys the frontend to Vercel from your machine.

## Testing

- **Pure lead rules:** 70 tests on assignment, escalation, recovery reasons, availability and metrics, including 30-second windows and "the same timer twice produces one step".
- **API tests:** workspace isolation (404), missing permission (403), masked values, role hierarchy, login lockout, optimistic concurrency (409), required stage fields (422), and the audit trigger rejecting UPDATE and DELETE.
- **Live checks:** payments (paid, refund, expiry, forged and replayed webhooks), email in and out, calendar booking and clashes, escalation emails. Results and steps are in [docs/self-check.md](docs/self-check.md).

## Security notes

- Passwords are salted Argon2id hashes; sessions are revocable and expire after 7 days; repeated bad logins lock out per IP and email.
- Every endpoint checks the caller's workspace and permission on the server. Hiding a button is never the only protection.
- State-changing requests must come from an allowed Origin; webhooks verify provider signatures (Stripe) or an HMAC with a timestamp window (email) before any record changes, and are deduplicated by event id.
- Provider secrets are AES-256-GCM encrypted per workspace and never returned to the browser, only a masked last four.
- Deal values are stripped on the server for people without the permission, in lists, detail pages, exports and the dashboard.

## Repository map

```
backend/
  src/core/          shared: rbac, audit, activity, outbox, scheduler, realtime, crypto
  src/modules/       auth, crm, leads (+ pure domain/), payments, conversations,
                     appointments, integrations, dashboard, audit, savedlists, users, roles
  drizzle/           SQL migrations (append-only audit trigger included)
frontend/
  src/app/           routes: homepage, auth, desk (app), public form, payment receipt
  src/features/      one folder per feature (leads, inbox, pipeline, payments, ...)
  src/components/    design system and shell
docs/                api, schema, modules, lead engine, requirements, judge guide
```

## Known limitations

Gmail is polled every 30 seconds with no delivered or read receipts, and Twilio and Telegram are not usable from Pakistan (Twilio blocks signups with error 0x07), which is why messaging uses Gmail behind an adapter. The Google app runs in Testing mode, so only listed test users can connect. Stripe is test mode only.

## Team

Built at NASCON by
[@saadhtiwana](https://github.com/saadhtiwana) (platform, security, integrations),
[@abdullahxdev](https://github.com/abdullahxdev) (lead engine, dashboard, operations screens) and
[@ahmadmustafa02](https://github.com/ahmadmustafa02) (CRM screens, customization, design system).
