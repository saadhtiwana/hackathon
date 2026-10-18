import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Sends a valid, a forged and a duplicate signed request to the inbound email webhook and prints the results.
for (const f of ['.secrets/runtime.env']) {
  const p = resolve(process.cwd(), '..', f);
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m) process.env[m[1]!] = m[2]!; }
}
const { SESSION_SECRET, PUBLIC_API_URL, DATABASE_URL } = process.env;
if (!SESSION_SECRET || !PUBLIC_API_URL || !DATABASE_URL) {
  console.log('test:email-webhook skipped: .secrets/runtime.env must define SESSION_SECRET, PUBLIC_API_URL and DATABASE_URL');
  process.exit(0);
}
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64');
const { pool } = await import('../core/db/client.js');
const { signEmailWebhook } = await import('../modules/integrations/email-webhook.js');
const [ws] = (await pool.query(`select id from workspaces where slug='margalla-estates'`)).rows;
await pool.end();
const url = `${PUBLIC_API_URL}/webhooks/email/${ws.id}`;
const id = `test-${Date.now()}`;
// A no-reply sender is recorded and skipped, so the test leaves no lead behind.
const body = JSON.stringify({ id, from: 'noreply-webhook-test@example.com', subject: 'Webhook test', text: 'hello' });
const send = async (label: string, ts: number, sig: string) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-relay-timestamp': String(ts), 'x-relay-signature': sig }, body });
  console.log(label.padEnd(22), r.status, await r.text());
};
const now = Math.floor(Date.now() / 1000);
await send('valid', now, signEmailWebhook(ws.id, now, body));
await send('duplicate (same id)', now, signEmailWebhook(ws.id, now, body));
await send('forged signature', now, createHmac('sha256', 'wrong').update(`${now}.${body}`).digest('hex'));
await send('stale timestamp', now - 3600, signEmailWebhook(ws.id, now - 3600, body));
process.exit(0);
