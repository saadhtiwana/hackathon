# Requirement Status

Checked against the running code and the live API. done = implemented and exercised; partial = what is missing is stated; nothing is marked done on trust.

| ID | Requirement | Owner | Status |
|---|---|---|---|
| F1.1 | Sign up, log in, log out and persistent sessions | Saad | done |
| F1.2 | Three base levels: Owner, Admin, User | Saad | done |
| F1.3 | Configurable permissions, not tied to role names | Saad | done |
| F1.4 | Field-level protection | Saad | done |
| F1.5 | Server-side enforcement | Saad | done |
| F1.6 | Workspace isolation | Saad | done |
| F2.1 | Contacts, companies and opportunities with relationships | Saad + Ahmad | done |
| F2.2 | Custom fields created from the interface | Ahmad | done |
| F2.3 | Different fields for different pipelines | Ahmad | done |
| F2.4 | Stage-specific required fields | Saad + Ahmad | done |
| F2.5 | Customizable pipeline | Ahmad | done |
| F2.6 | Filtering and saved lists | Saad | partial: saved-list API with live evaluation is done; the filter bar and list screens are not pushed yet (Saad) |
| F2.7 | Activity history | Saad + Ahmad | done |
| F2.8 | Complete customer view | Saad + Ahmad | done |
| F3.1 | Lead capture from multiple sources | Saad + Abdullah | done |
| F3.2 | Employee availability | Saad + Abdullah | done |
| F3.3 | Configurable assignment rules | Abdullah | done |
| F3.4 | Acknowledgement window | Abdullah | done |
| F3.5 | Escalation chain | Abdullah | done |
| F3.6 | Reassignment on absence | Abdullah | done |
| F3.7 | Recovery queue | Abdullah | done |
| F3.8 | No duplicate action | Abdullah | done |
| F3.9 | External notification of escalations | Saad + Abdullah | done |
| F4.1 | Record of important actions | Saad | done |
| F4.2 | Restricted visibility | Saad | partial: filtered, paginated read-only API is done; the audit screen is not pushed yet (Saad) |
| F4.3 | Tamper resistance | Saad | done |
| F5.1 | Live overview | Saad | partial: dashboard API with every figure is done; the dashboard screen is not pushed yet (Saad) |
| F5.2 | Consistent definitions | Saad | partial: figures and their drill-down records share one definition in the API; screen pending (Saad) |
| F5.3 | Drill-down | Saad | partial: records behind each figure are served by the API; screen pending (Saad) |
| F5.4 | Role-aware view | Saad | partial: role-aware scope is done in the API; screen pending (Saad) |
| F5.5 | Basic customization | Saad | partial: show/hide preferences are saved per user in the API; screen pending (Saad) |
| I1 | Messaging | Saad | done: messaging is email through the agency Gmail account |
| I2 | Payments | Saad | done: Stripe test mode |
| I3 | Calendar | Saad | done: Google Calendar |
| I4 | Notifications (choose one) | Saad | done: email alerts |
| I1.1 | Receive messages | Saad | done: customer email to the agency address becomes a conversation and a lead |
| I1.2 | Request authenticity | Saad | partial: email is pulled over Google's authenticated API, so there is no inbound webhook to forge; request signatures apply to the Stripe webhook only |
| I1.3 | Send messages | Saad | done |
| I1.4 | Delivery status | Saad | partial: sent and failed are tracked; Gmail gives no delivered or read receipts |
| I1.5 | Contact matching | Saad | done: matched by sender email address; unknown senders create a contact and a lead |
| I1.6 | Ownership | Saad | done |
| I1.7 | Failure handling | Saad | done |
| I1.8 | Duplicates | Saad | done |
| I1.9 | Opt-out | Saad | done: STOP opts out; sends to opted-out contacts are blocked with the reason |
| I2.1 | Create a payment request | Saad | done |
| I2.2 | Payment confirmation by webhook | Saad | partial: signed webhook verified live for session expiry; the paid mapping is code-reviewed but a real card payment was not run end to end |
| I2.3 | Request authenticity | Saad | done |
| I2.4 | Idempotent processing | Saad | done |
| I2.5 | Other outcomes | Saad | partial: expired verified live; failed and refund mappings are code-reviewed, not exercised live |
| I2.6 | Collected versus expected | Saad | done |
| I2.7 | Traceability | Saad | done |
| I2.8 | No card data stored | Saad | done |
| I3.1 | Connect with consent | Saad | done |
| I3.2 | Token handling | Saad | done |
| I3.3 | Create appointments | Saad | done |
| I3.4 | Avoid conflicts | Saad | done |
| I3.5 | Time zones | Saad | done |
| I3.6 | Change and cancel | Saad | done |
| I3.7 | Availability link | Saad | done |
| I4.1 | Real delivery | Saad | done |
| I4.2 | Useful content | Saad | done |
| I4.3 | Per-user routing | Saad | done |
| I4.4 | Failure handling | Saad | done |
| I5.1 | Central integrations page | Saad | done |
| I5.2 | Per-workspace configuration | Saad | done |
| I5.3 | Secret handling | Saad | done |
| I5.4 | Synchronization history | Saad | done |
| I5.5 | Resilience | Saad | done |
| I5.6 | Clearly stated limits | Saad | done |
| I5.7 | Permission and audit | Saad | done |
| I5.8 | Isolation of failures | Saad | done |
| Q1 | Authentication security | All | done |
| Q2 | Authorization | All | done |
| Q3 | Input safety | All | done |
| Q4 | Data integrity | All | done |
| Q5 | Concurrency and timing | All | done: timers live in the database and sweep on boot; escalation uses row locks and version checks |
| Q6 | Persistence | All | done |
| Q7 | Responsive interface | All | partial: screens are built mobile first but 360px was not audited end to end (Ahmad) |
| Q8 | Accessibility | All | partial: keyboard and labels are built into the design system; no full audit run (Ahmad) |
| Q9 | Performance | All | partial: server-side pagination and search everywhere; large-list rendering not load-tested |
| Q10 | Feedback and errors | All | partial: loading, success and error states exist on the screens built; coverage not audited (Ahmad) |
| Q11 | Real-time awareness | All | done: server-sent events drive leads, messages, payments, appointments and the dashboard |
| Q12 | Consistent data | All | done: one revenue module and shared predicates feed lists, exports and the dashboard |
| Q13 | Configuration and secrets | All | done: README setup, .env.example and an idempotent seed |
| Q14 | Maintainable structure | All | done: modules and provider adapters, with Discord left unregistered |

## Open gaps

- Saad: dashboard screen, audit log screen, saved-list filter bar and list screens (F5.1-F5.5, F4.2, F2.6).
- Abdullah: confirm the recovery and assignment screens against F3.7 and F3.3 at 360px; add `created` and `escalated` filters to the leads list so dashboard links filter it.
- Ahmad: responsive and accessibility audit of the built screens (Q7, Q8, Q10); contact page layout against F2.8.
- Everyone: run one real Stripe card payment end to end to close I2.2 and I2.5.
