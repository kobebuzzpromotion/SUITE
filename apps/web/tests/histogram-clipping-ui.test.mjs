import test from 'node:test';
import assert from 'node:assert/strict';
import {canUseHistogramControls,clippingOverlayVisible} from '../src/editor-ui.mjs';
import {calculateHistogramToneDrag,HISTOGRAM_TONE_REGIONS} from '../src/histogram-tone-drag.mjs';

const session={setAdjustment(){}};
const ready={asset:{id:'a'},histogram:{includedPixels:16},afterURL:'blob:after',clippingOverlayURL:'blob:overlay',busy:null,exporting:false};

test('histogram controls require loaded After pixels, live session and access',()=>{
  assert.equal(canUseHistogramControls(session,ready),true);
  for(const changed of [{asset:null},{histogram:null},{afterURL:null},{busy:'rendering'},{exporting:true}])
    assert.equal(canUseHistogramControls(session,{...ready,...changed}),false);
  assert.equal(canUseHistogramControls({},ready),false);
  assert.equal(canUseHistogramControls(session,ready,{pending:true}),false);
  assert.equal(canUseHistogramControls(session,ready,{blocked:true}),false);
});

test('clipping overlay stays confined to the After view and never requires image mutation',()=>{
  assert.equal(clippingOverlayVisible(ready,{enabled:true,view:'after'}),true);
  assert.equal(clippingOverlayVisible(ready,{enabled:true,view:'split'}),true);
  assert.equal(clippingOverlayVisible(ready,{enabled:true,view:'before'}),false);
  assert.equal(clippingOverlayVisible(ready,{enabled:false,view:'after'}),false);
  assert.equal(clippingOverlayVisible({...ready,clippingOverlayURL:null},{enabled:true}),false);
  assert.equal(clippingOverlayVisible({...ready,afterURL:null},{enabled:true}),false);
  assert.equal(clippingOverlayVisible(ready,{enabled:true,blocked:true}),false);
  assert.equal(clippingOverlayVisible(ready,{enabled:true,pending:true}),false);
});

test('all five drag targets use existing Adjustment keys and bounded values',()=>{
  assert.deepEqual(Object.keys(HISTOGRAM_TONE_REGIONS),['blacks','shadows','exposure','highlights','whites']);
  for(const [region,control] of Object.entries(HISTOGRAM_TONE_REGIONS)){
    const next=calculateHistogramToneDrag({region,startValue:0,deltaX:30,dragWidth:100});
    assert.equal(next.key,control.key);
    assert.ok(next.value>0&&next.value<=control.max);
  }
});
