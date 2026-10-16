import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Worker as ThreadWorker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createProcessing} from '../src/processing/index.mjs';
import {prepareAddShadowWorkerRuntime} from '../src/processing/add-shadow-runtime.mjs';
import {ADD_SHADOW_VERSION} from '../src/processing/add-shadow.mjs';
import {BW_EDGE_REMOVAL_VERSION} from '../src/processing/bw-edge-removal.mjs';
import {recipe} from './fixtures.mjs';

const assetID='bc410d09-6a70-4225-97ad-82aee7a690a8';
const backdropID='e51be62f-7d98-493b-943e-d0b3146b74fb';
const originalSHA256='a'.repeat(64),backdropSHA256='b'.repeat(64);
const sha=data=>createHash('sha256').update(data).digest('hex');
function frames(width=11,height=7){
  const original={width,height,
    data:new Uint8ClampedArray(width*height*4)};
  const selectedBackground={width,height,
    data:new Uint8ClampedArray(width*height*4)};
  for(let i=0;i<width*height;i++){
    original.data.set([120,80,60,255],i*4);
    selectedBackground.data.set([200,180,160,255],i*4);
  }
  const subject=new Uint8Array(width*height);
  for(let y=2;y<=3;y++)for(let x=2;x<=4;x++)subject[y*width+x]=255;
  const binding={assetID,originalSHA256,savedRevision:2,sourceWidth:width,
    sourceHeight:height,backdropID,backdropSHA256};
  return {original,selectedBackground,subjectMask:{width,height,data:subject,
    provenance:{kind:'subject-alpha-mask',source:'verified-manual-subject-matte',
      assetID,originalSHA256,savedRevision:2,width,height}},binding,
    selectionEvidence:{kind:'owner-selected-image-backdrop-frame',...binding,
      target:'source',width,height,pixelsSHA256:sha(selectedBackground.data)},
    settings:{mode:'drop',opacity:80,blur:0,gradient:0,blend:'normal',
      offsetX:2,offsetY:1,shadowColor:[0,0,0]},target:'source'};
}
function manualRecipe(input){
  const next=recipe();
  next.parameters.extendedParameters.addShadowManual={schemaVersion:1,
    engineVersion:ADD_SHADOW_VERSION,binding:{assetID,originalSHA256,
      sourceWidth:input.original.width,sourceHeight:input.original.height,
      backdropID,backdropSHA256},subjectStrokes:[{operation:'ADD',
      path:[{u:.3,v:.4}],radiusFraction:.2,hardness:1}],
    settings:structuredClone(input.settings)};
  return next;
}
function installWorker(WorkerType){
  const old=globalThis.Worker;globalThis.Worker=WorkerType;
  return()=>{if(old===undefined)delete globalThis.Worker;else globalThis.Worker=old;};
}
async function realWorker(){
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/processing/worker.mjs',
    import.meta.url))],bundle:true,format:'iife',platform:'browser',target:'es2022',
    external:['module'],write:false,logLevel:'silent'});
  const source=`const {parentPort}=require('node:worker_threads');
    globalThis.self={postMessage:message=>parentPort.postMessage(message)};
    ${bundle.outputFiles[0].text}
    parentPort.on('message',data=>self.onmessage({data}));`;
  return class BrowserWorker{
    constructor(){this.thread=new ThreadWorker(source,{eval:true});
      this.thread.on('message',data=>this.onmessage?.({data}));
      this.thread.on('error',error=>this.onerror?.({message:error.message}));}
    postMessage(message,transfer){this.thread.postMessage(message,transfer);}
    terminate(){void this.thread.terminate();}
  };
}

test('SHADOW-NORMAL-01: real Worker composites before existing global adjustments and preserves Original/legacy pixels',async()=>{
  const restore=installWorker(await realWorker()),processing=createProcessing();
  try{
    const input=frames(),untouched=input.original.data.slice();
    const runtime=await prepareAddShadowWorkerRuntime(input);
    const shadowed=await processing.applyBoundAddShadow(runtime);
    const withShadow=manualRecipe(input),legacy=recipe();
    const neutral=await processing.render(input.original,withShadow,
      {addShadowRuntime:runtime,addShadowOriginal:input.original,
        addShadowTarget:'source'});
    assert.deepEqual(neutral.data,shadowed.data);
    const old=await processing.render(input.original,legacy);
    assert.deepEqual(old.data,input.original.data);
    withShadow.parameters.exposure=1;
    const graded=await processing.render(input.original,withShadow,
      {addShadowRuntime:runtime,addShadowOriginal:input.original,
        addShadowTarget:'source'});
    assert.notDeepEqual(graded.data,neutral.data);
    assert.deepEqual(input.original.data,untouched);
    assert.deepEqual(graded.provenance.processingOrder.slice(0,4),
      ['base','addShadowManual(pre-global)','personEV','exposure']);
  }finally{processing.dispose();restore();}
});

