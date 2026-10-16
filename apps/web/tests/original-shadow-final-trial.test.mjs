import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {createProcessing} from '../src/processing/index.mjs';
import {ORIGINAL_SHADOW_VERSION} from '../src/processing/original-shadow.mjs';
import {ADD_SHADOW_VERSION} from '../src/processing/add-shadow.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const baseRecipe=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,
  saturation:1,rotationDegrees:0,extendedParameters:{},
  processingOrder:['exposure','contrast','saturation','rotation']}});
const stroke=(u,v)=>({operation:'ADD',path:[{u,v}],
  radiusFraction:.12,hardness:1});
const frame=(level,width=40,height=20)=>({width,height,
  data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>
    i%4===3?255:level)});
const at=(data,width,x,y)=>data[(y*width+x)*4];

const workerBundle=await build({entryPoints:[fileURLToPath(new URL(
  '../src/processing/worker.mjs',import.meta.url))],bundle:true,
  format:'iife',platform:'browser',target:'es2022',external:['module'],
  write:false,logLevel:'silent'});
function realPixelWorkerBridge(calls){
  const messages=[];
  const self={postMessage(message){messages.push(message);}};
  const realm=createContext({self,Uint8Array,Uint8ClampedArray,ArrayBuffer,
    DataView,DOMException,TextEncoder,Blob,URL,structuredClone,
    crypto:webcrypto,setTimeout,clearTimeout,fetch,console});
  runInContext(workerBundle.outputFiles[0].text,realm);
  return class BridgeWorker{
    postMessage(message){
      calls.push(message.method);
      queueMicrotask(async()=>{
        try{
          const json=JSON.stringify(message,(_,value)=>
            value instanceof Uint8ClampedArray?{__typed:'clamped',data:[...value]}:
            value instanceof Uint8Array?{__typed:'bytes',data:[...value]}:value);
          realm.payloadJSON=json;
          const incoming=runInContext(`JSON.parse(payloadJSON,(_,value)=>
            value?.__typed==='clamped'?new Uint8ClampedArray(value.data):
            value?.__typed==='bytes'?new Uint8Array(value.data):value)`,realm);
          messages.length=0;
          await self.onmessage({data:incoming});
          this.onmessage({data:messages[0]});
        }catch(error){this.onerror({message:error.message});}
      });
    }
    terminate(){}
  };
}

