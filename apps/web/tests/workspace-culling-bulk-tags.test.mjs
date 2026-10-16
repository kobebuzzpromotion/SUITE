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
import {applyWorkspaceCullingBulkTag} from '../src/workspace-culling-bulk-tags.mjs';

const owner={userId:'owner'};
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-bulk-tags-')),
    assets=new AssetRepository(join(root,'assets.sqlite')),
    storage=new LocalObjectStorage(join(root,'objects')),
    http=new WorkspaceHTTP(root,assets,storage);
  let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'Bulk Tags'),
      project=http.workspaces.createProject(owner,workspace.id,'Project');
    const images=Array.from({length:3},(_,index)=>{
      const bytes=Buffer.from(`synthetic-original-${index}`);
      const asset=assets.create(workspace.id,{name:`${index}.bin`,
        sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
      http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);return asset;});
    const segment=http.workspaces.createCullingSegment(owner,workspace.id,project.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),id:'story',name:'Story'});
    assert.ok(segment.version>0);
    images.forEach((asset,index)=>http.workspaces.saveCullingMark(owner,workspace.id,project.id,asset.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
        rating:index+2,flag:index===0?'pick':'none',colorLabel:index===1?'Blue':null,
        tags:index===0?['existing']:[],segmentId:index===2?'story':null}));
    const invitation=http.workspaces.inviteMember(owner,workspace.id,
      {email:'viewer@example.test',role:'VIEWER',expiresAt:'2099-01-01T00:00:00.000Z'});
    http.workspaces.acceptInvitation({userId:'viewer'},workspace.id,invitation.token,'viewer@example.test');
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='bulk-tags';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'bulk-tags'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const ids=images.map(item=>item.id);
    const input=overrides=>({baseURL:`http://127.0.0.1:${address.port}`,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,orderedAssetIds:ids}),
      workspaceId:workspace.id,projectId:project.id,orderedAssetIds:ids,
      expectedSubject:'owner',expectedTenantId:'personal',
      expectedCullingVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
      tag:'new-tag',action:'add',...overrides});
    const marks=()=>images.map(asset=>http.workspaces.getCullingMark(owner,workspace.id,project.id,asset.id));
    return {root,assets,http,workspace,project,images,ids,token,input,marks,
      async close(){await new Promise(resolve=>server.close(resolve));http.close();assets.close();
        await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}

test('CULLING-BULK-TAG01 / JWT SQLite: ordered CAS add/remove preserves other fields and reports each verified version',async()=>{
  const f=await fixture();try{
    const before=f.marks(),version=f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id);
    const added=await applyWorkspaceCullingBulkTag(f.input());
    assert.equal(added.status,'COMPLETE_AT_READ_TIME');assert.equal(added.authoritativeForFinal,false);
    assert.equal(added.savedCount,3);assert.equal(added.requiresReload,true);
    assert.deepEqual(added.orderedResults.map(item=>item.assetId),f.ids);
    assert.deepEqual(added.orderedResults.map(item=>item.verifiedVersion),[version+1,version+2,version+3]);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing','new-tag'],['new-tag'],['new-tag']]);
    for(let index=0;index<3;index++)for(const field of ['rating','flag','colorLabel','segmentId'])
      assert.deepEqual(f.marks()[index][field],before[index][field]);
    const removed=await applyWorkspaceCullingBulkTag(f.input({action:'remove'}));
    assert.equal(removed.status,'COMPLETE_AT_READ_TIME');assert.equal(removed.savedCount,3);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing'],[],[]]);
    const again=await applyWorkspaceCullingBulkTag(f.input({action:'remove'}));
    assert.deepEqual(again.orderedResults.map(item=>item.status),['unchanged','unchanged','unchanged']);
    assert.equal(again.savedCount,0);assert.equal(again.requiresReload,false);
  }finally{await f.close();}
});

test('CULLING-BULK-TAG02 / JWT SQLite: second target CAS conflict keeps first success and stops remainder',async()=>{
  const f=await fixture();try{
    let puts=0;
    const fetchImpl=(url,init)=>{
      if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')&&++puts===2){
        f.http.workspaces.saveCullingMark(owner,f.workspace.id,f.project.id,f.images[2].id,
          {baseVersion:f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),
            rating:4,flag:'none',colorLabel:null,tags:['outside'],segmentId:'story'});
      }
      return fetch(url,init);
    };
    const result=await applyWorkspaceCullingBulkTag(f.input({fetchImpl}));
    assert.equal(result.status,'STOPPED_RELOAD_REQUIRED');assert.equal(result.stoppedReason,'VERSION_CONFLICT');
    assert.deepEqual(result.orderedResults.map(item=>item.status),['saved','conflict','not_attempted']);
    assert.equal(result.savedCount,1);assert.equal(result.requiresReload,true);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing','new-tag'],[],['outside']]);
  }finally{await f.close();}
});

