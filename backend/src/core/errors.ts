import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public hint?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, hint?: string, code = 'bad_request') => new AppError(400, code, message, hint);
export const unauthorized = (message = 'Sign in to continue', hint?: string) => new AppError(401, 'unauthorized', message, hint);
export const forbidden = (message = 'You do not have permission to do this', hint?: string) => new AppError(403, 'forbidden', message, hint);
export const notFound = (what = 'Record') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, hint?: string, code = 'conflict', extra?: Record<string, unknown>) => new AppError(409, code, message, hint, extra);
export const unprocessable = (message: string, hint?: string, code = 'unprocessable', extra?: Record<string, unknown>) => new AppError(422, code, message, hint, extra);
export const tooMany = (message: string, hint?: string) => new AppError(429, 'too_many_requests', message, hint);

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const errorMiddleware: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of err.issues) fields[i.path.join('.') || '_'] = i.message;
    res.status(400).json({ error: { code: 'validation_failed', message: 'Some fields are invalid', hint: 'Fix the highlighted fields and try again', fields } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, hint: err.hint, ...err.extra } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON', hint: 'Send a JSON object' } });
    return;
  }
  logger.error('unhandled error', { requestId: req.id, path: req.path, err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on our side', hint: 'Try again; if it keeps happening, share the request id', requestId: req.id } });
};
