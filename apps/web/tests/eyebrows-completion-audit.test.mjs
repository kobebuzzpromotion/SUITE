import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {recipe,portrait,syntheticPixels} from './fixtures.mjs';

const read=path=>readFile(new URL(`../../../${path}`,import.meta.url),'utf8');

test('EYEBROWS-AUDIT-01: frozen five geometry controls and linked/separate stay distinct from makeup',async()=>{
  const master=await read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  for(const [id,name] of [[169,'Thickness'],[170,'Distance'],[171,'Tilt'],
    [172,'Arch Height'],[173,'Position'],[174,'Linked / separate']])
    assert.match(master,new RegExp(`\\| EV3-${String(id).padStart(4,'0')} \\| Portrait \\| Facial Reshape / Eyebrows \\| Eyebrows \\| ${name.replace('/','\\/')} \\| DOCUMENTED`));
  assert.match(master,/\| EV3-0019 \| Portrait \| Makeup components \/ Eyebrows \| Eyebrows \| Style selection \| DOCUMENTED/);
  assert.match(master,/\| EV3-0020 \| Portrait \| Makeup components \/ Eyebrows \| Eyebrows \| Amount \| NOT_CONFIRMED/);
  const audit=await read('docs/EYEBROWS_COMPLETION_AUDIT.md');
  for(const url of ['https://support.evoto.ai/facial-reshape/',
    'https://support.evoto.ai/facial-reshape-ipad/',
    'https://support.evoto.ai/portrait-retouching-facial-reshape/',
    'https://support.evoto.ai/makeup/'])assert.ok(audit.includes(url));
  assert.match(audit,/iPad.*Height/u);
  assert.match(audit,/0\/44のまま/u);
});

test('EYEBROWS-AUDIT-02: typed Portrait contract does not alias face EV to either eyebrow geometry or makeup',()=>{
  const original=portrait();assert.doesNotThrow(()=>validatePortraitRecipe(original));
  for(const type of ['eyebrow_thickness','eyebrow_position','eyebrow_makeup']){
    const invented=structuredClone(original);invented.targets[0].adjustmentType=type;
    assert.throws(()=>validatePortraitRecipe(invented),/INVALID_PORTRAIT_TARGET/);
  }
});

test('EYEBROWS-AUDIT-03: generic JSON extension is not rendered eyebrow geometry or portable Preset',()=>{
  const invented=recipe();invented.parameters.extendedParameters.eyebrowReshape={
    personID:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',left:{position:20},right:{position:0}};
  assert.doesNotThrow(()=>validateRecipe(invented),'structural acceptance is not implementation');
  assert.throws(()=>renderPixels(syntheticPixels(4,4),invented,{validateRecipe}),
    /UNSUPPORTED_WEB_ADJUSTMENT/);
  assert.throws(()=>portablePresetRecipe(invented),/PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
});

test('EYEBROWS-AUDIT-04: Web/Apple product paths expose face oval brightness, not eyebrow landmarks or warp UI',async()=>{
  const [faces,pure,ui,session,apple,appleUI]=await Promise.all([
    read('apps/web/src/processing/faces.mjs'),read('apps/web/src/processing/pure.mjs'),
    read('apps/web/src/editor-ui.mjs'),read('apps/web/src/session.mjs'),
    read('apps/apple/Suite/Services/PortraitPipeline.swift'),
    read('apps/apple/Suite/Shared/EditorComponents.swift')]);
  assert.match(faces,/maskType:'face-oval-polygon-not-person-segmentation'/);
  assert.match(faces,/return detections;/);
  assert.match(pure,/target\.adjustmentType!=='face_brightness'/);
  assert.match(ui,/id="face-brightness"/);
  assert.doesNotMatch(ui,/(?:id="(?:eyebrow-thickness|eyebrow-distance|eyebrow-position)"|setEyebrowReshape)/i);
  assert.match(session,/if\(key==='faceBrightness'\)/);
  assert.doesNotMatch(session,/setEyebrowReshape/);
  assert.match(apple,/FaceBrightnessAdapter\(\)/);
  assert.doesNotMatch(apple,/EyebrowReshapeAdapter/);
  assert.doesNotMatch(appleUI,/Eyebrow (?:Thickness|Position)/);
});
