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

// The agency mailbox is the messaging channel: Twilio blocks Pakistani signups, so customers write to and hear from one Gmail account.
export const emailAdapter: ProviderAdapter = {
  id: 'email',
  dbProvider: 'gmail',
  label: 'Email (agency Gmail)',
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
    summary: 'Customer messages and escalation alerts use the agency Gmail account.',
    can: ['Turn incoming emails into contacts and leads', 'Reply in the same email thread from the platform', 'Email employees when a lead escalates', 'Email a payment link to a customer'],
    cannot: [
      'Twilio blocks Pakistani signups, so messaging uses the agency Gmail account instead of WhatsApp or SMS',
      'The inbox is checked every 30 seconds; there is no instant push, so replies can take up to half a minute to appear',
      'Email shows sent or failed only, with no delivery or read receipts',
      'The Google app is in Testing mode: only listed test users can connect, and refresh tokens may expire after 7 days',
    ],
  }),
};
