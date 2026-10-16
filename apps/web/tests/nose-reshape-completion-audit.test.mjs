import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {portrait,recipe,syntheticPixels} from './fixtures.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=path=>readFile(resolve(root,path),'utf8');

test('NOSE-AUDIT-01: six frozen controls keep their distinct official labels',async()=>{
  const matrix=await read('docs/EVOTO_AUDIT/SUITE_GAP_MATRIX.md');
  for(const [id,label] of [['0185','Size'],['0186','Length'],
    ['0187','Horizontal'],['0188','Nose Bridge'],['0189','Width'],
    ['0190','Nose Tip']])
    assert.ok(matrix.split('\n').some(line=>line.startsWith(`| EV3-${id} |`)
      &&line.includes(`| Nose | ${label} |`)),`${id}: ${label}`);
  const audit=await read('docs/NOSE_RESHAPE_COMPLETION_AUDIT.md');
  assert.match(audit,/\*\*NOT_IMPLEMENTED\*\*/);
  for(const url of ['https://support.evoto.ai/facial-reshape/',
    'https://support.evoto.ai/facial-reshape-ipad/',
    'https://support.evoto.ai/portrait-retouching-facial-reshape/'])
    assert.ok(audit.includes(url));
  assert.match(audit,/must \*\*not\*\* be copied onto Nose by inference/);
  assert.match(audit,/completion remains unchanged at 0\/44/);
});

test('NOSE-AUDIT-02: typed person target is face luminance, not a nose geometry alias',()=>{
  const bound=portrait();
  assert.doesNotThrow(()=>validatePortraitRecipe(bound));
  for(const alias of ['nose_size','nose_length','nose_horizontal',
    'nose_bridge','nose_width','nose_tip']){
    const invented=structuredClone(bound);
    invented.targets[0].adjustmentType=alias;
    assert.throws(()=>validatePortraitRecipe(invented),/INVALID_PORTRAIT_TARGET/);
  }
});

test('NOSE-AUDIT-03: an unknown extension cannot masquerade as a pixel operation',()=>{
  const invented=recipe();
  invented.parameters.extendedParameters.noseReshape={
    size:.5,length:.5,horizontal:.5,bridge:.5,width:.5,tip:.5};
  assert.doesNotThrow(()=>validateRecipe(invented),
    'generic JSON persistence is not nose-geometry support');
  assert.throws(()=>renderPixels(syntheticPixels(4,4),invented,
    {validateRecipe}),/UNSUPPORTED_WEB_ADJUSTMENT/);
});

test('NOSE-AUDIT-04: current detector, UI and renderer only expose face oval/brightness',async()=>{
  const [faces,pure,ui,session]=await Promise.all([
    read('apps/web/src/processing/faces.mjs'),
    read('apps/web/src/processing/pure.mjs'),
    read('apps/web/src/editor-ui.mjs'),
    read('apps/web/src/session.mjs')]);
  assert.match(faces,/maskType:'face-oval-polygon-not-person-segmentation'/);
  assert.match(faces,/outputFacialTransformationMatrixes:false/);
  assert.match(pure,/target\.adjustmentType!=='face_brightness'/);
  assert.match(ui,/id="face-brightness"/);
  assert.doesNotMatch(ui,/<(?:input|button)[^>]+(?:id|data-action)="nose-/);
  assert.match(session,/key==='faceBrightness'/);
});

test('NOSE-AUDIT-05: local Trial person approval is still a separate blocked Gate',async()=>{
  const [trial,privacy]=await Promise.all([
    read('apps/web/trial-server.mjs'),read('apps/web/src/person-privacy.mjs')]);
  assert.match(trial,/personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'/);
  assert.match(privacy,/PERSON_PRIVACY_APPROVED = 'PRODUCTION_PERSON_APPROVED'/);
});
