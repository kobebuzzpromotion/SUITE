import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {recipe,portrait,syntheticPixels} from './fixtures.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=path=>readFile(resolve(root,path),'utf8');

test('TEETH-AUDIT-01: eight frozen subitems and the separate official methods remain unclaimed',async()=>{
  const matrix=await read('docs/EVOTO_AUDIT/SUITE_GAP_MATRIX.md');
  for(let id=235;id<=242;id++)assert.match(matrix,
    new RegExp(`\\| EV3-${String(id).padStart(4,'0')} \\|[^\\n]*\\| Teeth \\|`));
  const audit=await read('docs/TEETH_COMPLETION_AUDIT.md');
  assert.match(audit,/NOT_IMPLEMENTED in SUITE/);
  for(const url of ['https://support.evoto.ai/teeth/','https://support.evoto.ai/teeth-ipad/',
    'https://support.evoto.ai/portrait-retouching-teeth/',
    'https://support.evoto.ai/how-to-whiten-teeth-in-evoto-in-3-quick-ways/'])
    assert.ok(audit.includes(url));
  assert.match(audit,/manual, explicitly painted teeth-only/i);
  assert.match(audit,/completion count remains unchanged/);
});

test('TEETH-AUDIT-02: invented Teeth aliases now reject at Recipe validation; typed manual data is still not a product render route',()=>{
  const body=recipe();body.parameters.extendedParameters.teeth={whitening:10};
  assert.throws(()=>validateRecipe(body),/INVALID_TEETH_MANUAL_ALIAS/,
    'the former generic-extension acceptance is closed');
  assert.throws(()=>renderPixels(syntheticPixels(4,4),body,{validateRecipe}),
    /INVALID_TEETH_MANUAL_ALIAS/,'invented Teeth cannot silently render into Final');
  const typed=recipe();typed.parameters.extendedParameters.teethManual={
    schemaVersion:1,engineVersion:'suite-srgb8-owner-manual-teeth-whitening-1',
    binding:{assetID:'11111111-1111-4111-8111-111111111111',
      originalSHA256:'a'.repeat(64),sourceWidth:4,sourceHeight:4,
      personID:'33333333-3333-4333-8333-333333333333'},
    teethStrokes:[{operation:'ADD',path:[{u:.4,v:.5}],
      radiusFraction:.04,hardness:.6}],
    settings:{brightness:20,desaturation:30}};
  assert.doesNotThrow(()=>validateRecipe(typed),'structure alone is not product support');
  assert.throws(()=>renderPixels(syntheticPixels(4,4),typed,{validateRecipe}),
    /UNSUPPORTED_WEB_ADJUSTMENT/,'typed manual data is not yet connected to Final');
});

test('TEETH-AUDIT-03: portrait contract accepts face brightness, not a tooth target or claimed tooth mask',async()=>{
  const person=portrait();assert.doesNotThrow(()=>validatePortraitRecipe(person));
  person.targets[0].adjustmentType='teeth_whitening';
  assert.throws(()=>validatePortraitRecipe(person),/INVALID_PORTRAIT_TARGET/);
  const faces=await read('apps/web/src/processing/faces.mjs');
  const pure=await read('apps/web/src/processing/pure.mjs');
  const ui=await read('apps/web/src/editor-ui.mjs');
  assert.match(faces,/maskType:'face-oval-polygon-not-person-segmentation'/);
  assert.match(pure,/target\.adjustmentType!=='face_brightness'/);
  assert.match(ui,/id="face-brightness"/);
  assert.doesNotMatch(ui,/id="teeth-(brightness|desaturation|alignment|pretty)/);
});
