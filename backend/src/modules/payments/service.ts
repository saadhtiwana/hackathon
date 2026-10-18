import { and, desc, eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '../../core/db/client.js';
import { contacts, opportunities, payments, users, workspaces } from '../../core/db/schema/index.js';
import { audit } from '../../core/audit/index.js';
import { activity } from '../../core/activity/index.js';
import { getOr404 } from '../../core/db/scoped.js';
import { env } from '../../core/env.js';
import { AppError, conflict } from '../../core/errors.js';
import { decodeCursor, page } from '../../core/http/list.js';
import { realtime } from '../../core/realtime/index.js';
import { integrationEvents } from '../../core/integration-events/index.js';
import type { AuthContext } from '../../core/auth/context.js';
import { ProviderError, withRetry } from '../integrations/errors.js';
import { markError, markOk, loadConfig } from '../integrations/service.js';
import { stripeAdapter } from '../integrations/stripe/adapter.js';
import { stripeFor, toProviderError } from '../integrations/stripe/client.js';
import { sendToContact } from '../conversations/service.js';

type Payment = typeof payments.$inferSelect;
type Status = Payment['status'];

async function stripeCfg(ws: string) {
  const cfg = await loadConfig(ws, stripeAdapter);
  if (!cfg?.secretKey) throw conflict('Stripe is not connected for this workspace', 'An admin can connect it on the Integrations page', 'stripe_not_connected');
  return cfg as { secretKey: string; webhookSecret: string };
}

export async function createPaymentRequest(a: AuthContext, opportunityId: string, i: { amountCents: number; currency?: string; description?: string }) {
  const ws = a.workspaceId;
  const cfg = await stripeCfg(ws);
  const opp = await getOr404(db, opportunities, ws, opportunityId, 'Opportunity');
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, opp.contactId));
  const currency = (i.currency ?? opp.currency).toUpperCase();

  const payment = await db.transaction(async (tx) => {
    const [p] = await tx.insert(payments).values({ workspaceId: ws, opportunityId: opp.id, contactId: opp.contactId, requestedBy: a.userId, amountCents: i.amountCents, currency, description: i.description ?? opp.name, status: 'requested' }).returning();
    await audit.record(tx, { workspaceId: ws, actorId: a.userId, action: 'payment.requested', targetType: 'payment', targetId: p!.id, after: { amountCents: i.amountCents, currency, opportunityId: opp.id } });
    await activity.record(tx, { workspaceId: ws, entity: { contactId: opp.contactId, opportunityId: opp.id }, type: 'payment', actorId: a.userId, data: { paymentId: p!.id, status: 'requested', amountCents: i.amountCents, currency } });
    return p!;
  });

  const stripe = stripeFor(cfg.secretKey);
  const base = env.APP_URL.replace(/\/$/, '');
  const meta = { workspaceId: ws, paymentId: payment.id, opportunityId: opp.id, contactId: opp.contactId };
  try {
    // Idempotency key = payment id: a retried request cannot create a second session.
    const session = await withRetry(() =>
      stripe.checkout.sessions
        .create(
          {
            mode: 'payment',
            line_items: [{ quantity: 1, price_data: { currency: currency.toLowerCase(), unit_amount: i.amountCents, product_data: { name: opp.name } } }],
            metadata: meta,
            client_reference_id: payment.id,
            payment_intent_data: { metadata: meta },
            customer_email: contact?.email ?? undefined,
            success_url: `${base}/pay/${payment.id}?status=success`,
            cancel_url: `${base}/pay/${payment.id}?status=cancel`,
          },
          { idempotencyKey: payment.id },
        )
        .catch((e) => {
          throw toProviderError(e);
        }),
    );
    const [saved] = await db.update(payments).set({ providerSessionId: session.id, url: session.url, updatedAt: new Date() }).where(eq(payments.id, payment.id)).returning();
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'stripe', type: 'checkout.session.create', externalId: undefined, result: 'ok', ref: session.id });
    await markOk(ws, stripeAdapter);
    realtime.publish(ws, { type: 'payment.updated', ids: { paymentId: payment.id, opportunityId: opp.id, contactId: opp.contactId } });
    return saved!;
  } catch (e) {
    const pe = e instanceof ProviderError ? e : toProviderError(e);
    await db.update(payments).set({ status: 'failed', failureReason: pe.message, updatedAt: new Date() }).where(eq(payments.id, payment.id));
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'stripe', type: 'checkout.session.create', result: 'error', httpStatus: pe.httpStatus, error: pe.message, ref: payment.id });
    if (!pe.temporary) await markError(ws, stripeAdapter, pe.message);
    throw new AppError(pe.temporary ? 503 : 422, pe.code, pe.message, pe.temporary ? 'Stripe is having trouble; try again in a moment' : 'Check the Stripe connection and the amount, then try again');
  }
}

