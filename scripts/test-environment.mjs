// Pure validation: never opens a socket or prints environment values.
export function validateTestEnvironment(env, action) {
  const fail = message => { throw new Error(message); };
  if (env.TEST_DATABASE_CONFIRMED !== 'true') fail('BLOCKED: the owner must confirm a disposable test database first.');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { fail('BLOCKED: supply a new DATABASE_URL privately in .env.e2e.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password) {
    fail('BLOCKED: DATABASE_URL must be an authenticated PostgreSQL URL.');
  }
  if (/REPLACE|YOUR_|<|>/i.test(env.DATABASE_URL)) fail('BLOCKED: database placeholders have not been replaced.');
  let database, user;
  try { database = decodeURIComponent(url.pathname.slice(1)); user = decodeURIComponent(url.username); } catch { fail('BLOCKED: invalid encoded database name or user.'); }
  if (!env.TEST_DATABASE_HOST || !env.TEST_DATABASE_PORT || !env.TEST_DATABASE_NAME || !env.TEST_DATABASE_USER ||
      url.hostname.toLowerCase() !== env.TEST_DATABASE_HOST.toLowerCase() || (url.port || '5432') !== env.TEST_DATABASE_PORT ||
      database !== env.TEST_DATABASE_NAME || user !== env.TEST_DATABASE_USER) {
    fail('BLOCKED: connection target differs from the independently confirmed host/port/database/user.');
  }
  // pg permits query options to override connection fields; accept none here.
  if (url.search || url.hash) fail('BLOCKED: use a database URL without query overrides or fragments.');
  if (env.NODE_ENV !== 'test' || env.RUN_DB_TESTS !== 'true') fail('BLOCKED: NODE_ENV=test and RUN_DB_TESTS=true are required; skipped DB suites are not a pass.');
  if (!env.SEED_PASSWORD || env.SEED_PASSWORD.length < 8 || /REPLACE|YOUR_/i.test(env.SEED_PASSWORD)) fail('BLOCKED: provide a new test-account password (at least 8 characters).');
  if (env.DATABASE_SSL !== 'true') fail('BLOCKED: this runner requires DATABASE_SSL=true.');
  if (action !== 'http') {
    if (env.ALLOW_TEST_RESET !== 'true' || env.E2E_ALLOW_RESET !== 'true') fail('BLOCKED: explicit reset authorization flags are required for setup/integration/E2E.');
    if (!env.TEST_RESET_KEY || env.TEST_RESET_KEY.length < 24 || /REPLACE|YOUR_/i.test(env.TEST_RESET_KEY)) fail('BLOCKED: provide a new reset key (at least 24 characters).');
  }
  if (env.E2E_EXTERNAL_SERVERS === 'true' || env.E2E_CHROMIUM_PATH) fail('BLOCKED: use managed local servers and the bundled Chromium for this test run.');
  if ((env.PORT && env.PORT !== '4000') || env.VITE_API_ORIGIN) fail('BLOCKED: E2E requires backend port 4000 and the local frontend proxy.');
  return { hostname: url.hostname, database };
}
