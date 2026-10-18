import type { RequestHandler } from 'express';
import { env } from '../env.js';
import { forbidden } from '../errors.js';
import { readCookie, COOKIE } from '../auth/sessions.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// Mounted on /api only. Webhooks, /internal and /realtime are outside it and authenticate by signature, key or ticket.
export const originCheck: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method) || req.path.startsWith('/public/')) return next();
  const origin = req.header('origin') ?? originOf(req.header('referer'));
  if (origin) {
    if (env.allowedOrigins.includes(origin.replace(/\/$/, ''))) return next();
    return next(forbidden('Request origin is not allowed', 'Use the official web app'));
  }
  // No Origin header: browsers always send one on cross-site writes, so this is a non-browser client. Only cookie-less calls pass.
  if (readCookie(req, COOKIE)) return next(forbidden('Missing Origin header', 'State-changing requests with a session must come from the web app'));
  next();
};

function originOf(referer?: string): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
