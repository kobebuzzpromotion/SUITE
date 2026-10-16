import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {renderSavedManualEyeliner,MANUAL_EYELINER_RUNTIME_VERSION} from
  '../src/processing/manual-eyeliner-runtime.mjs';
import {MANUAL_EYELINER_VERSION} from '../src/processing/manual-eyeliner-line.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),personID:'33333333-3333-4333-8333-333333333333',
  sourceWidth:64,sourceHeight:32};
const runtime={...binding,savedRevision:2};
const left={side:'image-left',rect:{x:.1,y:.2,width:.35,height:.5},
  edge:[{u:.15,v:.5},{u:.25,v:.48},{u:.4,v:.5}],
  wing:[{u:.4,v:.5},{u:.43,v:.38}]};
const right={side:'image-right',rect:{x:.55,y:.2,width:.35,height:.5},
  edge:[{u:.6,v:.5},{u:.7,v:.49},{u:.85,v:.5}],wing:null};
const document={schemaVersion:1,engineVersion:MANUAL_EYELINER_VERSION,
  representation:'normalized-continuous-lid-edge-v1',binding,
  eyeTargets:[left,right],settings:{color:{r:10,g:20,b:30},opacity:1,
    lineRadiusFraction:.02}};
function frame(width=64,height=32,extra={}){
  const data=new Uint8ClampedArray(width*height*4);
  for(let pixel=0;pixel<width*height;pixel++)
    data.set([180,140,120,255],pixel*4);
  data.set([91,82,73,0],(Math.floor(height/2)*width+Math.floor(width/4))*4);
  return {width,height,data,...extra};
}
const pixel=(pixels,x,y)=>[...pixels.data.slice((y*pixels.width+x)*4,
  (y*pixels.width+x)*4+4)];
const render=(pixels=frame(),saved=document,context=runtime,target='source',signal)=>
  renderSavedManualEyeliner(pixels,saved,context,{target,signal});

test('EYELINER-RUNTIME-01: saved two-eye edge/wing changes only bounded opaque RGB',()=>{
  assert.equal(MANUAL_EYELINER_RUNTIME_VERSION,'suite-owner-manual-eyeliner-runtime-1');
  const source=frame(),original=source.data.slice(),saved=structuredClone(document);
  const result=render(source,saved);
  assert.notDeepEqual(pixel(result.pixels,15,16),pixel(source,15,16));
  assert.notDeepEqual(pixel(result.pixels,45,16),pixel(source,45,16));
  assert.notDeepEqual(pixel(result.pixels,27,13),pixel(source,27,13),
    'connected wing has its own pixels');
  assert.deepEqual(pixel(result.pixels,0,0),pixel(source,0,0));
  assert.deepEqual(pixel(result.pixels,32,16),pixel(source,32,16));
  assert.deepEqual(pixel(result.pixels,16,16),[91,82,73,0],
    'hidden transparent RGB remains intact');
  for(let offset=3;offset<source.data.length;offset+=4)
    assert.equal(result.pixels.data[offset],source.data[offset]);
  assert.deepEqual(source.data,original);assert.deepEqual(saved,document);
  assert.deepEqual(render(source,saved).pixels,result.pixels);
  assert.deepEqual(result.provenance,{kind:'manual-eyeliner-lid-line',
    engineVersion:MANUAL_EYELINER_VERSION,
    source:'caller-asserted-saved-manual-document',...runtime,
    target:'source',width:64,height:32});
  assert.notStrictEqual(result.pixels.data,source.data);
});

test('EYELINER-RUNTIME-02: exact 1600px Proxy is separate from unedited Original frame',()=>{
  const big={...binding,sourceWidth:3200,sourceHeight:1600};
  const saved={...document,binding:big},context={...big,savedRevision:5};
  const proxy=frame(1600,800,{sourceWidth:3200,sourceHeight:1600});
  const before=proxy.data.slice(),savedBefore=structuredClone(saved);
  const result=render(proxy,saved,context,'proxy');
  assert.equal(result.pixels.width,1600);
  assert.equal(result.pixels.height,800);
  assert.equal(result.pixels.sourceWidth,3200);
  assert.equal(result.provenance.target,'proxy');
  assert.equal(result.provenance.savedRevision,5);
  assert.notDeepEqual(pixel(result.pixels,400,384),pixel(proxy,400,384));
  assert.deepEqual(proxy.data,before);assert.deepEqual(saved,savedBefore);
  assert.throws(()=>render(frame(1599,800,
    {sourceWidth:3200,sourceHeight:1600}),saved,context,'proxy'),
  /MANUAL_EYELINER_RUNTIME_DIMENSIONS_MISMATCH/);
  assert.throws(()=>render(frame(1600,800),saved,context,'proxy'),
    /MANUAL_EYELINER_RUNTIME_FRAME_INVALID/);
  assert.throws(()=>render(frame(1600,800,
    {sourceWidth:3201,sourceHeight:1600}),saved,context,'proxy'),
  /MANUAL_EYELINER_RUNTIME_DIMENSIONS_MISMATCH/);
  assert.throws(()=>render(frame(1600,800,
    {sourceWidth:3200,sourceHeight:1600}),saved,context,'source'),
  /MANUAL_EYELINER_RUNTIME_FRAME_INVALID/);
});

