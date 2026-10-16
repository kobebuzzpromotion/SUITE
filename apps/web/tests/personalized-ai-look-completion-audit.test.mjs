import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {createPresetFacade} from '../src/preset-facade.mjs';
import {FEATURE_CATALOG} from '../src/feature-catalog.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = relative => readFile(resolve(here, relative), 'utf8');

test('PERSONAL-AI-LOOK-AUDIT-01 / official source matrix preserves all 23 distinct sub-operations', async () => {
  const matrix = await source('../../../docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  const operations = ['Lite XMP', 'Lite Evoto preset', 'Personal edited image set', 'RAW',
    'JPEG/TIFF', 'Both', 'Lightroom .lrcat', 'Evoto project', 'Local Folder RAW+XMP',
    'AI Smart Selection50minimum', 'Auto-Import Profiles', 'Preview5images',
    'AI Correction', 'Fixed Value', 'Curve', 'HSL', 'Color Grading',
    'Color Calibration', 'Ready states', 'Locked on downgrade', 'Duplicate',
    'Training progress', 'Cancel Waiting/Uploading'];
  assert.equal(operations.length, 23);
  for (let index = 0; index < operations.length; index++) {
    const id = `EV3-${String(595 + index).padStart(4, '0')}`;
    assert.ok(matrix.includes(`| ${id} | Color | Personalized AI Look | Personalized AI Look | ${operations[index]} |`), id);
  }
  assert.match(matrix, /Lookeffectmaskedwhenpresetshared;actualLooksharingunsupported/);
});

test('PERSONAL-AI-LOOK-AUDIT-02 / SuiteCore Session Look is an intent and adapter plan, not trained or rendered pixels', async () => {
  const [look, planning, notes] = await Promise.all([
    source('../../../packages/SuiteCore/Sources/SuiteCore/SessionLook.swift'),
    source('../../../packages/SuiteCore/Sources/SuiteCore/SessionLookPlanning.swift'),
    source('../../../packages/SuiteCore/IMPLEMENTATION_NOTES.md'),
  ]);
  assert.match(look, /public struct SessionLook: Codable/);
  assert.match(look, /Data-only intents, interpreted only by a supporting adapter/);
  assert.match(look, /Returns metadata only, not processed pixels or an applied Recipe/);
  assert.match(planning, /public var isRendered: Bool \{ false \}/);
  assert.match(planning, /case skipped\(LookPlanSkipReason\), requiresAnalysis, notSupported, readyForAdapter/);
  assert.match(notes, /No real provider is registered/);
  assert.doesNotMatch(look, /trainingCorpus|lrcat|xmpSource|trainedModel/);
});

test('PERSONAL-AI-LOOK-AUDIT-03 / current Preset operation surface is not model training or Community Look sharing', async () => {
  const facade = createPresetFacade();
  await assert.rejects(facade.list({kind: 'COMMUNITY'}), /COMMUNITY_NOT_IMPLEMENTED/);
  const sourceText = await source('../src/preset-facade.mjs');
  assert.match(sourceText, /Workspace preset replaces a whole Recipe; an Author preset merges portable globals/);
  assert.match(sourceText, /applyMode: 'FULL_RECIPE_REPLACE'/);
  assert.match(sourceText, /applyMode: 'PORTABLE_GLOBAL_MERGE'/);
  assert.doesNotMatch(sourceText, /trainLook|AI Correction|Fixed Value|\.lrcat/);
  const grading = FEATURE_CATALOG.flatMap(group => group.items)
    .find(([name]) => name === 'Color Grading');
  assert.deepEqual(grading, ['Color Grading', 'NOT_CONNECTED']);
});

test('PERSONAL-AI-LOOK-AUDIT-04 / current Web AI editing copy explicitly marks the feature unavailable', async () => {
  const landing = await source('../src/landing-ui.mjs');
  assert.match(landing, /AI編集モードで、さらに表現を広げる。/);
  assert.match(landing, /現Web試用版では人物解析・AI編集・クラウド保存は未提供です/);
  const [session, editor] = await Promise.all([source('../src/session.mjs'), source('../src/editor-ui.mjs')]);
  assert.doesNotMatch(session, /trainPersonalizedLook|createAILookTrainingJob/);
  assert.doesNotMatch(editor, /Train Your AI Look|Lite Personal AI Look/);
});
