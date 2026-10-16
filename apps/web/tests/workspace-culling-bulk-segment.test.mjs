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
import {applyWorkspaceCullingBulkSegment} from '../src/workspace-culling-bulk-tags.mjs';
import {mountVerifiedWorkspaceCulling} from '../src/workspace-culling-verified-mount.mjs';
import {mountWorkspaceCullingPanel} from '../src/workspace-culling-panel.mjs';

const owner={userId:'owner'};
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-bulk-segment-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const http=new WorkspaceHTTP(root,assets,storage);
  let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'Bulk Segment');
    const project=http.workspaces.createProject(owner,workspace.id,'Project');
    const images=Array.from({length:3},(_,index)=>{
      const bytes=Buffer.from(`bulk-segment-${index}`);
      const asset=assets.create(workspace.id,{name:`${index}.bin`,
        sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
      http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);return asset;
    });
    for(const [id,name] of [['story','Story'],['selection','Selection']])
      http.workspaces.createCullingSegment(owner,workspace.id,project.id,
        {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),id,name});
    images.forEach((asset,index)=>http.workspaces.saveCullingMark(owner,workspace.id,project.id,asset.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
        rating:index+1,flag:index===0?'pick':'none',colorLabel:index===1?'Blue':null,
        tags:index===0?['existing']:[],segmentId:index===2?'selection':null}));
    const invitation=http.workspaces.inviteMember(owner,workspace.id,
      {email:'viewer@example.test',role:'VIEWER',expiresAt:'2099-01-01T00:00:00.000Z'});
    http.workspaces.acceptInvitation({userId:'viewer'},workspace.id,invitation.token,'viewer@example.test');
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='bulk-segment';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const baseURL=`http://127.0.0.1:${address.port}`;
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'bulk-segment'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const ids=images.map(item=>item.id);
    const input=overrides=>({baseURL,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,orderedAssetIds:ids}),
      workspaceId:workspace.id,projectId:project.id,orderedAssetIds:ids,
      expectedSubject:'owner',expectedTenantId:'personal',
      expectedCullingVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
      segmentId:'story',...overrides});
    const marks=()=>images.map(asset=>http.workspaces.getCullingMark(owner,workspace.id,project.id,asset.id));
    return {assets,http,workspace,project,images,ids,input,marks,token,baseURL,
      mount:(ui,overrides={})=>mountVerifiedWorkspaceCulling({container:ui.container,baseURL,
        tokenProvider:()=>token(),selectionProvider:()=>({workspaceId:workspace.id,
          projectId:project.id,assetId:images[0].id}),workspaceId:workspace.id,projectId:project.id,
        assetId:images[0].id,expectedSubject:'owner',expectedTenantId:'personal',...overrides}),
      async close(){await new Promise(resolve=>server.close(resolve));http.close();assets.close();
        await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}
class Node{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.listeners=new Map();
    this.attributes=new Map();this.value='';this.textContent='';this.disabled=false;this.checked=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this.attributes.set(key,value);}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  dispatch(type){const fn=this.listeners.get(type);assert.ok(fn,`missing ${type}`);
    return fn({preventDefault(){}});}
  focus(){this.ownerDocument.focused=this;}
}
function dom(){const doc={focused:null,createElement(tag){return new Node(doc,tag);}},container=new Node(doc,'main');
  const find=predicate=>{const walk=node=>predicate(node)?node:node.children.map(walk).find(Boolean);
    const found=walk(container);assert.ok(found,'control not found');return found;};
  return {container,label:name=>find(node=>node.attributes.get('aria-label')===name),
    button:name=>find(node=>node.tagName==='button'&&node.textContent===name),
    status:()=>find(node=>node.attributes.get('role')==='status')};}
async function until(check){const start=Date.now();while(!check()){
  if(Date.now()-start>7000)throw Error('timeout');await new Promise(resolve=>setTimeout(resolve,10));}}
function choose(ui,id){const results=ui.label('絞り込み結果から写真を明示選択');
  const label=results.children.find(node=>node.children[0].attributes.get('aria-label')===`写真 ${id} を選択`);
  assert.ok(label);label.children[0].checked=true;label.children[0].dispatch('change');}
const segmentResults=ui=>ui.label('一括Segmentの写真別結果').children.map(node=>node.textContent);