test('EYELINER-RUNTIME-03: Asset/SHA/person/revision/target and fake authority reject',()=>{
  const wrong='22222222-2222-4222-8222-222222222222';
  for(const change of [{assetID:wrong},{originalSHA256:'b'.repeat(64)},
    {personID:wrong},{sourceWidth:65},{sourceHeight:33},
    {savedRevision:0},{savedRevision:1.5},{ownerConfirmed:true}])
    assert.throws(()=>render(frame(),document,{...runtime,...change}),
      /MANUAL_EYELINER_RUNTIME_INVALID|MANUAL_EYELINER_BINDING_MISMATCH|MANUAL_EYELINER_RUNTIME_DIMENSIONS_MISMATCH/);
  assert.throws(()=>render(frame(),document,runtime,'preview'),
    /MANUAL_EYELINER_RUNTIME_TARGET_INVALID/);
  assert.throws(()=>render(frame(),{...document,binding:{...binding,assetID:wrong}}),
    /MANUAL_EYELINER_BINDING_MISMATCH/);
  assert.throws(()=>render(frame(),{...document,ownerConfirmed:true}),
    /MANUAL_EYELINER_DOCUMENT_INVALID/);
  let called=0;
  const evil={...runtime};
  Object.defineProperty(evil,'assetID',{get(){called++;throw Error('getter');}});
  assert.throws(()=>render(frame(),document,evil),/MANUAL_EYELINER_RUNTIME_INVALID/);
  assert.equal(called,0);
});

test('EYELINER-RUNTIME-04: malformed saved geometry/settings, excess vertices and bitmap refuse',()=>{
  for(const invalid of [
    {...document,eyeTargets:[]},
    {...document,eyeTargets:[{...left,wing:[{u:.39,v:.5},{u:.43,v:.38}]}]},
    {...document,eyeTargets:[{...left,edge:[left.edge[0],left.edge[0]]}]},
    {...document,eyeTargets:[{...left,edge:[...left.edge,{u:.9,v:.5}]}]},
    {...document,eyeTargets:[{...left,edge:Array.from({length:129},(_,i)=>
      ({u:.11+i*.001,v:.5}))}]},
    {...document,settings:{...document.settings,opacity:Infinity}},
    {...document,settings:{...document.settings,lineRadiusFraction:.04}},
    {...document,bitmap:[1]},
  ])assert.throws(()=>render(frame(),invalid),/MANUAL_EYELINER_/);
});

test('EYELINER-RUNTIME-05: Abort, 8MP cap and shared input leave Original untouched',()=>{
  const source=frame(),before=source.data.slice(),saved=structuredClone(document);
  assert.throws(()=>render(source,saved,runtime,'source',AbortSignal.abort()),
    {name:'AbortError'});
  let reads=0;const signal={get aborted(){return ++reads>9;}};
  assert.throws(()=>render(source,saved,runtime,'source',signal),{name:'AbortError'});
  assert.deepEqual(source.data,before);assert.deepEqual(saved,document);
  assert.throws(()=>render({width:8001,height:1000,data:new Uint8ClampedArray(0)}),
    /MANUAL_EYELINER_RUNTIME_CAPACITY/);
  if(typeof SharedArrayBuffer==='function')
    assert.throws(()=>render({width:64,height:32,
      data:new Uint8ClampedArray(new SharedArrayBuffer(64*32*4))}),
    /MANUAL_EYELINER_RUNTIME_SHARED_INPUT_INVALID/);
});

test('EYELINER-RUNTIME-06: independent browser bundle without Worker or Final mount',async()=>{
  const entry=fileURLToPath(new URL('../src/processing/manual-eyeliner-runtime.mjs',
    import.meta.url));
  const result=await build({entryPoints:[entry],bundle:true,write:false,
    platform:'browser',format:'esm'});
  assert.ok(result.outputFiles[0].contents.length>0);
  const text=new TextDecoder().decode(result.outputFiles[0].contents);
  assert.doesNotMatch(text,/Evoto.*9.*style|Eyeliners.*6.*design/);
});
