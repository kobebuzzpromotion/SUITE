import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {WorkspaceCullingClient,WorkspaceCullingHTTPError} from '../src/workspace-culling-client.mjs';

const owner={userId:'owner'},viewer={userId:'viewer'};
const bytes=Buffer.from('manual-culling-client-http-sqlite-non-RAW');
const sha256=createHash('sha256').update(bytes).digest('hex');
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-workspace-culling-client-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='culling-client';
  const authenticate=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})});
  let http=new WorkspaceHTTP(root,assets,storage),server,baseURL;
  const start=async()=>{
    server=suiteServer(assets,storage,authenticate,http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');baseURL=`http://127.0.0.1:${address.port}`;
  };
  const stop=async()=>{if(server?.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));};
  try{
    const workspace=http.workspaces.createWorkspace(owner,'Client Studio');
    const project=http.workspaces.createProject(owner,workspace.id,'Keepers');
    const asset=assets.create(workspace.id,{name:'one.bin',sha256,size:bytes.length});
    http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);
    const invitation=http.workspaces.inviteMember(owner,workspace.id,{email:'viewer@example.test',role:'VIEWER',expiresAt:'2099-01-01T00:00:00.000Z'});
    http.workspaces.acceptInvitation(viewer,workspace.id,invitation.token,'viewer@example.test');
    await start();
    const token=async(user='owner')=>new SignJWT({tenant_id:'personal',email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'culling-client'}).setIssuer('https://issuer.example').setAudience('suite')
      .setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const client=(user='owner',fetchImpl=globalThis.fetch)=>new WorkspaceCullingClient({baseURL,tokenProvider:()=>token(user),fetchImpl});
    return {root,assets,workspace,project,asset,token,client,get http(){return http;},get baseURL(){return baseURL;},
      async restart(){await stop();http.close();http=new WorkspaceHTTP(root,assets,storage);await start();},
      async close(){await stop();http.close();assets.close();await rm(root,{recursive:true,force:true});}};
  }catch(error){await stop();http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}
const options=(f,extra={})=>({workspaceId:f.workspace.id,projectId:f.project.id,assetId:f.asset.id,...extra});
const fullMark=(f,baseVersion,extra={})=>options(f,{baseVersion,rating:5,flag:'pick',colorLabel:'Blue',tags:['select','client'],segmentId:'opening',...extra});

test('CULLING-CLIENT01 / REAL_HTTP_SQLITE: Stars, Flags, Tags and Segments persist through restart without changing selection',async()=>{
  const f=await fixture();try{
    const client=f.client(),scope=options(f),original=f.assets.get(f.workspace.id,f.asset.id);
    const initialVersion=f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id);
    assert.deepEqual(await client.getProjectPage(scope),{
      workspaceId:f.workspace.id,projectId:f.project.id,version:initialVersion,segments:[],
      marks:[{assetId:f.asset.id,rating:0,flag:'none',colorLabel:null,tags:[],segmentId:null}],nextAfter:null});
    f.http.workspaces.saveSelection(owner,f.workspace.id,f.project.id,f.asset.id,{baseVersion:0,selected:true});
    assert.equal((await client.createSegment({...scope,baseVersion:initialVersion,id:'opening',name:'Opening'})).version,initialVersion+1);
    assert.equal((await client.createSegment({...scope,baseVersion:initialVersion+1,id:'final',name:'Final'})).version,initialVersion+2);
    const saved=await client.saveAssetMark(fullMark(f,initialVersion+2));
    assert.equal(saved.version,initialVersion+3);assert.equal(saved.mark.rating,5);assert.equal(saved.mark.segmentId,'opening');
    const moved=await client.saveAssetMark(fullMark(f,initialVersion+3,{rating:3,flag:'reject',tags:['review'],segmentId:'final'}));
    assert.equal(moved.version,initialVersion+4);assert.equal(moved.mark.segmentId,'final');
    assert.equal((await client.renameSegment({...scope,segmentId:'final',baseVersion:initialVersion+4,name:'Delivery'})).version,initialVersion+5);
    const order=await client.reorderSegments({...scope,baseVersion:initialVersion+5,orderedIds:['final','opening']});
    assert.deepEqual(order.segments.map(item=>item.id),['final','opening']);
    await f.restart();
    const after=f.client();const read=await after.getAssetMark(scope),page=await after.getProjectPage({...scope,limit:1});
    assert.equal(read.version,initialVersion+6);assert.deepEqual(read.mark.tags,['review']);assert.equal(read.mark.flag,'reject');
    assert.equal(page.marks[0].segmentId,'final');assert.deepEqual(page.segments.map(item=>item.name),['Delivery','Opening']);
    assert.equal(f.http.workspaces.getSelection(owner,f.workspace.id,f.project.id,f.asset.id).version,1);
    assert.equal(f.http.workspaces.getSelection(owner,f.workspace.id,f.project.id,f.asset.id).selected,true);
    assert.equal(f.assets.get(f.workspace.id,f.asset.id).sha256,original.sha256);
    assert.equal(f.assets.get(f.workspace.id,f.asset.id).originalKey,original.originalKey);
    const secondBytes=Buffer.from('second-manual-culling-asset');
    const second=f.assets.create(f.workspace.id,{name:'two.bin',sha256:createHash('sha256').update(secondBytes).digest('hex'),size:secondBytes.length});
    f.http.workspaces.registerAsset(owner,f.workspace.id,f.project.id,second.id);
    assert.equal(f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),initialVersion+7);
    const firstPage=await after.getProjectPage({...scope,limit:1});
    assert.equal(firstPage.marks.length,1);assert.equal(firstPage.nextAfter,firstPage.marks[0].assetId);
    const secondPage=await after.getProjectPage({...scope,limit:1,after:firstPage.nextAfter});
    assert.equal(secondPage.marks.length,1);assert.equal(secondPage.nextAfter,null);
    assert.deepEqual(new Set([firstPage.marks[0].assetId,secondPage.marks[0].assetId]),new Set([f.asset.id,second.id]));
  }finally{await f.close();}
});

