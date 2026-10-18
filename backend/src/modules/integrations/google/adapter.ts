import { ProviderError } from '../errors.js';
import type { ProviderAdapter } from '../adapter.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy'];

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);

// Each employee connects their own Google account; connect returns the consent URL instead of storing a workspace secret.
export function consentUrl(state: string): string {
  if (!googleConfigured()) throw new ProviderError('Google sign-in is not configured on the server', false, 'not_configured');
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export const googleAdapter: ProviderAdapter = {
  id: 'google_calendar',
  dbProvider: 'google',
  label: 'Google Calendar',
  perUser: true,
  async connect() {
    return { config: {}, secretLast4: null };
  },
  async test() {
    if (!googleConfigured()) throw new ProviderError('Google sign-in is not configured on the server', false, 'not_configured');
  },
  async disconnect() {},
  describeLimits: () => ({
    summary: 'Each employee connects their own Google account to book appointments on their calendar.',
    can: ['Book, move and cancel appointments on an employee calendar', 'Read busy times to avoid double booking'],
    cannot: ['An app in testing status only accepts Google accounts listed as test users', 'Refresh tokens can expire; a revoked connection shows as needing reconnection', 'An employee without a connected calendar cannot be booked'],
  }),
};
