const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const options = new Map();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check') continue;
  if (!['--results', '--out'].includes(args[i]) || !args[i + 1]) {
    throw new Error('Usage: node .unit-testing/generate-traceability.cjs --results <JSON> --out <new CSV> [--check]');
  }
  if (options.has(args[i])) throw new Error('Duplicate option: ' + args[i]);
  options.set(args[i], args[++i]);
}
function inside(relative) {
  if (!relative) throw new Error('--results and --out are required; evidence is never overwritten');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep)) throw new Error('Path must stay inside repository');
  return resolved;
}
const resultPath = inside(options.get('--results'));
const outputPath = inside(options.get('--out'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'docs/UNIT-TEST-METADATA.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
const key = (file, name) => file + '\0' + name;
const actual = new Map();
for (const file of report.testResults) {
  const relative = path.relative(root, file.name).replaceAll('\\', '/');
  if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Run results in this checkout before generating traceability');
  for (const test of file.assertionResults) {
    const selector = key(relative, test.fullName);
    if (actual.has(selector)) throw new Error('Duplicate executed test selector');
    actual.set(selector, test);
  }
}
const seenIds = new Set();
const seenSelectors = new Set();
const rows = [];
const classifications = { 'specification-confirmed': 0, 'api-contract-only': 0, provisional: 0, 'pending clarification': 0 };
const statuses = {};
for (const entry of registry.cases) {
  if (seenIds.has(entry.id)) throw new Error('Duplicate permanent ID: ' + entry.id);
  seenIds.add(entry.id);
  const selector = key(entry.file, entry.full_name);
  if (seenSelectors.has(selector)) throw new Error('Duplicate registry selector: ' + entry.id);
  seenSelectors.add(selector);
  const test = actual.get(selector);
  if (!test) throw new Error('Registered case absent/renamed: ' + entry.id + '. Update its selector explicitly; preserve its ID/history.');
  const profile = registry.profiles[entry.profile];
  if (!profile) throw new Error('Unknown evidence profile: ' + entry.id);
  const classification = entry.classification || profile.classification;
  if (!(classification in classifications)) throw new Error('Unknown oracle classification: ' + entry.id);
  if ((classification === 'pending clarification') !== (test.status === 'todo')) {
    throw new Error('TODO/classification mismatch: ' + entry.id);
  }
  const requirements = entry.requirements || profile.requirements;
  const evidence = entry.evidence || profile.evidence;
  if (!requirements.length || !evidence.length) throw new Error('Missing explicit requirements/evidence: ' + entry.id);
  statuses[test.status] = (statuses[test.status] || 0) + 1;
  classifications[classification]++;
  rows.push([
    entry.id, entry.file, requirements.join('; '), classification,
    evidence.join('; '), entry.authority_scope || profile.authority_scope || registry.authority,
    entry.gap_reason || profile.limitation || '', test.status, entry.full_name,
    entry.legacy_ids.join('; '), entry.history ? JSON.stringify(entry.history) : '',
    path.relative(root, resultPath).replaceAll('\\', '/'),
  ]);
}
if (actual.size !== seenSelectors.size || [...actual.keys()].some(k => !seenSelectors.has(k))) {
  throw new Error('Unregistered executable cases: add explicit permanent IDs, requirements and evidence before exporting');
}
if (rows.length !== report.numTotalTests ||
    (statuses.passed || 0) !== report.numPassedTests ||
    (statuses.failed || 0) !== report.numFailedTests ||
    (statuses.todo || 0) !== report.numTodoTests) throw new Error('Result count mismatch');
rows.sort((a, b) => a[0].localeCompare(b[0]));
const header = ['case_id', 'file', 'requirement', 'oracle_classification', 'evidence', 'authority_scope',
  'limitation', 'status', 'test_case', 'legacy_case_ids', 'oracle_history', 'verification_artifact'];
const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
const output = '\ufeff' + [header, ...rows].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
if (checkOnly) {
  if (fs.readFileSync(outputPath, 'utf8') !== output) throw new Error('CSV differs from explicit registry/results');
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, { flag: 'wx' });
}
console.log(JSON.stringify({ mode: checkOnly ? 'verified without writing' : 'created (no overwrite)',
  cases: rows.length, statuses, classifications, output: path.relative(root, outputPath) }, null, 2));
