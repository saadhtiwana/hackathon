# NASCON Hackathon

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
