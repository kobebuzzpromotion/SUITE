import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createProcessing} from '../src/processing/index.mjs';
import {renderPixels,rotateCropPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {recipe as neutralRecipe} from './fixtures.mjs';
import {BW_EDGE_REMOVAL_VERSION} from '../src/processing/bw-edge-removal.mjs';

const assetID='11111111-1111-4111-8111-111111111111',sha='a'.repeat(64);
const stroke=(u,v,radiusFraction)=>({operation:'ADD',path:[{u,v}],radiusFraction,hardness:1});
function manualDocument(sourceWidth=32,sourceHeight=32){
  return {schemaVersion:1,engineVersion:BW_EDGE_REMOVAL_VERSION,
    binding:{assetID,originalSHA256:sha,sourceWidth,sourceHeight},
    subjectStrokes:[stroke(.5,.5,.25)],correctionStrokes:[stroke(.5,.28,.1)]};
}
function runtime(sourceWidth=32,sourceHeight=32){
  const binding={assetID,originalSHA256:sha,sourceWidth,sourceHeight};
  return {...binding,draftBaseRevision:4,savedRevision:4,
    confirmedSelections:{subject:true,correction:true},
    permissionEvidence:{...binding,savedRevision:4,action:'edit',allowed:true}};
}
function recipe(sourceWidth=32,sourceHeight=32){
  const body=neutralRecipe();
  body.parameters.extendedParameters.bwEdgeManual=manualDocument(sourceWidth,sourceHeight);
  return body;
}
function frame(width=32,height=32,sourceWidth=width,sourceHeight=height){
  const data=new Uint8ClampedArray(width*height*4);
  for(let index=0;index<width*height;index++)data.set([110,70,50,255],index*4);
  const x=Math.floor(width/2);
  data.set([2,3,4,187],(9*width+x)*4);
  data.set([245,2,99,0],0);
  return {width,height,sourceWidth,sourceHeight,data};
}
const pixel=(pixels,x,y)=>Array.from(pixels.data.slice((y*pixels.width+x)*4,
  (y*pixels.width+x)*4+4));

const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/processing/worker.mjs',import.meta.url))],
  bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],
  write:false,logLevel:'silent'});
function actualWorker(){
  const messages=[],self={postMessage(message){messages.push(message);}};
  const context=createContext({self,Uint8Array,Uint8ClampedArray,ArrayBuffer,DataView,DOMException,
    TextEncoder,Blob,URL,structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout,fetch,console});
  runInContext(bundle.outputFiles[0].text,context);
  return {self,messages,context};
}
async function request(worker,id,method,args){
  worker.messages.length=0;
  worker.context.inputJSON=JSON.stringify(args.slice(1));
  const inWorker=[args[0],...runInContext('JSON.parse(inputJSON)',worker.context)];
  await worker.self.onmessage({data:{id,method,args:inWorker}});
  assert.equal(worker.messages.length,1);
  return worker.messages[0];
}

test('BW-NORMAL-01 facade sends explicit runtime/target only for bound Recipe and rejects missing inputs before Worker',async()=>{
  const previous=globalThis.Worker,workers=[];
  class FakeWorker{
    constructor(){workers.push(this);}
    postMessage(message,transfer){this.message=structuredClone(message,{transfer});}
    terminate(){}
    reply(result){this.onmessage?.({data:{id:this.message.id,result}});}
  }
  globalThis.Worker=FakeWorker;
  try{
    const processing=createProcessing(),source=frame(),body=recipe();
    for(const options of [{},{bwEdgeRuntime:runtime()},
      {bwEdgeRuntime:runtime(),bwEdgeTarget:'invalid'}])
      await assert.rejects(processing.render(source,body,options),/BW_EDGE_MANUAL_RUNTIME_REQUIRED/);
    assert.equal(workers.length,0);
    const pending=processing.render(source,body,{bwEdgeRuntime:runtime(),bwEdgeTarget:'source'});
    assert.equal(workers[0].message.method,'render');
    assert.equal(workers[0].message.args[2].bwEdgeTarget,'source');
    assert.equal(workers[0].message.args[2].bwEdgeRuntime.permissionEvidence.allowed,true);
    workers[0].reply({width:32,height:32,data:source.data.slice()});
    await pending;
    const old=processing.render(source,neutralRecipe(),{bwEdgeRuntime:runtime(),bwEdgeTarget:'source'});
    assert.deepEqual(Object.keys(workers[1].message.args[2]),['detections']);
    workers[1].reply({width:32,height:32,data:source.data.slice()});
    await old;
    processing.dispose();
  }finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});

test('BW-NORMAL-02 actual Worker renders saved bound stroke only; old Recipe pixel and provenance stay exact',async()=>{
  const worker=actualWorker(),source=frame(),before=source.data.slice();
  const old=await request(worker,1,'render',[source,neutralRecipe(),{detections:[]}]);
  assert.equal(old.error,undefined,old.error?.message);
  assert.deepEqual(old.result.data,before);
  assert.deepEqual(Array.from(old.result.provenance.processingOrder),
    ['base','personEV','exposure','contrast','saturation','rotation','encode']);
  const active=await request(worker,2,'render',[source,recipe(),
    {detections:[],bwEdgeRuntime:runtime(),bwEdgeTarget:'source'}]);
  assert.equal(active.error,undefined,active.error?.message);
  assert.notDeepEqual(pixel(active.result,16,9),pixel(source,16,9));
  assert.deepEqual(pixel(active.result,16,9),[110,70,50,187]);
  assert.deepEqual(pixel(active.result,0,0),pixel(source,0,0));
  assert.deepEqual(pixel(active.result,28,28),pixel(source,28,28));
  assert.deepEqual(Array.from(active.result.provenance.processingOrder),
    ['base','personEV','exposure','contrast','saturation','bwEdgeManual','rotation','encode']);
  assert.deepEqual(source.data,before);
});

