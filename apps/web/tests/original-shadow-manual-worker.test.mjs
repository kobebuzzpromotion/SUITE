import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash,webcrypto} from 'node:crypto';
import {authorSubjectMask} from '../src/processing/subject-mask-authoring.mjs';
import {createProcessing} from '../src/processing/index.mjs';
import {recipe as neutralRecipe} from './fixtures.mjs';

const assetID='bc410d09-6a70-4225-97ad-82aee7a690a8';
const backdropID='e51be62f-7d98-493b-943e-d0b3146b74fb';
const originalSHA256='a'.repeat(64),backdropSHA256='b'.repeat(64);
const at=(frame,x,y)=>[...frame.data.slice((y*frame.width+x)*4,
  (y*frame.width+x)*4+4)];
const stroke=(u,v)=>({operation:'ADD',path:[{u,v}],radiusFraction:.2,hardness:1});
function fixture(representation='original'){
  const width=representation==='proxy'?4:8,height=representation==='proxy'?2:4;
  const original={width,height,data:new Uint8ClampedArray(width*height*4),
    ...(representation==='proxy'?{sourceWidth:8,sourceHeight:4}:{})};
  const composite={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let i=0;i<width*height;i++){
    original.data.set([0,0,0,255],i*4);
    composite.data.set([200,200,200,255],i*4);
  }
  original.data[3]=0;composite.data[3]=0;
  const binding={assetID,originalSHA256,sourceWidth:8,sourceHeight:4,
    backdropID,backdropSHA256};
  const document={schemaVersion:1,
    engineVersion:'suite-srgb8-explicit-original-shadow-1',
    source:'owner-manual-input-unverified',binding,
    subjectStrokes:[stroke(.25,.5)],shadowStrokes:[stroke(.75,.5)],
    settings:{opacity:100}};
  const body=neutralRecipe();
  body.parameters.extendedParameters.originalShadowManual=document;
  const context={assetID,originalSHA256,savedRevision:2};
  const subjectMask=authorSubjectMask(original,document.subjectStrokes,context,
    {ownerConfirmed:true});
  const generatedShadow=authorSubjectMask(original,document.shadowStrokes,context,
    {ownerConfirmed:true});
  const shadowMask={width,height,data:generatedShadow.data,provenance:{
    kind:'original-shadow-mask',source:'owner-manual-shadow-selection',
    ...context,width,height}};
  return {representation,savedRecipe:{revision:2,body},
    binding:{assetID,originalSHA256,backdropID,backdropSHA256,savedRevision:2},
    original,composite,compositeEvidence:{kind:'composited-replacement-background',
      source:'owner-selected-image-backdrop-unverified',...context,
      backdropID,backdropSHA256,representation,width,height,
      pixelsSHA256:createHash('sha256').update(composite.data).digest('hex')},
    subjectMask,shadowMask};
}
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/processing/worker.mjs',
  import.meta.url))],bundle:true,format:'iife',platform:'browser',
  target:'es2022',external:['module'],write:false,logLevel:'silent'});
function worker(){
  const messages=[],self={postMessage(message){messages.push(message);}};
  const context=createContext({self,Uint8Array,Uint8ClampedArray,ArrayBuffer,
    DataView,DOMException,TextEncoder,Blob,URL,structuredClone,
    crypto:webcrypto,setTimeout,clearTimeout,fetch,console});
  runInContext(bundle.outputFiles[0].text,context);
  return {self,messages,context};
}
function inWorkerRealm(instance,input){
  const plain=structuredClone(input);
  for(const key of ['original','composite','subjectMask','shadowMask'])
    plain[key].data=[...plain[key].data];
  instance.context.payloadJSON=JSON.stringify(plain);
  return runInContext(`(() => {const p=JSON.parse(payloadJSON);
    for(const key of ['original','composite'])
      p[key].data=new Uint8ClampedArray(p[key].data);
    for(const key of ['subjectMask','shadowMask'])
      p[key].data=new Uint8Array(p[key].data);
    return p;})()`,instance.context);
}
async function request(instance,id,input,method='applyBoundOriginalShadowManual'){
  instance.messages.length=0;
  await instance.self.onmessage({data:{id,method,args:[inWorkerRealm(instance,input)]}});
  assert.equal(instance.messages.length,1);
  assert.equal(instance.messages[0].id,id);
  return instance.messages[0];
}

test('ORIGINAL-SHADOW-WORKER-01: saved two-layer document renders source and proxy without mutating inputs/alpha',async()=>{
  const instance=worker();
  for(const [index,representation] of ['original','proxy'].entries()){
    const payload=fixture(representation);
    const before=[...['original','composite','subjectMask','shadowMask'].map(
      key=>payload[key].data.slice())];
    const response=await request(instance,index+1,payload);
    assert.equal(response.error,undefined,response.error?.message);
    const {result}=response;
    assert.equal(result.width,payload.original.width);
    assert.equal(result.height,payload.original.height);
    const y=Math.floor(result.height/2),subjectX=Math.floor(result.width/4),
      shadowX=Math.floor(result.width*3/4);
    assert.deepEqual(at(result,subjectX,y),at(payload.composite,subjectX,y));
    assert.ok(at(result,shadowX,y)[0]<200);
    assert.deepEqual(at(result,0,0),at(payload.composite,0,0));
    assert.deepEqual(at(result,0,result.height-1),
      at(payload.composite,0,result.height-1));
    for(let offset=3;offset<result.data.length;offset+=4)
      assert.equal(result.data[offset],payload.composite.data[offset]);
    assert.deepEqual(['original','composite','subjectMask','shadowMask'].map(
      key=>payload[key].data),before);
  }
});

