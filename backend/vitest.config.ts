import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Long scenarios make 30+ sequential API calls; with a remote database each call can take 1s or more.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Load backend/.env (DATABASE_URL, SEED_PASSWORD, TEST_RESET_KEY ...) into the test workers.
    // Variables already set in the shell take precedence over the file.
    env: { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>,
    // The DB-backed suites share one database and reset it, so files must not run in parallel.
    fileParallelism: false,
  },
}));
