import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createProcessing} from '../src/processing/index.mjs';
import {makeProxyPixels} from '../src/processing/pure.mjs';
import {recipe} from './fixtures.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const PERSON='33333333-3333-4333-8333-333333333333';
const SHA='a'.repeat(64);
const binding=(width,height)=>({assetID:ASSET,originalSHA256:SHA,personID:PERSON,
  eye:'left',sourceWidth:width,sourceHeight:height});
const stroke=(radiusFraction)=>({operation:'ADD',path:[{u:.5,v:.5}],
  radiusFraction,hardness:1});
const document=(width=100,height=100)=>({schemaVersion:1,
  engineVersion:'suite-srgb8-manual-iris-color-1',binding:binding(width,height),
  irisRingStrokes:[stroke(.15)],pupilExclusionStrokes:[stroke(.04)],
  settings:{color:{r:40,g:90,b:130},amount:1}});
const saved=(width=100,height=100)=>{
  const body=recipe();body.parameters.extendedParameters.contactsIrisManual=
    document(width,height);
  return {revision:3,body};
};
const runtime=(width=100,height=100,changes={})=>({...binding(width,height),
  savedRevision:3,...changes});
function pixels(width=100,height=100){
  const data=new Uint8ClampedArray(width*height*4);
  for(let at=0;at<data.length;at+=4)data.set([100,100,100,255],at);
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
  assert.equal(worker.messages.length,1);
  assert.equal(worker.messages[0].id,id);
  return worker.messages[0];
}

test('CONTACTS-WK-01 facade snapshots Recipe/frame; Abort and dispose expose no pixels',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),frame=pixels(),before=frame.data.slice();
  const savedRecipe=saved(),old=structuredClone(savedRecipe);
  const pending=processing.renderManualContacts(frame,savedRecipe,runtime(),{target:'source'});
  assert.equal(workers[0].message.method,'renderManualContacts');
  workers[0].message.args[0].data.fill(0);
  workers[0].message.args[1].body.parameters.extendedParameters.contactsIrisManual
    .irisRingStrokes[0].hardness=0;
  assert.deepEqual(frame.data,before);assert.deepEqual(savedRecipe,old);
  workers[0].reply({...frame,data:before.slice()});
  assert.deepEqual((await pending).data,before);
  const controller=new AbortController();
  const cancelled=processing.renderManualContacts(frame,saved(),runtime(),
    {target:'source',signal:controller.signal});
  controller.abort();await assert.rejects(cancelled,{name:'AbortError'});
  assert.equal(workers[1].terminated,true);
  const stale=processing.renderManualContacts(frame,saved(),runtime(),{target:'source'});
  processing.dispose();await assert.rejects(stale,{name:'AbortError'});
  assert.equal(workers[2].terminated,true);
  await assert.rejects(processing.renderManualContacts(frame,saved(),runtime(),
    {target:'source'}),/PROCESSING_DISPOSED/u);
}));

test('CONTACTS-WK-02 bundled Worker changes ring RGB but preserves pupil, alpha and Original',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const savedRecipe=saved(),old=structuredClone(savedRecipe);
  const response=await request(worker,2,'renderManualContacts',
    [frame,savedRecipe,runtime(),{target:'source'}]);
  assert.equal(response.error,undefined,response.error?.message);
  const ring=(50*100+59)*4,pupil=(50*100+50)*4,outside=(5*100+5)*4;
  assert.notDeepEqual([...response.result.data.slice(ring,ring+3)],[100,100,100]);
  assert.deepEqual([...response.result.data.slice(pupil,pupil+4)],[100,100,100,255]);
  assert.deepEqual([...response.result.data.slice(outside,outside+4)],[100,100,100,255]);
  assert.deepEqual([...response.result.data.slice(0,4)],[13,17,19,0]);
  assert.deepEqual(frame.data,before);assert.deepEqual(savedRecipe,old);
});

