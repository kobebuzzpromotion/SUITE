import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {WorkspacePresetClient,WorkspacePresetHTTPError} from '../src/workspace-preset-client.mjs';

const glow={mode:'halation',intensity:71,radius:9,threshold:120,
  exposure:30,diffusion:55,tint:-18};
const neutral=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,
  rotationDegrees:0,extendedParameters:{},
  processingOrder:['exposure','contrast','saturation','rotation']}});
const pure=()=>{const value=neutral();value.parameters.extendedParameters={
  postDecodeAdjustments:{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',
    color:{glow}}};value.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');return value;};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bw=(id,hash)=>({schemaVersion:1,engineVersion:'suite-srgb8-explicit-mask-bw-edge-1',
  binding:{assetID:id,originalSHA256:hash,sourceWidth:16,sourceHeight:16},
  subjectStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.1,hardness:1}],
  correctionStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.1,hardness:1}]});
const shadow=(target,backdrop)=>({schemaVersion:1,
  engineVersion:'suite-srgb8-explicit-mask-shadow-1',
  binding:{assetID:target.id,originalSHA256:target.sha256,sourceWidth:16,sourceHeight:16,
    backdropID:backdrop.id,backdropSHA256:backdrop.sha256},
  subjectStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.1,hardness:1}],
  settings:{mode:'drop',opacity:80,blur:0,gradient:0,blend:'normal',offsetX:2,
    offsetY:1,shadowColor:[0,0,0]}});
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'suite-glow-atomic-'));
  const assets=new AssetRepository(join(dir,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(dir,'objects'));
  const workspace=new WorkspaceHTTP(dir,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='glow-atomic-test';
  const server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
    audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),workspace);
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const baseURL=`http://127.0.0.1:${server.address().port}`;
  const token=(user='owner',expiry='5m')=>new SignJWT({tenant_id:user==='owner'?'owner-tenant':'viewer-tenant',
    email:`${user}@example.test`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'glow-atomic-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  async function request(path,{user='owner',method='GET',body}={}){
    const response=await fetch(baseURL+path,{method,headers:{Authorization:`Bearer ${await token(user)}`,
      ...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  const wid=(await request('/v1/workspaces',{method:'POST',body:{name:'Glow Studio'}})).body.workspace.id;
  const path=`/v1/workspaces/${wid}`;
  const pid=(await request(`${path}/projects`,{method:'POST',body:{name:'Edited photos'}})).body.project.id;
  async function asset(label){const bytes=Buffer.from(`SYNTHETIC_NON_RAW_GLOW_ATOMIC_${label}`);
    return (await request(`${path}/projects/${pid}/assets`,{method:'POST',body:{
      name:`${label}.nonraw`,sha256:sha(bytes),size:bytes.length}})).body.asset;}
  const target=await asset('target'),backdrop=await asset('backdrop'),legacy=await asset('legacy');
  const targetBody=neutral();targetBody.parameters.exposure=.6;targetBody.parameters.contrast=1.25;
  targetBody.parameters.extendedParameters={bwEdgeManual:bw(target.id,target.sha256),
    addShadowManual:shadow(target,backdrop)};
  assert.equal((await request(`${path}/projects/${pid}/assets/${target.id}/recipe`,
    {method:'PUT',body:{baseVersion:0,recipe:targetBody}})).status,200);
  const legacyBody=neutral();legacyBody.parameters.exposure=.4;
  assert.equal((await request(`${path}/projects/${pid}/assets/${legacy.id}/recipe`,
    {method:'PUT',body:{baseVersion:0,recipe:legacyBody}})).status,200);
  const client=(user='owner',overrides={})=>new WorkspacePresetClient({baseURL,workspaceId:wid,
    expectedSubject:user,expectedTenantId:user==='owner'?'owner-tenant':'viewer-tenant',
    tokenProvider:()=>token(user),...overrides});
  const recipePath=id=>`${path}/projects/${pid}/assets/${id}/recipe`;
  const historyPath=id=>`${path}/projects/${pid}/assets/${id}/versions`;
  return {wid,pid,target,backdrop,legacy,targetBody,legacyBody,path,client,token,request,
    recipePath,historyPath,async close(){await new Promise(done=>server.close(done));
      workspace.close();assets.close();const targetDir=resolve(dir),base=resolve(tmpdir())+sep;
      if(!targetDir.startsWith(base)||!targetDir.split(sep).at(-1)?.startsWith('suite-glow-atomic-'))
        throw Error('UNSAFE_TEST_CLEANUP');
      await rm(targetDir,{recursive:true,force:true});}};
}

test('GLOW-ATOMIC-HTTP01: JWT/SQLite versioned Glow merge preserves exposure, B/W and Shadow bindings, while legacy full replace stays unchanged',async()=>{
  const f=await fixture();try{
    const owner=f.client();
    const preset=(await owner.createPreset({scope:'PERSONAL',name:'Glow only',body:pure()})).preset;
    const result=await owner.applyGlowPresetVersioned({presetId:preset.id,
      expectedPresetVersion:1,projectId:f.pid,assetId:f.target.id,baseVersion:1,
      expectedOriginalSHA256:f.target.sha256});
    assert.equal(result.outcome,'saved');assert.equal(result.version.branch,false);
    assert.equal(result.version.version,2);
    assert.deepEqual(result.version.presetSnapshot,{id:preset.id,version:1,body:pure()});
    const saved=(await f.request(f.recipePath(f.target.id))).body.recipe;
    assert.equal(saved.body.parameters.exposure,.6);
    assert.equal(saved.body.parameters.contrast,1.25);
    assert.deepEqual(saved.body.parameters.extendedParameters.bwEdgeManual,
      f.targetBody.parameters.extendedParameters.bwEdgeManual);
    assert.deepEqual(saved.body.parameters.extendedParameters.addShadowManual,
      f.targetBody.parameters.extendedParameters.addShadowManual);
    assert.deepEqual(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.glow,glow);
    assert.deepEqual(saved.body.parameters.processingOrder,
      ['exposure','contrast','saturation','postDecodeAdjustments','rotation']);
    assert.deepEqual((await f.request(f.historyPath(f.target.id))).body.versions.map(item=>item.version),[1,2]);
    const full=await owner.applyPresetVersioned({presetId:preset.id,expectedPresetVersion:1,
      projectId:f.pid,assetId:f.legacy.id,baseVersion:1});
    assert.equal(full.outcome,'saved');
    assert.deepEqual((await f.request(f.recipePath(f.legacy.id))).body.recipe.body,pure(),
      'legacy endpoint remains full Recipe replacement');
    assert.equal((await f.request(`${f.path}/projects/${f.pid}/assets`)).body.assets
      .find(asset=>asset.id===f.target.id).sha256,f.target.sha256);
  }finally{await f.close();}
});

test('GLOW-ATOMIC-HTTP02: stale target/Preset, wrong SHA, impure Preset, viewer/expiry reject with zero branch writes',async()=>{
  const f=await fixture();try{
    const owner=f.client(),good=(await owner.createPreset({scope:'WORKSPACE',name:'Good',body:pure()})).preset;
    const bad=(await owner.createPreset({scope:'PERSONAL',name:'Not Glow-only',
      body:{...neutral(),parameters:{...neutral().parameters,exposure:.2}}})).preset;
    const apply=(overrides={})=>owner.applyGlowPresetVersioned({presetId:good.id,
      expectedPresetVersion:1,projectId:f.pid,assetId:f.target.id,baseVersion:1,
      expectedOriginalSHA256:f.target.sha256,...overrides});
    async function denied(promise,status,code){await assert.rejects(promise,error=>
      error instanceof WorkspacePresetHTTPError&&error.status===status&&error.code===code);}
    await assert.rejects(apply({baseVersion:0}),/WORKSPACE_GLOW_PRESET_INPUT_INVALID/);
    await denied(apply({baseVersion:2}),409,'RECIPE_VERSION_CONFLICT');
    await denied(apply({expectedOriginalSHA256:'f'.repeat(64)}),409,'ORIGINAL_IDENTITY_CONFLICT');
    await denied(apply({presetId:bad.id}),400,'INVALID_GLOW_ONLY_PRESET');
    await owner.updatePreset(good.id,{baseVersion:1,name:'Good v2',body:pure()});
    await denied(apply(),409,'PRESET_VERSION_CONFLICT');
    const invite=await f.request(`${f.path}/invitations`,{method:'POST',body:{
      email:'viewer@example.test',role:'VIEWER',expiresAt:'2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status,201);
    assert.equal((await f.request(`${f.path}/invitations/accept`,{user:'viewer',method:'POST',
      body:{token:invite.body.token}})).status,200);
    await assert.rejects(f.client('viewer').applyGlowPresetVersioned({presetId:good.id,
      expectedPresetVersion:2,projectId:f.pid,assetId:f.target.id,baseVersion:1,
      expectedOriginalSHA256:f.target.sha256}),/WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`${f.path}/members/viewer`,{method:'DELETE'})).status,200);
    await assert.rejects(f.client('viewer').applyGlowPresetVersioned({presetId:good.id,
      expectedPresetVersion:2,projectId:f.pid,assetId:f.target.id,baseVersion:1,
      expectedOriginalSHA256:f.target.sha256}),error=>error.status===403);
    const expired=f.client('owner',{tokenProvider:()=>f.token('owner','-1s')});
    await assert.rejects(expired.applyGlowPresetVersioned({presetId:good.id,
      expectedPresetVersion:2,projectId:f.pid,assetId:f.target.id,baseVersion:1,
      expectedOriginalSHA256:f.target.sha256}),error=>error.status===401);
    const versions=(await f.request(f.historyPath(f.target.id))).body.versions;
    assert.deepEqual(versions.map(item=>[item.version,item.branch]),[[1,false]],
      'no conflict branch or partial save');
    assert.deepEqual((await f.request(f.recipePath(f.target.id))).body.recipe.body,f.targetBody);
  }finally{await f.close();}
});
