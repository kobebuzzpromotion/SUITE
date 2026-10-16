import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {makeManualEyeshadowDraft} from '../src/manual-eyeshadow-ui.mjs';
import {applyManualEyeshadowColor} from '../src/processing/manual-eyeshadow-color.mjs';
import {rasterizeManualEyeshadowMasks,
  MANUAL_EYESHADOW_MASK_RUNTIME_VERSION} from
  '../src/processing/manual-eyeshadow-mask-runtime.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),personID:'33333333-3333-4333-8333-333333333333',
  sourceWidth:80,sourceHeight:40};
const stroke=(u,v,radiusFraction=.04,operation='ADD')=>({operation,
  path:[{u,v}],radiusFraction,hardness:1});
const groups=()=>({eyeArea:[stroke(.4,.5,.12)],
  irisProtect:[stroke(.43,.5,.025)],pupilProtect:[stroke(.47,.5,.025)]});
const settings={color:{r:220,g:40,b:20},opacity:.7};
const documentOf=(b=binding,strokes=groups())=>
  makeManualEyeshadowDraft(b,'image-left',strokes,settings);
const runtimeOf=(b=binding,changes={})=>({assetID:b.assetID,
  originalSHA256:b.originalSHA256,personID:b.personID,eye:'image-left',
  savedRevision:2,sourceWidth:b.sourceWidth,sourceHeight:b.sourceHeight,
  ...changes});
const frame=(width=80,height=40,source)=>{
  const pixels={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let index=0;index<width*height;index++)
    pixels.data.set([80,100,120,255],index*4);
  if(source){pixels.sourceWidth=source.sourceWidth;
    pixels.sourceHeight=source.sourceHeight;}
  return pixels;
};
const sample=(mask,u,v)=>mask.data[Math.floor(v*mask.height)*mask.width+
  Math.floor(u*mask.width)];
const allZero=mask=>mask.data.every(value=>value===0);

test('EYESHADOW-MASK-01: three distinct source masks feed the pure color kernel',()=>{
  const pixels=frame(),original=pixels.data.slice(),document=documentOf();
  const serialized=JSON.stringify(document),runtime=runtimeOf();
  const masks=rasterizeManualEyeshadowMasks(pixels,document,runtime,
    {target:'source'});
  assert.equal(MANUAL_EYESHADOW_MASK_RUNTIME_VERSION,
    'suite-manual-eyeshadow-three-role-mask-runtime-1');
  assert.deepEqual(Object.keys(masks),
    ['eyeAreaMask','irisExclusionMask','pupilExclusionMask']);
  for(const [name,kind] of [['eyeAreaMask','manual-eyeshadow-eye-area-mask'],
    ['irisExclusionMask','manual-eyeshadow-iris-exclusion-mask'],
    ['pupilExclusionMask','manual-eyeshadow-pupil-exclusion-mask']]){
    assert.equal(masks[name].provenance.kind,kind);
    assert.equal(masks[name].provenance.assetID,binding.assetID);
    assert.equal(masks[name].provenance.personID,binding.personID);
    assert.equal(masks[name].provenance.eye,'image-left');
    assert.equal(masks[name].provenance.savedRevision,2);
    assert.equal(masks[name].provenance.target,'source');
    assert.deepEqual([masks[name].width,masks[name].height],[80,40]);
  }
  assert.ok(sample(masks.eyeAreaMask,.4,.5)>0);
  assert.ok(sample(masks.irisExclusionMask,.43,.5)>0);
  assert.ok(sample(masks.pupilExclusionMask,.47,.5)>0);
  assert.equal(sample(masks.eyeAreaMask,.01,.01),0);
  const adjusted=applyManualEyeshadowColor(pixels,masks.eyeAreaMask,
    masks.irisExclusionMask,masks.pupilExclusionMask,settings,
    {...runtime,target:'source'});
  const before=(u,v)=>original.slice((Math.floor(v*40)*80+Math.floor(u*80))*4,
    (Math.floor(v*40)*80+Math.floor(u*80))*4+4);
  const after=(u,v)=>adjusted.data.slice((Math.floor(v*40)*80+Math.floor(u*80))*4,
    (Math.floor(v*40)*80+Math.floor(u*80))*4+4);
  assert.notDeepEqual(after(.35,.5),before(.35,.5));
  assert.deepEqual(after(.43,.5),before(.43,.5),'iris protected');
  assert.deepEqual(after(.47,.5),before(.47,.5),'pupil protected');
  assert.deepEqual(after(.01,.01),before(.01,.01),'outside untouched');
  assert.deepEqual(pixels.data,original);
  assert.equal(JSON.stringify(document),serialized);
});

