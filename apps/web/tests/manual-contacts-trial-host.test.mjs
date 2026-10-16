import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession,neutralRecipe} from '../src/session.mjs';
import {createTrialManualContactsHost} from '../src/manual-contacts-trial-host.mjs';
import {makeManualContactsDocument} from '../src/manual-contacts-ui.mjs';
import {detection,portrait,PERSON_A} from './fixtures.mjs';

const START=Date.parse('2026-10-03T08:00:00.000Z');
const WIDTH=40,HEIGHT=20;
const SHA=bytes=>createHash('sha256').update(bytes).digest('hex');
const STROKES=()=>[{operation:'ADD',path:[{u:.38,v:.43}],
  radiusFraction:.06,hardness:.7}];
function pixels(width=WIDTH,height=HEIGHT){
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4){data[i]=90;data[i+1]=70;
    data[i+2]=55;data[i+3]=255;}
  return {width,height,data};
}
async function fixture(){
  const base=resolve('.runtime');await mkdir(base,{recursive:true});
  const dataDir=await mkdtemp(join(base,'contacts-trial-host-'));
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
  async function addAsset(api,label,{contactsEye}={}){
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_CONTACTS_${label}`);
    const digest=SHA(bytes);
    const created=await api.createAsset({name:`${label}.nonraw`,sha256:digest,
      size:bytes.length});
    await api.putOriginal(created.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    const body=neutralRecipe(),inventory=portrait(created.id,0,0);
    inventory.originalSHA256=digest;
    body.parameters.extendedParameters.portrait=inventory;
    if(contactsEye)body.parameters.extendedParameters.contactsIrisManual=
      document({id:created.id,sha256:digest},contactsEye);
    const saved=await api.saveRecipe(created.id,0,body);
    return {asset:(await api.listAssets()).find(item=>item.id===created.id),
      bytes,body,revision:saved.revision};
  }
  async function editor(api,asset,{width=WIDTH,
    status='SYNTHETIC_TEST_ONLY'}={}){
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
      urlAPI:{createObjectURL:()=>`blob:synthetic-contacts-${Math.random()}`,
        revokeObjectURL(){}},storage:{get:async()=>undefined,
        put:async()=>{}}});
    if(status==='SYNTHETIC_TEST_ONLY'){
      await session.initialize();await session.openAsset(asset.id);
      await session.detectPeople();await session.selectPerson(PERSON_A);
    }else{
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
          !target.split(sep).at(-1).startsWith('contacts-trial-host-'))
        throw Error('CONTACTS_HOST_TEST_CLEANUP_UNSAFE');
      await rm(target,{recursive:true,force:true});
    }};
}
function binding(asset,eye='left'){return {assetID:asset.id,
  originalSHA256:asset.sha256,personID:PERSON_A,eye,
  sourceWidth:WIDTH,sourceHeight:HEIGHT};}
function document(asset,eye='left'){
  return makeManualContactsDocument(binding(asset,eye),STROKES(),STROKES(),
    {color:{r:80,g:120,b:210},amount:.4});
}
function attach(api,session){return createTrialManualContactsHost({api,session,
  getView:()=> 'after'});}

test('CONTACTS-HOST-HTTP01: Node synthetic-only Trial save is CAS/readback verified, not product RAW or Final',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Contacts Owner');
    const {asset,bytes,body}=await f.addAsset(owner.api,'positive');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    const mounted=await host.refresh();
    assert.equal(mounted.savedRevision,1);
    assert.equal(mounted.sourceWidth,WIDTH);
    const signal=new AbortController().signal;
    assert.deepEqual(await host.verifyFresh({binding:binding(asset),
      savedRevision:1,signal}),{status:'verified',binding:binding(asset),
      savedRevision:1});
    const result=await host.submitDraft(document(asset),{savedRevision:1,signal});
    assert.deepEqual(result,{readbackVerified:true,savedRevision:2,
      editorSynchronized:false,syntheticTestOnly:true,
      realRAWVerified:false,finalVerified:false});
    const saved=await owner.api.getRecipe(asset.id);
    assert.equal(saved.revision,2);
    assert.deepEqual(saved.body.parameters.extendedParameters.contactsIrisManual,
      document(asset));
    assert.deepEqual(saved.body.parameters.extendedParameters.portrait,
      body.parameters.extendedParameters.portrait);
    assert.equal(SHA(Buffer.from(await owner.api.getOriginal(asset.id))),SHA(bytes));
    assert.equal(session.state.revision,1,'the Editor is deliberately stale');
    assert.throws(()=>host.getContext(),/REFRESH_REQUIRED/);
    host.dispose();
  }finally{await f.cleanup();}
});

test('CONTACTS-HOST-HTTP02: normal Trial person privacy and absent trusted iris location block product save',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Privacy Owner');
    const {asset}=await f.addAsset(owner.api,'privacy');
    const session=await f.editor(owner.api,asset,
      {status:'PRIVACY_REVIEW_REQUIRED'}),host=attach(owner.api,session);
    await assert.rejects(host.refresh(),/PERSON_PRIVACY_REVIEW_REQUIRED/);
    assert.throws(()=>host.getContext(),/REFRESH_REQUIRED/);
    await assert.rejects(host.submitDraft(document(asset),{savedRevision:1,
      signal:new AbortController().signal}),/REFRESH_REQUIRED/);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,1);
    host.dispose();
  }finally{await f.cleanup();}
});

test('CONTACTS-HOST-HTTP03: Asset, SHA, person, dimensions and revision are bound',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Scope Owner');
    const {asset}=await f.addAsset(owner.api,'scope');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    await host.refresh();
    for(const change of [{assetID:crypto.randomUUID()},
      {originalSHA256:'f'.repeat(64)},{personID:crypto.randomUUID()},
      {sourceWidth:41}]){
      const altered={...document(asset),binding:{...binding(asset),...change}};
      await assert.rejects(host.submitDraft(altered,{savedRevision:1,
        signal:new AbortController().signal}));
    }
    await assert.rejects(host.submitDraft(document(asset),{savedRevision:2,
      signal:new AbortController().signal}),/SCOPE_MISMATCH/);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,1);
    host.dispose();
    const alternate=await f.editor(owner.api,asset,{width:41});
    const wrongSize=attach(owner.api,alternate);
    await wrongSize.refresh();
    await assert.rejects(wrongSize.submitDraft(document(asset),{
      savedRevision:1,signal:new AbortController().signal}),/SCOPE_MISMATCH/);
    wrongSize.dispose();
  }finally{await f.cleanup();}
});

test('CONTACTS-HOST-HTTP04: altered Original, CAS race, revoked identity and abort fail closed',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Race Owner');
    const {asset}=await f.addAsset(owner.api,'race');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    await host.refresh();
    await assert.rejects(host.submitDraft(document(asset),{savedRevision:1,
      signal:AbortSignal.abort()}),{name:'AbortError'});
    owner.intercept((url,init,next)=>url.includes('/original?')?
      new Response(Buffer.alloc(asset.size,81),{status:200}):next());
    await assert.rejects(host.submitDraft(document(asset),{savedRevision:1,
      signal:new AbortController().signal}),/ORIGINAL_CHANGED/);
    owner.intercept(undefined);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,1);
    await host.refresh();
    await owner.api.saveRecipe(asset.id,1,session.state.recipe);
    await assert.rejects(host.submitDraft(document(asset),{savedRevision:1,
      signal:new AbortController().signal}),/SAVED_RECIPE_CHANGED/);
    host.dispose();
    const fresh=await f.editor(owner.api,asset),second=attach(owner.api,fresh);
    await second.refresh();
    f.context.auth.revokeAuthor(owner.author.id);
    await assert.rejects(second.submitDraft(document(asset),{savedRevision:2,
      signal:new AbortController().signal}),/TRIAL_REVOKED/);
    second.dispose();
  }finally{await f.cleanup();}
});

test('CONTACTS-HOST-HTTP06: a saved other-eye document and an expired Trial cannot be silently replaced',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Eye Owner');
    const {asset}=await f.addAsset(owner.api,'other-eye',
      {contactsEye:'right'});
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    await host.refresh();
    await assert.rejects(host.submitDraft(document(asset,'left'),{
      savedRevision:1,signal:new AbortController().signal}),
    /EXISTING_EYE_OR_PERSON_CONFLICT/);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,1);
    host.dispose();
    const second=attach(owner.api,session);
    await second.refresh();
    f.advance(35*24*60*60*1000);
    await assert.rejects(second.submitDraft(document(asset,'right'),{
      savedRevision:1,signal:new AbortController().signal}),
    /TRIAL_EXPIRED|SESSION_REQUIRED/);
    second.dispose();
  }finally{await f.cleanup();}
});

test('CONTACTS-HOST-HTTP05: wrong decode provenance, another tenant and post-CAS readback loss never report verified success',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Proof Owner'),other=await f.login('Other');
    const {asset}=await f.addAsset(owner.api,'proof');
    const session=await f.editor(owner.api,asset),host=attach(owner.api,session);
    const original=session.processing.decodeRaw;
    session.processing.decodeRaw=async(bytes,options)=>{
      const decoded=await original(bytes,options);
      return {...decoded,provenance:{...decoded.provenance,
        sourceSHA256:'f'.repeat(64)}};
    };
    await assert.rejects(host.refresh(),/DECODE_PROVENANCE_REQUIRED/);
    session.processing.decodeRaw=original;
    assert.throws(()=>createTrialManualContactsHost({api:other.api,session,
      getView:()=> 'after'}),/INIT_INVALID/);
    await host.refresh();
    let committed=false;
    owner.intercept(async(url,init,next)=>{
      if(url.endsWith(`/v1/assets/${asset.id}/recipe`)&&init.method==='PUT'){
        const response=await next();committed=response.ok;return response;
      }
      if(committed&&url.includes('/original?'))
        return new Response(Buffer.alloc(asset.size,88),{status:200});
      return next();
    });
    await assert.rejects(host.submitDraft(document(asset),{savedRevision:1,
      signal:new AbortController().signal}),/ORIGINAL_CHANGED/);
    owner.intercept(undefined);
    assert.equal((await owner.api.getRecipe(asset.id)).revision,2,
      'backend commit is not rolled back; outcome stays unverified');
    assert.throws(()=>host.getContext(),/REFRESH_REQUIRED/);
    host.dispose();
  }finally{await f.cleanup();}
});

test('CONTACTS-HOST-BUNDLE: browser build retains synthetic-test and iris-location fail-closed guards',async()=>{
  const bundled=await build({entryPoints:[fileURLToPath(new URL(
    '../src/manual-contacts-trial-host.mjs',import.meta.url))],bundle:true,
    format:'esm',platform:'browser',target:'es2022',external:['module'],
    write:false,logLevel:'silent'});
  assert.match(bundled.outputFiles[0].text,/CONTACTS_HOST_IRIS_LOCATION_NOT_VERIFIED/);
  assert.match(bundled.outputFiles[0].text,/NODE_TEST_CONTEXT/);
});
