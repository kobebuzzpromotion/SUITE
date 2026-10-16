import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {neutralRecipe} from '../src/session.mjs';
import {mergeSavedVignette, applyBatchVignetteSync} from '../src/batch-vignette-sync.mjs';

const root = resolve(import.meta.dirname, '../../..');
const runtime = resolve(root, '.runtime');
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const chosen = asset => ({id:asset.id,sha256:asset.sha256,revision:asset.revision});
const controls = {amount:-80,midpoint:65,roundness:-30,feather:70,highlights:45};
function recipe({vignette, exposure=0, temperature=0}={}) {
  const body=neutralRecipe();body.parameters.exposure=exposure;
  if(vignette)body.parameters.extendedParameters.postCropAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-manual-vignette-1',vignette:structuredClone(vignette)};
  if(temperature){body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',color:{temperature}};
    body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');}
  return body;
}
async function fixture(){
  await mkdir(runtime,{recursive:true});
  const dataDir=await mkdtemp(join(runtime,'vignette-sync-http-'));
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
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_VIGNETTE_SYNC_${label}`);
    const registered=await client.createAsset({name:`${label}.nonraw`,sha256:sha(bytes),size:bytes.length});
    const asset=await client.putOriginal(registered.id,
      bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const saved=await client.saveRecipe(asset.id,0,body);
    return {...asset,revision:saved.revision,bytes};
  }
  async function close(){
    await new Promise(done=>context.server.close(done));
    const target=resolve(dataDir),base=runtime+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)?.startsWith('vignette-sync-http-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});
  }
  return {login,create,close,advance(ms){now+=ms;}};
}

test('VIGNETTE-SYNC-HTTP01: two explicitly selected authenticated Assets get only five-control Vignette',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Vignette owner');
    const sourceBody=recipe({vignette:controls,exposure:1});
    const firstBody=recipe({vignette:{amount:35},exposure:-1,temperature:15});
    const secondBody=recipe({exposure:2,temperature:-20});
    const source=await f.create(client,'source',sourceBody);
    const first=await f.create(client,'first',firstBody);
    const second=await f.create(client,'second',secondBody);
    const result=await applyBatchVignetteSync({api:client,source:chosen(source),
      targets:[chosen(first),chosen(second)],expectedSourceRecipe:sourceBody});
    assert.equal(result.status,'complete');assert.equal(result.saved,2);
    for(const [asset,old] of [[first,firstBody],[second,secondBody]]){
      const saved=await client.getRecipe(asset.id);
      assert.equal(saved.revision,2);
      assert.deepEqual(saved.body,mergeSavedVignette(sourceBody,old));
      assert.deepEqual(saved.body.parameters.extendedParameters.postCropAdjustments.vignette,controls);
      assert.equal(saved.body.parameters.exposure,old.parameters.exposure);
      assert.equal(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.temperature,
        old.parameters.extendedParameters.postDecodeAdjustments.color.temperature);
      assert.equal(sha(Buffer.from(await client.getOriginal(asset.id))),asset.sha256);
    }
    assert.deepEqual((await client.getRecipe(source.id)).body,sourceBody);
    assert.equal(sha(Buffer.from(await client.getOriginal(source.id))),source.sha256);
  }finally{await f.close();}
});

test('VIGNETTE-SYNC-HTTP02: neutral source removes only Vignette and keeps unrelated adjustments',()=>{
  const old=recipe({vignette:controls,exposure:1.5,temperature:18});
  const merged=mergeSavedVignette(neutralRecipe(),old);
  assert.equal(merged.parameters.extendedParameters.postCropAdjustments,undefined);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.color.temperature,18);
  assert.equal(merged.parameters.exposure,1.5);
  assert.deepEqual(old.parameters.extendedParameters.postCropAdjustments.vignette,controls);
});

test('VIGNETTE-SYNC-HTTP03: stale target, foreign Asset, and expired trial cannot become all-saved',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Vignette owner');
    const {client:other}=await f.login('Other owner');
    const source=await f.create(client,'source',recipe({vignette:controls}));
    const first=await f.create(client,'first',neutralRecipe());
    const second=await f.create(client,'second',neutralRecipe());
    const foreign=await f.create(other,'foreign',neutralRecipe());
    await client.saveRecipe(first.id,1,neutralRecipe());
    const partial=await applyBatchVignetteSync({api:client,source:chosen(source),
      targets:[chosen(first),chosen(second)]});
    assert.equal(partial.status,'partial');
    assert.deepEqual(partial.results.map(row=>row.status),['failed','saved']);
    assert.equal(partial.results[0].reason,'VIGNETTE_SYNC_REVISION_CONFLICT');
    const foreignResult=await applyBatchVignetteSync({api:client,source:chosen(source),
      targets:[chosen(foreign),chosen(second)]});
    assert.equal(foreignResult.results[0].status,'failed');
    assert.equal(foreignResult.results[0].reason,'VIGNETTE_SYNC_ASSET_UNAVAILABLE');
    f.advance(Date.parse(END)-START);
    await assert.rejects(applyBatchVignetteSync({api:client,source:chosen(source),
      targets:[chosen(first),chosen(second)]}),/TRIAL_EXPIRED|UNAUTHORIZED/i);
  }finally{await f.close();}
});
