import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {neutralRecipe} from '../src/session.mjs';
import {mergeSavedGlow,applyBatchGlowSync} from '../src/batch-glow-sync.mjs';

const START=Date.parse('2026-10-03T08:00:00.000Z');
const END='2026-11-03T08:00:00.000Z';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const selected=asset=>({id:asset.id,sha256:asset.sha256,revision:asset.revision});
function recipe({glow,exposure=0,temperature=0,clarity=0}={}){
  const body=neutralRecipe();body.parameters.exposure=exposure;
  if(glow||temperature||clarity){
    body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
      engineVersion:'suite-srgb8-color-detail-1',
      ...(glow||temperature?{color:{...(glow?{glow:structuredClone(glow)}:{}),
        ...(temperature?{temperature}:{})}}:{}),
      ...(clarity?{detail:{clarity}}:{})};
    body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  }
  return body;
}
const sourceGlow={mode:'halation',intensity:72,radius:9,threshold:118,
  exposure:34,diffusion:63,tint:-27};
async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-glow-sync-http-'));
  let now=START;
  const context=await createTrialServer({dataDir,port:0,clock:()=>now});
  await new Promise((done,reject)=>{context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);});
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  async function login(name){
    const author=context.auth.createAuthor({authorName:name,trialEndsAt:END});
    const invite=context.auth.issueInvite(author.id);
    const response=await fetch(baseURL+'/trial/login',{method:'POST',
      headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:invite.inviteToken})});
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie')?.split(';')[0];
    const client=new TrialClient({baseURL,fetcher:(url,init)=>fetch(url,
      {...init,headers:{...init.headers,Cookie:cookie}})});
    return {author,client};
  }
  async function create(client,label,body){
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_GLOW_SYNC_${label}`);
    const registered=await client.createAsset({name:`${label}.nonraw`,sha256:sha(bytes),size:bytes.length});
    const asset=await client.putOriginal(registered.id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const saved=await client.saveRecipe(asset.id,0,body);
    return {...asset,revision:saved.revision,bytes};
  }
  async function close(){
    await new Promise(done=>context.server.close(done));
    const target=resolve(dataDir),base=resolve(tmpdir())+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)?.startsWith('suite-glow-sync-http-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});
  }
  return {login,create,close,advance(ms){now+=ms;}};
}

test('GLOW-SYNC-HTTP01: explicit two-target Trial sync copies only saved Glow with CAS, other edits and Originals fixed',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Glow owner');
    const sourceBody=recipe({glow:sourceGlow,exposure:1});
    const firstBody=recipe({glow:{mode:'whiteMist',intensity:12},exposure:-1,temperature:15,clarity:20});
    const secondBody=recipe({exposure:2,temperature:-20});
    const source=await f.create(client,'source',sourceBody);
    const first=await f.create(client,'first',firstBody);
    const second=await f.create(client,'second',secondBody);
    const result=await applyBatchGlowSync({api:client,source:selected(source),
      targets:[selected(first),selected(second)],expectedSourceRecipe:sourceBody});
    assert.equal(result.status,'complete');assert.equal(result.saved,2);
    for(const [asset,old] of [[first,firstBody],[second,secondBody]]){
      const saved=await client.getRecipe(asset.id);
      assert.equal(saved.revision,2);
      assert.deepEqual(saved.body,mergeSavedGlow(sourceBody,old));
      assert.deepEqual(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.glow,sourceGlow);
      assert.equal(saved.body.parameters.exposure,old.parameters.exposure);
      assert.equal(sha(Buffer.from(await client.getOriginal(asset.id))),asset.sha256);
    }
    assert.deepEqual((await client.getRecipe(source.id)).body,sourceBody);
    assert.equal(sha(Buffer.from(await client.getOriginal(source.id))),source.sha256);
  }finally{await f.close();}
});

test('GLOW-SYNC-HTTP02: neutral source removes only target Glow without altering other adjustments',()=>{
  const target=recipe({glow:sourceGlow,exposure:1,temperature:25,clarity:14});
  const cleared=mergeSavedGlow(neutralRecipe(),target);
  assert.equal(cleared.parameters.extendedParameters.postDecodeAdjustments.color.glow,undefined);
  assert.equal(cleared.parameters.extendedParameters.postDecodeAdjustments.color.temperature,25);
  assert.equal(cleared.parameters.extendedParameters.postDecodeAdjustments.detail.clarity,14);
  assert.equal(cleared.parameters.exposure,1);
  assert.deepEqual(target.parameters.extendedParameters.postDecodeAdjustments.color.glow,sourceGlow);
});

test('GLOW-SYNC-HTTP03: stale target and expired source never report all-saved',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Glow owner');
    const source=await f.create(client,'source',recipe({glow:sourceGlow}));
    const first=await f.create(client,'first',neutralRecipe());
    const second=await f.create(client,'second',neutralRecipe());
    await client.saveRecipe(first.id,1,neutralRecipe());
    const partial=await applyBatchGlowSync({api:client,source:selected(source),
      targets:[selected(first),selected(second)]});
    assert.equal(partial.status,'partial');
    assert.deepEqual(partial.results.map(row=>row.status),['failed','saved']);
    assert.equal(partial.results[0].reason,'GLOW_SYNC_REVISION_CONFLICT');
    f.advance(Date.parse(END)-START);
    await assert.rejects(applyBatchGlowSync({api:client,source:selected(source),
      targets:[selected(first),selected(second)]}),/TRIAL_EXPIRED|UNAUTHORIZED/i);
  }finally{await f.close();}
});
