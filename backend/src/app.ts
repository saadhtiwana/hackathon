import express from 'express';
import { pingDb } from './core/db/client.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    const db = await pingDb();
    res.status(db ? 200 : 503).json({ ok: db, db });
  });

  // /api/* app routes, /internal/*, /realtime/* and /webhooks/* are mounted by their modules.
  return app;
}
