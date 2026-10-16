import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceHTTP} from '../src/workspace-server.js';
import {suiteServer} from '../src/server.js';
import {jwtAuthenticator} from '../src/auth.js';

const owner={userId:'owner'},editor={userId:'editor'},viewer={userId:'viewer'};
const recipe=(exposure=0)=>({schemaVersion:1,parameters:{exposure,contrast:1,saturation:1,
  rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-culling-preflight-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const http=new WorkspaceHTTP(root,assets,storage);
  const workspace=http.workspaces.createWorkspace(owner,'Preflight Studio');
  const project=http.workspaces.createProject(owner,workspace.id,'Selected Project');
  const addAsset=(name:string)=>{
    const bytes=Buffer.from(`synthetic-non-RAW:${name}`);
    const asset=assets.create(workspace.id,{name,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
    http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);
    return asset;
  };
  const addMember=(userId:string,role:'EDITOR'|'VIEWER')=>{
    const invite=http.workspaces.inviteMember(owner,workspace.id,{email:`${userId}@example.test`,role,expiresAt:'2099-01-01T00:00:00.000Z'});
    http.workspaces.acceptInvitation({userId},workspace.id,invite.token,`${userId}@example.test`);
  };
  return {root,assets,storage,http,workspace,project,addAsset,addMember,
    async close(){http.close();assets.close();await rm(root,{recursive:true,force:true});}};
}
const entry=(asset:{id:string;sha256:string},expectedRecipeVersion=1)=>({assetId:asset.id,
  expectedOriginalSHA256:asset.sha256,expectedRecipeVersion});
const input=(version:number,orderedAssets:unknown[])=>({expectedCullingVersion:version,orderedAssets});

test('CULLING-PREFLIGHT-DB01: ordered saved heads and SHA are checked without a write or Final authorization',async()=>{
  const f=await fixture();try{
    const a=f.addAsset('a.bin'),b=f.addAsset('b.bin'),wid=f.workspace.id,pid=f.project.id,repo=f.http.workspaces;
    const savedA=repo.saveRecipe(owner,wid,pid,a.id,{baseVersion:0,body:recipe(0.1)}).version;
    const savedB=repo.saveRecipe(owner,wid,pid,b.id,{baseVersion:0,body:recipe(0.2)}).version;
    const version=repo.getCullingVersion(owner,wid,pid),audit=repo.listAudit(owner,wid).length;
    const plan=repo.preflightCullingExport(owner,wid,pid,input(version,[entry(b),entry(a)]));
    assert.equal(plan.status,'PREFLIGHT_ONLY_RECHECK_BEFORE_FINAL');
    assert.equal(plan.authoritativeForFinal,false);
    assert.equal(plan.cullingVersion,version);
    assert.deepEqual(plan.orderedAssets,[
      {assetId:b.id,originalSHA256:b.sha256,recipeVersion:1,recipeVersionId:savedB.id},
      {assetId:a.id,originalSHA256:a.sha256,recipeVersion:1,recipeVersionId:savedA.id},
    ]);
    assert.equal(repo.listAudit(owner,wid).length,audit);
    assert.equal(repo.getCullingVersion(owner,wid,pid),version);
    assert.deepEqual(repo.recipeHistory(owner,wid,pid,a.id).map(row=>row.version),[1]);
    assert.deepEqual(repo.listAssets(owner,wid,pid).map(asset=>asset.id).sort(),[a.id,b.id].sort());
    assert.equal(f.assets.get(wid,a.id).sha256,a.sha256);
  }finally{await f.close();}
});

test('CULLING-PREFLIGHT-DB02: stale set, Recipe, SHA, trash, wrong Project and partial list fail closed',async()=>{
  const f=await fixture();try{
    const a=f.addAsset('a.bin'),b=f.addAsset('b.bin'),wid=f.workspace.id,pid=f.project.id,repo=f.http.workspaces;
    repo.saveRecipe(owner,wid,pid,a.id,{baseVersion:0,body:recipe()});
    let version=repo.getCullingVersion(owner,wid,pid);
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,[entry(a),entry(b)])),/RECIPE_VERSION_CONFLICT/);
    repo.saveRecipe(owner,wid,pid,b.id,{baseVersion:0,body:recipe()});
    const audit=repo.listAudit(owner,wid).length;
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,[entry(a),{...entry(b),expectedOriginalSHA256:'0'.repeat(64)}])),/ORIGINAL_IDENTITY_CONFLICT/);
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,[entry(a),entry(a)])),/INVALID_CULLING_PREFLIGHT/);
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,[])),/INVALID_CULLING_PREFLIGHT/);
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,Array.from({length:21},()=>entry(a)))),/INVALID_CULLING_PREFLIGHT/);
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,{...input(version,[entry(a)]),authoritativeForFinal:true}),/INVALID_CULLING_PREFLIGHT/);
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,[{...entry(a),permissionEvidence:'self-asserted'}])),/INVALID_CULLING_PREFLIGHT/);
    const sparse=Array(2);sparse[0]=entry(a);
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,sparse)),/INVALID_CULLING_PREFLIGHT/);
    assert.equal(repo.listAudit(owner,wid).length,audit,'partial validation did not write');
    const otherProject=repo.createProject(owner,wid,'Other');
    assert.throws(()=>repo.preflightCullingExport(owner,wid,otherProject.id,input(0,[entry(a)])),/ASSET_NOT_FOUND/);
    repo.saveRecipe(owner,wid,pid,b.id,{baseVersion:1,body:recipe(0.4)});
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,[entry(a),entry(b)])),/RECIPE_VERSION_CONFLICT/);
    repo.trashAsset(owner,wid,pid,b.id);version=repo.getCullingVersion(owner,wid,pid);
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,[entry(a),entry(b,2)])),/ASSET_NOT_FOUND/);
    repo.restoreAsset(owner,wid,pid,b.id);
    assert.throws(()=>repo.preflightCullingExport(owner,wid,pid,input(version,[entry(a),entry(b,2)])),/CULLING_VERSION_CONFLICT/);
    const fresh=repo.getCullingVersion(owner,wid,pid);
    assert.equal(repo.preflightCullingExport(owner,wid,pid,input(fresh,[entry(a),entry(b,2)])).orderedAssets.length,2);
  }finally{await f.close();}
});

