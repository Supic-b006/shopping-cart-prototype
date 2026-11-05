import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTestEnvironment } from './test-environment.mjs';

// Synthetic credentials on the reserved .invalid domain; no connections occur.
const valid = () => ({
  DATABASE_URL: 'postgresql://fixture:synthetic-only@db.invalid:5432/test_db',
  TEST_DATABASE_HOST: 'db.invalid', TEST_DATABASE_PORT: '5432', TEST_DATABASE_NAME: 'test_db', TEST_DATABASE_USER: 'fixture', TEST_DATABASE_CONFIRMED: 'true',
  DATABASE_SSL: 'true', NODE_ENV: 'test', RUN_DB_TESTS: 'true',
  SEED_PASSWORD: 'synthetic-account-password', TEST_RESET_KEY: 'synthetic-reset-key-not-a-real-secret',
  ALLOW_TEST_RESET: 'true', E2E_ALLOW_RESET: 'true', PORT: '4000', VITE_API_ORIGIN: '',
});
test('accepts a confirmed exact test target without making a connection', () => {
  assert.deepEqual(validateTestEnvironment(valid(), 'integration'), { hostname: 'db.invalid', database: 'test_db' });
});
test('rejects missing owner confirmation', () => {
  assert.throws(() => validateTestEnvironment({ ...valid(), TEST_DATABASE_CONFIRMED: 'false' }, 'integration'), /owner must confirm/);
});
test('rejects a different host even if the database name matches', () => {
  assert.throws(() => validateTestEnvironment({ ...valid(), TEST_DATABASE_HOST: 'other.invalid' }, 'integration'), /target differs/);
});
test('rejects a different database even if the host matches', () => {
  assert.throws(() => validateTestEnvironment({ ...valid(), TEST_DATABASE_NAME: 'other_db' }, 'integration'), /target differs/);
});
test('rejects a different service port on the same host', () => {
  assert.throws(() => validateTestEnvironment({ ...valid(), TEST_DATABASE_PORT: '6543' }, 'integration'), /target differs/);
});
test('rejects URL query overrides that pg could use to change target or TLS', () => {
  for (const suffix of ['?host=other.invalid', '?sslmode=no-verify', '#fragment']) {
    assert.throws(() => validateTestEnvironment({ ...valid(), DATABASE_URL: valid().DATABASE_URL + suffix }, 'integration'), /query overrides/);
  }
});
test('rejects a different project user on a shared pooler host/database', () => {
  assert.throws(() => validateTestEnvironment({ ...valid(), TEST_DATABASE_USER: 'other-project-user' }, 'integration'), /target differs/);
});
test('does not expose malformed URL text in validation errors', () => {
  const secret = 'malformed-sensitive-value';
  assert.throws(() => validateTestEnvironment({ ...valid(), DATABASE_URL: secret }, 'integration'), error => {
    assert.ok(!error.message.includes(secret)); return true;
  });
});
test('rejects disabled DB suites instead of accepting a skipped run', () => {
  assert.throws(() => validateTestEnvironment({ ...valid(), RUN_DB_TESTS: 'false' }, 'http'), /skipped DB suites/);
});
test('reset-capable commands require explicit reset flags', () => {
  for (const action of ['migrate', 'seed', 'integration', 'e2e']) {
    assert.throws(() => validateTestEnvironment({ ...valid(), ALLOW_TEST_RESET: 'false' }, action), /reset authorization/);
  }
});
test('HTTP smoke can run without reset authorization', () => {
  assert.doesNotThrow(() => validateTestEnvironment({ ...valid(), ALLOW_TEST_RESET: 'false', E2E_ALLOW_RESET: 'false', TEST_RESET_KEY: '' }, 'http'));
});
test('requires real inputs instead of placeholders and short keys', () => {
  assert.throws(() => validateTestEnvironment({ ...valid(), SEED_PASSWORD: 'REPLACE_ME' }, 'integration'), /test-account password/);
  assert.throws(() => validateTestEnvironment({ ...valid(), TEST_RESET_KEY: 'short' }, 'integration'), /reset key/);
});
test('rejects remote frontend overrides and unmanaged services', () => {
  assert.throws(() => validateTestEnvironment({ ...valid(), VITE_API_ORIGIN: 'https://other.invalid' }, 'e2e'), /local frontend proxy/);
  assert.throws(() => validateTestEnvironment({ ...valid(), E2E_EXTERNAL_SERVERS: 'true' }, 'e2e'), /managed local servers/);
});
test('requires the TLS flag without claiming certificate verification', () => {
  assert.throws(() => validateTestEnvironment({ ...valid(), DATABASE_SSL: 'false' }, 'integration'), /DATABASE_SSL=true/);
});
