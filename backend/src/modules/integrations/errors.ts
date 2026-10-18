export class ProviderError extends Error {
  constructor(
    message: string,
    public temporary: boolean,
    public code = 'provider_error',
    public httpStatus?: number,
  ) {
    super(message);
  }
}

// Network failures, 5xx and 429 are temporary; everything else needs a human and is shown with a plain explanation.
export function classify(status: number | undefined, fallback: string): ProviderError {
  if (status === undefined) return new ProviderError(`Could not reach the provider: ${fallback}`, true, 'unreachable');
  if (status === 429) return new ProviderError('The provider is rate limiting requests; try again shortly', true, 'rate_limited', status);
  if (status >= 500) return new ProviderError(`The provider had a temporary problem (${status})`, true, 'provider_unavailable', status);
  if (status === 401 || status === 403) return new ProviderError('The provider rejected the credentials; reconnect with a valid key', false, 'auth_failed', status);
  return new ProviderError(fallback, false, 'rejected', status);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retries temporary failures with exponential backoff. Callers must pass idempotent operations.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 400): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof ProviderError) || !e.temporary || i === attempts - 1) throw e;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw last;
}
