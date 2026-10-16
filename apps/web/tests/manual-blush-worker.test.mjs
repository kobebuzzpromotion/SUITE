import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createProcessing} from '../src/processing/index.mjs';
import {makeProxyPixels} from '../src/processing/pure.mjs';
import {recipe} from './fixtures.mjs';
import {MANUAL_BLUSH_COLOR_VERSION} from '../src/processing/manual-blush-color.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const PERSON='33333333-3333-4333-8333-333333333333';
const SHA='a'.repeat(64);
const stroke=(operation='ADD',path=[{u:.35,v:.5}])=>
  ({operation,path,radiusFraction:.04,hardness:.6});
const document=(width=80,height=40)=>({schemaVersion:1,
  engineVersion:MANUAL_BLUSH_COLOR_VERSION,
  binding:{assetID:ASSET,originalSHA256:SHA,personID:PERSON,
    sourceWidth:width,sourceHeight:height},
  cheekStrokes:[stroke('ADD',[{u:.35,v:.5},{u:.65,v:.5}]),
    stroke('ERASE',[{u:.5,v:.5}])],
  settings:{color:{r:200,g:30,b:90},opacity:.5}});
const saved=(width=80,height=40)=>{
  const body=recipe();body.parameters.extendedParameters.blushManual=document(width,height);
  return {revision:3,body};
};
const runtime=(width=80,height=40,changes={})=>({assetID:ASSET,
  originalSHA256:SHA,personID:PERSON,sourceWidth:width,sourceHeight:height,
  draftBaseRevision:3,savedRevision:3,ownerConfirmed:true,...changes});
function pixels(width=80,height=40){
  const data=new Uint8ClampedArray(width*height*4);
  for(let at=0;at<data.length;at+=4)data.set([100,90,80,255],at);
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

test('BLUSH-WK-01: facade sends detached saved Recipe and frame, abort/dispose return no pixels',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),input=pixels(),before=input.data.slice();
  const immutable=saved(),originalSaved=structuredClone(immutable);
  const pending=processing.renderManualBlush(input,immutable,runtime(),{target:'source'});
  assert.equal(workers[0].message.method,'renderManualBlush');
  assert.equal(workers[0].message.args[1].revision,3);
  workers[0].message.args[0].data.fill(0);
  workers[0].message.args[1].body.parameters.extendedParameters.blushManual.settings.opacity=1;
  assert.deepEqual(input.data,before);assert.deepEqual(immutable,originalSaved);
  workers[0].reply({...input,data:before.slice()});
  assert.deepEqual((await pending).data,before);
  const controller=new AbortController();
  const cancelled=processing.renderManualBlush(input,saved(),runtime(),
    {target:'source',signal:controller.signal});
  controller.abort();
  await assert.rejects(cancelled,{name:'AbortError'});
  assert.equal(workers[1].terminated,true);
  const stale=processing.renderManualBlush(input,saved(),runtime(),{target:'source'});
  processing.dispose();
  await assert.rejects(stale,{name:'AbortError'});
  assert.equal(workers[2].terminated,true);
  await assert.rejects(processing.renderManualBlush(input,saved(),runtime(),
    {target:'source'}),/PROCESSING_DISPOSED/);
  assert.deepEqual(input.data,before);
}));

test('BLUSH-WK-02: bundled Worker uses saved strokes for actual source RGB while preserving alpha and Original input',async()=>{
  const worker=actualWorker(),input=pixels(),before=input.data.slice();
  input.data.set([17,23,29,0],(20*80+28)*4);
  const hidden=input.data.slice();
  const savedRecipe=saved(),unchanged=structuredClone(savedRecipe);
  const response=await request(worker,2,'renderManualBlush',
    [input,savedRecipe,runtime(),{target:'source'}]);
  assert.equal(response.error,undefined,response.error?.message);
  assert.equal(response.result.data[(20*80+30)*4],150);
  assert.deepEqual([...response.result.data.slice((20*80+28)*4,(20*80+28)*4+4)],
    [17,23,29,0]);
  assert.deepEqual([...response.result.data.slice((20*80+4)*4,(20*80+4)*4+4)],
    [100,90,80,255]);
  assert.deepEqual(input.data,hidden);assert.deepEqual(savedRecipe,unchanged);
  assert.notDeepEqual(before,response.result.data);
});

