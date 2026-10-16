import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession,neutralRecipe} from '../src/session.mjs';
import {createTrialManualBlushHost} from '../src/manual-blush-trial-host.mjs';
import {makeManualBlushDocument} from '../src/manual-blush-ui.mjs';
import {detection,portrait,PERSON_A} from './fixtures.mjs';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';

const START=Date.parse('2026-10-03T08:00:00.000Z');
const SHA=bytes=>createHash('sha256').update(bytes).digest('hex');
const BODY_WIDTH=40,BODY_HEIGHT=20;
const SCHEMA=()=>({color:{r:190,g:70,b:100},opacity:.4});
const STROKES=()=>[{operation:'ADD',path:[{u:.35,v:.4}],
  radiusFraction:.06,hardness:.7}];
function pixels(width=BODY_WIDTH,height=BODY_HEIGHT){
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4){data[i]=85;data[i+1]=70;
    data[i+2]=60;data[i+3]=255;}
  return {width,height,data};
}
async function fixture(){
  const base=resolve('.runtime');await mkdir(base,{recursive:true});
  const dataDir=await mkdtemp(join(base,'blush-trial-host-'));
  let now=START;
  const context=await createTrialServer({dataDir,port:0,clock:()=>now});
  await new Promise((done,reject)=>{context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);});
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  async function login(name,ends='2026-11-03T08:00:00.000Z'){
    const author=context.auth.createAuthor({authorName:name,trialEndsAt:ends});
    const invite=context.auth.issueInvite(author.id);
    const response=await fetch(baseURL+'/trial/login',{method:'POST',
      headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:invite.inviteToken})});
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie,/^suite_trial=/);
    let interceptor;
    const api=new TrialClient({baseURL,fetcher:(url,init)=>{
      const request={...init,headers:{...init.headers,Cookie:cookie}};
      return interceptor?interceptor(url,request,()=>fetch(url,request)):
        fetch(url,request);
    }});
    return {author,api,intercept(fn){interceptor=fn;}};
  }
  async function addAsset(api,label){
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_BLUSH_${label}`),digest=SHA(bytes);
    const created=await api.createAsset({name:`${label}.nonraw`,sha256:digest,
      size:bytes.length});
    await api.putOriginal(created.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    const body=neutralRecipe(),inventory=portrait(created.id,0,0);
    inventory.originalSHA256=digest;
    body.parameters.extendedParameters.portrait=inventory;
    const saved=await api.saveRecipe(created.id,0,body);
    return {asset:(await api.listAssets()).find(item=>item.id===created.id),
      bytes,body,revision:saved.revision};
  }
  async function editor(api,asset,{width=BODY_WIDTH,status='SYNTHETIC_TEST_ONLY'}={}){
    const processing={syntheticTestOnly:true,
      async decodeRaw(bytes,{mode}={}){return {pixels:pixels(width),
        provenance:{sourceSHA256:SHA(Buffer.from(bytes)),mode,
          sourceRepresentation:'synthetic-nonraw-test',thumbnailFallback:false}};},
      async makeProxy(frame){return frame;},
      async encode(){return new Blob(['synthetic-preview']);},
      async render(frame){return frame;},
      async detectPeople(){return [detection(),detection(.6)];}};
    const session=new EditorSession({api,processing,
      personProcessingStatus:status,
      urlAPI:{createObjectURL:()=>`blob:synthetic-blush-${Math.random()}`,
        revokeObjectURL(){}},storage:{get:async()=>undefined,
        put:async()=>{}}});
    if(status==='SYNTHETIC_TEST_ONLY'){
      await session.initialize();await session.openAsset(asset.id);
      await session.detectPeople();
      await session.selectPerson(PERSON_A);
    }else{
      // Normal Trial cannot use the portrait preview because privacy review
      // is required; this isolated state is used only to assert host rejection.
      session.proxy=pixels();session.reference=portrait(asset.id,0,0);
      session.reference.originalSHA256=asset.sha256;
      session.detections=[detection()];
      session.publish({assets:[asset],asset,recipe:(await api.getRecipe(asset.id)).body,
        revision:1,dirty:false,busy:null,exporting:false,
        selectedPersonID:PERSON_A,people:[{id:PERSON_A,complete:true}]});
    }
    return session;
  }
  return {context,login,addAsset,editor,advance(ms){now+=ms;},
    async cleanup(){
      await new Promise((done,reject)=>context.server.close(error=>error?
        reject(error):done()));
      const target=resolve(dataDir),root=resolve('.runtime')+sep;
      if(!target.startsWith(root)||
          !target.split(sep).at(-1).startsWith('blush-trial-host-'))
        throw Error('BLUSH_HOST_TEST_CLEANUP_UNSAFE');
      await rm(target,{recursive:true,force:true});
    }};
}
function document(asset){return makeManualBlushDocument({assetID:asset.id,
  originalSHA256:asset.sha256,personID:PERSON_A,sourceWidth:BODY_WIDTH,
  sourceHeight:BODY_HEIGHT},STROKES(),SCHEMA());}
function attach(api,session){return createTrialManualBlushHost({api,session,
  getView:()=> 'after'});}

test('BLUSH-HOST-HTTP01 / REAL_TRIAL_SQLITE_SYNTHETIC_NON_RAW: only a synthetic-only approved Session can save CAS/readback after digest and decode dimensions',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Blush Owner');
    const {asset,bytes,body}=await f.addAsset(owner.api,'positive');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    const mounted=await host.refresh();
    assert.equal(mounted.savedRevision,1);
    assert.equal(mounted.sourceWidth,BODY_WIDTH);
    const result=await host.onSubmit(document(asset),{savedRevision:1,
      personID:PERSON_A,signal:new AbortController().signal});
    assert.deepEqual(result,{readbackVerified:true,savedRevision:2,
      editorSynchronized:false,syntheticTestOnly:true});
    const saved=await owner.api.getRecipe(asset.id);
    assert.equal(saved.revision,2);
    assert.deepEqual(saved.body.parameters.extendedParameters.blushManual,
      document(asset));
    assert.deepEqual(saved.body.parameters.extendedParameters.portrait,
      body.parameters.extendedParameters.portrait);
    assert.equal(SHA(Buffer.from(await owner.api.getOriginal(asset.id))),SHA(bytes));
    assert.equal(session.state.revision,1,'product Session remains deliberately stale');
    assert.throws(()=>host.getContext(),/REFRESH_REQUIRED/);
    host.dispose();
  }finally{await f.cleanup();}
});

test('BLUSH-HOST-HTTP02: current local Trial privacy review blocks normal EditorSession and cannot save',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Blocked Owner');
    const {asset}=await f.addAsset(owner.api,'privacy');
    const session=await f.editor(owner.api,asset,
      {status:'PRIVACY_REVIEW_REQUIRED'}),host=attach(owner.api,session);
    await assert.rejects(host.refresh(),/PERSON_PRIVACY_REVIEW_REQUIRED/);
    assert.throws(()=>host.getContext(),/REFRESH_REQUIRED/,
      'the manual UI cannot mount an authenticated ready context');
    await assert.rejects(host.onSubmit(document(asset),{savedRevision:1,
      personID:PERSON_A,signal:new AbortController().signal}),
    /REFRESH_REQUIRED/);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,1);
    host.dispose();
  }finally{await f.cleanup();}
});

test('BLUSH-HOST-HTTP03: wrong person, Asset, SHA, revision and decoded dimensions reject without mutation',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Bound Owner');
    const {asset}=await f.addAsset(owner.api,'bound');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    await host.refresh();
    for(const binding of [{personID:crypto.randomUUID()},
      {assetID:crypto.randomUUID()},{originalSHA256:'f'.repeat(64)},
      {sourceWidth:41}]){
      const altered={...document(asset),binding:{...document(asset).binding,
        ...binding}};
      await assert.rejects(host.onSubmit(altered,{savedRevision:1,
        personID:PERSON_A,signal:new AbortController().signal}));
    }
    await assert.rejects(host.onSubmit(document(asset),{savedRevision:2,
      personID:PERSON_A,signal:new AbortController().signal}),/SCOPE_MISMATCH/);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,1);
    host.dispose();
    const otherSession=await f.editor(owner.api,asset,{width:41});
    const wrongDimensions=attach(owner.api,otherSession);
    await wrongDimensions.refresh();
    await assert.rejects(wrongDimensions.onSubmit(document(asset),{
      savedRevision:1,personID:PERSON_A,signal:new AbortController().signal}),
    /SCOPE_MISMATCH/);
    wrongDimensions.dispose();
  }finally{await f.cleanup();}
});

test('BLUSH-HOST-HTTP04: changed Original bytes, saved CAS race, revoked session and abort return no success',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Race Owner');
    const {asset}=await f.addAsset(owner.api,'race');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    await host.refresh();
    await assert.rejects(host.onSubmit(document(asset),{savedRevision:1,
      personID:PERSON_A,signal:AbortSignal.abort()}),{name:'AbortError'});
    owner.intercept((url,init,next)=>url.includes('/original?')?
      new Response(Buffer.alloc(asset.size,81),{status:200}):next());
    await assert.rejects(host.onSubmit(document(asset),{savedRevision:1,
      personID:PERSON_A,signal:new AbortController().signal}),
    /ORIGINAL_CHANGED/);
    owner.intercept(undefined);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,1);
    await host.refresh();
    await owner.api.saveRecipe(asset.id,1,session.state.recipe);
    await assert.rejects(host.onSubmit(document(asset),{savedRevision:1,
      personID:PERSON_A,signal:new AbortController().signal}),
    /SAVED_RECIPE_CHANGED/);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,2);
    host.dispose();
    const fresh=await f.editor(owner.api,asset),second=attach(owner.api,fresh);
    await second.refresh();
    f.context.auth.revokeAuthor(owner.author.id);
    await assert.rejects(second.onSubmit(document(asset),{savedRevision:2,
      personID:PERSON_A,signal:new AbortController().signal}),/TRIAL_REVOKED/);
    second.dispose();
  }finally{await f.cleanup();}
});

test('BLUSH-HOST-HTTP05: missing decode provenance, expired Trial and other tenant never produce a success result',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Proof Owner'),other=await f.login('Other');
    const {asset}=await f.addAsset(owner.api,'proof');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    const originalDecode=session.processing.decodeRaw;
    session.processing.decodeRaw=async(bytes,options)=>{
      const decoded=await originalDecode(bytes,options);
      return {...decoded,provenance:{...decoded.provenance,
        sourceSHA256:'f'.repeat(64)}};
    };
    await assert.rejects(host.refresh(),/DECODE_PROVENANCE_REQUIRED/);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,1);
    session.processing.decodeRaw=originalDecode;
    assert.throws(()=>createTrialManualBlushHost({api:other.api,session,
      getView:()=> 'after'}),/INIT_INVALID/);
    await host.refresh();
    f.advance(35*24*60*60*1000);
    await assert.rejects(host.onSubmit(document(asset),{savedRevision:1,
      personID:PERSON_A,signal:new AbortController().signal}),
    /TRIAL_EXPIRED|SESSION_REQUIRED/);
    assert.equal((await f.context.repo.latestRecipe(`trial-${owner.author.id}`,
      asset.id))?.revision,1);
    host.dispose();
  }finally{await f.cleanup();}
});

test('BLUSH-HOST-HTTP06: post-CAS Original failure is an uncertain persisted result, never verified success',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Readback Owner');
    const {asset}=await f.addAsset(owner.api,'readback');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    await host.refresh();
    let saved=false;
    owner.intercept(async(url,init,next)=>{
      if(url.endsWith(`/v1/assets/${asset.id}/recipe`)&&init.method==='PUT'){
        const response=await next();saved=response.ok;return response;
      }
      if(saved&&url.includes('/original?'))
        return new Response(Buffer.alloc(asset.size,88),{status:200});
      return next();
    });
    await assert.rejects(host.onSubmit(document(asset),{savedRevision:1,
      personID:PERSON_A,signal:new AbortController().signal}),
    /ORIGINAL_CHANGED/);
    owner.intercept(undefined);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,2,
      'a committed backend write is not rolled back by failed readback');
    assert.throws(()=>host.getContext(),/REFRESH_REQUIRED/);
    host.dispose();
  }finally{await f.cleanup();}
});

test('BLUSH-HOST-HTTP07: reloading the same Asset and reselecting the same person invalidates the old host epoch',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Epoch Owner');
    const {asset}=await f.addAsset(owner.api,'epoch');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    await host.refresh();
    await session.openAsset(asset.id);
    await session.detectPeople();
    await session.selectPerson(PERSON_A);
    assert.throws(()=>host.getContext(),/EDITOR_SCOPE_CHANGED/);
    await assert.rejects(host.onSubmit(document(asset),{savedRevision:1,
      personID:PERSON_A,signal:new AbortController().signal}),
    /EDITOR_SCOPE_CHANGED/);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,1);
    host.dispose();
  }finally{await f.cleanup();}
});

test('BLUSH-HOST-BUNDLE: browser module builds but synthetic success is Node-test-only',async()=>{
  const bundled=await build({entryPoints:[fileURLToPath(new URL(
    '../src/manual-blush-trial-host.mjs',import.meta.url))],bundle:true,
    format:'esm',platform:'browser',target:'es2022',external:['module'],
    write:false,
    logLevel:'silent'});
  assert.match(bundled.outputFiles[0].text,/BLUSH_HOST_PERSON_PRIVACY_NOT_APPROVED/);
  assert.match(bundled.outputFiles[0].text,/NODE_TEST_CONTEXT/);
});
