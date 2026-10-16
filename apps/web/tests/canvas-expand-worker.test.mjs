import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProcessing} from '../src/processing/index.mjs';
import {expandCanvasPixels} from '../src/processing/canvas-expand.mjs';

const workerSource=readFileSync(new URL('../src/processing/worker.mjs',import.meta.url),'utf8');
const source=()=>({width:2,height:1,data:new Uint8ClampedArray([5,10,20,200, 40,50,60,0])});

async function withWorker(body){
  const previous=globalThis.Worker,workers=[];
  class FakeWorker{
    constructor(){this.terminated=false;workers.push(this);}
    postMessage(message,transfer){this.message=structuredClone(message,{transfer});}
    terminate(){this.terminated=true;}
    reply(result,id=this.message.id){this.onmessage?.({data:{id,result}});}
  }
  globalThis.Worker=FakeWorker;
  try{await body(workers);}finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
}

test('CANVAS-WK-01 / facade sends exact expansion operation with an owned RGBA8 transfer',()=>withWorker(async workers=>{
  const processing=createProcessing(),input=source(),before=input.data.slice();
  const settings={margins:{left:1,right:1,top:1,bottom:0},background:[0,0,0,0]};
  const pending=processing.expandCanvas(input,settings),worker=workers[0];
  assert.equal(worker.message.method,'expandCanvas');
  assert.deepEqual(worker.message.args[1],settings);
  worker.message.args[0].data.fill(250);
  assert.deepEqual(input.data,before,'caller-owned pixels must not detach or mutate');
  worker.reply(expandCanvasPixels(input,settings));
  const output=await pending;
  assert.deepEqual([output.width,output.height],[4,2]);
  assert.deepEqual([...output.data.slice((4+1)*4,(4+2)*4)],[5,10,20,200]);
  assert.equal(worker.terminated,true);
  assert.match(workerSource,/case 'expandCanvas':result=expandCanvasPixels\(args\[0\],args\[1\]\);break;/);
  processing.dispose();
}));

test('CANVAS-WK-02 / invalid or oversized dimensions reject before worker allocation and preserve source',()=>withWorker(async workers=>{
  const processing=createProcessing(),input=source(),before=input.data.slice();
  await assert.rejects(processing.expandCanvas(input,{margins:{right:20_000}}),/CANVAS_SIZE_LIMIT/);
  await assert.rejects(processing.expandCanvas(input,{margins:{left:-1}}),/CANVAS_MARGINS_INVALID/);
  await assert.rejects(processing.expandCanvas(input,{width:1,height:1}),/CANVAS_TARGET_INVALID/);
  assert.equal(workers.length,0);
  assert.deepEqual(input.data,before);
  processing.dispose();
}));

test('CANVAS-WK-03 / cancellation terminates Worker, ignores late output and leaves caller buffer intact',()=>withWorker(async workers=>{
  const processing=createProcessing(),input=source(),before=input.data.slice(),controller=new AbortController();
  const pending=processing.expandCanvas(input,{margins:{right:1}},{signal:controller.signal});
  assert.equal(workers.length,1);
  controller.abort();workers[0].reply({fakeLateOutput:true});
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(workers[0].terminated,true);
  assert.deepEqual(input.data,before);
  processing.dispose();
}));

test('CANVAS-WK-04 / existing resizeForExport facade and Worker route remain reachable',()=>withWorker(async workers=>{
  const processing=createProcessing(),input=source();
  const pending=processing.resizeForExport(input,{kind:'percentage',value:50});
  assert.equal(workers[0].message.method,'resizeForExport');
  workers[0].reply({width:1,height:1,data:new Uint8ClampedArray(4)});
  assert.equal((await pending).width,1);
  assert.match(workerSource,/case 'resizeForExport':result=resizeExportPixels\(args\[0\],args\[1\]\);break;/);
  processing.dispose();
}));
