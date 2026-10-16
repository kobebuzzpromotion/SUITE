import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {roundTripCrossDeviceRecord as roundTrip} from '../src/cross-device-compat.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const assetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const presetId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const versionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const sha = 'ab'.repeat(32);
const time = '2026-10-04T00:00:00.000Z';
const clone = value => structuredClone(value);
const reject = (kind, value, context = {}) => assert.throws(() => roundTrip(kind, value, context), /CROSS_DEVICE_/);
const fixture = JSON.parse(await readFile(new URL('../../../contracts/recipe-v1.example.json', import.meta.url), 'utf8'));
const project = {id: projectId, workspaceId, name: 'Photobook', createdBy: 'owner', createdAt: time, deletedAt: null};
const asset = {id: assetId, tenantId: workspaceId, name: 'image.raw', originalKey: 'original-key', sha256: sha,
  size: 123, cloudSafe: false, deletedAt: null};
const preset = {id: presetId, workspaceId, scope: 'PERSONAL', ownerUserId: 'owner', name: 'Warm',
  version: 1, body: fixture, createdAt: time, updatedAt: time, deletedAt: null};
const recipeVersion = {id: versionId, workspaceId, projectId, assetId, editorUserId: 'owner',
  createdAt: time, updatedAt: time, version: 2, parentVersion: 1, branch: false,
  body: fixture, changedFields: [{path: '/parameters/exposure', before: 0, after: .25}],
  presetSnapshot: {id: presetId, version: 1, body: fixture}};

test('SuiteCore golden Recipe v1 is preserved without enum envelopes or dropped extensions', () => {
  const out = roundTrip('recipe', fixture);
  assert.deepEqual(out, fixture);
  assert.notStrictEqual(out, fixture);
  validateRecipe(out);
  assert.equal(out.parameters.extendedParameters['suite.test.preservedIntent'].label, '保持のみ・未対応描画を拒否');
});

test('Workspace Project/Asset/Preset/version fields, IDs, original SHA and schema survive roundtrip', () => {
  const context = {workspaceId, projectId, assetId, originalSha256: sha};
  for (const [kind, value] of [['project', project], ['asset', asset], ['preset', preset], ['recipeVersion', recipeVersion]]) {
    const out = roundTrip(kind, value, context);
    assert.deepEqual(out, value);
    assert.notStrictEqual(out, value);
  }
  validateRecipe(roundTrip('recipeVersion', recipeVersion, context).body);
});

test('unknown or hidden fields never silently disappear', () => {
  for (const [kind, value] of [['project', project], ['asset', asset], ['preset', preset], ['recipeVersion', recipeVersion]]) {
    reject(kind, {...value, surprise: 1});
    const hidden = clone(value);
    Object.defineProperty(hidden, 'future', {value: 'do not drop', enumerable: false});
    reject(kind, hidden);
  }
  reject('recipe', {...fixture, future: true});
  reject('recipe', {...fixture, parameters: {...fixture.parameters, future: true}});
  reject('recipe', {...fixture, parameters: {...fixture.parameters, extendedParameters: {'suite.test.field': {nested: null}}}});
  const accessor = clone(project);
  Object.defineProperty(accessor, 'name', {get() { return 'sneaky'; }, enumerable: true});
  reject('project', accessor);
});

test('schema, processing stages and unverified processing extensions fail closed', () => {
  reject('recipe', {...fixture, schemaVersion: 2});
  reject('recipe', {...fixture, parameters: {...fixture.parameters, processingOrder: ['exposure', 'impossible']}});
  reject('recipe', {...fixture, parameters: {...fixture.parameters, processingOrder: ['exposure', 'exposure']}});
  reject('recipe', {...fixture, parameters: {...fixture.parameters, extendedParameters: {postDecodeAdjustments: {schemaVersion: 1}}}});
  reject('recipe', {...fixture, parameters: {...fixture.parameters, extendedParameters: {'suite.test.field': Infinity}}});
  const neutral = clone(fixture);
  neutral.parameters.extendedParameters = {};
  neutral.parameters.exposure = 0;
  neutral.parameters.contrast = 1;
  neutral.parameters.saturation = 1;
  neutral.parameters.rotationDegrees = 0;
  neutral.parameters.processingOrder = [];
  assert.deepEqual(roundTrip('recipe', neutral), neutral);
});

test('identity, checksum, revision and scope mismatch are rejected before transfer', () => {
  reject('project', project, {workspaceId: projectId});
  reject('asset', asset, {workspaceId, originalSha256: 'cd'.repeat(32)});
  reject('asset', {...asset, sha256: sha.toUpperCase()});
  reject('asset', {...asset, size: Number.MAX_SAFE_INTEGER + 1});
  reject('preset', {...preset, version: 0});
  reject('preset', {...preset, scope: 'COMMUNITY'});
  reject('recipeVersion', {...recipeVersion, parentVersion: 2});
  reject('recipeVersion', recipeVersion, {workspaceId, projectId, assetId: projectId});
  reject('recipeVersion', {...recipeVersion, changedFields: [{path: '/x', after: null}]});
  reject('recipeVersion', {...recipeVersion, body: {...fixture, schemaVersion: 9}});
});

test('local history, export and sync are not falsely certified as shared contracts', () => {
  for (const kind of ['localHistory', 'exportSettings', 'exportPlan', 'sync']) reject(kind, {});
});
