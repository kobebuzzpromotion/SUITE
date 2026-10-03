import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage, type StorageProvider} from '../src/storage.js';
import {MultipartUploads} from '../src/multipart.js';
import {validateRecipe} from '../src/photo-policy.js';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
// Deliberately synthetic storage bytes, NOT a RAW image or decoder/device test.
const bytes = Buffer.from('synthetic-storage-failure-test-not-an-image');
const expected = {sha256: sha(bytes), size: bytes.length};

test('shared Recipe golden JSON preserves extended intent and refuses lossy/invalid input', async () => {
  const recipe = JSON.parse(await readFile(resolve('contracts/recipe-v1.example.json'), 'utf8'));
  const parameters = {...recipe.parameters};
  validateRecipe(recipe);
  assert.deepEqual(JSON.parse(JSON.stringify(recipe)), recipe);
  for (const change of [{processingOrder: []}, {rotationDegrees: Number.MAX_SAFE_INTEGER + 1}, {extendedParameters: {x: null}}, {extendedParameters: {' ': 1}}]) {
    assert.throws(() => validateRecipe({...recipe, parameters: {...parameters, ...change}}), /INVALID/);
  }
  assert.throws(() => validateRecipe({...recipe, surprise: 1}), /INVALID/);
});

test('stream interruption never publishes incomplete Original; retry resumes by reuploading safely', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-failure-'));
  try {
    const storage = new LocalObjectStorage(root);
    async function* interrupted() {yield bytes.subarray(0, 5); throw new Error('NETWORK_LOST');}
    await assert.rejects(storage.putImmutable('original', interrupted(), expected), /NETWORK_LOST/);
    assert.deepEqual(await readdir(root), []);
    await storage.putImmutable('original', Readable.from([bytes]), expected);
    assert.equal((await storage.inspect('original')).sha256, expected.sha256);
  } finally {await rm(root, {recursive: true, force: true});}
});

test('multipart survives closing/reopening, validates identity/tenant, finalizes only all parts and retries lost acknowledgement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-multipart-'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  let uploads = new MultipartUploads(join(root, 'sessions.sqlite'), storage);
  try {
    const session = uploads.begin('a', 'operation-1', {key: 'original', ...expected, partSize: 8});
    const first = bytes.subarray(0, 8);
    await uploads.putPart('a', session.id, 0, sha(first), Readable.from([first]));
    await assert.rejects(uploads.finalize('a', session.id), /PARTS_INCOMPLETE/);
    await assert.rejects(storage.inspect('original'));
    await assert.rejects(uploads.status('b', session.id), /NOT_FOUND/);
    assert.throws(() => uploads.begin('a', 'operation-1', {key: 'different', ...expected, partSize: 8}), /IDEMPOTENCY_MISMATCH/);
    uploads.close(); uploads = new MultipartUploads(join(root, 'sessions.sqlite'), storage);
    const resumed = await uploads.status('a', session.id);
    assert.deepEqual(resumed.verified, [0]);
    const damagedKey = 'part-' + session.id + '-0';
    await writeFile(join(root, 'objects', damagedKey), Buffer.alloc(first.length));
    assert.ok((await uploads.status('a', session.id)).missing.includes(0));
    await uploads.putPart('a', session.id, 0, sha(first), Readable.from([first]));
    assert.deepEqual((await uploads.status('a', session.id)).verified, [0]);
    assert.deepEqual(await readFile(join(root, 'objects', damagedKey)), Buffer.alloc(first.length));
    assert.equal(uploads.begin('a', 'operation-1', {key: 'original', ...expected, partSize: 8}).id, session.id);
    for (const index of resumed.missing) {
      const part = bytes.subarray(index * 8, (index + 1) * 8);
      await uploads.putPart('a', session.id, index, sha(part), Readable.from([part]));
    }
    assert.equal((await uploads.finalize('a', session.id)).sha256, expected.sha256);
    assert.equal((await uploads.finalize('a', session.id)).sha256, expected.sha256);
    assert.equal((await storage.inspect('original')).size, bytes.length);
  } finally {uploads.close(); await rm(root, {recursive: true, force: true});}
});

