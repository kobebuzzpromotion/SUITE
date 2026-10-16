import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {neutralRecipe} from '../src/session.mjs';
import {portablePresetRecipe,createSubmission} from '../src/preset-author/preset-author-contract.mjs';
import {portableParameters,recipeFromParameters,checkParameters,checkVersion,
  adoptionTransition} from '../preset-policy.mjs';

const vignette={amount:-35,midpoint:44,roundness:-12,feather:73,highlights:29};
const postCrop={schemaVersion:1,engineVersion:'suite-srgb8-manual-vignette-1',vignette};
const copy=value=>structuredClone(value);
function source({withPostDecode=false}={}){
  const recipe=neutralRecipe();
  recipe.parameters.exposure=.5;
  recipe.parameters.processingOrder=['exposure','contrast','saturation',
    ...(withPostDecode?['postDecodeAdjustments']:[]),'rotation'];
  recipe.parameters.extendedParameters.postCropAdjustments=copy(postCrop);
  if(withPostDecode)recipe.parameters.extendedParameters.postDecodeAdjustments={
    schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{temperature:12},detail:{clarity:18}};
  return recipe;
}

test('AUTHOR-VIGNETTE01: optional five values survive portable Recipe/parameters and old pipeline order',()=>{
  for(const withPostDecode of [false,true]){
    const original=source({withPostDecode}),before=copy(original);
    const portable=portablePresetRecipe(original);
    assert.deepEqual(portable.parameters.extendedParameters.postCropAdjustments,postCrop);
    assert.deepEqual(portable.parameters.processingOrder,
      withPostDecode?['exposure','postDecodeAdjustments']:['exposure']);
    assert.equal(portable.parameters.rotationDegrees,0);
    assert.doesNotThrow(()=>validateRecipe(portable));
    const params=portableParameters(original);
    assert.deepEqual(params.postCropAdjustments,postCrop);
    assert.deepEqual(checkParameters(params),params);
    const restored=recipeFromParameters(params);
    assert.deepEqual(restored.parameters.extendedParameters.postCropAdjustments,postCrop);
    assert.deepEqual(restored.parameters.processingOrder,
      ['exposure','contrast','saturation',...(withPostDecode?['postDecodeAdjustments']:[]),'rotation']);
    assert.deepEqual(portablePresetRecipe(restored),portable);
    assert.deepEqual(original,before,'source Recipe remains unchanged');
  }
});

test('AUTHOR-VIGNETTE02: three-global and older postDecode-only versions remain accepted unchanged',()=>{
  const old={exposure:0,contrast:1,saturation:1};
  assert.deepEqual(checkParameters(old),old);
  const color={...old,postDecodeAdjustments:{schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',color:{toneCurve:{midtones:8}}}};
  assert.deepEqual(checkParameters(color),color);
  assert.equal(portableParameters(recipeFromParameters(old)).postCropAdjustments,undefined);
  assert.equal(portableParameters(recipeFromParameters(color)).postCropAdjustments,undefined);
  const sparse={...old,postCropAdjustments:{...postCrop,vignette:{amount:0}}};
  assert.deepEqual(checkParameters(sparse),sparse,'valid sparse Vignette does not gain invented defaults');
  assert.deepEqual(portableParameters(recipeFromParameters(sparse)),sparse);
});

test('AUTHOR-VIGNETTE03: author submission and adopted version preserve values without photo identity',()=>{
  const recipe=source({withPostDecode:true});
  const submission=createSubmission({presetId:'preset-v',presetVersion:2,authorUserId:'author',
    authorCreditName:'Author',recipe,now:'2026-10-05T00:00:00.000Z'});
  assert.deepEqual(submission.recipe.parameters.extendedParameters.postCropAdjustments,postCrop);
  const parameters=portableParameters(recipe);
  const stored={id:'preset-v',authorID:'author',authorName:'Author',name:'Vignette',parameters,
    source:{assetID:'source-asset',recipeRevision:3},revision:2,
    createdAt:'2026-10-05T00:00:00.000Z',updatedAt:'2026-10-05T00:01:00.000Z'};
  assert.equal(checkVersion(copy(stored),'preset-v',2,'author').parameters.postCropAdjustments.vignette.amount,-35);
  const published=adoptionTransition(stored,{id:'owner'},'PUBLISHED');
  assert.deepEqual(published.recipe.parameters.extendedParameters.postCropAdjustments,postCrop);
  assert.equal(published.state,'PUBLISHED');
});

test('AUTHOR-VIGNETTE04: invalid shape, range, hidden key and class object fail before copy',()=>{
  const mutations=[
    value=>{value.vignette.amount=NaN;},value=>{value.vignette.amount=101;},
    value=>{value.vignette.midpoint=-1;},value=>{value.vignette.roundness=-101;},
    value=>{value.vignette.feather=101;},value=>{value.vignette.highlights=Infinity;},
    value=>{value.vignette.strength=7;},value=>{delete value.vignette.amount;},
    value=>{value.engineVersion='invented';},value=>{value.schemaVersion=2;},
    value=>{value.mask={pixels:[1]};},value=>{value[Symbol('unexpected')]=1;},
  ];
  for(const mutate of mutations){
    const candidate=source();mutate(candidate.parameters.extendedParameters.postCropAdjustments);
    assert.throws(()=>portablePresetRecipe(candidate),/INVALID_POST_CROP_PRESET/);
  }
  const classValue=source();
  classValue.parameters.extendedParameters.postCropAdjustments.vignette=Object.assign(
    new (class VignetteSettings {})(),vignette);
  assert.throws(()=>portablePresetRecipe(classValue),/INVALID_POST_CROP_PRESET/);
  const params={exposure:0,contrast:1,saturation:1,
    postCropAdjustments:{...postCrop,vignette:Object.assign(new (class Values {})(),vignette)}};
  assert.throws(()=>recipeFromParameters(params),/INVALID_POST_CROP_PRESET/);
  const foreign=runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(source()))})`);
  assert.deepEqual(portablePresetRecipe(foreign).parameters.extendedParameters.postCropAdjustments,postCrop);
});

test('AUTHOR-VIGNETTE05: Crop/rotation/RAW WB/photo mask/unknown settings are never portable',()=>{
  for(const key of ['crop','canvasExpand','portrait','localLevels','bwEdgeManual','addShadowManual',
    'makeupHighlightManual','teethManual','export','unknown','whiteBalance']){
    const candidate=source();candidate.parameters.extendedParameters[key]={};
    assert.throws(()=>portablePresetRecipe(candidate),/PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/,key);
  }
  const rotated=source();rotated.parameters.rotationDegrees=90;
  assert.throws(()=>portablePresetRecipe(rotated),/PHOTO_LOCAL_ROTATION/);
  const raw=source({withPostDecode:true});
  raw.parameters.extendedParameters.postDecodeAdjustments.color.rawWhiteBalance=5200;
  assert.throws(()=>portablePresetRecipe(raw),/INVALID_POST_DECODE_PRESET/);
  const fakeStage=source();fakeStage.parameters.processingOrder.push('postCropAdjustments');
  assert.throws(()=>portablePresetRecipe(fakeStage),/UNSUPPORTED_PROCESSING_STAGE/);
  assert.throws(()=>checkParameters({exposure:0,contrast:1,saturation:1,postCropAdjustments:postCrop,
    assetID:'foreign'}),/CORRUPT_PRESET_PARAMETERS/);
});
