import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext, runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {encode} from '../src/processing/encode.mjs';

const pixels=()=>({width:2,height:1,data:new Uint8ClampedArray([200,80,10,0,20,40,60,255])});
const settings=(changes={})=>({format:'tiff',jpeg_quality:95,bit_depth:8,color_space:'sRGB',
  tiff_compression:'none',preserve_alpha:true,metadata:'remove',file_name_template:'{original}',requested_dpi:96,...changes});

function tiff(blobBytes){
  const bytes=new Uint8Array(blobBytes),view=new DataView(bytes.buffer),le=bytes[0]===73;
  assert.ok((le&&bytes[1]===73)||(!le&&bytes[0]===77&&bytes[1]===77));
  const u16=at=>view.getUint16(at,le),u32=at=>view.getUint32(at,le);
  assert.equal(u16(2),42);
  const at=u32(4),count=u16(at),tags=new Map();
  for(let i=0;i<count;i++){
    const pos=at+2+i*12,tag=u16(pos),type=u16(pos+2),n=u32(pos+4),pointer=n*(type===3?2:type===5?8:4)>4?u32(pos+8):pos+8;
    tags.set(tag,{type,n,pointer,value:type===3?u16(pointer):u32(pointer)});
  }
  const offsets=tags.get(273),counts=tags.get(279),pixelBytes=bytes.slice(offsets.value,offsets.value+counts.value);
  return {bytes,tags,pixelBytes,u32};
}

const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/processing/worker.mjs',import.meta.url))],
  bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],write:false,logLevel:'silent'});
const workerCode=bundle.outputFiles[0].text;
function runtime(){
  const messages=[],self={postMessage(message){messages.push(message);}};
  const context=createContext({self,Uint8ClampedArray,Uint8Array,ArrayBuffer,DataView,DOMException,Blob,
    URL,structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout,fetch,console});
  runInContext(workerCode,context);
  return {self,messages};
}

test('TIFF-WK01 / actual bundled Worker produces uncompressed RGBA8 TIFF Blob with pixels and PPI',async()=>{
  const {self,messages}=runtime(),source=pixels(),before=source.data.slice();
  await self.onmessage({data:{id:1,method:'encode',args:[source,{format:'tiff',resolution:{unit:'ppi',value:300}}]}});
  assert.equal(messages.length,1);
  assert.equal(messages[0].error,undefined);
  const blob=messages[0].result;
  assert.equal(blob.type,'image/tiff');
  const result=tiff(await blob.arrayBuffer());
  assert.deepEqual([result.tags.get(256).value,result.tags.get(257).value,result.tags.get(277).value], [2,1,4]);
  assert.equal(result.tags.get(258).value,8);
  assert.equal(result.tags.get(259).value,1);
  assert.equal(result.tags.get(262).value,2);
  assert.equal(result.tags.get(338).value,2);
  assert.equal(result.tags.get(296).value,2);
  assert.equal(result.u32(result.tags.get(282).pointer),300);
  assert.deepEqual([...result.pixelBytes],[...before]);
  assert.deepEqual(source.data,before);
});

test('TIFF-WK02 / explicit PPC and RGB flatten preserve white compositing without leaking hidden RGB',async()=>{
  const {self,messages}=runtime(),source=pixels(),before=source.data.slice();
  await self.onmessage({data:{id:2,method:'encode',args:[source,{format:'tiff',settings:settings({preserve_alpha:false}),
    resolution:{unit:'ppc',value:118}}]}});
  assert.equal(messages[0].error,undefined);
  const result=tiff(await messages[0].result.arrayBuffer());
  assert.equal(result.tags.get(277).value,3);
  assert.equal(result.tags.has(338),false);
  assert.equal(result.tags.get(296).value,3);
  assert.equal(result.u32(result.tags.get(282).pointer),118);
  assert.deepEqual([...result.pixelBytes],[255,255,255,20,40,60]);
  assert.deepEqual(source.data,before);
});

test('TIFF-WK03 / TIFF16, unsupported color space/compression/metadata, and meaningless quality fail closed',async()=>{
  for(const [options,error] of [
    [{format:'tiff',settings:settings({bit_depth:16})},'UNSUPPORTED_WEB_EXPORT_SETTINGS'],
    [{format:'tiff',settings:settings({color_space:'adobeRGB'})},'UNSUPPORTED_WEB_EXPORT_SETTINGS'],
    [{format:'tiff',settings:settings({tiff_compression:'lzw'})},'UNSUPPORTED_WEB_EXPORT_SETTINGS'],
    [{format:'tiff',settings:settings({metadata:'preserve'})},'UNSUPPORTED_WEB_EXPORT_SETTINGS'],
    [{format:'tiff',quality:.8},'TIFF_QUALITY_UNSUPPORTED'],
    [{format:'tiff',resolution:{unit:'ppi',value:0}},'EXPORT_RESOLUTION_SETTINGS_INVALID']
  ]){
    const {self,messages}=runtime();
    await self.onmessage({data:{id:3,method:'encode',args:[pixels(),options]}});
    assert.equal(messages.length,1);
    assert.equal(messages[0].result,undefined);
    assert.equal(messages[0].error?.message,error);
  }
});

test('TIFF-WK04 / direct abort rejects without changing source, JPEG and PNG omitted-resolution Blob path stays unchanged',async()=>{
  const source=pixels(),before=source.data.slice(),controller=new AbortController();controller.abort();
  await assert.rejects(encode(source,{format:'tiff',signal:controller.signal}),{name:'AbortError'});
  assert.deepEqual(source.data,before);
  const previous=globalThis.OffscreenCanvas,previousImageData=globalThis.ImageData;
  class ImageData{constructor(data){this.data=data;}}
  class OffscreenCanvas{getContext(){return {putImageData(){}};}async convertToBlob({type}){
    return new Blob([new Uint8Array(type==='image/jpeg'?[1,2,3]:[4,5,6])],{type});}}
  globalThis.ImageData=ImageData;globalThis.OffscreenCanvas=OffscreenCanvas;
  try{
    for(const [format,want] of [['jpeg',[1,2,3]],['png',[4,5,6]]]){
      const blob=await encode(source,{format});
      assert.equal(blob.type,`image/${format}`);
      assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],want);
    }
  }finally{
    if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;
    if(previousImageData===undefined)delete globalThis.ImageData;else globalThis.ImageData=previousImageData;
  }
  assert.deepEqual(source.data,before);
});
