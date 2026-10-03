#!/usr/bin/env node
// Read-only RAW qualification and measurements. Container evidence is NOT decoder/QA success.
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, open, readdir, realpath, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

export const CHECKOUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_RAW_ROOT = 'C:\\Users\\user\\Documents\\Codex\\2026-10-03\\SUITE_TEST_DATA\\RAW';
export const METRICS = Object.freeze({
  importTimeMs: 'ms', proxyGenerationTimeMs: 'ms', peakMemoryBytes: 'bytes',
  diskCacheBytes: 'bytes', dbGrowthBytes: 'bytes', cpuUserMicros: 'microseconds',
  cpuSystemMicros: 'microseconds', concurrency: 'count', failureCount: 'count',
  retryCount: 'count', originalFetchLatencyMs: 'ms', exportPreparationTimeMs: 'ms',
  cleanupRecoveryTimeMs: 'ms',
});
const RAW_EXTENSIONS = new Set(['.raw', '.dng', '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.raf', '.orf', '.rw2', '.rwl', '.pef', '.ptx', '.srw', '.x3f', '.3fr', '.fff', '.iiq', '.kdc', '.dcr', '.mos', '.mrw', '.erf']);
// 16 bytes including the trailing ASCII space (libopenraw RAF_MAGIC).
const RAF_MAGIC = Buffer.from('FUJIFILMCCD-RAW ', 'ascii');
// QA v1 completeness correction: local compute evidence alone is not full lifecycle proof.
// These stage requirements do not introduce application APIs or change storage contracts.
const STAGES = ['import', 'proxyGeneration', 'sync', 'recipeSave', 'restartRecovery', 'cloudSafe',
  'originalFetch', 'exportPreparation', 'finalExport', 'cleanupRecovery'];
const integer = value => Number.isSafeInteger(value) && value >= 0;

export function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function resolvedEvenIfMissing(candidate) {
  let cursor = path.resolve(candidate);
  const tail = [];
  while (true) {
    try { return path.join(await realpath(cursor), ...tail.reverse()); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      tail.push(path.basename(cursor)); cursor = parent;
    }
  }
}

export async function guardExternalDataRoot(rawRoot, checkout = CHECKOUT) {
  const actualRoot = await resolvedEvenIfMissing(rawRoot);
  const actualCheckout = await resolvedEvenIfMissing(checkout);
  if (isWithin(actualRoot, actualCheckout) || isWithin(actualCheckout, actualRoot)) {
    throw new Error('RAW_ROOT_MUST_BE_OUTSIDE_CHECKOUT_AND_NOT_CONTAIN_IT');
  }
  return actualRoot;
}

function checkAbort(signal) { signal?.throwIfAborted(); }

export async function checksumFile(filePath, signal) {
  checkAbort(signal);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath, { signal })) hash.update(chunk);
  return hash.digest('hex');
}

// This is bounded TIFF metadata inspection, never RAW decoding or camera support certification.
async function tiffMetadata(handle, header, size) {
  const little = header.subarray(0, 2).toString('ascii') === 'II';
  const u16 = (buffer, offset) => little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  const u32 = (buffer, offset) => little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  const result = { cameraMaker: null, cameraModel: null, dngVersion: null, metadataStatus: 'UNVERIFIED' };
  if (size < 8 || !['II', 'MM'].includes(header.subarray(0, 2).toString('ascii'))) return result;
  const magic = u16(header, 2);
  if (![42, 85, 0x4f52, 0x5352].includes(magic)) return result;
  let offset = u32(header, 4);
  const visited = new Set();
  for (let depth = 0; offset && depth < 8; depth++) {
    if (visited.has(offset) || offset < 8 || offset + 2 > size) break;
    visited.add(offset);
    const countBuffer = Buffer.alloc(2);
    if ((await handle.read(countBuffer, 0, 2, offset)).bytesRead !== 2) break;
    const count = u16(countBuffer, 0);
    if (count > 512 || offset + 2 + count * 12 + 4 > size) break;
    const entries = Buffer.alloc(count * 12 + 4);
    if ((await handle.read(entries, 0, entries.length, offset + 2)).bytesRead !== entries.length) break;
    for (let i = 0; i < count; i++) {
      const start = i * 12, tag = u16(entries, start), type = u16(entries, start + 2), length = u32(entries, start + 4);
      if (tag === 50706 && type === 1 && length === 4) {
        const version = [...entries.subarray(start + 8, start + 12)];
        if (version[0] === 1) result.dngVersion = version.join('.');
      }
      if (![271, 272].includes(tag) || type !== 2 || length < 2 || length > 256) continue;
      let value;
      if (length <= 4) value = entries.subarray(start + 8, start + 8 + length);
      else {
        const position = u32(entries, start + 8);
        if (position < 8 || position + length > size) continue;
        value = Buffer.alloc(length);
        if ((await handle.read(value, 0, length, position)).bytesRead !== length) continue;
      }
      const decoded = value.toString('utf8').replace(/\0.*$/s, '').trim();
      if (decoded && !/[\x00-\x1f\x7f\ufffd]/.test(decoded)) {
        result[tag === 271 ? 'cameraMaker' : 'cameraModel'] = decoded;
      }
    }
    offset = u32(entries, count * 12);
  }
  if (result.cameraMaker || result.cameraModel) result.metadataStatus = 'EMBEDDED_TIFF_TAGS_READ';
  return result;
}

