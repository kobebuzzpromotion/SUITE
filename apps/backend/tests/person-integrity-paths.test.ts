import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {AssetRepository} from '../src/repository.js';
import {WorkspaceRepository} from '../src/workspace.js';
import {validateRecipe} from '../src/photo-policy.js';
import {validatePortraitRecipe} from '../src/portrait-recipe.js';
import {validatePersonGeometryInventory, validatePersonGeometryContinuity, validatePersonGeometryBinding,
  geometryIdentifier} from '../src/person-geometry.js';

// WINDOWS_DATA_ONLY: no image fixture, Apple UI, Undo command, Vision mask or export renderer runs here.
const sha = 'a'.repeat(64), date = '2026-10-03T01:00:00.000Z';
const leftID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', rightID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const inventory = (assetID: string) => ({assetID, originalSHA256: sha, targets: [
  {id: leftID, anchor: {x: 0.1, y: 0.2, width: 0.2, height: 0.3}},
  {id: rightID, anchor: {x: 0.6, y: 0.2, width: 0.2, height: 0.3}}
]});
const portrait = (assetID: string, value = 0) => ({...inventory(assetID), schemaVersion: 1,
  engineVersion: 'apple-vision-face-exposure-1', createdAt: date, updatedAt: date,
  targets: inventory(assetID).targets.map(t => ({...t, adjustmentType: 'face_brightness', value: t.id === leftID ? value : 0}))});
const recipe = (assetID: string, value = 0) => ({schemaVersion: 1, parameters: {exposure: 0, contrast: 1,
  saturation: 1, rotationDegrees: 0, extendedParameters: {portrait: portrait(assetID, value)},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});
function readPortrait(body: Record<string, unknown>) {
  const p = (body as ReturnType<typeof recipe>).parameters.extendedParameters.portrait;
  validatePortraitRecipe(p); return p;
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-pgi-'));
  const assetsPath = join(root, 'assets.sqlite'), workspacePath = join(root, 'workspace.sqlite');
  let assets = new AssetRepository(assetsPath);
  let workspace = new WorkspaceRepository(workspacePath, (w, id, deleted) => assets.get(w, id, deleted));
  const actor = {userId: 'owner'}, w = workspace.createWorkspace(actor, 'PGI isolated data'), project = workspace.createProject(actor, w.id, 'photos');
  const a = assets.create(w.id, {name: 'a-data-not-image', sha256: sha, size: 1});
  const b = assets.create(w.id, {name: 'b-data-not-image', sha256: sha, size: 1});
  for (const asset of [a, b]) workspace.registerAsset(actor, w.id, project.id, asset.id);
  return {root, assetsPath, workspacePath, actor, w, project, a, b,
    get assets() {return assets;}, get workspace() {return workspace;},
    save(body: Record<string, unknown>, baseVersion: number, id = a.id) {
      return workspace.saveRecipe(actor, w.id, project.id, id, {body, baseVersion});
    },
    latest(id = a.id) {return workspace.latestRecipe(actor, w.id, project.id, id);},
    history() {return workspace.recipeHistory(actor, w.id, project.id, a.id);},
    reopen() {workspace.close(); assets.close(); assets = new AssetRepository(assetsPath);
      workspace = new WorkspaceRepository(workspacePath, (w, id, deleted) => assets.get(w, id, deleted));},
    async cleanup() {workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});}
  };
}

test('PGI-INVENTORY / WINDOWS_DATA_ONLY: common control-independent UUID/geometry boundary', () => {
  const p = inventory(randomUUID());
  assert.doesNotThrow(() => validatePersonGeometryInventory(p));
  for (const targets of [[], [p.targets[0]!], p.targets]) {
    if (targets.length) assert.doesNotThrow(() => validatePersonGeometryInventory({...p, targets}));
    else assert.throws(() => validatePersonGeometryInventory({...p, targets}));
  }
  for (const target of [{...p.targets[0]!, id: 'person-1'}, {...p.targets[0]!, anchor: {...p.targets[0]!.anchor, width: 0}},
    {...p.targets[0]!, anchor: {...p.targets[0]!.anchor, x: NaN}}]) {
    assert.throws(() => validatePersonGeometryInventory({...p, targets: [target]}));
  }
  assert.throws(() => validatePersonGeometryInventory({...p, targets: [p.targets[0]!, {...p.targets[0]!, id: rightID}]}));
  assert.throws(() => validatePersonGeometryInventory({...p, targets: [p.targets[0]!, {...p.targets[1]!, id: leftID.toUpperCase()}]}));
});

