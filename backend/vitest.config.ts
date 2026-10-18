import { defineConfig } from 'vitest/config';

export default defineConfig({
  // API tests talk to a hosted Postgres, so each request costs real round trips.
  test: { include: ['src/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
});
