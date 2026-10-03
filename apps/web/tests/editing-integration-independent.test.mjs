import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, neutralRecipe, checksum} from '../src/session.mjs';
import {renderPixels, makeProxyPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {applyColorAdjustments} from '../src/processing/color-adjustments.mjs';
import {applyDetailAdjustments} from '../src/processing/detail-adjustments.mjs';

// Independent integration checks. Artificial RGBA + NON_RAW bytes, mock API/cache/decoder/encoder.
// Actual shared Recipe validation, EditorSession and pixel renderer; not RAW, browser, Native or visual QA.
const clone = x => structuredClone(x);
const colors = ['red','orange','yellow','green','aqua','blue','purple','magenta'];
const controls = ['color.highlights','color.shadows','color.whites','color.blacks','color.vibrance',
  ...colors.flatMap(c => ['hue','saturation','luminance'].map(k => `hsl.${c}.${k}`)),
  'detail.clarity','detail.texture','detail.sharpness'];
const render = (pixels, recipe, options={}) => renderPixels(pixels,recipe,{validateRecipe,resolutionAssessment,...options});
function pixels(width=17,height=11) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4) data.set([(i*13+31)%256,(i*7+101)%256,(i*3+59)%256,255],i);
  return {width,height,data};
}
function swatch(rgb) {return {width:1,height:1,data:new Uint8ClampedArray([...rgb,255])};}
function adjusted(color={},detail={}) {const r=neutralRecipe();r.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color,detail};r.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');return r;}
async function fixture() {
  const bytes=new TextEncoder().encode('NON_RAW independent integration ORIGINAL').buffer;
  const asset={id:'d666a216-bbcb-4f50-b5fa-0a2bc63a4a80',name:'NON_RAW_fixture.raw',sha256:await checksum(bytes),size:bytes.byteLength};
  const base=pixels(), cache=new Map(), calls=[];
  let remote={revision:1,body:neutralRecipe()}, original=bytes.slice(0);
  const api={listAssets:async()=>[clone(asset)], getOriginal:async()=>{calls.push(['original']);return original.slice(0);},getRecipe:async()=>clone(remote),
    saveRecipe:async(id,revision,body)=>{assert.equal(id,asset.id);validateRecipe(body);if(revision!==remote.revision)throw Error('REVISION_CONFLICT');remote={revision:revision+1,body:clone(body)};return clone(remote);}};
  const storage={get:async id=>clone(cache.get(id)),put:async(id,value)=>{cache.set(id,clone(value));}};
  const processing={decodeRaw:async(buffer,{mode})=>{assert.deepEqual(buffer,bytes);calls.push(['decode',mode]);return {pixels:clone(base),provenance:{fixture:'NON_RAW_SYNTHETIC'},metadata:{fixture:true}};},
    makeProxy:async p=>makeProxyPixels(p,8),render:async(p,r,o)=>{calls.push(['render',clone(r),clone(p)]);return render(p,r,o);},
    encode:async p=>new Blob([p.data],{type:'application/x-synthetic-rgba'})};
  const create=()=>new EditorSession({api,storage,processing,urlAPI:{createObjectURL:()=>`blob:synthetic`,revokeObjectURL(){}},clock:()=> '2026-10-03T00:00:00.000Z'});
  const session=create();await session.initialize();await session.openAsset(asset.id);
  return {session,create,api,processing,asset,base,bytes,cache,calls,getRemote:()=>clone(remote),setRemote:r=>{remote=clone(r);},setOriginal:b=>{original=b.slice(0);}};
}

