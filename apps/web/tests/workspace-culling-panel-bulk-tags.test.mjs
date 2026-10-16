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
import {mountVerifiedWorkspaceCulling} from '../src/workspace-culling-verified-mount.mjs';
import {mountWorkspaceCullingPanel} from '../src/workspace-culling-panel.mjs';

const owner={userId:'owner'};
const recipe=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,
  rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
class Node {
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
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-panel-bulk-tag-')),
    assets=new AssetRepository(join(root,'assets.sqlite')),
    storage=new LocalObjectStorage(join(root,'objects')),
    http=new WorkspaceHTTP(root,assets,storage);
  let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'Panel Tags'),
      project=http.workspaces.createProject(owner,workspace.id,'Project');
    const images=Array.from({length:3},(_,index)=>{
      const bytes=Buffer.from(`synthetic-original-${index}`);
      const asset=assets.create(workspace.id,{name:`${index}.bin`,
        sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
      http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);
      http.workspaces.saveRecipe(owner,workspace.id,project.id,asset.id,{baseVersion:0,body:recipe()});
      http.workspaces.saveCullingMark(owner,workspace.id,project.id,asset.id,
        {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
          rating:index+2,flag:index===0?'pick':'none',colorLabel:index===1?'Blue':null,
          tags:index===0?['existing']:[],segmentId:null});
      return asset;});
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='panel-bulk-tag';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'panel-bulk-tag'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const mount=(ui,overrides={})=>mountVerifiedWorkspaceCulling({container:ui.container,
      baseURL:`http://127.0.0.1:${address.port}`,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,assetId:images[0].id}),
      workspaceId:workspace.id,projectId:project.id,assetId:images[0].id,
      expectedSubject:'owner',expectedTenantId:'personal',...overrides});
    return {root,assets,http,workspace,project,images,token,mount,
      baseURL:`http://127.0.0.1:${address.port}`,
      marks:()=>images.map(asset=>http.workspaces.getCullingMark(owner,workspace.id,project.id,asset.id)),
      async close(){await new Promise(resolve=>server.close(resolve));http.close();assets.close();
        await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}
function choose(ui,id){const results=ui.label('絞り込み結果から写真を明示選択');
  const label=results.children.find(node=>node.children[0].attributes.get('aria-label')===`写真 ${id} を選択`);
  assert.ok(label);const checkbox=label.children[0];checkbox.checked=true;checkbox.dispatch('change');}
function results(ui){return ui.label('一括Tagの写真別結果').children.map(node=>node.textContent);}

test('CULLING-BULK-UI01 / JWT SQLite: explicit order, one click and saved readback; stale list cannot run twice',async()=>{
  const f=await fixture();try{
    const ui=dom(),panel=await f.mount(ui);
    await until(()=>panel.getState().phase==='ready');
    assert.equal(ui.button('選択写真にTagを適用').disabled,true);
    ui.button('Project全件を取得').dispatch('click');await until(()=>panel.getState().loadedMarkCount===3);
    choose(ui,f.images[2].id);
    assert.equal(ui.button('選択写真にTagを適用').disabled,true);
    choose(ui,f.images[0].id);
    assert.equal(ui.button('選択写真にTagを適用').disabled,false);
    ui.label('一括適用するTag').value=' ';
    ui.button('選択写真にTagを適用').dispatch('click');
    assert.match(ui.status().textContent,/Tagは/u);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing'],[],[]]);
    ui.label('一括適用するTag').value='client';
    ui.label('Tagの一括操作').value='add';
    ui.button('選択写真にTagを適用').dispatch('click');
    ui.button('選択写真にTagを適用').dispatch('click');
    await until(()=>panel.getState().phase==='reload');
    assert.deepEqual(results(ui),[`${f.images[2].id} · 保存確認`,`${f.images[0].id} · 保存確認`]);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing','client'],[],['client']]);
    assert.equal(panel.getState().selectedCount,0);
    assert.equal(panel.getState().preflightStatus,'unchecked');
    assert.equal(ui.button('選択写真にTagを適用').disabled,true);
    assert.match(ui.status().textContent,/Projectを再取得するまで/u);
    ui.button('選択写真にTagを適用').dispatch('click');
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing','client'],[],['client']]);
    panel.dispose();
  }finally{await f.close();}
});

test('CULLING-BULK-UI02 / JWT SQLite: second CAS conflict renders saved/conflict/not-attempted, clears preflight and requires reload',async()=>{
  const f=await fixture();try{
    let puts=0;
    const ui=dom(),panel=await f.mount(ui,{fetchImpl:(url,init)=>{
      if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')&&++puts===2){
        f.http.workspaces.saveCullingMark(owner,f.workspace.id,f.project.id,f.images[1].id,
          {baseVersion:f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),
            rating:3,flag:'none',colorLabel:'Blue',tags:['outside'],segmentId:null});
      }
      return fetch(url,init);
    }});
    await until(()=>panel.getState().phase==='ready');
    ui.button('Project全件を取得').dispatch('click');await until(()=>panel.getState().loadedMarkCount===3);
    for(const asset of f.images)choose(ui,asset.id);
    ui.button('出力前の参考照合（最大20枚）').dispatch('click');
    await until(()=>panel.getState().preflightStatus==='reference-checked');
    ui.label('一括適用するTag').value='client';
    ui.button('選択写真にTagを適用').dispatch('click');
    await until(()=>panel.getState().phase==='conflict');
    assert.deepEqual(results(ui),[`${f.images[0].id} · 保存確認`,`${f.images[1].id} · 版競合`,
      `${f.images[2].id} · 未着手`]);
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing','client'],['outside'],[]]);
    assert.equal(panel.getState().preflightStatus,'unchecked');
    assert.equal(panel.getState().selectedCount,0);
    assert.doesNotMatch(ui.status().textContent,/全件を保存/u);
    panel.dispose();
  }finally{await f.close();}
});

