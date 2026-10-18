import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

type Fields = Record<string, unknown>;

function line(level: string, msg: string, fields?: Fields) {
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields }));
}

export const logger = {
  info: (msg: string, f?: Fields) => line('info', msg, f),
  warn: (msg: string, f?: Fields) => line('warn', msg, f),
  error: (msg: string, f?: Fields) => line('error', msg, f),
};

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl === '/health') return;
    logger.info('request', { requestId: req.id, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Date.now() - start });
  });
  next();
};
