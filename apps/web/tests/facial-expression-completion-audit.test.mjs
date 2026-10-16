import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {recipe, portrait, syntheticPixels} from './fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = path => readFile(resolve(root, path), 'utf8');

test('EXPRESSION-AUDIT-01: frozen Desktop/Mobile operations and platform limits remain separately identified', async () => {
  const matrix = await read('docs/EVOTO_AUDIT/SUITE_GAP_MATRIX.md');
  for (let id = 243; id <= 253; id++)
    assert.match(matrix, new RegExp(`\\| EV3-${String(id).padStart(4, '0')} \\|[^\\n]*\\| (?:Mobile )?Facial Expression \\|`));
  const audit = await read('docs/FACIAL_EXPRESSION_COMPLETION_AUDIT.md');
  assert.match(audit, /NOT_IMPLEMENTED/);
  for (const url of ['https://support.evoto.ai/facial-expression/',
    'https://support.evoto.ai/portrait-retouching-facial-expression/',
    'https://support.evoto.ai/facial-expression-ipad/']) assert.ok(audit.includes(url));
  assert.match(audit, /does \*\*not\*\* by itself establish Mobile Neutral on iPad/);
  assert.match(audit, /completion count remains unchanged/);
});

test('EXPRESSION-AUDIT-02: Portrait target contract cannot treat smile or lip geometry as Face Brightness', () => {
  const person = portrait();
  assert.doesNotThrow(() => validatePortraitRecipe(person));
  for (const alias of ['gummy_smile', 'gentle_smile', 'smile_generation', 'neutral_smile']) {
    const claimed = structuredClone(person);
    claimed.targets[0].adjustmentType = alias;
    assert.throws(() => validatePortraitRecipe(claimed), /INVALID_PORTRAIT_TARGET/);
  }
});

test('EXPRESSION-AUDIT-03: invented Recipe expression key is not a product pixel operation', () => {
  const invented = recipe();
  invented.parameters.extendedParameters.facialExpression = {mode: 'gentle_smile', intensity: 1};
  assert.doesNotThrow(() => validateRecipe(invented),
    'generic extension storage is not evidence of supported expression rendering');
  assert.throws(() => renderPixels(syntheticPixels(4, 4), invented, {validateRecipe}),
    /UNSUPPORTED_WEB_ADJUSTMENT/);
});

test('EXPRESSION-AUDIT-04: detector/render/UI expose face oval EV, not mouth controls or suitability analysis', async () => {
  const [faces, pure, ui, session] = await Promise.all([
    read('apps/web/src/processing/faces.mjs'), read('apps/web/src/processing/pure.mjs'),
    read('apps/web/src/editor-ui.mjs'), read('apps/web/src/session.mjs')]);
  assert.match(faces, /outputFaceBlendshapes:false/);
  assert.match(faces, /maskType:'face-oval-polygon-not-person-segmentation'/);
  assert.match(pure, /target\.adjustmentType!=='face_brightness'/);
  assert.match(ui, /id="face-brightness"/);
  assert.doesNotMatch(ui, /id="(?:gummy-smile|gentle-smile|smile-generation|neutral-smile)"/);
  assert.match(session, /if\(key==='faceBrightness'\)/);
  assert.match(session, /requirePersonProcessing\(\)/);
});
