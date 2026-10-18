
# Unified Business Management Platform: Problem Statement


## 1. Background and Problem

Small and growing service businesses lose revenue because inbound leads are answered late or never. A lead arrives by web form, chat or phone; the employee it was meant for is absent, busy or missed the notification; nobody notices; the customer goes to a competitor. The company cannot even see how often this happens, because customer data, conversations, payments, appointments and employee activity are scattered across separate tools that do not share records.

The problem to solve is to build one connected web platform where a company manages its customers and sales pipeline, guarantees that every incoming lead is acted on, and talks to customers, collects payments and schedules appointments through real external services, with every action traceable.

What goes wrong today

- Leads are assigned informally, so ownership is unclear and responsibility is easy to dodge.
- Absence, leave and overload are not considered when leads are distributed.
- No one is alerted when a lead has been waiting too long, and no one can later prove who was responsible.
- The CRM forces every company into one fixed structure of fields and stages, so teams keep side spreadsheets.
- Customer conversations, payments and appointments live in other apps, so staff switch between tools and the customer record is incomplete.
- Managers cannot see the true state of the pipeline, the response times or the missed opportunities in one place.
What a successful solution achieves

- Every incoming lead has exactly one accountable owner at any moment, and escalates automatically if ignored.
- Each company can shape its own pipeline, fields and rules without developer help.
- Real messages, real payment events and real calendar events appear on the right customer record, with nothing silently lost when an external service fails.
- Access to information depends on the person's role and permissions, enforced on the server.
- Management sees current performance and the history of every important action.

## 2. Target Users

The platform serves a sales-driven service company with 5 to 30 employees, such as a real estate agency, a solar installer or a clinic's patient-acquisition team. Several companies use the same platform, and each must be completely separate from the others.

| User | Situation | What they need |
|---|---|---|
| Owner | Runs the company and pays for the platform | Control over the workspace, roles and settings; confidence that no lead is wasted; a clear view of revenue and performance |
| Admin | Delegated by the Owner to configure the system | Ability to customize pipelines, fields, assignment rules and integrations without code |
| Manager | Supervises a sales or support team | Visibility of who is available, which leads are overdue, and the power to reassign |
| Sales or support employee (User) | Handles leads and customer conversations daily | One place to see assigned leads, reply to customers, record notes, and get paid or book appointments |
| Customer (external) | Contacts the company and expects a prompt reply | A fast response on the channel they used, a clear payment link and a confirmed appointment |

Owner, Admin and User are the three base levels. A manager is a configurable role built from permissions, not a fourth hard-coded level.


## 3. Scope

The full long-term vision covers about fifteen business modules. This problem statement defines the part that must be solved now: protecting leads, a customizable CRM, and real connections to external services.

| Must be solved | Not part of this problem |
|---|---|
| Accounts, workspaces, roles and configurable permissions | Full accounting: ledgers, reconciliation, financial statements |
| Customizable CRM: contacts, companies, opportunities, custom fields, one customizable pipeline | Payroll, shift scheduling and legal leave or break rules |
| Lead capture, assignment, acknowledgement, escalation and recovery | Advertising-platform analytics and campaign attribution |
| Audit history of important actions | Full report builder and business intelligence |
| Operational dashboard on live data | Training and onboarding modules, AI role-play |
| Real third-party integrations for messaging, payments and calendar, plus one more of the team's choice | Public marketing website, billing for the platform itself |


## 4. Functional Requirements

Each requirement states what must be true in the running application, using real stored data. Timers and thresholds must be configurable so they can be observed in seconds during a demonstration.


### F1. Accounts, roles and permissions

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F1.1 | Sign up, log in, log out and persistent sessions | Signing up creates a new company workspace and makes the first user its Owner; refreshing the page keeps the user logged in |
| F1.2 | Three base levels: Owner, Admin, User | The Owner can invite users and assign levels; an Admin cannot modify the Owner; a User sees only what their permissions allow |
| F1.3 | Configurable permissions, not tied to role names | The Owner can grant or remove at least: view, create, edit, delete and export for CRM records, manage assignment rules, manage integrations, and view the audit log |
| F1.4 | Field-level protection | Opportunity value is hidden or masked for users without the matching permission in lists, detail pages and exports |
| F1.5 | Server-side enforcement | A direct API call by an unauthorized user is rejected; hiding a button is not sufficient |
| F1.6 | Workspace isolation | A user of one workspace can never read or change data of another workspace, including through guessed identifiers |


