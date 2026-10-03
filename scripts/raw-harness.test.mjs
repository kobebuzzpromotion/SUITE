// Harness mechanics only. These byte buffers are NOT RAW photos and never certify RAW/device QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  CHECKOUT, METRICS, isWithin, guardExternalDataRoot, sniffContainer,
  inspectDataset, runAdapter, assessAdapterEvidence, runDatasetPipeline, pipelinePrerequisites,
} from './raw-harness.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'suite-harness-mechanics-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('path guard rejects checkout, descendants and ancestors; sibling prefix is not a descendant', async () => {
  assert.equal(isWithin(path.join(CHECKOUT, 'photo.raw'), CHECKOUT), true);
  assert.equal(isWithin(`${CHECKOUT}-test-data`, CHECKOUT), false);
  await assert.rejects(guardExternalDataRoot(CHECKOUT), /OUTSIDE_CHECKOUT/);
  await assert.rejects(guardExternalDataRoot(path.join(CHECKOUT, 'does-not-exist', 'RAW')), /OUTSIDE_CHECKOUT/);
  await assert.rejects(guardExternalDataRoot(path.dirname(CHECKOUT)), /OUTSIDE_CHECKOUT/);
});

test('JPEG/PNG payload detection rejects renamed images without trusting a filename', () => {
  assert.equal(sniffContainer(Buffer.from([255, 216, 255, 224])).reason, 'JPEG_IS_NOT_RAW');
  assert.equal(sniffContainer(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])).reason, 'PNG_IS_NOT_RAW');
  assert.equal(sniffContainer(Buffer.from('this is not a photo')).format, null);
  assert.equal(sniffContainer(Buffer.from([73, 73, 42, 0, 8, 0, 0, 0])).format, 'TIFF-family (RAW unverified)');
});

test('RAF signature is 16 bytes including the trailing space; prefix alone is not accepted', () => {
  const signature = Buffer.from('FUJIFILMCCD-RAW ', 'ascii');
  assert.equal(signature.length, 16);
  assert.equal(sniffContainer(signature).format, 'RAF');
  assert.equal(sniffContainer(Buffer.concat([signature, Buffer.from('0201')])).format, 'RAF');
  assert.equal(sniffContainer(signature.subarray(0, 15)).format, null);
  assert.equal(sniffContainer(Buffer.from('FUJIFILMCCD-RAWx', 'ascii')).format, null);
  // These are in-memory signature test bytes, not real RAW validation or decoder proof.
});

test('absent real RAW set has null counts and is explicitly externally blocked', async t => {
  const root = await fixture(t);
  const result = await inspectDataset({ root, count: 100 });
  assert.equal(result.status, 'BLOCKED_EXTERNAL_ENVIRONMENT');
  assert.equal(result.reason, 'RAW_SET_NOT_PLACED');
  assert.equal(result.fileCount, null);
  assert.equal(result.totalBytes, null);
  assert.equal(result.rawDecoderValidation, 'NOT_RUN');
  assert.equal(result.deviceQA, 'BLOCKED_EXTERNAL_ENVIRONMENT');
});

test('empty dataset is zero observed files, not a successful 100 RAW test', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '100'));
  const result = await inspectDataset({ root, count: 100 });
  assert.equal(result.status, 'BLOCKED_EXTERNAL_ENVIRONMENT');
  assert.equal(result.fileCount, 0);
  assert.equal(result.totalBytes, 0);
  assert.equal(result.averageFileSize, null);
  assert.equal(result.reason, 'EXPECTED_RAW_SET_NOT_PLACED_OR_INCOMPLETE');
});

test('manifest measures arbitrary test bytes exactly but rejects them as RAW', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '100'));
  const content = Buffer.from('HARNESS MECHANICS ONLY — NOT A PHOTO');
  const file = path.join(root, '100', 'unit-fixture.bin');
  await writeFile(file, content);
  const result = await inspectDataset({ root, count: 100 });
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.fileCount, 1);
  assert.equal(result.totalBytes, content.length);
  assert.equal(result.averageFileSize, content.length);
  assert.equal(result.minFileSize, content.length);
  assert.equal(result.maxFileSize, content.length);
  assert.equal(result.files[0].sha256, createHash('sha256').update(content).digest('hex'));
  assert.equal(result.files[0].rawFormat, null);
  assert.equal(result.files[0].cameraMaker, null);
  assert.equal(result.files[0].cameraModel, null);
  assert.equal(result.files[0].metadataStatus, 'UNVERIFIED');
  assert.deepEqual(await readFile(file), content);
});

