import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {roundTripCrossDeviceRecord as roundTrip} from '../src/cross-device-compat.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const assetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const presetId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const versionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const sha = 'ab'.repeat(32);
const time = '2026-10-04T00:00:00.000Z';
const fixture = JSON.parse(await readFile(resolve(here, '../../../contracts/recipe-v1.example.json'), 'utf8'));

test('DESKTOP-IPAD-AUDIT-01 / source IDs document two directions and unsupported-option caveat, not universal parity', async () => {
  const matrix = await readFile(resolve(here, '../../../docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md'), 'utf8');
  for (const [id, subOperation] of [['EV3-0873', 'Desktop→iPad'],
    ['EV3-0874', 'iPad→Desktop'],
    ['EV3-0875', 'Unsupported settings partial/variable application']]) {
    assert.ok(matrix.includes(`| ${id} | Preset / Sync | Desktop ↔ iPad compatibility | Desktop ↔ iPad compatibility | ${subOperation} |`));
  }
  assert.match(matrix, /Mostpresetscompatible;unsupportedfeaturesmayvary\/beincomplete/);
});

test('DESKTOP-IPAD-AUDIT-02 / safe Recipe and scoped Preset/Asset/version metadata round-trip without implying renderer support', () => {
  assert.deepEqual(roundTrip('recipe', fixture), fixture);
  validateRecipe(fixture);
  const preset = {id: presetId, workspaceId, scope: 'PERSONAL', ownerUserId: 'owner',
    name: 'Warm', version: 1, body: fixture, createdAt: time, updatedAt: time, deletedAt: null};
  const asset = {id: assetId, tenantId: workspaceId, name: 'image.raw', originalKey: 'original-key',
    sha256: sha, size: 123, cloudSafe: false, deletedAt: null};
  const version = {id: versionId, workspaceId, projectId, assetId, editorUserId: 'owner',
    createdAt: time, updatedAt: time, version: 2, parentVersion: 1, branch: false,
    body: fixture, changedFields: [{path: '/parameters/exposure', before: 0, after: .25}],
    presetSnapshot: {id: presetId, version: 1, body: fixture}};
  const context = {workspaceId, projectId, assetId, originalSha256: sha};
  for (const [kind, value] of [['preset', preset], ['asset', asset], ['recipeVersion', version]])
    assert.deepEqual(roundTrip(kind, value, context), value);
  assert.throws(() => roundTrip('preset', {...preset, scope: 'COMMUNITY'}, context), /CROSS_DEVICE_PRESET_SCOPE/);
  assert.throws(() => roundTrip('asset', {...asset, sha256: 'cd'.repeat(32)}, context), /CROSS_DEVICE_SHA256/);
});

test('DESKTOP-IPAD-AUDIT-03 / valid Web detail Recipe is refused by conservative shared preflight, not silently stripped for iPad', () => {
  const webRecipe = structuredClone(fixture);
  webRecipe.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', detail: {clarity: 30},
  };
  webRecipe.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  assert.doesNotThrow(() => validateRecipe(webRecipe));
  assert.throws(() => roundTrip('recipe', webRecipe), /CROSS_DEVICE_RECIPE_EXTENSION_UNVERIFIED/);
  assert.equal(webRecipe.parameters.extendedParameters.postDecodeAdjustments.detail.clarity, 30);
});

test('DESKTOP-IPAD-AUDIT-04 / shipped Apple default has no backend host, Proxy transfer or native Final parity claim', async () => {
  const [app, model, browser, transfer, pipeline, appleReadme] = await Promise.all([
    readFile(resolve(here, '../../apple/Suite/SuiteApp.swift'), 'utf8'),
    readFile(resolve(here, '../../apple/Suite/EditorModel.swift'), 'utf8'),
    readFile(resolve(here, '../../apple/Suite/Shared/WorkspaceBrowser.swift'), 'utf8'),
    readFile(resolve(here, '../../apple/Suite/Services/CloudTransferCoordinator.swift'), 'utf8'),
    readFile(resolve(here, '../../apple/Suite/Services/PhotoPipeline.swift'), 'utf8'),
    readFile(resolve(here, '../../apple/Suite/Features/iPad/README.md'), 'utf8'),
  ]);
  assert.match(app, /EditorModel\(\)/);
  assert.match(app, /WorkspaceBrowser\(client: nil\)/);
  assert.match(model, /init\(backend: SuiteBackendClient\? = nil/);
  assert.match(browser, /Proxy画像表示・編集・Export接続は未実装/);
  assert.match(transfer, /Proxy transfer \(P1\) remains unimplemented/);
  assert.match(pipeline, /Set\(p\.extendedParameters\.keys\)\.isSubset\(of: \["crop", "export", "portrait"\]\)/);
  assert.match(appleReadme, /未実施: Swiftコンパイル、Xcodeビルド、シミュレータ、iPad実機/);
  for (const kind of ['sync', 'localHistory', 'exportPlan'])
    assert.throws(() => roundTrip(kind, {}), /CROSS_DEVICE_UNSUPPORTED_CONTRACT/);
});
