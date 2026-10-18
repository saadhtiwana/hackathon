import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function load(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]!] = m[2]!;
  }
}
const root = resolve(process.cwd(), '..');
load(resolve(root, '.secrets/runtime.env'));
load(resolve(root, '.secrets/keys.env'));
if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || !process.env.ENCRYPTION_KEY || !process.env.PUBLIC_API_URL) {
  console.log('google-links skipped: .secrets/runtime.env must define the deployed DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY and PUBLIC_API_URL');
  process.exit(0);
}

// Usage: npm run link:google -- <mailbox|calendar> [member email prefix, default saad]
const purpose = (process.argv[2] ?? 'mailbox') as 'mailbox' | 'calendar';
const who = process.argv[3] ?? 'saad';
if (purpose !== 'mailbox' && purpose !== 'calendar') {
  console.log('Usage: npm run link:google -- <mailbox|calendar> [member]');
  process.exit(1);
}

const { eq, like } = await import('drizzle-orm');
const { db, pool } = await import('../core/db/client.js');
const { users, workspaces } = await import('../core/db/schema/index.js');
const { makeConnectLink } = await import('../modules/integrations/google/routes.js');

try {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, 'margalla-estates'));
  const [u] = await db.select().from(users).where(like(users.email, `${who}@%`));
  if (!ws || !u) throw new Error('Workspace or member not found');
  const link = await makeConnectLink(ws.id, u.id, purpose);
  console.log(`${purpose} connect link (acts as ${u.name}, valid 24h, single use): ${link.url}`);
} finally {
  await pool.end();
  process.exit(0);
}