test('ORIGINAL-SHADOW-WORKER-02: Asset/background/revision/provenance and altered mask fail closed',async()=>{
  const instance=worker(),base=fixture();
  const cases=[
    [p=>{p.binding.assetID='00112233-4455-4677-8899-aabbccddeeff';},
      /BINDING_MISMATCH/],
    [p=>{p.binding.backdropSHA256='c'.repeat(64);},/BINDING_MISMATCH/],
    [p=>{p.binding.savedRevision=3;},/RUNTIME_INVALID/],
    [p=>{p.savedRecipe.revision=3;},/RUNTIME_INVALID/],
    [p=>{p.compositeEvidence.backdropID='00112233-4455-4677-8899-aabbccddeeff';},
      /BACKGROUND_PROVENANCE_MISMATCH/],
    [p=>{p.composite.data[4]++;},/BACKGROUND_PIXELS_MISMATCH/],
    [p=>{p.compositeEvidence.representation='proxy';},
      /BACKGROUND_PROVENANCE_MISMATCH/],
    [p=>{p.representation='proxy';},/DIMENSIONS_MISMATCH/],
    [p=>{p.subjectMask.provenance.savedRevision=3;},/PROVENANCE/],
    [p=>{p.shadowMask.provenance.kind='subject-alpha-mask';},/PROVENANCE/],
    [p=>{p.shadowMask.data.fill(0);},/MASK_DOCUMENT_MISMATCH/],
    [p=>{p.original.width=7;},/INVALID_OR_OVERSIZE_PIXELS|DIMENSIONS_MISMATCH/],
    [p=>{p.savedRecipe.body.parameters.extendedParameters.originalShadowManual
      .shadowStrokes[0].radiusFraction=2;},/INVALID_ORIGINAL_SHADOW_MANUAL_STROKE/],
    [p=>{p.savedRecipe.body.parameters.extendedParameters.addShadowManual={
      schemaVersion:1,engineVersion:'suite-srgb8-explicit-mask-shadow-1',
      binding:{...p.savedRecipe.body.parameters.extendedParameters
        .originalShadowManual.binding,backdropSHA256:'c'.repeat(64)},
      subjectStrokes:[stroke(.25,.5)],settings:{mode:'soft',opacity:70,
        blur:0,gradient:0,blend:'normal',offsetX:0,offsetY:0,
        shadowColor:[0,0,0]}};},/BACKDROP_CONFLICT/]
  ];
  for(const [index,[change,pattern]] of cases.entries()){
    const bad=structuredClone(base);change(bad);
    const response=await request(instance,20+index,bad);
    assert.equal(response.result,undefined);
    assert.match(response.error?.message??'',pattern);
  }
});

test('ORIGINAL-SHADOW-WORKER-05: facade forwards one independent operation, preserving caller buffers',async()=>{
  const prior=globalThis.Worker,instance=worker(),sent=[];
  class BridgeWorker{
    postMessage(message){
      sent.push(message.method);
      queueMicrotask(async()=>{
        const response=await request(instance,message.id,message.args[0],message.method);
        this.onmessage({data:response});
      });
    }
    terminate(){}
  }
  globalThis.Worker=BridgeWorker;
  try{
    const payload=fixture(),before=payload.original.data.slice();
    const processing=createProcessing();
    const result=await processing.applyBoundOriginalShadowManual(payload);
    assert.deepEqual(sent,['applyBoundOriginalShadowManual']);
    assert.ok(at(result,6,2)[0]<200);
    assert.deepEqual(payload.original.data,before);
    await assert.rejects(processing.render(payload.original,payload.savedRecipe.body),
      /ORIGINAL_SHADOW_MANUAL_INDEPENDENT_RUNTIME_REQUIRED/);
    assert.deepEqual(sent,['applyBoundOriginalShadowManual']);
    processing.dispose();
  }finally{globalThis.Worker=prior;}
});

test('ORIGINAL-SHADOW-WORKER-03: old Recipe and ordinary render reject rather than silently ignore manual shadow',async()=>{
  const instance=worker(),old=fixture();
  delete old.savedRecipe.body.parameters.extendedParameters.originalShadowManual;
  const response=await request(instance,40,old);
  assert.match(response.error?.message??'',/DOCUMENT_REQUIRED/);
  const manual=fixture();
  instance.context.recipeJSON=JSON.stringify(manual.savedRecipe.body);
  const body=runInContext('JSON.parse(recipeJSON)',instance.context);
  instance.messages.length=0;
  await instance.self.onmessage({data:{id:41,method:'render',
    args:[manual.original,body,{detections:[]}]}});
  assert.match(instance.messages[0].error?.message??'',
    /ORIGINAL_SHADOW_MANUAL_INDEPENDENT_RUNTIME_REQUIRED/);
});

test('ORIGINAL-SHADOW-WORKER-04: facade abort terminates pending worker and never publishes pixels',async()=>{
  const prior=globalThis.Worker;
  let created=0,terminated=0;
  class PendingWorker{
    constructor(){created++;}
    postMessage(){}
    terminate(){terminated++;}
  }
  globalThis.Worker=PendingWorker;
  try{
    const processing=createProcessing(),pre=new AbortController();pre.abort();
    await assert.rejects(processing.applyBoundOriginalShadowManual(fixture(),
      {signal:pre.signal}),{name:'AbortError'});
    assert.equal(created,0);
    const active=new AbortController();
    const pending=processing.applyBoundOriginalShadowManual(fixture(),
      {signal:active.signal});
    assert.equal(created,1);
    active.abort();
    await assert.rejects(pending,{name:'AbortError'});
    assert.equal(terminated,1);
    processing.dispose();
  }finally{globalThis.Worker=prior;}
});
