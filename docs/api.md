# REST API Contract

## Conventions

- Base path `/api`. JSON in and out. Ids are UUIDs, timestamps ISO 8601 UTC, money in integer cents plus ISO currency.
- Auth: HttpOnly session cookie `relay_sid` (SameSite=Lax). State-changing requests also send header `X-CSRF-Token` (value from `GET /api/auth/csrf`). Workspace comes from the session, never from the URL; ids from other workspaces return 404.
- Errors: `{ "error": { "code": "validation_failed", "message": "...", "fields": { "name": "Required" } } }` with 400/401/403/404/409/429. 409 = stale `version`.
- Lists: `?limit=50&cursor=<opaque>` return `{ "items": [...], "nextCursor": "..."|null }`.
- Perm column: `-` = any logged-in member, `owner`/`admin` = base level, otherwise a permission key. Owner holds all keys; Admin holds all except changing the Owner.
- Permission keys: `crm.view crm.create crm.edit crm.delete crm.export opportunities.view_value pipelines.manage assignment.manage leads.view_all leads.reassign conversations.view_all payments.create integrations.manage audit.view users.manage roles.manage dashboard.view_all`.
- `/health`, `/internal/*`, `/realtime/*`, `/webhooks/*` are outside `/api`.

## Auth and session

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /auth/csrf | public | - | `{token}` |
| POST | /auth/signup | public | `{workspaceName,name,email,password}` | `201 {user,workspace}` creates workspace, Owner role, default pipeline and rules |
| POST | /auth/login | public | `{email,password}` | `{user,workspace,permissions[]}`; 429 after repeated failures |
| POST | /auth/logout | - | - | `204` |
| POST | /auth/accept-invite | public | `{token,name,password}` | `{user,workspace}` |
| GET | /me | - | - | `{user:{id,name,email},workspace:{id,name},role:{id,name,baseLevel},permissions[],availability,telegramLinked,googleConnected}` |
| PATCH | /me | - | `{name?,password?,currentPassword?}` | `{user}` |

## Users, invites, roles

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /users | users.manage or leads.reassign | - | `{items:[{id,name,email,roleId,availability,googleConnected,lastSeenAt}]}` |
| POST | /users/invites | users.manage | `{email,roleId}` | `201 {id,email,roleId,expiresAt,inviteUrl}` |
| GET | /users/invites | users.manage | - | `{items:[invite]}` |
| DELETE | /users/invites/:id | users.manage | - | `204` |
| PATCH | /users/:id | users.manage | `{roleId?,active?}` | `{user}`; Admin cannot touch Owner |
| GET | /roles | roles.manage | - | `{items:[{id,name,baseLevel,permissions[]}]}` |
| POST | /roles | roles.manage | `{name,baseLevel:"admin"\|"user",permissions[]}` | `201 {role}` |
| PATCH | /roles/:id | roles.manage | `{name?,permissions?}` | `{role}` (audited) |
| DELETE | /roles/:id | roles.manage | - | `204`; 409 if members still use it |
| GET | /permissions | roles.manage | - | `{items:[{key,label,group}]}` |
| PUT | /me/availability | - | `{status:"available"\|"busy"\|"on_leave"\|"offline"}` | `{status,reassigned:n,flaggedAway:n}` |
| PUT | /users/:id/availability | users.manage | same | same |
| GET | /availability | - | - | `{items:[{userId,name,status,openLeads}]}` |

