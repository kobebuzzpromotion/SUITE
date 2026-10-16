import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {neutralRecipe} from '../src/session.mjs';

const START=Date.parse('2026-10-03T08:00:00.000Z');
const END='2026-11-03T08:00:00.000Z';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const glowRecipe=(mode='halation')=>{
  const body=neutralRecipe();
  body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',color:{glow:{mode,intensity:72,
      radius:9,threshold:118,exposure:34,diffusion:63,tint:-27}}};
  body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  return body;
};

async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-glow-trial-http-'));
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
    assert.match(cookie,/^suite_trial=/);
    const client=new TrialClient({baseURL,fetcher:(url,init)=>fetch(url,
      {...init,headers:{...init.headers,Cookie:cookie}})});
    return {author,client};
  }
  async function create(client){
    const bytes=Buffer.from('SYNTHETIC_NON_RAW_GLOW_HTTP_ORIGINAL');
    const asset=await client.createAsset({name:'glow.NONRAW',sha256:sha(bytes),size:bytes.length});
    await client.putOriginal(asset.id,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const saved=await client.saveRecipe(asset.id,0,neutralRecipe());
    return {asset,saved,bytes};
  }
  async function close(){
    await new Promise(done=>context.server.close(done));
    const target=resolve(dataDir),base=resolve(tmpdir())+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)?.startsWith('suite-glow-trial-http-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});
  }
  return {context,login,create,close,advance(ms){now+=ms;}};
}

test('GLOW-TRIAL-HTTP01: all six controls and mode persist through authenticated SQLite save/reload with Original fixed',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Glow owner');
    const {asset,saved,bytes}=await f.create(client);
    assert.equal(saved.revision,1);
    const body=glowRecipe();
    const next=await client.saveRecipe(asset.id,1,body);
    assert.equal(next.revision,2);
    const reloaded=await client.getRecipe(asset.id);
    assert.equal(reloaded.revision,2);
    assert.deepEqual(reloaded.body,body);
    assert.deepEqual(reloaded.body.parameters.extendedParameters.postDecodeAdjustments.color.glow,
      {mode:'halation',intensity:72,radius:9,threshold:118,exposure:34,diffusion:63,tint:-27});
    assert.equal(sha(Buffer.from(await client.getOriginal(asset.id))),asset.sha256);
    assert.equal(sha(bytes),asset.sha256);
  }finally{await f.close();}
});

test('GLOW-TRIAL-HTTP02: stale CAS, foreign identity and expired permission cannot overwrite Glow',async()=>{
  const f=await fixture();try{
    const {client:owner,author}=await f.login('Glow owner');
    const {client:foreign}=await f.login('Other author');
    const {asset}=await f.create(owner);
    await owner.saveRecipe(asset.id,1,glowRecipe('whiteMist'));
    await assert.rejects(owner.saveRecipe(asset.id,1,glowRecipe('blackMist')),
      /REVISION|CONFLICT/i);
    await assert.rejects(foreign.assertPermission(asset.id,'edit'),
      /DENIED|FORBIDDEN|UNAUTHORIZED|NOT_FOUND/i);
    await assert.rejects(foreign.saveRecipe(asset.id,2,glowRecipe('halation')),
      /DENIED|FORBIDDEN|UNAUTHORIZED|NOT_FOUND/i);
    assert.equal((await owner.getRecipe(asset.id)).body.parameters.extendedParameters
      .postDecodeAdjustments.color.glow.mode,'whiteMist');
    f.advance(Date.parse(END)-START);
    await assert.rejects(owner.assertPermission(asset.id,'edit'),/TRIAL_EXPIRED|UNAUTHORIZED/i);
    await assert.rejects(owner.saveRecipe(asset.id,2,glowRecipe('halation')),
      /TRIAL_EXPIRED|UNAUTHORIZED/i);
    const stored=f.context.repo.latestRecipe('trial-'+author.id,asset.id);
    assert.equal(stored?.revision,2);
  }finally{await f.close();}
});