test('BLUSH-WK-03: bundled Worker fails closed on other Asset/SHA/person, revision, dimensions and fake settings',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const cases=[
    [saved(),runtime(80,40,{assetID:'22222222-2222-4222-8222-222222222222'}),
      /RUNTIME_BINDING_MISMATCH/],
    [saved(),runtime(80,40,{originalSHA256:'b'.repeat(64)}),/RUNTIME_BINDING_MISMATCH/],
    [saved(),runtime(80,40,{personID:'22222222-2222-4222-8222-222222222222'}),
      /RUNTIME_BINDING_MISMATCH/],
    [saved(),runtime(80,40,{savedRevision:4}),/WORKER_RUNTIME_INVALID/],
    [{...saved(),revision:4},runtime(),/WORKER_RUNTIME_INVALID/],
    [saved(81,40),runtime(81,40),/SOURCE_DIMENSIONS_MISMATCH/],
    [{...saved(),body:{...saved().body,parameters:{...saved().body.parameters,
      extendedParameters:{blushManual:{...document(),settings:{...document().settings,
        style:'Evoto-1'}}}}}},runtime(),/INVALID_BLUSH_MANUAL_SETTINGS/],
  ];
  for(let index=0;index<cases.length;index++){
    const [recipeValue,proof,pattern]=cases[index];
    const response=await request(worker,10+index,'renderManualBlush',
      [frame,recipeValue,proof,{target:'source'}]);
    assert.equal(response.result,undefined);
    assert.match(response.error?.message??'',pattern);
  }
  assert.deepEqual(frame.data,before);
});

test('BLUSH-WK-04: regular render refuses manual Blush; old Recipe remains unchanged',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const denied=await request(worker,20,'render',
    [frame,saved().body,{},{}]);
  assert.match(denied.error?.message??'',/MANUAL_BLUSH_INDEPENDENT_RUNTIME_REQUIRED/);
  assert.deepEqual(frame.data,before);
  const old=recipe();
  const accepted=await request(worker,21,'render',[frame,old,{},{}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual(accepted.result.data,before);
  assert.deepEqual(old,recipe());
  const processing=createProcessing();
  await assert.rejects(processing.render(frame,saved().body),
    /MANUAL_BLUSH_INDEPENDENT_RUNTIME_REQUIRED/);
  processing.dispose();
});

test('BLUSH-WK-05: facade rejects getters/claims before structured clone',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),frame=pixels(),valid=saved();
  const getter=saved();
  Object.defineProperty(getter.body.parameters.extendedParameters.blushManual.settings,
    'color',{get(){throw Error('unsafe getter executed');}});
  await assert.rejects(processing.renderManualBlush(frame,getter,runtime(),
    {target:'source'}),/MANUAL_BLUSH_FACADE_RECIPE_INVALID/);
  await assert.rejects(processing.renderManualBlush(frame,valid,
    {...runtime(),permissionEvidence:{allowed:true}},{target:'source'}),
  /MANUAL_BLUSH_FACADE_RUNTIME_INVALID/);
  await assert.rejects(processing.renderManualBlush(frame,valid,runtime(),
    {target:'invalid'}),/MANUAL_BLUSH_TARGET_INVALID/);
  assert.equal(workers.length,0);
  processing.dispose();
}));

test('BLUSH-WK-06: bundled Worker rerasterizes exact Proxy and rejects absent source provenance or oversize',async()=>{
  const worker=actualWorker(),source=pixels(2000,2),proxy=makeProxyPixels(source);
  const savedRecipe=saved(2000,2),proof=runtime(2000,2);
  const accepted=await request(worker,30,'renderManualBlush',
    [proxy,savedRecipe,proof,{target:'proxy'}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual([accepted.result.width,accepted.result.height],[1600,2]);
  assert.deepEqual([accepted.result.sourceWidth,accepted.result.sourceHeight],[2000,2]);
  assert.notDeepEqual(accepted.result.data,proxy.data);
  const noSource={width:proxy.width,height:proxy.height,data:proxy.data};
  const refused=await request(worker,31,'renderManualBlush',
    [noSource,savedRecipe,proof,{target:'proxy'}]);
  assert.match(refused.error?.message??'',/WORKER_PIXELS_INVALID/);
  const wrong=await request(worker,32,'renderManualBlush',
    [proxy,savedRecipe,proof,{target:'source'}]);
  assert.match(wrong.error?.message??'',/WORKER_PIXELS_INVALID|TARGET_DIMENSIONS_MISMATCH/);
  const tooLarge=await request(worker,33,'renderManualBlush',
    [{width:8_000_001,height:1,data:new Uint8ClampedArray(0)},savedRecipe,proof,
      {target:'source'}]);
  assert.match(tooLarge.error?.message??'',/MANUAL_BLUSH_CAPACITY/);
  assert.deepEqual(source.data,pixels(2000,2).data);
});
