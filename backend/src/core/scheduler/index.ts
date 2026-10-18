import { Router } from 'express';
import { safeEqual } from '../crypto/index.js';
import { env } from '../env.js';
import { AppError } from '../errors.js';
import { leadHooks } from '../lead-hooks.js';
import { logger } from '../logger.js';
import { outbox } from '../outbox/index.js';

const MAX_WAIT_MS = 30_000;
const SWEEP_EVERY_MS = 30_000;
const DRAIN_EVERY_MS = 5_000;

interface LeadTimers {
  sweep(now: Date): Promise<{ escalated: number; recovered: number }>;
  nextDueAt(): Promise<Date | null>;
}

let leads: LeadTimers = { sweep: (now) => leadHooks.sweep(now), nextDueAt: async () => null };
let started = false;
let timer: NodeJS.Timeout | null = null;
const intervals: NodeJS.Timeout[] = [];
let rearmQueued = false;

// Overlap guard per process; across processes SKIP LOCKED in sweep and drain keeps work single.
function guarded<T>(name: string, fn: () => Promise<T>) {
  let running = false;
  return async (): Promise<T | null> => {
    if (running) return null;
    running = true;
    try {
      return await fn();
    } catch (err) {
      logger.error(`scheduler ${name} failed`, { err: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      running = false;
    }
  };
}

const runSweep = guarded('sweep', async () => {
  const r = await leads.sweep(new Date());
  scheduler.rearm();
  return r;
});
const runDrain = guarded('drain', () => outbox.drain());

async function tick() {
  const sweep = await runSweep();
  const drain = await runDrain();
  return { sweep, drain };
}

async function arm() {
  const due = await leads.nextDueAt();
  const now = Date.now();
  const at = Math.min(due ? due.getTime() : Infinity, now + MAX_WAIT_MS);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void tick(), Math.max(0, at - now));
  timer.unref();
}

export const scheduler = {
  // The leads module provides its sweep and next deadline here when it loads.
  useLeads(l: LeadTimers) {
    leads = l;
  },

  start() {
    if (started) return;
    started = true;
    // boot run: leads that came due while the server was down escalate now
    void tick();
    intervals.push(setInterval(() => void runSweep(), SWEEP_EVERY_MS), setInterval(() => void runDrain(), DRAIN_EVERY_MS));
    for (const i of intervals) i.unref();
  },

  stop() {
    started = false;
    if (timer) clearTimeout(timer);
    timer = null;
    for (const i of intervals.splice(0)) clearInterval(i);
  },

  // Called after any lead change commits; coalesces bursts into one deadline lookup.
  rearm() {
    if (!started || rearmQueued) return;
    rearmQueued = true;
    setImmediate(() => {
      rearmQueued = false;
      arm().catch((err) => logger.error('scheduler rearm failed', { err: err instanceof Error ? err.message : String(err) }));
    });
  },

  tick,
};

// GET /internal/tick?key=TICK_KEY for an external cron; safe to call while the in-process timers run.
export const internalRouter = Router();
internalRouter.get('/tick', async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (!env.TICK_KEY || !safeEqual(key, env.TICK_KEY)) throw new AppError(403, 'forbidden', 'Invalid tick key');
  const sweep = await leads.sweep(new Date());
  const drain = await outbox.drain();
  scheduler.rearm();
  res.json({ ok: true, sweep, drain });
});
