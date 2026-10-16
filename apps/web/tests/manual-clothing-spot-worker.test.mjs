import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createProcessing} from '../src/processing/index.mjs';
import {makeProxyPixels} from '../src/processing/pure.mjs';
import {recipe} from './fixtures.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const SHA='a'.repeat(64);
const binding=(width,height)=>({assetID:ASSET,originalSHA256:SHA,
  sourceWidth:width,sourceHeight:height});
const document=(width=80,height=40)=>({schemaVersion:1,
  engineVersion:'suite-srgb8-manual-clothing-spot-1',binding:binding(width,height),
  targetRect:{x:.1,y:.2,width:width>1280?.1:.2,height:.2},
  referenceRect:{x:.6,y:.2,width:width>1280?.1:.2,height:.2},
  targetStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],
    radiusFraction:.2,hardness:1}]});
const saved=(width=80,height=40)=>{
  const body=recipe();
  body.parameters.extendedParameters.clothingSpotManual=document(width,height);
  return {revision:3,body};
};
const runtime=(width=80,height=40,changes={})=>({...binding(width,height),
  savedRevision:3,...changes});
function pixels(width=80,height=40){
  const data=new Uint8ClampedArray(width*height*4);
  for(let at=0;at<data.length;at+=4)data.set([100,90,80,255],at);
  const x=Math.round((width>1280?.65:.7)*width),y=Math.round(.3*height);
  data.set([200,30,60,255],(y*width+x)*4);
  if(width>1280)for(let row=Math.round(.2*height);row<Math.round(.4*height);row++)
    for(let col=Math.round(.6*width);col<Math.round(.7*width);col++)
      data.set([200,30,60,255],(row*width+col)*4);
  return {width,height,data};
}

async function withFakeWorker(run){
  const previous=globalThis.Worker,workers=[];
  class FakeWorker{
    constructor(){this.terminated=false;workers.push(this);}
    postMessage(message,transfer){this.message=structuredClone(message,{transfer});}
    terminate(){this.terminated=true;}
    reply(result){this.onmessage?.({data:{id:this.message.id,result}});}
  }
  globalThis.Worker=FakeWorker;
  try{await run(workers);}finally{if(previous===undefined)delete globalThis.Worker;
    else globalThis.Worker=previous;}
}
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/processing/worker.mjs',
  import.meta.url))],bundle:true,format:'iife',platform:'browser',target:'es2022',
  external:['module'],write:false,logLevel:'silent'});
function actualWorker(){
  const messages=[],self={postMessage(message){messages.push(message);}};
  const context=createContext({self,Uint8Array,Uint8ClampedArray,ArrayBuffer,DataView,
    DOMException,TextEncoder,Blob,URL,structuredClone,crypto:globalThis.crypto,
    setTimeout,clearTimeout,fetch,console});
  runInContext(bundle.outputFiles[0].text,context);
  return {self,messages,context};
}
async function request(worker,id,method,args){
  worker.messages.length=0;
  const encoded=JSON.stringify({pixels:{...args[0],data:[...args[0].data]},
    savedRecipe:args[1],runtime:args[2],options:args[3]});
  worker.context.inputJSON=encoded;
  const unpacked=runInContext(`(() => {const p=JSON.parse(inputJSON);
    p.pixels.data=new Uint8ClampedArray(p.pixels.data);
    return [p.pixels,p.savedRecipe,p.runtime,p.options];})()`,worker.context);
  await worker.self.onmessage({data:{id,method,args:unpacked}});
  assert.equal(worker.messages.length,1);
  assert.equal(worker.messages[0].id,id);
  return worker.messages[0];
}

test('CLOTHING-WK-01: facade snapshots saved Recipe/frame and cancels without exposing pixels',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),input=pixels(),before=input.data.slice();
  const savedRecipe=saved(),old=structuredClone(savedRecipe);
  const pending=processing.renderManualClothingSpot(input,savedRecipe,runtime(),{target:'source'});
  assert.equal(workers[0].message.method,'renderManualClothingSpot');
  workers[0].message.args[0].data.fill(0);
  workers[0].message.args[1].body.parameters.extendedParameters.clothingSpotManual
    .targetStrokes[0].hardness=0;
  assert.deepEqual(input.data,before);assert.deepEqual(savedRecipe,old);
  workers[0].reply({...input,data:before.slice()});
  assert.deepEqual((await pending).data,before);
  const controller=new AbortController();
  const cancelled=processing.renderManualClothingSpot(input,saved(),runtime(),
    {target:'source',signal:controller.signal});
  controller.abort();
  await assert.rejects(cancelled,{name:'AbortError'});
  assert.equal(workers[1].terminated,true);
  const stale=processing.renderManualClothingSpot(input,saved(),runtime(),{target:'source'});
  processing.dispose();
  await assert.rejects(stale,{name:'AbortError'});
  assert.equal(workers[2].terminated,true);
  await assert.rejects(processing.renderManualClothingSpot(input,saved(),runtime(),
    {target:'source'}),/PROCESSING_DISPOSED/);
  assert.deepEqual(input.data,before);
}));