### F2. Customizable CRM

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F2.1 | Contacts, companies and opportunities with relationships | A contact belongs to a company and can have many opportunities; the contact page shows all related records |
| F2.2 | Custom fields created from the interface | An Admin adds a field with a name and a type (text, number, date, dropdown, checkbox) without code; it appears on forms and detail pages immediately |
| F2.3 | Different fields for different pipelines | Two pipelines show different custom field sets while sharing the same contact information |
| F2.4 | Stage-specific required fields | Moving an opportunity into a configured stage is blocked, with a clear message, until its required fields are filled |
| F2.5 | Customizable pipeline | An Admin can add, rename, reorder and delete stages; deleting a stage that contains opportunities is handled safely; opportunities can be moved between stages on a board or list |
| F2.6 | Filtering and saved lists | A user combines at least three criteria (field, tag, stage, owner, date), saves the result as a list, and the list updates automatically as records start or stop matching |
| F2.7 | Activity history | Each contact and opportunity shows a time-ordered log of notes, stage changes, assignments, field edits, messages, payments and appointments, with who and when |
| F2.8 | Complete customer view | One contact page shows conversations, opportunities, payments, appointments, the assigned employee and the activity history |


### F3. Lead capture, assignment, acknowledgement and escalation

This is the central business problem. A lead must never be left without an accountable person.

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F3.1 | Lead capture from multiple sources | Leads are created from a public web form, from an incoming message on the messaging integration (Section 5, I1) and from a manual entry, each with a source label |
| F3.2 | Employee availability | Each employee has a status (Available, Busy, On leave, Offline) that they or an Admin can set |
| F3.3 | Configurable assignment rules | An Admin configures at least round-robin distribution among Available employees and a maximum number of open leads per employee; employees who are not Available never receive leads |
| F3.4 | Acknowledgement window | The assignee receives a notification and must acknowledge or act within a configurable time; the remaining time is visible |
| F3.5 | Escalation chain | When the window expires, the lead moves to the next eligible employee, then to a designated backup, then to a manager; the number of levels and the time allowed per level are configurable |
| F3.6 | Reassignment on absence | Setting an employee to On leave or Offline immediately reassigns their unacknowledged leads; the treatment of already acknowledged leads is defined and visible to users |
| F3.7 | Recovery queue | One page lists leads that are unacknowledged beyond their window, escalated more than once, or untouched for a configurable period, with the reason shown for each |
| F3.8 | No duplicate action | A lead is never owned by two people at once, and two timers expiring close together do not escalate the same lead twice |
| F3.9 | External notification of escalations | When a lead escalates, the new owner is also alerted outside the application through the integration chosen in Section 5, I4 |


### F4. Audit history

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F4.1 | Record of important actions | Assignment, acknowledgement, escalation, reassignment, role or permission changes, field or pipeline configuration changes, integration connection changes and deletions are recorded with actor (or system), time, target and before and after values where relevant |
| F4.2 | Restricted visibility | Only users with the audit permission can open the history, and it can be filtered by event type, user and date |
| F4.3 | Tamper resistance | No screen or endpoint allows editing or deleting history entries |


### F5. Operational dashboard

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F5.1 | Live overview | The dashboard shows at least: new leads today, open pipeline value by stage, average time to first response, items in the recovery queue, escalations in the last 24 hours, employee availability, upcoming appointments and payments received this month |
| F5.2 | Consistent definitions | Every figure follows the definitions in Section 7 and matches the underlying records when opened |
| F5.3 | Drill-down | Clicking at least three figures opens the filtered list of records the user is allowed to see |
| F5.4 | Role-aware view | A User sees personal figures (own leads, own response time); Owner and Admin see company-wide figures |
| F5.5 | Basic customization | A user can show or hide figures and the choice is remembered |


## 5. Mandatory Third-Party Integrations

A business platform is only useful if it works with the services a company already uses. The solution must connect to real external services in their sandbox or test modes, not to fake or hard-coded stand-ins. Three integrations are mandatory (I1 to I3), and a team must choose one more (I4). Each external service has its own authentication scheme, event format, failure behavior and limits, and the solution must handle them correctly.

| ID | Integration | Provider (sandbox or test mode) | Business purpose |
|---|---|---|---|
| I1 | Messaging | Twilio WhatsApp Sandbox (Twilio SMS is an accepted alternative) | Talk to customers and capture leads from incoming messages |
| I2 | Payments | Stripe in test mode | Collect payments for opportunities and see their status on the customer record |
| I3 | Calendar | Google Calendar through OAuth 2.0 | Book appointments with customers on employees' real calendars |
| I4 | Notifications (choose one) | Slack, Telegram bot, or transactional email (for example Resend, SendGrid or Mailgun) | Alert employees outside the application when a lead escalates |


