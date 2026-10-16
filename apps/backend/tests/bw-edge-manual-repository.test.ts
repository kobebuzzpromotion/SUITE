import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {AssetRepository} from '../src/repository.js';

const sha = 'a'.repeat(64);
const add = () => ({operation: 'ADD', path: [{u: .5, v: .5}],
  radiusFraction: .12, hardness: 1});
const recipe = (assetID: string, originalSHA256 = sha) => ({schemaVersion: 1,
  parameters: {exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
    extendedParameters: {bwEdgeManual: {schemaVersion: 1,
      engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
      binding: {assetID, originalSHA256, sourceWidth: 16, sourceHeight: 16},
      subjectStrokes: [add()], correctionStrokes: [add()]}}}});

test('BW-REPO-01: owned Asset/SHA binding, tenant and CAS gate precede SQLite save', () => {
  const repo = new AssetRepository(':memory:');
  try {
    const a = repo.create('owner', {name: 'synthetic.bin', sha256: sha, size: 16});
    const b = repo.create('owner', {name: 'other.bin', sha256: 'b'.repeat(64), size: 16});
    const valid = recipe(a.id);
    assert.throws(() => repo.saveRecipe('other', a.id, 'other', 0, valid), /NOT_FOUND/);
    assert.throws(() => repo.saveRecipe('owner', a.id, 'owner', 0, recipe(b.id)),
      /INVALID_BW_EDGE_MANUAL_BINDING/);
    assert.throws(() => repo.saveRecipe('owner', a.id, 'owner', 0,
      recipe(a.id, 'c'.repeat(64))), /INVALID_BW_EDGE_MANUAL_BINDING/);
    assert.equal(repo.latestRecipe('owner', a.id), null);
    assert.equal(repo.saveRecipe('owner', a.id, 'owner', 0, valid).revision, 1);
    assert.deepEqual(repo.latestRecipe('owner', a.id)?.body, valid);
    assert.throws(() => repo.saveRecipe('owner', a.id, 'owner', 0, valid),
      /REVISION_CONFLICT/);
    assert.equal(repo.latestRecipe('owner', a.id)?.revision, 1);
  } finally {repo.close();}
});

test('BW-REPO-02: RAW SHA replacement and an earlier corrupt history row deny reload/save', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-bw-repo-'));
  const path = join(directory, 'repo.sqlite');
  let repo: AssetRepository | undefined;
  try {
    repo = new AssetRepository(path);
    const a = repo.create('owner', {name: 'synthetic.bin', sha256: sha, size: 16});
    const body = recipe(a.id);
    repo.saveRecipe('owner', a.id, 'owner', 0, body);
    repo.saveRecipe('owner', a.id, 'owner', 1, body);
    repo.close(); repo = undefined;
    const sql = new DatabaseSync(path);
    sql.prepare('UPDATE assets SET sha256=? WHERE id=?').run('b'.repeat(64), a.id);
    sql.close();
    repo = new AssetRepository(path);
    const swapped = repo;
    assert.throws(() => swapped.latestRecipe('owner', a.id), /INVALID_BW_EDGE_MANUAL_BINDING/);
    assert.throws(() => swapped.saveRecipe('owner', a.id, 'owner', 2, body),
      /INVALID_BW_EDGE_MANUAL_BINDING/);
    repo.close(); repo = undefined;
    const repair = new DatabaseSync(path);
    repair.prepare('UPDATE assets SET sha256=? WHERE id=?').run(sha, a.id);
    repair.prepare('UPDATE recipes SET body=? WHERE asset_id=? AND revision=1')
      .run(JSON.stringify(recipe('22222222-2222-4222-8222-222222222222')), a.id);
    repair.close();
    repo = new AssetRepository(path);
    const corrupt = repo;
    assert.throws(() => corrupt.latestRecipe('owner', a.id), /INVALID_BW_EDGE_MANUAL_BINDING/);
    assert.throws(() => corrupt.saveRecipe('owner', a.id, 'owner', 2, body),
      /INVALID_BW_EDGE_MANUAL_BINDING/);
  } finally {
    repo?.close();
    const resolved = await realpath(directory), tempRoot = await realpath(tmpdir());
    if (dirname(resolved) !== tempRoot || !basename(resolved).startsWith('suite-bw-repo-'))
      throw new Error('UNSAFE_TEST_CLEANUP_TARGET');
    await rm(directory, {recursive: true, force: true});
  }
});
