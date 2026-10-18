# Relay web

Next.js desk for Relay. API calls go to `/api/*`, which rewrites to `BACKEND_URL` (default `http://localhost:4000`).

```powershell
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000/design for the style guide, or http://localhost:3000/login to sign in.

`npm run build` must pass. Pushes to `main` that touch `frontend/**` deploy to Vercel.
