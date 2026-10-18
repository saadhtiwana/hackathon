import express from 'express';
import helmet from 'helmet';
import { pingDb } from './core/db/client.js';
import { sessionMiddleware } from './core/auth/sessions.js';
import { AppError, errorMiddleware } from './core/errors.js';
import { originCheck } from './core/http/csrf.js';
import { requestId } from './core/logger.js';
import { realtimeApiRouter, realtimeStreamRouter } from './core/realtime/index.js';
import { authRouter } from './modules/auth/routes.js';
import { workspaceRouter } from './modules/workspace/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { rolesRouter } from './modules/roles/routes.js';
import { crmRouter } from './modules/crm/routes.js';
import { leadsRouter } from './modules/leads/index.js';
import { internalRouter } from './core/scheduler/index.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());

  const keepRaw = (req: express.Request, _res: express.Response, buf: Buffer) => {
    req.rawBody = buf;
  };
  app.use(express.json({ limit: '1mb', verify: keepRaw }));
  app.use(express.urlencoded({ extended: false, limit: '1mb', verify: keepRaw }));

  app.get('/health', async (_req, res) => {
    const db = await pingDb();
    res.status(db ? 200 : 503).json({ ok: db, db });
  });

  // /internal/*, /webhooks/* are mounted by their owners and authenticate by key or provider signature.
  app.use('/realtime', realtimeStreamRouter);
  app.use('/internal', internalRouter);

  const api = express.Router();
  api.use(originCheck);
  api.use(sessionMiddleware);
  api.use(authRouter);
  api.use(realtimeApiRouter);
  api.use(workspaceRouter);
  api.use(usersRouter);
  api.use(rolesRouter);
  api.use(crmRouter);
  api.use(leadsRouter);
  app.use('/api', api);

  app.use((_req, _res, next) => next(new AppError(404, 'not_found', 'Route not found')));
  app.use(errorMiddleware);
  return app;
}
