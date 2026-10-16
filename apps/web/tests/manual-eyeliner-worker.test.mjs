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
const binding=(width,height)=>({assetID:ASSET,originalSHA256:SHA,
  personID:PERSON,sourceWidth:width,sourceHeight:height});
const document=(width=64,height=32)=>({schemaVersion:1,
  engineVersion:'suite-srgb8-owner-manual-lid-line-1',
  representation:'normalized-continuous-lid-edge-v1',
  binding:binding(width,height),
  eyeTargets:[{side:'image-left',rect:{x:.1,y:.2,width:.35,height:.5},
    edge:[{u:.15,v:.5},{u:.25,v:.48},{u:.4,v:.5}],
    wing:[{u:.4,v:.5},{u:.43,v:.38}]},
  {side:'image-right',rect:{x:.55,y:.2,width:.35,height:.5},
    edge:[{u:.6,v:.5},{u:.7,v:.49},{u:.85,v:.5}],wing:null}],
  settings:{color:{r:10,g:20,b:30},opacity:1,lineRadiusFraction:.02}});
const saved=(width=64,height=32)=>{
  const body=recipe();body.parameters.extendedParameters.eyelinerManual=
    document(width,height);
  return {revision:3,body};
};
const runtime=(width=64,height=32,changes={})=>({...binding(width,height),
  savedRevision:3,...changes});
function pixels(width=64,height=32){
  const data=new Uint8ClampedArray(width*height*4);
  for(let at=0;at<data.length;at+=4)data.set([180,140,120,255],at);
  data.set([13,17,19,0],(Math.floor(height/2)*width+Math.floor(width/4))*4);
  return {width,height,data};
}
const pixel=(frame,x,y)=>[...frame.data.slice((y*frame.width+x)*4,
  (y*frame.width+x)*4+4)];
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

test('EYELINER-WK-01: facade snapshots saved Recipe/frame and Abort/dispose expose no pixels',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),frame=pixels(),before=frame.data.slice();
  const savedRecipe=saved(),unchanged=structuredClone(savedRecipe);
  const pending=processing.renderManualEyeliner(frame,savedRecipe,runtime(),
    {target:'source'});
  assert.equal(workers[0].message.method,'renderManualEyeliner');
  workers[0].message.args[0].data.fill(0);
  workers[0].message.args[1].body.parameters.extendedParameters.eyelinerManual
    .eyeTargets[0].edge[0].u=.2;
  assert.deepEqual(frame.data,before);assert.deepEqual(savedRecipe,unchanged);
  workers[0].reply({...frame,data:before.slice()});
  assert.deepEqual((await pending).data,before);
  const abort=new AbortController();
  const cancelled=processing.renderManualEyeliner(frame,saved(),runtime(),
    {target:'source',signal:abort.signal});
  abort.abort();await assert.rejects(cancelled,{name:'AbortError'});
  assert.equal(workers[1].terminated,true);
  const stale=processing.renderManualEyeliner(frame,saved(),runtime(),
    {target:'source'});
  processing.dispose();await assert.rejects(stale,{name:'AbortError'});
  assert.equal(workers[2].terminated,true);
  await assert.rejects(processing.renderManualEyeliner(frame,saved(),runtime(),
    {target:'source'}),/PROCESSING_DISPOSED/u);
}));

test('EYELINER-WK-02: bundled Worker changes both eyes and wing but preserves outside/alpha/Original',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const savedRecipe=saved(),original=structuredClone(savedRecipe);
  const response=await request(worker,2,'renderManualEyeliner',
    [frame,savedRecipe,runtime(),{target:'source'}]);
  assert.equal(response.error,undefined,response.error?.message);
  assert.notDeepEqual(pixel(response.result,15,16),pixel(frame,15,16));
  assert.notDeepEqual(pixel(response.result,45,16),pixel(frame,45,16));
  assert.notDeepEqual(pixel(response.result,27,13),pixel(frame,27,13));
  assert.deepEqual(pixel(response.result,0,0),pixel(frame,0,0));
  assert.deepEqual(pixel(response.result,32,16),pixel(frame,32,16));
  assert.deepEqual(pixel(response.result,16,16),[13,17,19,0]);
  for(let at=3;at<before.length;at+=4)
    assert.equal(response.result.data[at],before[at]);
  assert.deepEqual(frame.data,before);assert.deepEqual(savedRecipe,original);
});

