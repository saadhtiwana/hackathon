import { createApp } from './app.js';
import { env } from './core/env.js';
import { logger } from './core/logger.js';
import { scheduler } from './core/scheduler/index.js';
import { pollAllMailboxes } from './modules/conversations/email.js';

createApp().listen(env.PORT, () => {
  logger.info('listening', { port: env.PORT });
  scheduler.start();
  // Gmail has no push without a public Pub/Sub topic, so the agency mailbox is polled every 30 seconds.
  const poll = () => pollAllMailboxes().catch((e) => logger.error('mailbox poll failed', { err: e instanceof Error ? e.message : String(e) }));
  setInterval(poll, 30_000).unref();
});
