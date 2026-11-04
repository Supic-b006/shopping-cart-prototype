import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;

// An explicit allowlist keeps database/HTTP tests out, regardless of environment flags.
export default defineConfig({
  test: {
    ...base.test,
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