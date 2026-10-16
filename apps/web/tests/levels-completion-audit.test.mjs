import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLevels} from '../src/processing/levels.mjs';
import {analyzeLevelsHistogram,selectLevelsHistogramChannel} from '../src/processing/levels-histogram.mjs';
import {sampleLevelsEndpoint} from '../src/processing/levels-sampler.mjs';
import {levelsMidpointPositionToGamma} from '../src/levels-control-mapping.mjs';
import {mergeSavedLevels} from '../src/batch-levels-sync.mjs';
import {neutralRecipe} from '../src/session.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {createPresetFacade} from '../src/preset-facade.mjs';

const clone=value=>structuredClone(value);
const fields={inputBlack:35,inputWhite:220,gamma:1.8,outputBlack:25,outputWhite:225};
function image(){
  const width=16,height=8,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4;
    data.set([20+x*13,35+y*20,220-x*11,(x===width-1&&y===height-1)?0:255],p);
  }
  return {width,height,data};
}
function withGlobalLevels(levels){
  const recipe=neutralRecipe();
  recipe.parameters.extendedParameters.postDecodeAdjustments={
    schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{levels},
  };
  recipe.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  return recipe;
}
function withLocalLevels(recipe){
  recipe.parameters.extendedParameters.localLevels={
    schemaVersion:1,engineVersion:'suite-srgb8-local-levels-coverage-1',
    brushVersion:'suite-normalized-coverage-brush-1',
    strokes:[{points:[{x:.25,y:.5},{x:.4,y:.5}],radius:.16,hardness:.5,mode:'add'}],
    levels:{red:{outputBlack:14}},
  };
  return recipe;
}

test('LEVELS-AUDIT-01: all four channels and five fields change real sRGB8 pixels without changing input or alpha',()=>{
  const source=image(),original=source.data.slice(),neutral=applyLevels(source);
  for(const channel of ['master','red','green','blue'])for(const [field,value] of Object.entries(fields)){
    const result=applyLevels(source,{[channel]:{[field]:value}});
    assert.notDeepEqual(result.data,neutral.data,`${channel}.${field} must change pixels`);
    for(let i=3;i<result.data.length;i+=4)assert.equal(result.data[i],original[i]);
  }
  assert.deepEqual(source.data,original);
});

test('LEVELS-AUDIT-02: histogram/sampling and midpoint direction have explicit SUITE-only semantics',()=>{
  const source=image(),histogram=analyzeLevelsHistogram(source);
  for(const channel of ['master','red','green','blue']){
    const selected=selectLevelsHistogramChannel(histogram,channel);
    assert.ok(selected.peakCount>0);
    assert.equal(selected.includedPixels,source.width*source.height-1);
    const black=sampleLevelsEndpoint(source,{x:0,y:0,channel,endpoint:'black'});
    assert.equal(black.key,`levels.${channel}.inputBlack`);
  }
  assert.equal(levelsMidpointPositionToGamma(50),1);
  assert.ok(levelsMidpointPositionToGamma(75)<1);
  assert.ok(levelsMidpointPositionToGamma(25)>1);
});

test('LEVELS-AUDIT-03: global Levels Sync does not transfer or erase photo-local brush data',()=>{
  const source=withLocalLevels(withGlobalLevels({master:{gamma:1.8}}));
  source.parameters.exposure=.25;
  const target=withLocalLevels(withGlobalLevels({blue:{outputBlack:12}}));
  target.parameters.exposure=1;
  const originalTarget=clone(target),originalSource=clone(source);
  const merged=mergeSavedLevels(source,target);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.color.levels,
    source.parameters.extendedParameters.postDecodeAdjustments.color.levels);
  assert.deepEqual(merged.parameters.extendedParameters.localLevels,
    originalTarget.parameters.extendedParameters.localLevels);
  assert.equal(merged.parameters.exposure,1);
  assert.deepEqual(target,originalTarget);assert.deepEqual(source,originalSource);
});

test('LEVELS-AUDIT-04: Author portable global Levels is not Local Levels or Community Preset',async()=>{
  const global=withGlobalLevels({master:{inputBlack:12,outputWhite:238}});
  assert.deepEqual(portablePresetRecipe(global).parameters.extendedParameters.postDecodeAdjustments.color.levels,
    global.parameters.extendedParameters.postDecodeAdjustments.color.levels);
  assert.throws(()=>portablePresetRecipe(withLocalLevels(clone(global))),
    /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  const facade=createPresetFacade();
  await assert.rejects(facade.list({kind:'COMMUNITY'}),/COMMUNITY_NOT_IMPLEMENTED/);
});
