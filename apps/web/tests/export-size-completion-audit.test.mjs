import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext, runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {parseExportResolutionSelection, parseExportSizeSelection} from '../src/editor-ui.mjs';
import {planExportDimensions} from '../src/export-size.mjs';

const source=()=>{
  const data=new Uint8ClampedArray(120*80*4);
  for(let index=0;index<data.length;index+=4){data[index]=40;data[index+1]=110;data[index+2]=180;data[index+3]=255;}
  return {width:120,height:80,data};
};
const cases=[
  ['percentage',{kind:'percentage',value:50},60,40],
  ['width',{kind:'width',value:60},60,40],
  ['height',{kind:'height',value:40},60,40],
  ['dimensions',{kind:'dimensions',width:58,height:33},50,33],
  ['long-edge',{kind:'long-edge',value:60},60,40],
  ['short-edge',{kind:'short-edge',value:40},60,40]
];

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
async function call(worker,method,args){
  const id=worker.messages.length+1;
  await worker.self.onmessage({data:{id,method,args}});
  const response=worker.messages.at(-1);
  assert.equal(response?.id,id);
  assert.equal(response?.error,undefined,response?.error?.message);
  return response.result;
}
function tiffFacts(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  assert.equal(bytes[0],73);assert.equal(bytes[1],73);assert.equal(view.getUint16(2,true),42);
  const at=view.getUint32(4,true),count=view.getUint16(at,true),fields=new Map();
  for(let index=0;index<count;index++){
    const entry=at+2+index*12;
    fields.set(view.getUint16(entry,true),{type:view.getUint16(entry+2,true),count:view.getUint32(entry+4,true),value:view.getUint32(entry+8,true)});
  }
  const scalar=tag=>{
    const field=fields.get(tag);assert.ok(field,`missing TIFF tag ${tag}`);
    return field.type===3?field.value&0xffff:field.value;
  };
  const rational=tag=>{
    const field=fields.get(tag);assert.equal(field?.type,5);
    return [view.getUint32(field.value,true),view.getUint32(field.value+4,true)];
  };
  return {width:scalar(256),height:scalar(257),unit:scalar(296),x:rational(282),y:rational(283)};
}

test('EXPORT-SIZE-AUDIT-01 / all six pixel-size entries reach distinct typed UI options',()=>{
  for(const [kind,setting,width,height] of cases){
    const fields=kind==='dimensions'?{width:'58',height:'33'}:{value:String(setting.value)};
    assert.deepEqual(parseExportSizeSelection(kind,fields),setting);
    const plan=planExportDimensions(source(),setting);
    assert.deepEqual([plan.width,plan.height],[width,height],kind);
  }
  assert.deepEqual(parseExportResolutionSelection('ppi','300'),{unit:'ppi',value:300});
  assert.deepEqual(parseExportResolutionSelection('ppc','118'),{unit:'ppc',value:118});
});

test('EXPORT-SIZE-AUDIT-02 / bundled Worker TIFF pixels and PPI/PPC tags cover all six size modes',async()=>{
  const worker=runtime(),input=source(),before=input.data.slice();
  for(const [kind,setting,width,height] of cases){
    const resized=await call(worker,'resizeForExport',[input,setting]);
    assert.deepEqual([resized.width,resized.height],[width,height],kind);
    for(const resolution of [{unit:'ppi',value:300},{unit:'ppc',value:118}]){
      const blob=await call(worker,'encode',[resized,{format:'tiff',resolution}]);
      assert.equal(blob.type,'image/tiff');assert.ok(blob.size>0);
      const actual=tiffFacts(new Uint8Array(await blob.arrayBuffer()));
      assert.deepEqual([actual.width,actual.height],[width,height],`${kind}/${resolution.unit}`);
      assert.equal(actual.unit,resolution.unit==='ppi'?2:3);
      assert.deepEqual(actual.x,[resolution.value,1]);assert.deepEqual(actual.y,[resolution.value,1]);
    }
  }
  assert.deepEqual(input.data,before,'Original RGBA must remain unchanged');
});

test('EXPORT-SIZE-AUDIT-03 / Dimensions is a shrink-only bounding box, not exact W × H',()=>{
  assert.deepEqual(parseExportSizeSelection('dimensions',{width:'58',height:'33'}),
    {kind:'dimensions',width:58,height:33});
  const result=planExportDimensions(source(),{kind:'dimensions',width:58,height:33});
  assert.deepEqual([result.width,result.height],[50,33]);
  assert.notDeepEqual([result.width,result.height],[58,33]);
  assert.throws(()=>planExportDimensions(source(),{kind:'width',value:121}),/EXPORT_SIZE_WIDTH_INVALID/);
  assert.throws(()=>planExportDimensions(source(),{kind:'height',value:81}),/EXPORT_SIZE_HEIGHT_INVALID/);
});