test('CULLING-BULK-TAG03 / JWT SQLite: identity switch, changed selection and stale initial version do not write',async()=>{
  const f=await fixture();try{
    const before=f.marks(),version=f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id);
    const wrong=await applyWorkspaceCullingBulkTag(f.input({tokenProvider:()=>f.token('stranger')}));
    assert.equal(wrong.savedCount,0);assert.equal(wrong.stoppedReason,'ACCESS_DENIED');
    const viewer=await applyWorkspaceCullingBulkTag(f.input({tokenProvider:()=>f.token('viewer'),
      expectedSubject:'viewer'}));
    assert.equal(viewer.savedCount,0);assert.equal(viewer.stoppedReason,'ACCESS_DENIED');
    const changed=await applyWorkspaceCullingBulkTag(f.input({selectionProvider:()=>({workspaceId:f.workspace.id,
      projectId:f.project.id,orderedAssetIds:[f.ids[1],f.ids[0],f.ids[2]]})}));
    assert.equal(changed.savedCount,0);assert.equal(changed.stoppedReason,'SELECTION_CHANGED');
    const stale=await applyWorkspaceCullingBulkTag(f.input({expectedCullingVersion:version-1}));
    assert.equal(stale.savedCount,0);assert.equal(stale.stoppedReason,'VERSION_CONFLICT');
    assert.deepEqual(f.marks(),before);
    await assert.rejects(()=>applyWorkspaceCullingBulkTag(f.input({orderedAssetIds:[f.ids[0],f.ids[0]]})),
      /CULLING_BULK_TAG_INPUT_INVALID/u);
    await assert.rejects(()=>applyWorkspaceCullingBulkTag(f.input({orderedAssetIds:[f.ids[0]]})),
      /CULLING_BULK_TAG_INPUT_INVALID/u);
    const tooMany=Array.from({length:21},(_,index)=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`);
    await assert.rejects(()=>applyWorkspaceCullingBulkTag(f.input({orderedAssetIds:tooMany})),
      /CULLING_BULK_TAG_INPUT_INVALID/u);
  }finally{await f.close();}
});

test('CULLING-BULK-TAG04 / JWT SQLite: lost write response is unverified, not falsely rolled back or called complete',async()=>{
  const f=await fixture();try{
    let dropped=false;
    const result=await applyWorkspaceCullingBulkTag(f.input({fetchImpl:async(url,init)=>{
      if(!dropped&&init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')){
        dropped=true;await fetch(url,init);throw Error('transport lost after server write');
      }
      return fetch(url,init);
    }}));
    assert.equal(result.status,'STOPPED_RELOAD_REQUIRED');
    assert.deepEqual(result.orderedResults.map(item=>item.status),['unverified','not_attempted','not_attempted']);
    assert.equal(result.savedCount,0);assert.equal(result.requiresReload,true);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing','new-tag'],[],[]]);
  }finally{await f.close();}
});

test('CULLING-BULK-TAG05 / JWT SQLite: abort after first verified save stops later writes without atomicity claim',async()=>{
  const f=await fixture();try{
    const controller=new AbortController();let puts=0;
    const result=await applyWorkspaceCullingBulkTag(f.input({signal:controller.signal,
      fetchImpl:(url,init)=>{
        if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')&&++puts===2){
          controller.abort();return Promise.reject(new DOMException('cancelled','AbortError'));
        }
        return fetch(url,init);
      }}));
    assert.equal(result.stoppedReason,'ABORTED');
    assert.deepEqual(result.orderedResults.map(item=>item.status),['saved','unverified','not_attempted']);
    assert.equal(result.savedCount,1);assert.equal(result.authoritativeForFinal,false);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing','new-tag'],[],[]]);
  }finally{await f.close();}
});

test('CULLING-BULK-TAG06 / JWT SQLite: new bearer changing account between targets stops after the first saved mark',async()=>{
  const f=await fixture();try{
    let calls=0;
    const result=await applyWorkspaceCullingBulkTag(f.input({tokenProvider:()=>f.token(++calls<3?'owner':'stranger')}));
    assert.equal(calls,3);
    assert.equal(result.stoppedReason,'ACCESS_DENIED');
    assert.deepEqual(result.orderedResults.map(item=>item.status),['saved','denied','not_attempted']);
    assert.equal(result.savedCount,1);assert.equal(result.requiresReload,true);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing','new-tag'],[],[]]);
  }finally{await f.close();}
});
