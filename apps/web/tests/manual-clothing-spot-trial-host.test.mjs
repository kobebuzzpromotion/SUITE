import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {makeManualClothingSpotDocument} from '../src/manual-clothing-spot-ui.mjs';
import {createTrialManualClothingSpotHost} from
  '../src/manual-clothing-spot-trial-host.mjs';
import {recipe} from './fixtures.mjs';

const NOW=Date.parse('2026-10-03T08:00:00.000Z');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const document=asset=>makeManualClothingSpotDocument(
  {assetID:asset.id,originalSHA256:asset.sha256,
    sourceWidth:40,sourceHeight:20},
  {x:.1,y:.2,width:.2,height:.2},
  {x:.6,y:.2,width:.2,height:.2},
  [{operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.05,hardness:1}]);

async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-clothing-host-'));
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
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_CLOTHING_${label}`);
    const item=await api.createAsset({name:label+'.nonraw',
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
    const host=createTrialManualClothingSpotHost({api,session,assetID:item.id,
      getEditorView:()=>display});
    return {session,display,host};
  }
  return {service,login,asset,editor,advance(ms){clock+=ms;},
    async cleanup(){
      await new Promise((done,reject)=>service.server.close(error=>
        error?reject(error):done()));
      const target=resolve(dataDir),base=resolve(tmpdir())+sep;
      if(!target.startsWith(base)||
          !target.split(sep).at(-1).startsWith('suite-clothing-host-'))
        throw Error('CLOTHING_HOST_TEST_CLEANUP_INVALID');
      await rm(target,{recursive:true,force:true});
    }};
}

function fakeDecodedWorker(){
  const previous=globalThis.Worker;
  globalThis.Worker=class {
    postMessage(message){queueMicrotask(()=>this.onmessage?.({data:{id:message.id,
      result:{pixels:{width:40,height:20,
        data:new Uint8ClampedArray(40*20*4)}}}}));}
    terminate(){}
  };
  return ()=>{if(previous===undefined)delete globalThis.Worker;
    else globalThis.Worker=previous;};
}

test('CLOTHING-HOST-HTTP01: real Trial/SQLite synthetic non-RAW cannot save without bundled Browser Worker decode',async()=>{
  const f=await fixture();
  try{
    const owner=await f.login('Owner'),item=await f.asset(owner.api,'blocked');
    const {host}=f.editor(owner.api,item);
    await assert.rejects(host.refresh(),/BROWSER_WORKER_UNAVAILABLE/);
    assert.equal(host.getContext().ready,false);
    await assert.rejects(host.onSubmit(document(item),
      {savedRevision:1,signal:new AbortController().signal}),
    /CLOTHING_HOST_REFRESH_REQUIRED/);
    assert.equal((await owner.api.getRecipe(item.id)).revision,1);
    host.dispose();
  }finally{await f.cleanup();}
});

test('CLOTHING-HOST-HTTP02: synthetic Worker double exercises actual Trial CAS/readback, not RAW provenance',async()=>{
  const restore=fakeDecodedWorker(),f=await fixture();
  try{
    const owner=await f.login('Owner'),item=await f.asset(owner.api,'cas');
    const {host,session}=f.editor(owner.api,item);
    const context=await host.refresh();
    assert.equal(context.ready,true);
    assert.equal(context.sourceWidth,40);
    const result=await host.onSubmit(document(item),
      {savedRevision:item.revision,signal:new AbortController().signal});
    assert.deepEqual(result,{savedVerified:true,revision:2,
      editorReloadRequired:true,finalVerified:false});
    const saved=await owner.api.getRecipe(item.id);
    assert.equal(saved.revision,2);
    assert.deepEqual(saved.body.parameters.extendedParameters.clothingSpotManual,
      document(item));
    assert.equal(host.getContext().ready,false);
    assert.equal(session.state.revision,1);
    host.dispose();
  }finally{restore();await f.cleanup();}
});

test('CLOTHING-HOST-HTTP03: wrong document, SHA, competing revision and other tenant reject without writes',async()=>{
  const restore=fakeDecodedWorker(),f=await fixture();
  try{
    const owner=await f.login('Owner'),other=await f.login('Other');
    const item=await f.asset(owner.api,'scope');
    const wrong=f.editor(other.api,item);
    await assert.rejects(wrong.host.refresh(),/CLOTHING_HOST_ASSET_UNAVAILABLE/);
    wrong.host.dispose();
    const {host,session}=f.editor(owner.api,item);
    await host.refresh();
    const forged=document(item);
    forged.binding.originalSHA256='a'.repeat(64);
    await assert.rejects(host.onSubmit(forged,{savedRevision:1,signal:null}),
      /CLOTHING_HOST_DOCUMENT_BINDING_MISMATCH|CLOTHING_HOST_SIGNAL_INVALID/);
    assert.equal((await owner.api.getRecipe(item.id)).revision,1);
    const body=(await owner.api.getRecipe(item.id)).body;
    await owner.api.saveRecipe(item.id,1,body);
    await assert.rejects(host.onSubmit(document(item),
      {savedRevision:1,signal:new AbortController().signal}),
    /CLOTHING_HOST_FRESH_SCOPE_CHANGED/);
    assert.equal((await owner.api.getRecipe(item.id)).revision,2);
    session.data.revision=2;host.dispose();
  }finally{restore();await f.cleanup();}
});

test('CLOTHING-HOST-HTTP04: changed Original, revoked owner and cancellation fail closed',async()=>{
  const restore=fakeDecodedWorker(),f=await fixture();
  try{
    const owner=await f.login('Owner'),item=await f.asset(owner.api,'revocation');
    const {host}=f.editor(owner.api,item);
    owner.intercept((url,init,next)=>url.includes('/original?')?
      new Response(Buffer.alloc(item.bytes.length,66),{status:200}):next());
    await assert.rejects(host.refresh(),/CLOTHING_HOST_ORIGINAL_CHANGED/);
    owner.intercept(undefined);
    await assert.rejects(host.refresh({signal:AbortSignal.abort()}),
      {name:'AbortError'});
    await host.refresh();
    f.service.auth.revokeAuthor(owner.author.id);
    await assert.rejects(host.onSubmit(document(item),
      {savedRevision:1,signal:new AbortController().signal}),/TRIAL_REVOKED/);
    host.dispose();
  }finally{restore();await f.cleanup();}
});

test('CLOTHING-HOST-HTTP05: Asset switch, stale local proxy and accessor document cannot cross save gate',async()=>{
  const restore=fakeDecodedWorker(),f=await fixture();
  try{
    const owner=await f.login('Owner'),item=await f.asset(owner.api,'switch');
    const {host,session}=f.editor(owner.api,item);
    session.proxy.width=39;
    await assert.rejects(host.refresh(),/CLOTHING_HOST_PROXY_MISMATCH/);
    assert.equal(host.getContext().ready,false);
    session.proxy.width=40;
    await host.refresh();
    const evil=document(item);let invoked=0;
    Object.defineProperty(evil,'targetRect',{get(){invoked++;throw Error('GETTER_RAN');}});
    await assert.rejects(host.onSubmit(evil,
      {savedRevision:1,signal:new AbortController().signal}),
    /CLOTHING_HOST_JSON_INVALID/);
    assert.equal(invoked,0);
    assert.equal((await owner.api.getRecipe(item.id)).revision,1);
    await host.refresh();
    session.data.asset={...item,id:crypto.randomUUID()};
    await assert.rejects(host.onSubmit(document(item),
      {savedRevision:1,signal:new AbortController().signal}),
    /CLOTHING_HOST_EDITOR_CHANGED/);
    assert.equal((await owner.api.getRecipe(item.id)).revision,1);
    host.dispose();
  }finally{restore();await f.cleanup();}
});

test('CLOTHING-HOST-HTTP06: a committed write with lost/mismatched readback is unverified, never a saved success',async()=>{
  const restore=fakeDecodedWorker(),f=await fixture();
  try{
    const owner=await f.login('Owner'),item=await f.asset(owner.api,'uncertain');
    const {host}=f.editor(owner.api,item);
    await host.refresh();
    let written=false;
    owner.intercept((url,init,next)=>{
      if(url.endsWith(`/v1/assets/${item.id}/recipe`)&&init.method==='PUT'){
        written=true;return next();
      }
      if(written&&url.endsWith(`/v1/assets/${item.id}/recipe`)&&
          init.method==='GET')
        return new Response(JSON.stringify({recipe:{revision:999,body:recipe()}}),
          {status:200,headers:{'Content-Type':'application/json'}});
      return next();
    });
    await assert.rejects(host.onSubmit(document(item),
      {savedRevision:1,signal:new AbortController().signal}),
    /CLOTHING_HOST_SAVE_OUTCOME_UNVERIFIED/);
    assert.equal(written,true);
    assert.equal(host.getContext().ready,false);
    owner.intercept(undefined);
    assert.equal((await owner.api.getRecipe(item.id)).revision,2);
    host.dispose();
  }finally{restore();await f.cleanup();}
});
