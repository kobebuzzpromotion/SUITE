import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';

const bundle=await build({
  entryPoints:[fileURLToPath(new URL('../src/processing/worker.mjs',import.meta.url))],
  bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],
  write:false,logLevel:'silent',
});
const workerCode=bundle.outputFiles[0].text;

function fixture(width,height){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=(y*width+x)*4;
    data.set([x%256,y%256,7,100+(x+y)%156],index);
  }
  return {width,height,data};
}

function recipe(canvasExpand){
  return {schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,
    rotationDegrees:90,
    extendedParameters:{
      crop:{preset_id:'ratio.free',preset_name:'Free',orientation:'portrait',
        crop_rect:{x:0,y:.25,width:1,height:.5},rotation:90,custom_size:false,requested_dpi:96},
      ...(canvasExpand?{canvasExpand}:{}),
    },
    processingOrder:['exposure','contrast','saturation','rotation','crop'],
  }};
}

function loadWorker(){
  const messages=[],self={postMessage:(message)=>messages.push(message)};
  const context=createContext({self,Uint8ClampedArray,Uint8Array,ArrayBuffer,DOMException,
    TextEncoder,TextDecoder,Blob,URL,structuredClone,crypto:globalThis.crypto,
    setTimeout,clearTimeout,fetch,console});
  runInContext(workerCode,context);
  return {self,messages,context};
}

async function render(input,body,id=1){
  const {self,messages,context}=loadWorker();
  context.recipeJSON=JSON.stringify(body);
  const workerRecipe=runInContext('JSON.parse(recipeJSON)',context);
  await self.onmessage({data:{id,method:'render',args:[input,workerRecipe,{detections:[]}]}});
  assert.equal(messages.length,1);
  assert.equal(messages[0].id,id);
  if(messages[0].error)throw Error(`${messages[0].error.name}: ${messages[0].error.message}`);
  return messages[0].result;
}

test('CANVAS-RENDER-WK-01: actual Worker render expands AFTER rotation and Crop',async()=>{
  const source=fixture(4,2),before=source.data.slice();
  const expansion={schemaVersion:1,margins:{left:.5,right:.5,top:.5,bottom:.5},background:[9,10,11,0]};
  const output=await render(source,recipe(expansion));
  assert.deepEqual([output.width,output.height],[4,4]);
  assert.deepEqual(Array.from(output.data.slice(0,4)),[9,10,11,0]);
  // Crop selects the middle two rows of the rotated frame. Its first pixel
  // corresponds to upright source (x=2,y=0), then one margin pixel is added.
  assert.deepEqual(Array.from(output.data.slice((1*4+1)*4,(1*4+2)*4)),[2,0,7,102]);
  assert.deepEqual(Array.from(source.data),Array.from(before));
  assert.deepEqual(Array.from(output.provenance.processingOrder).slice(-2),['canvasExpand(post-crop)','encode']);
  assert.deepEqual(recipe(expansion).parameters.processingOrder,['exposure','contrast','saturation','rotation','crop']);
});

test('CANVAS-RENDER-WK-02: Proxy and Final use their own post-Crop sizes',async()=>{
  const expansion={schemaVersion:1,margins:{left:.5,right:.5,top:.5,bottom:.5}};
  const proxy=await render(fixture(4,2),recipe(expansion),2);
  const final=await render(fixture(40,20),recipe(expansion),3);
  assert.deepEqual([proxy.width,proxy.height],[4,4]);
  assert.deepEqual([final.width,final.height],[40,40]);
  assert.equal(proxy.width/proxy.height,final.width/final.height);
  assert.deepEqual(Array.from(final.data.slice(0,4)),[0,0,0,0]);
});

test('CANVAS-RENDER-WK-03: absent extension keeps old rendered pixels and provenance',async()=>{
  const output=await render(fixture(4,2),recipe(),4);
  assert.deepEqual([output.width,output.height],[2,2]);
  assert.equal(output.provenance.processingOrder.includes('canvasExpand(post-crop)'),false);
});

test('CANVAS-RENDER-WK-04: oversized expansion fails closed inside the Worker',async()=>{
  const expansion={schemaVersion:1,margins:{left:.1,right:0,top:0,bottom:0}};
  const body={schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:0,
    extendedParameters:{canvasExpand:expansion},processingOrder:['exposure','contrast','saturation','rotation']}};
  const source=fixture(16_000,1),{self,messages,context}=loadWorker();
  context.recipeJSON=JSON.stringify(body);
  const workerRecipe=runInContext('JSON.parse(recipeJSON)',context);
  await self.onmessage({data:{id:5,method:'render',args:[source,workerRecipe,{detections:[]}]}});
  assert.equal(messages.length,1);
  assert.equal(messages[0].result,undefined);
  assert.equal(messages[0].error?.message,'CANVAS_SIZE_LIMIT');
});