test('CLOTHING-WK-02: bundled Worker applies saved spot to source RGB, not alpha, outside or input',async()=>{
  const worker=actualWorker(),input=pixels(),before=input.data.slice();
  input.data.set([17,23,29,0],(30*80+30)*4);
  const old=input.data.slice(),savedRecipe=saved(),recipeBefore=structuredClone(savedRecipe);
  const response=await request(worker,2,'renderManualClothingSpot',
    [input,savedRecipe,runtime(),{target:'source'}]);
  assert.equal(response.error,undefined,response.error?.message);
  const pixel=(x,y)=>(y*80+x)*4;
  assert.deepEqual([...response.result.data.slice(pixel(16,12),pixel(16,12)+4)],
    [200,30,60,255]);
  assert.deepEqual([...response.result.data.slice(pixel(30,30),pixel(30,30)+4)],
    [17,23,29,0]);
  assert.deepEqual([...response.result.data.slice(pixel(4,4),pixel(4,4)+4)],
    [100,90,80,255]);
  assert.deepEqual(input.data,old);assert.deepEqual(savedRecipe,recipeBefore);
  assert.notDeepEqual(before,response.result.data);
});

test('CLOTHING-WK-03: bundled Worker rejects wrong Asset/SHA/revision/source/regions',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const cases=[
    [saved(),runtime(80,40,{assetID:'22222222-2222-4222-8222-222222222222'}),
      /WORKER_BINDING_MISMATCH/],
    [saved(),runtime(80,40,{originalSHA256:'b'.repeat(64)}),/WORKER_BINDING_MISMATCH/],
    [saved(),runtime(80,40,{savedRevision:4}),/WORKER_RUNTIME_INVALID/],
    [saved(81,40),runtime(81,40),/DIMENSIONS_MISMATCH/],
    [{...saved(),body:{...saved().body,parameters:{...saved().body.parameters,
      extendedParameters:{clothingSpotManual:{...document(),referenceRect:{...document()
        .referenceRect,width:.3}}}}}},runtime(),/INVALID_CLOTHING_SPOT_MANUAL_REGIONS/],
  ];
  for(let index=0;index<cases.length;index++){
    const [body,proof,pattern]=cases[index];
    const response=await request(worker,10+index,'renderManualClothingSpot',
      [frame,body,proof,{target:'source'}]);
    assert.equal(response.result,undefined);
    assert.match(response.error?.message??'',pattern);
  }
  assert.deepEqual(frame.data,before);
});

test('CLOTHING-WK-04: regular render refuses Clothing; old Recipe and Blush/BW routes retain their boundary',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const denied=await request(worker,20,'render',[frame,saved().body,{},{}]);
  assert.match(denied.error?.message??'',/MANUAL_CLOTHING_INDEPENDENT_RUNTIME_REQUIRED/);
  assert.deepEqual(frame.data,before);
  const old=recipe();
  const accepted=await request(worker,21,'render',[frame,old,{},{}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual(accepted.result.data,before);
  const processing=createProcessing();
  await assert.rejects(processing.render(frame,saved().body),
    /MANUAL_CLOTHING_INDEPENDENT_RUNTIME_REQUIRED/);
  processing.dispose();
});

test('CLOTHING-WK-05: facade refuses hostile getters and self-declared authority before dispatch',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),frame=pixels(),getters=saved();
  Object.defineProperty(getters.body.parameters.extendedParameters.clothingSpotManual,
    'targetRect',{get(){throw Error('hostile getter ran');}});
  await assert.rejects(processing.renderManualClothingSpot(frame,getters,runtime(),
    {target:'source'}),/MANUAL_CLOTHING_FACADE_RECIPE_INVALID/);
  await assert.rejects(processing.renderManualClothingSpot(frame,saved(),
    {...runtime(),ownerConfirmed:true},{target:'source'}),
  /MANUAL_CLOTHING_FACADE_RUNTIME_INVALID/);
  await assert.rejects(processing.renderManualClothingSpot(frame,saved(),runtime(),
    {target:'invalid'}),/MANUAL_CLOTHING_TARGET_INVALID/);
  assert.equal(workers.length,0);
  processing.dispose();
}));

test('CLOTHING-WK-06: exact proxy representation rerasterizes and missing source provenance fails',async()=>{
  const worker=actualWorker(),source=pixels(2000,40),proxy=makeProxyPixels(source);
  const doc=saved(2000,40),proof=runtime(2000,40);
  const accepted=await request(worker,30,'renderManualClothingSpot',
    [proxy,doc,proof,{target:'proxy'}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual([accepted.result.width,accepted.result.height],[1600,32]);
  assert.deepEqual([accepted.result.sourceWidth,accepted.result.sourceHeight],[2000,40]);
  assert.equal(accepted.result.data[(10*1600+240)*4],200);
  const noSource={width:proxy.width,height:proxy.height,data:proxy.data};
  const refused=await request(worker,31,'renderManualClothingSpot',
    [noSource,doc,proof,{target:'proxy'}]);
  assert.match(refused.error?.message??'',/WORKER_PIXELS_INVALID/);
  const wrong=await request(worker,32,'renderManualClothingSpot',
    [proxy,doc,proof,{target:'source'}]);
  assert.match(wrong.error?.message??'',/WORKER_PIXELS_INVALID|DIMENSIONS_MISMATCH/);
  const tooLarge=await request(worker,33,'renderManualClothingSpot',
    [{width:8_000_001,height:1,data:new Uint8ClampedArray(0)},doc,proof,
      {target:'source'}]);
  assert.match(tooLarge.error?.message??'',/MANUAL_CLOTHING_CAPACITY/);
});