## Contacts, companies, opportunities

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /contacts | crm.view | `?q&tag&ownerId&companyId&createdFrom&createdTo&listId&limit&cursor` | `{items:[contact],nextCursor}` |
| POST | /contacts | crm.create | `{name,phone?,email?,companyId?,ownerId?,tags?[],custom?{}}` phone normalized to E.164 | `201 {contact}`; 409 on duplicate phone |
| GET | /contacts/:id | crm.view | - | `{contact,company,opportunities[],conversations[],payments[],appointments[],owner,tags[]}` |
| PATCH | /contacts/:id | crm.edit | partial contact | `{contact}` |
| DELETE | /contacts/:id | crm.delete | - | `204` (audited) |
| PUT | /contacts/:id/opt-out | crm.edit | `{optedOut:boolean,reason?}` | `{contact}` |
| GET | /contacts/export | crm.export | same filters | CSV |
| GET | /tags | crm.view | - | `{items:[{id,name}]}` |
| POST | /tags | crm.edit | `{name}` | `201 {tag}` |
| PUT | /contacts/:id/tags | crm.edit | `{tagIds[]}` | `{tags[]}` |
| GET | /companies | crm.view | `?q&limit&cursor` | `{items:[company]}` |
| POST | /companies | crm.create | `{name,domain?,phone?,address?}` | `201 {company}` |
| GET | /companies/:id | crm.view | - | `{company,contacts[]}` |
| PATCH | /companies/:id | crm.edit | partial | `{company}` |
| DELETE | /companies/:id | crm.delete | - | `204`; contacts keep, company_id nulled |
| GET | /opportunities | crm.view | `?pipelineId&stageId&ownerId&contactId&q&limit&cursor` | `{items:[opportunity]}`; `valueCents` omitted without opportunities.view_value |
| POST | /opportunities | crm.create | `{pipelineId,stageId?,contactId,name,valueCents?,currency?,ownerId?,custom?{}}` | `201 {opportunity}` |
| GET | /opportunities/:id | crm.view | - | `{opportunity,contact,payments[],appointments[],activities[]}` |
| PATCH | /opportunities/:id | crm.edit | `{version,name?,valueCents?,ownerId?,custom?{}}` | `{opportunity}`; 409 if version stale |
| POST | /opportunities/:id/move | crm.edit | `{stageId,version}` | `{opportunity}`; 422 `{code:"required_fields_missing",fields:[fieldId]}` |
| DELETE | /opportunities/:id | crm.delete | - | `204` |
| GET | /opportunities/export | crm.export | filters | CSV, value column dropped without view_value |

## Pipelines, stages, custom fields, saved lists

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /pipelines | crm.view | - | `{items:[{id,name,isDefault,stages[],fields[]}]}` |
| POST | /pipelines | pipelines.manage | `{name}` | `201 {pipeline}` |
| PATCH | /pipelines/:id | pipelines.manage | `{name?,isDefault?}` | `{pipeline}` |
| DELETE | /pipelines/:id | pipelines.manage | `?moveTo=<pipelineId>` | `204`; 409 if it has opportunities and no moveTo |
| POST | /pipelines/:id/stages | pipelines.manage | `{name,isWon?,isLost?,position?}` | `201 {stage}` |
| PATCH | /stages/:id | pipelines.manage | `{name?,isWon?,isLost?}` | `{stage}` |
| PUT | /pipelines/:id/stages/order | pipelines.manage | `{stageIds[]}` | `{stages[]}` |
| DELETE | /stages/:id | pipelines.manage | `?moveTo=<stageId>` | `204`; 409 if opportunities present and no moveTo |
| GET | /custom-fields | crm.view | `?entity=contact\|opportunity&pipelineId` | `{items:[{id,entity,pipelineId,name,type,options,required}]}` |
| POST | /custom-fields | pipelines.manage | `{entity,pipelineId?,name,type:"text"\|"number"\|"date"\|"dropdown"\|"checkbox",options?[]}` | `201 {field}` |
| PATCH | /custom-fields/:id | pipelines.manage | `{name?,options?}` | `{field}` |
| DELETE | /custom-fields/:id | pipelines.manage | - | `204` (values stay in jsonb, hidden) |
| PUT | /stages/:id/required-fields | pipelines.manage | `{fieldIds[]}` | `{fieldIds[]}` |
| GET | /lists | crm.view | - | `{items:[{id,name,entity,criteria}]}` |
| POST | /lists | crm.create | `{name,entity,criteria:[{field,op,value}]}` (3+ criteria allowed) | `201 {list}` |
| PATCH | /lists/:id | crm.edit | `{name?,criteria?}` | `{list}` |
| DELETE | /lists/:id | crm.delete | - | `204` |
| GET | /lists/:id/records | crm.view | `?limit&cursor` | `{items,nextCursor,total}` evaluated live |

