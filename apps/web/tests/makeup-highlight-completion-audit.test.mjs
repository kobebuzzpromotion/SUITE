import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {applyColorAdjustments} from '../src/processing/color-adjustments.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {recipe,portrait,syntheticPixels} from './fixtures.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=path=>readFile(resolve(root,path),'utf8');

test('MAKEUP-HIGHLIGHT-AUDIT-01: frozen row is one intensity control, not the whole Makeup Suite',async()=>{
  const master=await read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  assert.match(master,/\| EV3-0001 \| Portrait \| Makeup \/ Highlight \| Highlight \| Intensity \|/);
  assert.match(master,/\| EV3-0002 \| Portrait \| Makeup \/ Contour \|/);
  const audit=await read('docs/MAKEUP_HIGHLIGHT_COMPLETION_AUDIT.md');
  for(const url of ['https://support.evoto.ai/makeup/','https://support.evoto.ai/makeup-ipad/',
    'https://support.evoto.ai/portrait-retouching-makeup/'])assert.ok(audit.includes(url));
  assert.match(audit,/NOT_IMPLEMENTED in SUITE/);
  assert.match(audit,/completion count remains unchanged/);
});

test('MAKEUP-HIGHLIGHT-AUDIT-02: global tonal highlights cannot select a facial region',()=>{
  const pixels={width:2,height:1,data:new Uint8ClampedArray([220,210,200,255,220,210,200,255])};
  const adjusted=applyColorAdjustments(pixels,{highlights:80});
  assert.notDeepEqual([...adjusted.data],[...pixels.data]);
  assert.deepEqual([...adjusted.data.slice(0,4)],[...adjusted.data.slice(4,8)]);
  assert.deepEqual([...pixels.data],[220,210,200,255,220,210,200,255]);
});

test('MAKEUP-HIGHLIGHT-AUDIT-03: invented alias is rejected; typed structure is not yet a Web render operation',()=>{
  const invented=recipe();invented.parameters.extendedParameters.makeupHighlight={intensity:10};
  assert.throws(()=>validateRecipe(invented),/INVALID_MAKEUP_HIGHLIGHT_MANUAL_ALIAS/);
  const typed=recipe();typed.parameters.extendedParameters.makeupHighlightManual={
    schemaVersion:1,engineVersion:'suite-srgb8-owner-manual-makeup-highlight-1',
    binding:{assetID:'11111111-1111-4111-8111-111111111111',originalSHA256:'a'.repeat(64),
      sourceWidth:4,sourceHeight:4,personID:'33333333-3333-4333-8333-333333333333'},
    highlightStrokes:[{operation:'ADD',path:[{u:.3,v:.4}],radiusFraction:.04,hardness:.6}],
    settings:{intensity:10}};
  assert.doesNotThrow(()=>validateRecipe(typed),'typed syntax alone is not product integration');
  assert.throws(()=>renderPixels(syntheticPixels(4,4),typed,{validateRecipe}),/UNSUPPORTED_WEB_ADJUSTMENT/);
});

test('MAKEUP-HIGHLIGHT-AUDIT-04: portrait target and mask are face-brightness-only, local mask is explicit',async()=>{
  const person=portrait();assert.doesNotThrow(()=>validatePortraitRecipe(person));
  person.targets[0].adjustmentType='makeup_highlight';
  assert.throws(()=>validatePortraitRecipe(person),/INVALID_PORTRAIT_TARGET/);
  const faces=await read('apps/web/src/processing/faces.mjs');
  const local=await read('apps/web/src/processing/local-levels.mjs');
  const ui=await read('apps/web/src/editor-ui.mjs');
  assert.match(faces,/maskType:'face-oval-polygon-not-person-segmentation'/);
  assert.match(local,/The mask is supplied by the caller: no person detection/);
  assert.match(ui,/id="face-brightness"/);
  assert.doesNotMatch(ui,/id="makeup-highlight"/);
});