test('bounded TIFF metadata reader reports only embedded tags, not camera compatibility', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '100'));
  // Synthetic metadata STRUCTURE with .bin extension, not a RAW file or decoder fixture.
  const bytes = Buffer.alloc(100);
  bytes.write('II', 0); bytes.writeUInt16LE(42, 2); bytes.writeUInt32LE(8, 4);
  bytes.writeUInt16LE(2, 8);
  bytes.writeUInt16LE(271, 10); bytes.writeUInt16LE(2, 12); bytes.writeUInt32LE(11, 14); bytes.writeUInt32LE(40, 18);
  bytes.writeUInt16LE(272, 22); bytes.writeUInt16LE(2, 24); bytes.writeUInt32LE(11, 26); bytes.writeUInt32LE(60, 30);
  bytes.write('UNIT_MAKER\0', 40); bytes.write('UNIT_MODEL\0', 60);
  await writeFile(path.join(root, '100', 'metadata-structure.bin'), bytes);
  const result = await inspectDataset({ root, count: 100 });
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.files[0].cameraMaker, 'UNIT_MAKER');
  assert.equal(result.files[0].cameraModel, 'UNIT_MODEL');
  assert.equal(result.files[0].metadataStatus, 'EMBEDDED_TIFF_TAGS_READ');
  assert.equal(result.files[0].supportedCamera, 'UNVERIFIED');
  assert.equal(result.files[0].rawValidation, 'REJECTED');
});

test('unsupported set size is rejected instead of turning a mechanics fixture into RAW QA', async t => {
  const root = await fixture(t);
  await assert.rejects(inspectDataset({ root, count: 1 }), /SET_MUST_BE/);
});

test('pipeline without data/native adapter returns null measurements, never zero or success', async t => {
  const root = await fixture(t);
  const result = await runDatasetPipeline({ root, count: 500 });
  assert.equal(result.status, 'BLOCKED_EXTERNAL_ENVIRONMENT');
  assert.ok(result.blockers.includes('RAW_SET_NOT_PLACED'));
  assert.ok(result.blockers.includes('NOT_CONNECTED_ADAPTER'));
  assert.deepEqual(result.prerequisites.externalEnvironment, ['RAW_SET_NOT_PLACED']);
  assert.deepEqual(result.prerequisites.implementation, []);
  assert.ok(result.prerequisites.connection.includes('NOT_CONNECTED_ADAPTER'));
  assert.ok(result.developmentRemainders.includes('PHYSICAL_IPHONE_IPAD_QA_ADAPTER_UNIMPLEMENTED'));
  for (const metric of Object.values(result.metrics)) {
    assert.equal(metric.value, null);
    assert.equal(metric.status, 'UNVERIFIED');
  }
  assert.equal(result.integrityAfter, 'NOT_RUN');
  assert.equal(result.deviceQA, 'BLOCKED_EXTERNAL_ENVIRONMENT');
});

test('source presence does not make an unconnected adapter an external-environment failure or success', () => {
  // Classification input only: no synthetic RAW file or pipeline success is created.
  const manifest = { status: 'MANIFEST_READY_RAW_UNVERIFIED' };
  const result = pipelinePrerequisites({ manifest, workDirectory: '/external/test-output' });
  assert.equal(result.status, 'NOT_CONNECTED_ADAPTER');
  assert.deepEqual(result.externalEnvironment, []);
  assert.deepEqual(result.implementation, []);
  assert.deepEqual(result.connection, ['NOT_CONNECTED_ADAPTER']);
  const notConnected = pipelinePrerequisites({ manifest, adapter: { command: 'not-executed-here' } });
  assert.equal(notConnected.status, 'NOT_CONNECTED');
  assert.deepEqual(notConnected.connection, ['WORK_DIRECTORY_NOT_CONNECTED']);
});

test('adapter protocol transports explicit input, but protocol success is not RAW QA', async t => {
  const workDirectory = await fixture(t);
  const result = await runAdapter({
    command: process.execPath, args: ['-e', "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const r=JSON.parse(s);process.stdout.write(JSON.stringify({type:'protocolTestOnly',value:r.test})+'\\n')})"],
    request: { test: '機構試験のみ' }, workDirectory, timeoutMs: 10000,
  });
  assert.equal(result.status, 'EXITED');
  assert.deepEqual(result.events, [{ type: 'protocolTestOnly', value: '機構試験のみ' }]);
  const assessed = assessAdapterEvidence(result, { files: [], manifestChecksum: 'not-real-raw' });
  assert.ok(assessed.problems.includes('NATIVE_ADAPTER_ENVIRONMENT_MISSING'));
  assert.ok(assessed.problems.includes('NOT_ALL_ASSETS_COMPLETED'));
});