export async function expirePayment(a: AuthContext, id: string) {
  const ws = a.workspaceId;
  const p = await getOr404(db, payments, ws, id, 'Payment');
  if (p.status !== 'requested' || !p.providerSessionId) throw conflict('Only an open payment request can be expired', undefined, 'not_expirable');
  const cfg = await stripeCfg(ws);
  try {
    await withRetry(() => stripeFor(cfg.secretKey).checkout.sessions.expire(p.providerSessionId!).catch((e) => { throw toProviderError(e); }));
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'stripe', type: 'checkout.session.expire', result: 'ok', ref: p.providerSessionId });
  } catch (e) {
    const pe = e instanceof ProviderError ? e : toProviderError(e);
    await integrationEvents.recordOutbound({ workspaceId: ws, provider: 'stripe', type: 'checkout.session.expire', result: 'error', httpStatus: pe.httpStatus, error: pe.message, ref: p.providerSessionId });
    throw new AppError(pe.temporary ? 503 : 422, pe.code, pe.message);
  }
  await applyTransition(ws, p.id, { kind: 'expired' }, a.userId);
  return getPayment(ws, id);
}

type Change = { kind: 'paid'; paymentIntentId?: string | null } | { kind: 'failed'; reason: string } | { kind: 'expired' } | { kind: 'refund'; refundedCents: number };

// Single place payments change state, from webhooks and from our own actions. Safe to call twice with the same change.
export async function applyTransition(ws: string, paymentId: string, change: Change, actorId: string | null = null): Promise<Payment | null> {
  const out = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(and(eq(payments.workspaceId, ws), eq(payments.id, paymentId))).for('update');
    if (!p) return null;
    let patch: Partial<Payment> | null = null;
    const s = p.status;
    if (change.kind === 'paid' && (s === 'requested' || s === 'failed')) patch = { status: 'paid', paidAt: new Date(), failureReason: null, paymentIntentId: change.paymentIntentId ?? p.paymentIntentId };
    else if (change.kind === 'failed' && (s === 'requested' || s === 'failed')) patch = { status: 'failed', failureReason: change.reason };
    else if (change.kind === 'expired' && s === 'requested') patch = { status: 'expired' };
    else if (change.kind === 'refund') {
      if (s === 'requested' || s === 'failed' || s === 'expired') throw new Error('refund arrived before payment confirmation');
      const refunded = Math.min(change.refundedCents, p.amountCents);
      if (refunded !== p.refundedCents) patch = { refundedCents: refunded, status: refunded >= p.amountCents ? 'refunded' : 'partially_refunded' };
    }
    if (!patch) return p;
    const [next] = await tx.update(payments).set({ ...patch, updatedAt: new Date() }).where(eq(payments.id, p.id)).returning();
    await audit.record(tx, { workspaceId: ws, actorId, action: `payment.${next!.status}`, targetType: 'payment', targetId: p.id, before: { status: p.status, refundedCents: p.refundedCents }, after: { status: next!.status, refundedCents: next!.refundedCents, reason: next!.failureReason } });
    await activity.record(tx, { workspaceId: ws, entity: { contactId: p.contactId, opportunityId: p.opportunityId }, type: 'payment', actorId, data: { paymentId: p.id, status: next!.status, amountCents: p.amountCents, refundedCents: next!.refundedCents, currency: p.currency, reason: next!.failureReason } });
    return next!;
  });
  if (out) realtime.publish(ws, { type: 'payment.updated', ids: { paymentId: out.id, opportunityId: out.opportunityId, contactId: out.contactId } });
  return out;
}

export async function findPayment(ws: string, ids: { paymentId?: string | null; sessionId?: string | null; intentId?: string | null }) {
  const conds = [ids.paymentId && /^[0-9a-f-]{36}$/i.test(ids.paymentId) ? eq(payments.id, ids.paymentId) : null, ids.sessionId ? eq(payments.providerSessionId, ids.sessionId) : null, ids.intentId ? eq(payments.paymentIntentId, ids.intentId) : null].filter(Boolean);
  for (const c of conds) {
    const [p] = await db.select().from(payments).where(and(eq(payments.workspaceId, ws), c!)).limit(1);
    if (p) return p;
  }
  return null;
}