test('multipart repair fetches only the damaged part, retains old bytes and does not alter healthy parts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-repair-'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const uploads = new MultipartUploads(join(root, 'sessions.sqlite'), storage);
  try {
    const session = uploads.begin('a', 'repair-regression', {key: 'original', ...expected, partSize: 8});
    for (let i = 0; i < Math.ceil(bytes.length / 8); i++) {
      const part = bytes.subarray(i * 8, (i + 1) * 8);
      await uploads.putPart('a', session.id, i, sha(part), Readable.from([part]));
    }
    const keys = await readdir(join(root, 'objects'));
    const before = new Map(await Promise.all(keys.map(async key => [key, await readFile(join(root, 'objects', key))] as const)));
    const damaged = 'part-' + session.id + '-1', corrupt = Buffer.alloc(8, 123);
    await writeFile(join(root, 'objects', damaged), corrupt);
    const missing = (await uploads.status('a', session.id)).missing;
    assert.deepEqual(missing, [1]);
    const refetched: number[] = [];
    for (const index of missing) {
      const part = bytes.subarray(index * 8, (index + 1) * 8);
      refetched.push(index);
      await uploads.putPart('a', session.id, index, sha(part), Readable.from([part]));
    }
    assert.deepEqual(refetched, [1]);
    assert.deepEqual((await uploads.status('a', session.id)).missing, []);
    assert.equal((await readdir(join(root, 'objects'))).length, keys.length + 1);
    for (const key of keys) assert.deepEqual(await readFile(join(root, 'objects', key)), key === damaged ? corrupt : before.get(key));
    await uploads.finalize('a', session.id);
    assert.deepEqual(await readFile(join(root, 'objects', 'original')), bytes);
  } finally {uploads.close(); await rm(root, {recursive: true, force: true});}
});

test('ENOSPC provider fault leaves durable multipart checkpoint; retry after capacity restored', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-capacity-'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  let full = true;
  // Fault injection, NOT an actual filled disk or iPhone out-of-space result.
  const fault: StorageProvider = {
    inspect: key => storage.inspect(key), read: key => storage.read(key),
    putImmutable: async (key, source, expected) => {if (full) throw Object.assign(new Error('ENOSPC'), {code: 'ENOSPC'}); return storage.putImmutable(key, source, expected);}
  };
  const uploads = new MultipartUploads(join(root, 'sessions.sqlite'), fault);
  try {
    const session = uploads.begin('a', 'capacity', {key: 'original', ...expected, partSize: bytes.length});
    await assert.rejects(uploads.putPart('a', session.id, 0, expected.sha256, Readable.from([bytes])), /ENOSPC/);
    assert.deepEqual((await uploads.status('a', session.id)).missing, [0]);
    full = false;
    await uploads.putPart('a', session.id, 0, expected.sha256, Readable.from([bytes]));
    assert.equal((await uploads.finalize('a', session.id)).sha256, expected.sha256);
  } finally {uploads.close(); await rm(root, {recursive: true, force: true});}
});

test('actual killed child transaction rolls back; committed Recipe is readable after process termination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-kill-')), path = join(root, 'db.sqlite');
  const recipe = JSON.parse(await readFile(resolve('contracts/recipe-v1.example.json'), 'utf8'));
  let repo = new AssetRepository(path);
  try {
    const asset = repo.create('a', {name: 'synthetic bytes', ...expected});
    repo.saveRecipe('a', asset.id, 'user', 0, recipe);
    repo.close();
    const code = `const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.argv[1]); db.exec('BEGIN IMMEDIATE'); db.prepare('UPDATE recipes SET body=? WHERE asset_id=?').run('corrupted-uncommitted',process.argv[2]); process.stdout.write('READY'); setInterval(()=>{},1000);`;
    const child = spawn(process.execPath, ['-e', code, path, asset.id], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    const exited = once(child, 'exit');
    const ready = new Promise<void>((resolve, reject) => {
      child.stdout.once('data', () => resolve()); child.once('error', reject); child.once('exit', () => reject(new Error('CHILD_EXITED_EARLY')));
    });
    const timeout = setTimeout(() => child.kill(), 10000);
    try {await ready; child.kill(); await exited;} finally {clearTimeout(timeout); child.kill();}
    repo = new AssetRepository(path);
    assert.deepEqual(repo.latestRecipe('a', asset.id)?.body, recipe);
    assert.equal(repo.latestRecipe('a', asset.id)?.revision, 1);
  } finally {try {repo.close();} catch {} await rm(root, {recursive: true, force: true});}
});
