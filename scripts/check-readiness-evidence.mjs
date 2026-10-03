// Static audit-document integrity only. Never grants a product or submission gate.
// Run from the repository root; prints JSON without overwriting any Evidence.
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const checks = [];
function check(id, action) {
  try { const detail = action(); checks.push({id, status: 'PASS', detail}); }
  catch (error) { checks.push({id, status: 'FAIL', error: error.message}); }
}
const baseline = read('docs/verification-results.json');
const recordPath = process.argv[2] ?? 'docs/evidence/integrated-2026-10-03/regression.json';
const record = read(recordPath);
const audit = read('docs/evoto-audit.json');
const metadata = read('docs/APPLE_SUBMISSION/metadata.json');
const requirements = read('docs/requirements.json').requirements;
const testByID = new Map(record.testCatalog.map(t => [t.id, t]));
const requirementIDs = new Set(requirements.map(r => r.id));
const comparisonRequirementIDs = new Set([...requirementIDs,...read('docs/CROP_REQUIREMENTS.json').requirements.map(r=>r.id),...read('docs/WORKSPACE_REQUIREMENTS.json').requirements.map(r=>r.id)]);
const rowByID = new Map(audit.rows.map(r => [r.id, r]));

check('FROZEN_SIX_DOCUMENTS', () => {
  const files = read('contracts/frozen.sha256.json').files;
  assert.equal(files.length, 6);
  for (const file of files) assert.equal(hash(file.path), file.sha256, file.path);
  return {count: files.length, scope: 'Byte integrity, not functional acceptance'};
});
check('CURRENT_SOURCE_HASHES_AND_BASELINE_CHANGE_DISCLOSURE', () => {
  assert.equal(baseline.sourceHashes.length, 52);
  for (const file of record.sourceHashes) assert.equal(hash(file.file), file.sha256, file.file);
  const changed = baseline.sourceHashes.filter(f=>hash(f.file)!==f.sha256).map(f=>f.file);
  const declared = new Set(read('docs/INTEGRATED_CHANGES.json').files.map(f=>f.file));
  for(const file of changed)assert.ok(declared.has(file),'Undisclosed baseline change: '+file);
  return {current:record.sourceHashes.length,baseline:baseline.generatedAt,changedBaselineFiles:changed,scope:'Authorized additive Crop/Workspace changes, not a claim that old code is byte-identical'};
});
check('ALL_147_REQUIREMENT_MAPPINGS_RETAINED', () => {
  assert.equal(requirements.length, 147); assert.equal(requirementIDs.size, 147);
  assert.equal(Object.keys(record.requirements).length, 147);
  for (const item of requirements) {
    const current=record.requirements[item.id],old=baseline.requirements[item.id];
    for(const field of ['source','section','implementationStatus','implementationPaths','declaredTestScope','featureAcceptance'])assert.deepEqual(current[field],old[field],item.id+' '+field);
    for(const id of old.testIDs)assert.ok(current.testIDs.includes(id),item.id+' retained '+id);
    for (const id of record.requirements[item.id].testIDs) assert.ok(testByID.has(id), id);
    for (const path of [...item.implementation.paths, ...item.tests.files, ...item.evidence]) assert.ok(existsSync(path), path);
  }
  return {count: 147, scope: 'Existing mapping retained; all featureAcceptance remain NOT_PASSED'};
});
check('WINDOWS_BASELINE_34_PLUS_ADDITIONS_AND_NATIVE_NOT_RUN', () => {
  assert.equal(record.status, 'PASS_SCOPED_WINDOWS_REGRESSION');
  assert.equal(record.summary.executed,record.summary.pass);assert.ok(record.summary.executed>=34);
  assert.equal(record.summary.fail, 0); assert.equal(record.summary.skip, 0);
  assert.ok(record.summary.nativeNotRun>=45);assert.equal(record.catalogMatchesExecution,true);
  assert.equal(record.baselineRegression.length,34);for(const t of record.baselineRegression)assert.equal(t.status,'PASS',t.id);
  for (const t of record.testCatalog.filter(t => t.id.startsWith('NAT-'))) assert.equal(t.status, 'NOT_RUN');
  for (const id of ['WIN-001','WIN-003','WIN-004','WIN-005','WIN-006','WIN-008','WIN-009','WIN-010','WIN-011','WIN-012','WIN-015']) assert.equal(testByID.get(id)?.status, 'PASS', id);
  return {...record.summary,baseline34:'PASS'};
});
check('RAW_SETS_SEPARATE_UNMEASURED', () => {
  for (const count of [100, 500, 1000]) {
    for (const mode of ['manifest', 'pipeline']) {
      const matches = record.rawResults.filter(r => r.count === count && r.mode === mode);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].status, 'BLOCKED_EXTERNAL_ENVIRONMENT');
      for (const stage of ['import','proxyGeneration','sync','recipeSave','restartRecovery','cloudSafe','export']) assert.equal(matches[0].lifecycle[stage].status, 'NOT_RUN');
    }
  }
  assert.equal(record.mobileRelease.decision, 'BLOCK');
  for (const id of ['iphone-device','ipad-device','mac-build-tests','full-lifecycle-sync-recovery']) assert.ok(record.mobileRelease.unknowns.includes(id));
  assert.ok(!record.mobileRelease.unknowns.some(id => /web/i.test(id)));
  return {sets: [100, 500, 1000], mobileRelease: 'BLOCK', physicalDeviceGates: ['iphone-device','ipad-device']};
});
check('EVOTO_CATEGORIES_REFERENCES_AND_SCOPES', () => {
  assert.equal(rowByID.size, audit.rows.length);
  const sourceIDs = new Set(audit.sources.map(s => s.id));
  const counts = Object.fromEntries('ABCDEFG'.split('').map(c => [c, 0]));
  for (const row of audit.rows) {
    assert.ok(Object.hasOwn(counts, row.category), row.id + ' category'); counts[row.category]++;
    assert.ok(row.feature && row.suiteMaturity && row.notes && row.checkedOn, row.id);
    for (const id of row.suiteRequirementIds) assert.ok(comparisonRequirementIDs.has(id), row.id + ' ' + id);
    for (const path of row.implementationEvidence) assert.ok(existsSync(path), row.id + ' ' + path);
    assert.ok(existsSync(row.testEvidence.record)); assert.ok(existsSync(row.testEvidence.catalog));
    for (const id of row.testEvidence.testIds) assert.ok(testByID.has(id), row.id + ' ' + id);
    for (const id of row.evotoSourceIds) assert.ok(sourceIDs.has(id), row.id + ' ' + id);
    if (row.category === 'G') assert.equal(row.evotoVerification, 'UNKNOWN', row.id);
    if (row.evotoVerification === 'UNKNOWN') assert.equal(row.category, 'G', row.id);
    if (row.category === 'A' || row.suiteCategory === 'A') {
      assert.ok(row.implementationEvidence.length > 0 && row.testEvidence.testIds.length > 0, row.id);
      for (const id of row.testEvidence.testIds) {
        assert.ok(id.startsWith('WIN-'), row.id + ' native cannot be A');
        assert.equal(testByID.get(id).status, 'PASS');
      }
    }
  }
  assert.equal(audit.summary.total, audit.rows.length);
  assert.deepEqual(audit.summary.categoryCounts, counts);
  for (const ids of Object.values(audit.comparisons)) {
    assert.ok(Array.isArray(ids));
    for (const id of ids) assert.ok(rowByID.has(id), id);
  }
  return {total: audit.rows.length, counts, scope: 'References and classification consistency, not feature acceptance'};
});
check('EVOTO_PRIMARY_SOURCES', () => {
  for (const source of audit.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(url.hostname === 'evoto.ai' || url.hostname.endsWith('.evoto.ai') || url.hostname === 'apps.apple.com', source.url);
    assert.equal(source.kind, 'official'); assert.ok(source.checkedOn && source.scopeNote);
  }
  return {count: audit.sources.length, scope: 'Official source list inspected; not a live URL availability test'};
});
check('APPLE_REQUESTED_DOCUMENTS_EXIST', () => {
  const names = ['APP_INFORMATION','STORE_METADATA','SCREENSHOTS','APP_ICON','APP_PRIVACY','PRIVACY_POLICY','THIRD_PARTY_SERVICES','EXPORT_COMPLIANCE','APP_REVIEW','ACCOUNT_DELETION','IAP_ASSESSMENT'];
  for (const name of names) assert.ok(readFileSync('docs/APPLE_SUBMISSION/' + name + '.md','utf8').trim().length > 100, name);
  return {count: names.length, scope: 'Requested subject coverage; drafts are not approval'};
});
check('APPLE_UNDECIDED_AND_RELEASE_BLOCK', () => {
  assert.equal(metadata.submissionReady, false); assert.equal(metadata.mobileRelease, 'BLOCK');
  assert.deepEqual(metadata.targetDevices, ['iPhone', 'iPad']); assert.equal(metadata.macRole, 'QA_ENVIRONMENT_ONLY');
  const ids = new Set(metadata.fields.map(f => f.id)); assert.equal(ids.size, metadata.fields.length);
  for (const f of metadata.fields) {
    assert.equal(f.value, null, f.id + ': no externally confirmed submission value in this phase');
    assert.ok(f.id && f.label && f.status && f.reason && f.owner && f.document, f.id);
  }
  for (const value of Object.values(metadata.declaredAnswers)) assert.equal(value, null);
  assert.ok(metadata.blockers.length > 0);
  return {fields: metadata.fields.length, scope: 'Unknown values preserved, no submission executed'};
});
check('DEVICE_QA_TWO_PHYSICAL_GATES', () => {
  const doc = readFileSync('docs/MOBILE_DEVICE_QA.md', 'utf8');
  for (const item of ['iphone-device','ipad-device','mac-build-tests','IPH-01','IPH-09','IPD-01','IPD-09','NOT RUN','NOT IMPLEMENTED','BLOCK','ENOSPC','Cloud Safe','Multipart']) assert.ok(doc.includes(item), item);
  return {physicalDevices: ['iPhone','iPad'], mac: 'QA environment only', status: 'NOT RUN'};
});

