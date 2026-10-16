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

const owner={userId:'owner'},encoder=new TextEncoder();
const packet=values=>encoder.encode(`<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n`+
  `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n`+
  `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n`+
  `<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">\n`+
  `${values}\n</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>\n`);
const sidecar=(bytes,name='wrong-photo.xmp')=>({name,size:bytes.byteLength,
  async arrayBuffer(){return bytes.slice().buffer;}});
class Node{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.listeners=new Map();
    this.attributes=new Map();this.value='';this.textContent='';this.disabled=false;this.checked=false;this.files=[];}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this.attributes.set(key,value);}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  dispatch(type){const fn=this.listeners.get(type);assert.ok(fn,`missing ${type}`);
    return fn({preventDefault(){},key:null});}
  focus(){this.ownerDocument.focused=this;}
}
function dom(){const doc={focused:null,createElement(tag){return new Node(doc,tag);}},container=new Node(doc,'main');
  const find=predicate=>{const walk=node=>predicate(node)?node:node.children.map(walk).find(Boolean);
    const found=walk(container);assert.ok(found,'control not found');return found;};
  return {container,label:name=>find(node=>node.attributes.get('aria-label')===name),
    button:name=>find(node=>node.tagName==='button'&&node.textContent===name),
    status:()=>find(node=>node.attributes.get('role')==='status'),
    preview:()=>find(node=>node.attributes.get('aria-live')==='polite'&&
      typeof node.textContent==='string'&&node.textContent.startsWith('確認内容:'))};}
