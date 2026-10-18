import { env } from './env.js';

export const config = {
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  databaseUrlDirect: env.DATABASE_URL_DIRECT,
};
