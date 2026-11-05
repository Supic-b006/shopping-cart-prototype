import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'dotenv';
import { validateTestEnvironment } from './test-environment.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const action = process.argv[2];
const envFile = path.join(root, '.env.e2e');
const browserPath = path.join(root, '.playwright-browsers');
const node = process.execPath;
function execute(args, cwd, env) {
  const child = spawnSync(node, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  if (child.error || child.signal || child.status !== 0) throw new Error('Command failed; inspect local output and preserve evidence.');
}
try {
  if (!['init', 'browsers', 'check', 'migrate', 'seed', 'integration', 'http', 'e2e'].includes(action)) throw new Error('Unknown runtime action.');
  if (action === 'init') {
    if (existsSync(envFile)) console.log('.env.e2e already exists; left unchanged.');
    else {
      copyFileSync(path.join(root, '.env.e2e.example'), envFile, constants.COPYFILE_EXCL);
      console.log('Created ignored .env.e2e with empty secrets and disabled authorization flags.');
    }
  } else if (action === 'browsers') {
    execute([path.join(root, 'node_modules/playwright/cli.js'), 'install', 'chromium', 'ffmpeg'], root,
      { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserPath });
  } else {
    if (!existsSync(envFile)) throw new Error('BLOCKED: run npm run test:env:init and have the owner configure .env.e2e privately.');
    const values = parse(readFileSync(envFile));
    // Validate placeholders and the independently confirmed host/port/database/user.
    // Examples are documentation, not a credential denylist. Revocation of any
    // credential previously exposed in Git must be handled by its owner.
    validateTestEnvironment(values, action);
    if (values.DATABASE_CA_FILE && (!path.isAbsolute(values.DATABASE_CA_FILE) || !existsSync(values.DATABASE_CA_FILE))) {
      throw new Error('BLOCKED: DATABASE_CA_FILE must be an existing absolute path.');
    }
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('BLOCKED: remove the inherited TLS verification bypass.');
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^(PG|DATABASE_|TEST_DATABASE_|SEED_|TEST_RESET_|RUN_DB_TESTS|ALLOW_TEST_RESET|E2E_|VITE_API_ORIGIN)/i.test(key)) delete env[key];
    }
    Object.assign(env, values, { PLAYWRIGHT_BROWSERS_PATH: browserPath, PLAYWRIGHT_HTML_OPEN: 'never',
      PORT: '4000', VITE_API_ORIGIN: '', E2E_EXTERNAL_SERVERS: 'false', E2E_CHROMIUM_PATH: '' });
    if (action === 'http') env.ALLOW_TEST_RESET = 'false';
    if (action === 'check') {
      console.log('Offline environment validation passed. No connection was made; owner confirmation and credential freshness must also be verified.');
    } else {
      const run = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
      const output = path.join(root, 'test-results', 'runtime', run);
      mkdirSync(output, { recursive: true });
      const report = path.join(output, `${action}.json`);
      const gitArgs = ['-c', `safe.directory=${root.replaceAll('\\', '/')}`];
      const head = spawnSync('git', [...gitArgs, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
      const status = spawnSync('git', [...gitArgs, '--no-optional-locks', 'status', '--porcelain=v1'], { cwd: root, encoding: 'utf8', windowsHide: true });
      writeFileSync(path.join(output, 'run.json'), JSON.stringify({ action, run, cwd: root, started: new Date().toISOString(),
        gitHead: head.status === 0 ? head.stdout.trim() : null,
        workingTreeClean: status.status === 0 ? status.stdout.trim() === '' : null,
        source: head.status === 0 ? 'Git checkout' : 'ZIP or directory without Git metadata' }, null, 2));
      if (action === 'migrate' || action === 'seed') {
        execute(['--import', 'tsx', path.join(root, 'backend/src/db/manage.ts'), action], root, env);
      } else if (action === 'e2e') {
        env.PLAYWRIGHT_JSON_OUTPUT_NAME = report;
        env.PLAYWRIGHT_HTML_OUTPUT_DIR = path.join(output, 'html');
        execute([path.join(root, 'node_modules/playwright/cli.js'), 'test', '--project=chromium', '--workers=1', '--retries=0',
          '--reporter=list,html,json', `--output=${path.join(output, 'artifacts')}`], root, env);
        const result = JSON.parse(readFileSync(report, 'utf8'));
        if (result.stats.expected !== 29 || result.stats.unexpected || result.stats.skipped || result.stats.flaky) {
          throw new Error('E2E did not execute all 29 cases successfully without skips/retries.');
        }
      } else {
        execute([path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', `tests/${action === 'http' ? 'http' : 'integration'}.test.ts`,
          '--reporter=default', '--reporter=json', `--outputFile=${report}`], path.join(root, 'backend'), env);
        const result = JSON.parse(readFileSync(report, 'utf8'));
        const expected = action === 'http' ? 1 : 133;
        if (result.numPassedTests !== expected || result.numFailedTests || result.numPendingTests || result.numTodoTests || result.numTotalTests !== expected) {
          throw new Error(`The ${action} suite did not execute all ${expected} cases successfully without skips.`);
        }
      }
      console.log(`Completed ${action}. Evidence: ${output}`);
    }
  }
} catch (error) {
  // Only our generic validation/runtime errors are printed here, never env values.
  console.error(error instanceof Error && /^(BLOCKED:|Command failed|Unknown runtime|E2E did not|The (http|integration) suite)/.test(error.message)
    ? error.message : 'Runtime preparation failed. Check file paths and configuration without printing secrets.');
  process.exitCode = 1;
}
