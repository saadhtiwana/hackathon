import { createApp } from './app.js';
import { env } from './core/env.js';
import { logger } from './core/logger.js';
import { scheduler } from './core/scheduler/index.js';

createApp().listen(env.PORT, () => {
  logger.info('listening', { port: env.PORT });
  scheduler.start();
});
