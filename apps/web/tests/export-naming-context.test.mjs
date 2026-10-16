import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveExportNamingContext} from '../src/export-naming-context.mjs';
import {buildExportFilenameFromForm} from '../src/export-naming-form.mjs';

const recipe = () => ({schemaVersion: 1, parameters: {exposure: 0}});
const state = () => ({asset: {id: 'asset-1', name: 'DSC_001.ARW'}, assets: [
  {id: 'asset-1', name: 'DSC_001.ARW'}, {id: 'asset-2', name: 'DSC_002.ARW'},
], recipe: recipe(), revision: 3, dirty: false,
metadata: {make: 'Example Camera', width: 100, height: 80}});
function savedWorkspacePreset(current = state()) {
  const body = recipe();
  return {workspaceRecipeVersion: {workspaceId: 'workspace-1', assetId: current.asset.id,
    version: current.revision, branch: false, body,
    presetSnapshot: {id: 'preset-1', version: 2, body: recipe()}},
  workspacePreset: {workspaceId: 'workspace-1', scope: 'PERSONAL', id: 'preset-1',
    version: 2, name: 'Soft Light', body: recipe()}};
}

test('EXPORT-CONTEXT01: actual selected RAW name is the only baseline context', () => {
  const current = state();
  const context = resolveExportNamingContext({state: current, method: 'original'});
  assert.deepEqual(context, {originalFilename: 'DSC_001.ARW'});
  assert.ok(Object.isFrozen(context));
  assert.equal(buildExportFilenameFromForm({...context, format: 'jpeg', method: 'original'}),
    'DSC_001.jpg');
  const custom = resolveExportNamingContext({state: current, method: 'original-custom'});
  assert.equal(buildExportFilenameFromForm({...custom, format: 'png', method: 'original-custom',
    customText: 'Portrait'}), 'DSC_001_Portrait.png');
  assert.deepEqual(current, state());
});

test('EXPORT-CONTEXT02: file name must come from a selected Asset, never a fallback label or path', () => {
  for (const asset of [null, {id: 'asset-1'}, {id: 'asset-1', name: '  '},
    {id: 'asset-1', name: '../unsafe.ARW'}, {id: 'asset-1', name: 'a\\b.ARW'}])
    assert.throws(() => resolveExportNamingContext({state: {...state(), asset}, method: 'original'}),
      /EXPORT_ORIGINAL_NAME_UNAVAILABLE/);
  assert.throws(() => resolveExportNamingContext({state: state(), method: 'invented'}),
    /EXPORT_NAMING_METHOD_UNSUPPORTED/);
});

test('EXPORT-CONTEXT03: Asset order/import time and injected EXIF-looking fields are not export/capture provenance', () => {
  const current = state();
  current.metadata.captureDate = '2024-08-12';
  current.asset.createdAt = '2024-08-12T09:00:00Z';
  for (const method of ['custom-count', 'custom-sequence'])
    assert.throws(() => resolveExportNamingContext({state: current, method}),
      /EXPORT_SEQUENCE_UNAVAILABLE/);
  assert.throws(() => resolveExportNamingContext({state: current, method: 'capture-date-original'}),
    /EXPORT_CAPTURE_DATE_UNAVAILABLE/);
});

test('EXPORT-CONTEXT04: a clean exact saved Workspace version can supply an actual Effect Preset name', () => {
  const current = state(), evidence = savedWorkspacePreset(current);
  const context = resolveExportNamingContext({state: current, method: 'original-effect-preset', ...evidence});
  assert.deepEqual(context, {originalFilename: 'DSC_001.ARW', effectPresetName: 'Soft Light'});
  assert.equal(buildExportFilenameFromForm({...context, format: 'jpeg',
    method: 'original-effect-preset'}), 'DSC_001_Soft Light.jpg');
  const withCustom = resolveExportNamingContext({state: current, method: 'original-effect-custom', ...evidence});
  assert.equal(buildExportFilenameFromForm({...withCustom, format: 'png',
    method: 'original-effect-custom', customText: 'Print'}), 'DSC_001_Soft Light_Print.png');
});

test('EXPORT-CONTEXT05: stale, dirty, conflicted, renamed or mismatched preset evidence is refused', () => {
  const current = state(), evidence = savedWorkspacePreset(current);
  const attempt = (changedState, changedEvidence) => resolveExportNamingContext({
    state: changedState, method: 'original-effect-preset', ...changedEvidence,
  });
  for (const changedState of [{...current, dirty: true}, {...current, revision: 4},
    {...current, recipe: {schemaVersion: 1, parameters: {exposure: 1}}},
    {...current, asset: {...current.asset, id: 'other'}}])
    assert.throws(() => attempt(changedState, evidence), /EXPORT_EFFECT_PRESET_UNAVAILABLE/);
  for (const changedEvidence of [
    {...evidence, workspaceRecipeVersion: {...evidence.workspaceRecipeVersion, branch: true}},
    {...evidence, workspacePreset: {...evidence.workspacePreset, version: 3}},
    {...evidence, workspacePreset: {...evidence.workspacePreset, workspaceId: 'other'}},
    {...evidence, workspacePreset: {...evidence.workspacePreset, body: {other: true}}},
    {...evidence, workspacePreset: {...evidence.workspacePreset, kind: 'AUTHOR_PUBLISHED', scope: undefined}},
    {...evidence, workspaceRecipeVersion: {...evidence.workspaceRecipeVersion, presetSnapshot: null}},
  ]) assert.throws(() => attempt(current, changedEvidence), /EXPORT_EFFECT_PRESET_UNAVAILABLE/);
});

test('EXPORT-CONTEXT06: static Export Preset catalogue or arbitrary names do not prove a selected preset', () => {
  const current = state(), evidence = savedWorkspacePreset(current);
  current.recipe.parameters.extendedParameters = {export: {preset_name: 'Web / SNS'}};
  assert.throws(() => resolveExportNamingContext({state: current, method: 'original-export-preset',
    selectedExportPreset: {id: 'export.web-sns', name: 'Web / SNS'}}),
  /EXPORT_EXPORT_PRESET_UNAVAILABLE/);
  assert.throws(() => resolveExportNamingContext({state: state(), method: 'original-effect-export-preset',
    ...savedWorkspacePreset(), selectedExportPreset: {id: 'export.web-sns', name: 'Web / SNS'}}),
  /EXPORT_EXPORT_PRESET_UNAVAILABLE/);
  assert.throws(() => resolveExportNamingContext({state: state(), method: 'original-effect-preset',
    effectPresetName: 'Some preset'}), /EXPORT_EFFECT_PRESET_UNAVAILABLE/);
});
