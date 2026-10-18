# Requirement Status

Status: todo, in progress, done. Done means implemented and covered by tests. F2.5, F2.4: backend only; the configuration screens are in the frontend.

| ID | Requirement | Owner | Status |
|---|---|---|---|
| F1.1 | Sign up, log in, log out and persistent sessions | Saad | done |
| F1.2 | Three base levels: Owner, Admin, User | Saad | done |
| F1.3 | Configurable permissions, not tied to role names | Saad | done |
| F1.4 | Field-level protection | Saad | done |
| F1.5 | Server-side enforcement | Saad | done |
| F1.6 | Workspace isolation | Saad | done |
| F2.1 | Contacts, companies and opportunities with relationships | Saad | done |
| F2.2 | Custom fields created from the interface | Ahmad | todo |
| F2.3 | Different fields for different pipelines | Ahmad | todo |
| F2.4 | Stage-specific required fields | Ahmad | done |
| F2.5 | Customizable pipeline | Ahmad | done |
| F2.6 | Filtering and saved lists | Ahmad | todo |
| F2.7 | Activity history | Saad | in progress |
| F2.8 | Complete customer view | Saad | in progress |
| F3.1 | Lead capture from multiple sources | Saad + Abdullah | in progress: web form and manual entry in `modules/leads` (routes, service); WhatsApp intake calls `leadHooks.createLead` from I1 |
| F3.2 | Employee availability | Saad + Abdullah | in progress: lead side in `modules/leads` service `onAvailabilityChange` |
| F3.3 | Configurable assignment rules | Abdullah | in progress: implemented and tested in `modules/leads` (domain assign/eligibility, service, `/assignment-rules`); router mount pending |
| F3.4 | Acknowledgement window | Abdullah | in progress: implemented and tested in `modules/leads` (`ackRemainingSeconds`, acknowledge, onActivity); router mount pending |
| F3.5 | Escalation chain | Abdullah | in progress: implemented and tested in `modules/leads` (domain escalate, service sweep); needs `/internal/tick` |
| F3.6 | Reassignment on absence | Abdullah | in progress: implemented and tested in `modules/leads` (domain availability, service onAvailabilityChange); policy in `docs/lead-engine.md` section 5 |
| F3.7 | Recovery queue | Abdullah | in progress: implemented and tested in `modules/leads` (domain recovery, `/leads/recovery`); router mount pending |
| F3.8 | No duplicate action | Abdullah | in progress: implemented and tested against Postgres in `modules/leads` (row locks, SKIP LOCKED sweep, versioned writes) |
| F3.9 | External notification of escalations | Saad + Abdullah | in progress: `notify.escalation` outbox job enqueued by the sweep; delivery handler pending |
| F4.1 | Record of important actions | Saad | in progress |
| F4.2 | Restricted visibility | Abdullah | in progress |
| F4.3 | Tamper resistance | Saad | done |
| F5.1 | Live overview | Abdullah | todo |
| F5.2 | Consistent definitions | Abdullah | todo |
| F5.3 | Drill-down | Abdullah | todo |
| F5.4 | Role-aware view | Abdullah | todo |
| F5.5 | Basic customization | Abdullah | todo |
| I1 | Messaging | Saad | todo |
| I2 | Payments | Saad | todo |
| I3 | Calendar | Saad | todo |
| I4 | Notifications (choose one) | Saad | todo |
| I1.1 | Receive messages | Saad | todo |
| I1.2 | Request authenticity | Saad | in progress |
| I1.3 | Send messages | Saad | todo |
| I1.4 | Delivery status | Saad | todo |
| I1.5 | Contact matching | Saad | todo |
| I1.6 | Ownership | Saad | todo |
| I1.7 | Failure handling | Saad | todo |
| I1.8 | Duplicates | Saad | todo |
| I1.9 | Opt-out | Saad | todo |
| I2.1 | Create a payment request | Saad | todo |
| I2.2 | Payment confirmation by webhook | Saad | todo |
| I2.3 | Request authenticity | Saad | in progress |
| I2.4 | Idempotent processing | Saad | todo |
| I2.5 | Other outcomes | Saad | todo |
| I2.6 | Collected versus expected | Saad | todo |
| I2.7 | Traceability | Saad | todo |
| I2.8 | No card data stored | Saad | todo |
| I3.1 | Connect with consent | Saad | todo |
| I3.2 | Token handling | Saad | todo |
| I3.3 | Create appointments | Saad | todo |
| I3.4 | Avoid conflicts | Saad | todo |
| I3.5 | Time zones | Saad | todo |
| I3.6 | Change and cancel | Saad | todo |
| I3.7 | Availability link | Saad | todo |
| I4.1 | Real delivery | Saad | todo |
| I4.2 | Useful content | Saad | todo |
| I4.3 | Per-user routing | Saad | todo |
| I4.4 | Failure handling | Saad | todo |
| I5.1 | Central integrations page | Saad | todo |
| I5.2 | Per-workspace configuration | Saad | todo |
| I5.3 | Secret handling | Saad | in progress |
| I5.4 | Synchronization history | Saad | in progress |
| I5.5 | Resilience | Saad | todo |
| I5.6 | Clearly stated limits | Saad | todo |
| I5.7 | Permission and audit | Saad | todo |
| I5.8 | Isolation of failures | Saad | todo |
| Q1 | Authentication security | All | done |
| Q2 | Authorization | All | done |
| Q3 | Input safety | All | done |
| Q4 | Data integrity | All | done |
| Q5 | Concurrency and timing | All | in progress |
| Q6 | Persistence | All | done |
| Q7 | Responsive interface | All | todo |
| Q8 | Accessibility | All | todo |
| Q9 | Performance | All | todo |
| Q10 | Feedback and errors | All | todo |
| Q11 | Real-time awareness | All | in progress |
| Q12 | Consistent data | All | todo |
| Q13 | Configuration and secrets | All | in progress |
| Q14 | Maintainable structure | All | in progress |
