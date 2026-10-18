import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().optional(),
  SESSION_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64'),
  TICK_KEY: z.string().min(1).optional(),
  SEED_PASSWORD: z.string().min(8).optional(),
  APP_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().default(''),
  PUBLIC_API_URL: z.string().url().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(`Invalid environment: ${names}`);
}

const e = parsed.data;

export const env = {
  ...e,
  DATABASE_URL_DIRECT: e.DATABASE_URL_DIRECT ?? e.DATABASE_URL,
  allowedOrigins: [e.APP_URL, ...e.ALLOWED_ORIGINS.split(',')].map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
  secureCookies: e.APP_URL.startsWith('https://'),
};
