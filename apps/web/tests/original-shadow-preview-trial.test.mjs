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
import {makeProxyPixels} from '../src/processing/pure.mjs';
import {ORIGINAL_SHADOW_VERSION} from '../src/processing/original-shadow.mjs';
import {ADD_SHADOW_VERSION} from '../src/processing/add-shadow.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const recipe=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,
  saturation:1,rotationDegrees:0,extendedParameters:{},
  processingOrder:['exposure','contrast','saturation','rotation']}});
const stroke=(u)=>({operation:'ADD',path:[{u,v:.5}],
  radiusFraction:.12,hardness:1});
const frame=(level,width=40,height=20)=>({width,height,
  data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>
    i%4===3?255:level)});
const sample=(pixels,width,x,y)=>pixels[(y*width+x)*4];
const workerBundle=await build({entryPoints:[fileURLToPath(new URL(
  '../src/processing/worker.mjs',import.meta.url))],bundle:true,
  format:'iife',platform:'browser',target:'es2022',external:['module'],
  write:false,logLevel:'silent'});
function workerBridge(calls){
  const messages=[],self={postMessage(message){messages.push(message);}};
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
async function fixture({sourceWidth=40,sourceHeight=20,backgroundWidth=sourceWidth}={}){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-original-shadow-preview-'));
  const context=await createTrialServer({dataDir,port:0,
    clock:()=>Date.parse('2026-10-03T08:00:00.000Z')});
  await new Promise((done,reject)=>{context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);});
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  const author=context.auth.createAuthor({authorName:'Shadow Preview owner',
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
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_ORIGINAL_SHADOW_PREVIEW_${label}`);
    const created=await api.createAsset({name:`${label}.nonraw`,
      sha256:sha(bytes),size:bytes.length});
    await api.putOriginal(created.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    return {...created,bytes};
  }
  const target=await asset('target'),backdrop=await asset('backdrop');
  const document={schemaVersion:1,engineVersion:ORIGINAL_SHADOW_VERSION,
    source:'owner-manual-input-unverified',binding:{assetID:target.id,
      originalSHA256:target.sha256,sourceWidth,sourceHeight,
      backdropID:backdrop.id,backdropSHA256:backdrop.sha256},
    subjectStrokes:[stroke(.25)],shadowStrokes:[stroke(.75)],
    settings:{opacity:100}};
  await api.saveRecipe(target.id,0,recipe());
  const marked=recipe();
  marked.parameters.extendedParameters.originalShadowManual=document;
  const saved=await api.saveRecipe(target.id,1,marked);
  const calls=[],priorWorker=globalThis.Worker;
  globalThis.Worker=workerBridge(calls);
  const processing=createProcessing();processing.syntheticTestOnly=true;
  // The Worker shadow operation is real; the Node VM lacks OffscreenCanvas,
  // so use its identical pure proxy algorithm for the decode-to-proxy step.
  processing.makeProxy=async(pixels,maxEdge)=>makeProxyPixels(pixels,maxEdge);
  processing.encode=async(pixels,{format}={})=>
    new Blob([pixels.data],{type:`image/${format}`});
  const decodeCalls=[];
  processing.decodeRaw=async(buffer,{mode,signal}={})=>{
    if(signal?.aborted)throw Error('PREVIEW_ABORTED');
    const sourceSHA256=sha(Buffer.from(buffer));decodeCalls.push({sourceSHA256,mode});
    const pixels=sourceSHA256===target.sha256?
      frame(40,sourceWidth,sourceHeight):sourceSHA256===backdrop.sha256?
      frame(180,backgroundWidth,sourceHeight):null;
    if(!pixels)throw Error('UNKNOWN_SYNTHETIC_ORIGINAL');
    return {pixels,provenance:{sourceSHA256,
      sourceRepresentation:'synthetic-nonraw-test',mode}};
  };
  const urls=new Map(),revoked=[];
  let serial=0;
  const session=new EditorSession({api,processing,urlAPI:{
    createObjectURL(blob){const key=`blob:shadow-${++serial}`;urls.set(key,blob);return key;},
    revokeObjectURL(key){revoked.push(key);urls.delete(key);}}});
  await session.initialize();
  return {context,author,api,target,backdrop,saved,document,session,
    processing,calls,decodeCalls,urls,revoked,
    async close(){processing.dispose();globalThis.Worker=priorWorker;
      await new Promise((done,reject)=>context.server.close(error=>
        error?reject(error):done()));
      const path=resolve(dataDir),base=resolve(tmpdir())+sep;
      if(!path.startsWith(base)||
          !path.split(sep).at(-1).startsWith('suite-original-shadow-preview-'))
        throw Error('UNSAFE_TEST_CLEANUP');
      await rm(path,{recursive:true,force:true});}};
}

test('ORIGINAL-SHADOW-PREVIEW-01 / Trial SQLite synthetic nonRAW: openAsset verifies two Originals before Worker Proxy and immutable Before',async()=>{
  const f=await fixture();
  try{
    await f.session.openAsset(f.target.id);
    const state=f.session.state;
    assert.equal(state.shadowVerification,'verified');
    assert.ok(state.beforeURL&&state.afterURL);
    assert.deepEqual(f.decodeCalls,[{sourceSHA256:f.target.sha256,mode:'proxy'},
      {sourceSHA256:f.backdrop.sha256,mode:'proxy'}]);
    assert.equal(f.calls.filter(item=>item==='applyBoundOriginalShadowManual').length,1);
    const before=new Uint8Array(await f.urls.get(state.beforeURL).arrayBuffer());
    const after=new Uint8Array(await f.urls.get(state.afterURL).arrayBuffer());
    assert.equal(sample(before,40,0,0),40);
    assert.equal(sample(after,40,0,0),180);
    assert.ok(sample(after,40,30,10)<180);
    assert.equal((await f.api.getRecipe(f.target.id)).revision,2);
    for(const asset of [f.target,f.backdrop]){
      const registered=f.context.repo.get(asset.tenantId,asset.id);
      assert.equal((await f.context.storage.inspect(registered.originalKey)).sha256,
        asset.sha256);
    }
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-PREVIEW-02 / dimension, forged decode, revocation and CAS fail closed without Ready',async()=>{
  const cases=[
    {options:{backgroundWidth:39},change:()=>{},match:/BACKDROP_DIMENSIONS_UNSUPPORTED/u},
    {change:f=>{const decode=f.processing.decodeRaw;
      f.processing.decodeRaw=async(...args)=>{const output=await decode(...args);
        if(output.provenance.sourceSHA256===f.backdrop.sha256)
          output.provenance.sourceSHA256='a'.repeat(64);
        return output;};},match:/DECODE_PROVENANCE_REQUIRED/u},
    {change:f=>f.context.auth.revokeAuthor(f.author.id),match:/TRIAL_REVOKED/u},
    {change:f=>{const decode=f.processing.decodeRaw;let changed=false;
      f.processing.decodeRaw=async(...args)=>{const result=await decode(...args);
        if(!changed){changed=true;await f.api.saveRecipe(f.target.id,2,recipe());}
        return result;};},match:/RECIPE_CHANGED|REVISION_CONFLICT/u}];
  for(const item of cases){
    const f=await fixture(item.options);
    try{
      await item.change(f);
      await assert.rejects(f.session.openAsset(f.target.id),item.match);
      assert.equal(f.session.state.afterURL,null);
      assert.equal(f.session.proxy,null);
      assert.equal(f.session.previewPixels,null);
    }finally{await f.close();}
  }
});

test('ORIGINAL-SHADOW-PREVIEW-06 / real downsampled proxy Worker representation uses saved source dimensions',async()=>{
  const f=await fixture({sourceWidth:1601,sourceHeight:2});
  try{
    await f.session.openAsset(f.target.id);
    assert.equal(f.session.proxy.width,1600);
    assert.equal(f.session.proxy.height,2);
    assert.equal(f.session.proxy.sourceWidth,1601);
    assert.equal(f.session.state.shadowVerification,'verified');
    const before=new Uint8Array(await f.urls.get(f.session.state.beforeURL).arrayBuffer());
    const after=new Uint8Array(await f.urls.get(f.session.state.afterURL).arrayBuffer());
    assert.equal(before.length,1600*2*4);
    assert.equal(after.length,before.length);
    assert.equal(f.calls.filter(item=>item==='applyBoundOriginalShadowManual').length,1);
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-PREVIEW-03 / asset switch and Before invalidation revoke old URL',async()=>{
  const f=await fixture();
  try{
    await f.session.openAsset(f.target.id);
    const prior=f.session.state.afterURL;
    await f.session.openAsset(f.backdrop.id);
    assert.equal(f.revoked.includes(prior),true);
    assert.equal(f.urls.has(prior),false);
    assert.equal(f.session.state.asset.id,f.backdrop.id);
    assert.equal(f.session.state.shadowVerification,null);
    assert.ok(f.session.state.afterURL);
    f.session.invalidatePreview();
    assert.equal(f.session.state.beforeURL,null);
    assert.equal(f.session.state.afterURL,null);
    assert.equal(f.session.previewPixels,null);
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-PREVIEW-04 / cancel during Worker and permission loss after encode never publish',async()=>{
  const cancelled=await fixture();
  try{
    let reached,release;
    const entered=new Promise(resolve=>{reached=resolve;});
    const gate=new Promise(resolve=>{release=resolve;});
    const apply=cancelled.processing.applyBoundOriginalShadowManual;
    cancelled.processing.applyBoundOriginalShadowManual=async(...args)=>{
      reached();await gate;return apply(...args);};
    const pending=cancelled.session.openAsset(cancelled.target.id);
    await entered;cancelled.session.invalidatePreview();release();
    await assert.rejects(pending,/ABORTED|AbortError|STALE_OPERATION/u);
    assert.equal(cancelled.session.state.afterURL,null);
    assert.equal(cancelled.session.proxy,null);
  }finally{await cancelled.close();}
  const revoked=await fixture();
  try{
    const encode=revoked.processing.encode;
    let count=0;
    revoked.processing.encode=async(...args)=>{
      const blob=await encode(...args);if(++count===1)
        revoked.context.auth.revokeAuthor(revoked.author.id);
      return blob;};
    await assert.rejects(revoked.session.openAsset(revoked.target.id),
      /TRIAL_REVOKED|ORIGINAL_SHADOW_FINAL_SESSION_CHANGED/u);
    assert.equal(revoked.session.state.afterURL,null);
    assert.equal(revoked.session.proxy,null);
    assert.equal(revoked.urls.size,0);
  }finally{await revoked.close();}
});

test('ORIGINAL-SHADOW-PREVIEW-05 / saved manual selection survives dirty exposure Undo Redo CAS save and reload',async()=>{
  const f=await fixture();
  try{
    await f.session.openAsset(f.target.id);
    const baseline=new Uint8Array(await f.urls.get(f.session.state.afterURL).arrayBuffer());
    await f.session.setAdjustment('exposure',1);
    assert.equal(f.session.state.dirty,true);
    assert.equal(f.session.state.shadowVerification,'draft');
    const edited=new Uint8Array(await f.urls.get(f.session.state.afterURL).arrayBuffer());
    assert.notDeepEqual(edited,baseline);
    await f.session.undo();
    const undone=new Uint8Array(await f.urls.get(f.session.state.afterURL).arrayBuffer());
    assert.deepEqual(undone,baseline);
    await f.session.redo();
    const redone=new Uint8Array(await f.urls.get(f.session.state.afterURL).arrayBuffer());
    assert.deepEqual(redone,edited);
    const saved=await f.session.save();
    assert.equal(saved.revision,3);
    assert.equal(f.session.state.shadowVerification,'verified');
    assert.equal(f.session.state.dirty,false);
    await f.session.reload();
    assert.equal(f.session.state.shadowVerification,'verified');
    assert.equal(f.session.state.recipe.parameters.exposure,1);
    const reloaded=new Uint8Array(await f.urls.get(f.session.state.afterURL).arrayBuffer());
    assert.deepEqual(reloaded,edited);
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-PREVIEW-07 / background deletion after Ready revokes old Before and After',async()=>{
  const f=await fixture();
  try{
    await f.session.openAsset(f.target.id);
    const prior=f.session.state.afterURL;
    f.context.repo.trash(f.backdrop.tenantId,f.backdrop.id);
    await assert.rejects(f.session.refreshPreview(),
      /ORIGINAL_SHADOW_FINAL_ASSET_CHANGED|INVALID_ORIGINAL_SHADOW_MANUAL_BACKDROP/u);
    assert.equal(f.session.state.beforeURL,null);
    assert.equal(f.session.state.afterURL,null);
    assert.equal(f.session.proxy,null);
    assert.equal(f.urls.has(prior),false);
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-PREVIEW-08 / undefined Add Shadow coexistence is blocked before pixels',async()=>{
  const f=await fixture();
  try{
    const combined=structuredClone(f.saved.body),binding=f.document.binding;
    combined.parameters.extendedParameters.addShadowManual={schemaVersion:1,
      engineVersion:ADD_SHADOW_VERSION,binding:{...binding},
      subjectStrokes:[stroke(.25)],settings:{mode:'soft',opacity:70,
        blur:6,gradient:20,blend:'normal',offsetX:2,offsetY:3,
        shadowColor:[10,20,30]}};
    await f.api.saveRecipe(f.target.id,2,combined);
    await assert.rejects(f.session.openAsset(f.target.id),
      /ORIGINAL_SHADOW_PREVIEW_ADD_SHADOW_UNDEFINED/u);
    assert.equal(f.calls.includes('applyBoundOriginalShadowManual'),false);
    assert.equal(f.session.state.afterURL,null);
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-PREVIEW-09 / CAS success followed by lost backdrop never claims verified Preview',async()=>{
  const f=await fixture();
  try{
    await f.session.openAsset(f.target.id);
    await f.session.setAdjustment('exposure',1);
    const save=f.api.saveRecipe.bind(f.api);
    f.api.saveRecipe=async(...args)=>{
      const result=await save(...args);
      f.context.repo.trash(f.backdrop.tenantId,f.backdrop.id);
      return result;
    };
    await assert.rejects(f.session.save(),
      /ORIGINAL_SHADOW_FINAL_ASSET_CHANGED|INVALID_ORIGINAL_SHADOW_MANUAL_BACKDROP/u);
    assert.equal(f.context.repo.db.prepare(
      'SELECT MAX(revision) AS revision FROM recipes WHERE asset_id=?')
      .get(f.target.id).revision,3,
      'the CAS may have succeeded; preview failure cannot be called an unsaved draft');
    assert.equal(f.session.state.afterURL,null);
    assert.notEqual(f.session.state.shadowVerification,'verified');
    assert.equal(f.session.proxy,null);
  }finally{await f.close();}
});