const listFiles = dir => readdirSync(dir).flatMap(name => {
  const file = dir + '/' + name;
  return statSync(file).isDirectory() ? listFiles(file) : [file];
});
const files = ['docs/EVOTO_AUDIT.md','docs/evoto-audit.json','docs/MOBILE_DEVICE_QA.md','docs/SUBMISSION_READINESS.md','docs/HANDOFF.md','docs/OWNERSHIP.md','docs/SUBMISSION_CHANGES.md','README.md',
  'scripts/check-readiness-evidence.mjs', ...listFiles('docs/APPLE_SUBMISSION'), recordPath];
const pass = checks.filter(c => c.status === 'PASS').length;
const fail = checks.length - pass;
console.log(JSON.stringify({schemaVersion: 1, generatedAt: new Date().toISOString(), command: ['node','scripts/check-readiness-evidence.mjs',recordPath],
  status: fail ? 'FAIL_DOCUMENT_INTEGRITY' : 'PASS_AUDIT_DOCUMENT_INTEGRITY_ONLY', checks, summary: {checks: checks.length, pass, fail, skip: 0},
  deliverableHashes: files.map(file => ({file, sha256: existsSync(file) ? hash(file) : null})),
  productTests: record.summary, mobileRelease: 'BLOCK', submissionReady: false,
  disclaimer: 'Static documentation/evidence validation is not product functionality, iOS QA, privacy/legal approval or Apple submission acceptance.'}, null, 2));
if (fail) process.exitCode = 1;
