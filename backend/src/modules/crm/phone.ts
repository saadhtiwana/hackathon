import { badRequest } from '../../core/errors.js';

// Normalizes to E.164. Numbers without a country prefix are treated as Pakistani (+92).
export function normalizePhone(raw: string): string {
  let s = raw.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    if (/^0\d{10}$/.test(s)) s = `+92${s.slice(1)}`;
    else if (/^92\d{10}$/.test(s)) s = `+${s}`;
    else s = `+${s}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(s)) throw badRequest('Phone number is not valid', 'Use international format, for example +923001234567', 'invalid_phone');
  return s;
}