## Activities

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /activities | crm.view | `?contactId\|opportunityId\|leadId&limit&cursor` | `{items:[{id,type,actor:{id,name}\|null,data,createdAt}],nextCursor}` |
| POST | /activities/notes | crm.edit | `{contactId?,opportunityId?,leadId?,body}` | `201 {activity}`; counts as lead action |
| POST | /activities/calls | crm.edit | `{contactId,leadId?,summary,durationSec?}` | `201 {activity}`; counts as lead action |

## Leads (Abdullah)

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /leads | crm.view | `?status&ownerId&source&mine=true&limit&cursor` | `{items:[lead]}`; users without leads.view_all see own only |
| POST | /leads | crm.create | `{contactId?,name?,phone?,email?,message?}` source=manual | `201 {lead}` |
| GET | /leads/:id | crm.view | - | `{lead,contact,assignments[],ackRemainingSeconds}` |
| POST | /leads/:id/acknowledge | crm.view | - | `{lead}`; owner only |
| POST | /leads/:id/reassign | leads.reassign | `{toUserId,version}` | `{lead}`; 409 stale |
| POST | /leads/:id/close | crm.edit | `{outcome?}` | `{lead}` |
| GET | /leads/recovery | leads.view_all | `?limit&cursor` | `{items:[{lead,reasons:[{code,text}]}]}` |
| GET | /assignment-rules | assignment.manage | - | `{ackWindowSeconds,maxOpenLeads,idleSeconds,escalationLevels:[{kind,userId?,seconds}],acknowledgedOnLeavePolicy,strategy:"round_robin"}` |
| PUT | /assignment-rules | assignment.manage | same body | same (audited) |
| POST | /public/leads/:workspaceSlug | public, rate limited | `{name,phone?,email?,message?,website?}` (`website` honeypot) | `201 {ok:true}` |
| GET | /public/forms/:workspaceSlug | public | - | `{workspaceName,fields[]}` |

## Conversations and messages

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /conversations | crm.view | `?contactId&ownerId&limit&cursor` | `{items:[{id,contactId,channel,ownerId,lastMessageAt,unread}]}`; own only without conversations.view_all |
| GET | /conversations/:id/messages | crm.view | `?limit&cursor` | `{items:[{id,direction,body,status,errorCode,errorMessage,createdAt}]}` |
| POST | /conversations/:id/messages | crm.edit | `{body}` | `201 {message}` status `queued`; 409 `opted_out` with reason |
| POST | /messages/:id/retry | crm.edit | - | `{message}` new message, `retryOf` set |
| POST | /contacts/:id/messages | crm.edit | `{body}` | starts conversation if none |

## Payments

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| POST | /opportunities/:id/payments | payments.create | `{amountCents,currency,description?,sendVia?:"whatsapp"}` | `201 {payment:{id,status:"requested",url,...}}` |
| GET | /payments | crm.view | `?opportunityId&contactId&status&limit&cursor` | `{items:[payment]}` |
| GET | /payments/:id | crm.view | - | `{payment,opportunity,contact,requestedBy,providerRef}` |
| POST | /payments/:id/resend | payments.create | - | `{ok}` |
| GET | /payments/summary | crm.view | `?from&to` | `{collectedCents,projectedCents,unpaidCents,refundedCents}` |

