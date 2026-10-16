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
  engineVersion:'suite-srgb8-owner-manual-hand-tone-1',binding:binding(width,height),
  handStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],
    radiusFraction:.2,hardness:.7}],
  settings:{strength:1,radiusSourcePixels:3}});
const saved=(width=80,height=40)=>{
  const body=recipe();
  body.parameters.extendedParameters.handToneManual=document(width,height);
  return {revision:3,body};
};
const runtime=(width=80,height=40,changes={})=>({...binding(width,height),
  savedRevision:3,...changes});
function pixels(width=80,height=40){
  const data=new Uint8ClampedArray(width*height*4);
  for(let at=0;at<data.length;at+=4)data.set([70,100,130,255],at);
  const cx=Math.floor(width/2),cy=Math.floor(height/2);
  for(let y=Math.max(0,cy-2);y<=Math.min(height-1,cy+2);y++)
    for(let x=Math.max(0,cx-2);x<=Math.min(width-1,cx+2);x++)
      data.set([140,180,220,255],(y*width+x)*4);
  data.set([13,17,19,0],0);
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
  assert.equal(worker.messages.length,1);assert.equal(worker.messages[0].id,id);
  return worker.messages[0];
}

test('HAND-WK-01: facade snapshots saved Recipe/frame; Abort and dispose expose no pixels',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),input=pixels(),before=input.data.slice();
  const savedRecipe=saved(),old=structuredClone(savedRecipe);
  const pending=processing.renderManualHandTone(input,savedRecipe,runtime(),{target:'source'});
  assert.equal(workers[0].message.method,'renderManualHandTone');
  workers[0].message.args[0].data.fill(0);
  workers[0].message.args[1].body.parameters.extendedParameters.handToneManual
    .handStrokes[0].hardness=0;
  assert.deepEqual(input.data,before);assert.deepEqual(savedRecipe,old);
  workers[0].reply({...input,data:before.slice()});
  assert.deepEqual((await pending).data,before);
  const controller=new AbortController();
  const cancelled=processing.renderManualHandTone(input,saved(),runtime(),
    {target:'source',signal:controller.signal});
  controller.abort();
  await assert.rejects(cancelled,{name:'AbortError'});
  assert.equal(workers[1].terminated,true);
  const stale=processing.renderManualHandTone(input,saved(),runtime(),{target:'source'});
  processing.dispose();
  await assert.rejects(stale,{name:'AbortError'});
  assert.equal(workers[2].terminated,true);
  await assert.rejects(processing.renderManualHandTone(input,saved(),runtime(),
    {target:'source'}),/PROCESSING_DISPOSED/);
  assert.deepEqual(input.data,before);
}));

test('HAND-WK-02: bundled Worker applies saved mask/tone only to selected RGB',async()=>{
  const worker=actualWorker(),input=pixels(),savedRecipe=saved();
  input.data.set([17,23,29,0],(30*80+30)*4);
  const before=input.data.slice(),recipeBefore=structuredClone(savedRecipe);
  const response=await request(worker,2,'renderManualHandTone',
    [input,savedRecipe,runtime(),{target:'source'}]);
  assert.equal(response.error,undefined,response.error?.message);
  const center=(20*80+40)*4;
  assert.ok(response.result.data[center]<before[center]);
  assert.equal(response.result.data[center+3],255);
  assert.deepEqual([...response.result.data.slice(0,4)],[13,17,19,0]);
  assert.deepEqual([...response.result.data.slice((4*80+4)*4,(4*80+4)*4+4)],
    [70,100,130,255]);
  assert.deepEqual(input.data,before);assert.deepEqual(savedRecipe,recipeBefore);
});