test('CULLING-BULK-UI03 / JWT SQLite: revoked tenant, host Asset change and abort cannot show all-success',async()=>{
  const f=await fixture();try{
    let tenant='personal';const ui=dom();
    const panel=await f.mount(ui,{tokenProvider:()=>f.token('owner',tenant)});
    await until(()=>panel.getState().phase==='ready');
    ui.button('Project全件を取得').dispatch('click');await until(()=>panel.getState().loadedMarkCount===3);
    choose(ui,f.images[0].id);choose(ui,f.images[1].id);
    ui.label('一括適用するTag').value='client';tenant='wrong';
    ui.button('選択写真にTagを適用').dispatch('click');
    await until(()=>panel.getState().phase==='denied');
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing'],[],[]]);
    assert.equal(panel.getState().selectedCount,0);panel.dispose();

    let selected=f.images[0].id;const switchedUI=dom();
    const switched=await f.mount(switchedUI,{selectionProvider:()=>({workspaceId:f.workspace.id,
      projectId:f.project.id,assetId:selected})});
    await until(()=>switched.getState().phase==='ready');
    switchedUI.button('Project全件を取得').dispatch('click');
    await until(()=>switched.getState().loadedMarkCount===3);
    choose(switchedUI,f.images[0].id);choose(switchedUI,f.images[1].id);
    switchedUI.label('一括適用するTag').value='client';selected=f.images[2].id;
    switchedUI.button('選択写真にTagを適用').dispatch('click');
    await until(()=>switched.getState().phase==='denied');
    assert.deepEqual(f.marks().map(item=>item.tags),[['existing'],[],[]]);switched.dispose();

    const cancelUI=dom();let entered=false;
    const cancelled=await f.mount(cancelUI,{fetchImpl:(url,init)=>{
      if(init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')){
        entered=true;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',
          ()=>reject(new DOMException('cancelled','AbortError')),{once:true}));
      }
      return fetch(url,init);
    }});
    await until(()=>cancelled.getState().phase==='ready');
    cancelUI.button('Project全件を取得').dispatch('click');
    await until(()=>cancelled.getState().loadedMarkCount===3);
    choose(cancelUI,f.images[0].id);choose(cancelUI,f.images[1].id);
    cancelUI.label('一括適用するTag').value='client';
    cancelUI.button('選択写真にTagを適用').dispatch('click');await until(()=>entered);
    cancelUI.button('通信を取消').dispatch('click');
    await until(()=>cancelled.getState().phase==='uncertain');
    assert.deepEqual(results(cancelUI),[`${f.images[0].id} · 結果未確認`,`${f.images[1].id} · 未着手`]);
    assert.doesNotMatch(cancelUI.status().textContent,/全件を保存/u);
    cancelled.dispose();
  }finally{await f.close();}
});

test('CULLING-BULK-UI04: unverified bare panel has no Bulk Tag control',()=>{
  const ui=dom(),id='11111111-1111-4111-8111-111111111111';
  const panel=mountWorkspaceCullingPanel({container:ui.container,baseURL:'http://127.0.0.1:1',
    tokenProvider:()=>'',workspaceId:id,projectId:id,assetId:id});
  assert.throws(()=>ui.button('選択写真にTagを適用'),/control not found/u);
  panel.dispose();
});
