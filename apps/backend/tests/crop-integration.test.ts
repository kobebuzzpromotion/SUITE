import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {validateRecipe} from '../src/photo-policy.js';
import {defaultCropSettings, defaultExportSettings, type CropSettings, type ExportSettings} from '../src/crop-export.js';

// Arbitrary storage bytes, explicitly NOT RAW/JPEG, image-processing or device QA.
const originalBytes = Buffer.from('SUITE crop integration: storage-only bytes, not a photograph');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const integrity = {sha256: sha(originalBytes), size: originalBytes.length};
const physicalCrop = (): CropSettings => ({...defaultCropSettings(), preset_id: 'custom.mm', preset_name: 'Custom mm',
  width_mm: 25.4, height_mm: 25.4, crop_ratio: {width: 1, height: 1}, custom_size: true,
  crop_rect: {x: 0.25, y: 0, width: 0.5, height: 1}});
const recipe = (crop = physicalCrop(), output = defaultExportSettings()) => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: crop.rotation,
  extendedParameters: {crop, export: output}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation', 'crop']
}});

test('Crop integration: plain JSON extensions and omitted optional fields survive SQLite reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-crop-reopen-'));
  let repo = new AssetRepository(join(root, 'assets.sqlite'));
  try {
    const asset = repo.create('tenant-a', {name: 'storage-only fixture', ...integrity});
    const input = recipe(defaultCropSettings());
    validateRecipe(input);
    assert.equal(Object.hasOwn(input.parameters.extendedParameters.crop, 'width_mm'), false);
    assert.equal(Object.hasOwn(input.parameters.extendedParameters.crop, 'crop_ratio'), false);
    assert.equal(JSON.stringify(input).includes(':null'), false);
    assert.equal(input.parameters.processingOrder.at(-1), 'crop');
    repo.saveRecipe('tenant-a', asset.id, 'editor', 0, input);
    repo.close(); repo = new AssetRepository(join(root, 'assets.sqlite'));
    assert.deepEqual(repo.latestRecipe('tenant-a', asset.id)?.body, input);
    assert.equal(repo.latestRecipe('tenant-a', asset.id)?.revision, 1);
    assert.throws(() => repo.latestRecipe('tenant-b', asset.id), /NOT_FOUND/);
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Crop integration: CAS conflict keeps committed crop, original key, bytes and checksum immutable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-crop-cas-'));
  const repo = new AssetRepository(join(root, 'assets.sqlite'));
  const peer = new AssetRepository(join(root, 'assets.sqlite'));
  const objects = new LocalObjectStorage(join(root, 'objects'));
  try {
    const asset = repo.create('tenant-a', {name: 'storage-only fixture', ...integrity});
    await objects.putImmutable(asset.originalKey, Readable.from([originalBytes]), integrity);
    const first = recipe(); repo.saveRecipe('tenant-a', asset.id, 'editor-a', 0, first);
    const changed = recipe({...physicalCrop(), requested_dpi: 240}, {...defaultExportSettings(), requested_dpi: 240});
    assert.throws(() => peer.saveRecipe('tenant-a', asset.id, 'editor-b', 0, changed), /REVISION_CONFLICT/);
    assert.deepEqual(repo.latestRecipe('tenant-a', asset.id)?.body, first);
    peer.saveRecipe('tenant-a', asset.id, 'editor-b', 1, changed);
    assert.deepEqual(repo.latestRecipe('tenant-a', asset.id)?.body, changed);
    assert.equal(repo.latestRecipe('tenant-a', asset.id)?.revision, 2);
    assert.deepEqual(repo.get('tenant-a', asset.id), asset);
    assert.deepEqual(await readFile(join(root, 'objects', asset.originalKey)), originalBytes);
    assert.equal((await objects.inspect(asset.originalKey)).sha256, integrity.sha256);
  } finally {peer.close(); repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Crop integration: invalid crop/export, nulls, pipeline order, rotation and DPI fail before revision write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-crop-invalid-'));
  const repo = new AssetRepository(join(root, 'assets.sqlite'));
  try {
    const asset = repo.create('tenant-a', {name: 'storage-only fixture', ...integrity});
    const valid = recipe(); repo.saveRecipe('tenant-a', asset.id, 'editor', 0, valid);
    const p = valid.parameters, extra = p.extendedParameters;
    const invalid: unknown[] = [
      {...p, rotationDegrees: 90},
      {...p, processingOrder: ['crop', 'exposure', 'contrast', 'saturation', 'rotation']},
      {...p, extendedParameters: {...extra, crop: {...extra.crop, width_mm: null}}},
      {...p, extendedParameters: {...extra, crop: {...extra.crop, crop_rect: {x: 0, y: 0, width: 2, height: 1}}}},
      {...p, extendedParameters: {...extra, crop: {...extra.crop, unexpected: 1}}},
      {...p, extendedParameters: {...extra, export: {...extra.export, requested_dpi: 72}}},
      {...p, extendedParameters: {...extra, export: {...extra.export, bit_depth: 16}}},
      {...p, extendedParameters: {...extra, export: {...extra.export, jpeg_quality: 0}}},
      {...p, extendedParameters: {...extra, export: {...extra.export, preserve_alpha: true}}},
      {...p, extendedParameters: {...extra, export: {...extra.export, file_name_template: '../original'}}},
      {...p, extendedParameters: {...extra, export: null}}
    ];
    for (const parameters of invalid) {
      assert.throws(() => repo.saveRecipe('tenant-a', asset.id, 'editor', 1, {schemaVersion: 1, parameters}), /INVALID/);
      assert.equal(repo.latestRecipe('tenant-a', asset.id)?.revision, 1);
      assert.deepEqual(repo.latestRecipe('tenant-a', asset.id)?.body, valid);
    }
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Crop integration: legacy Recipe remains unchanged and physical crop history preserves output settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-crop-legacy-'));
  const repo = new AssetRepository(join(root, 'assets.sqlite'));
  try {
    const legacy = JSON.parse(await readFile(resolve('contracts/recipe-v1.example.json'), 'utf8'));
    const before = JSON.stringify(legacy);
    const asset = repo.create('tenant-a', {name: 'storage-only fixture', ...integrity});
    repo.saveRecipe('tenant-a', asset.id, 'editor', 0, legacy);
    assert.equal(JSON.stringify(repo.latestRecipe('tenant-a', asset.id)?.body), before);
    assert.equal(JSON.stringify(legacy), before);
    const variants: ExportSettings[] = [defaultExportSettings(),
      ...([8, 16] as const).flatMap(bit_depth => (['none', 'lzw'] as const).map(tiff_compression => ({
        ...defaultExportSettings(), format: 'tiff' as const, bit_depth, tiff_compression, color_space: 'adobeRGB' as const
      }))), {...defaultExportSettings(), format: 'png', preserve_alpha: true, metadata: 'remove'}];
    let revision = 1;
    for (const output of variants) {
      const body = recipe(physicalCrop(), output);
      repo.saveRecipe('tenant-a', asset.id, 'editor', revision++, body);
      assert.deepEqual(repo.latestRecipe('tenant-a', asset.id)?.body, body);
    }
    assert.equal(repo.latestRecipe('tenant-a', asset.id)?.revision, 7);
    // This checks persistence only: no format was encoded and no image quality PASS is claimed.
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Crop integration: killed SQLite transaction restores committed crop and original bytes on reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-crop-kill-')), path = join(root, 'assets.sqlite');
  const objects = new LocalObjectStorage(join(root, 'objects'));
  let repo = new AssetRepository(path);
  try {
    const asset = repo.create('tenant-a', {name: 'storage-only fixture', ...integrity});
    await objects.putImmutable(asset.originalKey, Readable.from([originalBytes]), integrity);
    const committed = recipe(); repo.saveRecipe('tenant-a', asset.id, 'editor', 0, committed);
    repo.close();
    const childCode = `const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.argv[1]); db.exec('BEGIN IMMEDIATE'); db.prepare('UPDATE recipes SET body=? WHERE asset_id=?').run('uncommitted-invalid-crop',process.argv[2]); process.stdout.write('READY'); setInterval(()=>{},1000);`;
    const child = spawn(process.execPath, ['-e', childCode, path, asset.id], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    const exited = once(child, 'exit');
    const ready = new Promise<void>((resolveReady, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {output += String(chunk); if (output.includes('READY')) resolveReady();});
      child.once('error', reject);
      child.once('exit', () => reject(new Error('CHILD_EXITED_BEFORE_READY')));
    });
    const timer = setTimeout(() => child.kill(), 10000);
    try {await ready; child.kill(); await exited;} finally {clearTimeout(timer); child.kill();}
    repo = new AssetRepository(path);
    assert.deepEqual(repo.latestRecipe('tenant-a', asset.id)?.body, committed);
    assert.equal(repo.latestRecipe('tenant-a', asset.id)?.revision, 1);
    assert.equal((await objects.inspect(asset.originalKey)).sha256, integrity.sha256);
    assert.deepEqual(await readFile(join(root, 'objects', asset.originalKey)), originalBytes);
  } finally {try {repo.close();} catch {} await rm(root, {recursive: true, force: true});}
});
