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
import {applyWorkspaceCullingBulkMark} from '../src/workspace-culling-bulk-tags.mjs';
import {mountVerifiedWorkspaceCulling} from '../src/workspace-culling-verified-mount.mjs';
import {mountWorkspaceCullingPanel} from '../src/workspace-culling-panel.mjs';

const owner={userId:'owner'};
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-bulk-mark-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const http=new WorkspaceHTTP(root,assets,storage);
  let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'Bulk Mark');
    const project=http.workspaces.createProject(owner,workspace.id,'Project');
    const images=Array.from({length:3},(_,index)=>{
      const bytes=Buffer.from(`bulk-mark-${index}`);
      const asset=assets.create(workspace.id,{name:`${index}.bin`,
        sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
      http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);
      return asset;
    });
    const segment=http.workspaces.createCullingSegment(owner,workspace.id,project.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),id:'story',name:'Story'});
    assert.ok(segment.version>0);
    images.forEach((asset,index)=>http.workspaces.saveCullingMark(owner,workspace.id,project.id,asset.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
        rating:index+1,flag:index===0?'pick':'none',colorLabel:index===1?'Blue':null,
        tags:index===0?['existing']:[],segmentId:index===2?'story':null}));
    const invitation=http.workspaces.inviteMember(owner,workspace.id,
      {email:'viewer@example.test',role:'VIEWER',expiresAt:'2099-01-01T00:00:00.000Z'});
    http.workspaces.acceptInvitation({userId:'viewer'},workspace.id,invitation.token,'viewer@example.test');
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='bulk-mark';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const baseURL=`http://127.0.0.1:${address.port}`;
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'bulk-mark'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const ids=images.map(item=>item.id);
    const input=overrides=>({baseURL,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,orderedAssetIds:ids}),
      workspaceId:workspace.id,projectId:project.id,orderedAssetIds:ids,
      expectedSubject:'owner',expectedTenantId:'personal',
      expectedCullingVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
      field:'rating',value:5,...overrides});
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
const markResults=ui=>ui.label('一括Rating・Flag・Colorの写真別結果').children.map(node=>node.textContent);

test('CULLING-BULK-MARK01 / JWT SQLite: each one-field rating, flag and color CAS preserves every other mark',async()=>{
  const f=await fixture();try{
    const original=f.marks();
    for(const [field,value] of [['rating',5],['flag','reject'],['colorLabel','Amber']]){
      const before=f.marks();const result=await applyWorkspaceCullingBulkMark(f.input({field,value}));
      assert.equal(result.status,'COMPLETE_AT_READ_TIME');assert.equal(result.savedCount,3);
      assert.equal(result.authoritativeForFinal,false);
      for(let i=0;i<3;i++)for(const key of ['rating','flag','colorLabel','tags','segmentId'])
        assert.deepEqual(f.marks()[i][key],key===field?value:before[i][key]);
    }
    assert.deepEqual(f.marks().map(item=>item.tags),original.map(item=>item.tags));
    const unchanged=await applyWorkspaceCullingBulkMark(f.input({field:'colorLabel',value:'Amber'}));
    assert.deepEqual(unchanged.orderedResults.map(item=>item.status),['unchanged','unchanged','unchanged']);
    assert.equal(unchanged.savedCount,0);assert.equal(unchanged.requiresReload,false);
    const cleared=await applyWorkspaceCullingBulkMark(f.input({field:'colorLabel',value:null}));
    assert.equal(cleared.savedCount,3);assert.deepEqual(f.marks().map(item=>item.colorLabel),[null,null,null]);
  }finally{await f.close();}
});

test('CULLING-BULK-MARK02 / JWT SQLite: invalid/multiple fields, stale version, identity and viewer cannot write',async()=>{
  const f=await fixture();try{
    const original=f.marks();
    for(const invalid of [{field:'rating',value:6},{field:'rating',value:1.5},
      {field:'flag',value:'maybe'},{field:'colorLabel',value:' bad '},
      {field:'colorLabel',value:'\u0001'},{field:'tags',value:[]},{field:'rating',value:3,tag:'other'}])
      await assert.rejects(()=>applyWorkspaceCullingBulkMark(f.input(invalid)),/CULLING_BULK_TAG_INPUT_INVALID/u);
    const stale=await applyWorkspaceCullingBulkMark(f.input({expectedCullingVersion:0}));
    assert.equal(stale.stoppedReason,'VERSION_CONFLICT');
    const viewer=await applyWorkspaceCullingBulkMark(f.input({tokenProvider:()=>f.token('viewer'),
      expectedSubject:'viewer'}));assert.equal(viewer.stoppedReason,'ACCESS_DENIED');
    const tenant=await applyWorkspaceCullingBulkMark(f.input({tokenProvider:()=>f.token('owner','wrong')}));
    assert.equal(tenant.stoppedReason,'ACCESS_DENIED');
    assert.deepEqual(f.marks(),original);
  }finally{await f.close();}
});