test('CULLING-CLIENT02 / REAL_HTTP_SQLITE: stale CAS 409, viewer 403, bad token 401 and revocation never pretend save',async()=>{
  const f=await fixture();try{
    const client=f.client(),scope=options(f);
    const initialVersion=f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id);
    await client.createSegment({...scope,baseVersion:initialVersion,id:'opening',name:'Opening'});
    await assert.rejects(f.client('viewer').saveAssetMark(fullMark(f,initialVersion+1)),error=>error instanceof WorkspaceCullingHTTPError&&error.status===403);
    await assert.rejects(client.saveAssetMark(fullMark(f,initialVersion)),error=>error instanceof WorkspaceCullingHTTPError&&error.status===409&&error.code==='CULLING_VERSION_CONFLICT');
    const bad=new WorkspaceCullingClient({baseURL:f.baseURL,tokenProvider:()=> 'not-a-jwt'});
    await assert.rejects(bad.getAssetMark(scope),error=>error instanceof WorkspaceCullingHTTPError&&error.status===401);
    const other=f.http.workspaces.createWorkspace({userId:'stranger'},'Other');
    await assert.rejects(client.getProjectPage({...scope,workspaceId:other.id}),error=>error instanceof WorkspaceCullingHTTPError&&error.status===403);
    await assert.rejects(client.getAssetMark({...scope,assetId:'11111111-1111-4111-8111-111111111111'}),error=>error instanceof WorkspaceCullingHTTPError&&error.status===404);
    f.http.workspaces.removeMember(owner,f.workspace.id,'viewer');
    await assert.rejects(f.client('viewer').getAssetMark(scope),error=>error instanceof WorkspaceCullingHTTPError&&error.status===403);
    assert.equal((await client.getAssetMark(scope)).version,initialVersion+1);
    assert.equal((await client.getAssetMark(scope)).mark.rating,0);
  }finally{await f.close();}
});

test('CULLING-CLIENT03: AbortSignal, unsafe input and malformed replies fail before saved-looking state',async()=>{
  const f=await fixture();try{
    let network=0;const observed=[];
    const observing=async(url,init)=>{network++;observed.push({url,init});return fetch(url,init);};
    const client=f.client('owner',observing),scope=options(f),controller=new AbortController();controller.abort();
    await assert.rejects(client.getAssetMark({...scope,signal:controller.signal}),{name:'AbortError'});
    assert.equal(network,0);
    await assert.rejects(client.saveAssetMark(fullMark(f,0,{tags:['same','same']})),/CULLING_INPUT_INVALID/);
    await assert.rejects(client.createSegment({...scope,baseVersion:0,id:' bad',name:'Opening'}),/CULLING_INPUT_INVALID/);
    await assert.rejects(client.getProjectPage({...scope,limit:201}),/CULLING_PAGE_INVALID/);
    assert.equal(network,0);
    await client.getAssetMark(scope);
    assert.equal(network,1);assert.ok(observed[0].url.startsWith(f.baseURL+'/v1/workspaces/'));
    assert.equal(observed[0].url.includes('Bearer'),false);
    assert.ok(observed[0].init.headers.Authorization.startsWith('Bearer '));
    assert.equal(observed[0].init.credentials,'omit');
    const forged=new WorkspaceCullingClient({baseURL:f.baseURL,tokenProvider:()=>f.token(),fetchImpl:async()=>({ok:true,json:async()=>({version:0,mark:{assetId:f.asset.id,rating:9}})})});
    await assert.rejects(forged.getAssetMark(scope),/CULLING_RESPONSE_INVALID/);
    const inFlight=new AbortController();let started;
    const startedPromise=new Promise(resolve=>{started=resolve;});
    const delayed=new WorkspaceCullingClient({baseURL:f.baseURL,tokenProvider:()=> 'ephemeral',fetchImpl:(_url,init)=>new Promise((_,reject)=>{
      assert.equal(init.signal,inFlight.signal);started();init.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')));
    })});
    const pending=delayed.getAssetMark({...scope,signal:inFlight.signal});await startedPromise;inFlight.abort();
    await assert.rejects(pending,{name:'AbortError'});
    await assert.rejects(client.getAssetMark({...scope,workspaceId:'../other'}),/CULLING_ID_INVALID/);
    assert.throws(()=>new WorkspaceCullingClient({baseURL:'http://example.com',tokenProvider:()=> 'x'}),/CULLING_CLIENT_CONFIG_INVALID/);
  }finally{await f.close();}
});
