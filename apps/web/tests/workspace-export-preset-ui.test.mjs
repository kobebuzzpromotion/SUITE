import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {WorkspaceExportPresetClient} from '../src/workspace-export-preset-client.mjs';
import {createWorkspaceExportPresetPanel} from '../src/workspace-export-preset-ui.mjs';

class FakeNode{
  constructor(document,tag){this.ownerDocument=document;this.tagName=tag.toUpperCase();this.children=[];
    this.attributes=new Map();this.listeners=new Map();this.textContent='';this.value='';this.disabled=false;this.hidden=false;}
  setAttribute(key,value){this.attributes.set(key,String(value));}
  getAttribute(key){return this.attributes.get(key)??null;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(type,callback){const group=this.listeners.get(type)??[];group.push(callback);this.listeners.set(type,group);}
  focus(){this.ownerDocument.activeElement=this;}
  remove(){this.removed=true;}
  async emit(type,properties={}){const event={type,preventDefault(){this.defaultPrevented=true;},...properties};
    for(const handler of this.listeners.get(type)??[])await handler(event);return event;}
}
class FakeDocument{createElement(tag){return new FakeNode(this,tag);}}
const all=node=>[node,...node.children.flatMap(all)];
const byId=(panel,suffix)=>all(panel.element).find(node=>node.getAttribute('id')?.endsWith(suffix));
const button=(panel,label)=>all(panel.element).find(node=>node.tagName==='BUTTON'&&node.textContent===label);
const status=panel=>all(panel.element).find(node=>node.getAttribute('role')==='status').textContent;

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-export-preset-ui-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const http=new WorkspaceHTTP(root,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='export-ui';
  const auth=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})});
  const server=suiteServer(assets,storage,auth,http);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const baseURL=`http://127.0.0.1:${address.port}`;
  const token=(user)=>new SignJWT({tenant_id:'personal',email:`${user}@example.test`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'export-ui'}).setIssuer('https://issuer.example')
    .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const request=async(path,user='owner',method='GET',body)=>{
    const response=await fetch(baseURL+path,{method,headers:{authorization:`Bearer ${await token(user)}`,
      ...(body===undefined?{}:{'content-type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  };
  const created=await request('/v1/workspaces','owner','POST',{name:'Export UI workspace'});
  assert.equal(created.status,201);const workspaceId=created.body.workspace.id;
  const client=(user='owner')=>new WorkspaceExportPresetClient({baseURL,workspaceId,expectedSubject:user,
    expectedTenantId:'personal',tokenProvider:()=>token(user)});
  const member=async(user,role)=>{
    const path=`/v1/workspaces/${workspaceId}/invitations`;
    const invite=await request(path,'owner','POST',{email:`${user}@example.test`,role,expiresAt:new Date(Date.now()+600000).toISOString()});
    assert.equal(invite.status,201);assert.equal((await request(`${path}/accept`,user,'POST',{token:invite.body.token})).status,200);
  };
  return {client,member,request,workspaceId,close:async()=>{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    http.close();assets.close();await rm(root,{recursive:true,force:true});
  }};
}

test('EXP-UI01: explicit Personal/Workspace Save, list, reload and select read back all four settings; no Final claim',async()=>{
  const f=await fixture();try{
    await f.member('editor','EDITOR');
    const document=new FakeDocument(),panel=createWorkspaceExportPresetPanel({document,client:f.client('editor')});
    assert.equal(button(panel,'現在の書き出し設定へ反映').disabled,true);
    assert.match(status(panel),/未適用/);
    byId(panel,'-name').value='Private TIFF';byId(panel,'-format').value='tiff';
    byId(panel,'-size-kind').value='long-edge';byId(panel,'-size-value').value='1000';
    byId(panel,'-resolution-unit').value='ppc';byId(panel,'-resolution-value').value='118';
    byId(panel,'-sharpen-kind').value='manual';byId(panel,'-gain').value='0.6';
    byId(panel,'-radius').value='1.5';byId(panel,'-threshold').value='8';
    await button(panel,'新規保存').emit('click');
    const personal=panel.getSelected();assert.equal(personal.scope,'PERSONAL');assert.equal(personal.version,1);
    assert.deepEqual(personal.settings,{format:'tiff',size:{kind:'long-edge',value:1000},
      resolution:{unit:'ppc',value:118},outputSharpening:{kind:'manual',gain:0.6,radiusPx:1.5,thresholdLuma:8}});
    assert.match(status(panel),/Finalには未適用/);
    await button(panel,'一覧を再読込').emit('click');assert.equal(panel.getSelected(),null);
    byId(panel,'-list').value=personal.id;await byId(panel,'-list').emit('change');
    assert.deepEqual(panel.getSelected(),personal);
    assert.equal(button(panel,'現在の書き出し設定へ反映').disabled,true);
    byId(panel,'-list').value='';await byId(panel,'-list').emit('change');
    byId(panel,'-scope').value='WORKSPACE';byId(panel,'-name').value='Shared PNG';
    await button(panel,'新規保存').emit('click');
    assert.equal(panel.getSelected(),null);assert.match(status(panel),/本人権限/);
    const ownerPanel=createWorkspaceExportPresetPanel({document:new FakeDocument(),client:f.client()});
    byId(ownerPanel,'-scope').value='WORKSPACE';byId(ownerPanel,'-name').value='Shared PNG';
    await button(ownerPanel,'新規保存').emit('click');
    assert.equal(ownerPanel.getSelected().scope,'WORKSPACE');
    assert.equal((await f.client('editor').listExportPresets()).presets.length,2);
    ownerPanel.destroy();panel.destroy();
  }finally{await f.close();}
});

test('EXP-UI02: CAS conflict, Viewer, revoke and invalid form never report saved success',async()=>{
  const f=await fixture();try{
    await f.member('admin','ADMIN');await f.member('editor','EDITOR');await f.member('viewer','VIEWER');
    const editor=createWorkspaceExportPresetPanel({document:new FakeDocument(),client:f.client('editor')});
    byId(editor,'-name').value='Editable';await button(editor,'新規保存').emit('click');
    const first=editor.getSelected();assert.equal(first.version,1);
    byId(editor,'-name').value='Edited';await button(editor,'選択中を更新').emit('click');
    assert.equal(editor.getSelected().version,2);
    await f.client('editor').updateExportPreset(first.id,{baseVersion:2,name:'External',settings:first.settings});
    byId(editor,'-name').value='Stale';await button(editor,'選択中を更新').emit('click');
    assert.equal(editor.getSelected(),null);assert.match(status(editor),/版が変わりました/);
    const viewer=createWorkspaceExportPresetPanel({document:new FakeDocument(),client:f.client('viewer')});
    await button(viewer,'一覧を再読込').emit('click');assert.match(status(viewer),/取得できません/);
    byId(editor,'-name').value='Bad';byId(editor,'-size-kind').value='percentage';byId(editor,'-size-value').value='101';
    await button(editor,'新規保存').emit('click');assert.match(status(editor),/入力値/);
    const refreshed=await editor.reload();assert.ok(refreshed);
    await f.request(`/v1/workspaces/${f.workspaceId}/members/editor`,'owner','DELETE');
    await editor.reload();assert.match(status(editor),/本人権限/);
    assert.equal(editor.getSelected(),null);
    editor.destroy();viewer.destroy();
  }finally{await f.close();}
});

test('EXP-UI03: host readback is required for Apply; failure or cancellation is not Final/naming evidence',async()=>{
  const f=await fixture();try{
    let current=null,readbackWrong=false;
    const host={async applySettings({settings}){current=settings;},async readCurrentSettings(){return readbackWrong?
      {format:'png',size:{kind:'original'},resolution:null,outputSharpening:{kind:'none'}}:current;}};
    const panel=createWorkspaceExportPresetPanel({document:new FakeDocument(),client:f.client(),host});
    byId(panel,'-name').value='Explicit';await button(panel,'新規保存').emit('click');
    assert.equal(button(panel,'現在の書き出し設定へ反映').disabled,false);
    byId(panel,'-size-kind').value='percentage';await byId(panel,'-size-kind').emit('change');
    assert.equal(button(panel,'現在の書き出し設定へ反映').disabled,true);
    assert.equal(await panel.applySelected(),null);assert.match(status(panel),/未保存の変更/);
    byId(panel,'-size-kind').value='original';await byId(panel,'-size-kind').emit('change');
    assert.equal(button(panel,'現在の書き出し設定へ反映').disabled,false);
    readbackWrong=true;assert.equal(await panel.applySelected(),null);
    assert.match(status(panel),/結果が不確定/);
    readbackWrong=false;const applied=await panel.applySelected();
    assert.equal(applied.finalVerified,false);assert.equal(applied.presetVersion,1);
    assert.match(status(panel),/Final出力・命名証拠は未確認/);
    panel.destroy();
    let release;
    const pending=new Promise(resolve=>{release=resolve;});
    const slow={listExportPresets:async()=>pending,getExportPreset:async()=>{},createExportPreset:async()=>{},updateExportPreset:async()=>{}};
    const interrupted=createWorkspaceExportPresetPanel({document:new FakeDocument(),client:slow});
    const loading=interrupted.reload();
    const escape=await interrupted.element.emit('keydown',{key:'Escape'});assert.equal(escape.defaultPrevented,true);
    release({presets:[]});await loading;
    assert.match(status(interrupted),/中断しました/);assert.equal(interrupted.getSelected(),null);
    interrupted.destroy();
  }finally{await f.close();}
});