### I1. Messaging

| ID | Requirement | Acceptance criteria |
|---|---|---|
| I1.1 | Receive messages | A message sent from a real phone to the sandbox number reaches the platform through the provider's webhook and appears in a conversation view |
| I1.2 | Request authenticity | Webhook requests are verified with the provider's signature mechanism; a forged or altered request is rejected and recorded |
| I1.3 | Send messages | An employee replies from the platform and the customer receives it on their phone |
| I1.4 | Delivery status | Sent, delivered and failed states from the provider's status callbacks are stored and shown on each message |
| I1.5 | Contact matching | An incoming message from a known number attaches to the existing contact; from an unknown number it creates a contact and a lead (F3.1) |
| I1.6 | Ownership | Each conversation shows its assigned employee and is visible only to users permitted to see it |
| I1.7 | Failure handling | If the provider rejects a send or is unreachable, the message stays visible as failed with the reason, and the employee can retry; nothing is silently dropped |
| I1.8 | Duplicates | A webhook delivered twice by the provider does not create two messages or two leads |
| I1.9 | Opt-out | A contact marked as opted out cannot be messaged, and the interface explains why |


### I2. Payments

| ID | Requirement | Acceptance criteria |
|---|---|---|
| I2.1 | Create a payment request | From an opportunity, an employee creates a payment link or checkout session for a stated amount and currency, and can send it to the customer |
| I2.2 | Payment confirmation by webhook | Completing a test payment updates the opportunity's payment status in the platform without any manual refresh or action, driven by the provider's webhook |
| I2.3 | Request authenticity | Payment webhooks are verified with the provider's signature mechanism before any record changes |
| I2.4 | Idempotent processing | The same event received more than once records the payment once |
| I2.5 | Other outcomes | Expired, abandoned and failed payments are shown with the correct status; a refund made in the provider's dashboard is reflected in the platform |
| I2.6 | Collected versus expected | The platform distinguishes collected revenue from projected or unpaid amounts, and the dashboard (F5.1) uses collected revenue only for payments received |
| I2.7 | Traceability | Each payment shows the opportunity, contact, employee who requested it and the provider's reference |
| I2.8 | No card data stored | The platform never stores or logs card numbers; payment details are entered only on the provider's hosted page |


### I3. Calendar

| ID | Requirement | Acceptance criteria |
|---|---|---|
| I3.1 | Connect with consent | An employee connects their own Google account through the OAuth 2.0 consent flow, and can disconnect it |
| I3.2 | Token handling | Access tokens are refreshed automatically; tokens are stored only on the server; a revoked or expired connection is detected and shown as needing reconnection |
| I3.3 | Create appointments | From an opportunity or contact, an employee books an appointment that appears in the employee's real Google Calendar and on the customer record |
| I3.4 | Avoid conflicts | The booking screen reads the employee's busy times and prevents or warns about overlaps |
| I3.5 | Time zones | Appointment times display correctly for the employee and are stored unambiguously, including across different time zones |
| I3.6 | Change and cancel | Rescheduling or cancelling in the platform updates the Google event, and the change is recorded in the activity history |
| I3.7 | Availability link | Calendar connection status is visible to Admins; an employee without a connected calendar cannot be booked and sees why |


### I4. Notifications (choose one provider)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| I4.1 | Real delivery | When a lead escalates (F3.5), the new owner receives a message on the chosen channel within the same minute |
| I4.2 | Useful content | The alert names the lead, the source, the reason for escalation and a link that opens the lead |
| I4.3 | Per-user routing | Each employee can configure their own destination (Slack user, Telegram chat or email address) |
| I4.4 | Failure handling | A failed alert is recorded, retried a limited number of times and visible to Admins |


### I5. Requirements shared by every integration

| ID | Requirement | Acceptance criteria |
|---|---|---|
| I5.1 | Central integrations page | One page lists each integration with its status (not connected, connected, error), when it last worked and its recent errors |
| I5.2 | Per-workspace configuration | Each workspace supplies its own credentials or connection; one workspace's connection is never used by another |
| I5.3 | Secret handling | API keys, tokens and signing secrets are never sent to the browser, never committed to the repository and never shown in full in the interface |
| I5.4 | Synchronization history | Every inbound event and outbound call is recorded with time, result and a reference, and can be reviewed by authorized users |
| I5.5 | Resilience | Temporary provider errors are retried with a delay; permanent errors are shown to a user with a plain explanation |
| I5.6 | Clearly stated limits | The interface states what each integration can and cannot do (for example, that the messaging sandbox only reaches phones that have joined it) |
| I5.7 | Permission and audit | Only users with the integration permission can connect, change or remove an integration, and each change is recorded in the audit history (F4.1) |
| I5.8 | Isolation of failures | If one provider is unavailable, the rest of the platform keeps working |


