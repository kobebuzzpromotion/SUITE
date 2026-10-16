import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext, runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createProcessing} from '../src/processing/index.mjs';
import {BW_EDGE_REMOVAL_VERSION} from '../src/processing/bw-edge-removal.mjs';
import {rasterizeBWEdgeManualMasks} from '../src/processing/bw-edge-correction-mask.mjs';
import {applyBlackWhiteEdgeManualArea} from '../src/processing/bw-edge-manual-area.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),sourceWidth:32,sourceHeight:32};
const stroke=(u,v,radiusFraction)=>({operation:'ADD',path:[{u,v}],radiusFraction,hardness:1});
const document=()=>({schemaVersion:1,engineVersion:BW_EDGE_REMOVAL_VERSION,
  binding:{...binding},subjectStrokes:[stroke(.5,.5,.25)],
  correctionStrokes:[stroke(.5,.28,.1)]});
const runtime=()=>({...binding,draftBaseRevision:4,savedRevision:4,
  confirmedSelections:{subject:true,correction:true},
  permissionEvidence:{...binding,savedRevision:4,action:'edit',allowed:true}});
function frame(width=32,height=32){
  const data=new Uint8ClampedArray(width*height*4);
  for(let index=0;index<width*height;index++)data.set([110,70,50,255],index*4);
  if(width===32&&height===32)data.set([2,3,4,187],(9*width+16)*4);
  return {width,height,data};
}
const fringe=(pixels)=>Array.from(pixels.data.slice((9*32+16)*4,(9*32+16)*4+4));

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
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/processing/worker.mjs',import.meta.url))],
  bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],
  write:false,logLevel:'silent'});
function actualWorker(){
  const messages=[],self={postMessage(message){messages.push(message);}};
  const context=createContext({self,Uint8Array,Uint8ClampedArray,ArrayBuffer,DataView,DOMException,TextEncoder,
    Blob,URL,structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout,fetch,console});
  runInContext(bundle.outputFiles[0].text,context);
  return {self,messages,context};
}
async function request(worker,id,args){
  worker.messages.length=0;
  // A real postMessage reconstructs plain JSON in the receiving Worker realm.
  // Node vm needs that transfer emulated explicitly; keep the typed pixel buffer.
  worker.context.inputJSON=JSON.stringify(args.slice(1));
  const workerArgs=[args[0],...runInContext('JSON.parse(inputJSON)',worker.context)];
  await worker.self.onmessage({data:{id,method:'renderBWEdgeManual',args:workerArgs}});
  assert.equal(worker.messages.length,1);
  assert.equal(worker.messages[0].id,id);
  return worker.messages[0];
}

test('BW-EDGE-WK-01 facade copies source, sends independent operation, and aborts an in-flight Worker',()=>withFakeWorker(async workers=>{
  const processing=createProcessing(),pixels=frame(),before=pixels.data.slice();
  const pending=processing.renderBWEdgeManual(pixels,document(),runtime(),{target:'source'});
  assert.equal(workers[0].message.method,'renderBWEdgeManual');
  assert.equal(workers[0].message.args[3].target,'source');
  workers[0].message.args[0].data.fill(0);
  assert.deepEqual(pixels.data,before);
  workers[0].reply({...pixels,data:before.slice()});
  assert.deepEqual((await pending).data,before);
  assert.equal(workers[0].terminated,true);
  await assert.rejects(processing.renderBWEdgeManual(pixels,document(),runtime(),{}),
    /BW_EDGE_MANUAL_TARGET_INVALID/);
  assert.equal(workers.length,1);
  const controller=new AbortController();
  const cancelled=processing.renderBWEdgeManual(pixels,document(),runtime(),
    {target:'source',signal:controller.signal});
  controller.abort();
  await assert.rejects(cancelled,{name:'AbortError'});
  assert.equal(workers[1].terminated,true);
  assert.deepEqual(pixels.data,before);
  processing.dispose();
}));

