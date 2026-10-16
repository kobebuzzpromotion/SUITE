import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {applyManualEyeliner,MANUAL_EYELINER_VERSION} from
  '../src/processing/manual-eyeliner-line.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),personID:'33333333-3333-4333-8333-333333333333',
  sourceWidth:64,sourceHeight:32};
const context={...binding,savedRevision:2,target:'source'};
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
  for(let index=0;index<width*height;index++)
    data.set([180,140,120,255],index*4);
  return {width,height,data,...extra};
}
const pixel=(pixels,x,y)=>[...pixels.data.slice((y*pixels.width+x)*4,
  (y*pixels.width+x)*4+4)];

test('EYELINER-LINE-01: continuous left/right eyelid edges and connected wing alter only local RGB',()=>{
  const input=frame(),original=input.data.slice(),saved=structuredClone(document);
  const output=applyManualEyeliner(input,document,context);
  assert.notDeepEqual(pixel(output,16,16),pixel(input,16,16));
  assert.notDeepEqual(pixel(output,45,16),pixel(input,45,16));
  assert.notDeepEqual(pixel(output,27,13),pixel(input,27,13),
    'connected wing changes pixels beyond main lid edge');
  assert.deepEqual(pixel(output,0,0),pixel(input,0,0));
  assert.deepEqual(pixel(output,32,16),pixel(input,32,16),
    'outside separate eye rectangles remains unchanged');
  for(let index=3;index<output.data.length;index+=4)
    assert.equal(output.data[index],input.data[index]);
  assert.deepEqual(input.data,original);assert.deepEqual(document,saved);
  assert.deepEqual(applyManualEyeliner(input,document,context),output);
});

test('EYELINER-LINE-02: transparent hidden RGB and disabled opacity are unchanged',()=>{
  const input=frame();input.data.set([91,82,73,0],(16*64+16)*4);
  const output=applyManualEyeliner(input,document,context);
  assert.deepEqual(pixel(output,16,16),[91,82,73,0]);
  const none=applyManualEyeliner(input,
    {...document,settings:{...document.settings,opacity:0}},context);
  assert.deepEqual(none,input);
});

test('EYELINER-LINE-03: wrong Asset/SHA/person/revision/representation, discontinuity and aliases refuse',()=>{
  for(const changed of [{...context,assetID:'22222222-2222-4222-8222-222222222222'},
    {...context,originalSHA256:'b'.repeat(64)},
    {...context,personID:'44444444-4444-4444-8444-444444444444'},
    {...context,savedRevision:0},{...context,target:'preview'}])
    assert.throws(()=>applyManualEyeliner(frame(),document,changed),
      /MANUAL_EYELINER_BINDING_MISMATCH/);
  const variants=[
    {...document,representation:'eyelash-root-tip'},
    {...document,settings:{...document.settings,eyelashCount:17}},
    {...document,eyeTargets:[{...left,wing:[{u:.39,v:.5},{u:.43,v:.38}]}]},
    {...document,eyeTargets:[{...left,edge:[left.edge[0],left.edge[0]]}]},
    {...document,eyeTargets:[{...left,side:'iris-ring'}]},
    {...document,binding:{...binding,ownerConfirmed:true}},
  ];
  for(const value of variants)
    assert.throws(()=>applyManualEyeliner(frame(),value,context),
      /MANUAL_EYELINER_/);
});

test('EYELINER-LINE-04: exact 1600px proxy is bound separately from source and rejects forged dimensions',()=>{
  const largeBinding={...binding,sourceWidth:3200,sourceHeight:1600};
  const largeDocument={...document,binding:largeBinding};
  const largeContext={...largeBinding,savedRevision:2,target:'proxy'};
  const proxy=frame(1600,800,{sourceWidth:3200,sourceHeight:1600});
  const output=applyManualEyeliner(proxy,largeDocument,largeContext);
  assert.equal(output.width,1600);assert.equal(output.sourceWidth,3200);
  assert.notDeepEqual(pixel(output,400,384),pixel(proxy,400,384));
  assert.throws(()=>applyManualEyeliner(frame(1600,800),largeDocument,
    largeContext),/MANUAL_EYELINER_DIMENSIONS_MISMATCH/);
  assert.throws(()=>applyManualEyeliner(frame(1599,800,
    {sourceWidth:3200,sourceHeight:1600}),largeDocument,largeContext),
  /MANUAL_EYELINER_DIMENSIONS_MISMATCH/);
  assert.throws(()=>applyManualEyeliner(frame(1600,800,
    {sourceWidth:3201,sourceHeight:1600}),largeDocument,largeContext),
  /MANUAL_EYELINER_DIMENSIONS_MISMATCH/);
});

test('EYELINER-LINE-05: bounded geometry, SharedArrayBuffer and Abort keep originals untouched',()=>{
  const input=frame(),original=input.data.slice();
  assert.throws(()=>applyManualEyeliner(input,document,context,
    {signal:AbortSignal.abort()}),{name:'AbortError'});
  let reads=0;
  const signal={get aborted(){return ++reads>9;}};
  assert.throws(()=>applyManualEyeliner(input,document,context,{signal}),
    {name:'AbortError'});
  assert.deepEqual(input.data,original);
  const huge=frame(1,1);huge.width=8001;huge.height=1000;
  assert.throws(()=>applyManualEyeliner(huge,document,context),
    /MANUAL_EYELINER_CAPACITY/);
  if(typeof SharedArrayBuffer==='function'){
    const shared={width:64,height:32,
      data:new Uint8ClampedArray(new SharedArrayBuffer(64*32*4))};
    assert.throws(()=>applyManualEyeliner(shared,document,context),
      /MANUAL_EYELINER_SHARED_INPUT_INVALID/);
  }
});

test('EYELINER-LINE-06: independent browser bundle builds without Session/Editor connection',async()=>{
  const entry=fileURLToPath(new URL('../src/processing/manual-eyeliner-line.mjs',
    import.meta.url));
  const result=await build({entryPoints:[entry],bundle:true,write:false,
    platform:'browser',format:'esm'});
  assert.ok(result.outputFiles[0].contents.length>0);
});
