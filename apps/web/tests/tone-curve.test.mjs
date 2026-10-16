import test from 'node:test';
import assert from 'node:assert/strict';
import {parametricToneCurve,applyColorAdjustments} from '../src/processing/color-adjustments.mjs';
import {neutralRecipe} from '../src/session.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

test('CURVE01 / SYNTHETIC: neutral parametric curve is identity and endpoints are fixed',()=>{
  for(let i=0;i<=100;i++)assert.ok(Math.abs(parametricToneCurve(i/100,{})-i/100)<1e-12);
  for(const controls of [{shadows:100,midtones:100,highlights:100},{shadows:-100,midtones:-100,highlights:-100}]){
    assert.equal(parametricToneCurve(0,controls),0);assert.equal(parametricToneCurve(1,controls),1);
    let prior=0;for(let i=0;i<=100;i++){const value=parametricToneCurve(i/100,controls);assert.ok(value>=prior-1e-12);prior=value;}
  }
});

test('CURVE02 / SYNTHETIC: shadow movement changes pixels without mutating source or alpha',()=>{
  const source={width:1,height:1,data:new Uint8ClampedArray([128,128,128,173])};
  const brighter=applyColorAdjustments(source,{toneCurve:{shadows:100}});
  const darker=applyColorAdjustments(source,{toneCurve:{shadows:-100}});
  assert.ok(brighter.data[0]>128);assert.ok(darker.data[0]<128);
  assert.equal(brighter.data[3],173);assert.equal(darker.data[3],173);
  assert.deepEqual([...source.data],[128,128,128,173]);
});

test('CURVE03 / CONTRACT: exact curve shape and finite range are enforced by shared Recipe validator',()=>{
  const valid=neutralRecipe();valid.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{toneCurve:{midtones:50}}};
  valid.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  assert.doesNotThrow(()=>validateRecipe(valid));
  for(const bad of [{midtones:101},{midtones:NaN},{unknown:1}]){
    const doc=structuredClone(valid);doc.parameters.extendedParameters.postDecodeAdjustments.color.toneCurve=bad;
    assert.throws(()=>validateRecipe(doc),/INVALID_POST_DECODE|INVALID_PARAMETER/);
  }
});
