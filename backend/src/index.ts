import { createApp } from './app.js';
import { env } from './core/env.js';
import { logger } from './core/logger.js';
import { scheduler } from './core/scheduler/index.js';
import { gateways } from './modules/integrations/discord/gateway.js';

createApp().listen(env.PORT, () => {
  logger.info('listening', { port: env.PORT });
  scheduler.start();
  const ensure = () => gateways.ensureAll().catch((e) => logger.error('discord startup failed', { err: e instanceof Error ? e.message : String(e) }));
  ensure();
  setInterval(ensure, 60_000).unref();
});
