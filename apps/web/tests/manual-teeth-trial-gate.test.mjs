import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {readTrialManualTeethGate} from '../src/manual-teeth-trial-gate.mjs';
import {MANUAL_TEETH_WHITENING_VERSION} from
  '../src/processing/manual-teeth-whitening.mjs';
import {recipe,portrait} from './fixtures.mjs';

const START=Date.parse('2026-10-03T08:00:00.000Z');
const END='2026-11-03T08:00:00.000Z';
const PERSON='33333333-3333-4333-8333-333333333333';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const document=(asset,personID=PERSON)=>({schemaVersion:1,
  engineVersion:MANUAL_TEETH_WHITENING_VERSION,
  binding:{assetID:asset.id,originalSHA256:asset.sha256,
    sourceWidth:40,sourceHeight:20,personID},
  teethStrokes:[{operation:'ADD',path:[{u:.4,v:.5}],
    radiusFraction:.04,hardness:.6}],
  settings:{brightness:25,desaturation:50}});
const request=(api,asset,action='edit',personID=PERSON)=>({api,
  binding:{assetID:asset.id,originalSHA256:asset.sha256,personID,
    savedRevision:asset.revision},action});

async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-teeth-trial-gate-'));
  let now=START;
  const context=await createTrialServer({dataDir,port:0,clock:()=>now});
  await new Promise((done,reject)=>{
    context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);
  });
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  async function login(name,trialEndsAt=END){
    const author=context.auth.createAuthor({authorName:name,trialEndsAt});
    const invite=context.auth.issueInvite(author.id);
    const response=await fetch(baseURL+'/trial/login',{method:'POST',
      headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:invite.inviteToken})});
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie,/^suite_trial=/);
    let interceptor;
    const client=new TrialClient({baseURL,fetcher:(url,init)=>{
      const request={...init,headers:{...init.headers,Cookie:cookie}};
      return interceptor?interceptor(url,request,()=>fetch(url,request)):
        fetch(url,request);
    }});
    return {author,client,intercept(fn){interceptor=fn;}};
  }
  async function create(client,label,{withPortrait=false}={}){
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_TEETH_${label}`);
    const sha256=sha(bytes);
    const asset=await client.createAsset({name:`${label}.nonraw`,sha256,
      size:bytes.length});
    await client.putOriginal(asset.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    const bound={...asset,sha256};
    const body=recipe();
    body.parameters.extendedParameters.teethManual=document(bound);
    if(withPortrait){
      const existing=portrait(asset.id);
      existing.originalSHA256=sha256;
      body.parameters.extendedParameters.portrait=existing;
    }
    const saved=await client.saveRecipe(asset.id,0,body);
    return {...asset,sha256,revision:saved.revision,bytes};
  }
  return {context,login,create,advance(ms){now+=ms;},async cleanup(){
    await new Promise((done,reject)=>context.server.close(error=>error?reject(error):done()));
    const target=resolve(dataDir),base=resolve(tmpdir())+sep;
    if(!target.startsWith(base)||
        !target.split(sep).at(-1).startsWith('suite-teeth-trial-gate-'))
      throw Error('TEETH_TEST_CLEANUP_TARGET_INVALID');
    await rm(target,{recursive:true,force:true});
  }};
}

test('TEETH-GATE-HTTP01 / REAL_TRIAL_SQLITE_NON_RAW: fresh owner, SHA, revision and both permissions are checked, but person authority is absent',async()=>{
  const f=await fixture();
  try{
    const owner=await f.login('Teeth Owner');
    const asset=await f.create(owner.client,'owner');
    const saved=await owner.client.getRecipe(asset.id);
    let sessionReads=0,assetReads=0,recipeReads=0,originalReads=0,
      permissions=0;
    owner.intercept((url,init,next)=>{
      if(url.endsWith('/trial/session'))sessionReads++;
      if(url.endsWith('/v1/assets'))assetReads++;
      if(url.endsWith(`/v1/assets/${asset.id}/recipe`))recipeReads++;
      if(url.includes('/original?'))originalReads++;
      if(url.endsWith('/trial/authorize'))permissions++;
      return next();
    });
    for(const action of ['edit','export']){
      await assert.rejects(readTrialManualTeethGate(request(owner.client,asset,action)),
        /TEETH_PERSON_ID_AUTHORITY_UNAVAILABLE/);
    }
    assert.equal(sessionReads,4);
    assert.equal(assetReads,4);
    assert.equal(recipeReads,4);
    assert.equal(originalReads,2);
    assert.equal(permissions,2);
    assert.deepEqual(await owner.client.getRecipe(asset.id),saved);
    assert.equal(sha(Buffer.from(await owner.client.getOriginal(asset.id))),asset.sha256);
  }finally{await f.cleanup();}
});

test('TEETH-GATE-HTTP02: UI authority claims, fake adapter, other owner/Asset/person/SHA fail before authority result',async()=>{
  const f=await fixture();
  try{
    const owner=await f.login('Owner'),other=await f.login('Other');
    const asset=await f.create(owner.client,'first');
    const second=await f.create(owner.client,'second');
    const input=request(owner.client,asset);
    for(const forged of [{...input,allowed:true},
      {...input,permissionEvidence:{allowed:true}},
      {...input,personInventory:[{id:PERSON}]},
      {...input,api:{getSession:async()=>({mode:'INVITED_LOCAL_TRIAL'})}}]){
      await assert.rejects(readTrialManualTeethGate(forged),/TEETH_TRIAL_INPUT_INVALID/);
    }
    await assert.rejects(readTrialManualTeethGate(request(other.client,asset)),
      /TEETH_TRIAL_ASSET_UNAVAILABLE/);
    await assert.rejects(readTrialManualTeethGate({...input,binding:{...input.binding,
      assetID:second.id}}),/TEETH_TRIAL_ORIGINAL_CHANGED|TEETH_TRIAL_SAVED_BINDING_MISMATCH/);
    await assert.rejects(readTrialManualTeethGate({...input,binding:{...input.binding,
      personID:crypto.randomUUID()}}),/TEETH_TRIAL_SAVED_BINDING_MISMATCH/);
    await assert.rejects(readTrialManualTeethGate({...input,binding:{...input.binding,
      originalSHA256:'b'.repeat(64)}}),/TEETH_TRIAL_ORIGINAL_CHANGED/);
  }finally{await f.cleanup();}
});

test('TEETH-GATE-HTTP03: portrait UUID inventory in a saved client-authored Recipe is not independent tooth identity evidence',async()=>{
  const f=await fixture();
  try{
    const owner=await f.login('Owner');
    const asset=await f.create(owner.client,'portrait',{withPortrait:true});
    const saved=await owner.client.getRecipe(asset.id);
    assert.equal(saved.body.parameters.extendedParameters.portrait.targets.length,2);
    await assert.rejects(readTrialManualTeethGate(request(owner.client,asset)),
      /TEETH_PERSON_ID_AUTHORITY_UNAVAILABLE/);
  }finally{await f.cleanup();}
});

test('TEETH-GATE-HTTP04: changed bytes, stale Recipe and revoked/expired principal reject before person step',async()=>{
  const f=await fixture();
  try{
    const owner=await f.login('Owner');
    const asset=await f.create(owner.client,'race');
    const input=request(owner.client,asset);
    owner.intercept((url,init,next)=>url.includes('/original?')?
      new Response(Buffer.alloc(asset.bytes.length,88),
        {status:200,headers:{'Content-Type':'application/octet-stream'}}):next());
    await assert.rejects(readTrialManualTeethGate(input),/TEETH_TRIAL_ORIGINAL_CHANGED/);
    owner.intercept(undefined);
    const body=(await owner.client.getRecipe(asset.id)).body;
    await owner.client.saveRecipe(asset.id,1,body);
    await assert.rejects(readTrialManualTeethGate(input),/TEETH_TRIAL_REVISION_CONFLICT/);
    const fresh=request(owner.client,{...asset,revision:2});
    owner.intercept((url,init,next)=>{
      if(url.endsWith('/trial/authorize'))f.context.auth.revokeAuthor(owner.author.id);
      return next();
    });
    await assert.rejects(readTrialManualTeethGate(fresh),/TRIAL_REVOKED/);
    owner.intercept(undefined);
    const expiring=await f.login('Expiring','2026-10-04T08:00:00.000Z');
    const expiringAsset=await f.create(expiring.client,'expiry');
    f.advance(86_400_000);
    await assert.rejects(readTrialManualTeethGate(request(expiring.client,expiringAsset)),
      /TRIAL_EXPIRED/);
  }finally{await f.cleanup();}
});

test('TEETH-GATE-HTTP05: preabort and in-flight cancellation return no evidence',async()=>{
  const f=await fixture();
  try{
    const owner=await f.login('Owner');
    const asset=await f.create(owner.client,'abort');
    await assert.rejects(readTrialManualTeethGate({...request(owner.client,asset),
      signal:AbortSignal.abort()}),{name:'AbortError'});
    const controller=new AbortController();
    let readStarted=false;
    owner.intercept((url,init,next)=>{
      if(url.includes('/original?')){
        readStarted=true;controller.abort();
      }
      return next();
    });
    await assert.rejects(readTrialManualTeethGate({...request(owner.client,asset),
      signal:controller.signal}),{name:'AbortError'});
    assert.equal(readStarted,true);
  }finally{await f.cleanup();}
});
