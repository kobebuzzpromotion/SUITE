import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {mountVerifiedWorkspaceCulling} from '../src/workspace-culling-verified-mount.mjs';
import {createManualCullingProject, setManualCullingMark, changeManualCullingTag,
  filterManualCullingAssets} from '../src/smart-culling-project.mjs';

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
const recipe=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,
  rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-culling-tags-')),
    assets=new AssetRepository(join(root,'assets.sqlite')),
    storage=new LocalObjectStorage(join(root,'objects')),
    http=new WorkspaceHTTP(root,assets,storage),owner={userId:'owner'};
  let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'Tags'),
      project=http.workspaces.createProject(owner,workspace.id,'Project');
    const rows=[
      {rating:4,flag:'pick',colorLabel:'Red',tags:['portrait','client']},
      {rating:4,flag:'none',colorLabel:'Blue',tags:['portrait']},
      {rating:2,flag:'reject',colorLabel:'Red',tags:['landscape']},
      {rating:0,flag:'none',colorLabel:null,tags:[]},
      {rating:5,flag:'none',colorLabel:null,tags:[]},
    ];
    const images=rows.map((_,index)=>{const bytes=Buffer.from(`synthetic-not-RAW-${index}`);
      const asset=assets.create(workspace.id,{name:`${index}.bin`,
        sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
      http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);
      http.workspaces.saveRecipe(owner,workspace.id,project.id,asset.id,{baseVersion:0,body:recipe()});
      return asset;});
    for(let index=0;index<rows.length;index++){
      const baseVersion=http.workspaces.getCullingVersion(owner,workspace.id,project.id);
      http.workspaces.saveCullingMark(owner,workspace.id,project.id,images[index].id,
        {baseVersion,...rows[index],segmentId:null});
    }
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='culling-tag-mode';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'culling-tag-mode'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const mount=(ui,overrides={})=>mountVerifiedWorkspaceCulling({container:ui.container,
      baseURL:`http://127.0.0.1:${address.port}`,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,assetId:images[0].id}),
      workspaceId:workspace.id,projectId:project.id,assetId:images[0].id,
      expectedSubject:'owner',expectedTenantId:'personal',...overrides});
    return {root,assets,http,owner,workspace,project,images,rows,token,mount,
      async close(){await new Promise(resolve=>server.close(resolve));http.close();assets.close();
        await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}
function visibleIds(ui){return ui.label('絞り込み結果から写真を明示選択').children.map(label=>
  label.children[0].attributes.get('aria-label').match(/[0-9a-f-]{36}/u)[0]).sort();}
function change(ui,name,value){const control=ui.label(name);control.value=value;control.dispatch('change');}
function pureState(f){
  let state=createManualCullingProject({workspaceId:f.workspace.id,projectId:f.project.id,
    assets:f.images.map(item=>({id:item.id,tenantId:f.workspace.id,deletedAt:null}))});
  for(let index=0;index<f.rows.length;index++){
    const row=f.rows[index],assetId=f.images[index].id;
    state=setManualCullingMark(state,assetId,{rating:row.rating,flag:row.flag,colorLabel:row.colorLabel});
    for(const tag of row.tags)state=changeManualCullingTag(state,assetId,tag,true);
  }
  return state;
}

test('CULLING-TAG-MODE01 / JWT SQLite: saved tags only, AND/OR matches pure predicates while exact Stars stay unchanged',async()=>{
  const f=await fixture();try{
    const ui=dom(),panel=await f.mount(ui);
    await until(()=>panel.getState().phase==='ready');
    ui.button('Project全件を取得').dispatch('click');
    await until(()=>panel.getState().loadedMarkCount===5);
    const tags=ui.label('保存済みTagで絞り込む').children.map(item=>item.value);
    assert.deepEqual(tags,['','value:client','value:landscape','value:portrait']);
    const pure=pureState(f);
    change(ui,'保存済みTagで絞り込む','value:portrait');
    change(ui,'Flagで絞り込む','pick');
    assert.deepEqual(visibleIds(ui),[...filterManualCullingAssets(pure,{tag:'portrait',flag:'pick',mode:'and'})].sort());
    change(ui,'絞り込み条件の組合せ','or');
    change(ui,'Flagで絞り込む','reject');
    assert.deepEqual(visibleIds(ui),[...filterManualCullingAssets(pure,{tag:'portrait',flag:'reject',mode:'or'})].sort());
    change(ui,'保存済みTagで絞り込む','');change(ui,'Flagで絞り込む','');
    change(ui,'Starsで絞り込む','4');
    assert.deepEqual(visibleIds(ui),[f.images[0].id,f.images[1].id].sort());
    assert.equal(filterManualCullingAssets(pure,{minRating:4}).length,3);
    panel.dispose();
  }finally{await f.close();}
});

test('CULLING-TAG-MODE02 / JWT SQLite: condition change clears explicit selection and preflight reference',async()=>{
  const f=await fixture();try{
    const ui=dom(),panel=await f.mount(ui);
    await until(()=>panel.getState().phase==='ready');
    ui.button('Project全件を取得').dispatch('click');
    await until(()=>panel.getState().loadedMarkCount===5);
    change(ui,'保存済みTagで絞り込む','value:portrait');
    const checkbox=ui.label('絞り込み結果から写真を明示選択').children[0].children[0];
    checkbox.checked=true;checkbox.dispatch('change');
    assert.equal(panel.getState().selectedCount,1);
    ui.button('出力前の参考照合（最大20枚）').dispatch('click');
    await until(()=>panel.getState().preflightStatus==='reference-checked');
    change(ui,'絞り込み条件の組合せ','or');
    assert.equal(panel.getState().selectedCount,0);
    assert.equal(panel.getState().preflightStatus,'unchecked');
    assert.equal(ui.button('出力前の参考照合（最大20枚）').disabled,true);
    assert.doesNotMatch(ui.status().textContent,/参考照合しました/u);
    panel.dispose();
  }finally{await f.close();}
});

test('CULLING-TAG-MODE03 / JWT SQLite: changed Project version or tenant discards tag-filtered selection',async()=>{
  const f=await fixture();try{
    const ui=dom(),panel=await f.mount(ui);
    await until(()=>panel.getState().phase==='ready');ui.button('Project全件を取得').dispatch('click');
    await until(()=>panel.getState().loadedMarkCount===5);
    change(ui,'保存済みTagで絞り込む','value:portrait');
    const checkbox=ui.label('絞り込み結果から写真を明示選択').children[0].children[0];
    checkbox.checked=true;checkbox.dispatch('change');
    const baseVersion=f.http.workspaces.getCullingVersion(f.owner,f.workspace.id,f.project.id);
    f.http.workspaces.saveCullingMark(f.owner,f.workspace.id,f.project.id,f.images[2].id,
      {baseVersion,rating:2,flag:'reject',colorLabel:'Red',tags:['portrait'],segmentId:null});
    ui.button('選択を再確認').dispatch('click');
    await until(()=>panel.getState().phase==='conflict');
    assert.equal(panel.getState().selectedCount,0);
    assert.equal(panel.getState().preflightStatus,'unchecked');
    assert.equal(panel.getState().loadedMarkCount,null);
    assert.deepEqual(ui.label('保存済みTagで絞り込む').children.map(item=>item.value),['']);
    panel.dispose();

    let tenant='personal';const deniedUI=dom();
    const denied=await f.mount(deniedUI,{tokenProvider:()=>f.token('owner',tenant)});
    await until(()=>denied.getState().phase==='ready');
    deniedUI.button('Project全件を取得').dispatch('click');
    await until(()=>denied.getState().loadedMarkCount===5);
    change(deniedUI,'保存済みTagで絞り込む','value:portrait');
    const deniedCheckbox=deniedUI.label('絞り込み結果から写真を明示選択').children[0].children[0];
    deniedCheckbox.checked=true;deniedCheckbox.dispatch('change');
    assert.equal(denied.getState().selectedCount,1);
    tenant='other';deniedUI.button('選択を再確認').dispatch('click');
    await until(()=>denied.getState().phase==='denied');
    assert.equal(denied.getState().selectedCount,0);
    assert.equal(denied.getState().preflightStatus,'unchecked');
    assert.deepEqual(deniedUI.label('保存済みTagで絞り込む').children.map(item=>item.value),['']);
    denied.dispose();
  }finally{await f.close();}
});
