import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {readTrialDngCaptureDateNamingInput} from
  '../src/export-capture-date-naming.mjs';
import {buildExportFilename} from '../src/export-naming.mjs';
import {recipe} from './fixtures.mjs';

const START=Date.parse('2026-10-03T08:00:00.000Z');
const END='2026-11-03T08:00:00.000Z';
const sha=bytes=>createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
// Synthetic TIFF with narrow DNG-signalling tags: NOT real RAW/decodability QA.
function syntheticDng({date='2024:02:29 23:59:58',offset='+09:00',dng=true}={}){
  const bytes=new Uint8Array(384),view=new DataView(bytes.buffer);
  bytes[0]=bytes[1]=0x49;view.setUint16(2,42,true);view.setUint32(4,8,true);
  view.setUint16(8,4,true);
  function entry(at,tag,type,count,value){
    view.setUint16(at,tag,true);view.setUint16(at+2,type,true);
    view.setUint32(at+4,count,true);view.setUint32(at+8,value,true);
  }
  entry(10,0x0112,3,1,1);entry(22,0x8769,4,1,120);
  entry(34,dng?0xc612:0xc611,1,4,0);bytes.set([1,4,0,0],42);
  entry(46,0xc614,2,12,300);
  view.setUint16(120,offset===null?1:2,true);
  entry(122,0x9003,2,20,200);
  if(offset!==null)entry(134,0x9011,2,7,240);
  bytes.set(new TextEncoder().encode(`${date}\0`),200);
  if(offset!==null)bytes.set(new TextEncoder().encode(`${offset}\0`),240);
  bytes.set(new TextEncoder().encode('Test Camera\0'),300);
  return bytes.buffer;
}
async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-dng-naming-'));
  let now=START;
  const context=await createTrialServer({dataDir,port:0,clock:()=>now});
  await new Promise((done,reject)=>{
    context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);
  });
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  async function login(name,trialEndsAt=END){
    const author=context.auth.createAuthor({authorName:name,trialEndsAt});
    const invitation=context.auth.issueInvite(author.id);
    const response=await fetch(baseURL+'/trial/login',{method:'POST',
      headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:invitation.inviteToken})});
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie,/^suite_trial=/);
    let interceptor;
    const client=new TrialClient({baseURL,fetcher:(url,init)=>{
      const request={...init,headers:{...init.headers,Cookie:cookie}};
      return interceptor?interceptor(url,request,()=>fetch(url,request)):
        fetch(url,request);
    }});
    return {client,intercept(fn){interceptor=fn;}};
  }
  async function create(client,name,original=syntheticDng()){
    const asset=await client.createAsset({name:`${name}.dng`,sha256:sha(original),
      size:original.byteLength});
    await client.putOriginal(asset.id,original);
    const saved=await client.saveRecipe(asset.id,0,recipe());
    assert.equal(saved.revision,1);
    return {asset,original,state:{asset:{...asset},revision:saved.revision,
      recipe:saved.body,dirty:false}};
  }
  return {context,login,create,advance(milliseconds){now+=milliseconds;},
    async cleanup(){
      await new Promise((done,reject)=>context.server.close(error=>
        error?reject(error):done()));
      const target=resolve(dataDir),base=resolve(tmpdir())+sep;
      if(!target.startsWith(base)||!target.split(sep).at(-1).startsWith('suite-dng-naming-'))
        throw Error('DNG_NAMING_FIXTURE_CLEANUP_TARGET_INVALID');
      await rm(target,{recursive:true,force:true});
    }};
}

test('DNG-NAMING-HTTP01 / REAL_TRIAL_SQLITE_SYNTHETIC_DNG: fresh bound offset-bearing wall date becomes only a naming input',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Owner');
    const {asset,original,state}=await f.create(client,'portrait');
    const before=await client.getRecipe(asset.id);
    const result=await readTrialDngCaptureDateNamingInput({api:client,state});
    assert.deepEqual(result.binding,{assetID:asset.id,originalSHA256:sha(original),
      savedRevision:1});
    assert.deepEqual(result.namingInput,{method:'capture-date-original',
      captureDate:'2024-02-29'});
    assert.equal(buildExportFilename({originalFilename:'IMG_1234.dng',format:'jpeg',
      ...result.namingInput}),'20240229_IMG_1234.jpg');
    assert.equal(result.verification,
      'TRIAL_DNG_EXIF_WALL_DATE_WITH_OFFSET_NOT_FINAL_AUTHORITY');
    assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.binding)&&
      Object.isFrozen(result.namingInput));
    assert.deepEqual(await client.getRecipe(asset.id),before);
    assert.equal(sha(await client.getOriginal(asset.id)),sha(original));
  }finally{await f.cleanup();}
});

test('DNG-NAMING-HTTP02: offsetless, non-DNG, dirty and changed Recipe/Asset/SHA fail closed',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Owner');
    const withOffset=await f.create(client,'good');
    const noOffset=await f.create(client,'no-offset',syntheticDng({offset:null}));
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:client,
      state:noOffset.state}),/CAPTURE_DATE_NAMING_EVIDENCE_UNAVAILABLE/);
    const nonDng=await f.create(client,'not-dng',syntheticDng({dng:false}));
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:client,
      state:nonDng.state}),/EXIF_CAPTURE_DNG_VERSION_INVALID/);
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:client,
      state:{...withOffset.state,dirty:true}}),/CAPTURE_DATE_NAMING_INPUT_INVALID/);
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:client,
      state:{...withOffset.state,asset:{...withOffset.asset,sha256:'c'.repeat(64)}}}),
    /CAPTURE_DATE_GATE_ORIGINAL_CHANGED/);
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:client,
      state:{...withOffset.state,recipe:{...withOffset.state.recipe,extra:true}}}),
    /CAPTURE_DATE_NAMING_SAVED_RECIPE_MISMATCH/);
    await client.saveRecipe(withOffset.asset.id,1,recipe());
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:client,
      state:withOffset.state}),/CAPTURE_DATE_NAMING_SAVED_RECIPE_MISMATCH/);
  }finally{await f.cleanup();}
});

test('DNG-NAMING-HTTP03: state switch during read, another user, expired session and cancellation produce no date',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Owner'),other=await f.login('Other');
    const current=await f.create(owner.client,'owner');
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:other.client,
      state:current.state}),/CAPTURE_DATE_GATE_ASSET_UNAVAILABLE|FORBIDDEN|NOT_FOUND/);
    const switched={...current.state,asset:{...current.state.asset}};
    owner.intercept((url,request,next)=>{
      if(url.includes('/original?'))switched.asset.id=other.client.constructor.name;
      return next();
    });
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:owner.client,
      state:switched}),/CAPTURE_DATE_NAMING_STATE_CHANGED/);
    const preAbort=new AbortController();preAbort.abort();
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:owner.client,
      state:current.state,signal:preAbort.signal}),{name:'AbortError'});
    const inFlight=new AbortController();
    owner.intercept((url,request,next)=>{
      if(url.includes('/original?'))inFlight.abort();
      return next();
    });
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:owner.client,
      state:current.state,signal:inFlight.signal}),{name:'AbortError'});
    owner.intercept(undefined);
    f.advance(Date.parse(END)-START);
    await assert.rejects(readTrialDngCaptureDateNamingInput({api:owner.client,
      state:current.state}),/UNAUTHORIZED|EXPIRED|SESSION_REQUIRED/);
  }finally{await f.cleanup();}
});