test('BW-NORMAL-03 actual Worker accepts exact 1600px Preview proxy and full Final source, not swapped targets',async()=>{
  const worker=actualWorker(),body=recipe(1601,32),proof=runtime(1601,32);
  const preview=frame(1600,32,1601,32),final=frame(1601,32);
  const beforePreview=preview.data.slice(),beforeFinal=final.data.slice();
  const a=await request(worker,3,'render',[preview,body,
    {detections:[],bwEdgeRuntime:proof,bwEdgeTarget:'proxy'}]);
  const b=await request(worker,4,'render',[final,body,
    {detections:[],bwEdgeRuntime:proof,bwEdgeTarget:'source'}]);
  assert.equal(a.error,undefined,a.error?.message);
  assert.equal(b.error,undefined,b.error?.message);
  assert.deepEqual([a.result.width,a.result.height],[1600,32]);
  assert.deepEqual([b.result.width,b.result.height],[1601,32]);
  assert.notDeepEqual(pixel(a.result,800,9),pixel(preview,800,9));
  assert.notDeepEqual(pixel(b.result,800,9),pixel(final,800,9));
  for(const [id,pixels,target] of [[5,preview,'source'],[6,final,'proxy']]){
    const rejected=await request(worker,id,'render',[pixels,body,
      {detections:[],bwEdgeRuntime:proof,bwEdgeTarget:target}]);
    assert.match(rejected.error?.message??'',/TARGET_DIMENSIONS_MISMATCH/);
  }
  assert.deepEqual(preview.data,beforePreview);
  assert.deepEqual(final.data,beforeFinal);
});

test('BW-NORMAL-04 runtime absent/stale/other Asset or SHA/source frame and over-8MP binding fail closed',async()=>{
  const worker=actualWorker(),source=frame(),before=source.data.slice(),body=recipe();
  const cases=[
    [{detections:[]},/RUNTIME_REQUIRED/],
    [{detections:[],bwEdgeRuntime:{...runtime(),savedRevision:5},bwEdgeTarget:'source'},/REVISION_MISMATCH/],
    [{detections:[],bwEdgeRuntime:{...runtime(),assetID:'22222222-2222-4222-8222-222222222222'},bwEdgeTarget:'source'},/BINDING_MISMATCH/],
    [{detections:[],bwEdgeRuntime:{...runtime(),originalSHA256:'b'.repeat(64)},bwEdgeTarget:'source'},/BINDING_MISMATCH/],
    [{detections:[],bwEdgeRuntime:{...runtime(),sourceWidth:31},bwEdgeTarget:'source'},/BINDING_MISMATCH/]
  ];
  for(let index=0;index<cases.length;index++){
    const [options,pattern]=cases[index];
    const response=await request(worker,10+index,'render',[source,body,options]);
    assert.equal(response.result,undefined);
    assert.match(response.error?.message??'',pattern);
  }
  const wrongSource={...source,sourceWidth:33,sourceHeight:32};
  const wrong=await request(worker,20,'render',[wrongSource,body,
    {detections:[],bwEdgeRuntime:runtime(),bwEdgeTarget:'source'}]);
  assert.match(wrong.error?.message??'',/SOURCE_DIMENSIONS_MISMATCH/);
  const oversize=recipe(8_000_001,1);
  const big=await request(worker,21,'render',[source,oversize,
    {detections:[],bwEdgeRuntime:runtime(8_000_001,1),bwEdgeTarget:'source'}]);
  assert.match(big.error?.message??'',/INVALID_BW_EDGE_MANUAL_BINDING/);
  assert.deepEqual(source.data,before);
});

test('BW-NORMAL-05 pure stage sees global/postDecode/localLevels output before rotation/crop',()=>{
  const source=frame(),body=recipe();
  body.parameters.exposure=.25;
  body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',color:{highlights:20},detail:{}};
  body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  body.parameters.extendedParameters.localLevels={schemaVersion:1,
    engineVersion:'suite-srgb8-local-levels-coverage-1',
    brushVersion:'suite-normalized-coverage-brush-1',
    strokes:[{points:[{x:.5,y:.5}],radius:.25,hardness:1,mode:'add'}],
    levels:{master:{inputBlack:10,inputWhite:240,gamma:1.1}}};
  body.parameters.rotationDegrees=90;
  const beforeManual=structuredClone(body);
  delete beforeManual.parameters.extendedParameters.bwEdgeManual;
  beforeManual.parameters.rotationDegrees=0;
  let captured;
  const rendered=renderPixels(source,body,{validateRecipe,resolutionAssessment,
    bwEdgeRuntime:runtime(),bwEdgeTarget:'source',
    applyBWEdgeManual:(pixels,doc,proof,options)=>{
      assert.deepEqual(doc,body.parameters.extendedParameters.bwEdgeManual);
      assert.equal(proof.savedRevision,4);
      assert.equal(options.target,'source');
      captured={...pixels,data:pixels.data.slice()};
      return {...pixels,data:pixels.data.slice()};
    }});
  const staged=renderPixels(source,beforeManual,{validateRecipe,resolutionAssessment});
  assert.deepEqual(captured.data,staged.data);
  assert.deepEqual(rendered.data,rotateCropPixels(staged,90,undefined,{resolutionAssessment}).data);
  assert.deepEqual([rendered.width,rendered.height],[32,32]);
});
