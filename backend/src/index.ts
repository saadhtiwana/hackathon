import { createApp } from './app.js';
import { env } from './core/env.js';
import { logger } from './core/logger.js';

createApp().listen(env.PORT, () => {
  logger.info('listening', { port: env.PORT });
});
