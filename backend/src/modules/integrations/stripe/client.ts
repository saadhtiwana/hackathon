import Stripe from 'stripe';
import { ProviderError, classify } from '../errors.js';

export const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'payment_intent.payment_failed',
  'charge.refunded',
] as const;

export const stripeFor = (secretKey: string) => new Stripe(secretKey, { maxNetworkRetries: 0, timeout: 15_000 });

// Maps SDK errors onto temporary/permanent provider errors with a plain explanation (I5.5).
export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const err = e as { type?: string; statusCode?: number; message?: string; code?: string };
  if (err.type === 'StripeConnectionError') return classify(undefined, 'network error');
  if (err.type === 'StripeRateLimitError') return classify(429, '');
  if (err.type === 'StripeAuthenticationError') return classify(401, '');
  if (err.type === 'StripeAPIError' || (err.statusCode && err.statusCode >= 500)) return classify(err.statusCode ?? 500, '');
  return classify(err.statusCode ?? 400, err.message ?? 'Stripe rejected the request');
}

export const webhookUrl = (publicApiUrl: string, workspaceId: string) => `${publicApiUrl.replace(/\/$/, '')}/webhooks/stripe/${workspaceId}`;
