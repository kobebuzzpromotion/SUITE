import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {recipe,portrait,syntheticPixels} from './fixtures.mjs';

const read=path=>readFile(new URL(`../../../${path}`,import.meta.url),'utf8');

test('DECOR-AUDIT-01: official six freckle styles, device evidence and separate Web intensity are not collapsed',async()=>{
  const master=await read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  assert.match(master,/\| EV3-0037 \| Portrait \| Makeup components \/ Face Decorations \| Face Decorations \| Style selection \| DOCUMENTED \| DOCUMENTED \| DOCUMENTED \| DOCUMENTED/);
  assert.match(master,/\| EV3-0038 \| Portrait \| Makeup components \/ Face Decorations \| Face Decorations \| Amount \| NOT_CONFIRMED/);
  const audit=await read('docs/FACE_DECORATIONS_COMPLETION_AUDIT.md');
  for(const url of ['https://support.evoto.ai/makeup/',
    'https://support.evoto.ai/makeup-ipad/',
    'https://support.evoto.ai/portrait-retouching-makeup/',
    'https://www.evoto.ai/features/freckles-filter'])
    assert.ok(audit.includes(url));
  assert.match(audit,/6種類/u);
  assert.match(audit,/各端末実装証拠/u);
  assert.match(audit,/0\/44のまま/u);
});

test('DECOR-AUDIT-02: face brightness target is not a freckle-decoration target',()=>{
  const current=portrait();
  assert.doesNotThrow(()=>validatePortraitRecipe(current));
  for(const type of ['face_decorations','freckles','blush']){
    const invented=structuredClone(current);
    invented.targets[0].adjustmentType=type;
    assert.throws(()=>validatePortraitRecipe(invented),/INVALID_PORTRAIT_TARGET/);
  }
});

test('DECOR-AUDIT-03: arbitrary decoration JSON is not a working Web renderer or portable Preset',()=>{
  const invented=recipe();
  invented.parameters.extendedParameters.faceDecorations={style:1,amount:50};
  assert.throws(()=>renderPixels(syntheticPixels(4,4),invented,
    {validateRecipe}),/UNSUPPORTED_WEB_ADJUSTMENT|INVALID_/);
  assert.throws(()=>portablePresetRecipe(invented),
    /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
});

test('DECOR-AUDIT-04: current product has no six-style freckle UI, Worker, Session or Apple adapter',async()=>{
  const [faces,ui,session,worker,apple,audit]=await Promise.all([
    read('apps/web/src/processing/faces.mjs'),
    read('apps/web/src/editor-ui.mjs'),
    read('apps/web/src/session.mjs'),
    read('apps/web/src/processing/worker.mjs'),
    read('apps/apple/Suite/Services/PortraitPipeline.swift'),
    read('docs/FACE_DECORATIONS_COMPLETION_AUDIT.md')]);
  assert.match(faces,/maskType:'face-oval-polygon-not-person-segmentation'/);
  assert.match(ui,/id="face-brightness"/);
  assert.doesNotMatch(ui,/(?:id="face-decor|setFaceDecoration|freckle-style)/i);
  assert.doesNotMatch(session,/(?:setFaceDecoration|renderFaceDecoration)/i);
  assert.doesNotMatch(worker,/(?:renderFaceDecoration|faceDecorationsManual)/i);
  assert.doesNotMatch(apple,/FaceDecorationAdapter/);
  for(const boundary of ['Blush','Eyeshadow','Contacts','Original SHA',
    'privacy','NOT_RUN'])assert.ok(audit.includes(boundary));
});
