import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {recipe,portrait,syntheticPixels} from './fixtures.mjs';

const read=path=>readFile(new URL(`../../../${path}`,import.meta.url),'utf8');

test('HANDS-AUDIT-01: the three original suboperations and platform-limited primary sources remain distinct',async()=>{
  const [master,audit]=await Promise.all([
    read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md'),
    read('docs/HANDS_COMPLETION_AUDIT.md')]);
  for(const [id,name] of [[232,'Even Dodge & Burn'],[233,'Hand Vein'],
    [234,'Hand Reshaping']]){
    const featureID=`EV3-${String(id).padStart(4,'0')}`;
    assert.ok(master.includes(`| ${featureID} | Portrait | Hands | Hands | ${name} |`));
    assert.ok(audit.includes(featureID));
  }
  for(const url of ['https://support.evoto.ai/hands/',
    'https://support.evoto.ai/portrait-retouching-hands/',
    'https://support.evoto.ai/hands-ipad/'])assert.ok(audit.includes(url));
  assert.match(audit,/iPad.*非記載.*不存在/u);
  assert.match(audit,/0\/44/u);
});

test('HANDS-AUDIT-02: a face-only portrait target cannot alias a hand operation',()=>{
  const original=portrait();assert.doesNotThrow(()=>validatePortraitRecipe(original));
  for(const adjustmentType of ['hand_even','hand_vein','hand_reshape']){
    const invented=structuredClone(original);
    invented.targets[0].adjustmentType=adjustmentType;
    assert.throws(()=>validatePortraitRecipe(invented),/INVALID_PORTRAIT_TARGET/u);
  }
});

test('HANDS-AUDIT-03: fake hand aliases reject and do not render or become portable Presets',()=>{
  for(const key of ['handEven','handVein','handReshape']){
    const invented=recipe();invented.parameters.extendedParameters[key]={amount:40};
    assert.throws(()=>validateRecipe(invented),/INVALID_HAND_TONE_MANUAL_ALIAS/u);
    assert.throws(()=>renderPixels(syntheticPixels(4,4),invented,{validateRecipe}),
      /INVALID_HAND_TONE_MANUAL_ALIAS/u);
    assert.throws(()=>portablePresetRecipe(invented),
      /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/u);
  }
});

test('HANDS-AUDIT-04: Web and Apple paths have no hand-specific processor, UI or Final adapter',async()=>{
  const [faces,pure,session,editor,apple,appleUI]=await Promise.all([
    read('apps/web/src/processing/faces.mjs'),
    read('apps/web/src/processing/pure.mjs'),
    read('apps/web/src/session.mjs'),
    read('apps/web/src/editor-ui.mjs'),
    read('apps/apple/Suite/Services/PortraitPipeline.swift'),
    read('apps/apple/Suite/Shared/EditorComponents.swift')]);
  assert.match(faces,/face-oval-polygon-not-person-segmentation/u);
  assert.match(pure,/target\.adjustmentType!=='face_brightness'/u);
  assert.match(pure,/rasterizeLocalBrushMask/u);
  assert.match(session,/if\(key==='faceBrightness'\)/u);
  assert.match(editor,/id="face-brightness"/u);
  for(const source of [pure,session,editor,apple,appleUI])
    assert.doesNotMatch(source,/(?:setHandVein|applyHandVein|HandReshapeAdapter|id="hand-(?:even|vein|reshape)")/u);
  assert.match(apple,/FaceBrightnessAdapter\(\)/u);
});
