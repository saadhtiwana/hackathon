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
load(resolve(root, '.secrets/runtime.env'));
const hasKeys = load(resolve(root, '.secrets/keys.env'));

const need = ['DISCORD_APP_ID', 'DISCORD_PUBLIC_KEY', 'DISCORD_BOT_TOKEN', 'DISCORD_CUSTOMER_GUILD_ID', 'DISCORD_STAFF_GUILD_ID'];
const missing = need.filter((k) => !process.env[k]);
if (!hasKeys || missing.length) {
  console.log(`connect:discord skipped: missing ${missing.join(', ') || '.secrets/keys.env'}`);
  process.exit(0);
}
if (!process.env.DATABASE_URL || !process.env.ENCRYPTION_KEY || !process.env.PUBLIC_API_URL) {
  console.log('connect:discord skipped: .secrets/runtime.env must define DATABASE_URL, ENCRYPTION_KEY and PUBLIC_API_URL (the deployed API values)');
  process.exit(0);
}
process.env.SESSION_SECRET ??= 'connect-script-session-secret';

const { eq } = await import('drizzle-orm');
const { db, pool } = await import('../core/db/client.js');
const { memberships, roles, workspaces } = await import('../core/db/schema/index.js');
const { connect, listIntegrations } = await import('../modules/integrations/service.js');
const { gateways } = await import('../modules/integrations/discord/gateway.js');

try {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, 'margalla-estates'));
  if (!ws) throw new Error('Workspace margalla-estates not found; run npm run seed first');
  const [owner] = await db.select({ userId: memberships.userId, roleId: memberships.roleId }).from(memberships).innerJoin(roles, eq(roles.id, memberships.roleId)).where(eq(roles.workspaceId, ws.id)).limit(1);
  const actor = { userId: owner!.userId, workspaceId: ws.id, membershipId: '', sessionId: '', roleId: owner!.roleId, baseLevel: 'owner' as const, permissions: new Set<never>(), availability: 'available' as const };
  // The deployed API owns the gateway; this script only registers commands and stores the encrypted connection.
  await gateways.stop(ws.id);
  const e = process.env;
  await connect(actor, 'discord', { appId: e.DISCORD_APP_ID, publicKey: e.DISCORD_PUBLIC_KEY, botToken: e.DISCORD_BOT_TOKEN, customerGuildId: e.DISCORD_CUSTOMER_GUILD_ID, staffGuildId: e.DISCORD_STAFF_GUILD_ID });
  await gateways.stop(ws.id);
  const s = (await listIntegrations(actor)).find((i) => i.provider === 'discord');
  console.log(`connect:discord ok: ${s?.status}, token ${s?.secretMasked}`);
  console.log(`Interactions Endpoint URL: ${process.env.PUBLIC_API_URL}/webhooks/discord/${ws.id}`);
} catch (err) {
  console.error('connect:discord failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
  process.exit(process.exitCode ?? 0);
}
