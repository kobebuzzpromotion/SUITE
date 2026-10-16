import test from 'node:test';
import assert from 'node:assert/strict';
import {neutralRecipe} from '../src/session.mjs';
import {mergeAuthorGlowOnly} from '../src/author-glow-only.mjs';

const glow={mode:'halation',intensity:82,radius:11,threshold:132,
  exposure:24,diffusion:63,tint:-18};
const portable={exposure:-2,contrast:0.7,saturation:1.8,
  postDecodeAdjustments:{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',
    color:{glow},detail:{clarity:30}}};

test('published Author Glow merges only Glow and leaves target values and input unchanged',()=>{
  const target=neutralRecipe();
  target.parameters.exposure=1.2;
  target.parameters.contrast=1.4;
  target.parameters.rotationDegrees=90;
  target.parameters.extendedParameters.postCropAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-manual-vignette-1',vignette:{amount:-35,feather:60}};
  target.parameters.extendedParameters.canvasExpand={schemaVersion:1,
    margins:{left:0.1,right:0.2,top:0,bottom:0},background:[255,255,255,255]};
  target.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',color:{temperature:34,
      levels:{master:{inputBlack:20}}},detail:{sharpness:18}};
  target.parameters.processingOrder=['exposure','contrast','saturation','postDecodeAdjustments','rotation'];
  const before=structuredClone(target),source=structuredClone(portable);
  const merged=mergeAuthorGlowOnly(target,portable);
  assert.deepEqual(target,before);
  assert.deepEqual(portable,source);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.color.glow,glow);
  delete merged.parameters.extendedParameters.postDecodeAdjustments.color.glow;
  assert.deepEqual(merged,before);
});

test('published Author Glow inserts the processing stage without changing other stages',()=>{
  const target=neutralRecipe();
  const merged=mergeAuthorGlowOnly(target,portable);
  assert.deepEqual(merged.parameters.processingOrder,
    ['exposure','contrast','saturation','postDecodeAdjustments','rotation']);
  assert.deepEqual(target,neutralRecipe());
});

test('missing Glow, invalid Glow or nonportable source is rejected before target mutation',()=>{
  const target=neutralRecipe(),before=structuredClone(target);
  assert.throws(()=>mergeAuthorGlowOnly(target,{exposure:0,contrast:1,saturation:1}),
    /AUTHOR_GLOW_PRESET_REQUIRED/);
  assert.throws(()=>mergeAuthorGlowOnly(target,{...portable,
    postDecodeAdjustments:{...portable.postDecodeAdjustments,color:{glow:{...glow,mode:'unknown'}}}}));
  assert.throws(()=>mergeAuthorGlowOnly(target,{...portable,rotationDegrees:90}));
  assert.deepEqual(target,before);
});
