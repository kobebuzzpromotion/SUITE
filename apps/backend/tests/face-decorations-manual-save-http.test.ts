import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceHTTP} from '../src/workspace-server.js';
import {suiteServer} from '../src/server.js';
import {jwtAuthenticator} from '../src/auth.js';

const neutral=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,
  saturation:1,rotationDegrees:0,extendedParameters:{},
  processingOrder:['exposure','contrast','saturation','rotation']}});
const recipe=(assetID:string,originalSHA256:string)=>({schemaVersion:1,
  parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:0,
    extendedParameters:{faceDecorationsManual:{schemaVersion:1,
      engineVersion:'suite-srgb8-owner-manual-freckles-1',
      binding:{assetID,originalSHA256,
        personID:'33333333-3333-4333-8333-333333333333',
        sourceWidth:400,sourceHeight:300},
      points:[{u:.45,v:.5,radiusFraction:.012,
        color:{r:85,g:65,b:45},opacity:.6}]}},
    processingOrder:['exposure','contrast','saturation','rotation']}});

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-freckles-save-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const workspace=new WorkspaceHTTP(root,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='freckles-save-fixture';
  const authenticate=jwtAuthenticator({issuer:'https://issuer.example',
    audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})});
  const token=(user:string,expired=false)=>new SignJWT({tenant_id:user,
    email:`${user}@example.com`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'freckles-save-fixture'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt(expired?Math.floor(Date.now()/1000)-120:undefined)
    .setExpirationTime(expired?Math.floor(Date.now()/1000)-60:'5m')
    .sign(privateKey);
  const server=suiteServer(assets,storage,authenticate,workspace);
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}`;
  const request=async(path:string,user='owner',method='GET',data?:unknown,
    expired=false)=>{
    const response=await fetch(base+path,{method,headers:{
      authorization:`Bearer ${await token(user,expired)}`,
      ...(data===undefined?{}:{'content-type':'application/json'})},
    ...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:response.status,body:await response.json() as any};
  };
  const expect=async(path:string,user='owner',method='GET',data?:unknown,
    status=200)=>{
    const result=await request(path,user,method,data);
    assert.equal(result.status,status,JSON.stringify(result.body));
    return result.body;
  };
  const wid=(await expect('/v1/workspaces','owner','POST',
    {name:'Freckle Studio'},201)).workspace.id as string;
  const wpath=`/v1/workspaces/${wid}`;
  const pid=(await expect(`${wpath}/projects`,'owner','POST',
    {name:'Portraits'},201)).project.id as string;
  const project=`${wpath}/projects/${pid}`;
  const create=async(name:string)=>{
    const bytes=Buffer.from(`${name}: synthetic data, not RAW`);
    return (await expect(`${project}/assets`,'owner','POST',
      {name,sha256:createHash('sha256').update(bytes).digest('hex'),
        size:bytes.length},201)).asset;
  };
  const asset=await create('source.bin'),other=await create('other.bin');
  const close=async()=>{
    await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));
    workspace.close();assets.close();
    const absolute=resolve(root),tempRoot=resolve(tmpdir())+sep;
    assert.ok(absolute.startsWith(tempRoot));
    await rm(absolute,{recursive:true,force:true});
  };
  return {root,request,expect,wpath,project,asset,other,close};
}

test('FRECKLES-SAVE-HTTP-01 Workspace registered Asset/SHA, role, CAS and history are bound',async()=>{
  const f=await fixture();try{
    const path=`${f.project}/assets/${f.asset.id}`;
    const body=recipe(f.asset.id,f.asset.sha256);
    const saved=await f.expect(`${path}/recipe`,'owner','PUT',
      {baseVersion:0,recipe:body});
    assert.equal(saved.outcome,'saved');assert.equal(saved.version.version,1);
    assert.deepEqual((await f.expect(`${path}/recipe`)).recipe.body,body);
    assert.equal((await f.expect(`${path}/versions`)).versions.length,1);
    for(const wrong of [recipe(f.other.id,f.asset.sha256),
      recipe(f.asset.id,f.other.sha256)]){
      const denied=await f.expect(`${path}/recipe`,'owner','PUT',
        {baseVersion:1,recipe:wrong},400);
      assert.equal(denied.error,'INVALID_FACE_DECORATIONS_MANUAL_BINDING');
    }
    const invitation=await f.expect(`${f.wpath}/invitations`,'owner','POST',
      {email:'viewer@example.com',role:'VIEWER',
        expiresAt:new Date(Date.now()+600000).toISOString()},201);
    await f.expect(`${f.wpath}/invitations/accept`,'viewer','POST',
      {token:invitation.token});
    assert.equal((await f.request(`${path}/recipe`,'viewer','PUT',
      {baseVersion:1,recipe:body})).status,403);
    assert.equal((await f.request(`${path}/recipe`,'owner','PUT',
      {baseVersion:1,recipe:body},true)).status,401);
    const conflict=await f.expect(`${path}/recipe`,'owner','PUT',
      {baseVersion:0,recipe:body},409);
    assert.equal(conflict.error,'FACE_DECORATIONS_MANUAL_REVISION_CONFLICT');
    assert.equal((await f.expect(`${path}/versions`)).versions.length,1);
    await f.expect(`${path}/trash`,'owner','POST');
    assert.notEqual((await f.request(`${path}/recipe`,'owner','PUT',
      {baseVersion:1,recipe:body})).status,200);
  }finally{await f.close();}
});

test('FRECKLES-SAVE-HTTP-02 Trial tenant, current SHA and CAS guard save/readback',async()=>{
  const f=await fixture();try{
    const bytes=Buffer.from('Trial freckles synthetic Asset, not RAW');
    const hash=createHash('sha256').update(bytes).digest('hex');
    const asset=await f.expect('/v1/assets','trial','POST',
      {name:'trial.bin',sha256:hash,size:bytes.length},201);
    const path=`/v1/assets/${asset.id}`,body=recipe(asset.id,asset.sha256);
    assert.equal((await f.request(`${path}/recipe`,'outsider','PUT',
      {expectedRevision:0,recipe:body})).status,404);
    assert.equal((await f.request(`${path}/recipe`,'trial','PUT',
      {expectedRevision:0,recipe:body},true)).status,401);
    for(const wrong of [recipe(f.asset.id,asset.sha256),
      recipe(asset.id,f.other.sha256)]){
      const denied=await f.expect(`${path}/recipe`,'trial','PUT',
        {expectedRevision:0,recipe:wrong},400);
      assert.equal(denied.error,'INVALID_FACE_DECORATIONS_MANUAL_BINDING');
    }
    assert.equal((await f.expect(`${path}/recipe`,'trial')).recipe,null);
    const saved=await f.expect(`${path}/recipe`,'trial','PUT',
      {expectedRevision:0,recipe:body});
    assert.equal(saved.revision,1);
    assert.deepEqual((await f.expect(`${path}/recipe`,'trial')).recipe.body,body);
    const stale=await f.expect(`${path}/recipe`,'trial','PUT',
      {expectedRevision:0,recipe:body},409);
    assert.equal(stale.error,'REVISION_CONFLICT');
    const db=new DatabaseSync(join(f.root,'assets.sqlite'));
    try{db.prepare('UPDATE assets SET sha256=? WHERE id=? AND tenant_id=?')
      .run('c'.repeat(64),asset.id,'trial');}finally{db.close();}
    const changed=await f.expect(`${path}/recipe`,'trial','GET',undefined,400);
    assert.equal(changed.error,'INVALID_FACE_DECORATIONS_MANUAL_BINDING');
    const restore=new DatabaseSync(join(f.root,'assets.sqlite'));
    try{restore.prepare('UPDATE assets SET sha256=? WHERE id=? AND tenant_id=?')
      .run(hash,asset.id,'trial');}finally{restore.close();}
    await f.expect(`${path}/trash`,'trial','POST');
    assert.equal((await f.request(`${path}/recipe`,'trial','PUT',
      {expectedRevision:1,recipe:body})).status,404);
  }finally{await f.close();}
});

test('FRECKLES-SAVE-HTTP-03 neutral Recipe keeps historical branch behavior',async()=>{
  const f=await fixture();try{
    const path=`${f.project}/assets/${f.asset.id}`;
    const first=await f.expect(`${path}/recipe`,'owner','PUT',
      {baseVersion:0,recipe:neutral()});
    assert.equal(first.outcome,'saved');
    const branch=await f.expect(`${path}/recipe`,'owner','PUT',
      {baseVersion:0,recipe:neutral()},409);
    assert.equal(branch.outcome,'conflict');
    assert.equal(branch.version.branch,true);
    assert.equal((await f.expect(`${path}/recipe`)).recipe.version,1);
  }finally{await f.close();}
});