## Appointments and calendar

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /integrations/google/connect | - | - | `{authUrl}` |
| GET | /integrations/google/callback | public (state-checked) | `?code&state` | redirect to app |
| DELETE | /integrations/google | - | - | `204` disconnect own account |
| GET | /calendar/busy | crm.view | `?userId&from&to` | `{busy:[{start,end}],timezone}` |
| GET | /appointments | crm.view | `?userId&contactId&opportunityId&from&to` | `{items:[appointment]}` |
| POST | /appointments | crm.edit | `{userId,contactId,opportunityId?,title,startsAt,endsAt,timezone,force?}` | `201 {appointment}`; 409 `{code:"conflict",busy:[...]}` unless `force`; 422 `calendar_not_connected` |
| PATCH | /appointments/:id | crm.edit | `{startsAt?,endsAt?,timezone?,title?}` | `{appointment}` updates Google event |
| DELETE | /appointments/:id | crm.edit | - | `{appointment}` status cancelled |

## Integrations and sync history

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /integrations | integrations.manage or audit.view | - | `{items:[{provider,status:"not_connected"\|"connected"\|"error",lastOkAt,lastErrorAt,lastError,secretLast4,limits,webhookUrl}]}` |
| PUT | /integrations/twilio | integrations.manage | `{accountSid,authToken,whatsappFrom}` | `{integration}` verified with a live call |
| PUT | /integrations/stripe | integrations.manage | `{secretKey,webhookSecret}` | `{integration}` |
| PUT | /integrations/telegram | integrations.manage | `{botToken}` | `{integration}` |
| DELETE | /integrations/:provider | integrations.manage | - | `204` (audited) |
| GET | /integrations/events | integrations.manage or audit.view | `?provider&direction&result&from&to&limit&cursor` | `{items:[{id,direction,provider,type,externalId,result,httpStatus,error,ref,createdAt}]}` |
| GET | /integrations/failed-alerts | integrations.manage | - | `{items:[outbox job]}` |
| GET | /notification-settings | - | - | `{telegramLinked,channel:"telegram",notifyOnEscalation,notifyOnMessage}` |
| PUT | /notification-settings | - | `{notifyOnEscalation?,notifyOnMessage?}` | same |
| POST | /notification-settings/telegram/link | - | - | `{deepLink,code}` user opens the bot with the code |
| DELETE | /notification-settings/telegram | - | - | `204` |

Webhooks (no session; signature verified): `POST /webhooks/twilio/:workspaceId/inbound`, `POST /webhooks/twilio/:workspaceId/status`, `POST /webhooks/stripe/:workspaceId`, `POST /webhooks/telegram/:workspaceId`. Each returns 200 on duplicate, 403 on bad signature (recorded as `rejected`).

## Audit log

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /audit | audit.view | `?action&actorId&targetType&from&to&limit&cursor` | `{items:[{id,actor:{id,name}\|null,action,targetType,targetId,before,after,createdAt}],nextCursor}` |

No POST, PATCH or DELETE exists for audit entries.

## Dashboard

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /dashboard | - | `?scope=me\|company` (company needs dashboard.view_all) | `{newLeadsToday,openPipelineByStage:[{stageId,name,valueCents}]\|null,avgTimeToFirstResponseSec,recoveryQueueCount,escalationsLast24h,availability:{available,busy,onLeave,offline},upcomingAppointments[],collectedThisMonthCents}` |
| GET | /dashboard/prefs | - | - | `{hidden:["newLeadsToday"]}` |
| PUT | /dashboard/prefs | - | `{hidden:[string]}` | same |

Drill-down uses the list endpoints with the same filters (`/leads`, `/leads/recovery`, `/opportunities`, `/appointments`, `/payments`).

## Realtime

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| POST | /realtime/ticket | - | - | `{ticket,expiresAt}` single use, 30 s |
| GET | /realtime/stream | ticket | `?ticket=` | `text/event-stream`; events `{type,data}` as in `realtime.publish` |

## Internal

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /internal/tick | header `X-Internal-Secret` | runs outbox drain and `leadHooks.sweep`; called every minute by an external cron, safe to call concurrently |
| GET | /health | public | `{ok,db}` |
