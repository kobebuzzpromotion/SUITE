import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {AssetRepository, type Asset} from '../src/repository.js';

const tenant = 'trial-owner-a', otherTenant = 'trial-owner-b';
const settings = () => ({mode: 'soft', opacity: 70, blur: 12, gradient: 20,
  blend: 'multiply', offsetX: 10, offsetY: -5, shadowColor: [10, 20, 30]});
const stroke = () => ({operation: 'ADD', path: [{u: .2, v: .3}],
  radiusFraction: .04, hardness: .6});
const document = (target: Asset, backdrop: Asset) => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-explicit-mask-shadow-1',
  binding: {assetID: target.id, originalSHA256: target.sha256,
    sourceWidth: 400, sourceHeight: 300,
    backdropID: backdrop.id, backdropSHA256: backdrop.sha256},
  subjectStrokes: [stroke()], settings: settings()});
const recipe = (manual?: unknown) => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: manual === undefined ? {} : {addShadowManual: manual},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-add-shadow-trial-repository-'));
  const path = join(root, 'assets.sqlite');
  const repo = new AssetRepository(path);
  const target = repo.create(tenant, {name: 'target.nonraw', sha256: 'a'.repeat(64), size: 20});
  const backdrop = repo.create(tenant, {name: 'backdrop.nonraw', sha256: 'b'.repeat(64), size: 30});
  const foreign = repo.create(otherTenant, {name: 'other.nonraw', sha256: 'c'.repeat(64), size: 40});
  return {root, path, repo, target, backdrop, foreign, async close() {
    repo.close(); await rm(root, {recursive: true, force: true});
  }};
}

test('SHADOW-TRIAL-REPO01 / SQLITE: same-tenant live target and backdrop save/reload; old Recipe and CAS stay intact', async () => {
  const f = await fixture();
  try {
    const old = f.repo.saveRecipe(tenant, f.target.id, 'owner-a', 0, recipe());
    assert.equal(old.revision, 1);
    const manual = document(f.target, f.backdrop);
    const saved = f.repo.saveRecipe(tenant, f.target.id, 'owner-a', 1, recipe(manual));
    assert.equal(saved.revision, 2);
    assert.deepEqual(f.repo.latestRecipe(tenant, f.target.id)?.body, recipe(manual));
    assert.throws(() => f.repo.saveRecipe(tenant, f.target.id, 'owner-a', 1, recipe(manual)),
      /REVISION_CONFLICT/u);
    assert.equal(f.repo.latestRecipe(tenant, f.target.id)?.revision, 2);
    const after = f.repo.saveRecipe(tenant, f.target.id, 'owner-a', 2, recipe());
    assert.equal(after.revision, 3);
    assert.deepEqual(f.repo.latestRecipe(tenant, f.target.id)?.body, recipe());
  } finally {await f.close();}
});

test('SHADOW-TRIAL-REPO02 / SQLITE: copied target, wrong SHA, foreign/missing/deleted backdrop fail without revision or audit commit', async () => {
  const f = await fixture();
  try {
    const valid = document(f.target, f.backdrop);
    const altered = [
      {...valid, binding: {...valid.binding, assetID: f.backdrop.id}},
      {...valid, binding: {...valid.binding, originalSHA256: 'd'.repeat(64)}},
      {...valid, binding: {...valid.binding, backdropID: f.foreign.id,
        backdropSHA256: f.foreign.sha256}},
      {...valid, binding: {...valid.binding, backdropID: crypto.randomUUID()}},
      {...valid, binding: {...valid.binding, backdropSHA256: 'e'.repeat(64)}},
    ];
    for (const changed of altered)
      assert.throws(() => f.repo.saveRecipe(tenant, f.target.id, 'owner-a', 0, recipe(changed)),
        /INVALID_ADD_SHADOW_MANUAL_(BINDING|BACKDROP)/u);
    f.repo.trash(tenant, f.backdrop.id);
    assert.throws(() => f.repo.saveRecipe(tenant, f.target.id, 'owner-a', 0, recipe(valid)),
      /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
    assert.equal(f.repo.latestRecipe(tenant, f.target.id), null);
    const sql = new DatabaseSync(f.path);
    try {
      const count = sql.prepare("SELECT COUNT(*) AS n FROM audit WHERE asset_id=? AND action='recipe-committed'")
        .get(f.target.id) as {n: number};
      assert.equal(count.n, 0);
    } finally {sql.close();}
  } finally {await f.close();}
});

test('SHADOW-TRIAL-REPO03 / SQLITE: old history contamination and later backdrop trash reject reload and next save', async () => {
  const f = await fixture();
  try {
    const valid = document(f.target, f.backdrop);
    f.repo.saveRecipe(tenant, f.target.id, 'owner-a', 0, recipe(valid));
    f.repo.saveRecipe(tenant, f.target.id, 'owner-a', 1, recipe());
    const sql = new DatabaseSync(f.path);
    try {
      const corrupt = document(f.target, f.foreign);
      sql.prepare('UPDATE recipes SET body=? WHERE asset_id=? AND revision=1')
        .run(JSON.stringify(recipe(corrupt)), f.target.id);
    } finally {sql.close();}
    assert.throws(() => f.repo.latestRecipe(tenant, f.target.id),
      /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
    assert.throws(() => f.repo.saveRecipe(tenant, f.target.id, 'owner-a', 2, recipe()),
      /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
  } finally {await f.close();}
  const g = await fixture();
  try {
    g.repo.saveRecipe(tenant, g.target.id, 'owner-a', 0, recipe(document(g.target, g.backdrop)));
    g.repo.trash(tenant, g.backdrop.id);
    assert.throws(() => g.repo.latestRecipe(tenant, g.target.id),
      /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
    assert.throws(() => g.repo.saveRecipe(tenant, g.target.id, 'owner-a', 1, recipe()),
      /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
  } finally {await g.close();}
});