test('PGI-GEOMETRY-ID / WINDOWS_DATA_ONLY: deterministic geometry fingerprint is not person recognition', () => {
  const p = inventory(randomUUID()), first = p.targets[0]!;
  assert.equal(geometryIdentifier(first.anchor), geometryIdentifier({...first.anchor}));
  assert.notEqual(geometryIdentifier(first.anchor), geometryIdentifier(p.targets[1]!.anchor));
  assert.match(geometryIdentifier(first.anchor), /^face-geometry-v1-sha256:[a-f0-9]{64}$/);
  assert.doesNotThrow(() => validatePersonGeometryContinuity(p, {...p, targets: [...p.targets].reverse()}));
  assert.throws(() => validatePersonGeometryContinuity(p, {...p, targets: [first]}));
  assert.throws(() => validatePersonGeometryContinuity(p, {...p, targets: [{...first, anchor: p.targets[1]!.anchor},
    {...p.targets[1]!, anchor: first.anchor}]}));
});

test('PGI-SAVE / WINDOWS_DATA_ONLY: persisted IDs cannot rebind and rejected save leaves head unchanged', async () => {
  const f = await fixture(); try {
    f.save(recipe(f.a.id), 0);
    const bad = recipe(f.a.id); bad.parameters.extendedParameters.portrait.targets[0]!.id = randomUUID();
    assert.throws(() => f.save(bad, 1)); assert.equal(f.latest()?.version, 1); assert.equal(f.history().length, 1);
  } finally {await f.cleanup();}
});

test('PGI-RELOAD / WINDOWS_DATA_ONLY: current version reload retains UUID geometry and per-person values', async () => {
  const f = await fixture(); try {
    const body = recipe(f.a.id, 1.25); f.save(body, 0);
    assert.deepEqual(f.latest()?.body, body);
    validatePersonGeometryContinuity(inventory(f.a.id), readPortrait(f.latest()!.body));
  } finally {await f.cleanup();}
});

test('PGI-RESTART / WINDOWS_DATA_ONLY: new SQLite connections retain identity; not app relaunch', async () => {
  const f = await fixture(); try {
    const body = recipe(f.a.id, -0.5); f.save(body, 0); f.reopen();
    assert.deepEqual(f.latest()?.body, body); assert.deepEqual(f.assets.get(f.w.id, f.a.id), f.a);
  } finally {await f.cleanup();}
});

test('PGI-CONFLICT-VERSION / WINDOWS_DATA_ONLY: stale branch uses same inventory without replacing head', async () => {
  const f = await fixture(); try {
    f.save(recipe(f.a.id), 0); const head = recipe(f.a.id, 1); f.save(head, 1);
    const branch = f.save(recipe(f.a.id, -1), 1);
    assert.equal(branch.outcome, 'conflict'); assert.equal(branch.version.branch, true);
    assert.equal(branch.currentVersion, 2); assert.deepEqual(f.latest()?.body, head);
    const bad = recipe(f.a.id); bad.parameters.extendedParameters.portrait.targets[0]!.id = randomUUID();
    assert.throws(() => f.save(bad, 1)); assert.equal(f.history().length, 3);
  } finally {await f.cleanup();}
});

test('PGI-CONFLICT-RESOLUTION / WINDOWS_DATA_ONLY: chosen branch becomes head only with valid inventory', async () => {
  const f = await fixture(); try {
    f.save(recipe(f.a.id), 0); f.save(recipe(f.a.id, 1), 1);
    const branch = f.save(recipe(f.a.id, -1), 1);
    const bad = structuredClone(branch.version.body) as ReturnType<typeof recipe>;
    bad.parameters.extendedParameters.portrait.targets[0]!.anchor.x = 0.15;
    assert.throws(() => f.save(bad, 2)); assert.equal(f.latest()?.version, 2);
    const resolution = f.save(branch.version.body, 2);
    assert.equal(resolution.outcome, 'saved'); assert.equal(resolution.version.version, 4);
    assert.deepEqual(f.latest()?.body, branch.version.body);
  } finally {await f.cleanup();}
});

test('PGI-UNDO / WINDOWS_DATA_ONLY: explicit earlier-value snapshot preserves inventory; no Swift Undo execution', async () => {
  const f = await fixture(); try {
    const initial = recipe(f.a.id); f.save(initial, 0); f.save(recipe(f.a.id, 1), 1); f.save(initial, 2);
    assert.deepEqual(f.latest()?.body, initial); assert.equal(f.history().length, 3);
  } finally {await f.cleanup();}
});