test('BW-EDGE-WK-02 actual bundled Worker validates two roles and changes only the owner-painted fringe',async()=>{
  const worker=actualWorker(),pixels=frame(),before=pixels.data.slice();
  const response=await request(worker,2,[pixels,document(),runtime(),{target:'source'}]);
  assert.equal(response.error,undefined,response.error?.message);
  assert.notDeepEqual(fringe(response.result),fringe(pixels));
  assert.equal(fringe(response.result)[3],187,'alpha is unchanged');
  const {subjectMask,correctionMask}=rasterizeBWEdgeManualMasks(pixels,document(),runtime(),
    {target:'source'});
  const clean=mask=>({width:mask.width,height:mask.height,data:mask.data});
  const expected=applyBlackWhiteEdgeManualArea(pixels,clean(subjectMask),clean(correctionMask));
  assert.deepEqual(response.result.data,expected.data);
  assert.deepEqual(pixels.data,before);
});

test('BW-EDGE-WK-03 actual Worker refuses stale/other Asset/forged shape/wrong target or dimensions',async()=>{
  const worker=actualWorker(),pixels=frame(),before=pixels.data.slice();
  const cases=[
    [document(),{...runtime(),savedRevision:5},{target:'source'},/REVISION_MISMATCH/],
    [document(),{...runtime(),assetID:'22222222-2222-4222-8222-222222222222'},
      {target:'source'},/BINDING_MISMATCH/],
    [document(),{...runtime(),permissionEvidence:{...runtime().permissionEvidence,allowed:false}},
      {target:'source'},/PERMISSION_DENIED/],
    [document(),runtime(),{target:'unknown'},/TARGET_INVALID/],
    [document(),runtime(),{target:'source',unexpected:true},/TARGET_INVALID/],
    [{...document(),binding:{...binding,sourceWidth:31}},runtime(),
      {target:'source'},/BINDING_MISMATCH/]
  ];
  for(let i=0;i<cases.length;i++){
    const [doc,proof,options,pattern]=cases[i];
    const response=await request(worker,10+i,[pixels,doc,proof,options]);
    assert.equal(response.result,undefined);
    assert.match(response.error?.message??'',pattern);
  }
  const mismatch=await request(worker,20,[frame(16,16),document(),runtime(),{target:'source'}]);
  assert.match(mismatch.error?.message??'',/TARGET_DIMENSIONS_MISMATCH/);
  assert.deepEqual(pixels.data,before);
});

test('BW-EDGE-WK-04 proxy geometry is exact, transparent hidden RGB and unpainted source remain unchanged',async()=>{
  const worker=actualWorker(),pixels=frame();
  pixels.sourceWidth=32;pixels.sourceHeight=32;
  pixels.data.set([245,2,99,0],0);
  const before=pixels.data.slice();
  const proof=runtime(),doc=document();
  const source=await request(worker,21,[pixels,doc,proof,{target:'proxy'}]);
  assert.equal(source.error,undefined);
  assert.deepEqual(source.result.data.slice(0,4),before.slice(0,4));
  assert.deepEqual(pixels.data,before);
  const wrong=await request(worker,22,[frame(31,32),doc,proof,{target:'proxy'}]);
  assert.match(wrong.error?.message??'',/TARGET_DIMENSIONS_MISMATCH/);
});

test('BW-EDGE-WK-05 source and proxy sizes are independently bound to the saved full dimensions',async()=>{
  const worker=actualWorker();
  const full={...binding,sourceWidth:1601,sourceHeight:2};
  const doc={...document(),binding:full};
  const proof={...runtime(),...full,permissionEvidence:{...runtime().permissionEvidence,...full}};
  const proxy={...frame(1600,2),sourceWidth:1601,sourceHeight:2};
  const accepted=await request(worker,30,[proxy,doc,proof,{target:'proxy'}]);
  assert.equal(accepted.error,undefined,accepted.error?.message);
  assert.deepEqual([accepted.result.width,accepted.result.height],[1600,2]);
  const wrongRole=await request(worker,31,[frame(1600,2),doc,proof,{target:'source'}]);
  assert.match(wrongRole.error?.message??'',/TARGET_DIMENSIONS_MISMATCH/);
  const wrongProxy=await request(worker,32,[frame(1599,2),doc,proof,{target:'proxy'}]);
  assert.match(wrongProxy.error?.message??'',/TARGET_DIMENSIONS_MISMATCH/);
});
