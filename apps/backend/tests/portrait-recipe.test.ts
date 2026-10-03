import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {validatePortraitRecipe, validatePortraitBinding, validatePortraitContinuity, portraitIntersectionOverUnion} from '../src/portrait-recipe.js';
import {validateRecipe} from '../src/photo-policy.js';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceRepository} from '../src/workspace.js';

// Storage/validation bytes only. No RAW decode, portrait pixels or Apple device PASS.
const bytes = Buffer.from('portrait independent storage-only fixture; not an image');
const checksum = createHash('sha256').update(bytes).digest('hex');
const assetID = '11111111-1111-4111-8111-111111111111';
const targetID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const date = '2026-10-03T01:00:00.000Z';
const anchor = {x: 0.1, y: 0.2, width: 0.2, height: 0.3};
const portrait = (id = assetID, sha = checksum) => ({schemaVersion: 1, engineVersion: 'apple-vision-face-exposure-1',
  assetID: id, originalSHA256: sha, createdAt: date, updatedAt: date,
  targets: [{id: targetID, anchor: {...anchor}, adjustmentType: 'face_brightness', value: 0.5}]});
const document = (p: unknown = portrait()) => ({schemaVersion: 1, parameters: {exposure: 0, contrast: 1, saturation: 1,
  rotationDegrees: 0, extendedParameters: {portrait: p, 'future.vendor': {preserve: true}},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});

test('Portrait wire: explicit control/value and UTC dates survive plain JSON without enum envelopes', () => {
  const p = portrait(), copy = JSON.parse(JSON.stringify(p));
  validatePortraitRecipe(copy); validateRecipe(document(copy));
  assert.deepEqual(copy, p);
  assert.equal(Object.hasOwn(copy.targets[0]!, 'exposureEV'), false);
  assert.equal(copy.targets[0]!.adjustmentType, 'face_brightness');
  assert.equal(copy.createdAt, date);
  assert.equal(copy.updatedAt, date);
});

test('Portrait wire: rejects missing/unknown/null fields, invalid identity and unsupported control/engine', () => {
  const p = portrait(), t = p.targets[0]!;
  const invalid: unknown[] = [null, [], {...p, schemaVersion: 2}, {...p, engineVersion: 'future-engine'},
    {...p, assetID: 'not-uuid'}, {...p, originalSHA256: 'unverified'}, {...p, unknown: true},
    {...p, targets: []}, {...p, targets: null}, {...p, targets: [{...t, id: 'person-1'}]},
    {...p, targets: [t, {...t, id: targetID.toUpperCase()}]},
    {...p, targets: [{...t, adjustmentType: 'skin_smoothing'}]}, {...p, targets: [{...t, value: null}]},
    {...p, targets: [{...t, exposureEV: 1}]}, {...p, targets: [{...t, anchor: {...anchor, extra: 1}}]},
    {...p, targets: Array.from({length: 65}, () => ({...t, id: randomUUID()}))}];
  for (const field of Object.keys(p)) {
    const missing: Record<string, unknown> = {...p}; delete missing[field]; invalid.push(missing);
  }
  for (const item of invalid) assert.throws(() => validatePortraitRecipe(item), /PORTRAIT/, JSON.stringify(item));
});

test('Portrait wire: finite EV and normalized nonempty anchors are strict, including boundary values', () => {
  const p = portrait(), t = p.targets[0]!;
  for (const value of [-4, 0, 4]) assert.doesNotThrow(() => validatePortraitRecipe({...p, targets: [{...t, value}]}));
  for (const value of [-4.001, 4.001, NaN, Infinity, -Infinity, '1']) {
    assert.throws(() => validatePortraitRecipe({...p, targets: [{...t, value}]}));
  }
  for (const a of [{...anchor, x: -0.01}, {...anchor, y: -0.01}, {...anchor, width: 0}, {...anchor, height: 0},
    {...anchor, x: 0.9}, {...anchor, y: 0.9}, {...anchor, width: Infinity}, {...anchor, y: NaN}]) {
    assert.throws(() => validatePortraitRecipe({...p, targets: [{...t, anchor: a}]}));
  }
  assert.doesNotThrow(() => validatePortraitRecipe({...p, targets: [{...t, anchor: {x: 0, y: 0, width: 1, height: 1}}]}));
});

test('Portrait wire: UTC timestamp validity/order rejects local dates, rollover and invalid time', () => {
  for (const value of ['2026-10-03', '2026-10-03T01:00:00', '2026-10-03T10:00:00+09:00',
    '2026-02-30T01:00:00.000Z', '2026-10-03T25:00:00.000Z', '', null]) {
    assert.throws(() => validatePortraitRecipe({...portrait(), createdAt: value}));
    assert.throws(() => validatePortraitRecipe({...portrait(), updatedAt: value}));
  }
  assert.throws(() => validatePortraitRecipe({...portrait(), updatedAt: '2026-10-02T01:00:00.000Z'}));
});

test('Portrait binding: another asset or original SHA cannot reuse photo-local anchors', () => {
  assert.doesNotThrow(() => validatePortraitBinding(portrait(), assetID.toUpperCase(), checksum.toUpperCase()));
  assert.throws(() => validatePortraitBinding(portrait(), randomUUID(), checksum), /BINDING/);
  assert.throws(() => validatePortraitBinding(portrait(), assetID, 'b'.repeat(64)), /BINDING/);
});

test('Portrait overlap math is symmetric, identity=1, disjoint=0; no person matching claimed', () => {
  const b = {x: 0.2, y: 0.2, width: 0.2, height: 0.3};
  assert.ok(Math.abs(portraitIntersectionOverUnion(anchor, anchor) - 1) < 1e-12);
  assert.equal(portraitIntersectionOverUnion(anchor, {x: 0.8, y: 0.8, width: 0.1, height: 0.1}), 0);
  assert.ok(Math.abs(portraitIntersectionOverUnion(anchor, b) - 1 / 3) < 1e-12);
  assert.equal(portraitIntersectionOverUnion(anchor, b), portraitIntersectionOverUnion(b, anchor));
});

test('Portrait persistence: CAS/reopen keeps typed target and unrelated extensions; originals unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-portrait-reopen-')), path = join(root, 'assets.sqlite');
  let repo = new AssetRepository(path);
  const storage = new LocalObjectStorage(join(root, 'objects'));
  try {
    const asset = repo.create('tenant', {name: 'not-image', sha256: checksum, size: bytes.length});
    await storage.putImmutable(asset.originalKey, Readable.from([bytes]), {sha256: checksum, size: bytes.length});
    const input = document(portrait(asset.id));
    repo.saveRecipe('tenant', asset.id, 'editor', 0, input);
    assert.throws(() => repo.saveRecipe('tenant', asset.id, 'stale', 0, input), /REVISION_CONFLICT/);
    repo.close(); repo = new AssetRepository(path);
    assert.deepEqual(repo.latestRecipe('tenant', asset.id)?.body, input);
    assert.equal(repo.latestRecipe('tenant', asset.id)?.revision, 1);
    assert.deepEqual(repo.get('tenant', asset.id), asset);
    assert.deepEqual(await readFile(join(root, 'objects', asset.originalKey)), bytes);
    assert.equal((await storage.inspect(asset.originalKey)).sha256, checksum);
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Portrait persistence: malformed and cross-asset writes fail before revision mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-portrait-reject-'));
  const repo = new AssetRepository(join(root, 'assets.sqlite'));
  try {
    const a = repo.create('tenant', {name: 'a', sha256: checksum, size: bytes.length});
    const b = repo.create('tenant', {name: 'b', sha256: checksum, size: bytes.length});
    const good = document(portrait(a.id)); repo.saveRecipe('tenant', a.id, 'editor', 0, good);
    for (const p of [portrait(b.id), portrait(a.id, 'b'.repeat(64)), {...portrait(a.id), engineVersion: 'unknown'},
      {...portrait(a.id), targets: [{...portrait(a.id).targets[0], value: 99}]}]) {
      assert.throws(() => repo.saveRecipe('tenant', a.id, 'editor', 1, document(p)));
      assert.equal(repo.latestRecipe('tenant', a.id)?.revision, 1);
      assert.deepEqual(repo.latestRecipe('tenant', a.id)?.body, good);
    }
    assert.equal(repo.latestRecipe('tenant', b.id), null);
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Portrait persistence: corrupt JSON reopen fails without replacing damaged evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-portrait-corrupt-')), path = join(root, 'assets.sqlite');
  let repo = new AssetRepository(path);
  try {
    const a = repo.create('tenant', {name: 'a', sha256: checksum, size: bytes.length});
    repo.saveRecipe('tenant', a.id, 'editor', 0, document(portrait(a.id))); repo.close();
    const db = new DatabaseSync(path); db.prepare('UPDATE recipes SET body=? WHERE asset_id=?').run('{broken-portrait', a.id); db.close();
    repo = new AssetRepository(path);
    assert.throws(() => repo.latestRecipe('tenant', a.id));
    assert.throws(() => repo.saveRecipe('tenant', a.id, 'editor', 1, document(portrait(a.id))));
    const inspected = new DatabaseSync(path);
    try {assert.equal(inspected.prepare('SELECT body FROM recipes WHERE asset_id=?').get(a.id)?.body, '{broken-portrait');}
    finally {inspected.close();}
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Portrait persistence: semantic corruption reopens fail-closed and preserves stored row', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-portrait-semantic-')), path = join(root, 'assets.sqlite');
  let repo = new AssetRepository(path);
  try {
    const a = repo.create('tenant', {name: 'a', sha256: checksum, size: bytes.length});
    repo.saveRecipe('tenant', a.id, 'editor', 0, document(portrait(a.id))); repo.close();
    const invalid = JSON.stringify(document({...portrait(a.id), engineVersion: 'unknown-engine'}));
    const db = new DatabaseSync(path); db.prepare('UPDATE recipes SET body=? WHERE asset_id=?').run(invalid, a.id); db.close();
    repo = new AssetRepository(path);
    assert.throws(() => repo.latestRecipe('tenant', a.id), /PORTRAIT/);
    assert.throws(() => repo.saveRecipe('tenant', a.id, 'editor', 1, document(portrait(a.id))), /PORTRAIT/);
    const inspected = new DatabaseSync(path);
    try {assert.equal(inspected.prepare('SELECT body FROM recipes WHERE asset_id=?').get(a.id)?.body, invalid);}
    finally {inspected.close();}
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Portrait person ID: two-person value-only revisions, reordered targets and explicit undo/redo snapshots preserve UUID anchors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-portrait-identity-')), path = join(root, 'assets.sqlite');
  let repo = new AssetRepository(path);
  try {
    const a = repo.create('tenant', {name: 'a', sha256: checksum, size: bytes.length});
    const p = portrait(a.id), first = p.targets[0]!, second = {...first, id: randomUUID(), anchor: {...anchor, x: 0.6}, value: 0};
    const initial = document({...p, targets: [first, second]});
    const edit = document({...p, targets: [second, {...first, value: 1.25}]});
    repo.saveRecipe('tenant', a.id, 'editor', 0, initial);
    repo.saveRecipe('tenant', a.id, 'editor', 1, edit);
    repo.saveRecipe('tenant', a.id, 'editor', 2, initial); // Explicit undo snapshot, not client UI execution.
    repo.saveRecipe('tenant', a.id, 'editor', 3, edit); // Explicit redo snapshot.
    repo.close(); repo = new AssetRepository(path);
    const restored = repo.latestRecipe('tenant', a.id)?.body;
    assert.deepEqual(restored, edit);
    const wire = (restored as ReturnType<typeof document>).parameters.extendedParameters.portrait;
    validatePortraitRecipe(wire);
    assert.equal(wire.targets.find(t => t.id === targetID)?.value, 1.25);
    assert.deepEqual(wire.targets.find(t => t.id === targetID)?.anchor, first.anchor);
    assert.equal(wire.targets.find(t => t.id === second.id)?.value, 0);
    assert.deepEqual(wire.targets.find(t => t.id === second.id)?.anchor, second.anchor);
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Portrait person ID: known UUID cannot move to another face or be replaced after neutral Undo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-portrait-rebind-'));
  const repo = new AssetRepository(join(root, 'assets.sqlite'));
  try {
    const a = repo.create('tenant', {name: 'a', sha256: checksum, size: bytes.length});
    const p = portrait(a.id), t = p.targets[0]!;
    repo.saveRecipe('tenant', a.id, 'editor', 0, document(p));
    const neutral = document(); delete (neutral.parameters.extendedParameters as Record<string, unknown>).portrait;
    repo.saveRecipe('tenant', a.id, 'editor', 1, neutral);
    for (const replacement of [{...t, anchor: {...anchor, x: 0.6}}, {...t, id: randomUUID()}]) {
      assert.throws(() => repo.saveRecipe('tenant', a.id, 'editor', 2, document({...p, targets: [replacement]})), /PORTRAIT/);
      assert.equal(repo.latestRecipe('tenant', a.id)?.revision, 2);
      assert.deepEqual(repo.latestRecipe('tenant', a.id)?.body, neutral);
    }
    repo.saveRecipe('tenant', a.id, 'editor', 2, document({...p, targets: [{...t, value: -0.5}]}));
    assert.equal(repo.latestRecipe('tenant', a.id)?.revision, 3);
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('Portrait Workspace: wrong asset/SHA never enters shared current or conflict revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-portrait-workspace-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const repo = new WorkspaceRepository(join(root, 'workspace.sqlite'), (w, id, deleted) => assets.get(w, id, deleted));
  const actor = {userId: 'owner'};
  try {
    const workspace = repo.createWorkspace(actor, 'Portrait unit test'), project = repo.createProject(actor, workspace.id, 'Photos');
    const a = assets.create(workspace.id, {name: 'a', sha256: checksum, size: bytes.length});
    const b = assets.create(workspace.id, {name: 'b', sha256: checksum, size: bytes.length});
    repo.registerAsset(actor, workspace.id, project.id, a.id);
    repo.registerAsset(actor, workspace.id, project.id, b.id);
    const good = document(portrait(a.id));
    repo.saveRecipe(actor, workspace.id, project.id, a.id, {baseVersion: 0, body: good});
    for (const body of [document(portrait(b.id)), document(portrait(a.id, 'b'.repeat(64)))]) {
      for (const baseVersion of [0, 1]) {
        assert.throws(() => repo.saveRecipe(actor, workspace.id, project.id, a.id, {baseVersion, body}), /PORTRAIT/);
        assert.deepEqual(repo.latestRecipe(actor, workspace.id, project.id, a.id)?.body, good);
      }
    }
    assert.equal(repo.latestRecipe(actor, workspace.id, project.id, b.id), null);
  } finally {repo.close(); assets.close(); await rm(root, {recursive: true, force: true});}
});

test('Portrait regression: partial initial inventory is rejected while full reordered UUID inventory is retained', () => {
  const p = portrait(), first = p.targets[0]!, second = {...first, id: randomUUID(), anchor: {...anchor, x: 0.6}};
  const reference = {...p, targets: [first, second]};
  assert.doesNotThrow(() => validatePortraitRecipe(reference));
  assert.throws(() => validatePortraitContinuity(reference, {...p, targets: [first]}), /PERSON_INVENTORY/);
  assert.throws(() => validatePortraitContinuity(reference, {...p, targets: [second]}), /PERSON_INVENTORY/);
  assert.doesNotThrow(() => validatePortraitContinuity(reference, {...p, targets: [{...second, value: 0}, {...first, value: 1}]}));
});

test('Portrait regression: overlapping saved face anchors fail before persistence or rendering', () => {
  const p = portrait(), first = p.targets[0]!;
  for (const x of [0.1, 0.15, 0.299]) {
    const second = {...first, id: randomUUID(), anchor: {...anchor, x}};
    assert.throws(() => validatePortraitRecipe({...p, targets: [first, second]}), /OVERLAPPING_FACES/);
    assert.throws(() => validateRecipe(document({...p, targets: [first, second]})), /OVERLAPPING_FACES/);
  }
  assert.doesNotThrow(() => validatePortraitRecipe({...p, targets: [first, {...first, id: randomUUID(), anchor: {...anchor, x: 0.6}}]}));
});

test('Portrait regression: parse-valid hidden SQLite UUID/anchor tamper rejects reads and preserves damaged row plus Original', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-portrait-history-tamper-')), path = join(root, 'assets.sqlite');
  let repo = new AssetRepository(path);
  const storage = new LocalObjectStorage(join(root, 'objects'));
  try {
    for (const kind of ['uuid', 'anchor'] as const) {
      const a = repo.create('tenant', {name: kind, sha256: checksum, size: bytes.length});
      await storage.putImmutable(a.originalKey, Readable.from([bytes]), {sha256: checksum, size: bytes.length});
      const p = portrait(a.id), target = p.targets[0]!;
      const good = document(p);
      repo.saveRecipe('tenant', a.id, 'editor', 0, good);
      repo.saveRecipe('tenant', a.id, 'editor', 1, document({...p, targets: [{...target, value: 1}]}));
      repo.saveRecipe('tenant', a.id, 'editor', 2, good); // Healthy head must not hide corrupt earlier history.
      const altered = {...p, targets: [kind === 'uuid' ? {...target, id: randomUUID()} : {...target, anchor: {...anchor, x: 0.6}}]};
      validatePortraitRecipe(altered); // Parse-valid and shape-valid: failure must be continuity, not malformed JSON.
      const tampered = JSON.stringify(document(altered));
      repo.close();
      const writer = new DatabaseSync(path);
      writer.prepare('UPDATE recipes SET body=? WHERE asset_id=? AND revision=2').run(tampered, a.id); writer.close();
      repo = new AssetRepository(path);
      assert.throws(() => repo.latestRecipe('tenant', a.id), /PORTRAIT_PERSON_BINDING/);
      assert.throws(() => repo.saveRecipe('tenant', a.id, 'editor', 3, good), /PORTRAIT_PERSON_BINDING/);
      const inspected = new DatabaseSync(path);
      try {
        assert.equal(inspected.prepare('SELECT body FROM recipes WHERE asset_id=? AND revision=2').get(a.id)?.body, tampered);
        assert.equal(inspected.prepare('SELECT COUNT(*) AS n FROM recipes WHERE asset_id=?').get(a.id)?.n, 3);
      } finally {inspected.close();}
      assert.deepEqual(repo.get('tenant', a.id), a);
      assert.deepEqual(await readFile(join(root, 'objects', a.originalKey)), bytes);
      assert.equal((await storage.inspect(a.originalKey)).sha256, checksum);
    }
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});