test('EYESHADOW-MASK-02: exact 1600px proxy and source use the same normalized positions',()=>{
  const large={...binding,sourceWidth:1800,sourceHeight:900};
  const document=documentOf(large),runtime=runtimeOf(large);
  const proxy=frame(1600,800,large),source=frame(1800,900);
  const p=rasterizeManualEyeshadowMasks(proxy,document,runtime,{target:'proxy'});
  const s=rasterizeManualEyeshadowMasks(source,document,runtime,{target:'source'});
  assert.deepEqual([p.eyeAreaMask.width,p.eyeAreaMask.height],[1600,800]);
  assert.deepEqual([s.eyeAreaMask.width,s.eyeAreaMask.height],[1800,900]);
  for(const key of Object.keys(p)){
    assert.ok(sample(p[key],.4,.5)>0||key!=='eyeAreaMask');
    assert.equal(p[key].provenance.sourceWidth,1800);
    assert.equal(p[key].provenance.sourceHeight,900);
    assert.equal(p[key].provenance.target,'proxy');
  }
  assert.throws(()=>rasterizeManualEyeshadowMasks(frame(1600,800),document,runtime,
    {target:'proxy'}),/PROXY_PROVENANCE_REQUIRED/);
  assert.throws(()=>rasterizeManualEyeshadowMasks(frame(1599,800,large),
    document,runtime,{target:'proxy'}),/TARGET_DIMENSIONS_MISMATCH/);
  assert.throws(()=>rasterizeManualEyeshadowMasks(proxy,document,runtime,
    {target:'source'}),/TARGET_DIMENSIONS_MISMATCH/);
});

test('EYESHADOW-MASK-03: wrong binding rejects and stale mask revision cannot be applied',()=>{
  const pixels=frame(),document=documentOf(),runtime=runtimeOf();
  for(const changes of [{assetID:'22222222-2222-4222-8222-222222222222'},
    {originalSHA256:'b'.repeat(64)},
    {personID:'44444444-4444-4444-8444-444444444444'},
    {eye:'image-right'},{savedRevision:3},
    {sourceWidth:81},{sourceHeight:41}]){
    const changed={...runtime,...changes};
    if(changes.savedRevision===3){
      const old={...runtime,savedRevision:2};
      const mask=rasterizeManualEyeshadowMasks(pixels,document,old,{target:'source'});
      assert.equal(mask.eyeAreaMask.provenance.savedRevision,2);
      assert.throws(()=>applyManualEyeshadowColor(pixels,mask.eyeAreaMask,
        mask.irisExclusionMask,mask.pupilExclusionMask,settings,
        {...changed,target:'source'}),/MASK_PROVENANCE_MISMATCH/);
    }else assert.throws(()=>rasterizeManualEyeshadowMasks(pixels,document,changed,
      {target:'source'}),/RUNTIME_MISMATCH/);
  }
  assert.throws(()=>rasterizeManualEyeshadowMasks(frame(81,40),document,runtime,
    {target:'source'}),/SOURCE_DIMENSIONS_MISMATCH/);
  assert.throws(()=>rasterizeManualEyeshadowMasks(pixels,document,
    {...runtime,ownerConfirmed:true},{target:'source'}),/RUNTIME_MISMATCH/);
});

test('EYESHADOW-MASK-04: invalid or self-certified document is not rasterized',()=>{
  const pixels=frame(),runtime=runtimeOf(),good=documentOf();
  const bad=[{...good,ownerConfirmed:true},
    {...good,representation:'unverified-mask'},
    {...good,eye:'left'},
    {...good,strokes:{...good.strokes,irisProtect:[]}},
    {...good,strokes:{...good.strokes,pupilProtect:[stroke(.47,.5,.025,'ERASE')]}},
    {...good,strokes:{...good.strokes,eyeArea:[{...stroke(.4,.5),path:[{u:NaN,v:.5}]}]}},
    {...good,binding:{...good.binding,savedRevision:2}}];
  for(const value of bad)assert.throws(()=>rasterizeManualEyeshadowMasks(
    pixels,value,runtime,{target:'source'}),/MANUAL_EYESHADOW_DOCUMENT_/);
  const fromOtherRealm=vm.runInNewContext(`(${JSON.stringify(good)})`);
  const masks=rasterizeManualEyeshadowMasks(pixels,fromOtherRealm,runtime,
    {target:'source'});
  assert.equal(masks.eyeAreaMask.provenance.eye,'image-left');
  assert.throws(()=>rasterizeManualEyeshadowMasks(pixels,good,
    vm.runInNewContext(`(${JSON.stringify({...runtime,flag:true})})`),
    {target:'source'}),/RUNTIME_MISMATCH/);
});

