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

- **1a works.** Sign in as the Owner, Settings, Team and roles. Invite someone (an email goes out; pending invites have Resend and Revoke, and the link is copied as a fallback), change a member's role, open a custom role and tick or untick permissions. Every change appears in Settings, Audit log.
- **1b works.** Sign in as the User (ahmadmustafabutt.dev@gmail.com, role User): Pipeline, Contacts, opportunity pages, Dashboard and the CSV export (403) show no values, and `GET /api/opportunities` has no valueCents. Audit log and settings return 403 and the dashboard shows personal figures.
- **1c works.** As the User, `DELETE /api/contacts/<id>` returns 403. Using a Kohsar Solar contact id while signed in to Margalla returns 404.

## 2. Customizable CRM

- **2a works.** Settings, Fields: add text, number, date, dropdown and checkbox fields; they appear on the contact and opportunity forms.
- **2b works.** Settings, Pipelines: Residential Sales and Rentals have different fields; stages can be added, renamed, reordered and deleted (deleting a stage with opportunities asks for a destination stage).
- **2c works.** Move an opportunity into "Booking" in Residential Sales: the move is refused (422) naming the missing fields until they are filled.
- **2d works.** Saved lists: sidebar, Saved lists. Pick Contacts or Opportunities, add 3 or more filters (owner, tag, company, created date, custom fields), see the live count, press Save as list. Opening a list shows the matching records and refreshes by itself (every 15 s and on live events); Rename and Delete are on the list page. Each contact page shows its full timeline.

## 3. Lead assignment and escalation

- **3a works.** Web form: open the public form link and submit. Email: write to the customer address. Manual: Leads, New lead. Leads show the source labels Web form, Email and Manual; the Leads page has a Share enquiry form button.
- **3b works.** Only Available people get leads; the lead page shows the countdown.
- **3c works.** Settings, Assignment rules: ack 30 s, then next eligible, backup Abdullah, manager Saad (30 s each). An unacknowledged lead moves once per level and stops at the last level, staying with the manager; no further emails or counts.
- **3d works.** Set a person On leave or Offline from the avatar menu: their unacknowledged leads move at once. The Recovery queue gives each reason in words.

## 4. Audit log and dashboard

- **4a works.** Settings, Audit log (Owner or anyone with the audit permission) lists who, when, before and after. There is no edit or delete endpoint, and the database refuses UPDATE and DELETE on it.
- **4b works.** Dashboard figures match their drill-down lists; the Owner sees the company, the User sees only their own figures.

## 5. Messaging (Gmail)

- **5 works.** Real email arrives (polled every 30 s), replies leave in the same thread with status queued, sent or failed and a Retry button; the same Gmail message id never creates two messages. Gmail has no inbound webhook, so the channel is polled; a signed inbound webhook also exists: `POST /webhooks/email/<workspace id>` (HMAC-SHA256, timestamp within 5 minutes). Run `npm run test:email-webhook` in `backend`: valid request 200, same id again "duplicate", forged signature 401 and stale timestamp 401 (both recorded as rejected in Integrations, sync history).

## 6. Payments (Stripe test mode)

- **6 works.** Contact or lead page, Request payment, Create & email link. Pay with the test card: the record turns Paid by webhook, with no refresh. Refunds and expiry show too. A forged webhook returns 400 and appears in Integrations, Stripe sync history as "Rejected (invalid signature)"; a replayed real event is recorded once.

## 7. Calendar (Google)

- **7 partial.** Google sign-in, real calendar events, clash detection (409 with Book anyway), reschedule and cancel all work, with an invite sent to the customer. A revoked Google grant is detected in code and shown as "Needs reconnect" (booking that person is blocked with the reason), but revoking at myaccount.google.com/permissions was not exercised on the live site.

## 8. Notifications

- **8 works.** An escalation sends a real HTML email with an Open lead button, and the link survives sign-in (you land on the lead after logging in). The header bell lists your notifications (assigned to you, escalated to you, customer replied, payment paid/failed/expired, appointment booked), shows an unread badge, updates live, opens the record on click and has Mark all read.
- **8b works.** Secrets are stored encrypted and never returned to the browser (only a masked last four). Isolation was tested on a throwaway workspace with an invalid Stripe key: only the Stripe card showed an error ("The provider rejected the credentials") while contacts, pipelines, opportunities, dashboard, conversations and payments all kept returning 200, and Margalla Estates was unaffected. The empty throwaway workspace remains because audit history cannot be deleted.

## 9. Quality

- **9a works.** A 360 px sweep of login, dashboard, leads, lead detail, inbox, pipeline, contacts, contact detail, appointments, payments, saved lists, team, integrations, audit and the 404 page found no horizontal scroll once the integrations cards were fixed. Drawer navigation and visible keyboard focus come from the shared design system; a full keyboard walkthrough of every dialog was not repeated.
- **9b works.** Actions show loading, success toasts and plain error messages.

## Known limitations (for the judging form)

| What does not fully work | What works instead |
|---|---|
| Twilio WhatsApp/SMS and Telegram cannot be used (Twilio blocks Pakistani signups with error 0x07, Telegram is blocked in Pakistan) | Messaging and alerts go through the agency Gmail account, behind a provider adapter so another provider can be plugged in by configuration |
| Gmail has no instant push and no delivered or read receipts | The inbox is polled every 30 s; messages show queued, sent or failed with a Retry button; a signed webhook (`POST /webhooks/email/<workspace id>`) accepts forwarded mail, rejects forgeries and replays |
| The Google app is in Testing mode: only listed test users can connect and refresh tokens may expire after 7 days | An expired or revoked grant shows as "Needs reconnect", booking that person is blocked with the reason, and reconnecting takes one click |
| Stripe is test mode only; the paid, failed and refund event mappings were exercised with a real test payment, refund and expiry, but not every failure card | The record updates by webhook with no refresh; forged webhooks get 400 and replays are counted once |
| Saved-list filters live on their own page (Saved lists), not inline on Contacts; wide tables scroll sideways inside their card on phones | Lists save, re-evaluate live and open from the sidebar; the page itself never scrolls sideways at 360 px |
| Revoking Google access was not exercised on the live site; test workspaces cannot be deleted because audit history is append-only | Revocation is detected in code; empty test workspaces are isolated and harmless |

Data survives a restart because everything is in Postgres: escalation timers are stored on the lead rows and swept on boot and every minute, and queued emails and retries are database-backed. A new person can start the app from the README (copy `.env.example`, `npm run migrate`, `npm run seed`, `npm run dev`).
