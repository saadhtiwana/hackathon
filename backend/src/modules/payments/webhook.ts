import express, { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../core/db/client.js';
import { workspaces } from '../../core/db/schema/index.js';
import { integrationEvents } from '../../core/integration-events/index.js';
import { logger } from '../../core/logger.js';
import { loadConfig } from '../integrations/service.js';
import { stripeAdapter } from '../integrations/stripe/adapter.js';
import { stripeFor } from '../integrations/stripe/client.js';
import { applyStripeEvent } from './service.js';

// Mounted before the JSON parser: the signature covers the exact raw bytes.
export const stripeWebhookRouter = Router();

stripeWebhookRouter.post('/:workspaceId', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const ws = req.params.workspaceId!;
  if (!/^[0-9a-f-]{36}$/i.test(ws)) return void res.status(404).json({ error: { code: 'not_found', message: 'Unknown workspace' } });
  const [w] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, ws));
  if (!w) return void res.status(404).json({ error: { code: 'not_found', message: 'Unknown workspace' } });

  const reject = async (why: string) => {
    await integrationEvents.recordInbound({ workspaceId: ws, provider: 'stripe', type: 'webhook', result: 'rejected', httpStatus: 400, error: why });
    res.status(400).json({ error: { code: 'bad_signature', message: 'Webhook signature could not be verified' } });
  };

  try {
    const cfg = await loadConfig(ws, stripeAdapter);
    const sig = req.header('stripe-signature');
    if (!cfg?.webhookSecret || !sig || !Buffer.isBuffer(req.body)) return await reject('missing signature or connection');
    let event;
    try {
      event = stripeFor(cfg.secretKey).webhooks.constructEvent(req.body, sig, cfg.webhookSecret);
    } catch {
      return await reject('signature verification failed');
    }

    const rec = await integrationEvents.recordInbound({ workspaceId: ws, provider: 'stripe', type: event.type, externalId: event.id, result: 'ok', httpStatus: 200 });
    if (rec.duplicate) return void res.status(200).json({ ok: true, duplicate: true });
    try {
      await applyStripeEvent(ws, event);
    } catch (err) {
      // Forget the dedupe row so Stripe's retry is processed instead of skipped.
      if (rec.id) await integrationEvents.forget(rec.id);
      await integrationEvents.recordInbound({ workspaceId: ws, provider: 'stripe', type: event.type, result: 'error', httpStatus: 500, error: err instanceof Error ? err.message : 'processing failed', ref: event.id });
      logger.error('stripe webhook processing failed', { type: event.type, err: err instanceof Error ? err.message : String(err) });
      return void res.status(500).json({ error: { code: 'processing_failed', message: 'Event could not be applied; it will be retried' } });
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('stripe webhook failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: { code: 'internal_error', message: 'Webhook handler failed' } });
  }
});