export function sniffContainer(header) {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return { format: 'JPEG', rejected: true, reason: 'JPEG_IS_NOT_RAW' };
  if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { format: 'PNG', rejected: true, reason: 'PNG_IS_NOT_RAW' };
  if (/^GIF8[79]a/.test(header.subarray(0, 6).toString('ascii'))) return { format: 'GIF', rejected: true, reason: 'GIF_IS_NOT_RAW' };
  if (header.length >= RAF_MAGIC.length && header.subarray(0, RAF_MAGIC.length).equals(RAF_MAGIC)) return { format: 'RAF', rejected: false };
  if (header.length >= 12 && header.subarray(0, 4).equals(Buffer.from([73, 73, 42, 0])) && header.subarray(8, 12).equals(Buffer.from([67, 82, 2, 0]))) return { format: 'CR2', rejected: false };
  if (header.length >= 16 && header.subarray(4, 8).toString('ascii') === 'ftyp') {
    const boxSize = header.readUInt32BE(0);
    const brands = [header.subarray(8, 12).toString('ascii')];
    for (let i = 16; i + 4 <= Math.min(boxSize, header.length); i += 4) brands.push(header.subarray(i, i + 4).toString('ascii'));
    if (brands.includes('crx ') || brands.includes('cr3 ')) return { format: 'CR3', rejected: false };
  }
  if (header.subarray(0, 4).equals(Buffer.from([0, 77, 82, 77]))) return { format: 'MRW', rejected: false };
  if (header.subarray(0, 4).equals(Buffer.from([73, 73, 85, 0]))) return { format: 'RW2', rejected: false };
  if (['IIRO', 'IIRS', 'MMOR'].includes(header.subarray(0, 4).toString('ascii'))) return { format: 'ORF', rejected: false };
  if (header.subarray(0, 4).equals(Buffer.from([73, 73, 42, 0])) || header.subarray(0, 4).equals(Buffer.from([77, 77, 0, 42]))) return { format: 'TIFF-family (RAW unverified)', rejected: false };
  return { format: null, rejected: false, reason: 'CONTAINER_UNVERIFIED' };
}

async function inspectFile(filePath, datasetRoot, signal) {
  checkAbort(signal);
  const before = await lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('NON_REGULAR_FILE_OR_LINK');
  if (!isWithin(await realpath(filePath), datasetRoot)) throw new Error('FILE_ESCAPES_DATASET');
  const handle = await open(filePath, 'r');
  try {
    const current = await handle.stat();
    if (current.dev !== before.dev || current.ino !== before.ino) throw new Error('FILE_CHANGED_DURING_OPEN');
    const header = Buffer.alloc(Math.min(current.size, 4096));
    await handle.read(header, 0, header.length, 0);
    const container = sniffContainer(header);
    const metadata = await tiffMetadata(handle, header, current.size);
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ start: 0, autoClose: false, signal })) hash.update(chunk);
    const after = await handle.stat();
    if (current.size !== after.size || current.mtimeMs !== after.mtimeMs || current.ctimeMs !== after.ctimeMs) throw new Error('FILE_CHANGED_DURING_MANIFEST');
    const extension = path.extname(filePath).toLowerCase();
    const rejected = container.rejected || !RAW_EXTENSIONS.has(extension) || current.size === 0;
    return {
      relativePath: path.relative(datasetRoot, filePath).split(path.sep).join('/'),
      bytes: current.size, sha256: hash.digest('hex'),
      cameraMaker: metadata.cameraMaker, cameraModel: metadata.cameraModel,
      metadataStatus: metadata.metadataStatus,
      rawFormat: metadata.dngVersion ? 'DNG' : container.format,
      dngVersion: metadata.dngVersion, extensionHint: extension,
      rawValidation: rejected ? 'REJECTED' : 'REQUIRES_RAW_DECODER',
      reason: container.rejected ? container.reason : !RAW_EXTENSIONS.has(extension) ? 'NOT_RAW_EXTENSION' : current.size === 0 ? 'EMPTY_FILE' : container.reason ?? null,
      supportedCamera: 'UNVERIFIED',
    };
  } finally { await handle.close(); }
}