### Provider constraints to plan for

These are the practical conditions of the chosen providers. Confirm them against each provider's current documentation, since they can change.

| Provider | What is needed | What to expect |
|---|---|---|
| Twilio WhatsApp Sandbox | A Twilio account and the sandbox number | A phone must first join the sandbox by sending the join phrase; sandbox messages are for testing only |
| Stripe test mode | A Stripe account in test mode, no business verification | Payments use published test card numbers; webhook secrets are issued per endpoint |
| Google Calendar | A Google Cloud project, enabled Calendar API and an OAuth consent screen | An app in testing status accepts only listed test users and may issue short-lived refresh tokens |
| Slack, Telegram or email provider | A free account or bot with its own token | Each has its own message format, rate limits and error codes |
| All webhooks | A publicly reachable HTTPS address | A local development setup needs a tunnel or a deployed address for providers to reach it |


## 6. Quality Requirements

These requirements apply to everything in Sections 4 and 5. They describe how well the platform must behave, and they are where core web development skill shows.

| ID | Area | Requirement |
|---|---|---|
| Q1 | Authentication security | Passwords are stored only as salted hashes from a recognized algorithm; sessions or tokens expire and can be ended; login is protected against repeated guessing |
| Q2 | Authorization | Every endpoint checks the caller's workspace and permission on the server; identifiers in URLs cannot be used to reach other users' or other workspaces' data |
| Q3 | Input safety | All input is validated on the server; the application is protected against injection, cross-site scripting and cross-site request forgery; uploaded or imported content is never trusted |
| Q4 | Data integrity | Related records stay consistent: deleting or changing a stage, field, user or contact never leaves orphaned or contradictory data; concurrent edits do not silently overwrite each other |
| Q5 | Concurrency and timing | Assignment, escalation and webhook handling stay correct when events arrive at the same time or more than once, and when the server restarts while timers are running |
| Q6 | Persistence | All data lives in a real database and survives restart; configuration made through the interface is stored per workspace |
| Q7 | Responsive interface | Every screen is usable on a phone, a tablet and a laptop without horizontal scrolling or hidden controls |
| Q8 | Accessibility | Interactive elements can be used with a keyboard, forms have labels, color is not the only carrier of meaning, and contrast is readable |
| Q9 | Performance | Lists with several hundred records load with pagination or equivalent, search and filters respond without freezing the interface, and slow operations show progress while the user keeps working |
| Q10 | Feedback and errors | Every action shows loading, success and failure states; error messages say what went wrong and what the user can do |
| Q11 | Real-time awareness | New leads, escalations and incoming messages appear without a manual page refresh |
| Q12 | Consistent data | The same figure shows the same value on every screen, because all screens read the same records and definitions |
| Q13 | Configuration and secrets | Settings and secrets are kept outside the source code; a new person can start the application from written instructions and sample data |
| Q14 | Maintainable structure | The code separates business rules, data access, integrations and presentation so that a provider or rule can change without rewriting the application |


## 7. Glossary and Metric Definitions

Each term below has one meaning everywhere in the platform: on the dashboard, in lists, in exports and in the audit history.

| Term | Definition |
|---|---|
| Workspace | One company's isolated environment, with its own users, data, configuration and integrations |
| Lead | A record created by intake (web form, incoming message or manual entry) with a source label |
| Assigned time | The moment the system last assigned the lead to a person |
| Acknowledged | The assignee clicked Acknowledge, or performed a recorded action on the lead (note, message, call log, stage change, appointment) |
| Time to first response | Time from the lead's first assignment to its first acknowledgement |
| Escalation | An automatic reassignment caused by an expired acknowledgement window; manual reassignments are counted separately |
| Recovery queue item | A lead that is unacknowledged beyond its window, has escalated two or more times, or has no recorded action for the configured idle period |
| Available employee | A user whose status is Available and whose open-lead count is below the configured limit |
| Open pipeline value | The sum of values of opportunities not in a won or lost stage, grouped by stage; shown only to users permitted to see values |
| Projected revenue | The value of open opportunities and of payment requests not yet paid |
| Collected revenue | The sum of payments confirmed by the payment provider's webhook, minus confirmed refunds |
| Conversation | All messages with one contact on one channel, linked to the contact, its assigned employee and, when applicable, an opportunity |
| Appointment | A calendar event created from the platform and linked to a contact or opportunity |
| Integration event | Any inbound webhook or outbound call to an external provider, recorded in the synchronization history |

