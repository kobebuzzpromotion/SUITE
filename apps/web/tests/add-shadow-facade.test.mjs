import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Worker as ThreadWorker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createProcessing} from '../src/processing/index.mjs';
import {prepareAddShadowWorkerRuntime} from '../src/processing/add-shadow-runtime.mjs';

const assetID='bc410d09-6a70-4225-97ad-82aee7a690a8';
const backdropID='e51be62f-7d98-493b-943e-d0b3146b74fb';
const originalSHA256='a'.repeat(64),backdropSHA256='b'.repeat(64);
const sha=data=>createHash('sha256').update(data).digest('hex');
function input(){
  const width=11,height=7;
  const original={width,height,data:new Uint8ClampedArray(width*height*4)};
  const selectedBackground={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let pixel=0;pixel<width*height;pixel++){
    original.data.set([180,80,60,255],pixel*4);
    selectedBackground.data.set([200,200,200,255],pixel*4);
  }
  const subjectData=new Uint8Array(width*height);
  for(let y=2;y<=3;y++)for(let x=2;x<=4;x++)subjectData[y*width+x]=255;
  const binding={assetID,originalSHA256,savedRevision:2,sourceWidth:width,
    sourceHeight:height,backdropID,backdropSHA256};
  const subjectMask={width,height,data:subjectData,provenance:{
    kind:'subject-alpha-mask',source:'verified-manual-subject-matte',
    assetID,originalSHA256,savedRevision:2,width,height}};
  const selectionEvidence={kind:'owner-selected-image-backdrop-frame',...binding,
    target:'source',width,height,pixelsSHA256:sha(selectedBackground.data)};
  return {original,selectedBackground,subjectMask,binding,selectionEvidence,
    settings:{mode:'drop',opacity:80,blur:0,gradient:0,blend:'normal',
      offsetX:2,offsetY:1,shadowColor:[0,0,0]},target:'source'};
}
const at=(frame,x,y)=>[...frame.data.slice((y*frame.width+x)*4,
  (y*frame.width+x)*4+4)];
function installWorker(WorkerType){
  const old=globalThis.Worker;
  globalThis.Worker=WorkerType;
  return ()=>{if(old===undefined)delete globalThis.Worker;
    else globalThis.Worker=old;};
}

test('SHADOW-FACADE-01: actual bundled Worker applies explicit shadow and leaves caller buffers intact',async()=>{
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/processing/worker.mjs',
    import.meta.url))],bundle:true,format:'iife',platform:'browser',target:'es2022',
    external:['module'],write:false,logLevel:'silent'});
  const source=`const {parentPort}=require('node:worker_threads');
    globalThis.self={postMessage:message=>parentPort.postMessage(message)};
    ${bundle.outputFiles[0].text}
    parentPort.on('message',data=>self.onmessage({data}));`;
  class BrowserWorker{
    constructor(){
      this.thread=new ThreadWorker(source,{eval:true});
      this.thread.on('message',data=>this.onmessage?.({data}));
      this.thread.on('error',error=>this.onerror?.({message:error.message}));
    }
    postMessage(message,transfer){this.thread.postMessage(message,transfer);}
    terminate(){void this.thread.terminate();}
  }
  const restore=installWorker(BrowserWorker),processing=createProcessing();
  try{
    const original=input();
    const originalBefore=original.original.data.slice();
    const backgroundBefore=original.selectedBackground.data.slice();
    const maskBefore=original.subjectMask.data.slice();
    const runtime=await prepareAddShadowWorkerRuntime(original);
    const pixelsBefore=runtime.args[0].data.slice();
    const matteBefore=runtime.args[1].data.slice();
    const result=await processing.applyBoundAddShadow(runtime);
    assert.ok(at(result,5,3)[0]<at(runtime.args[0],5,3)[0]);
    assert.deepEqual(at(result,3,2),at(runtime.args[0],3,2));
    assert.deepEqual([runtime.args[0].data,runtime.args[1].data,
      original.original.data,original.selectedBackground.data,original.subjectMask.data],
    [pixelsBefore,matteBefore,originalBefore,backgroundBefore,maskBefore]);
  }finally{processing.dispose();restore();}
});

