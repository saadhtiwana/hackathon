# NASCON Hackathon

> Judges: start with [docs/self-check.md](docs/self-check.md) for logins and step-by-step checks.

## Team

- [@saadhtiwana](https://github.com/saadhtiwana)
- [@abdullahxdev](https://github.com/abdullahxdev)
- [@ahmadmustafa02](https://github.com/ahmadmustafa02)

## Layout

```
frontend/   web client, deployed to Vercel
backend/    API / server, deployed to Render
.github/    CI workflows
```

## Deploys

| Part     | Platform | How                                                                                             |
| -------- | -------- | ----------------------------------------------------------------------------------------------- |
| Frontend | Vercel   | GitHub Action on push to `main` that touches `frontend/**`. Skips until `frontend/package.json` exists. |
| Backend  | Render   | Render service connected to this repo, root `backend/`, auto-deploy on push to `main`.          |
| Database | Neon     | Postgres. Branch `main` for production, `dev` for local and preview work.                        |

Secrets live in Vercel, Render and GitHub Actions settings. Never commit `.env` files.

## Live URLs

| Part | URL |
| ---- | --- |
| API (Render, free) | https://relay-api-s6yw.onrender.com |
| Health | https://relay-api-s6yw.onrender.com/health |
| Web (Vercel) | https://relay-nascon.vercel.app |

The free API instance sleeps when idle; an external cron pings `/health` and `/internal/tick`.

## Run locally

```
cd backend
npm ci
copy .env.example .env    (Windows)   or   cp .env.example .env
npm run migrate
npm run seed
npm run dev
```

Fill `.env` from the Neon `dev` branch (pooled URL in `DATABASE_URL`, direct URL in `DATABASE_URL_DIRECT`), plus `SESSION_SECRET` (any 32+ characters), `ENCRYPTION_KEY` (32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), `APP_URL`, `ALLOWED_ORIGINS`, `SEED_PASSWORD`. Never commit `.env`.

`npm test` runs unit and API tests against the dev branch; `npm run typecheck` and `npm run build` must stay green.

### Demo logins (local and dev branch only)

The dev branch is seeded with password `Relay-Demo-2026`. Production uses a different, private password.

| Workspace | Email | Role |
| --------- | ----- | ---- |
| Margalla Estates | saadhayat799@gmail.com | Owner |
| Margalla Estates | abdullahisdev@gmail.com | Admin |
| Margalla Estates | ahmadmustafabutt.dev@gmail.com | User (values hidden) |
| Kohsar Solar | sana@kohsarsolar.pk | Owner of a second, isolated workspace |

### Provider keys

Put provider keys in `.secrets/keys.env` (git-ignored, one `NAME=value` per line, for example `CRONJOB_API_KEY`, `STRIPE_*`, `GOOGLE_*`). Runtime secrets generated for the deployed API live in `.secrets/runtime.env`. Keys are entered into the app through the Integrations page; they are stored encrypted per workspace.

## What each integration does

| Need | Provider | Notes |
| ---- | -------- | ----- |
| Messaging | Email through the agency Gmail account | Customers write to a plus-address on the mailbox; the inbox is polled every 30 seconds. Twilio blocks Pakistani signups (error 0x07) and Telegram is blocked in Pakistan, so neither is used. |
| Notifications | Email alerts from the same mailbox | New owners are emailed when a lead is assigned or escalates. |
| Payments | Stripe, test mode | Checkout sessions and a signed webhook. |
| Calendar | Google Calendar, OAuth 2.0 | Each employee connects their own account. The Google app is in Testing mode, so only listed test users can connect. |