test('CULLING-BULK-SEGMENT01 / JWT SQLite: saved Segment and explicit Unassigned preserve other marks',async()=>{
  const f=await fixture();try{
    const original=f.marks();
    const assigned=await applyWorkspaceCullingBulkSegment(f.input());
    assert.equal(assigned.status,'COMPLETE_AT_READ_TIME');assert.equal(assigned.savedCount,3);
    assert.equal(assigned.authoritativeForFinal,false);
    assert.deepEqual(f.marks().map(item=>item.segmentId),['story','story','story']);
    for(let i=0;i<3;i++)for(const key of ['rating','flag','colorLabel','tags'])
      assert.deepEqual(f.marks()[i][key],original[i][key]);
    const removed=await applyWorkspaceCullingBulkSegment(f.input({segmentId:null}));
    assert.equal(removed.savedCount,3);assert.deepEqual(f.marks().map(item=>item.segmentId),[null,null,null]);
    const again=await applyWorkspaceCullingBulkSegment(f.input({segmentId:null}));
    assert.deepEqual(again.orderedResults.map(item=>item.status),['unchanged','unchanged','unchanged']);
    assert.equal(again.requiresReload,false);
  }finally{await f.close();}
});

test('CULLING-BULK-SEGMENT02 / JWT SQLite: nonexistent, malformed, stale, foreign or viewer input writes nothing',async()=>{
  const f=await fixture();try{
    const before=f.marks();
    const missing=await applyWorkspaceCullingBulkSegment(f.input({segmentId:'not-created'}));
    assert.equal(missing.stoppedReason,'SEGMENT_NOT_FOUND');assert.equal(missing.savedCount,0);
    for(const bad of [{segmentId:undefined},{segmentId:''},{segmentId:' bad '},
      {segmentId:'\u0001'},{segmentId:'x'.repeat(129)},
      {segmentId:'story',field:'rating',value:5},{segmentId:'story',tag:'x',action:'add'}])
      await assert.rejects(()=>applyWorkspaceCullingBulkSegment(f.input(bad)),/CULLING_BULK_TAG_INPUT_INVALID/u);
    const stale=await applyWorkspaceCullingBulkSegment(f.input({expectedCullingVersion:0}));
    assert.equal(stale.stoppedReason,'VERSION_CONFLICT');
    const viewer=await applyWorkspaceCullingBulkSegment(f.input({tokenProvider:()=>f.token('viewer'),
      expectedSubject:'viewer'}));assert.equal(viewer.stoppedReason,'ACCESS_DENIED');
    const tenant=await applyWorkspaceCullingBulkSegment(f.input({tokenProvider:()=>f.token('owner','wrong')}));
    assert.equal(tenant.stoppedReason,'ACCESS_DENIED');
    assert.deepEqual(f.marks(),before);
  }finally{await f.close();}
});

test('CULLING-BULK-SEGMENT03 / JWT SQLite: conflict after one CAS retains per-photo status',async()=>{
  const f=await fixture();try{
    let puts=0;
    const result=await applyWorkspaceCullingBulkSegment(f.input({fetchImpl:(url,init)=>{
      if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')&&++puts===2)
        f.http.workspaces.saveCullingMark(owner,f.workspace.id,f.project.id,f.images[2].id,
          {baseVersion:f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),
            rating:3,flag:'none',colorLabel:null,tags:['outside'],segmentId:'selection'});
      return fetch(url,init);
    }}));
    assert.equal(result.stoppedReason,'VERSION_CONFLICT');
    assert.deepEqual(result.orderedResults.map(item=>item.status),['saved','conflict','not_attempted']);
    assert.equal(result.savedCount,1);assert.equal(result.requiresReload,true);
    assert.deepEqual(f.marks().map(item=>item.segmentId),['story',null,'selection']);
  }finally{await f.close();}
});

test('CULLING-BULK-SEGMENT04 / JWT SQLite: lost response, bearer switch and abort never claim atomic completion',async()=>{
  const f=await fixture();try{
    let dropped=false;
    const uncertain=await applyWorkspaceCullingBulkSegment(f.input({fetchImpl:async(url,init)=>{
      if(!dropped&&init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')){
        dropped=true;await fetch(url,init);throw Error('response lost');}
      return fetch(url,init);
    }}));
    assert.deepEqual(uncertain.orderedResults.map(item=>item.status),['unverified','not_attempted','not_attempted']);
    assert.equal(uncertain.savedCount,0);assert.equal(f.marks()[0].segmentId,'story');
    let calls=0;
    const switched=await applyWorkspaceCullingBulkSegment(f.input({segmentId:'selection',
      tokenProvider:()=>f.token(++calls<3?'owner':'stranger')}));
    assert.deepEqual(switched.orderedResults.map(item=>item.status),['saved','denied','not_attempted']);
    const controller=new AbortController();let puts=0;
    const cancelled=await applyWorkspaceCullingBulkSegment(f.input({segmentId:null,signal:controller.signal,
      fetchImpl:(url,init)=>{
        if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')&&++puts===2){
          controller.abort();return Promise.reject(new DOMException('cancelled','AbortError'));}
        return fetch(url,init);
      }}));
    assert.equal(cancelled.stoppedReason,'ABORTED');
    assert.deepEqual(cancelled.orderedResults.map(item=>item.status),['saved','unchanged','unverified']);
  }finally{await f.close();}
});