test('CULLING-BULK-MARK03 / JWT SQLite: second CAS conflict is per-photo partial, lost response remains unverified',async()=>{
  const f=await fixture();try{
    let puts=0;
    const partial=await applyWorkspaceCullingBulkMark(f.input({field:'rating',value:5,
      fetchImpl:(url,init)=>{
        if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')&&++puts===2)
          f.http.workspaces.saveCullingMark(owner,f.workspace.id,f.project.id,f.images[2].id,
            {baseVersion:f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),
              rating:3,flag:'none',colorLabel:null,tags:['outside'],segmentId:'story'});
        return fetch(url,init);
      }}));
    assert.equal(partial.stoppedReason,'VERSION_CONFLICT');
    assert.deepEqual(partial.orderedResults.map(item=>item.status),['saved','conflict','not_attempted']);
    assert.equal(partial.savedCount,1);assert.equal(partial.authoritativeForFinal,false);
    assert.deepEqual(f.marks().map(item=>item.rating),[5,2,3]);
    let dropped=false;
    const uncertain=await applyWorkspaceCullingBulkMark(f.input({field:'flag',value:'reject',
      fetchImpl:async(url,init)=>{
        if(!dropped&&init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')){
          dropped=true;await fetch(url,init);throw Error('response lost');}
        return fetch(url,init);
      }}));
    assert.deepEqual(uncertain.orderedResults.map(item=>item.status),['unverified','not_attempted','not_attempted']);
    assert.equal(uncertain.savedCount,0);assert.equal(uncertain.requiresReload,true);
    assert.equal(f.marks()[0].flag,'reject');
  }finally{await f.close();}
});

test('CULLING-BULK-MARK04 / JWT SQLite: bearer switch and abort after one save stop without rollback claim',async()=>{
  const f=await fixture();try{
    let calls=0;
    const switched=await applyWorkspaceCullingBulkMark(f.input({field:'flag',value:'reject',
      tokenProvider:()=>f.token(++calls<3?'owner':'stranger')}));
    assert.equal(switched.stoppedReason,'ACCESS_DENIED');
    assert.deepEqual(switched.orderedResults.map(item=>item.status),['saved','denied','not_attempted']);
    assert.deepEqual(f.marks().map(item=>item.flag),['reject','none','none']);
    const controller=new AbortController();let puts=0;
    const cancelled=await applyWorkspaceCullingBulkMark(f.input({field:'colorLabel',value:'Amber',
      signal:controller.signal,fetchImpl:(url,init)=>{
        if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')&&++puts===2){
          controller.abort();return Promise.reject(new DOMException('cancelled','AbortError'));}
        return fetch(url,init);
      }}));
    assert.equal(cancelled.stoppedReason,'ABORTED');
    assert.deepEqual(cancelled.orderedResults.map(item=>item.status),['saved','unverified','not_attempted']);
    assert.deepEqual(f.marks().map(item=>item.colorLabel),['Amber','Blue',null]);
  }finally{await f.close();}
});

test('CULLING-BULK-MARK-UI01 / JWT SQLite: explicit two-photo rating, one field only, readback and reload gate',async()=>{
  const f=await fixture();try{
    const ui=dom(),panel=await f.mount(ui);
    await until(()=>panel.getState().phase==='ready');
    assert.equal(ui.button('選択写真にRating・Flag・Colorを適用').disabled,true);
    ui.button('Project全件を取得').dispatch('click');await until(()=>panel.getState().loadedMarkCount===3);
    choose(ui,f.images[2].id);choose(ui,f.images[0].id);
    ui.label('一括Rating').value='5';
    ui.button('選択写真にRating・Flag・Colorを適用').dispatch('click');
    await until(()=>panel.getState().phase==='reload');
    assert.deepEqual(markResults(ui),[`${f.images[2].id} · 保存確認`,`${f.images[0].id} · 保存確認`]);
    assert.deepEqual(f.marks().map(item=>item.rating),[5,2,5]);
    assert.deepEqual(f.marks().map(item=>item.flag),['pick','none','none']);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing'],[],[]]);
    assert.equal(panel.getState().selectedCount,0);
    assert.equal(ui.button('選択写真にRating・Flag・Colorを適用').disabled,true);
    panel.dispose();
  }finally{await f.close();}
});