// Maps one verified Stripe event onto a payment. Events for other workspaces' payments are ignored.
export async function applyStripeEvent(ws: string, event: Stripe.Event): Promise<void> {
  const obj = event.data.object as unknown as Record<string, any>;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const p = await findPayment(ws, { paymentId: obj.metadata?.paymentId ?? obj.client_reference_id, sessionId: obj.id });
      if (p && obj.payment_status === 'paid') await applyTransition(ws, p.id, { kind: 'paid', paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : null });
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const p = await findPayment(ws, { paymentId: obj.metadata?.paymentId ?? obj.client_reference_id, sessionId: obj.id });
      if (p) await applyTransition(ws, p.id, { kind: 'failed', reason: 'The delayed payment method failed' });
      break;
    }
    case 'payment_intent.payment_failed': {
      const p = await findPayment(ws, { paymentId: obj.metadata?.paymentId, intentId: obj.id });
      const reason = obj.last_payment_error?.message ?? 'The payment was declined';
      if (p) await applyTransition(ws, p.id, { kind: 'failed', reason });
      break;
    }
    case 'checkout.session.expired': {
      const p = await findPayment(ws, { paymentId: obj.metadata?.paymentId ?? obj.client_reference_id, sessionId: obj.id });
      if (p) await applyTransition(ws, p.id, { kind: 'expired' });
      break;
    }
    case 'charge.refunded': {
      const p = await findPayment(ws, { paymentId: obj.metadata?.paymentId, intentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : null });
      if (p) await applyTransition(ws, p.id, { kind: 'refund', refundedCents: Number(obj.amount_refunded ?? 0) });
      break;
    }
    default:
      break;
  }
}

export interface PaymentFilters { limit: number; cursor?: string; status?: Status; opportunityId?: string; contactId?: string }

export async function listPayments(ws: string, f: PaymentFilters) {
  const offset = decodeCursor(f.cursor);
  const where = and(eq(payments.workspaceId, ws), f.status ? eq(payments.status, f.status) : undefined, f.opportunityId ? eq(payments.opportunityId, f.opportunityId) : undefined, f.contactId ? eq(payments.contactId, f.contactId) : undefined);
  const rows = await db
    .select({ id: payments.id, status: payments.status, amountCents: payments.amountCents, refundedCents: payments.refundedCents, currency: payments.currency, url: payments.url, failureReason: payments.failureReason, opportunityId: payments.opportunityId, opportunityName: opportunities.name, contactId: payments.contactId, contactName: contacts.name, requestedBy: payments.requestedBy, requestedByName: users.name, createdAt: payments.createdAt, paidAt: payments.paidAt })
    .from(payments)
    .innerJoin(contacts, eq(contacts.id, payments.contactId))
    .leftJoin(opportunities, eq(opportunities.id, payments.opportunityId))
    .leftJoin(users, eq(users.id, payments.requestedBy))
    .where(where)
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(f.limit + 1)
    .offset(offset);
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(payments).where(where)) as [{ n: number }];
  return page(rows, f.limit, offset, n);
}

export async function getPayment(ws: string, id: string) {
  const p = await getOr404(db, payments, ws, id, 'Payment');
  const [opp] = p.opportunityId ? await db.select({ id: opportunities.id, name: opportunities.name }).from(opportunities).where(eq(opportunities.id, p.opportunityId)) : [];
  const [contact] = await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email }).from(contacts).where(eq(contacts.id, p.contactId));
  const [requester] = p.requestedBy ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, p.requestedBy)) : [];
  const { providerSessionId, paymentIntentId, ...rest } = p;
  return { payment: rest, opportunity: opp ?? null, contact: contact ?? null, requestedBy: requester ?? null, providerRef: { provider: 'stripe', sessionId: providerSessionId, paymentIntentId } };
}


// Emails the Checkout link to the customer from the agency mailbox (I2.1).
export async function sendPaymentLink(a: AuthContext, id: string) {
  const p = await getOr404(db, payments, a.workspaceId, id, 'Payment');
  if (p.status !== 'requested' || !p.url) throw conflict('Only an open payment request with a link can be sent', undefined, 'not_sendable');
  const amount = `${(p.amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${p.currency}`;
  const message = await sendToContact(a, p.contactId, `Payment request for ${amount}${p.description ? ` (${p.description})` : ''}.\n\nPay securely here: ${p.url}`, 'email');
  await activity.record(db, { workspaceId: a.workspaceId, entity: { contactId: p.contactId, opportunityId: p.opportunityId }, type: 'payment', actorId: a.userId, data: { paymentId: p.id, event: 'link_sent', channel: 'email', messageId: message.id } });
  return { message };
}

// Public receipt page data: only what a customer needs, found by the unguessable payment id.
export async function publicPayment(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db
    .select({ id: payments.id, status: payments.status, amountCents: payments.amountCents, currency: payments.currency, url: payments.url, workspaceName: workspaces.name })
    .from(payments)
    .innerJoin(workspaces, eq(workspaces.id, payments.workspaceId))
    .where(eq(payments.id, id));
  if (!r) return null;
  return { reference: r.id.slice(0, 8).toUpperCase(), status: r.status, amountCents: r.amountCents, currency: r.currency, workspaceName: r.workspaceName, checkoutUrl: r.status === 'requested' ? r.url : null };
}
