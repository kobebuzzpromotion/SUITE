// Read/execute and print Evidence JSON only. Does not edit contracts or ingest RAW data.
import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const commands = [];
function run(args) {
  const result = spawnSync(process.execPath, args, {encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024});
  const record = {command: ['node', ...args], exitCode: result.status, signal: result.signal, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message ?? null};
  commands.push(record); return record;
}
function walk(root) {
  return readdirSync(root, {withFileTypes: true}).flatMap(entry => {
    if (entry.isSymbolicLink() || entry.name.startsWith('.') || ['node_modules', 'dist', 'DerivedData'].includes(entry.name)) return [];
    const file = root + '/' + entry.name;
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const spec = run(['scripts/check-spec.mjs']);
const additionalSpec = run(['scripts/check-additional-spec.mjs']);
const build = run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json']);
if (spec.exitCode !== 0 || build.exitCode !== 0 || (additionalSpec && additionalSpec.exitCode !== 0)) {console.log(JSON.stringify({status: 'FAIL', commands}, null, 2)); process.exit(1);}
const backendTests = readdirSync('dist/apps/backend/tests').filter(f => f.endsWith('.test.js')).sort().map(f => 'dist/apps/backend/tests/' + f);
const scriptTests = [
  ...readdirSync('scripts').filter(f => f.endsWith('.test.mjs')).sort().map(f => 'scripts/' + f),
  ...readdirSync('scripts/tests').filter(f => f.endsWith('.test.mjs')).sort().map(f => 'scripts/tests/' + f)
];
const test = run(['--test', '--test-reporter=tap', ...backendTests, ...scriptTests]);
const sourceFiles = [...walk('apps'), ...walk('packages'), ...walk('scripts')].filter(f => /\.(?:swift|ts|mjs|yml)$/.test(f));
const testCatalog = [];
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  // Cloudflare adapter tests are run independently against their Worker fixture;
  // they are not part of the historical Windows backend Test ID catalog.
  if (!file.startsWith('apps/web/') && !file.startsWith('apps/sites/tests/') && (file.endsWith('.test.ts') || file.endsWith('.test.mjs'))) {
    for (const match of text.matchAll(/^test\('([^']+)'/gm)) {
      const line = test.stdout.split('\n').find(l => new RegExp('^(?:not )?ok \\d+ - ').test(l) && l.slice(l.indexOf(' - ') + 3) === match[1]);
      const skipped = !!line && / # (?:SKIP|TODO)\b/i.test(line);
      testCatalog.push({file, name: match[1], status: skipped ? 'SKIP' : line?.startsWith('ok ') ? 'PASS' : line?.startsWith('not ok ') ? 'FAIL' : 'NOT_RUN', scope: file.includes('pricing-model') ? 'PRICING_ARITHMETIC_NOT_BILLING' : file.startsWith('scripts') ? 'HARNESS_MECHANICS_NOT_RAW' : 'WINDOWS_BACKEND_NOT_IOS'});
    }
  }
  if (file.includes('/Tests/') && file.endsWith('.swift')) {
    for (const match of text.matchAll(/func (test\w+)\(/g)) testCatalog.push({file, name: match[1], status: 'NOT_RUN', reason: 'BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable', scope: 'SWIFT_NATIVE_NOT_EXECUTED'});
  }
}
const rawResults = [];
for (const mode of ['manifest', 'pipeline']) {
  const result = run(['scripts/raw-harness.mjs', mode, '--sets', '100,500,1000']);
  const data = JSON.parse(result.stdout);
  for (const item of data.results) rawResults.push({mode, count: item.expectedFileCount ?? item.manifest.expectedFileCount, status: item.status, result: item,
    lifecycle: Object.fromEntries(['import','proxyGeneration','sync','recipeSave','restartRecovery','cloudSafe','export'].map(stage => [stage, {status: 'NOT_RUN', reason: '実RAW未配置のため未実施。Mac未実行・full sync/device adapter未接続も独立Gate。'}]))});
}
const requirements = JSON.parse(readFileSync('docs/requirements.json', 'utf8')).requirements;
// Existing published IDs never change when additional test files sort before old files.
const baseline = JSON.parse(readFileSync('docs/verification-results.json', 'utf8'));
const idBaseline = JSON.parse(readFileSync('docs/evidence/face-brightness-2026-10-03/windows-03/regression.json', 'utf8'));
const baselineTests = new Map(idBaseline.testCatalog.map(t => [t.file + '\0' + t.name, t.id]));
let winIndex = Math.max(...idBaseline.testCatalog.filter(t => t.id.startsWith('WIN-')).map(t => Number(t.id.slice(4))));
let nativeIndex = Math.max(...idBaseline.testCatalog.filter(t => t.id.startsWith('NAT-')).map(t => Number(t.id.slice(4))));
for (const testCase of testCatalog) testCase.id = baselineTests.get(testCase.file + '\0' + testCase.name) ??
  (testCase.scope === 'SWIFT_NATIVE_NOT_EXECUTED' ? 'NAT-' + String(++nativeIndex).padStart(3, '0') : 'WIN-' + String(++winIndex).padStart(3, '0'));
const {evaluateMobileRelease} = await import('../dist/apps/backend/src/gates.js');
const sourceHashes = [...sourceFiles, 'package.json', 'package-lock.json', ...walk('contracts')].sort().map(file => ({file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex')}));
const windowsTests = testCatalog.filter(t => t.scope !== 'SWIFT_NATIVE_NOT_EXECUTED');
const baselineRegression = baseline.testCatalog.filter(t => t.id.startsWith('WIN-')).map(t => ({id: t.id, name: t.name,
  status: testCatalog.find(current => current.file === t.file && current.name === t.name)?.status ?? 'NOT_RUN'}));
const rawBlockedAsExpected = rawResults.every(r => r.status === 'BLOCKED_EXTERNAL_ENVIRONMENT') && commands.slice(-2).every(r => r.exitCode === 2);
const summary = {executed: windowsTests.length, pass: windowsTests.filter(t => t.status === 'PASS').length, fail: windowsTests.filter(t => t.status === 'FAIL').length,
  baselineWindows: {expected: idBaseline.summary.executed, pass: idBaseline.testCatalog.filter(t => t.scope !== 'SWIFT_NATIVE_NOT_EXECUTED').filter(t => testCatalog.find(current => current.file === t.file && current.name === t.name)?.status === 'PASS').length},
  newSitesPreparation: {tests: testCatalog.filter(t => t.file.startsWith('scripts/tests/prepare-sites-checkout.test.mjs')).length, pass: testCatalog.filter(t => t.file.startsWith('scripts/tests/prepare-sites-checkout.test.mjs') && t.status === 'PASS').length},
  skip: Number(/# skipped (\d+)/.exec(test.stdout)?.[1] ?? 0), nativeNotRun: testCatalog.filter(t => t.scope === 'SWIFT_NATIVE_NOT_EXECUTED').length,
  fullRawLoadNotRun: [100,500,1000], scope: 'Windows 154 baseline plus 5 local Sites-preparation checks; not deployed Site/Native/RAW/Release PASS'};
const tapCounts = Object.fromEntries(['tests','pass','fail','skipped'].map(name => [name,Number(new RegExp('# '+name+' (\\d+)').exec(test.stdout)?.[1] ?? -1)]));
const catalogMatchesExecution = tapCounts.tests === summary.executed && tapCounts.pass === summary.pass && tapCounts.fail === summary.fail && tapCounts.skipped === summary.skip;
const reportIndex=process.argv.indexOf('--report');
const evidencePath = reportIndex >= 0 ? path.relative(process.cwd(),path.resolve(process.argv[reportIndex+1]??'')).replaceAll('\\','/') : 'STDOUT_UNSAVED_EVIDENCE';
const result = {schemaVersion: 1, generatedAt: new Date().toISOString(), platform: process.platform, node: process.version,
  status: test.exitCode === 0 && catalogMatchesExecution && summary.executed === summary.pass && rawBlockedAsExpected && baselineRegression.every(t => t.status === 'PASS') ? 'PASS_SCOPED_WINDOWS_REGRESSION' : 'FAIL',
  summary, tapCounts, catalogMatchesExecution, baselineRegression, commands, testCatalog, rawResults, sourceHashes,
  requirements: Object.fromEntries(requirements.map(r => [r.id, {source: r.source, section: r.section, implementationStatus: r.implementation.status, implementationPaths: r.implementation.paths, testIDs: testCatalog.filter(t => r.tests.files.includes(t.file)).map(t => t.id), declaredTestScope: r.tests.state ?? r.tests.status, featureAcceptance: 'NOT_PASSED', evidence: evidencePath+'#/requirements/' + r.id}])),
  additionalRequirements: existsSync('docs/CROP_REQUIREMENTS.json') ? Object.fromEntries(JSON.parse(readFileSync('docs/CROP_REQUIREMENTS.json', 'utf8')).requirements.map(r => [r.id, {
    ...r, testIDs: testCatalog.filter(t => r.testFiles.includes(t.file)).map(t => t.id), featureAcceptance: 'NOT_PASSED'
  }])) : {},
  workspaceRequirements: Object.fromEntries(JSON.parse(readFileSync('docs/WORKSPACE_REQUIREMENTS.json', 'utf8')).requirements.map(r => [r.id, {
    ...r, testIDs: testCatalog.filter(t => r.testFiles.includes(t.file)).map(t => t.id), featureAcceptance: 'NOT_PASSED'
  }])),
  pricingRequirements: Object.fromEntries(JSON.parse(readFileSync('docs/PRICING_REQUIREMENTS.json','utf8')).requirements.map(r=>[r.id,{
    ...r,testIDs:testCatalog.filter(t=>r.testFiles.includes(t.file)).map(t=>t.id),featureAcceptance:'NOT_PASSED'
  }])),
  mobileRelease: evaluateMobileRelease({subject_id: 'unreleased-source-snapshot', subject_version: 1, checks: {}, high_impact_uncertain: true}, new Date().toISOString()),
  disclaimer: 'No product gate passed. Contract hashes prove frozen texts unchanged only. Native/source review is not compilation or runtime evidence.'};
if(reportIndex>=0){
  const report=path.resolve(process.argv[reportIndex+1]??'');
  const evidenceRoot=path.resolve('docs/evidence');
  if(!report.startsWith(evidenceRoot+path.sep)||!report.endsWith('.json'))throw new Error('Report must be a new JSON file below docs/evidence');
  mkdirSync(path.dirname(report),{recursive:true});
  writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:result.status,summary,tapCounts,catalogMatchesExecution,report},null,2));
}else console.log(JSON.stringify(result, null, 2));
if (result.status === 'FAIL') process.exitCode = 1;
