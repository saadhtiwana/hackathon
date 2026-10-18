import { Algorithm, hash, verify } from '@node-rs/argon2';

const opts = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, opts);

// Verifies against a dummy hash when the user is unknown so timing does not reveal account existence.
let dummy: Promise<string> | undefined;
export async function verifyPassword(stored: string | null, pw: string): Promise<boolean> {
  if (!stored) {
    dummy ??= hashPassword('not-a-real-password');
    await verify(await dummy, pw).catch(() => false);
    return false;
  }
  return verify(stored, pw).catch(() => false);
}
