// Real SuiteFaceCore C ABI only. Host supplies an already-loaded Emscripten
// wasm32 module and pinned models; this adapter never fetches or guesses models.
const fail=code=>{throw Error(`LOCAL_FACE_${code}`);};
export async function createLocalFaceWasmBridge(module,{yunet,sface,maxPixels=2_560_000,scoreThreshold=.9,nmsThreshold=.3,topK=500,heapBudget=512*1024*1024}={}){
  if(!module?.FS||!(module.HEAPU8 instanceof Uint8Array)||
    ['malloc','free','sf_create','sf_analyze','sf_result_count','sf_result_face','sf_result_feature','sf_result_destroy','sf_destroy'].some(n=>typeof module[`_${n}`]!=='function'))fail('RUNTIME_NOT_READY');
  if(!Number.isSafeInteger(maxPixels)||maxPixels<1||maxPixels>2_560_000||!Number.isSafeInteger(heapBudget)||heapBudget<16*1024*1024||heapBudget>1024*1024*1024||![scoreThreshold,nmsThreshold].every(x=>Number.isFinite(x)&&x>0&&x<1)||!Number.isInteger(topK)||topK<1||topK>500)fail('CONFIG');
  const modelSHA256=sface?.sha256;
  const checked=async asset=>{
    if(!(asset?.bytes instanceof Uint8Array)||!Number.isSafeInteger(asset.byteCount)||asset.byteCount<1||asset.byteCount>64*1024*1024||asset.bytes.length!==asset.byteCount||!/^[a-f0-9]{64}$/.test(asset.sha256??''))fail('MODEL_NOT_READY');
    const expected=asset.sha256,copy=asset.bytes.slice(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',copy)),b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==expected)fail('MODEL_INTEGRITY');return copy;
  };
  // Both inputs are copied before the first digest yields, so callers cannot
  // swap the second model while the first model is being verified.
  const [a,b]=await Promise.all([checked(yunet),checked(sface)]);let context=0,closed=false,busy=false;
  const dir=`/suite-face-${crypto.randomUUID()}`,paths=[`${dir}/yunet.onnx`,`${dir}/sface.onnx`];
  const allocations=[];
  const budget=()=>{if(module.HEAPU8.byteLength>heapBudget)fail('HEAP_BUDGET');};
  const alloc=n=>{budget();const p=module._malloc(n);if(!p)fail('MEMORY');allocations.push(p);budget();return p;};
  const clear=()=>{while(allocations.length)module._free(allocations.pop());};
  const string=text=>{const bytes=new TextEncoder().encode(text+'\0'),p=alloc(bytes.length);module.HEAPU8.set(bytes,p);return p;};
  const u32=p=>new DataView(module.HEAPU8.buffer).getUint32(p,true);
  const cleanup=()=>{if(context){module._sf_destroy(context);context=0;}clear();for(const p of paths){try{module.FS.unlink(p);}catch{}}try{module.FS.rmdir(dir);}catch{}};
  try{
    module.FS.mkdir(dir);module.FS.writeFile(paths[0],a);module.FS.writeFile(paths[1],b);
    const pa=string(paths[0]),pb=string(paths[1]),out=alloc(4);module.HEAPU8.fill(0,out,out+4);
    // Build contract requires WASM_BIGINT=1 for uint64_t max_pixels.
    const status=module._sf_create(pa,pb,scoreThreshold,nmsThreshold,topK,BigInt(maxPixels),out);
    context=u32(out);if(status!==0||!context)fail('MODEL_LOAD');budget();clear();
  }catch(error){cleanup();throw error;}finally{a.fill(0);b.fill(0);}
  return Object.freeze({
    modelSHA256,
    analyze({bgr,width,height,stride}){
      if(closed||busy)fail('UNAVAILABLE');
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>maxPixels||stride!==width*3||!(bgr instanceof Uint8Array)||bgr.length!==stride*height)fail('INPUT');
      busy=true;let result=0;
      try{
        const input=alloc(bgr.length);module.HEAPU8.set(bgr,input);const out=alloc(4);module.HEAPU8.fill(0,out,out+4);
        const status=module._sf_analyze(context,input,bgr.length,width,height,stride,out);result=u32(out);
        if(status!==0||!result)fail('INFERENCE');budget();
        const count=module._sf_result_count(result);if(!Number.isInteger(count)||count<0||count>topK)fail('OUTPUT');
        const row=alloc(60),required=alloc(4),features=alloc(4096*4),faces=[];
        for(let i=0;i<count;i++){
          if(module._sf_result_face(result,i,row)!==0||module._sf_result_feature(result,i,features,4096,required)!==0)fail('OUTPUT');
          const n=u32(required);if(n<1||n>4096)fail('OUTPUT');
          const values=new Float32Array(module.HEAPU8.buffer,row,15).slice(),embedding=new Float32Array(module.HEAPU8.buffer,features,n).slice();
          if(!values.every(Number.isFinite)||!embedding.every(Number.isFinite))fail('OUTPUT');
          faces.push({values,embedding,modelSHA256});
        }return {faces,modelSHA256};
      }finally{if(result)module._sf_result_destroy(result);clear();busy=false;}
    },
    close(){if(busy)fail('BUSY');if(!closed){closed=true;cleanup();}}
  });
}
