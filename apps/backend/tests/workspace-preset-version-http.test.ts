import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceHTTP} from '../src/workspace-server.js';
import {suiteServer} from '../src/server.js';
import {jwtAuthenticator} from '../src/auth.js';

const recipe=(exposure:number)=>({schemaVersion:1,parameters:{exposure,
  contrast:1,saturation:1,rotationDegrees:0,extendedParameters:{},
  processingOrder:['exposure','contrast','saturation','rotation']}});
const bytes=Buffer.from('Preset version HTTP/SQLite fixture; not a RAW image');
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-preset-version-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const workspace=new WorkspaceHTTP(root,assets,new LocalObjectStorage(join(root,'objects')));
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='preset-version-test';
  const authenticate=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',
    jwks:createLocalJWKSet({keys:[jwk]})});
  const token=(user:string)=>new SignJWT({tenant_id:'personal',
    email:`${user}@example.com`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'preset-version-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const server=suiteServer(assets,new LocalObjectStorage(join(root,'objects')),
    authenticate,workspace);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}`;
  const request=async(path:string,user='owner',method='GET',data?:unknown)=>{
    const response=await fetch(base+path,{method,headers:{authorization:
      `Bearer ${await token(user)}`,...(data===undefined?{}:{'content-type':'application/json'})},
      ...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:response.status,body:await response.json() as any};
  };
  const expect=async(path:string,user='owner',method='GET',data?:unknown,status=200)=>{
    const result=await request(path,user,method,data);
    assert.equal(result.status,status,JSON.stringify(result.body));return result.body;
  };
  const wid=(await expect('/v1/workspaces','owner','POST',{name:'Preset Studio'},201)).workspace.id as string;
  const path=`/v1/workspaces/${wid}`;
  const pid=(await expect(`${path}/projects`,'owner','POST',{name:'Portraits'},201)).project.id as string;
  const project=`${path}/projects/${pid}`;
  const asset=(await expect(`${project}/assets`,'owner','POST',{
    name:'fixture.bin',sha256:createHash('sha256').update(bytes).digest('hex'),
    size:bytes.length},201)).asset;
  const assetPath=`${project}/assets/${asset.id}`;
  const addMember=async(user:string,role='EDITOR')=>{
    const invitation=(await expect(`${path}/invitations`,'owner','POST',{
      email:`${user}@example.com`,role,expiresAt:new Date(Date.now()+600000).toISOString()},201));
    await expect(`${path}/invitations/accept`,user,'POST',{token:invitation.token});
  };
  return {workspace,request,expect,path,assetPath,addMember,wid,pid,asset,
    close:async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>
      error?reject(error):resolve()));workspace.close();assets.close();
      await rm(root,{recursive:true,force:true});}};
}

test('WS-PRESET-PIN-01: HTTP requires selected version; transactional apply saves that exact snapshot, while legacy direct call remains latest',async()=>{
  const f=await fixture();try{
    const first=(await f.expect(`${f.path}/presets`,'owner','POST',{
      name:'Standard',body:recipe(0.2)},201)).preset;
    const direct=f.workspace.workspaces.applyPreset({userId:'owner'},f.wid,f.pid,
      f.asset.id,0,first.id);
    assert.equal(direct.outcome,'saved');
    assert.equal(direct.version.presetSnapshot?.version,1);
    const changed=(await f.expect(`${f.path}/presets/${first.id}`,'owner','PATCH',{
      baseVersion:1,name:'Standard v2',body:recipe(0.8)})).preset;
    assert.equal(changed.version,2);
    const noVersion=await f.expect(`${f.assetPath}/preset`,'owner','POST',{
      baseVersion:1,presetId:first.id},400);
    assert.equal(noVersion.error,'INVALID_PRESET_VERSION');
    for(const invalid of [0,-1,1.5,'2',null]){
      const result=await f.expect(`${f.assetPath}/preset`,'owner','POST',{
        baseVersion:1,presetId:first.id,expectedPresetVersion:invalid},400);
      assert.equal(result.error,'INVALID_PRESET_VERSION');
    }
    const stale=await f.expect(`${f.assetPath}/preset`,'owner','POST',{
      baseVersion:1,presetId:first.id,expectedPresetVersion:1},409);
    assert.equal(stale.error,'PRESET_VERSION_CONFLICT');
    assert.equal((await f.expect(`${f.assetPath}/versions`)).versions.length,1);
    const applied=await f.expect(`${f.assetPath}/preset`,'owner','POST',{
      baseVersion:1,presetId:first.id,expectedPresetVersion:2});
    assert.equal(applied.outcome,'saved');
    assert.equal(applied.version.presetSnapshot.version,2);
    assert.deepEqual(applied.version.presetSnapshot.body,recipe(0.8));
    assert.deepEqual((await f.expect(`${f.assetPath}/recipe`)).recipe,applied.version);
  }finally{await f.close();}
});

test('WS-PRESET-PIN-02: another member, stale parallel applies and Recipe CAS cannot silently apply a different version',async()=>{
  const f=await fixture();try{
    await f.addMember('editor');await f.addMember('viewer','VIEWER');
    const personal=(await f.expect(`${f.path}/presets`,'owner','POST',{
      name:'Only owner',scope:'PERSONAL',body:recipe(0.1)},201)).preset;
    await f.expect(`${f.assetPath}/preset`,'editor','POST',{
      baseVersion:0,presetId:personal.id,expectedPresetVersion:1},404);
    await f.expect(`${f.assetPath}/preset`,'viewer','POST',{
      baseVersion:0,presetId:personal.id,expectedPresetVersion:1},403);
    const shared=(await f.expect(`${f.path}/presets`,'owner','POST',{
      name:'Shared',body:recipe(0.3)},201)).preset;
    await f.expect(`${f.path}/presets/${shared.id}`,'owner','PATCH',{
      baseVersion:1,name:'Shared v2',body:recipe(0.6)});
    const stale=await Promise.all([f.request(`${f.assetPath}/preset`,'owner','POST',{
      baseVersion:0,presetId:shared.id,expectedPresetVersion:1}),
    f.request(`${f.assetPath}/preset`,'editor','POST',{
      baseVersion:0,presetId:shared.id,expectedPresetVersion:1})]);
    assert.deepEqual(stale.map(result=>result.status),[409,409]);
    assert.equal((await f.expect(`${f.assetPath}/versions`)).versions.length,0);
    const first=await f.expect(`${f.assetPath}/preset`,'editor','POST',{
      baseVersion:0,presetId:shared.id,expectedPresetVersion:2});
    assert.equal(first.version.presetSnapshot.version,2);
    const recipeConflict=await f.expect(`${f.assetPath}/preset`,'owner','POST',{
      baseVersion:0,presetId:shared.id,expectedPresetVersion:2},409);
    assert.equal(recipeConflict.outcome,'conflict');
    assert.equal((await f.expect(`${f.assetPath}/recipe`)).recipe.version,first.version.version);
  }finally{await f.close();}
});

test('WS-PRESET-PIN-03: concurrent Preset update and apply serialize to pinned snapshot or conflict, never silently use new body',async()=>{
  const f=await fixture();try{
    const preset=(await f.expect(`${f.path}/presets`,'owner','POST',{
      name:'Concurrent',body:recipe(0.2)},201)).preset;
    const [update,apply]=await Promise.all([
      f.request(`${f.path}/presets/${preset.id}`,'owner','PATCH',{
        baseVersion:1,name:'Concurrent v2',body:recipe(0.9)}),
      f.request(`${f.assetPath}/preset`,'owner','POST',{
        baseVersion:0,presetId:preset.id,expectedPresetVersion:1})
    ]);
    assert.equal(update.status,200);
    assert.ok([200,409].includes(apply.status));
    const versions=(await f.expect(`${f.assetPath}/versions`)).versions;
    if(apply.status===200){
      assert.equal(versions.length,1);
      assert.equal(apply.body.version.presetSnapshot.version,1);
      assert.deepEqual(apply.body.version.presetSnapshot.body,recipe(0.2));
    }else{
      assert.equal(apply.body.error,'PRESET_VERSION_CONFLICT');
      assert.equal(versions.length,0);
    }
    const stale=await f.expect(`${f.assetPath}/preset`,'owner','POST',{
      baseVersion:versions.length,presetId:preset.id,expectedPresetVersion:1},409);
    assert.equal(stale.error,'PRESET_VERSION_CONFLICT');
    assert.equal((await f.expect(`${f.assetPath}/versions`)).versions.length,versions.length);
  }finally{await f.close();}
});
