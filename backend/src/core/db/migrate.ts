import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrlDirect, max: 1 });
const folder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

await migrate(drizzle(pool), { migrationsFolder: folder });
await pool.end();
console.log('migrations applied');