test('SHADOW-NORMAL-02: missing runtime, wrong source, wrong binding and old Recipe with unexpected runtime reject',async()=>{
  let workers=0;
  class FakeWorker{constructor(){workers++;}terminate(){}postMessage(){}}
  const restore=installWorker(FakeWorker),processing=createProcessing();
  try{
    const input=frames(),runtime=await prepareAddShadowWorkerRuntime(input);
    const withShadow=manualRecipe(input),old=recipe();
    await assert.rejects(processing.render(input.original,withShadow),
      /RUNTIME_REQUIRED/);
    const changed={...input.original,data:input.original.data.slice()};
    changed.data[0]^=1;
    await assert.rejects(processing.render(changed,withShadow,
      {addShadowRuntime:runtime,addShadowOriginal:input.original,
        addShadowTarget:'source'}), /SOURCE_OR_BINDING_MISMATCH/);
    const wrong=structuredClone(withShadow);
    wrong.parameters.extendedParameters.addShadowManual.binding.backdropSHA256='c'.repeat(64);
    await assert.rejects(processing.render(input.original,wrong,
      {addShadowRuntime:runtime,addShadowOriginal:input.original,
        addShadowTarget:'source'}), /SOURCE_OR_BINDING_MISMATCH/);
    await assert.rejects(processing.render(input.original,old,
      {addShadowRuntime:runtime,addShadowOriginal:input.original,
        addShadowTarget:'source'}), /RUNTIME_UNEXPECTED/);
    assert.equal(workers,0);
  }finally{processing.dispose();restore();}
});

test('SHADOW-NORMAL-03: bound Shadow coexists with global/color/local/BW/Crop/Canvas Expand in the real Worker',async()=>{
  const restore=installWorker(await realWorker()),processing=createProcessing();
  try{
    const input=frames(64,48),runtime=await prepareAddShadowWorkerRuntime(input);
    const before=input.original.data.slice(),body=manualRecipe(input);
    body.parameters.exposure=.25;
    body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
      engineVersion:'suite-srgb8-color-detail-1',color:{highlights:20},detail:{}};
    body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
    body.parameters.extendedParameters.localLevels={schemaVersion:1,
      engineVersion:'suite-srgb8-local-levels-coverage-1',
      brushVersion:'suite-normalized-coverage-brush-1',
      strokes:[{points:[{x:.5,y:.5}],radius:.25,hardness:1,mode:'add'}],
      levels:{master:{inputBlack:10,inputWhite:240,gamma:1.1}}};
    body.parameters.extendedParameters.bwEdgeManual={schemaVersion:1,
      engineVersion:BW_EDGE_REMOVAL_VERSION,
      binding:{assetID,originalSHA256,sourceWidth:64,sourceHeight:48},
      subjectStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],
        radiusFraction:.25,hardness:1}],
      correctionStrokes:[{operation:'ADD',path:[{u:.5,v:.3}],
        radiusFraction:.1,hardness:1}]};
    const bwEdgeRuntime={assetID,originalSHA256,sourceWidth:64,sourceHeight:48,
      draftBaseRevision:2,savedRevision:2,
      confirmedSelections:{subject:true,correction:true},
      permissionEvidence:{assetID,originalSHA256,sourceWidth:64,sourceHeight:48,
        savedRevision:2,action:'edit',allowed:true}};
    body.parameters.rotationDegrees=90;
    body.parameters.extendedParameters.crop={preset_id:'ratio.free',
      preset_name:'Free',orientation:'portrait',
      crop_rect:{x:.125,y:.125,width:.75,height:.75},rotation:90,
      custom_size:false,requested_dpi:96};
    body.parameters.processingOrder.push('crop');
    body.parameters.extendedParameters.canvasExpand={schemaVersion:1,
      margins:{left:.25,right:.25,top:.25,bottom:.25},background:[8,9,10,0]};
    const result=await processing.render(input.original,body,{detections:[],
      addShadowRuntime:runtime,addShadowOriginal:input.original,addShadowTarget:'source',
      bwEdgeRuntime,bwEdgeTarget:'source'});
    assert.ok(result.width>36&&result.height>48);
    assert.deepEqual(Array.from(result.data.slice(0,4)),[8,9,10,0]);
    assert.deepEqual(input.original.data,before);
    assert.deepEqual(result.provenance.processingOrder.slice(0,5),
      ['base','addShadowManual(pre-global)','personEV','exposure','contrast']);
    assert.ok(result.provenance.processingOrder.includes('bwEdgeManual'));
    assert.ok(result.provenance.processingOrder.includes('canvasExpand(post-crop)'));
  }finally{processing.dispose();restore();}
});
