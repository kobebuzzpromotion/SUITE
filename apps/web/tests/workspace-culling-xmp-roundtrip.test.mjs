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

const owner={userId:'owner'};
class Node {
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.attributes=new Map();
    this.listeners=new Map();this.value='';this.textContent='';this.disabled=false;this.files=[];this.parent=null;}
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
function dom(){const urls=new Map(),revoked=[],downloads=[];let next=0;
  const doc={focused:null,downloads,createElement(tag){return new Node(doc,tag);},
    defaultView:{Blob,URL:{createObjectURL(blob){const url=`blob:roundtrip/${++next}`;
      urls.set(url,blob);return url;},revokeObjectURL(url){revoked.push(url);urls.delete(url);}}}};
  const container=new Node(doc,'main');
  const find=predicate=>{const walk=node=>predicate(node)?node:node.children.map(walk).find(Boolean);
    const found=walk(container);assert.ok(found,'control not found');return found;};
  return {container,urls,revoked,downloads,
    button:name=>find(node=>node.tagName==='button'&&node.textContent===name),
    label:name=>find(node=>node.attributes.get('aria-label')===name),
    status:()=>find(node=>node.attributes.get('role')==='status'),
    preview:()=>find(node=>node.attributes.get('aria-live')==='polite'&&
      typeof node.textContent==='string'&&node.textContent.startsWith('確認内容:'))};
}
async function until(check){const start=Date.now();while(!check()){
  if(Date.now()-start>7000)throw Error('timeout');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-xmp-roundtrip-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const http=new WorkspaceHTTP(root,assets,storage);let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'XMP Roundtrip');
    const project=http.workspaces.createProject(owner,workspace.id,'Project');
    const originals=new Map();
    const makeAsset=name=>{const bytes=Buffer.from(`synthetic-not-RAW-${name}`);
      const sha256=createHash('sha256').update(bytes).digest('hex');
      const asset=assets.create(workspace.id,{name,sha256,size:bytes.length});
      originals.set(asset.id,Buffer.from(bytes));
      http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);return asset;};
    const source=makeAsset('source.bin'),target=makeAsset('target.bin');
    http.workspaces.createCullingSegment(owner,workspace.id,project.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
        id:'story',name:'Story'});
    const save=(asset,values)=>http.workspaces.saveCullingMark(owner,workspace.id,project.id,asset.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),...values});
    save(source,{rating:4,flag:'none',colorLabel:'Amber & Gold',tags:[],segmentId:null});
    save(target,{rating:1,flag:'pick',colorLabel:'Blue',tags:['keep'],segmentId:'story'});
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='xmp-roundtrip';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'xmp-roundtrip'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const mount=(ui,asset,overrides={})=>mountVerifiedWorkspaceCulling({container:ui.container,
      baseURL:`http://127.0.0.1:${address.port}`,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,assetId:asset.id}),
      workspaceId:workspace.id,projectId:project.id,assetId:asset.id,
      expectedSubject:'owner',expectedTenantId:'personal',...overrides});
    const mark=asset=>http.workspaces.getCullingMark(owner,workspace.id,project.id,asset.id);
    const version=()=>http.workspaces.getCullingVersion(owner,workspace.id,project.id);
    return {assets,http,workspace,project,source,target,originals,token,mount,mark,version,save,
      async close(){await new Promise(resolve=>server.close(resolve));http.close();assets.close();
        await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}
function choose(ui,bytes,name='misleading-source-name.xmp'){
  const file=ui.label('この写真へ取り込むXMP sidecar');file.files=[{name,size:bytes.byteLength,
    async arrayBuffer(){return bytes.slice().buffer;}}];file.dispatch('change');
}
async function exportedBytes(f){
  const ui=dom(),panel=await f.mount(ui,f.source);
  try{
    await until(()=>panel.getState().phase==='ready');
    assert.equal(ui.downloads.length,0);
    ui.button('この写真のXMPを取得').dispatch('click');
    await until(()=>ui.downloads.length===1);
    const blob=ui.urls.get(ui.downloads[0].href);assert.ok(blob);
    assert.equal(ui.downloads[0].name,`SUITE-culling-${f.source.id}.xmp`);
    const bytes=new Uint8Array(await blob.arrayBuffer());
    assert.match(new TextDecoder().decode(bytes),/<xmp:Rating>4<\/xmp:Rating>/u);
    assert.match(new TextDecoder().decode(bytes),/<xmp:Label>Amber &amp; Gold<\/xmp:Label>/u);
    return bytes;
  }finally{panel.dispose();assert.equal(ui.urls.size,0);assert.equal(ui.revoked.length,1);}
}
async function inspect(ui,panel,bytes){choose(ui,bytes);ui.button('XMP内容を確認').dispatch('click');
  await until(()=>panel.getState().phase==='ready'&&ui.status().textContent.includes('保存はまだ行っていません'));
  assert.match(ui.preview().textContent,/Rating 4/u);
  assert.match(ui.preview().textContent,/Amber & Gold/u);
}

test('CULLING-XMP-ROUNDTRIP01 / JWT SQLite: exported bytes preview then explicit other-Asset CAS apply and readback',async()=>{
  const f=await fixture();try{
    const sourceBefore=f.mark(f.source),targetBefore=f.mark(f.target),versionBefore=f.version();
    const sourceSHA=f.assets.get(f.workspace.id,f.source.id).sha256;
    const targetSHA=f.assets.get(f.workspace.id,f.target.id).sha256;
    const bytes=await exportedBytes(f),originalBytes=Uint8Array.from(bytes);
    const ui=dom(),panel=await f.mount(ui,f.target);
    try{
      await until(()=>panel.getState().phase==='ready');
      assert.equal(ui.button('確認したXMPをこの写真へ適用').disabled,true);
      await inspect(ui,panel,bytes);
      assert.deepEqual(f.mark(f.target),targetBefore);
      assert.equal(f.version(),versionBefore);
      assert.equal(ui.button('確認したXMPをこの写真へ適用').disabled,false);
      ui.button('確認したXMPをこの写真へ適用').dispatch('click');
      await until(()=>ui.status().textContent.includes('再読込で確認しました'));
      const saved=f.mark(f.target);
      assert.equal(saved.rating,4);assert.equal(saved.colorLabel,'Amber & Gold');
      for(const key of ['flag','tags','segmentId'])assert.deepEqual(saved[key],targetBefore[key]);
      assert.equal(f.version(),versionBefore+1);
      assert.deepEqual(f.mark(f.source),sourceBefore);
      assert.deepEqual(bytes,originalBytes);
      assert.equal(f.assets.get(f.workspace.id,f.source.id).sha256,sourceSHA);
      assert.equal(f.assets.get(f.workspace.id,f.target.id).sha256,targetSHA);
      assert.deepEqual(f.originals.get(f.source.id),Buffer.from('synthetic-not-RAW-source.bin'));
      assert.deepEqual(f.originals.get(f.target.id),Buffer.from('synthetic-not-RAW-target.bin'));
      assert.equal(ui.button('確認したXMPをこの写真へ適用').disabled,true);
    }finally{panel.dispose();}
  }finally{await f.close();}
});

test('CULLING-XMP-ROUNDTRIP02 / JWT SQLite: exported bytes do not bypass changed Project version',async()=>{
  const f=await fixture();try{
    const bytes=await exportedBytes(f),ui=dom(),panel=await f.mount(ui,f.target);
    try{
      await until(()=>panel.getState().phase==='ready');await inspect(ui,panel,bytes);
      const targetBefore=f.mark(f.target);
      f.save(f.source,{rating:3,flag:'none',colorLabel:'Amber & Gold',tags:[],segmentId:null});
      ui.button('確認したXMPをこの写真へ適用').dispatch('click');
      await until(()=>['conflict','uncertain'].includes(panel.getState().phase));
      assert.deepEqual(f.mark(f.target),targetBefore);
      assert.doesNotMatch(ui.status().textContent,/再読込で確認しました/u);
    }finally{panel.dispose();}
  }finally{await f.close();}
});

test('CULLING-XMP-ROUNDTRIP03 / JWT SQLite: invalid or Reject XMP never applies, even with another file name',async()=>{
  const f=await fixture();try{
    const bytes=await exportedBytes(f),ui=dom(),panel=await f.mount(ui,f.target);
    try{
      await until(()=>panel.getState().phase==='ready');const before=f.mark(f.target);
      const text=new TextDecoder().decode(bytes);
      for(const bad of [text.replace('<xmp:Rating>4</xmp:Rating>', '<xmp:Rating>-1</xmp:Rating>'),
        text.replace('<xmp:Rating>4</xmp:Rating>', '<xmp:Rating>4</xmp:Rating><evil:Pick>true</evil:Pick>')]){
        choose(ui,new TextEncoder().encode(bad),'trusted-name.xmp');
        ui.button('XMP内容を確認').dispatch('click');
        await until(()=>panel.getState().phase==='ready'&&ui.status().textContent.includes('未対応'));
        assert.equal(ui.button('確認したXMPをこの写真へ適用').disabled,true);
      }
      assert.deepEqual(f.mark(f.target),before);
    }finally{panel.dispose();}
  }finally{await f.close();}
});
