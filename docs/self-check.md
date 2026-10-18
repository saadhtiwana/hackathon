# Self-check for judges

Every item below was checked on the live app. "works" means exercised on the live site; "partial" says what is missing.

## Start here

| What | Value |
|---|---|
| Live app | https://relay-nascon.vercel.app |
| API | https://relay-api-s6yw.onrender.com (health: /health) |
| Owner | saadhayat799@gmail.com |
| Admin | abdullahisdev@gmail.com |
| User (values hidden) | ahmadmustafabutt.dev@gmail.com |
| Other workspace (isolation) | sana@kohsarsolar.pk |
| Password for all four | g1Z752U5UWSN |
| Customer email address | ahmadmustafabutt.dev+margalla@gmail.com |
| Public enquiry form | https://relay-nascon.vercel.app/f/margalla-estates |
| Stripe test card | 4242 4242 4242 4242, any future date, any CVC |
| Repo | https://github.com/saadhtiwana/hackathon |

## 1. Roles, permissions, security

- **1a works.** Sign in as the Owner, open Settings, Team and roles. Invite someone (an email goes out and the link also shows on screen), change a member's role, open a custom role and tick or untick permissions. Each change is in Settings, Audit log.
- **1b works.** Sign in as the User (ahmadmustafabutt.dev@gmail.com): Pipeline, Contacts, opportunity pages, Dashboard and the CSV export show no values. The API agrees: `GET /api/opportunities` has no valueCents for this login.
- **1c works.** As the User, `DELETE /api/contacts/<id>` returns 403. Using a Kohsar Solar contact id while signed in to Margalla returns 404.

## 2. Customizable CRM

- **2a works.** Settings, Fields: add text, number, date, dropdown and checkbox fields; they appear on the contact and opportunity forms.
- **2b works.** Settings, Pipelines: Residential Sales and Rentals have different fields; stages can be added, renamed, reordered and deleted (deleting a stage with opportunities asks for a destination stage).
- **2c works.** Move an opportunity into "Booking" in Residential Sales: the move is refused (422) naming the missing fields until they are filled.
- **2d partial.** Saved lists work in the API (`POST /api/saved-lists` with 3 or more criteria, `GET /api/saved-lists/<id>/results` re-evaluates live), but there is no screen for them yet. Each contact page shows its full timeline.

## 3. Lead assignment and escalation

- **3a works.** Web form: open the public form link and submit. Email: write to the customer address. Manual: Leads, New lead. Leads show the source labels Web form, Email and Manual; the Leads page has a Share enquiry form button.
- **3b works.** Only Available people get leads; the lead page shows the countdown.
- **3c works.** Settings, Assignment rules: ack 30 s, then next eligible, backup Abdullah, manager Saad (30 s each). An unacknowledged lead moves once per level and stops at the last level, staying with the manager; no further emails or counts.
- **3d works.** Set a person On leave or Offline from the avatar menu: their unacknowledged leads move at once. The Recovery queue gives each reason in words.

## 4. Audit log and dashboard

- **4a works.** Settings, Audit log (Owner or anyone with the audit permission) lists who, when, before and after. There is no edit or delete endpoint, and the database refuses UPDATE and DELETE on it.
- **4b works.** Dashboard figures match their drill-down lists; the Owner sees the company, the User sees only their own figures.

## 5. Messaging (Gmail)

- **5 partial.** Real email arrives (poll every 30 s), replies leave in the same thread with status queued, sent or failed and a Retry button; the same Gmail message id never creates two messages. Gmail has no inbound webhook, so this channel is polled; a signed inbound webhook endpoint for it is not built.

## 6. Payments (Stripe test mode)

- **6 works.** Contact or lead page, Request payment, Create & email link. Pay with the test card: the record turns Paid by webhook, with no refresh. Refunds and expiry show too. A forged webhook returns 400 and appears in Integrations, Stripe sync history as "Rejected (invalid signature)"; a replayed real event is recorded once.

## 7. Calendar (Google)

- **7 partial.** Google sign-in, real calendar events, clash detection (409 with Book anyway), reschedule and cancel all work, with an invite sent to the customer. A revoked Google grant is detected in code and shown as "Needs reconnect", but revoking was not exercised on the live site.

## 8. Notifications

- **8 works.** An escalation sends a real HTML email with an Open lead button. The link survives sign-in: you land on the lead after logging in. The in-app bell is not wired to alerts.
- **8b partial.** Secrets are stored encrypted and never returned to the browser (only a masked last four). A bad Stripe key only affects the Stripe card (provider calls are isolated), but this was not exercised on the live site.

## 9. Quality

- **9a partial.** Screens are built mobile first with a drawer menu and keyboard focus styles; a full 360 px sweep was not completed.
- **9b works.** Actions show loading, success toasts and plain error messages.
