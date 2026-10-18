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
import { activitiesRouter } from './modules/crm/activities.js';
import { leadsRouter } from './modules/leads/index.js';
import { internalRouter } from './core/scheduler/index.js';
import { integrationsRouter } from './modules/integrations/routes.js';
import { paymentsRouter } from './modules/payments/routes.js';
import { emailWebhookRouter } from './modules/integrations/email-webhook.js';
import { stripeWebhookRouter } from './modules/payments/webhook.js';
import { conversationsRouter } from './modules/conversations/routes.js';
import { googleRouter } from './modules/integrations/google/routes.js';
import { notificationsRouter } from './modules/integrations/google/alerts.js';
import { appointmentsRouter } from './modules/appointments/routes.js';
import './modules/conversations/email.js';
import { notificationsRouter as bellRouter } from './core/notifications/index.js';
import { dashboardRouter } from './modules/dashboard/routes.js';
import { auditRouter } from './modules/audit/routes.js';
import { savedListsRouter } from './modules/savedlists/routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());

  // Signed webhooks need the untouched body, so they mount before the JSON parsers.
  app.use('/webhooks/stripe', stripeWebhookRouter);
  app.use('/webhooks/email', emailWebhookRouter);

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
  api.use(activitiesRouter);
  api.use(bellRouter);
  api.use(dashboardRouter);
  api.use(auditRouter);
  api.use(savedListsRouter);
  api.use(googleRouter);
  api.use(notificationsRouter);
  api.use(appointmentsRouter);
  api.use(integrationsRouter);
  api.use(conversationsRouter);
  api.use(paymentsRouter);
  api.use(leadsRouter);
  app.use('/api', api);

  app.use((_req, _res, next) => next(new AppError(404, 'not_found', 'Route not found')));
  app.use(errorMiddleware);
  return app;
}