test('HAND-WK-03: bundled Worker refuses wrong Asset/SHA/revision/source and forged typed mask',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const altered=saved();
  altered.body.parameters.extendedParameters.handToneManual.handStrokes[0].bitmap=[255];
  const cases=[
    [saved(),runtime(80,40,{assetID:'22222222-2222-4222-8222-222222222222'}),
      /WORKER_BINDING_MISMATCH/],
    [saved(),runtime(80,40,{originalSHA256:'b'.repeat(64)}),/WORKER_BINDING_MISMATCH/],
    [saved(),runtime(80,40,{savedRevision:4}),/WORKER_RUNTIME_INVALID/],
    [saved(81,40),runtime(81,40),/DIMENSIONS_MISMATCH/],
    [altered,runtime(),/INVALID_HAND_TONE_MANUAL_STROKE/],
  ];
  for(let index=0;index<cases.length;index++){
    const [body,proof,pattern]=cases[index];
    const response=await request(worker,10+index,'renderManualHandTone',
      [frame,body,proof,{target:'source'}]);
    assert.equal(response.result,undefined);
    assert.match(response.error?.message??'',pattern);
  }
  assert.deepEqual(frame.data,before);
});

test('HAND-WK-04: regular render rejects Hand; old Recipe and previous gates remain unchanged',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const denied=await request(worker,20,'render',[frame,saved().body,{},{}]);
  assert.match(denied.error?.message??'',/MANUAL_HAND_INDEPENDENT_RUNTIME_REQUIRED/);
  assert.deepEqual(frame.data,before);
  const old=recipe();
  const accepted=await request(worker,21,'render',[frame,old,{},{}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual(accepted.result.data,before);
  const processing=createProcessing();
  await assert.rejects(processing.render(frame,saved().body),
    /MANUAL_HAND_INDEPENDENT_RUNTIME_REQUIRED/);
  processing.dispose();
});

test('HAND-WK-05: facade refuses getters/self-claimed authority before dispatch',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),frame=pixels(),getters=saved();
  let called=0;
  Object.defineProperty(getters.body.parameters.extendedParameters.handToneManual,
    'handStrokes',{get(){called++;throw Error('hostile getter ran');}});
  await assert.rejects(processing.renderManualHandTone(frame,getters,runtime(),
    {target:'source'}),/MANUAL_HAND_FACADE_RECIPE_INVALID/);
  assert.equal(called,0);
  await assert.rejects(processing.renderManualHandTone(frame,saved(),
    {...runtime(),ownerConfirmed:true},{target:'source'}),
  /MANUAL_HAND_FACADE_RUNTIME_INVALID/);
  await assert.rejects(processing.renderManualHandTone(frame,saved(),runtime(),
    {target:'invalid'}),/MANUAL_HAND_TARGET_INVALID/);
  assert.equal(workers.length,0);processing.dispose();
}));

test('HAND-WK-06: proxy rerasterizes; missing provenance/oversize fail before effects',async()=>{
  const worker=actualWorker(),source=pixels(2000,40),proxy=makeProxyPixels(source);
  const doc=saved(2000,40),proof=runtime(2000,40);
  const accepted=await request(worker,30,'renderManualHandTone',
    [proxy,doc,proof,{target:'proxy'}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual([accepted.result.width,accepted.result.height],[1600,32]);
  assert.deepEqual([accepted.result.sourceWidth,accepted.result.sourceHeight],[2000,40]);
  const noSource={width:proxy.width,height:proxy.height,data:proxy.data};
  const refused=await request(worker,31,'renderManualHandTone',
    [noSource,doc,proof,{target:'proxy'}]);
  assert.match(refused.error?.message??'',/WORKER_PIXELS_INVALID/);
  const wrong=await request(worker,32,'renderManualHandTone',
    [proxy,doc,proof,{target:'source'}]);
  assert.match(wrong.error?.message??'',/WORKER_PIXELS_INVALID|DIMENSIONS_MISMATCH/);
  const tooLarge=await request(worker,33,'renderManualHandTone',
    [{width:8_000_001,height:1,data:new Uint8ClampedArray(0)},doc,proof,
      {target:'source'}]);
  assert.match(tooLarge.error?.message??'',/MANUAL_HAND_CAPACITY/);
});