test('adapter process start failure is explicit', async t => {
  const workDirectory = await fixture(t);
  const result = await runAdapter({ command: path.join(workDirectory, 'no-such-native-adapter'), request: {}, workDirectory, timeoutMs: 10000 });
  assert.match(result.status, /^ADAPTER_START_FAILED:/);
});

test('adapter timeout is recorded; no completed result is fabricated', async t => {
  const workDirectory = await fixture(t);
  const result = await runAdapter({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], request: {}, workDirectory, timeoutMs: 200 });
  assert.equal(result.status, 'TIMED_OUT');
  assert.equal(result.events.length, 0);
});

test('adapter cancellation is recorded distinctly from timeout/failure', async t => {
  const workDirectory = await fixture(t);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  t.after(() => clearTimeout(timer));
  const result = await runAdapter({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], request: {}, workDirectory, timeoutMs: 10000, signal: controller.signal });
  assert.equal(result.status, 'CANCELLED');
});

test('invalid adapter JSON fails closed', async t => {
  const workDirectory = await fixture(t);
  const result = await runAdapter({ command: process.execPath, args: ['-e', "process.stdout.write('not-json\\n')"], request: {}, workDirectory, timeoutMs: 10000 });
  assert.equal(result.status, 'ADAPTER_PROTOCOL_INVALID_JSON');
});

test('partial last event is rejected, not silently accepted', async t => {
  const workDirectory = await fixture(t);
  const result = await runAdapter({ command: process.execPath, args: ['-e', "process.stdout.write('{}')"], request: {}, workDirectory, timeoutMs: 10000 });
  assert.equal(result.status, 'ADAPTER_PROTOCOL_UNTERMINATED_LINE');
});

test('missing/invalid measured values remain unverified rather than 0', () => {
  const result = assessAdapterEvidence({ status: 'EXITED', events: [
    { type: 'measurement', name: 'peakMemoryBytes', value: null, unit: 'bytes', evidence: 'unavailable' },
    { type: 'measurement', name: 'concurrency', value: 0, unit: 'count', evidence: 'not measured' },
  ] }, { files: [], manifestChecksum: 'not-real-data' });
  assert.equal(Object.keys(result.metrics).length, Object.keys(METRICS).length);
  assert.equal(result.metrics.peakMemoryBytes.value, null);
  assert.equal(result.metrics.concurrency.value, null);
  assert.ok(result.problems.includes('INVALID_OR_DUPLICATE_MEASUREMENT'));
  assert.ok(result.problems.includes('MEASUREMENTS_INCOMPLETE'));
});

test('Mac local compute evidence cannot pass full sync/restart/Cloud Safe lifecycle', () => {
  // Protocol-only fixture: no RAW file, decoder, real process restart or device execution.
  const sha256 = 'a'.repeat(64);
  const manifest = { files: [{ relativePath: 'protocol-only.bin', sha256 }], manifestChecksum: 'protocol-only-manifest' };
  const result = assessAdapterEvidence({ status: 'EXITED', events: [
    { type: 'environment', schemaVersion: 1, kind: 'mac-native', platform: 'protocol fixture', osVersion: 'not a tested OS', adapterVersion: 'protocol-only', rawDecoder: 'not executed' },
    ...Object.entries(METRICS).map(([name, unit]) => ({ type: 'measurement', name, unit, value: 1, evidence: 'protocol validator fixture; not measurements' })),
    { type: 'assetComplete', relativePath: 'protocol-only.bin', sourceSha256: sha256,
      rawDecoded: true, originalUnchanged: true, recipeReloaded: true, exportInputFixed: true,
      exportInput: { representation: 'original', sourceSha256: sha256, recipeRevision: 0 },
      stages: { import: 'PASS', proxyGeneration: 'PASS', originalFetch: 'PASS', exportPreparation: 'PASS', finalExport: 'PASS', cleanupRecovery: 'PASS' },
      evidence: 'Local metadata reopen only; intentionally missing lifecycle fields' },
    { type: 'batchComplete', status: 'PASS', fileCount: 1, manifestChecksum: manifest.manifestChecksum },
  ] }, manifest);
  assert.equal(result.completedAssets, 0);
  assert.ok(result.problems.includes('ASSET_EVIDENCE_INCOMPLETE'));
  assert.ok(result.problems.includes('NOT_ALL_ASSETS_COMPLETED'));
  for (const stage of ['sync', 'recipeSave', 'restartRecovery', 'cloudSafe']) {
    assert.ok(result.problems.includes(`REQUIRED_STAGE_NOT_PASSED:${stage}`));
  }
  assert.equal(result.problems.includes('MEASUREMENTS_INCOMPLETE'), false);
});
