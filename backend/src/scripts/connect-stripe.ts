import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Loads KEY=value files into process.env; later files win. Runs before any app module reads the environment.
function load(file: string) {
  if (!existsSync(file)) return false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]!] = m[2]!;
  }
  return true;
}

const root = resolve(process.cwd(), '..');
load(resolve(root, '.secrets/runtime.env')); // deployed API settings: database, ENCRYPTION_KEY, PUBLIC_API_URL
const hasKeys = load(resolve(root, '.secrets/keys.env'));

if (!hasKeys || !process.env.STRIPE_SECRET_KEY) {
  console.log('connect:stripe skipped: STRIPE_SECRET_KEY is not in .secrets/keys.env');
  process.exit(0);
}
if (!process.env.DATABASE_URL || !process.env.ENCRYPTION_KEY || !process.env.PUBLIC_API_URL) {
  console.log('connect:stripe skipped: .secrets/runtime.env must define DATABASE_URL, ENCRYPTION_KEY and PUBLIC_API_URL (the deployed API values)');
  process.exit(0);
}
process.env.SESSION_SECRET ??= 'connect-script-session-secret';

const { eq } = await import('drizzle-orm');
const { db, pool } = await import('../core/db/client.js');
const { memberships, roles, workspaces } = await import('../core/db/schema/index.js');
const { connect, listIntegrations } = await import('../modules/integrations/service.js');

try {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, 'margalla-estates'));
  if (!ws) throw new Error('Workspace margalla-estates not found; run npm run seed first');
  const [owner] = await db
    .select({ userId: memberships.userId, roleId: memberships.roleId })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(eq(roles.workspaceId, ws.id))
    .limit(1);
  const actor = { userId: owner!.userId, workspaceId: ws.id, membershipId: '', sessionId: '', roleId: owner!.roleId, baseLevel: 'owner' as const, permissions: new Set<never>(), availability: 'available' as const };
  await connect(actor, 'stripe', { secretKey: process.env.STRIPE_SECRET_KEY });
  const s = (await listIntegrations(actor)).find((i) => i.provider === 'stripe');
  console.log(`connect:stripe ok: ${s?.status}, key ${s?.secretMasked}, webhook ${process.env.PUBLIC_API_URL}/webhooks/stripe/${ws.id}`);
} catch (e) {
  console.error('connect:stripe failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
