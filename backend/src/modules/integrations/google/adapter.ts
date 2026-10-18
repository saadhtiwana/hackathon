import { ProviderError } from '../errors.js';
import type { ProviderAdapter } from '../adapter.js';
import { googleConfigured } from './oauth.js';
import { profile } from './gmail.js';
import { accessToken, mailboxStore, userCalendarStore } from './tokens.js';
import { revokeToken } from './oauth.js';

export { googleConfigured };

// Each employee connects their own Google account; connect returns the consent URL instead of storing a workspace secret.
export const googleAdapter: ProviderAdapter = {
  id: 'google_calendar',
  dbProvider: 'google',
  label: 'Google Calendar',
  perUser: true,
  oauthPurpose: 'calendar',
  async connect() {
    return { config: {}, secretLast4: null };
  },
  async test(ctx) {
    if (!googleConfigured()) throw new ProviderError('Google sign-in is not configured on the server', false, 'not_configured');
    if (ctx.actorId) await accessToken(userCalendarStore(ctx.workspaceId, ctx.actorId));
  },
  async disconnect() {},
  describeLimits: () => ({
    summary: 'Each employee connects their own Google account to book appointments on their calendar.',
    can: ['Book, move and cancel appointments on an employee calendar', 'Read busy times to avoid double booking', 'Show which employees have a working calendar connection'],
    cannot: ['The Google app is in Testing mode: only Google accounts listed as test users can connect', 'Refresh tokens may expire after 7 days in Testing mode; an expired connection shows as needing reconnection', 'An employee without a connected calendar cannot be booked'],
  }),
};

// Messaging channel: customers write to the agency plus-address on the connected Gmail account.
export const emailAdapter: ProviderAdapter = {
  id: 'email',
  dbProvider: 'gmail',
  label: 'Email (Gmail): messaging',
  oauthPurpose: 'mailbox',
  async connect() {
    return { config: {}, secretLast4: null };
  },
  async test(ctx) {
    const store = mailboxStore(ctx.workspaceId);
    await profile(store);
    await store.markOk();
  },
  async disconnect(ctx) {
    const t = ctx.config as { refreshToken?: string } | null;
    if (t?.refreshToken) await revokeToken(t.refreshToken);
  },
  describeLimits: () => ({
    summary: 'Customers email the agency address; replies are sent from the connected Gmail account in the same thread.',
    can: ['Turn emails sent to the agency address into contacts and leads (source: Email)', 'Reply in the same email thread from the platform, with replies coming back to the agency address', 'Email a payment link to a customer', 'Stop messaging a contact who replies STOP'],
    cannot: [
      'Only mail delivered to the agency address is read; the rest of the mailbox, newsletters, no-reply senders and automatic mail are ignored',
      'Gmail is polled every 30 seconds, so a new email can take up to half a minute to appear; the signed webhook (POST /webhooks/email/<workspace id>, HMAC-SHA256) accepts forwarded mail and rejects forged or replayed requests',
      'Email shows sent or failed only, with no delivery or read receipts',
      'Twilio blocks Pakistani signups (error 0x07) and Telegram is blocked in Pakistan, so WhatsApp, SMS and Telegram are not used',
      'The Google app is in Testing mode: only listed test users can connect, and refresh tokens may expire after 7 days',
    ],
  }),
};

// Notifications channel: same mailbox, shown separately so admins can see alert delivery on its own.
export const emailAlertsAdapter: ProviderAdapter = {
  ...emailAdapter,
  id: 'email_alerts',
  label: 'Email alerts: notifications',
  describeLimits: () => ({
    summary: 'When a lead escalates or is assigned, the new owner is emailed from the agency mailbox.',
    can: ['Email the new owner with the lead, its source, the escalation reason, the level and a link', 'Use each employee\'s own alert address, defaulting to their account email', 'Retry a failed alert up to 5 times and show failures to admins'],
    cannot: ['Alerts need the agency mailbox to be connected', 'An employee can turn escalation alerts off in their notification settings', 'Alerts arrive as email, so they are as fast as the recipient\'s mail app'],
  }),
};
