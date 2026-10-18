import { createHmac } from 'node:crypto';
import express, { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../core/db/client.js';
import { workspaces } from '../../core/db/schema/index.js';
import { safeEqual } from '../../core/crypto/index.js';
import { env } from '../../core/env.js';
import { integrationEvents } from '../../core/integration-events/index.js';
import { logger } from '../../core/logger.js';
import { ingestForwarded } from '../conversations/email.js';

// Per-workspace signing secret, derived from the server secret so nothing extra is stored.
export const emailWebhookSecret = (ws: string) => createHmac('sha256', env.SESSION_SECRET).update(`email-webhook:${ws}`).digest('hex');
export const signEmailWebhook = (ws: string, ts: number, body: string) => createHmac('sha256', emailWebhookSecret(ws)).update(`${ts}.${body}`).digest('hex');

const TOLERANCE_S = 300;
const payload = z.object({ id: z.string().min(1).max(200), from: z.string().email().max(320), fromName: z.string().max(200).optional(), subject: z.string().max(500).optional(), text: z.string().max(20000).optional() });

// Mounted before the JSON parser: the signature covers the exact bytes.
export const emailWebhookRouter = Router();

emailWebhookRouter.post('/:workspaceId', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const ws = req.params.workspaceId!;
  if (!/^[0-9a-f-]{36}$/i.test(ws)) return void res.status(404).json({ error: { code: 'not_found', message: 'Unknown workspace' } });
  const [w] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, ws));
  if (!w) return void res.status(404).json({ error: { code: 'not_found', message: 'Unknown workspace' } });

  const reject = async (why: string) => {
    await integrationEvents.recordInbound({ workspaceId: ws, provider: 'gmail', type: 'webhook', result: 'rejected', httpStatus: 401, error: why });
    res.status(401).json({ error: { code: 'bad_signature', message: 'Request signature is invalid' } });
  };
  try {
    const ts = Number(req.header('x-relay-timestamp'));
    const sig = req.header('x-relay-signature') ?? '';
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return await reject('timestamp outside the allowed window');
    if (!sig || !safeEqual(sig, signEmailWebhook(ws, ts, raw))) return await reject('signature verification failed');
    const body = payload.safeParse(JSON.parse(raw));
    if (!body.success) return void res.status(400).json({ error: { code: 'validation_failed', message: 'Body must have id and from' } });
    const result = await ingestForwarded(ws, body.data);
    res.status(200).json({ ok: true, result });
  } catch (e) {
    logger.error('email webhook failed', { err: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: { code: 'internal_error', message: 'Webhook handler failed' } });
  }
});