test('CULLING-BULK-SEGMENT-UI01 / JWT SQLite: only explicit Segment choice applies two photos, then reload gate',async()=>{
  const f=await fixture();try{
    const ui=dom(),panel=await f.mount(ui);
    await until(()=>panel.getState().phase==='ready');
    ui.button('Project全件を取得').dispatch('click');await until(()=>panel.getState().loadedMarkCount===3);
    choose(ui,f.images[0].id);choose(ui,f.images[1].id);
    assert.equal(ui.button('選択写真にSegmentを適用').disabled,true);
    ui.button('選択写真にSegmentを適用').dispatch('click');
    assert.match(ui.status().textContent,/明示選択/u);
    assert.deepEqual(f.marks().map(item=>item.segmentId),[null,null,'selection']);
    const select=ui.label('一括割当するSegment');
    assert.ok(select.children.some(item=>item.value==='value:story'));
    select.value='value:story';select.dispatch('change');
    assert.equal(ui.button('選択写真にSegmentを適用').disabled,false);
    ui.button('選択写真にSegmentを適用').dispatch('click');
    await until(()=>panel.getState().phase==='reload');
    assert.deepEqual(segmentResults(ui),[`${f.images[0].id} · 保存確認`,`${f.images[1].id} · 保存確認`]);
    assert.deepEqual(f.marks().map(item=>item.segmentId),['story','story','selection']);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing'],[],[]]);
    assert.equal(panel.getState().selectedCount,0);
    assert.equal(ui.button('選択写真にSegmentを適用').disabled,true);panel.dispose();
  }finally{await f.close();}
});

test('CULLING-BULK-SEGMENT-UI02 / JWT SQLite: explicit Unassigned, conflict and no fake all-success',async()=>{
  const f=await fixture();try{
    for(let index=0;index<2;index++){
      const before=f.marks()[index];
      f.http.workspaces.saveCullingMark(owner,f.workspace.id,f.project.id,f.images[index].id,
        {baseVersion:f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),
          rating:before.rating,flag:before.flag,colorLabel:before.colorLabel,
          tags:before.tags,segmentId:'selection'});
    }
    let puts=0;const ui=dom(),panel=await f.mount(ui,{fetchImpl:(url,init)=>{
      if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')&&++puts===2)
        f.http.workspaces.saveCullingMark(owner,f.workspace.id,f.project.id,f.images[2].id,
          {baseVersion:f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),
            rating:3,flag:'none',colorLabel:null,tags:['outside'],segmentId:'selection'});
      return fetch(url,init);
    }});
    await until(()=>panel.getState().phase==='ready');
    ui.button('Project全件を取得').dispatch('click');await until(()=>panel.getState().loadedMarkCount===3);
    for(const asset of f.images)choose(ui,asset.id);
    const select=ui.label('一括割当するSegment');
    select.value='unassigned';select.dispatch('change');
    ui.button('選択写真にSegmentを適用').dispatch('click');
    await until(()=>panel.getState().phase==='conflict');
    assert.deepEqual(segmentResults(ui),[`${f.images[0].id} · 保存確認`,`${f.images[1].id} · 版競合`,
      `${f.images[2].id} · 未着手`]);
    assert.deepEqual(f.marks().map(item=>item.segmentId),[null,'selection','selection']);
    assert.doesNotMatch(ui.status().textContent,/全件を保存/u);
    panel.dispose();
  }finally{await f.close();}
});

test('CULLING-BULK-SEGMENT-UI03: unverified panel offers no bulk Segment control',()=>{
  const ui=dom(),id='11111111-1111-4111-8111-111111111111';
  const panel=mountWorkspaceCullingPanel({container:ui.container,baseURL:'http://127.0.0.1:1',
    tokenProvider:()=>'',workspaceId:id,projectId:id,assetId:id});
  assert.throws(()=>ui.button('選択写真にSegmentを適用'),/control not found/u);
  panel.dispose();
});
