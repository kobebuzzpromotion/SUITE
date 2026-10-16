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
import {mountWorkspaceCullingPanel} from '../src/workspace-culling-panel.mjs';

const owner={userId:'owner'};
class Node {
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.attributes=new Map();
    this.listeners=new Map();this.value='';this.textContent='';this.disabled=false;this.parent=null;}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.append(...nodes);}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}}
  setAttribute(key,value){this.attributes.set(key,value);}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  dispatch(type){const fn=this.listeners.get(type);assert.ok(fn,`missing ${type}`);
    return fn({preventDefault(){},key:null});}
  focus(){this.ownerDocument.focused=this;}
  click(){if(this.tagName==='a')this.ownerDocument.downloads.push({href:this.href,name:this.download});}
}
function dom(){
  const urls=new Map(),revoked=[],downloads=[];
  let next=0;
  const doc={focused:null,downloads,createElement(tag){return new Node(doc,tag);},
    defaultView:{Blob,URL:{createObjectURL(blob){const url=`blob:test/${++next}`;urls.set(url,blob);return url;},
      revokeObjectURL(url){revoked.push(url);urls.delete(url);}}}};
  const container=new Node(doc,'main');
  const find=predicate=>{const walk=node=>predicate(node)?node:node.children.map(walk).find(Boolean);
    const found=walk(container);assert.ok(found,'control not found');return found;};
  return {container,urls,revoked,downloads,button:name=>find(node=>node.tagName==='button'&&node.textContent===name),
    status:()=>find(node=>node.attributes.get('role')==='status')};
}
async function until(check){const start=Date.now();while(!check()){
  if(Date.now()-start>7000)throw Error('timeout');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-xmp-download-'));
  const assets=new AssetRepository(join(root,'assets.sqlite')),
    storage=new LocalObjectStorage(join(root,'objects')),
    http=new WorkspaceHTTP(root,assets,storage);
  let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'XMP'),
      project=http.workspaces.createProject(owner,workspace.id,'Project');
    const makeAsset=name=>{const bytes=Buffer.from(`synthetic-not-RAW-${name}`);
      const asset=assets.create(workspace.id,{name,sha256:createHash('sha256').update(bytes).digest('hex'),
        size:bytes.length});http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);return asset;};
    const asset=makeAsset('one.bin'),other=makeAsset('two.bin');
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='xmp-download';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'xmp-download'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const mark=(rating,flag,colorLabel,tags=[],segmentId=null)=>{
      const baseVersion=http.workspaces.getCullingVersion(owner,workspace.id,project.id);
      return http.workspaces.saveCullingMark(owner,workspace.id,project.id,asset.id,
        {baseVersion,rating,flag,colorLabel,tags,segmentId});};
    const mount=(ui,overrides={})=>mountVerifiedWorkspaceCulling({container:ui.container,
      baseURL:`http://127.0.0.1:${address.port}`,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,assetId:asset.id}),
      workspaceId:workspace.id,projectId:project.id,assetId:asset.id,
      expectedSubject:'owner',expectedTenantId:'personal',...overrides});
    return {root,assets,http,workspace,project,asset,other,token,mark,mount,
      async close(){await new Promise(resolve=>server.close(resolve));http.close();assets.close();
        await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}

test('CULLING-XMP-DOWNLOAD01 / JWT SQLite: explicit click gates one current Asset and downloads safe Rating/Label bytes only',async()=>{
  const f=await fixture();try{
    f.mark(4,'none','Blue');
    const ui=dom();let selected=f.asset.id;
    const panel=await f.mount(ui,{selectionProvider:()=>({workspaceId:f.workspace.id,
      projectId:f.project.id,assetId:selected})});
    await until(()=>panel.getState().phase==='ready');
    assert.equal(ui.downloads.length,0);
    ui.button('この写真のXMPを取得').dispatch('click');
    await until(()=>ui.downloads.length===1);
    assert.equal(ui.downloads[0].name,`SUITE-culling-${f.asset.id}.xmp`);
    const blob=ui.urls.get(ui.downloads[0].href);assert.ok(blob);
    assert.match(await blob.text(),/<xmp:Rating>4<\/xmp:Rating>/u);
    assert.match(await blob.text(),/<xmp:Label>Blue<\/xmp:Label>/u);
    assert.doesNotMatch(await blob.text(),/Bearer |token|originalSHA256/u);
    assert.equal('xmpURL' in panel.getState(),false);
    await panel.refresh();
    await until(()=>panel.getState().phase==='ready');
    assert.equal(ui.urls.size,0);assert.equal(ui.revoked.length,1);
    assert.equal(ui.downloads.length,1);
    ui.button('この写真のXMPを取得').dispatch('click');
    await until(()=>ui.downloads.length===2);
    selected=f.other.id;
    assert.equal(await panel.checkSelection(),false);
    assert.equal(ui.urls.size,0);assert.equal(ui.revoked.length,2);
  }finally{await f.close();}
});

test('CULLING-XMP-DOWNLOAD02 / JWT SQLite: unsupported Pick/Tags, revoked identity and changed selection produce zero downloads',async()=>{
  const f=await fixture();try{
    f.mark(0,'pick',null);
    const ui=dom(),panel=await f.mount(ui);
    await until(()=>panel.getState().phase==='ready');
    ui.button('この写真のXMPを取得').dispatch('click');
    await until(()=>panel.getState().phase==='error');
    assert.equal(ui.downloads.length,0);assert.equal(ui.urls.size,0);panel.dispose();

    f.mark(2,'none',null,['unmapped']);
    const tagsUI=dom(),tagsPanel=await f.mount(tagsUI);
    await until(()=>tagsPanel.getState().phase==='ready');
    tagsUI.button('この写真のXMPを取得').dispatch('click');
    await until(()=>tagsPanel.getState().phase==='error');
    assert.equal(tagsUI.downloads.length,0);tagsPanel.dispose();

    const baseVersion=f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id);
    f.http.workspaces.createCullingSegment(owner,f.workspace.id,f.project.id,
      {baseVersion,id:'story',name:'Story'});
    f.mark(2,'none',null,[],'story');
    const segmentUI=dom(),segmentPanel=await f.mount(segmentUI);
    await until(()=>segmentPanel.getState().phase==='ready');
    segmentUI.button('この写真のXMPを取得').dispatch('click');
    await until(()=>segmentPanel.getState().phase==='error');
    assert.equal(segmentUI.downloads.length,0);segmentPanel.dispose();

    f.mark(3,'none',null);
    let tenant='personal';const deniedUI=dom();
    const denied=await f.mount(deniedUI,{tokenProvider:()=>f.token('owner',tenant)});
    await until(()=>denied.getState().phase==='ready');
    tenant='wrong-tenant';deniedUI.button('この写真のXMPを取得').dispatch('click');
    await until(()=>denied.getState().phase==='denied');
    assert.equal(deniedUI.downloads.length,0);assert.equal(deniedUI.urls.size,0);denied.dispose();

    const changedUI=dom();let selected=f.asset.id;
    const changed=await f.mount(changedUI,{selectionProvider:()=>({workspaceId:f.workspace.id,
      projectId:f.project.id,assetId:selected})});
    await until(()=>changed.getState().phase==='ready');
    selected=f.other.id;
    assert.equal(await changed.checkSelection(),false);
    assert.equal(changedUI.container.children.length,0);
    assert.equal(changedUI.downloads.length,0);
  }finally{await f.close();}
});

