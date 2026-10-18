import type { Request, Response } from 'express';
import { logger } from '../logger.js';
import { integrationEvents } from './index.js';

type Provider = Parameters<typeof integrationEvents.recordInbound>[0]['provider'];

export interface VerifiedWebhook {
  externalId: string;
  type: string;
  ref?: string;
}

export interface WebhookSpec {
  provider: Provider;
  workspaceId: string;
  // Throws or returns null when the signature is wrong. Providers plug their own scheme in here.
  verify(req: Request): VerifiedWebhook | null | Promise<VerifiedWebhook | null>;
  // Runs after the 200 is sent; keep it short or enqueue an outbox job.
  process(event: VerifiedWebhook, req: Request): Promise<void>;
}

export async function handleWebhook(spec: WebhookSpec, req: Request, res: Response): Promise<void> {
  let verified: VerifiedWebhook | null = null;
  try {
    verified = await spec.verify(req);
  } catch {
    verified = null;
  }
  if (!verified) {
    await integrationEvents.recordInbound({ workspaceId: spec.workspaceId, provider: spec.provider, type: 'webhook', result: 'rejected', httpStatus: 403, error: 'signature verification failed' });
    res.status(403).json({ error: { code: 'bad_signature', message: 'Request signature is invalid' } });
    return;
  }

  const rec = await integrationEvents.recordInbound({ workspaceId: spec.workspaceId, provider: spec.provider, type: verified.type, externalId: verified.externalId, result: 'ok', httpStatus: 200, ref: verified.ref });
  res.status(200).json({ ok: true, duplicate: rec.duplicate });
  if (rec.duplicate) return;

  setImmediate(() => {
    spec.process(verified!, req).catch(async (err) => {
      logger.error('webhook processing failed', { provider: spec.provider, err: String(err?.message ?? err) });
      if (rec.id) await integrationEvents.markResult(rec.id, 'error', String(err?.message ?? err)).catch(() => {});
    });
  });
}
