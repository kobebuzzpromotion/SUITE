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
import {EditorSession,neutralRecipe} from '../src/session.mjs';
import {createTrialManualEyelinerHost} from
  '../src/manual-eyeliner-trial-host.mjs';
import {makeManualEyelinerDocument} from '../src/manual-eyeliner-ui.mjs';
import {PERSON_PRIVACY_APPROVED} from '../src/person-privacy.mjs';
import {detection,portrait,PERSON_A} from './fixtures.mjs';

const NOW=Date.parse('2026-10-03T08:00:00.000Z');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const nonraw=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
function document(asset){
  return makeManualEyelinerDocument({assetID:asset.id,
    originalSHA256:asset.sha256,personID:PERSON_A,
    sourceWidth:40,sourceHeight:20},[{
    side:'image-left',rect:{x:.1,y:.1,width:.35,height:.5},
    edge:[{u:.15,v:.4},{u:.35,v:.4}],wing:null}],
  {color:{r:24,g:19,b:19},opacity:.7,lineRadiusFraction:.005});
}
async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-eyeliner-host-'));
  let now=NOW;
  const service=await createTrialServer({dataDir,port:0,clock:()=>now});
  await new Promise((done,reject)=>{service.server.once('error',reject);
    service.server.listen(0,'127.0.0.1',done);});
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
    const bytes=Buffer.from(nonraw),digest=sha(bytes);
    const created=await api.createAsset({name:`${label}.png`,sha256:digest,
      size:bytes.length});
    await api.putOriginal(created.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    const body=neutralRecipe(),bound=portrait(created.id,0,0);
    bound.originalSHA256=digest;
    body.parameters.extendedParameters.portrait=bound;
    const saved=await api.saveRecipe(created.id,0,body);
    return {asset:(await api.listAssets()).find(item=>item.id===created.id),
      bytes,body,revision:saved.revision};
  }
  function editor(api,item,status=PERSON_PRIVACY_APPROVED){
    const processing={syntheticTestOnly:false,async decodeRaw(){
      throw Error('CALLER_DECODER_MUST_NOT_RUN');}};
    const session=new EditorSession({api,processing,storage:{},
      personProcessingStatus:status});
    session.proxy={width:40,height:20,
      data:new Uint8ClampedArray(40*20*4)};
    session.reference=item.body.parameters.extendedParameters.portrait;
    session.detections=[detection()];
    session.publish({asset:item.asset,assets:[item.asset],
      recipe:item.body,revision:item.revision,dirty:false,busy:null,
      exporting:false,selectedPersonID:PERSON_A,
      people:[{id:PERSON_A,complete:true}]});
    const host=createTrialManualEyelinerHost({api,session,
      getView:()=> 'after'});
    return {session,host};
  }
  return {service,login,asset,editor,advance(ms){now+=ms;},
    async cleanup(){
      await new Promise((done,reject)=>service.server.close(error=>error?
        reject(error):done()));
      const target=resolve(dataDir),root=resolve(tmpdir())+sep;
      if(!target.startsWith(root)||
          !target.split(sep).at(-1).startsWith('suite-eyeliner-host-'))
        throw Error('EYELINER_HOST_TEST_CLEANUP_UNSAFE');
      await rm(target,{recursive:true,force:true});
    }};
}
function pretendRemoteApproval(owner){
  // Test-only hostile transport response, never a production privacy grant.
  owner.intercept(async(url,_init,next)=>{
    const response=await next();
    if(!url.endsWith('/trial/session'))return response;
    const body=await response.json();
    return new Response(JSON.stringify({...body,
      personProcessingStatus:PERSON_PRIVACY_APPROVED}),{
      status:response.status,headers:{'Content-Type':'application/json'}});
  });
}
const workerBundle=await build({entryPoints:[fileURLToPath(new URL(
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
      runInContext(workerBundle.outputFiles[0].text,this.realm);
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

test('EYELINER-HOST-HTTP01: ordinary Trial privacy blocks save before a context is issued',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Privacy Owner');
    const item=await f.asset(owner.api,'privacy');
    const {host}=f.editor(owner.api,item);
    await assert.rejects(host.refresh(),/EYELINER_HOST_PERSON_PRIVACY_NOT_APPROVED/);
    assert.throws(()=>host.getContext(),/EYELINER_HOST_REFRESH_REQUIRED/);
    await assert.rejects(host.onSubmit(document(item.asset),{
      savedRevision:1,personID:PERSON_A,signal:new AbortController().signal}),
    /EYELINER_HOST_REFRESH_REQUIRED/);
    assert.equal((await owner.api.getRecipe(item.asset.id)).revision,1);
    assert.equal(sha(Buffer.from(await owner.api.getOriginal(item.asset.id))),
      sha(item.bytes));
    host.dispose();
  }finally{await f.cleanup();}
});

test('EYELINER-HOST-HTTP02: synthetic local person mode cannot override Trial privacy',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Synthetic Owner');
    const item=await f.asset(owner.api,'synthetic');
    const session=new EditorSession({api:owner.api,
      processing:{syntheticTestOnly:true},storage:{},
      personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
    session.proxy={width:40,height:20,
      data:new Uint8ClampedArray(40*20*4)};
    session.reference=item.body.parameters.extendedParameters.portrait;
    session.detections=[detection()];
    session.publish({asset:item.asset,assets:[item.asset],
      recipe:item.body,revision:item.revision,dirty:false,busy:null,
      exporting:false,selectedPersonID:PERSON_A,
      people:[{id:PERSON_A,complete:true}]});
    const host=createTrialManualEyelinerHost({api:owner.api,session,
      getView:()=> 'after'});
    await assert.rejects(host.refresh(),/EYELINER_HOST_PERSON_PRIVACY_NOT_APPROVED/);
    assert.equal((await owner.api.getRecipe(item.asset.id)).revision,1);
    host.dispose();
  }finally{await f.cleanup();}
});

test('EYELINER-HOST-HTTP03: foreign tenant and changed Original digest block despite test-only remote claim',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Owner'),other=await f.login('Other');
    const item=await f.asset(owner.api,'scope');
    pretendRemoteApproval(other);
    const foreign=f.editor(other.api,item);
    await assert.rejects(foreign.host.refresh(),/EYELINER_HOST_ASSET_UNAVAILABLE/);
    foreign.host.dispose();
    const altered=f.editor(owner.api,item);
    owner.intercept(async(url,_init,next)=>{
      if(url.includes('/original?'))return new Response(
        Buffer.alloc(item.bytes.length,55),{status:200});
      const response=await next();
      if(!url.endsWith('/trial/session'))return response;
      const body=await response.json();
      return new Response(JSON.stringify({...body,
        personProcessingStatus:PERSON_PRIVACY_APPROVED}),{
        status:response.status,headers:{'Content-Type':'application/json'}});
    });
    await assert.rejects(altered.host.refresh(),/EYELINER_HOST_ORIGINAL_CHANGED/);
    assert.equal((await owner.api.getRecipe(item.asset.id)).revision,1);
    altered.host.dispose();
  }finally{await f.cleanup();}
});

test('EYELINER-HOST-HTTP04: real bundled Worker rejects non-RAW even if remote status is test-spoofed',async()=>{
  const restore=actualWorkerForNode(),f=await fixture();try{
    const owner=await f.login('Decode Owner');
    const item=await f.asset(owner.api,'nonraw');
    pretendRemoteApproval(owner);
    const {session,host}=f.editor(owner.api,item);
    let injected=0;
    session.processing.decodeRaw=async()=>{injected++;throw Error('FAKE');};
    await assert.rejects(host.refresh(),/NOT_CAMERA_RAW/);
    assert.equal(injected,0);
    assert.equal((await owner.api.getRecipe(item.asset.id)).revision,1);
    assert.deepEqual(Buffer.from(await owner.api.getOriginal(item.asset.id)),
      item.bytes);
    host.dispose();
  }finally{restore();await f.cleanup();}
});

test('EYELINER-HOST-HTTP05: Abort, revoked session and wrong client never save',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Revoked Owner');
    const item=await f.asset(owner.api,'revoke');
    const {session,host}=f.editor(owner.api,item);
    assert.throws(()=>createTrialManualEyelinerHost({api:new TrialClient({
      baseURL:'http://127.0.0.1:1'}),session,getView:()=> 'after'}),
    /EYELINER_HOST_INIT_INVALID/);
    await assert.rejects(host.refresh({signal:AbortSignal.abort()}),
      {name:'AbortError'});
    pretendRemoteApproval(owner);
    f.service.auth.revokeAuthor(owner.author.id);
    await assert.rejects(host.refresh(),/TRIAL_REVOKED/);
    assert.equal(f.service.repo.latestRecipe(`trial-${owner.author.id}`,
      item.asset.id).revision,1);
    host.dispose();
  }finally{await f.cleanup();}
});

test('EYELINER-HOST-HTTP06: independent browser host bundle builds',async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL(
    '../src/manual-eyeliner-trial-host.mjs',import.meta.url))],
  bundle:true,write:false,platform:'browser',format:'esm',external:['module']});
  assert.ok(result.outputFiles[0].contents.length>0);
});