test('CULLING-XMP-DOWNLOAD03 / JWT SQLite: abort before fresh Asset response leaves no Blob or click',async()=>{
  const f=await fixture();try{
    const ui=dom();let entered=false;
    const panel=await f.mount(ui,{fetchImpl:(url,init)=>{
      if(new URL(url).pathname.endsWith('/assets')){
        entered=true;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',
          ()=>reject(new DOMException('cancelled','AbortError')),{once:true}));
      }
      return fetch(url,init);
    }});
    await until(()=>panel.getState().phase==='ready');
    ui.button('この写真のXMPを取得').dispatch('click');await until(()=>entered);
    ui.button('通信を取消').dispatch('click');
    await until(()=>panel.getState().phase==='error');
    assert.equal(ui.downloads.length,0);assert.equal(ui.urls.size,0);
    panel.dispose();
  }finally{await f.close();}
});

test('CULLING-XMP-DOWNLOAD04: unverified panel has no XMP control',()=>{
  const ui=dom();
  const id='11111111-1111-4111-8111-111111111111';
  const panel=mountWorkspaceCullingPanel({container:ui.container,baseURL:'http://127.0.0.1:1',
    tokenProvider:()=>'',workspaceId:id,projectId:id,assetId:id});
  assert.equal(ui.container.children[0].children.some(node=>node.textContent==='この写真のXMPを取得'),false);
  assert.throws(()=>ui.button('この写真のXMPを取得'),/control not found/u);
  panel.dispose();
});