test('CULLING-BULK-MARK-UI02 / JWT SQLite: flag and color explicit switch, invalid value and CAS conflict',async()=>{
  const f=await fixture();try{
    let puts=0;const ui=dom(),panel=await f.mount(ui,{fetchImpl:(url,init)=>{
      if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')&&++puts===2)
        f.http.workspaces.saveCullingMark(owner,f.workspace.id,f.project.id,f.images[2].id,
          {baseVersion:f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),
            rating:3,flag:'none',colorLabel:null,tags:['outside'],segmentId:'story'});
      return fetch(url,init);
    }});
    await until(()=>panel.getState().phase==='ready');
    ui.button('Project全件を取得').dispatch('click');await until(()=>panel.getState().loadedMarkCount===3);
    for(const asset of f.images)choose(ui,asset.id);
    const field=ui.label('一括変更する項目');field.value='flag';field.dispatch('change');
    assert.equal(ui.label('一括Rating').disabled,true);
    assert.equal(ui.label('一括Flag').disabled,false);
    ui.label('一括Flag').value='invalid';
    ui.button('選択写真にRating・Flag・Colorを適用').dispatch('click');
    assert.match(ui.status().textContent,/有効な値/u);
    assert.deepEqual(f.marks().map(item=>item.flag),['pick','none','none']);
    ui.label('一括Flag').value='reject';
    ui.button('選択写真にRating・Flag・Colorを適用').dispatch('click');
    await until(()=>panel.getState().phase==='conflict');
    assert.deepEqual(markResults(ui),[`${f.images[0].id} · 保存確認`,`${f.images[1].id} · 版競合`,
      `${f.images[2].id} · 未着手`]);
    assert.deepEqual(f.marks().map(item=>item.flag),['reject','none','none']);
    assert.equal(panel.getState().selectedCount,0);panel.dispose();
  }finally{await f.close();}
});

test('CULLING-BULK-MARK-UI03 / JWT SQLite: Color Label clear requires explicit selection and reload',async()=>{
  const f=await fixture();try{
    const ui=dom(),panel=await f.mount(ui);
    await until(()=>panel.getState().phase==='ready');
    ui.button('Project全件を取得').dispatch('click');await until(()=>panel.getState().loadedMarkCount===3);
    choose(ui,f.images[0].id);
    assert.equal(ui.button('選択写真にRating・Flag・Colorを適用').disabled,true);
    choose(ui,f.images[1].id);
    const field=ui.label('一括変更する項目');field.value='colorLabel';field.dispatch('change');
    assert.equal(ui.label('一括Flag').disabled,true);
    assert.equal(ui.label('一括Color Label').disabled,false);
    ui.label('一括Color Label').value=' bad ';
    ui.button('選択写真にRating・Flag・Colorを適用').dispatch('click');
    assert.match(ui.status().textContent,/有効な値/u);
    assert.deepEqual(f.marks().map(item=>item.colorLabel),[null,'Blue',null]);
    ui.label('一括Color Label').value='';
    ui.button('選択写真にRating・Flag・Colorを適用').dispatch('click');
    await until(()=>panel.getState().phase==='reload');
    assert.deepEqual(markResults(ui),[`${f.images[0].id} · 変更なし`,`${f.images[1].id} · 保存確認`]);
    assert.deepEqual(f.marks().map(item=>item.colorLabel),[null,null,null]);
    assert.match(ui.status().textContent,/Color Label保存/u);
    panel.dispose();
  }finally{await f.close();}
});

test('CULLING-BULK-MARK-UI04: unverified panel has no mark control',()=>{
  const ui=dom(),id='11111111-1111-4111-8111-111111111111';
  const panel=mountWorkspaceCullingPanel({container:ui.container,baseURL:'http://127.0.0.1:1',
    tokenProvider:()=>'',workspaceId:id,projectId:id,assetId:id});
  assert.throws(()=>ui.button('選択写真にRating・Flag・Colorを適用'),/control not found/u);
  panel.dispose();
});
