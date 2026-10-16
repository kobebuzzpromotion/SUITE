import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {makeManualHandToneDocument} from '../src/manual-hand-tone-ui.mjs';
import {createTrialManualHandToneHost} from
  '../src/manual-hand-tone-trial-host.mjs';
import {recipe} from './fixtures.mjs';

const NOW=Date.parse('2026-10-03T08:00:00.000Z');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const document=asset=>makeManualHandToneDocument(
  {assetID:asset.id,originalSHA256:asset.sha256,
    sourceWidth:40,sourceHeight:20},
  [{operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.04,hardness:.7}],
  {strength:.5,radiusSourcePixels:3});

async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-hand-host-'));
  let clock=NOW;
  const service=await createTrialServer({dataDir,port:0,clock:()=>clock});
  await new Promise((done,reject)=>{
    service.server.once('error',reject);
    service.server.listen(0,'127.0.0.1',done);
  });
  const baseURL=`http://127.0.0.1:${service.server.address().port}`;
  async function login(name){
    const author=service.auth.createAuthor({authorName:name,
      trialEndsAt:'2026-11-03T08:00:00.000Z'});
    const invite=service.auth.issueInvite(author.id);
    const response=await fetch(baseURL+'/trial/login',{method:'POST',
      headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:invite.inviteToken})});
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie')?.split(';')[0];
    let intercept;
    const api=new TrialClient({baseURL,fetcher:(url,init)=>{
      const request={...init,headers:{...init.headers,Cookie:cookie}};
      return intercept?intercept(url,request,()=>fetch(url,request)):
        fetch(url,request);
    }});
    return {author,api,intercept(fn){intercept=fn;}};
  }
  async function asset(api,label){
    const bytes=Buffer.from(png);
    const item=await api.createAsset({name:label+'.png',
      sha256:sha(bytes),size:bytes.length});
    await api.putOriginal(item.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    const saved=await api.saveRecipe(item.id,0,recipe());
    return {...item,sha256:sha(bytes),revision:saved.revision,bytes};
  }
  function editor(api,item){
    const session=new EditorSession({api,processing:{},storage:{}});
    session.data.asset=item;session.data.revision=item.revision;
    session.data.recipe=recipe();session.proxy={width:40,height:20,
      data:new Uint8ClampedArray(40*20*4)};
    const display={view:'after',ready:true,permissionExpired:false};
    const host=createTrialManualHandToneHost({api,session,assetID:item.id,
      getEditorView:()=>display});
    return {session,display,host};
  }
  return {service,login,asset,editor,advance(ms){clock+=ms;},
    async cleanup(){
      await new Promise((done,reject)=>service.server.close(error=>
        error?reject(error):done()));
      const target=resolve(dataDir),base=resolve(tmpdir())+sep;
      if(!target.startsWith(base)||
          !target.split(sep).at(-1).startsWith('suite-hand-host-'))
        throw Error('HAND_HOST_TEST_CLEANUP_INVALID');
      await rm(target,{recursive:true,force:true});
    }};
}

// Browser Worker mechanics are adapted to Node's VM, but the decoded result
// comes from the actual bundled processing/worker.mjs and raw.mjs. This test
// can establish rejection of non-RAW, never successful real-RAW provenance.
const bundle=await build({entryPoints:[fileURLToPath(new URL(
  '../src/processing/worker.mjs',import.meta.url))],bundle:true,
  format:'iife',platform:'browser',target:'es2022',write:false,
  external:['module'],logLevel:'silent'});
function actualWorkerForNode(){
  const previous=globalThis.Worker;
  globalThis.Worker=class{
    constructor(){
      this.messages=[];
      const self={postMessage:message=>this.messages.push(message)};
      this.realm=createContext({self,Uint8Array,Uint8ClampedArray,
        ArrayBuffer,DataView,DOMException,TextEncoder,TextDecoder,Blob,URL,
        structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout,
        fetch,console});
      runInContext(bundle.outputFiles[0].text,this.realm);
    }
    postMessage(data){
      Promise.resolve(this.realm.self.onmessage({data})).then(()=>{
        const answer=this.messages.shift();
        if(answer)this.onmessage?.({data:answer});
      },error=>this.onerror?.(error));
    }
    terminate(){}
  };
  return ()=>{if(previous===undefined)delete globalThis.Worker;
    else globalThis.Worker=previous;};
}