async function until(check){const start=Date.now();while(!check()){
  if(Date.now()-start>7000)throw Error('timeout');await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-xmp-import-panel-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const http=new WorkspaceHTTP(root,assets,storage);let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'XMP Panel');
    const project=http.workspaces.createProject(owner,workspace.id,'Project');
    const makeAsset=name=>{const bytes=Buffer.from(`synthetic-original-${name}`);
      const asset=assets.create(workspace.id,{name,
        sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
      http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);return asset;};
    const asset=makeAsset('one.bin'),other=makeAsset('two.bin');
    http.workspaces.createCullingSegment(owner,workspace.id,project.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),id:'story',name:'Story'});
    http.workspaces.saveCullingMark(owner,workspace.id,project.id,asset.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
        rating:1,flag:'pick',colorLabel:'Blue',tags:['keep'],segmentId:'story'});
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='xmp-panel';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'xmp-panel'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const mount=(ui,overrides={})=>mountVerifiedWorkspaceCulling({container:ui.container,
      baseURL:`http://127.0.0.1:${address.port}`,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,assetId:asset.id}),
      workspaceId:workspace.id,projectId:project.id,assetId:asset.id,
      expectedSubject:'owner',expectedTenantId:'personal',...overrides});
    return {assets,http,workspace,project,asset,other,token,mount,
      mark:()=>http.workspaces.getCullingMark(owner,workspace.id,project.id,asset.id),
      async close(){await new Promise(resolve=>server.close(resolve));http.close();assets.close();
        await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}
function chooseFile(ui,bytes){const file=ui.label('この写真へ取り込むXMP sidecar');
  file.files=[sidecar(bytes)];file.dispatch('change');}
async function inspect(ui,panel,bytes){chooseFile(ui,bytes);ui.button('XMP内容を確認').dispatch('click');
  await until(()=>panel.getState().phase==='ready'&&ui.status().textContent.includes('保存はまだ行っていません'));}

test('CULLING-XMP-IMPORT-UI01 / JWT SQLite: one sidecar preview, distinct Apply click, saved readback and other marks unchanged',async()=>{
  const f=await fixture();try{
    const ui=dom(),panel=await f.mount(ui),bytes=packet('<xmp:Rating>5</xmp:Rating><xmp:Label>Gold</xmp:Label>');
    const original=Uint8Array.from(bytes),before=f.mark();
    await until(()=>panel.getState().phase==='ready');
    assert.equal(ui.button('確認したXMPをこの写真へ適用').disabled,true);
    await inspect(ui,panel,bytes);
    assert.match(ui.preview().textContent,/Rating 5/u);
    assert.deepEqual(f.mark(),before);
    assert.equal(ui.button('確認したXMPをこの写真へ適用').disabled,false);
    ui.button('確認したXMPをこの写真へ適用').dispatch('click');
    await until(()=>ui.status().textContent.includes('再読込で確認しました'));
    assert.equal(f.mark().rating,5);assert.equal(f.mark().colorLabel,'Gold');
    for(const key of ['flag','tags','segmentId'])assert.deepEqual(f.mark()[key],before[key]);
    assert.deepEqual(bytes,original);
    assert.equal(ui.button('確認したXMPをこの写真へ適用').disabled,true);
    assert.equal(panel.getState().phase,'ready');panel.dispose();
  }finally{await f.close();}
});

test('CULLING-XMP-IMPORT-UI02 / JWT SQLite: unknown, Reject, oversized and changed file cannot apply stale preview',async()=>{
  const f=await fixture();try{
    const ui=dom(),panel=await f.mount(ui),before=f.mark();
    await until(()=>panel.getState().phase==='ready');
    for(const bytes of [packet('<xmp:Rating>-1</xmp:Rating>'),
      packet('<xmp:Rating>3</xmp:Rating><evil:Pick>true</evil:Pick>'),new Uint8Array(4097)]){
      chooseFile(ui,bytes);ui.button('XMP内容を確認').dispatch('click');
      await until(()=>panel.getState().phase==='ready'&&
        (/未対応/u.test(ui.status().textContent)||/4KiB/u.test(ui.status().textContent)));
      assert.equal(ui.button('確認したXMPをこの写真へ適用').disabled,true);
    }
    await inspect(ui,panel,packet('<xmp:Rating>5</xmp:Rating>'));
    chooseFile(ui,packet('<xmp:Label>Changed</xmp:Label>'));
    assert.equal(ui.button('確認したXMPをこの写真へ適用').disabled,true);
    assert.deepEqual(f.mark(),before);panel.dispose();
  }finally{await f.close();}
});

test('CULLING-XMP-IMPORT-UI03 / JWT SQLite: revoked tenant, changed Asset and cancelled preview never show success',async()=>{
  const f=await fixture();try{
    let tenant='personal';const ui=dom(),panel=await f.mount(ui,{tokenProvider:()=>f.token('owner',tenant)});
    await until(()=>panel.getState().phase==='ready');
    await inspect(ui,panel,packet('<xmp:Rating>5</xmp:Rating>'));
    tenant='wrong';ui.button('確認したXMPをこの写真へ適用').dispatch('click');
    await until(()=>panel.getState().phase==='denied'||panel.getState().phase==='uncertain');
    assert.equal(f.mark().rating,1);assert.doesNotMatch(ui.status().textContent,/再読込で確認しました/u);
    panel.dispose();

    let selected=f.asset.id;const changedUI=dom();const changed=await f.mount(changedUI,{
      selectionProvider:()=>({workspaceId:f.workspace.id,projectId:f.project.id,assetId:selected})});
    await until(()=>changed.getState().phase==='ready');
    await inspect(changedUI,changed,packet('<xmp:Rating>5</xmp:Rating>'));
    selected=f.other.id;
    changedUI.button('確認したXMPをこの写真へ適用').dispatch('click');
    await until(()=>changed.getState().phase==='uncertain'||changed.getState().phase==='denied');
    assert.equal(f.mark().rating,1);changed.dispose();

    const cancelUI=dom(),cancelled=await f.mount(cancelUI);
    await until(()=>cancelled.getState().phase==='ready');
    await inspect(cancelUI,cancelled,packet('<xmp:Rating>5</xmp:Rating>'));
    cancelUI.button('通信を取消').dispatch('click');
    assert.equal(cancelUI.button('確認したXMPをこの写真へ適用').disabled,true);
    assert.equal(f.mark().rating,1);cancelled.dispose();
  }finally{await f.close();}
});

test('CULLING-XMP-IMPORT-UI04 / JWT SQLite: CAS conflict or lost response is not confirmed success',async()=>{
  const f=await fixture();try{
    let injected=false;const ui=dom(),panel=await f.mount(ui,{fetchImpl:(url,init)=>{
      if(!injected&&init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')){
        injected=true;const current=f.mark();
        f.http.workspaces.saveCullingMark(owner,f.workspace.id,f.project.id,f.asset.id,
          {baseVersion:f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),
            rating:current.rating,flag:current.flag,colorLabel:'external',tags:current.tags,
            segmentId:current.segmentId});
      }
      return fetch(url,init);
    }});
    await until(()=>panel.getState().phase==='ready');
    await inspect(ui,panel,packet('<xmp:Rating>5</xmp:Rating>'));
    ui.button('確認したXMPをこの写真へ適用').dispatch('click');
    await until(()=>panel.getState().phase==='conflict');
    assert.equal(f.mark().rating,1);assert.equal(f.mark().colorLabel,'external');
    assert.doesNotMatch(ui.status().textContent,/保存し、再読込で確認/u);panel.dispose();

    let dropped=false;const lostUI=dom(),lost=await f.mount(lostUI,{fetchImpl:async(url,init)=>{
      if(!dropped&&init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')){
        dropped=true;await fetch(url,init);throw Error('response lost');}
      return fetch(url,init);
    }});
    await until(()=>lost.getState().phase==='ready');
    await inspect(lostUI,lost,packet('<xmp:Rating>5</xmp:Rating>'));
    lostUI.button('確認したXMPをこの写真へ適用').dispatch('click');
    await until(()=>lost.getState().phase==='uncertain');
    assert.equal(f.mark().rating,5);
    assert.match(lostUI.status().textContent,/未確認/u);lost.dispose();
  }finally{await f.close();}
});

test('CULLING-XMP-IMPORT-UI05: unverified bare panel has no XMP import controls',()=>{
  const ui=dom(),id='11111111-1111-4111-8111-111111111111';
  const panel=mountWorkspaceCullingPanel({container:ui.container,baseURL:'http://127.0.0.1:1',
    tokenProvider:()=>'',workspaceId:id,projectId:id,assetId:id});
  assert.throws(()=>ui.button('XMP内容を確認'),/control not found/u);
  assert.throws(()=>ui.button('確認したXMPをこの写真へ適用'),/control not found/u);
  panel.dispose();
});