test('CONTACTS-WK-03 wrong Asset/SHA/person/eye/revision/source and forged stroke reject',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const altered=saved();
  altered.body.parameters.extendedParameters.contactsIrisManual.irisRingStrokes[0].bitmap=[];
  const cases=[
    [saved(),runtime(100,100,{assetID:'22222222-2222-4222-8222-222222222222'}),/WORKER_BINDING_MISMATCH/u],
    [saved(),runtime(100,100,{originalSHA256:'b'.repeat(64)}),/WORKER_BINDING_MISMATCH/u],
    [saved(),runtime(100,100,{personID:'22222222-2222-4222-8222-222222222222'}),/WORKER_BINDING_MISMATCH/u],
    [saved(),runtime(100,100,{eye:'right'}),/WORKER_BINDING_MISMATCH/u],
    [saved(),runtime(100,100,{savedRevision:4}),/WORKER_RUNTIME_INVALID/u],
    [saved(101,100),runtime(101,100),/DIMENSIONS_MISMATCH/u],
    [altered,runtime(),/INVALID_CONTACTS_IRIS_RING_STROKE/u],
  ];
  for(let index=0;index<cases.length;index++){
    const [body,proof,pattern]=cases[index];
    const response=await request(worker,10+index,'renderManualContacts',
      [frame,body,proof,{target:'source'}]);
    assert.equal(response.result,undefined);
    assert.match(response.error?.message??'',pattern);
  }
  assert.deepEqual(frame.data,before);
});

test('CONTACTS-WK-04 regular render rejects Contacts; old Recipe still renders unchanged',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const denied=await request(worker,20,'render',[frame,saved().body,{},{}]);
  assert.match(denied.error?.message??'',/MANUAL_CONTACTS_INDEPENDENT_RUNTIME_REQUIRED/u);
  const accepted=await request(worker,21,'render',[frame,recipe(),{},{}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual(accepted.result.data,before);
  const processing=createProcessing();
  await assert.rejects(processing.render(frame,saved().body),
    /MANUAL_CONTACTS_INDEPENDENT_RUNTIME_REQUIRED/u);
  processing.dispose();
  assert.deepEqual(frame.data,before);
});

test('CONTACTS-WK-05 facade rejects getters, authority claims and target before dispatch',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),frame=pixels(),getters=saved();
  let called=0;
  Object.defineProperty(getters.body.parameters.extendedParameters.contactsIrisManual,
    'irisRingStrokes',{get(){called++;throw Error('hostile getter ran');}});
  await assert.rejects(processing.renderManualContacts(frame,getters,runtime(),
    {target:'source'}),/MANUAL_CONTACTS_FACADE_RECIPE_INVALID/u);
  assert.equal(called,0);
  await assert.rejects(processing.renderManualContacts(frame,saved(),
    {...runtime(),ownerConfirmed:true},{target:'source'}),
  /MANUAL_CONTACTS_FACADE_RUNTIME_INVALID/u);
  await assert.rejects(processing.renderManualContacts(frame,saved(),runtime(),
    {target:'invalid'}),/MANUAL_CONTACTS_TARGET_INVALID/u);
  assert.equal(workers.length,0);processing.dispose();
}));

test('CONTACTS-WK-06 proxy rerasterizes; missing provenance and wrong size reject',async()=>{
  const worker=actualWorker(),source=pixels(2000,1000),proxy=makeProxyPixels(source);
  const accepted=await request(worker,30,'renderManualContacts',
    [proxy,saved(2000,1000),runtime(2000,1000),{target:'proxy'}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual([accepted.result.width,accepted.result.height],[1600,800]);
  assert.deepEqual([accepted.result.sourceWidth,accepted.result.sourceHeight],[2000,1000]);
  const refused=await request(worker,31,'renderManualContacts',
    [{width:proxy.width,height:proxy.height,data:proxy.data},
      saved(2000,1000),runtime(2000,1000),{target:'proxy'}]);
  assert.match(refused.error?.message??'',/WORKER_PIXELS_INVALID/u);
  const wrong=await request(worker,32,'renderManualContacts',
    [proxy,saved(2000,1000),runtime(2000,1000),{target:'source'}]);
  assert.match(wrong.error?.message??'',/WORKER_PIXELS_INVALID|DIMENSIONS_MISMATCH/u);
});
