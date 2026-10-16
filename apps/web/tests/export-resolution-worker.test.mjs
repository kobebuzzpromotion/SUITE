import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext,runInContext,runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createProcessing} from '../src/processing/index.mjs';
import {readExportResolution} from '../src/export-resolution.mjs';

const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4H8Q/8h/Uv+vmX/0M0UUV/ptkP/Ipwn/XuH/pKPAzr/kZ4r/r5P8A9KZ//9k=';
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAOSURBVBhXY/jPwABC/wEP+QP98+IdQAAAAABJRU5ErkJggg==';
const pixels=()=>({width:2,height:1,data:new Uint8ClampedArray([255,0,0,0,0,0,255,255])});
const fixture=(format)=>new Blob([Uint8Array.from(Buffer.from(
  format==='jpeg'?JPEG_BASE64:PNG_BASE64,'base64'))],
{type:format==='jpeg'?'image/jpeg':'image/png'});

async function withTransport(run){
  const previous=globalThis.Worker, workers=[];
  class FakeWorker{
    constructor(){this.terminated=false;workers.push(this);}
    postMessage(message,transfer){this.message=structuredClone(message,{transfer});}
    terminate(){this.terminated=true;}
    reply(result,id=this.message.id){this.onmessage?.({data:{id,result}});}
  }
  globalThis.Worker=FakeWorker;
  try{await run(workers);}finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
}

const bundle=await build({
  entryPoints:[fileURLToPath(new URL('../src/processing/worker.mjs',import.meta.url))],
  bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],
  write:false,logLevel:'silent',
});
const workerCode=bundle.outputFiles[0].text;
function runtime(blobFactory){
  const messages=[],captured=[];
  const self={postMessage(message){messages.push(message);}};
  class ImageData{constructor(data,width,height){this.data=data;this.width=width;this.height=height;captured.push(this);}}
  class OffscreenCanvas{
    constructor(width,height){this.width=width;this.height=height;}
    getContext(){return {putImageData(){}};}
    async convertToBlob(options){return blobFactory(options);}
  }
  const context=createContext({self,ImageData,OffscreenCanvas,Uint8ClampedArray,Uint8Array,
    ArrayBuffer,DOMException,Blob,URL,structuredClone,crypto:globalThis.crypto,
    setTimeout,clearTimeout,fetch,console});
  runInContext(workerCode,context);
  return {self,messages,captured,context};
}

test('EXPORT-RES-WK-01 / FACADE: foreign-realm density is copied into Worker while caller pixels remain owned',()=>withTransport(async workers=>{
  const processing=createProcessing(),source=pixels(),before=source.data.slice();
  const foreign=runInNewContext('({unit:"ppi",value:300})');
  const request=processing.encode(source,{format:'jpeg',resolution:foreign});
  const worker=workers[0];
  assert.equal(worker.message.method,'encode');
  assert.deepEqual(worker.message.args[1],{format:'jpeg',resolution:{unit:'ppi',value:300}});
  worker.message.args[0].data.fill(0);
  assert.deepEqual(source.data,before);
  worker.reply(fixture('jpeg'));
  assert.equal((await request).type,'image/jpeg');
  assert.equal(worker.terminated,true);processing.dispose();
}));

test('EXPORT-RES-WK-02 / FACADE: Preview PNG and omitted Final option keep old message shape',()=>withTransport(async workers=>{
  const processing=createProcessing(),source=pixels();
  const preview=processing.encode(source,{format:'png'});
  assert.deepEqual(workers[0].message.args[1],{format:'png'});
  workers[0].reply(fixture('png'));await preview;
  const final=processing.encode(source,{format:'jpeg',quality:.92});
  assert.deepEqual(workers[1].message.args[1],{format:'jpeg',quality:.92});
  workers[1].reply(fixture('jpeg'));await final;
  processing.dispose();
}));

test('EXPORT-RES-WK-03 / FACADE: invalid foreign objects fail before Worker and abort rejects late output',()=>withTransport(async workers=>{
  const processing=createProcessing(),source=pixels(),before=source.data.slice();
  for(const resolution of [null,{unit:'ppi',value:0},{unit:'ppi',value:300,unknown:1},
    runInNewContext('new (class Density {constructor(){this.unit="ppi";this.value=300}})') ,
    runInNewContext('({unit:"ppi",value:300,[Symbol("bad")]:1})')]) {
    await assert.rejects(processing.encode(source,{format:'jpeg',resolution}),/EXPORT_RESOLUTION_SETTINGS_INVALID/);
  }
  assert.equal(workers.length,0);
  const controller=new AbortController();
  const pending=processing.encode(source,{format:'jpeg',resolution:{unit:'ppc',value:100},signal:controller.signal});
  controller.abort();workers[0].reply(fixture('jpeg'));
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(workers[0].terminated,true);
  assert.deepEqual(source.data,before);processing.dispose();
}));

test('EXPORT-RES-WK-04 / ACTUAL_WORKER_CODE: foreign-realm JSON reaches real JFIF/PNG encoded-byte readback',async()=>{
  for(const [format,resolution,expected] of [
    ['jpeg',{unit:'ppi',value:300},{format:'jpeg',unit:'ppi',x:300,y:300}],
    ['png',{unit:'ppc',value:120},{format:'png',unit:'ppm',x:12000,y:12000}],
  ]){
    const {self,messages,captured}=runtime(()=>fixture(format));
    const source=pixels(),before=source.data.slice();
    const foreign=runInNewContext(`({unit:"${resolution.unit}",value:${resolution.value}})`);
    await self.onmessage({data:{id:7,method:'encode',args:[source,{format,resolution:foreign}]}});
    assert.equal(messages.length,1);
    assert.equal(messages[0].error,undefined);
    const result=messages[0].result;
    assert.equal(result.type,format==='jpeg'?'image/jpeg':'image/png');
    assert.deepEqual(readExportResolution(new Uint8Array(await result.arrayBuffer()),format),
      {width:2,height:1,...expected});
    assert.equal(captured.length,1);
    assert.deepEqual(source.data,before);
  }
});

test('EXPORT-RES-WK-05 / ACTUAL_WORKER_CODE: class/symbol keys and wrong MIME fail closed',async()=>{
  const run=async (format,resolution,blobFormat=format)=>{
    const {self,messages}=runtime(()=>fixture(blobFormat));
    await self.onmessage({data:{id:8,method:'encode',args:[pixels(),{format,resolution}]}});
    assert.equal(messages.length,1);
    assert.equal(messages[0].result,undefined);
    return messages[0].error?.message;
  };
  assert.equal(await run('jpeg',runInNewContext('new (class Density {constructor(){this.unit="ppi";this.value=300}})')),
    'EXPORT_RESOLUTION_SETTINGS_INVALID');
  assert.equal(await run('jpeg',runInNewContext('({unit:"ppi",value:300,[Symbol("bad")]:1})')),
    'EXPORT_RESOLUTION_SETTINGS_INVALID');
  assert.equal(await run('jpeg',{unit:'ppi',value:300},'png'),'ENCODER_FORMAT_MISMATCH');
});
