// Documentation/Evidence verification only. No product, Native, image or release PASS.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateRecipe} from '../../dist/apps/backend/src/photo-policy.js';

const directory = path.resolve(process.argv[2] ?? '');
assert.ok(directory.startsWith(path.resolve('docs/evidence') + path.sep));
if (process.argv.includes('--freeze')) {
  const read = file => JSON.parse(readFileSync(file, 'utf8'));
  const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  const report = path.join(directory, 'regression.json'), record = read(report);
  const metadata = read(path.join(directory, 'RUN_METADATA.json'));
  for (const f of record.sourceHashes) assert.equal(sha(f.file), f.sha256, f.file);
  const manifestPath = path.join(directory, 'FROZEN_RUN_MANIFEST.json');
  assert.equal(existsSync(manifestPath), false, 'Frozen run must never be replaced');
  const finalDocs = path.join(directory, 'POST_INTEGRATION_DOCUMENT_CHECK.json');
  assert.equal(existsSync(finalDocs), false);
  const startedAt = new Date().toISOString();
  const command = ['node', 'scripts/check-readiness-evidence.mjs', path.relative(process.cwd(), report).replaceAll('\\', '/')];
  const result = spawnSync(process.execPath, command.slice(1), {encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024});
  const endedAt = new Date().toISOString(), documentResult = JSON.parse(result.stdout);
  writeFileSync(finalDocs, JSON.stringify({startedAt, endedAt, command, exitCode: result.status,
    buildID: metadata.build.id, stdout: result.stdout, stderr: result.stderr, summary: documentResult.summary,
    scope: 'POST_INTEGRATION_DOCUMENTATION_ONLY'}, null, 2) + '\n', {flag: 'wx'});
  assert.equal(result.status, 0); assert.equal(documentResult.summary.pass, 10); assert.equal(documentResult.summary.fail, 0);
  const native = record.testCatalog.filter(t => t.scope === 'SWIFT_NATIVE_NOT_EXECUTED').map(t => ({
    ...t, executedAt: null, preparedAt: endedAt, status: 'NOT_RUN',
    requiredEnvironment: t.file.startsWith('apps/apple/') ? 'Mac + Xcode + observed iOS test destination' : 'Mac + Swift6 toolchain',
    nextCommand: t.file.startsWith('apps/apple/')
      ? "cd apps/apple; xcodegen generate; xcodebuild test -scheme SUITE -project SUITE.xcodeproj -destination 'id=<observed destination>' -resultBundlePath /actual/external/REPORTS/new-native.xcresult"
      : 'swift test --package-path ' + (t.file.startsWith('packages/METISMobileCore/') ? 'packages/METISMobileCore' : 'packages/SuiteCore'),
    procedure: 'Run the real suite; map XCTest actual file/class/method result to this preserved NAT ID, preserving unexecuted tests as NOT_RUN.',
    acceptanceCriteria: 'Current source compiles; this exact test actually executes with assertions passing and no unexpected skip. Synthetic unit results do not grant real-image/RAW/device PASS.',
    evidenceRequired: ['NAT test_id', 'PASS/FAIL/NOT_RUN', 'actual run timestamp', 'Build/source SHA', 'toolchain/SDK/environment', 'stdout/stderr or xcresult', 'reason if unexecuted']
  }));
  assert.equal(native.length, 112);
  writeFileSync(path.join(directory, 'NATIVE_NOT_RUN_CATALOG.json'), JSON.stringify({schemaVersion: 1,
    preparedAt: endedAt, buildID: metadata.build.id, tests: native,
    summary: {total: 112, pass: 0, fail: 0, skip: 0, notRun: 112},
    scope: 'Prepared execution plan only; no Swift, Xcode, Mac, image or device test ran'}, null, 2) + '\n', {flag: 'wx'});
  const names = ['regression.json', 'RUN_METADATA.json', 'execution.log', 'document-integrity.json',
    'PERSON_INTEGRITY_DENIALS.json', 'PERSON_INTEGRATION_CHECK.json', 'WORKFLOW_PARITY_SUPPLEMENT.json',
    'POST_INTEGRATION_DOCUMENT_CHECK.json', 'NATIVE_NOT_RUN_CATALOG.json'];
  const documents = ['docs/FACE_BRIGHTNESS_INTEGRATION.md', 'docs/INTEGRATED_REPORT.md', 'docs/HANDOFF.md',
    'docs/PERSON_INTEGRITY_GATE.md', 'docs/PERSON_INTEGRITY_PATHS.json', 'docs/FACE_BRIGHTNESS_NATIVE_QA.md',
    'docs/ORIGINAL_RECOVERY_DESIGN.md', 'docs/PORTRAIT_REVIEW.md', 'docs/OWNERSHIP.md', 'docs/PARALLEL_WORK_BOARD.md',
    'docs/INTEGRATED_CHANGES.json', 'docs/CHANGE_NOTICE.md', 'docs/tools/check-person-integration.mjs'];
  writeFileSync(manifestPath, JSON.stringify({schemaVersion: 1, frozenAt: new Date().toISOString(),
    buildID: metadata.build.id, commitSHA: metadata.environment.commitSHA_display,
    commitReason: metadata.environment.commitReason_display, runStartedAt: metadata.startedAt, runEndedAt: metadata.endedAt,
    windows: record.summary, documents: {initial: '10/10 PASS', postIntegration: documentResult.summary},
    files: names.map(name => ({file: path.relative(process.cwd(), path.join(directory, name)).replaceAll('\\', '/'), sha256: sha(path.join(directory, name)), policy: 'IMMUTABLE_EVIDENCE'})),
    currentDocumentsAtFreeze: documents.map(file => ({file, sha256: sha(file), policy: 'SOURCE_DOCUMENT_AT_FREEZE; later changes require separate Evidence, not modification of this snapshot'})),
    sourceManifest: 'regression.json#/sourceHashes', sourceCount: record.sourceHashes.length,
    sourceHashes: record.sourceHashes, native: '112 NOT_RUN', faceBrightness: 'IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED',
    featureParity: 'BLOCK', mobileRelease: 'BLOCK', policy: 'Never overwrite these results, Build ID or measured timestamps. New execution/corrections must use independent Evidence.'}, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({manifestPath, frozenEvidenceFiles: names.length, sourceHashes: record.sourceHashes.length,
    windowsPass: record.summary.pass, fail: record.summary.fail, nativeNotRun: native.length, postDocumentation: documentResult.summary, mobileRelease: 'BLOCK'}));
  process.exit(0);
}
const output = path.join(directory, 'PERSON_INTEGRATION_CHECK.json');
assert.equal(existsSync(output), false, 'Use a new output; never replace Evidence');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const record = read(path.join(directory, 'regression.json'));
const metadata = read(path.join(directory, 'RUN_METADATA.json'));
const denials = read(path.join(directory, 'PERSON_INTEGRITY_DENIALS.json'));
const gate = read('docs/PERSON_INTEGRITY_PATHS.json');
const startedAt = new Date().toISOString(), checks = [];
function check(id, action) {
  try {checks.push({id, status: 'PASS', detail: action()});}
  catch (error) {checks.push({id, status: 'FAIL', reason: String(error)});}
}
const pathTests = {
  PGI01: 'PGI-SAVE', PGI02: 'PGI-RELOAD', PGI03: 'PGI-RESTART',
  PGI04: 'PGI-CONFLICT-VERSION', PGI05: 'PGI-CONFLICT-RESOLUTION',
  PGI06: 'PGI-UNDO', PGI07: 'PGI-REDO', PGI08: 'PGI-HIDDEN-HISTORY',
  PGI09: 'PGI-ASSET-SWITCH', PGI10: 'PGI-PERSON-RESELECT',
  PGI11: 'PGI-RECIPE-COPY', PGI12: 'PGI-EXPORT-RECIPE'
};
const nativeTests = {
  PGI01: ['NAT-100', 'NAT-105'], PGI02: ['NAT-100', 'NAT-101', 'NAT-102'],
  PGI03: ['NAT-100'], PGI04: [], PGI05: [], PGI06: ['NAT-099', 'NAT-106', 'NAT-092'],
  PGI07: ['NAT-099', 'NAT-100'], PGI08: ['NAT-102', 'NAT-105', 'NAT-106'],
  PGI09: ['NAT-098', 'NAT-109'], PGI10: ['NAT-107', 'NAT-108'],
  PGI11: ['NAT-098', 'NAT-105'], PGI12: ['NAT-093', 'NAT-111', 'NAT-112']
};
const pathResults = gate.paths.map(p => {
  const test = record.testCatalog.find(t => t.name.startsWith(pathTests[p.pathId] + ' /'));
  return {path_id: p.pathId, name: p.name, windows_test: test,
    windows_status: test?.status ?? 'NOT_RUN',
    scope: 'WINDOWS_DATA_BOUNDARY_ONLY; NO_NATIVE_UI_UNDO_REDO_MASK_OR_EXPORT_EXECUTION',
    native_authored_tests: nativeTests[p.pathId].map(id => record.testCatalog.find(t => t.id === id)),
    native_status: 'NOT_RUN', native_visual: 'NOT_RUN', required_negative_native_execution: 'NOT_RUN',
    native_gap: ['PGI04', 'PGI05', 'PGI11'].includes(p.pathId)
      ? 'Native person conflict/copy operation UI NOT_IMPLEMENTED; source boundary is not a completed workflow'
      : 'Mac/Swift/Xcode/iPhone/iPad unavailable; relevant unit and real interaction checks unexecuted',
    source_limit: p.sourceLimit, decision: 'BLOCK'};
});

check('CURRENT_SOURCE_BUILD_SNAPSHOT', () => {
  for (const f of record.sourceHashes) assert.equal(sha(f.file), f.sha256, f.file);
  assert.equal(metadata.regressionSHA256, sha(path.join(directory, 'regression.json')));
  assert.equal(metadata.build.id, denials.buildID);
  return {count: record.sourceHashes.length, buildID: metadata.build.id};
});
check('OLD_124_AND_137_MAINTAINED', () => {
  assert.equal(metadata.baseline124.length, 124);
  for (const t of metadata.baseline124) {assert.equal(t.status, 'PASS'); assert.equal(t.currentID, t.id);}
  for (let n = 125; n <= 137; n++) assert.equal(record.testCatalog.find(t => t.id === 'WIN-' + n)?.status, 'PASS');
  assert.deepEqual([record.summary.pass, record.summary.fail, record.summary.skip], [154, 0, 0]);
  return {baseline124: 124, firstPerson13: 13, safety3: 3, commonPaths14: 14, pass: 154};
});
check('TWELVE_PATHS_SEPARATE_IDS_AND_SCOPE', () => {
  assert.equal(pathResults.length, 12); assert.equal(new Set(pathResults.map(p => p.path_id)).size, 12);
  for (const p of pathResults) {
    assert.equal(p.windows_status, 'PASS'); assert.equal(p.native_status, 'NOT_RUN');
    for (const t of p.native_authored_tests) assert.equal(t?.status, 'NOT_RUN');
  }
  const extra = record.testCatalog.filter(t => /^PGI-(INVENTORY|GEOMETRY-ID) \//.test(t.name));
  assert.equal(extra.length, 2); for (const t of extra) assert.equal(t.status, 'PASS');
  return {pathTests: 12, inventoryAndGeometryTests: 2, nativeOrVisualPass: 0};
});
check('DENIAL_NINE_FIELDS_AND_PRESERVATION', () => {
  assert.equal(denials.events.length, 12);
  for (const e of denials.events) {
    for (const field of gate.rejectionEvidenceContract.requiredFields) assert.ok(e[field] != null && e[field] !== '', field);
    assert.equal(e.recipe_version, e.stored_recipe_revision);
    assert.ok(Number.isFinite(Date.parse(e.timestamp)));
    assert.equal(e.originalStorageBytesPreserved, true);
    assert.equal(e.originalStorageChecksumBefore, e.originalStorageChecksumAfter);
    assert.equal(e.rawChecksum, 'NOT_RUN_REAL_RAW_ABSENT');
  }
  return {events: 12, requiredFields: 9, scope: denials.scope,
    limit: 'Save/reopen diagnostic coverage only. Native UI/mask and other path refusal collectors not connected.'};
});
check('FROZEN_SIX_AND_AUDIT_EVIDENCE', () => {
  const fixed = read('contracts/frozen.sha256.json').files;
  const reviews = read('docs/evidence/evoto-2026-10-03/FROZEN_REVIEW_MANIFEST.json').files;
  assert.equal(fixed.length, 6);
  for (const f of fixed) assert.equal(sha(f.path), f.sha256, f.path);
  for (const f of reviews) assert.equal(sha(f.file), f.sha256, f.file);
  const interpretation = read('docs/EVOTO_AUDIT/reviews/audit_continuation.json');
  for (const f of interpretation.inputs) assert.equal(sha(f.path), f.sha256.toLowerCase(), f.path);
  return {fixedSix: fixed.length, frozenReviewFiles: reviews.length, interpretationInputs: interpretation.inputs.length, scope: 'Byte integrity only'};
});
check('ALL_147_RETAINED', () => {
  const old = read('docs/verification-results.json');
  assert.equal(Object.keys(record.requirements).length, 147);
  for (const [id, current] of Object.entries(record.requirements)) {
    for (const key of ['source', 'section', 'implementationStatus', 'implementationPaths', 'declaredTestScope', 'featureAcceptance'])
      assert.deepEqual(current[key], old.requirements[id][key], id + ' ' + key);
  }
  return {count: 147, acceptance: 'NOT_PASSED; retained mappings are not all-feature completion'};
});
check('RECIPE_V1_GOLDEN_AND_EXTENSION', () => {
  const golden = read('contracts/recipe-v1.example.json'); validateRecipe(golden);
  assert.deepEqual(Object.keys(golden).sort(), ['parameters', 'schemaVersion']); assert.equal(golden.schemaVersion, 1);
  assert.equal(record.testCatalog.find(t => t.id === 'WIN-125')?.status, 'PASS');
  return {outerEnvelope: 'schemaVersion=1 + parameters, unchanged', portrait: 'existing extendedParameters.portrait',
    compatibility: 'Existing JSON passes current validator; Swift compatibility execution NOT_RUN'};
});
check('EXISTING_NETWORK_ROUTER_HASHES', () => {
  const baseline = read('docs/evidence/integrated-2026-10-03/regression.json').sourceHashes;
  const paths = ['apps/backend/src/server.ts', 'apps/backend/src/workspace-server.ts', 'apps/backend/src/auth.ts'];
  for (const p of paths) assert.equal(sha(p), baseline.find(f => f.file === p)?.sha256, p);
  return {paths, scope: 'Router/auth source bytes unchanged; validation refusals added at existing method boundaries'};
});
check('NATIVE_AND_RAW_STAY_UNEXECUTED', () => {
  const native = record.testCatalog.filter(t => t.scope === 'SWIFT_NATIVE_NOT_EXECUTED');
  assert.equal(native.length, 112); for (const t of native) assert.equal(t.status, 'NOT_RUN');
  for (const r of record.rawResults) {
    assert.equal(r.status, 'BLOCKED_EXTERNAL_ENVIRONMENT');
    for (const stage of Object.values(r.lifecycle)) assert.equal(stage.status, 'NOT_RUN');
  }
  return {native: 112, originalNative: 82, additiveNative: 30, rawSets: [100, 500, 1000], scope: 'Harness exits2 are external BLOCK'};
});
check('COMMON_GATE_AND_RECOVERY_BOUNDARIES', () => {
  assert.equal(gate.gate.definitionStatus, 'DEFINED'); assert.equal(gate.gate.decision, 'BLOCK');
  assert.equal(gate.correctionAdapters.filter(a => a.status === 'NOT_IMPLEMENTED').length, 8);
  assert.equal(gate.originalRecovery.overallRecoveryChain, 'DESIGN_DEFINED_NOT_IMPLEMENTED');
  const doc = readFileSync('docs/ORIGINAL_RECOVERY_DESIGN.md', 'utf8');
  assert.ok(doc.includes('Recipe関連付け')); assert.ok(doc.includes('Cloud Safe再評価'));
  assert.ok(doc.includes('NOT_IMPLEMENTED')); assert.equal(record.mobileRelease.decision, 'BLOCK');
  return {gate: 'DEFINED/BLOCK', adaptersEnabled: 'Face Brightness source only, not visually verified', recovery: 'NOT_IMPLEMENTED'};
});
check('INTEGRATED_CHANGE_LIST_DISCLOSED', () => {
  const declared = new Set(read('docs/INTEGRATED_CHANGES.json').files.map(f => f.file));
  for (const f of metadata.baselineOriginal78.changes) assert.ok(declared.has(f.file), f.file);
  assert.equal(metadata.baselineOriginal78.unexpectedChanges.length, 0);
  return {original78Unmodified: metadata.baselineOriginal78.matched, authorizedChanged: metadata.baselineOriginal78.changes.length,
    addedSourceFiles: metadata.addedSources.length, limitation: 'Old78/78 Evidence preserved; current code is NOT byte-identical to old78'};
});

// An additive join onto the immutable Registry. No duplicate Feature or formal requirement is created.
const registryPath = 'docs/evidence/evoto-2026-10-03/registry-01/feature-registry.json';
const workflowPath = 'docs/EVOTO_AUDIT/reviews/workflow_normalization.json';
const continuationPath = 'docs/EVOTO_AUDIT/reviews/audit_continuation.json';
const registry = read(registryPath), workflow = read(workflowPath);
const keyToFeatures = new Map();
for (const f of registry.canonicalFeatures) for (const key of f.source_fact_keys) {
  const ids = keyToFeatures.get(key) ?? []; ids.push(f.feature_id); keyToFeatures.set(key, ids);
}
const workflowLinks = workflow.factAssignments.map(f => ({source_fact_key: f.sourceFactKey,
  feature_ids: [...new Set(keyToFeatures.get(f.sourceFactKey) ?? [])],
  memberships: f.workflowMemberships, source_order: f.sourceOrder, evidence_locator: f.evidenceLocator,
  source_snapshot: f.sourceConditionSnapshot, verification: f.chainVerification,
  current_account_applicability: 'UNKNOWN', region_applicability: 'UNKNOWN', plan_applicability: 'UNKNOWN',
  scope: 'Source-order/membership only; not Native execution or feature Parity'}));
check('WORKFLOW_INTERPRETATION_LINKED_WITHOUT_NEW_FEATURES', () => {
  assert.equal(workflowLinks.length, 458); assert.equal(new Set(workflowLinks.map(f => f.source_fact_key)).size, 458);
  for (const f of workflowLinks) {assert.ok(f.feature_ids.length); assert.equal(f.verification, 'NOT_VERIFIED');}
  return {sourceOperations: 458, mappedOperations: workflowLinks.length,
    existingRegistryFeatureIDs: new Set(workflowLinks.flatMap(f => f.feature_ids)).size,
    workflowMemberships: workflowLinks.reduce((n, f) => n + f.memberships.length, 0),
    newFeatures: 0, executedWorkflows: 0, gate: 'BLOCK'};
});

const sourceDDL = ['apps/backend/src/repository.ts', 'apps/backend/src/workspace.ts'].map(file => ({file,
  declarations: readFileSync(file, 'utf8').split(/\r?\n/).filter(line => /CREATE TABLE|CREATE TRIGGER|ALTER TABLE/.test(line)),
  status: 'CURRENT_SOURCE_SNAPSHOT_ONLY', baselineComparison: 'NOT_AVAILABLE_NO_PRIOR_DDL_SNAPSHOT',
  changeReview: 'Main/reviewer made validator and method changes only; no new columns, table, migration or RAW-in-DB storage'}));
const pass = checks.filter(c => c.status === 'PASS').length;
writeFileSync(output, JSON.stringify({schemaVersion: 1, startedAt, endedAt: new Date().toISOString(),
  buildID: metadata.build.id, commitSHA: metadata.environment.commitSHA_display,
  commitReason: metadata.environment.commitReason_display, environment: metadata.environment,
  command: ['node', 'docs/tools/check-person-integration.mjs', path.relative(process.cwd(), directory).replaceAll('\\', '/')],
  summary: {checks: checks.length, pass, fail: checks.length - pass, skip: 0}, checks,
  pathResults, sourceDDL, modifiedOriginalSources: metadata.baselineOriginal78.changes, addedSources: metadata.addedSources,
  faceBrightness: 'IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED', commonGate: 'BLOCK', featureParity: 'BLOCK', mobileRelease: 'BLOCK',
  limitation: 'Evidence/static checks are separate from 154 Windows tests; no Native/pixel/RAW/provider execution'}, null, 2) + '\n', {flag: 'wx'});
writeFileSync(path.join(directory, 'WORKFLOW_PARITY_SUPPLEMENT.json'), JSON.stringify({schemaVersion: 1,
  generatedAt: new Date().toISOString(), status: 'ADDITIVE_INTERPRETATION_PARTIAL_NOT_PARITY_PASS',
  buildID: metadata.build.id, sourceReferences: [registryPath, workflowPath, continuationPath].map(file => ({file, sha256: sha(file)})),
  sourceAssignments: workflowLinks,
  credit163: {sourceClassification: {NO_CREDIT: 36, CREDIT_REQUIRED: 18, CONDITIONAL_CREDIT: 94, UNKNOWN: 15},
    currentAccountRegionPlanApplicability: 'UNKNOWN_ALL_163', source: 'docs/EVOTO_AUDIT/reviews/credit_normalization.json'},
  suiteImplementationSupplement: {feature_id: 'SUITE-PERSON-FACE-BRIGHTNESS-CUSTOM-EV',
    requirementChange: 'NONE; existing person-correction requirement limited to one source candidate',
    implementationStatus: 'IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED', suiteStatus: 'B',
    exactEvotoFeatureEquivalence: 'UNKNOWN; no automatic name/slider/platform/plan equivalence',
    personSafetyDataTests: record.testCatalog.filter(t => /portrait-recipe.test|person-integrity-paths.test/.test(t.file)).map(t => t.id),
    actualImageAndDeviceVerification: 'NOT_RUN', parity: 'BLOCK'},
  remainingCorrections: ['Skin', 'Eyes', 'Contacts', 'Face Shape', 'Makeup', 'Hair', 'Body', 'Cross-photo tracking', 'Person-based Batch'].map(name => ({name, status: 'NOT_IMPLEMENTED', native: 'NOT_RUN', parity: 'BLOCK'})),
  notes: ['All existing Feature IDs retained. 458 source operations are not 458 verified workflows.',
    'No frozen review or original Registry changed. No formal P0/P1 or new requirements adopted.',
    'Windows Recipe safety does not establish Evoto Feature Parity or Native implementation completion.'],
  featureParityGate: 'BLOCK', mobileReleaseGate: 'BLOCK'}, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output, checks: checks.length, pass, fail: checks.length - pass, pathDataPass: pathResults.filter(p => p.windows_status === 'PASS').length, commonGate: 'BLOCK'}));
if (pass !== checks.length) process.exitCode = 1;
