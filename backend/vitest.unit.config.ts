import { defineConfig } from 'vitest/config';

const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;

// An explicit allowlist keeps database/HTTP tests out, regardless of environment flags.
export default defineConfig({
  test: {
    // Keep unit settings independent of the DB config's callback and env loading.
    // These are the original unit environment and timeout settings.
    environment: 'node',
    testTimeout: 30_000,
    include: ['tests/domain.test.ts', 'tests/unit/**/*.test.ts'],
    reporters: ['default', 'json'],
    outputFile: { json: './test-results/unit-runs/' + runId + '/results.json' },
    coverage: {
      provider: 'v8',
      include: ['src/domain/pricing.ts', 'src/domain/shop.ts', 'src/domain/errors.ts'],
      reporter: ['text', 'json-summary', 'json', 'html'],
      // Each default run has its own directory; historical reports stay untouched.
      reportsDirectory: './coverage/unit-runs/' + runId,
      clean: false,
    },
  },
});
