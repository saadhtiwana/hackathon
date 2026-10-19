// Gives every user a new random 20-character password and signs everyone out.
// Usage, from backend/:  DATABASE_URL=... npx tsx scripts/rotate-passwords.ts   (or keep DATABASE_URL in backend/.env)
// The new passwords are written only to ../.secrets/new-passwords.txt (git-ignored, mode 600). Nothing secret is printed.
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword } from '../src/core/auth/password.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_!@#%';

function newPassword(length = 20) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const outFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.secrets/new-passwords.txt');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const lines: string[] = [];
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: string; email: string; name: string }>('select id, email, name from users order by email for update');
    for (const u of rows) {
      const pw = newPassword();
      await client.query('update users set password_hash = $1 where id = $2', [await hashPassword(pw), u.id]);
      lines.push(`${u.email}\t${u.name}\t${pw}`);
    }
    const sessions = await client.query('delete from sessions');
    // Write the file before committing so a crash cannot leave passwords nobody knows.
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `# Rotated ${new Date().toISOString()}\n# email\tname\tpassword\n${lines.join('\n')}\n`, { mode: 0o600 });
    await client.query('commit');
    console.log(`rotated ${rows.length} passwords, removed ${sessions.rowCount ?? 0} sessions`);
    console.log(`new passwords written to ${outFile}`);
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('rotate-passwords failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
