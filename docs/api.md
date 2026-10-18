# REST API Contract

## Conventions

- Base path `/api`. JSON in and out. Ids are UUIDs, timestamps ISO 8601 UTC, money in integer cents plus ISO currency.
- Auth: HttpOnly session cookie `relay_sid` (7 days, SameSite=Lax, Secure over https), revocable. State-changing `/api` requests must carry an `Origin` in `ALLOWED_ORIGINS`; `/api/public/*`, `/webhooks/*`, `/internal/*` are exempt. Workspace comes from the session, never from the URL; ids from other workspaces return 404.
- Errors: `{ "error": { "code": "validation_failed", "message": "...", "hint": "...", "fields": { "name": "Required" } } }` with 400/401/403/404/409/429. 409 = stale `version`.
- Lists: `?limit=50&cursor=<opaque>` return `{ "items": [...], "nextCursor": "..."|null }`.
- Perm column: `-` = any logged-in member, `owner`/`admin` = base level, otherwise a permission key. Owner holds all keys; Admin holds all except changing the Owner.
- Permission keys: `crm.view crm.create crm.edit crm.delete crm.export crm.view_values leads.reassign leads.manage_rules settings.manage users.manage integrations.manage audit.view`. `leads.reassign` also grants company-wide lead, conversation and dashboard views.
- `/health`, `/internal/*`, `/realtime/*`, `/webhooks/*` are outside `/api`.

## Auth and session

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| POST | /auth/signup | public | `{workspaceName,name,email,password}` | `201 {user,workspace}` creates workspace, Owner role, default pipeline and rules |
| POST | /auth/login | public | `{email,password}` | `{user,workspace,permissions[]}`; 429 after repeated failures |
| POST | /auth/logout | - | - | `204` |
| POST | /auth/logout-all | - | - | `204` ends every session of the user |
| POST | /auth/accept-invite | public | `{token,name,password}` | `{user,workspace}` |
| GET | /workspace | - | - | `{workspace:{id,name,slug,timezone,defaultCurrency}}` |
| PATCH | /workspace | settings.manage | `{name?,timezone?,defaultCurrency?}` | `{workspace}` (audited) |
| GET | /me | - | - | `{user:{id,name,email},workspace:{id,name},role:{id,name,baseLevel},permissions[],availability,telegramLinked,googleConnected}` |

