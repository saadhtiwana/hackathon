import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseUrlDirect: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '',
};