test('EYELINER-WK-03: mismatched Asset/SHA/person/revision/dimensions and forged wing reject',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const altered=saved();
  altered.body.parameters.extendedParameters.eyelinerManual.eyeTargets[0].wing[0].u=.39;
  const cases=[
    [saved(),runtime(64,32,{assetID:'22222222-2222-4222-8222-222222222222'}),/WORKER_BINDING_MISMATCH/u],
    [saved(),runtime(64,32,{originalSHA256:'b'.repeat(64)}),/WORKER_BINDING_MISMATCH/u],
    [saved(),runtime(64,32,{personID:'22222222-2222-4222-8222-222222222222'}),/WORKER_BINDING_MISMATCH/u],
    [saved(),runtime(64,32,{savedRevision:4}),/WORKER_RUNTIME_INVALID/u],
    [saved(65,32),runtime(65,32),/WORKER_DIMENSIONS_MISMATCH/u],
    [altered,runtime(),/INVALID_EYELINER_MANUAL_WING_DISCONNECTED/u],
  ];
  for(let index=0;index<cases.length;index++){
    const [body,proof,pattern]=cases[index];
    const response=await request(worker,10+index,'renderManualEyeliner',
      [frame,body,proof,{target:'source'}]);
    assert.equal(response.result,undefined);assert.match(response.error?.message??'',pattern);
  }
  assert.deepEqual(frame.data,before);
});

test('EYELINER-WK-04: normal render explicitly rejects Eyeliner; old neutral render survives',async()=>{
  const worker=actualWorker(),frame=pixels(),before=frame.data.slice();
  const denied=await request(worker,20,'render',[frame,saved().body,{},{}]);
  assert.match(denied.error?.message??'',/MANUAL_EYELINER_INDEPENDENT_RUNTIME_REQUIRED/u);
  const accepted=await request(worker,21,'render',[frame,recipe(),{},{}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual(accepted.result.data,before);
  const processing=createProcessing();
  await assert.rejects(processing.render(frame,saved().body),
    /MANUAL_EYELINER_INDEPENDENT_RUNTIME_REQUIRED/u);
  processing.dispose();assert.deepEqual(frame.data,before);
});

test('EYELINER-WK-05: facade rejects getters, fake authority and target before dispatch',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),frame=pixels(),getters=saved();
  let invoked=0;
  Object.defineProperty(getters.body.parameters.extendedParameters.eyelinerManual,
    'eyeTargets',{get(){invoked++;throw Error('getter must not run');}});
  await assert.rejects(processing.renderManualEyeliner(frame,getters,runtime(),
    {target:'source'}),/MANUAL_EYELINER_FACADE_RECIPE_INVALID/u);
  assert.equal(invoked,0);
  await assert.rejects(processing.renderManualEyeliner(frame,saved(),
    {...runtime(),ownerConfirmed:true},{target:'source'}),
  /MANUAL_EYELINER_FACADE_RUNTIME_INVALID/u);
  await assert.rejects(processing.renderManualEyeliner(frame,saved(),runtime(),
    {target:'preview'}),/MANUAL_EYELINER_TARGET_INVALID/u);
  assert.equal(workers.length,0);processing.dispose();
}));

test('EYELINER-WK-06: exact Proxy render accepts 1600px and refuses missing/fake provenance',async()=>{
  const worker=actualWorker(),source=pixels(2000,1000),proxy=makeProxyPixels(source);
  const accepted=await request(worker,30,'renderManualEyeliner',
    [proxy,saved(2000,1000),runtime(2000,1000),{target:'proxy'}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual([accepted.result.width,accepted.result.height],[1600,800]);
  assert.deepEqual([accepted.result.sourceWidth,accepted.result.sourceHeight],[2000,1000]);
  const missing=await request(worker,31,'renderManualEyeliner',
    [{width:proxy.width,height:proxy.height,data:proxy.data},
      saved(2000,1000),runtime(2000,1000),{target:'proxy'}]);
  assert.match(missing.error?.message??'',/WORKER_PIXELS_INVALID/u);
  const wrong=await request(worker,32,'renderManualEyeliner',
    [proxy,saved(2000,1000),runtime(2000,1000),{target:'source'}]);
  assert.match(wrong.error?.message??'',/WORKER_PIXELS_INVALID|DIMENSIONS_MISMATCH/u);
});