## Users, invites, roles

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /users | users.manage or leads.reassign | - | `{items:[{id,name,email,roleId,availability,googleConnected,lastSeenAt}]}` |
| POST | /users/invites | users.manage | `{email,roleId}` | `201 {id,email,roleId,expiresAt,inviteUrl}` |
| GET | /users/invites | users.manage | - | `{items:[invite]}` |
| DELETE | /users/invites/:id | users.manage | - | `204` |
| PATCH | /users/:id | users.manage | `{roleId?,active?}` | `{user}`; Admin cannot touch Owner |
| GET | /roles | users.manage | - | `{items:[{id,name,baseLevel,permissions[]}]}` |
| POST | /roles | users.manage | `{name,baseLevel:"admin"\|"user",permissions[]}` | `201 {role}` |
| PATCH | /roles/:id | users.manage | `{name?,permissions?}` | `{role}` (audited) |
| DELETE | /roles/:id | users.manage | - | `204`; 409 if members still use it |
| GET | /permissions | users.manage | - | `{items:[{key,label,group}]}` |
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
| GET | /opportunities | crm.view | `?pipelineId&stageId&ownerId&contactId&q&limit&cursor` | `{items:[opportunity]}`; `valueCents` omitted without crm.view_values |
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
| POST | /pipelines | settings.manage | `{name}` | `201 {pipeline}` |
| PATCH | /pipelines/:id | settings.manage | `{name?,isDefault?}` | `{pipeline}` |
| DELETE | /pipelines/:id | settings.manage | `?moveTo=<pipelineId>` | `204`; 409 if it has opportunities and no moveTo |
| POST | /pipelines/:id/stages | settings.manage | `{name,isWon?,isLost?,position?}` | `201 {stage}` |
| PATCH | /stages/:id | settings.manage | `{name?,isWon?,isLost?}` | `{stage}` |
| PUT | /pipelines/:id/stages/order | settings.manage | `{stageIds[]}` | `{stages[]}` |
| DELETE | /stages/:id | settings.manage | `?moveTo=<stageId>` | `204`; 409 if opportunities present and no moveTo |
| GET | /custom-fields | crm.view | `?entity=contact\|opportunity&pipelineId` | `{items:[{id,entity,pipelineId,name,type,options,required}]}` |
| POST | /custom-fields | settings.manage | `{entity,pipelineId?,name,type:"text"\|"number"\|"date"\|"dropdown"\|"checkbox",options?[]}` | `201 {field}` |
| PATCH | /custom-fields/:id | settings.manage | `{name?,options?}` | `{field}` |
| DELETE | /custom-fields/:id | settings.manage | - | `204` (values stay in jsonb, hidden) |
| PUT | /stages/:id/required-fields | settings.manage | `{fieldIds[]}` | `{fieldIds[]}` |
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
| GET | /leads | crm.view | `?status&ownerId&source&mine=true&limit&cursor` | `{items:[lead]}`; users without leads.reassign see own only |
| POST | /leads | crm.create | `{contactId?,name?,phone?,email?,message?}` source=manual | `201 {lead}` |
| GET | /leads/:id | crm.view | - | `{lead,contact,assignments[],ackRemainingSeconds}` |
| POST | /leads/:id/acknowledge | crm.view | - | `{lead}`; owner only |
| POST | /leads/:id/reassign | leads.reassign | `{toUserId,version}` | `{lead}`; 409 stale |
| POST | /leads/:id/close | crm.edit | `{outcome?}` | `{lead}` |
| GET | /leads/recovery | leads.reassign | `?limit&cursor` | `{items:[{lead,reasons:[{code,text}]}]}` |
| GET | /assignment-rules | leads.manage_rules | - | `{ackWindowSeconds,maxOpenLeads,idleSeconds,escalationLevels:[{kind,userId?,seconds}],acknowledgedOnLeavePolicy,strategy:"round_robin"}` |
| PUT | /assignment-rules | leads.manage_rules | same body | same (audited) |
| POST | /public/leads/:workspaceSlug | public, rate limited | `{name,phone?,email?,message?,website?}` (`website` honeypot) | `201 {ok:true}` |
| GET | /public/forms/:workspaceSlug | public | - | `{workspaceName,fields[]}` |

## Conversations and messages

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /conversations | crm.view | `?contactId&ownerId&limit&cursor` | `{items:[{id,contactId,channel,ownerId,lastMessageAt,unread}]}`; own only without leads.reassign |
| GET | /conversations/:id/messages | crm.view | `?limit&cursor` | `{items:[{id,direction,body,status,errorCode,errorMessage,createdAt}]}` |
| POST | /conversations/:id/messages | crm.edit | `{body}` | `201 {message}` status `queued`; 409 `opted_out` with reason |
| POST | /messages/:id/retry | crm.edit | - | `{message}` new message, `retryOf` set |
| POST | /contacts/:id/messages | crm.edit | `{body}` | starts conversation if none |

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