test('EII-01 SYNTHETIC: neutral extension preserves RGBA and immutable source exactly',()=>{
  const p=pixels();p.data[3]=0;p.data[7]=123;const before=clone(p);
  assert.deepEqual(render(p,adjusted()).data,p.data);assert.deepEqual(p,before);
});
for(const [name,value] of [['highlights',220],['shadows',100],['whites',245],['blacks',30]]) {
  test(`EII-02-${name} SYNTHETIC: positive and negative tone direction`,()=>{
    const p=swatch([value,value,value]);
    const up=render(p,adjusted({[name]:100})).data,down=render(p,adjusted({[name]:-100})).data;
    assert.ok(up[0]>value,`${name} positive`);assert.ok(down[0]<value,`${name} negative`);
    assert.equal(up[0],up[1]);assert.equal(down[1],down[2]);assert.equal(up[3],255);
  });
}
test('EII-03 SYNTHETIC: red hue 100 is +30 degrees and red saturation -100 neutralizes',()=>{
  assert.deepEqual([...render(swatch([255,0,0]),adjusted({hsl:{red:{hue:100}}})).data],[255,128,0,255]);
  assert.deepEqual([...render(swatch([255,0,0]),adjusted({hsl:{red:{saturation:-100}}})).data],[128,128,128,255]);
  assert.deepEqual([...render(swatch([200,100,100]),adjusted({vibrance:-100})).data],[150,150,150,255]);
});
for(const name of ['clarity','texture','sharpness']) {
  test(`EII-04-${name} SYNTHETIC: edge contrast increases without altering alpha/source`,()=>{
    const p=pixels(600,1);for(let x=0;x<600;x++)p.data.set(x<300?[80,80,80,255]:[170,170,170,255],x*4);
    const before=clone(p),out=render(p,adjusted({}, {[name]:100}));
    assert.ok(out.data[299*4]<80);assert.ok(out.data[300*4]>170);assert.deepEqual(p,before);
    for(let i=3;i<out.data.length;i+=4)assert.equal(out.data[i],255);
  });
}
test('EII-05 MOCK_STATE: all 32 controls accept endpoints, reject invalid values without history mutation',async()=>{
  const f=await fixture();assert.equal(controls.length,32);
  for(const key of controls){const min=key==='detail.sharpness'?0:-100;
    for(const v of [min,100,0]){await f.session.setAdjustment(key,v);validateRecipe(f.session.state.recipe);}
    for(const v of [min-1,101,NaN,Infinity,'1']){const before=f.session.state.recipe,h=clone(f.session.history);await assert.rejects(f.session.setAdjustment(key,v),/RANGE/);assert.deepEqual(f.session.state.recipe,before);assert.deepEqual(f.session.history,h);}
  }
  for(const key of ['hsl.pink.hue','detail.noise','color.whiteBalance'])await assert.rejects(f.session.setAdjustment(key,1),/UNSUPPORTED/);
  assert.deepEqual(f.session.state.recipe,neutralRecipe());
});
test('EII-06 SHARED_WIRE: strict extension shape/version/order and nested controls are rejected',()=>{
  const mutations=[r=>{r.parameters.extendedParameters.postDecodeAdjustments.schemaVersion=2;},r=>{r.parameters.extendedParameters.postDecodeAdjustments.color.hsl={red:{hue:101}};},r=>{r.parameters.extendedParameters.postDecodeAdjustments.detail.sharpness=-1;},r=>{r.parameters.extendedParameters.postDecodeAdjustments.color.whiteBalance=1;},r=>{r.parameters.processingOrder=['postDecodeAdjustments','exposure','contrast','saturation','rotation'];},r=>{r.parameters.processingOrder=['exposure','contrast','saturation','rotation'];}];
  mutations.push(r=>{delete r.parameters.extendedParameters.postDecodeAdjustments.engineVersion;},r=>{r.parameters.extendedParameters.postDecodeAdjustments.engineVersion='unknown-engine';});
  for(const mutate of mutations){const r=adjusted();mutate(r);assert.throws(()=>validateRecipe(r));assert.throws(()=>render(pixels(),r));}
});
test('EII-07 MOCK_STATE + SYNTHETIC: combined pipeline undo redo save fresh reload Final exactly once and Original SHA',async()=>{
  const f=await fixture(),sha=await checksum(f.bytes),baseBefore=clone(f.base);
  for(const [key,value] of [['exposure',.25],['color.shadows',40],['hsl.red.hue',20],['detail.clarity',40],['detail.texture',-30],['detail.sharpness',60],['rotationDegrees',90],['cropRatio','1:1']])await f.session.setAdjustment(key,value);
  const combined=f.session.state.recipe;const previewBase=f.calls.filter(c=>c[0]==='render').at(-1)[2];
  assert.equal(previewBase.width,8);assert.equal(previewBase.height,5);assert.equal(previewBase.sourceWidth,17);assert.equal(previewBase.sourceHeight,11);
  const preview=render(previewBase,combined);assert.equal(preview.width,5);assert.equal(preview.height,5);
  await f.session.undo();assert.notDeepEqual(f.session.state.recipe,combined);await f.session.redo();assert.deepEqual(f.session.state.recipe,combined);
  await f.session.save();const fresh=f.create();await fresh.initialize();await fresh.openAsset(f.asset.id);assert.deepEqual(fresh.state.recipe,combined);
  const start=f.calls.length,out=await fresh.exportFinal({format:'png'}),finalCalls=f.calls.slice(start);
  assert.equal(finalCalls.filter(c=>c[0]==='render').length,1);assert.deepEqual(finalCalls.find(c=>c[0]==='render')[2],f.base);
  const expected=render(f.base,combined);assert.deepEqual(new Uint8ClampedArray(await out.arrayBuffer()),expected.data);assert.equal(expected.width,11);assert.equal(expected.height,11);
  assert.deepEqual(fresh.state.recipe,combined);assert.equal(await checksum(f.bytes),sha);assert.deepEqual(f.base,baseBefore);
});
test('EII-08 MOCK_STATE: post-decode save CAS conflict retains exact dirty recipe and durable draft',async()=>{
  const f=await fixture();await f.session.setAdjustment('color.vibrance',50);const before=f.session.state.recipe,cached=clone(f.cache.get(f.asset.id));
  f.setRemote({revision:2,body:neutralRecipe()});await assert.rejects(f.session.save(),/REVISION_CONFLICT/);
  assert.deepEqual(f.session.state.recipe,before);assert.deepEqual(f.cache.get(f.asset.id),cached);assert.equal(f.session.state.dirty,true);
});
test('EII-09 MOCK_STATE: Final refuses remote snapshot change after encoding, no latest-value substitution',async()=>{
  const f=await fixture();await f.session.setAdjustment('color.highlights',20);await f.session.save();const expected=f.session.state.recipe;
  f.processing.encode=async p=>{f.setRemote({revision:99,body:neutralRecipe()});return new Blob([p.data]);};
  await assert.rejects(f.session.exportFinal({format:'png'}),/FIXED_RECIPE_MISMATCH/);assert.deepEqual(f.session.state.recipe,expected);assert.equal(f.session.state.exporting,false);
});
test('EII-10 MOCK_STATE: Original checksum mismatch rejects before decoder and preserves saved adjustments',async()=>{
  const f=await fixture();await f.session.setAdjustment('detail.texture',30);await f.session.save();const expected=f.session.state.recipe,start=f.calls.length;
  f.setOriginal(new Uint8Array([1,2,3]).buffer);await assert.rejects(f.session.exportFinal({format:'png'}),/RAW_CHECKSUM_MISMATCH/);
  assert.equal(f.calls.slice(start).some(c=>c[0]==='decode'),false);assert.deepEqual(f.session.state.recipe,expected);
});
test('EII-11 SYNTHETIC + MOCK_STATE: cancellation rejects output and preserves original/draft',async()=>{
  const f=await fixture();await f.session.setAdjustment('color.whites',50);await f.session.save();const before=f.session.state.recipe,sha=await checksum(f.bytes);
  const encode=f.processing.encode;f.processing.encode=async p=>{f.session.cancelExport();return encode(p);};
  await assert.rejects(f.session.exportFinal({format:'png'}),/EXPORT_ABORTED/);assert.deepEqual(f.session.state.recipe,before);assert.equal(await checksum(f.bytes),sha);
  const controller=new AbortController();controller.abort();assert.throws(()=>render(f.base,adjusted({shadows:20},{texture:30}),{signal:controller.signal}),{name:'AbortError'});
});
test('EII-12 SYNTHETIC: globals then color then detail order, repeat from base is deterministic not cumulative',()=>{
  const p=pixels(600,3),before=clone(p),color={shadows:70,vibrance:80,hsl:{red:{hue:30}}},detail={clarity:70,texture:60,sharpness:80};
  const recipe=adjusted(color,detail);recipe.parameters.exposure=.3;recipe.parameters.contrast=1.2;
  const globals=clone(recipe);delete globals.parameters.extendedParameters.postDecodeAdjustments;globals.parameters.processingOrder=globals.parameters.processingOrder.filter(s=>s!=='postDecodeAdjustments');
  const globallyRendered=render(p,globals);
  const ordered=applyDetailAdjustments(applyColorAdjustments(globallyRendered,color),detail);
  const reversed=applyColorAdjustments(applyDetailAdjustments(globallyRendered,detail),color);
  const actual=render(p,recipe);assert.deepEqual(actual.data,ordered.data);assert.notDeepEqual(actual.data,reversed.data);
  assert.deepEqual(render(p,recipe).data,actual.data);assert.notDeepEqual(render(actual,recipe).data,actual.data);assert.deepEqual(p,before);
});