async function collectFiles(directory, signal, output = []) {
  checkAbort(signal);
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const next = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('DATASET_SYMLINK_REJECTED');
    if (entry.isDirectory()) await collectFiles(next, signal, output);
    else if (entry.isFile()) output.push(next);
    else throw new Error('DATASET_NON_REGULAR_FILE_REJECTED');
  }
  return output;
}

export async function inspectDataset({ root = DEFAULT_RAW_ROOT, count, checkout = CHECKOUT, signal } = {}) {
  if (![100, 500, 1000].includes(count)) throw new Error('SET_MUST_BE_100_500_OR_1000');
  const rawRoot = await guardExternalDataRoot(root, checkout);
  const datasetRoot = path.join(rawRoot, String(count));
  const manifest = {
    schemaVersion: 1, mode: 'manifest-only', generatedAt: new Date().toISOString(),
    datasetRoot, expectedFileCount: count, status: 'BLOCKED_EXTERNAL_ENVIRONMENT',
    reason: null, fileCount: null, totalBytes: null, averageFileSize: null,
    minFileSize: null, maxFileSize: null, manifestChecksum: null,
    rawDecoderValidation: 'NOT_RUN', files: [],
    deviceQA: 'BLOCKED_EXTERNAL_ENVIRONMENT',
    note: 'Manifest/container inspection is not RAW decoding, load-test success, or iPhone/iPad QA.',
  };
  try {
    const state = await lstat(datasetRoot);
    if (!state.isDirectory() || state.isSymbolicLink()) throw new Error('DATASET_DIRECTORY_OR_SYMLINK_INVALID');
    if (!isWithin(await realpath(datasetRoot), rawRoot)) throw new Error('DATASET_ESCAPES_RAW_ROOT');
    for (const file of await collectFiles(datasetRoot, signal)) manifest.files.push(await inspectFile(file, datasetRoot, signal));
    const sizes = manifest.files.map(file => file.bytes);
    manifest.fileCount = sizes.length;
    manifest.totalBytes = sizes.reduce((sum, value) => sum + value, 0);
    manifest.averageFileSize = sizes.length ? manifest.totalBytes / sizes.length : null;
    manifest.minFileSize = sizes.length ? Math.min(...sizes) : null;
    manifest.maxFileSize = sizes.length ? Math.max(...sizes) : null;
    manifest.manifestChecksum = createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex');
    if (manifest.files.some(file => file.rawValidation === 'REJECTED')) {
      manifest.status = 'REJECTED'; manifest.reason = 'NON_RAW_OR_INVALID_FILE';
    } else if (sizes.length !== count) manifest.reason = 'EXPECTED_RAW_SET_NOT_PLACED_OR_INCOMPLETE';
    else { manifest.status = 'MANIFEST_READY_RAW_UNVERIFIED'; manifest.reason = 'RAW_DECODER_REQUIRED'; }
  } catch (error) {
    if (signal?.aborted) { manifest.status = 'CANCELLED'; manifest.reason = 'USER_CANCELLED'; }
    else if (error.code === 'ENOENT') manifest.reason = 'RAW_SET_NOT_PLACED';
    else { manifest.status = 'REJECTED'; manifest.reason = error.message; }
  }
  return manifest;
}

function emptyMetrics(reason) {
  return Object.fromEntries(Object.entries(METRICS).map(([name, unit]) => [name, { value: null, unit, status: 'UNVERIFIED', reason }]));
}

function validMetric(name, metric) {
  return Object.hasOwn(METRICS, name) && metric && metric.unit === METRICS[name]
    && Number.isFinite(metric.value) && metric.value >= 0
    && typeof metric.evidence === 'string' && metric.evidence.trim().length > 0
    && (!['count', 'bytes', 'microseconds'].includes(metric.unit) || integer(metric.value))
    && (name !== 'concurrency' || metric.value > 0);
}