Providers: `stripe`, `discord`, `google_calendar`. Secrets are encrypted per workspace and never returned; responses carry only a masked last four.

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /integrations | integrations.manage or audit.view | - | `{items:[{provider,label,status:"not_connected"\|"connected"\|"error",lastOkAt,lastErrorAt,lastError,secretMasked,recentErrors:[{type,message,at}],limits:{summary,can[],cannot[]},perUser}]}` |
| POST | /integrations/stripe/connect | integrations.manage | `{secretKey:"sk_test_..."}` | `201 {provider,status,secretMasked}`; verifies the key, creates the webhook endpoint for `PUBLIC_API_URL/webhooks/stripe/:workspaceId`, stores the signing secret encrypted; live keys refused |
| POST | /integrations/discord/connect | integrations.manage | `{botToken,guildId?,channelId?}` | `201 {provider,status,secretMasked}` |
| POST | /integrations/google_calendar/connect | integrations.manage | `{}` | `201 {authUrl,state}` per-employee OAuth consent URL |
| POST | /integrations/:provider/test | integrations.manage | - | `{ok:true}` or `{ok:false,error:{code,message,temporary}}` |
| DELETE | /integrations/:provider | integrations.manage | - | `204` removes the secret and, for Stripe, the remote webhook endpoint (audited) |
| GET | /integrations/:provider/events | integrations.manage or audit.view | `?limit&cursor` | `{items:[{id,direction,provider,type,externalId,result,httpStatus,error,ref,createdAt}],nextCursor}` |

Connect failures: `422` for permanent problems (plain message, for example "The provider rejected the credentials"), `503` for temporary ones (network, 5xx, 429 are retried with backoff first).

## Payments

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| POST | /opportunities/:id/payments | crm.edit | `{amount:1500.5\|amountCents:150050,currency?,description?}` | `201 {payment:{id,status:"requested",url,amountCents,currency,...}}` Stripe Checkout URL; `409 stripe_not_connected` |
| GET | /payments | crm.view | `?status&opportunityId&contactId&limit&cursor` | `{items:[{id,status,amountCents,refundedCents,currency,url,failureReason,opportunityName,contactName,requestedByName,createdAt,paidAt}],nextCursor,total}` |
| GET | /payments/:id | crm.view | - | `{payment,opportunity,contact,requestedBy,providerRef:{provider,sessionId,paymentIntentId}}` |
| POST | /payments/:id/expire | crm.edit | - | expires the open Checkout session; `{payment,...}` with status `expired` |
| GET | /payments/summary | crm.view_values | `?from&to` | `{currency,collectedCents,refundedCents,openPipelineCents,unpaidRequestedCents,projectedCents}` |

Webhook: `POST /webhooks/stripe/:workspaceId` (raw body, `Stripe-Signature` verified with that workspace's secret). Forged or unsigned requests get `400` and are recorded as rejected; a repeated event id returns `200 {duplicate:true}` and changes nothing; processing errors return `500` so Stripe retries.

## Audit log

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /audit | audit.view | `?action&actorId&targetType&from&to&limit&cursor` | `{items:[{id,actor:{id,name}\|null,action,targetType,targetId,before,after,createdAt}],nextCursor}` |

No POST, PATCH or DELETE exists for audit entries.

## Dashboard

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /dashboard | - | `?scope=me\|company` (company needs leads.reassign) | `{newLeadsToday,openPipelineByStage:[{stageId,name,valueCents}]\|null,avgTimeToFirstResponseSec,recoveryQueueCount,escalationsLast24h,availability:{available,busy,onLeave,offline},upcomingAppointments[],collectedThisMonthCents}` |
| GET | /dashboard/prefs | - | - | `{hidden:["newLeadsToday"]}` |
| PUT | /dashboard/prefs | - | `{hidden:[string]}` | same |

Drill-down uses the list endpoints with the same filters (`/leads`, `/leads/recovery`, `/opportunities`, `/appointments`, `/payments`).

## Realtime

| Method | Path | Perm | Request | Response |
|---|---|---|---|---|
| GET | /api/realtime/ticket | - | - | `{ticket,expiresAt}` |
| GET | /realtime/stream | ticket | `?ticket=` | `text/event-stream`; events `{type,ids}` only, 25 s heartbeat; ticket valid 60 s |

## Internal

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /internal/tick | header `X-Internal-Secret` | runs outbox drain and `leadHooks.sweep`; called every minute by an external cron, safe to call concurrently |
| GET | /health | public | `{ok,db}` |