test('CULLING-PREFLIGHT-DB03: export role, tenant and revocation are mandatory even for read-only preflight',async()=>{
  const f=await fixture();try{
    const a=f.addAsset('a.bin'),wid=f.workspace.id,pid=f.project.id,repo=f.http.workspaces;
    repo.saveRecipe(owner,wid,pid,a.id,{baseVersion:0,body:recipe()});
    f.addMember('editor','EDITOR');f.addMember('viewer','VIEWER');
    const version=repo.getCullingVersion(owner,wid,pid),selected=input(version,[entry(a)]);
    assert.equal(repo.preflightCullingExport(editor,wid,pid,selected).orderedAssets.length,1);
    assert.throws(()=>repo.preflightCullingExport(viewer,wid,pid,selected),/FORBIDDEN/);
    assert.throws(()=>repo.preflightCullingExport({userId:'stranger'},wid,pid,selected),/FORBIDDEN/);
    const other=repo.createWorkspace({userId:'stranger'},'Other Tenant');
    assert.throws(()=>repo.preflightCullingExport(owner,other.id,pid,selected),/FORBIDDEN/);
    repo.removeMember(owner,wid,'editor');
    assert.throws(()=>repo.preflightCullingExport(editor,wid,pid,selected),/FORBIDDEN/);
    assert.equal(repo.getCullingVersion(owner,wid,pid),version);
    assert.equal(f.assets.get(wid,a.id).sha256,a.sha256);
  }finally{await f.close();}
});

test('CULLING-PREFLIGHT-HTTP04: authenticated endpoint returns only all-valid reference plan and honest status',async()=>{
  const f=await fixture();
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='preflight-test';
  const authenticate=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})});
  const server=suiteServer(f.assets,f.storage,authenticate,f.http);
  try{
    const a=f.addAsset('a.bin'),b=f.addAsset('b.bin'),wid=f.workspace.id,pid=f.project.id,repo=f.http.workspaces;
    repo.saveRecipe(owner,wid,pid,a.id,{baseVersion:0,body:recipe()});
    repo.saveRecipe(owner,wid,pid,b.id,{baseVersion:0,body:recipe()});
    f.addMember('viewer','VIEWER');
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const url=`http://127.0.0.1:${address.port}/v1/workspaces/${wid}/projects/${pid}/culling/export-preflight`;
    const request=async(user:string,data:unknown,tokenOverride?:string)=>{
      const token=tokenOverride??await new SignJWT({tenant_id:'personal',email:`${user}@example.test`,email_verified:true})
        .setProtectedHeader({alg:'RS256',kid:'preflight-test'}).setIssuer('https://issuer.example').setAudience('suite')
        .setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
      const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(data)});
      return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json() as Record<string,any>};
    };
    const version=repo.getCullingVersion(owner,wid,pid),selected=input(version,[entry(b),entry(a)]);
    const audit=repo.listAudit(owner,wid).length;
    const ok=await request('owner',selected);
    assert.equal(ok.status,200);assert.equal(ok.cache,'no-store');
    assert.deepEqual(ok.body.preflight.orderedAssets.map((item:{assetId:string})=>item.assetId),[b.id,a.id]);
    assert.equal(ok.body.preflight.authoritativeForFinal,false);
    assert.equal(repo.listAudit(owner,wid).length,audit);
    assert.equal((await request('viewer',selected)).status,403);
    assert.equal((await request('owner',selected,'bad.jwt')).status,401);
    const wrongSHA=await request('owner',input(version,[entry(a),{...entry(b),expectedOriginalSHA256:'0'.repeat(64)}]));
    assert.equal(wrongSHA.status,409);assert.equal('preflight' in wrongSHA.body,false);
    assert.equal((await request('owner',input(version,[entry(a),entry(a)]))).status,400);
    repo.trashAsset(owner,wid,pid,b.id);
    const stale=await request('owner',selected);
    assert.equal(stale.status,409);assert.equal(stale.body.error,'CULLING_VERSION_CONFLICT');
    assert.equal(repo.listAudit(owner,wid).length,audit+2,'only the real trash and version bump were audited');
  }finally{
    if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await f.close();
  }
});
