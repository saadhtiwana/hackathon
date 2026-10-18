import { z } from 'zod';
import { last4 } from '../../../core/crypto/index.js';
import { env } from '../../../core/env.js';
import { ProviderError, withRetry } from '../errors.js';
import type { ProviderAdapter } from '../adapter.js';
import { WEBHOOK_EVENTS, stripeFor, toProviderError, webhookUrl } from './client.js';

const input = z.object({ secretKey: z.string().trim().regex(/^sk_(test|live)_[A-Za-z0-9]+$/, 'Use a Stripe secret key (sk_test_...)') }).strict();

// Stays in test mode for this product: live keys are refused.
async function removeEndpointsAt(stripe: ReturnType<typeof stripeFor>, url: string) {
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  for (const ep of list.data) if (ep.url === url) await stripe.webhookEndpoints.del(ep.id);
}

export const stripeAdapter: ProviderAdapter = {
  id: 'stripe',
  dbProvider: 'stripe',
  label: 'Stripe',
  async connect(ctx, raw) {
    const { secretKey } = input.parse(raw);
    if (secretKey.startsWith('sk_live_')) throw new ProviderError('Only Stripe test keys are accepted', false, 'live_key_refused');
    if (!env.PUBLIC_API_URL) throw new ProviderError('PUBLIC_API_URL is not configured, so Stripe cannot reach the webhook', false, 'not_configured');
    const stripe = stripeFor(secretKey);
    const url = webhookUrl(env.PUBLIC_API_URL, ctx.workspaceId);
    try {
      await withRetry(() => stripe.balance.retrieve().catch((e) => { throw toProviderError(e); }));
      // A reconnect must not leave a second endpoint delivering the same events.
      await withRetry(() => removeEndpointsAt(stripe, url).catch((e) => { throw toProviderError(e); }));
      const ep = await withRetry(() =>
        stripe.webhookEndpoints.create({ url, enabled_events: [...WEBHOOK_EVENTS], description: 'Relay CRM payments' }).catch((e) => { throw toProviderError(e); }),
      );
      return { config: { secretKey, webhookEndpointId: ep.id, webhookSecret: ep.secret, webhookUrl: url, events: [...WEBHOOK_EVENTS] }, secretLast4: last4(secretKey) };
    } catch (e) {
      throw toProviderError(e);
    }
  },
  async test(ctx) {
    const key = ctx.config?.secretKey as string | undefined;
    if (!key) throw new ProviderError('Stripe is not connected', false, 'not_connected');
    await withRetry(() => stripeFor(key).balance.retrieve().catch((e) => { throw toProviderError(e); }));
  },
  async disconnect(ctx) {
    const key = ctx.config?.secretKey as string | undefined;
    const id = ctx.config?.webhookEndpointId as string | undefined;
    if (!key || !id) return;
    try {
      await stripeFor(key).webhookEndpoints.del(id);
    } catch (e) {
      const err = toProviderError(e);
      if (err.httpStatus !== 404) throw err;
    }
  },
  describeLimits: () => ({
    summary: 'Collect payments for opportunities through Stripe-hosted Checkout in test mode.',
    can: ['Create a payment link for an opportunity and track paid, failed, expired and refunded states', 'Reflect refunds made in the Stripe dashboard', 'Show the Stripe reference on each payment'],
    cannot: ['Only test-mode keys work; no real money moves', 'Card details are entered on Stripe and never reach or are stored by this platform', 'Payments in unsupported currencies are rejected by Stripe'],
  }),
};