test('HAND-HOST-HTTP01 real Trial/SQLite and bundled Worker reject non-RAW before Recipe write',async()=>{
  const restore=actualWorkerForNode(),f=await fixture();
  try{
    const owner=await f.login('Owner'),item=await f.asset(owner.api,'nonraw');
    const {host,session}=f.editor(owner.api,item);
    let injectedDecoderCalled=0;
    session.processing.decodeRaw=async()=>{
      injectedDecoderCalled++;
      return {pixels:{width:40,height:20,
        data:new Uint8ClampedArray(40*20*4)},provenance:{
          sourceRepresentation:'original-camera-raw',sourceSHA256:item.sha256,
          mode:'final',thumbnailFallback:false}};
    };
    await assert.rejects(host.refresh(),/NOT_CAMERA_RAW/);
    assert.equal(injectedDecoderCalled,0,'session/caller decoder is not authority');
    assert.throws(()=>host.getContext(),/HAND_HOST_REFRESH_REQUIRED/);
    await assert.rejects(host.onSubmit(document(item),
      {savedRevision:1,signal:new AbortController().signal}),
    /HAND_HOST_REFRESH_REQUIRED/);
    assert.equal((await owner.api.getRecipe(item.id)).revision,1);
    assert.deepEqual(Buffer.from(await owner.api.getOriginal(item.id)),item.bytes);
    host.dispose();
  }finally{restore();await f.cleanup();}
});

test('HAND-HOST-HTTP02 foreign tenant, changed bytes and revoked session cannot reach Worker save',async()=>{
  const f=await fixture();
  try{
    const owner=await f.login('Owner'),other=await f.login('Other');
    const item=await f.asset(owner.api,'scope');
    const foreign=f.editor(other.api,item);
    await assert.rejects(foreign.host.refresh(),/HAND_HOST_ASSET_UNAVAILABLE/);
    foreign.host.dispose();
    const ownerEditor=f.editor(owner.api,item);
    owner.intercept((url,_init,next)=>url.includes('/original?')?
      new Response(Buffer.alloc(item.bytes.length,66),{status:200}):next());
    await assert.rejects(ownerEditor.host.refresh(),/HAND_HOST_ORIGINAL_CHANGED/);
    owner.intercept(undefined);
    await assert.rejects(ownerEditor.host.refresh({signal:AbortSignal.abort()}),
      {name:'AbortError'});
    f.service.auth.revokeAuthor(owner.author.id);
    await assert.rejects(ownerEditor.host.refresh(),/TRIAL_REVOKED/);
    assert.equal(ownerEditor.session.state.revision,1);
    ownerEditor.host.dispose();
  }finally{await f.cleanup();}
});

test('HAND-HOST-HTTP03 wrong session/client and forged document cannot become authority',async()=>{
  const f=await fixture();
  try{
    const owner=await f.login('Owner'),item=await f.asset(owner.api,'init');
    const {session,host}=f.editor(owner.api,item);
    assert.throws(()=>createTrialManualHandToneHost({api:new TrialClient({
      baseURL:'http://127.0.0.1:1'}),session,assetID:item.id,
      getEditorView:()=>({view:'after',ready:true})}),/HAND_HOST_INIT_INVALID/);
    const forged=document(item);forged.binding.assetID=crypto.randomUUID();
    await assert.rejects(host.onSubmit(forged,
      {savedRevision:1,signal:new AbortController().signal}),
    /HAND_HOST_REFRESH_REQUIRED/);
    assert.equal((await owner.api.getRecipe(item.id)).revision,1);
    host.dispose();
  }finally{await f.cleanup();}
});

test('HAND-HOST-HTTP04 browser bundle of independent Trial host builds',async()=>{
  const entry=fileURLToPath(new URL('../src/manual-hand-tone-trial-host.mjs',
    import.meta.url));
  const result=await build({entryPoints:[entry],bundle:true,write:false,
    platform:'browser',format:'esm',external:['module']});
  assert.ok(result.outputFiles[0].contents.length>0);
});