test('PGI-REDO / WINDOWS_DATA_ONLY: explicit later-value snapshot preserves inventory; no Swift Redo execution', async () => {
  const f = await fixture(); try {
    const initial = recipe(f.a.id), edit = recipe(f.a.id, 1); f.save(initial, 0); f.save(edit, 1);
    f.save(initial, 2); f.save(edit, 3); f.reopen();
    assert.deepEqual(f.latest()?.body, edit); assert.equal(f.history().length, 4);
  } finally {await f.cleanup();}
});

test('PGI-HIDDEN-HISTORY / WINDOWS_DATA_ONLY: tampered non-head conflict branch blocks all reads and preserves evidence', async () => {
  const f = await fixture(); try {
    f.save(recipe(f.a.id), 0); f.save(recipe(f.a.id, 1), 1); f.save(recipe(f.a.id, -1), 1);
    const bad = recipe(f.a.id); bad.parameters.extendedParameters.portrait.targets[0]!.id = randomUUID();
    validateRecipe(bad); const encoded = JSON.stringify(bad);
    // Deliberate test-only disk tamper bypasses the production immutable trigger in this isolated DB.
    const db = new DatabaseSync(f.workspacePath);
    try {db.exec('DROP TRIGGER ws_recipe_immutable_update');
      db.prepare('UPDATE ws_recipe_versions SET body=? WHERE asset_id=? AND version=3').run(encoded, f.a.id);
    } finally {db.close();}
    f.reopen(); assert.throws(() => f.latest()); assert.throws(() => f.history());
    assert.throws(() => f.workspace.getRecipeVersion(f.actor, f.w.id, f.project.id, f.a.id, 1));
    assert.throws(() => f.save(recipe(f.a.id), 2));
    const read = new DatabaseSync(f.workspacePath);
    try {assert.equal(read.prepare('SELECT body FROM ws_recipe_versions WHERE asset_id=? AND version=3').get(f.a.id)?.body, encoded);
      assert.equal(read.prepare('SELECT COUNT(*) AS n FROM ws_recipe_versions WHERE asset_id=?').get(f.a.id)?.n, 3);
    } finally {read.close();}
    assert.deepEqual(f.assets.get(f.w.id, f.a.id), f.a);
  } finally {await f.cleanup();}
});

test('PGI-ASSET-SWITCH / WINDOWS_DATA_ONLY: retrieving separate assets never relabels photo-local identities; no UI switch', async () => {
  const f = await fixture(); try {
    f.save(recipe(f.a.id, 1), 0); f.save(recipe(f.b.id, -1), 0, f.b.id);
    for (const a of [f.a, f.b, f.a]) validatePersonGeometryBinding(readPortrait(f.latest(a.id)!.body), a.id, a.sha256);
    assert.equal(readPortrait(f.latest(f.a.id)!.body).targets[0]!.value, 1);
    assert.equal(readPortrait(f.latest(f.b.id)!.body).targets[0]!.value, -1);
  } finally {await f.cleanup();}
});

test('PGI-RECIPE-COPY / WINDOWS_DATA_ONLY: copying A recipe to B fails even for identical Original SHA', async () => {
  const f = await fixture(); try {
    const body = recipe(f.a.id); f.save(body, 0);
    assert.throws(() => f.save(body, 0, f.b.id)); assert.equal(f.latest(f.b.id), null);
    assert.deepEqual(f.latest()?.body, body);
  } finally {await f.cleanup();}
});

test('PGI-PERSON-RESELECT / WINDOWS_DATA_ONLY: reordered UUID lookup is explicit data lookup, not EditorModel selection', () => {
  const p = inventory(randomUUID()), reordered = {...p, targets: [...p.targets].reverse()};
  validatePersonGeometryContinuity(p, reordered);
  assert.deepEqual(reordered.targets.find(t => t.id === leftID)?.anchor, p.targets[0]!.anchor);
  assert.equal(reordered.targets.find(t => t.id === randomUUID()), undefined);
  assert.throws(() => validatePersonGeometryContinuity(p, {...p, targets: [{...p.targets[0]!, id: randomUUID()}, p.targets[1]!]}));
});

test('PGI-EXPORT-RECIPE / WINDOWS_DATA_ONLY: retrieved export-candidate data must bind asset/SHA; no export execution', async () => {
  const f = await fixture(); try {
    f.save(recipe(f.a.id, 1), 0); const candidate = f.latest()!.body; validateRecipe(candidate);
    validatePersonGeometryBinding(readPortrait(candidate), f.a.id, sha);
    assert.throws(() => validatePersonGeometryBinding(readPortrait(candidate), f.b.id, sha));
    assert.throws(() => validatePersonGeometryBinding(readPortrait(candidate), f.a.id, 'b'.repeat(64)));
    assert.equal(f.latest()?.version, 1);
  } finally {await f.cleanup();}
});