test('SHADOW-FACADE-02: malformed or mismatched runtime is rejected before Worker creation',async()=>{
  let creations=0;
  class FakeWorker{constructor(){creations++;}terminate(){}postMessage(){}}
  const restore=installWorker(FakeWorker),processing=createProcessing();
  try{
    const runtime=await prepareAddShadowWorkerRuntime(input());
    const variants=[
      {...runtime,method:'render'},
      {...runtime,sourceWidth:12},
      {...runtime,args:[...runtime.args.slice(0,4)]},
      {...runtime,args:runtime.args.map((value,index)=>index===1?
        {...value,provenance:{...value.provenance,assetID:'00000000-0000-4000-8000-000000000000'}}:value)},
      {...runtime,args:runtime.args.map((value,index)=>index===2?
        {...value,originalSHA256:'c'.repeat(64)}:value)},
      {...runtime,args:runtime.args.map((value,index)=>index===3?
        {...value,savedRevision:3}:value)},
      {...runtime,args:runtime.args.map((value,index)=>index===0?
        {...value,data:new Uint8ClampedArray(3)}:value)},
      {...runtime,args:runtime.args.map((value,index)=>index===4?
        {...value,opacity:NaN}:value)},
      {...runtime,extra:true}
    ];
    for(const bad of variants)await assert.rejects(processing.applyBoundAddShadow(bad),
      /ADD_SHADOW_|BACKGROUND_COMPOSITE_/);
    assert.equal(creations,0);
  }finally{processing.dispose();restore();}
});

test('SHADOW-FACADE-03: payload is an owned snapshot, including nested pixels and provenance',async()=>{
  let received;
  class FakeWorker{
    postMessage(message){
      received=message;
      const payload=message.args[0];
      payload.args[0].data[0]=1;
      payload.args[1].data[0]=1;
      payload.args[1].provenance.assetID='changed';
      payload.args[3].assetID='changed';
      payload.args[4].shadowColor[0]=200;
      queueMicrotask(()=>this.onmessage?.({data:{id:message.id,result:{ok:true}}}));
    }
    terminate(){}
  }
  const restore=installWorker(FakeWorker),processing=createProcessing();
  try{
    const runtime=await prepareAddShadowWorkerRuntime(input());
    const before=structuredClone(runtime);
    assert.deepEqual(await processing.applyBoundAddShadow(runtime),{ok:true});
    assert.equal(received.method,'applyBoundAddShadow');
    assert.deepEqual(runtime,before);
  }finally{processing.dispose();restore();}
});

test('SHADOW-FACADE-04: preabort, in-flight abort and dispose never return a partial result',async()=>{
  const workers=[];
  class FakeWorker{
    constructor(){this.terminated=false;workers.push(this);}
    postMessage(message){this.message=message;}
    terminate(){this.terminated=true;}
  }
  const restore=installWorker(FakeWorker),processing=createProcessing();
  try{
    const runtime=await prepareAddShadowWorkerRuntime(input());
    const pre=new AbortController();pre.abort();
    await assert.rejects(processing.applyBoundAddShadow(runtime,{signal:pre.signal}),
      {name:'AbortError'});
    assert.equal(workers.length,0);
    const during=new AbortController();
    const first=processing.applyBoundAddShadow(runtime,{signal:during.signal});
    assert.equal(workers.length,1);
    during.abort();
    await assert.rejects(first,{name:'AbortError'});
    assert.equal(workers[0].terminated,true);
    workers[0].onmessage?.({data:{id:workers[0].message.id,result:{partial:true}}});
    const second=processing.applyBoundAddShadow(runtime);
    assert.equal(workers.length,2);
    processing.dispose();
    await assert.rejects(second,{name:'AbortError'});
    assert.equal(workers[1].terminated,true);
    await assert.rejects(processing.applyBoundAddShadow(runtime),/PROCESSING_DISPOSED/);
  }finally{processing.dispose();restore();}
});