async function fixture({backgroundWidth=40}={}){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-original-shadow-final-'));
  const context=await createTrialServer({dataDir,port:0,
    clock:()=>Date.parse('2026-10-03T08:00:00.000Z')});
  await new Promise((done,reject)=>{context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);});
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  const author=context.auth.createAuthor({authorName:'Shadow Final owner',
    trialEndsAt:'2026-11-03T08:00:00.000Z'});
  const invite=context.auth.issueInvite(author.id);
  const login=await fetch(baseURL+'/trial/login',{method:'POST',
    headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
    body:JSON.stringify({inviteToken:invite.inviteToken})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie,/^suite_trial=/);
  const api=new TrialClient({baseURL,fetcher:(url,init)=>fetch(url,
    {...init,headers:{...init.headers,Cookie:cookie}})});
  async function asset(label){
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_ORIGINAL_SHADOW_FINAL_${label}`);
    const created=await api.createAsset({name:`${label}.nonraw`,
      sha256:sha(bytes),size:bytes.length});
    await api.putOriginal(created.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    return {...created,bytes};
  }
  const target=await asset('target'),backdrop=await asset('backdrop');
  const document={schemaVersion:1,engineVersion:ORIGINAL_SHADOW_VERSION,
    source:'owner-manual-input-unverified',binding:{assetID:target.id,
      originalSHA256:target.sha256,sourceWidth:40,sourceHeight:20,
      backdropID:backdrop.id,backdropSHA256:backdrop.sha256},
    subjectStrokes:[stroke(.25,.5)],shadowStrokes:[stroke(.75,.5)],
    settings:{opacity:100}};
  await api.saveRecipe(target.id,0,baseRecipe());
  const recipe=baseRecipe();
  recipe.parameters.extendedParameters.originalShadowManual=document;
  const saved=await api.saveRecipe(target.id,1,recipe);
  const workerCalls=[],priorWorker=globalThis.Worker;
  globalThis.Worker=realPixelWorkerBridge(workerCalls);
  const processing=createProcessing();
  processing.syntheticTestOnly=true;
  const decodeCalls=[];
  processing.decodeRaw=async (buffer,{mode,signal}={})=>{
    if(signal?.aborted)throw Error('EXPORT_ABORTED');
    const sourceSHA256=sha(Buffer.from(buffer));
    decodeCalls.push(sourceSHA256);
    const pixels=sourceSHA256===target.sha256?frame(40):
      sourceSHA256===backdrop.sha256?frame(180,backgroundWidth):null;
    if(!pixels)throw Error('UNKNOWN_SYNTHETIC_ORIGINAL');
    return {pixels,provenance:{sourceSHA256,
      sourceRepresentation:'synthetic-nonraw-test',mode}};
  };
  let encoded=0;
  processing.encode=async(pixels,{format}={})=>{
    encoded++;
    return new Blob([pixels.data],{type:`image/${format}`});
  };
  const session=new EditorSession({api,processing,
    urlAPI:{createObjectURL:()=>{throw Error('UNEXPECTED_URL');},
      revokeObjectURL(){}}});
  session.proxy=frame(40);session.history=[saved.body];session.cursor=0;
  session.data={...session.data,asset:target,assets:[target,backdrop],
    recipe:saved.body,revision:saved.revision,dirty:false};
  return {context,author,api,target,backdrop,document,saved,session,processing,
    workerCalls,decodeCalls,get encoded(){return encoded;},
    async close(){
      processing.dispose();globalThis.Worker=priorWorker;
      await new Promise((done,reject)=>context.server.close(error=>
        error?reject(error):done()));
      const path=resolve(dataDir),base=resolve(tmpdir())+sep;
      if(!path.startsWith(base)||
          !path.split(sep).at(-1).startsWith('suite-original-shadow-final-'))
        throw Error('UNSAFE_TEST_CLEANUP');
      await rm(path,{recursive:true,force:true});
    }};
}

test('ORIGINAL-SHADOW-FINAL-01 / TRIAL_SQLITE_SYNTHETIC_NON_RAW: same-size decoded backdrop, manual Worker then normal Final, immutable Originals',async()=>{
  const f=await fixture();
  try{
    const output=await f.session.exportFinal({format:'png'});
    assert.equal(output.type,'image/png');
    const pixels=new Uint8Array(await output.arrayBuffer());
    assert.equal(pixels.length,40*20*4);
    assert.deepEqual(f.workerCalls,['applyBoundOriginalShadowManual','render']);
    assert.deepEqual(f.decodeCalls,[f.target.sha256,f.backdrop.sha256]);
    assert.equal(at(pixels,40,0,0),180);
    assert.ok(at(pixels,40,30,10)<180);
    assert.equal(f.encoded,1);
    assert.equal((await f.api.getRecipe(f.target.id)).revision,2);
    for(const asset of [f.target,f.backdrop]){
      const registered=f.context.repo.get(asset.tenantId,asset.id);
      const current=await f.context.storage.inspect(registered.originalKey);
      assert.equal(current.sha256,asset.sha256);
    }
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-FINAL-02 / TRIAL_SQLITE_SYNTHETIC_NON_RAW: dimension, decode provenance and revocation fail before Final publication',async()=>{
  const different=await fixture({backgroundWidth:39});
  try{
    await assert.rejects(different.session.exportFinal({format:'png'}),
      /ORIGINAL_SHADOW_FINAL_BACKDROP_DIMENSIONS_UNSUPPORTED/u);
    assert.equal(different.encoded,0);
    assert.deepEqual(different.workerCalls,[]);
  }finally{await different.close();}
  const forged=await fixture();
  try{
    const original=forged.processing.decodeRaw;
    forged.processing.decodeRaw=async(...args)=>{
      const result=await original(...args);
      if(result.provenance.sourceSHA256===forged.backdrop.sha256)
        result.provenance.sourceSHA256='a'.repeat(64);
      return result;
    };
    await assert.rejects(forged.session.exportFinal({format:'png'}),
      /ORIGINAL_SHADOW_FINAL_DECODE_PROVENANCE_REQUIRED/u);
    assert.equal(forged.encoded,0);
  }finally{await forged.close();}
  const revoked=await fixture();
  try{
    revoked.context.auth.revokeAuthor(revoked.author.id);
    await assert.rejects(revoked.session.exportFinal({format:'png'}),
      /TRIAL_REVOKED/u);
    assert.equal(revoked.encoded,0);
  }finally{await revoked.close();}
});

test('ORIGINAL-SHADOW-FINAL-03 / TRIAL_SQLITE_SYNTHETIC_NON_RAW: backdrop deletion after encode withholds Blob',async()=>{
  const f=await fixture();
  try{
    const encode=f.processing.encode;
    f.processing.encode=async(...args)=>{
      const blob=await encode(...args);
      f.context.repo.trash(f.backdrop.tenantId,f.backdrop.id);
      return blob;
    };
    await assert.rejects(f.session.exportFinal({format:'png'}),
      /ORIGINAL_SHADOW_FINAL_ASSET_CHANGED|INVALID_ORIGINAL_SHADOW_MANUAL_BACKDROP/u);
    assert.equal(f.encoded,1,'an encoded but unverified Blob was never returned');
    assert.equal(f.session.state.evidence.some(item=>
      item.test_id==='WEB_FINAL_EXPORT'&&item.status==='PASS_PIPELINE_ONLY'),false);
    assert.equal(f.context.repo.db.prepare(
      'SELECT MAX(revision) AS revision FROM recipes WHERE asset_id=?')
      .get(f.target.id).revision,2);
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-FINAL-04 / TRIAL_SQLITE_SYNTHETIC_NON_RAW: stale CAS, missing Worker and cancel do not publish',async()=>{
  const changed=await fixture();
  try{
    const encode=changed.processing.encode;
    changed.processing.encode=async(...args)=>{
      const blob=await encode(...args);
      await changed.api.saveRecipe(changed.target.id,2,baseRecipe());
      return blob;
    };
    await assert.rejects(changed.session.exportFinal({format:'png'}),
      /EXPORT_FIXED_RECIPE_MISMATCH/u);
    assert.equal(changed.encoded,1);
  }finally{await changed.close();}
  const missing=await fixture();
  try{
    missing.processing.applyBoundOriginalShadowManual=undefined;
    await assert.rejects(missing.session.exportFinal({format:'png'}),
      /ORIGINAL_SHADOW_FINAL_WORKER_REQUIRED/u);
    assert.equal(missing.encoded,0);
  }finally{await missing.close();}
  const cancelled=await fixture();
  try{
    let entered,release;
    const reached=new Promise(resolve=>{entered=resolve;});
    const gate=new Promise(resolve=>{release=resolve;});
    const worker=cancelled.processing.applyBoundOriginalShadowManual;
    cancelled.processing.applyBoundOriginalShadowManual=async(...args)=>{
      entered();await gate;return worker(...args);
    };
    const pending=cancelled.session.exportFinal({format:'png'});
    await reached;
    cancelled.session.cancelExport();release();
    await assert.rejects(pending,/EXPORT_ABORTED|AbortError|cancelled/u);
    assert.equal(cancelled.encoded,0);
  }finally{await cancelled.close();}
});

test('ORIGINAL-SHADOW-FINAL-05 / TRIAL_SQLITE_SYNTHETIC_NON_RAW: undefined Add Shadow coexistence is rejected before pixels',async()=>{
  const f=await fixture();
  try{
    const combined=structuredClone(f.saved.body),binding=f.document.binding;
    combined.parameters.extendedParameters.addShadowManual={schemaVersion:1,
      engineVersion:ADD_SHADOW_VERSION,binding:{...binding},
      subjectStrokes:[stroke(.25,.5)],settings:{mode:'soft',opacity:70,
        blur:6,gradient:20,blend:'normal',offsetX:2,offsetY:3,
        shadowColor:[10,20,30]}};
    const saved=await f.api.saveRecipe(f.target.id,2,combined);
    f.session.data.recipe=saved.body;f.session.data.revision=saved.revision;
    await assert.rejects(f.session.exportFinal({format:'png'}),
      /ORIGINAL_SHADOW_FINAL_ADD_SHADOW_UNDEFINED/u);
    assert.deepEqual(f.workerCalls,[]);
    assert.equal(f.encoded,0);
    assert.equal((await f.api.getRecipe(f.target.id)).revision,3);
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-FINAL-06 / TRIAL_SQLITE_SYNTHETIC_NON_RAW: ordinary openAsset Preview reaches separately verified Worker path',async()=>{
  const f=await fixture();
  try{
    const {makeProxyPixels}=await import('../src/processing/pure.mjs');
    f.processing.makeProxy=async(pixels,maxEdge)=>makeProxyPixels(pixels,maxEdge);
    f.processing.encode=async(pixels,{format}={})=>
      new Blob([pixels.data],{type:`image/${format}`});
    const urls=new Map();let serial=0;
    const fresh=new EditorSession({api:f.api,processing:f.processing,
      urlAPI:{createObjectURL(blob){const url=`blob:shadow-final-${++serial}`;
        urls.set(url,blob);return url;},revokeObjectURL(url){urls.delete(url);}}});
    await fresh.initialize();
    await fresh.openAsset(f.target.id);
    assert.ok(urls.has(fresh.state.beforeURL));
    assert.ok(urls.has(fresh.state.afterURL));
    assert.equal(fresh.state.shadowVerification,'verified');
    assert.equal(f.workerCalls.includes('applyBoundOriginalShadowManual'),true);
  }finally{await f.close();}
});
