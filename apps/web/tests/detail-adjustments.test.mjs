import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDetailAdjustments,applyDenoise,applySharpness,detailRadiiFor} from '../src/processing/detail-adjustments.mjs';
import {MAX_PIXELS} from '../src/processing/pure.mjs';

function line({center=192,alpha=255,hiddenNeighbor=false}={}) {
  const width=3000,data=new Uint8ClampedArray(width*4);
  for(let x=0;x<width;x++){const i=x*4;data[i]=data[i+1]=data[i+2]=128;data[i+3]=alpha;}
  data.set([center,center,center,alpha],1500*4);
  if(hiddenNeighbor)data.set([255,255,255,0],1501*4);
  return {width,height:1,data,sourceWidth:6000,sourceHeight:2};
}
const center=p=>p.data[1500*4];

test('DETAIL-DN01 / synthetic: neutral is byte identity, positive smooths and negative mildly emphasizes grain',()=>{
  const input=line(),original=input.data.slice();
  assert.deepEqual([...applyDenoise(input,0).data],[...original]);
  assert.ok(center(applyDenoise(input,100))<center(input));
  assert.ok(center(applyDenoise(input,-100))>center(input));
  assert.deepEqual(input.data,original,'unedited base must remain untouched');
  assert.deepEqual(detailRadiiFor(input).denoise,2);
});

test('DETAIL-DN02 / synthetic: alpha is unchanged and hidden RGB does not leak into visible neighbors',()=>{
  const input=line({center:128,hiddenNeighbor:true});
  const result=applyDenoise(input,100);
  assert.equal(result.data[1500*4],128);
  assert.equal(result.data[1500*4+3],255);
  assert.equal(result.data[1501*4+3],0);
  assert.equal(result.sourceWidth,6000);
});

test('DETAIL-DN03 / synthetic: existing sharpness remains active and combined stages retain order',()=>{
  const input=line();
  assert.ok(center(applySharpness(input,100))>center(input));
  const result=applyDetailAdjustments(input,{denoise:70,clarity:10,texture:10,sharpness:20});
  assert.deepEqual(result.detailProvenance.appliedStages,['denoise','clarity','texture','sharpness']);
  assert.ok(result.data.every(Number.isFinite));
  assert.equal(result.data[1500*4+3],255);
});

test('DETAIL-DN04 / synthetic: invalid range, cancellation and pixel allocation limits fail closed',()=>{
  const input=line();
  for(const denoise of [101,-101,NaN,Infinity,'1'])assert.throws(()=>applyDenoise(input,denoise),/DETAIL_RANGE_DENOISE/);
  assert.throws(()=>applyDenoise(input,100,{signal:{aborted:true}}),{name:'AbortError'});
  let reads=0;assert.throws(()=>applyDenoise(input,100,{signal:{get aborted(){return ++reads>4;}}}),{name:'AbortError'});
  assert.throws(()=>applyDenoise({width:MAX_PIXELS+1,height:1,data:new Uint8ClampedArray(4)},100),/INVALID_OR_OVERSIZE_PIXELS/);
  // Existing renderer allocates at most input/output RGBA and five Float32 pixel buffers.
  assert.ok(MAX_PIXELS*(8+5*4)<=768*1024*1024);
});