test('EYESHADOW-MASK-05: capacity, aggregate stroke work and invalid frames reject',()=>{
  const pixels=frame(),runtime=runtimeOf(),document=documentOf();
  assert.throws(()=>rasterizeManualEyeshadowMasks(pixels,document,runtime,
    {target:'large'}),/TARGET_INVALID/);
  assert.throws(()=>rasterizeManualEyeshadowMasks(
    {...pixels,data:new Uint8ClampedArray(1)},document,runtime,{target:'source'}),
    /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(()=>rasterizeManualEyeshadowMasks(
    {...pixels,sourceWidth:80},document,runtime,{target:'source'}),
    /FRAME_INVALID/);
  const large={...binding,sourceWidth:2000,sourceHeight:2000};
  const repeated=Array.from({length:62},()=>stroke(.5,.5,.25));
  const highWork=documentOf(large,{eyeArea:repeated,
    irisProtect:[stroke(.43,.5,.025)],pupilProtect:[stroke(.47,.5,.025)]});
  assert.throws(()=>rasterizeManualEyeshadowMasks(frame(2000,2000),
    highWork,runtimeOf(large),{target:'source'}),/MASK_WORK_LIMIT/);
});

test('EYESHADOW-MASK-06: transparent pixels and abort never mutate inputs',()=>{
  const pixels=frame(),document=documentOf(),runtime=runtimeOf();
  const hidden=(20*80+32)*4;
  pixels.data.set([177,44,199,0],hidden);
  const original=pixels.data.slice(),serialized=JSON.stringify(document);
  const masks=rasterizeManualEyeshadowMasks(pixels,document,runtime,
    {target:'source'});
  for(const mask of Object.values(masks))assert.equal(mask.data[20*80+32],0);
  assert.deepEqual(pixels.data,original);
  assert.equal(JSON.stringify(document),serialized);
  const controller=new AbortController();controller.abort();
  assert.throws(()=>rasterizeManualEyeshadowMasks(pixels,document,runtime,
    {target:'source',signal:controller.signal}),error=>error.name==='AbortError');
  const allTransparent=frame();
  for(let index=3;index<allTransparent.data.length;index+=4)
    allTransparent.data[index]=0;
  assert.throws(()=>rasterizeManualEyeshadowMasks(allTransparent,document,runtime,
    {target:'source'}),/SUBJECT_MASK_EMPTY/);
  assert.equal(allZero(masks.eyeAreaMask),false);
});

test('EYESHADOW-MASK-07: off-area protection cannot expand the color target',()=>{
  const offEye=documentOf(binding,{eyeArea:[stroke(.4,.5,.07)],
    irisProtect:[stroke(.85,.5,.02)],pupilProtect:[stroke(.47,.5,.025)]});
  const pixels=frame(),masks=rasterizeManualEyeshadowMasks(pixels,offEye,runtimeOf(),
    {target:'source'});
  const result=applyManualEyeshadowColor(pixels,masks.eyeAreaMask,
    masks.irisExclusionMask,masks.pupilExclusionMask,settings,
    {...runtimeOf(),target:'source'});
  const at=(20*80+68)*4;
  assert.ok(masks.irisExclusionMask.data[20*80+68]>0);
  assert.deepEqual(result.data.slice(at,at+4),pixels.data.slice(at,at+4));
});

test('EYESHADOW-MASK-08: browser-bundleable with no product or authority claims',async()=>{
  const output=await build({entryPoints:[fileURLToPath(new URL(
    '../src/processing/manual-eyeshadow-mask-runtime.mjs',import.meta.url))],
    bundle:true,format:'esm',platform:'browser',write:false});
  assert.ok(output.outputFiles[0].contents.length>0);
  const text=new TextDecoder().decode(output.outputFiles[0].contents);
  assert.match(text,/ownerConfirmed/);
  assert.doesNotMatch(text,/Evoto's 14|official style/);
});