// The adapter runs ONE real batch. JSONL is bounded and shell evaluation is never used.
// The harness does not provide an image decoder, simulator, fake RAW or substitute device evidence.
export async function runAdapter({ command, args = [], request, workDirectory, timeoutMs = 900000, signal } = {}) {
  if (typeof command !== 'string' || !command || !Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('INVALID_ADAPTER_COMMAND');
  if (!integer(timeoutMs) || timeoutMs < 1 || timeoutMs > 86400000) throw new Error('INVALID_TIMEOUT');
  checkAbort(signal);
  return new Promise(resolve => {
    const events = [], started = performance.now();
    let pending = '', bytes = 0, stderr = '', failure = null, timer, escalation;
    const child = spawn(command, args, { cwd: workDirectory, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stop = reason => {
      failure ??= reason;
      child.kill('SIGTERM');
      escalation ??= setTimeout(() => child.kill('SIGKILL'), 1000);
    };
    const abort = () => stop('CANCELLED');
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => stop('TIMED_OUT'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > 4 * 1024 * 1024) return stop('ADAPTER_OUTPUT_LIMIT');
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline).trim(); pending = pending.slice(newline + 1);
        if (!line) continue;
        try { const item = JSON.parse(line); if (!item || typeof item !== 'object') throw new Error(); events.push(item); }
        catch { stop('ADAPTER_PROTOCOL_INVALID_JSON'); }
      }
    });
    child.stderr.on('data', chunk => { if (stderr.length < 16384) stderr += chunk.slice(0, 16384 - stderr.length); });
    child.on('error', error => { failure ??= `ADAPTER_START_FAILED:${error.code ?? 'UNKNOWN'}`; });
    child.stdin.on('error', () => { /* close/exit is authoritative; EPIPE is not success. */ });
    child.on('close', (exitCode, exitSignal) => {
      clearTimeout(timer); clearTimeout(escalation); signal?.removeEventListener('abort', abort);
      if (pending.trim()) failure ??= 'ADAPTER_PROTOCOL_UNTERMINATED_LINE';
      resolve({ status: failure ?? (exitCode === 0 ? 'EXITED' : 'ADAPTER_FAILED'), exitCode, exitSignal, wallTimeMs: performance.now() - started, events, stderr });
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

export function assessAdapterEvidence(result, manifest) {
  const metrics = emptyMetrics('ADAPTER_MEASUREMENT_NOT_SUPPLIED');
  const problems = [];
  const hellos = result.events.filter(event => event.type === 'environment');
  const finals = result.events.filter(event => event.type === 'batchComplete');
  const expected = new Map(manifest.files.map(file => [file.relativePath, file]));
  const completed = new Set();
  const environment = hellos.length === 1 ? hellos[0] : null;
  if (!environment || environment.schemaVersion !== 1 || !['mac-native', 'physical-iphone', 'physical-ipad'].includes(environment.kind)
      || !['platform', 'osVersion', 'adapterVersion', 'rawDecoder'].every(key => typeof environment[key] === 'string' && environment[key].trim())) problems.push('NATIVE_ADAPTER_ENVIRONMENT_MISSING');
  if (environment && environment.kind !== 'mac-native' && (typeof environment.deviceModel !== 'string' || !environment.deviceModel.trim())) problems.push('PHYSICAL_DEVICE_MODEL_MISSING');
  for (const event of result.events) {
    if (event.type === 'measurement') {
      if (!validMetric(event.name, event) || metrics[event.name]?.status === 'MEASURED') problems.push('INVALID_OR_DUPLICATE_MEASUREMENT');
      else metrics[event.name] = { value: event.value, unit: event.unit, status: 'MEASURED', evidence: event.evidence };
    } else if (event.type === 'assetComplete') {
      const source = expected.get(event.relativePath);
      for (const stage of STAGES) {
        if (event.stages?.[stage] !== 'PASS') problems.push(`REQUIRED_STAGE_NOT_PASSED:${stage}`);
      }
      if (!source || completed.has(event.relativePath) || event.sourceSha256 !== source.sha256 || event.rawDecoded !== true
          || event.originalUnchanged !== true || event.recipeReloaded !== true || event.exportInputFixed !== true
          || event.exportInput?.representation !== 'original' || event.exportInput?.sourceSha256 !== source.sha256
          || !integer(event.exportInput?.recipeRevision)
          || typeof event.evidence !== 'string' || !event.evidence.trim()
          || !STAGES.every(stage => event.stages?.[stage] === 'PASS')) problems.push('ASSET_EVIDENCE_INCOMPLETE');
      else completed.add(event.relativePath);
    } else if (!['environment', 'batchComplete'].includes(event.type)) problems.push('UNKNOWN_ADAPTER_EVENT');
  }
  if (result.status !== 'EXITED') problems.push(result.status);
  if (completed.size !== expected.size || expected.size === 0) problems.push('NOT_ALL_ASSETS_COMPLETED');
  if (finals.length !== 1 || finals[0].status !== 'PASS' || finals[0].fileCount !== expected.size || finals[0].manifestChecksum !== manifest.manifestChecksum) problems.push('BATCH_COMPLETION_MISSING');
  if (Object.values(metrics).some(metric => metric.status !== 'MEASURED')) problems.push('MEASUREMENTS_INCOMPLETE');
  return { metrics, environment, completedAssets: completed.size, problems: [...new Set(problems)] };
}

export function pipelinePrerequisites({ manifest, adapter, workDirectory }) {
  const externalEnvironment = [], implementation = [], connection = [], input = [];
  if (manifest.status === 'BLOCKED_EXTERNAL_ENVIRONMENT') externalEnvironment.push(manifest.reason ?? 'RAW_DATA_UNAVAILABLE');
  else if (manifest.status !== 'MANIFEST_READY_RAW_UNVERIFIED') input.push(manifest.reason ?? manifest.status);
  // Mac-local QA adapter source now exists, but a built executable/configuration is not
  // implied by source presence. Cloud/device adapters remain separate development work.
  if (!adapter) connection.push('NOT_CONNECTED_ADAPTER');
  if (!workDirectory) connection.push('WORK_DIRECTORY_NOT_CONNECTED');
  const status = input.length ? manifest.status
    : externalEnvironment.length ? 'BLOCKED_EXTERNAL_ENVIRONMENT'
      : implementation.length ? 'UNIMPLEMENTED_ADAPTER'
        : connection.includes('NOT_CONNECTED_ADAPTER') ? 'NOT_CONNECTED_ADAPTER'
          : connection.length ? 'NOT_CONNECTED' : 'READY_TO_RUN';
  return { status, externalEnvironment, implementation, connection, input };
}

export async function runDatasetPipeline({ root = DEFAULT_RAW_ROOT, count, adapter, workDirectory, timeoutMs, signal, checkout = CHECKOUT } = {}) {
  const started = performance.now();
  const manifest = await inspectDataset({ root, count, checkout, signal });
  const report = {
    schemaVersion: 1, mode: 'full-pipeline', generatedAt: new Date().toISOString(), manifest,
    status: 'NOT_RUN', blockers: [], prerequisites: pipelinePrerequisites({ manifest, adapter, workDirectory }),
    metrics: emptyMetrics('MEASUREMENT_NOT_RUN'),
    execution: null, integrityAfter: 'NOT_RUN', environment: null,
    deviceQA: 'BLOCKED_EXTERNAL_ENVIRONMENT',
    harnessMeasurements: { wallTimeMs: null, scope: 'HARNESS_ONLY_NOT_DEVICE_OR_PIPELINE' },
    adapterScopeNote: 'Mac-local QA adapter source is present; source/configuration does not prove build or execution. Local compute alone cannot pass sync, recipeSave, restartRecovery and cloudSafe lifecycle requirements. Metadata reopen is not restart recovery. Cloud fetch and physical iPhone/iPad QA adapters are not implemented.',
    developmentRemainders: ['CLOUD_FETCH_QA_ADAPTER_UNIMPLEMENTED', 'PHYSICAL_IPHONE_IPAD_QA_ADAPTER_UNIMPLEMENTED'],
    note: 'Batch pipeline evidence is not complete iPhone/iPad QA. Device lock, thermal, permissions and T01–T30 require separate execution evidence.',
  };
  report.blockers.push(...report.prerequisites.externalEnvironment, ...report.prerequisites.implementation,
    ...report.prerequisites.connection, ...report.prerequisites.input);
  if (report.blockers.length) {
    report.status = report.prerequisites.status;
    report.harnessMeasurements.wallTimeMs = performance.now() - started; return report;
  }
  const work = await resolvedEvenIfMissing(workDirectory);
  const sourceRoot = await guardExternalDataRoot(root, checkout);
  if (isWithin(work, sourceRoot) || isWithin(sourceRoot, work)) throw new Error('WORK_DIRECTORY_MUST_NOT_OVERLAP_RAW_DATA');
  if (isWithin(work, checkout)) throw new Error('LARGE_TEST_OUTPUT_MUST_BE_OUTSIDE_CHECKOUT');
  await mkdir(work, { recursive: true });
  const request = {
    schemaVersion: 1, runId: randomUUID(), kind: 'SUITE_REAL_RAW_BATCH',
    manifest, workDirectory: work, requiredMeasurements: METRICS, requiredStages: STAGES,
    originalPolicy: 'READ_ONLY_NO_MUTATION', exportPolicy: 'ORIGINAL_ONLY_NO_PROXY_FALLBACK',
  };
  report.execution = await runAdapter({ ...adapter, request, workDirectory: work, timeoutMs, signal });
  const evidence = assessAdapterEvidence(report.execution, manifest);
  report.metrics = evidence.metrics; report.environment = evidence.environment; report.blockers.push(...evidence.problems);
  // Even after cancellation, verify source bytes. Do not delete/recreate any input or adapter output.
  try {
    for (const source of manifest.files) {
      const sourcePath = path.join(manifest.datasetRoot, ...source.relativePath.split('/'));
      const stat = await lstat(sourcePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== source.bytes || await checksumFile(sourcePath) !== source.sha256) throw new Error('ORIGINAL_CHANGED_OR_MISSING');
    }
    report.integrityAfter = 'VERIFIED_UNCHANGED';
  } catch (error) { report.integrityAfter = 'FAILED'; report.blockers.push(error.message); }
  report.status = report.blockers.length ? (report.execution.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED_OR_INCOMPLETE') : 'PIPELINE_EVIDENCE_COLLECTED';
  // No single batch report is sufficient to certify the separate iPhone/iPad mobile release gate.
  report.harnessMeasurements.wallTimeMs = performance.now() - started;
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const [mode = 'manifest', ...flags] = argv;
  if (!['manifest', 'pipeline'].includes(mode)) throw new Error('MODE_MUST_BE_manifest_OR_pipeline');
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    if (!['--root', '--sets', '--adapter', '--work-dir', '--timeout-ms', '--report'].includes(flags[i]) || flags[i + 1] === undefined || Object.hasOwn(options, flags[i])) throw new Error('INVALID_OR_DUPLICATE_CLI_OPTION');
    options[flags[i]] = flags[i + 1];
  }
  const counts = (options['--sets'] ?? '100,500,1000').split(',').map(Number);
  if (new Set(counts).size !== counts.length || !counts.length || counts.some(count => ![100, 500, 1000].includes(count))) throw new Error('INVALID_SETS');
  const root = options['--root'] ?? DEFAULT_RAW_ROOT;
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('USER_CANCELLED'));
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const adapter = options['--adapter'] ? JSON.parse(await readFile(options['--adapter'], 'utf8')) : undefined;
    if (adapter && (Object.keys(adapter).some(key => !['command', 'args'].includes(key)) || typeof adapter.command !== 'string')) throw new Error('INVALID_ADAPTER_CONFIG');
    const results = [];
    for (const count of counts) {
      results.push(await (mode === 'manifest'
        ? inspectDataset({ root, count, signal: controller.signal })
        : runDatasetPipeline({ root, count, adapter, workDirectory: options['--work-dir'], timeoutMs: options['--timeout-ms'] === undefined ? undefined : Number(options['--timeout-ms']), signal: controller.signal })));
      if (controller.signal.aborted) break;
    }
    const report = { schemaVersion: 1, mode, realDeviceQA: 'BLOCKED_EXTERNAL_ENVIRONMENT', results };
    const rendered = `${JSON.stringify(report, null, 2)}\n`;
    if (options['--report']) {
      const destination = await resolvedEvenIfMissing(options['--report']);
      if (isWithin(destination, await guardExternalDataRoot(root))) throw new Error('REPORT_MUST_NOT_BE_WRITTEN_IN_RAW_DATA');
      await mkdir(path.dirname(destination), { recursive: true });
      // No overwriting an earlier evidence report or source file.
      await writeFile(destination, rendered, { flag: 'wx' });
    }
    process.stdout.write(rendered);
    return results.every(result => ['MANIFEST_READY_RAW_UNVERIFIED', 'PIPELINE_EVIDENCE_COLLECTED'].includes(result.status)) ? 0 : controller.signal.aborted ? 130 : 2;
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`${JSON.stringify({ status: 'ERROR', error: error.message, realDeviceQA: 'BLOCKED_EXTERNAL_ENVIRONMENT' })}\n`);
    process.exitCode = 1;
  });
}
