import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../errors.js';
import type { Permission } from './permissions.js';

export * from './permissions.js';

export function can(req: Request, p: Permission): boolean {
  return !!req.auth?.permissions.has(p);
}

// Requires every listed permission.
export const requirePermission =
  (...needed: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized('Sign in to continue'));
    const missing = needed.filter((p) => !req.auth!.permissions.has(p));
    if (missing.length) return next(forbidden('You do not have permission to do this', `Ask an admin for: ${missing.join(', ')}`));
    next();
  };

export const requireAnyPermission =
  (...any: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized('Sign in to continue'));
    if (!any.some((p) => req.auth!.permissions.has(p))) return next(forbidden('You do not have permission to do this', `Ask an admin for one of: ${any.join(', ')}`));
    next();
  };

export const requireBaseLevel =
  (...levels: Array<'owner' | 'admin' | 'user'>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized('Sign in to continue'));
    if (!levels.includes(req.auth.baseLevel)) return next(forbidden('Only an admin or the owner can do this'));
    next();
  };

const VALUE_KEYS = new Set(['valueCents', 'value_cents', 'pipelineValueCents']);

// Removes money fields from any response shape for users without crm.view_values (F1.4).
export function maskValues<T>(data: T, canSee: boolean): T {
  if (canSee) return data;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Date || v === null || typeof v !== 'object') return v;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (!VALUE_KEYS.has(k)) out[k] = walk(val);
    return out;
  };
  return walk(data) as T;
}
