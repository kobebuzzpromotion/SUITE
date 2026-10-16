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
import {WorkspaceCullingClient} from '../src/workspace-culling-client.mjs';
import {mountVerifiedWorkspaceCulling} from '../src/workspace-culling-verified-mount.mjs';

const recipe = () => ({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,
  rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
class Node {
  constructor(doc,tag) {this.ownerDocument=doc;this.tagName=tag;this.children=[];this.attributes=new Map();
    this.listeners=new Map();this.value='';this.textContent='';this.disabled=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this.attributes.set(key,value);}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  dispatch(type){const fn=this.listeners.get(type);assert.ok(fn,`missing ${type}`);return fn({preventDefault(){}});}
  focus(){this.ownerDocument.focused=this;}
}
function dom(){const doc={focused:null,createElement(tag){return new Node(doc,tag);}},container=new Node(doc,'main');
  const find=predicate=>{const walk=node=>predicate(node)?node:node.children.map(walk).find(Boolean);
    const found=walk(container);assert.ok(found,'control not found');return found;};
  return {container,button:name=>find(node=>node.tagName==='button'&&node.textContent===name),
    label:name=>find(node=>node.attributes.get('aria-label')===name),
    status:()=>find(node=>node.attributes.get('role')==='status')};}
async function until(check){const start=Date.now();while(!check()){if(Date.now()-start>7000)throw Error('timeout');
  await new Promise(resolve=>setTimeout(resolve,10));}}
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-culling-web-preflight-'));
  const assets=new AssetRepository(join(root,'assets.sqlite')),
    storage=new LocalObjectStorage(join(root,'objects')),
    http=new WorkspaceHTTP(root,assets,storage),owner={userId:'owner'};
  let server;
  try {
    const workspace=http.workspaces.createWorkspace(owner,'Web preflight'),
      project=http.workspaces.createProject(owner,workspace.id,'Project');
    const addAsset=index=>{const bytes=Buffer.from(`synthetic-not-RAW-${index}`);
      const asset=assets.create(workspace.id,{name:`${index}.bin`,
        sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
      http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);
      http.workspaces.saveRecipe(owner,workspace.id,project.id,asset.id,{baseVersion:0,body:recipe()});return asset;};
    const images=[addAsset(0),addAsset(1)];
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='culling-web-preflight';
    const authenticate=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',
      jwks:createLocalJWKSet({keys:[jwk]})});
    server=suiteServer(assets,storage,authenticate,http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'culling-web-preflight'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return {root,assets,http,owner,workspace,project,images,token,
      baseURL:`http://127.0.0.1:${address.port}`,async close(){await new Promise(resolve=>server.close(resolve));
        http.close();assets.close();await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}
function select(ui,index){const box=ui.label('絞り込み結果から写真を明示選択').children[index].children[0];
  box.checked=true;box.dispatch('change');}

test('CULLING-WEB-PREFLIGHT01: JWT/SQLite client sends current set version and ordered SHA/Recipe heads; only reference plan returns',async()=>{
  const f=await fixture();try{
    let posted;
    const client=new WorkspaceCullingClient({baseURL:f.baseURL,tokenProvider:()=>f.token(),
      fetchImpl:(url,init)=>{if(new URL(url).pathname.endsWith('/export-preflight'))posted=JSON.parse(init.body);
        return fetch(url,init);}});
    const version=f.http.workspaces.getCullingVersion(f.owner,f.workspace.id,f.project.id);
    const order=[f.images[1].id,f.images[0].id];
    const audit=f.http.workspaces.listAudit(f.owner,f.workspace.id).length;
    const result=await client.preflightExportSelection({workspaceId:f.workspace.id,projectId:f.project.id,
      expectedCullingVersion:version,orderedAssetIds:order});
    assert.deepEqual(posted,{expectedCullingVersion:version,orderedAssets:order.map((assetId,index)=>({assetId,
      expectedOriginalSHA256:f.images[1-index].sha256,expectedRecipeVersion:1}))});
    assert.deepEqual(result.orderedAssets.map(item=>item.assetId),order);
    assert.equal(result.authoritativeForFinal,false);
    assert.equal(result.status,'PREFLIGHT_ONLY_RECHECK_BEFORE_FINAL');
    assert.equal(f.http.workspaces.listAudit(f.owner,f.workspace.id).length,audit);
    assert.equal('token' in result,false);
  }finally{await f.close();}
});

test('CULLING-WEB-PREFLIGHT02: verified host checks explicit selection, exposes only a non-Final reference status, and clears it on change',async()=>{
  const f=await fixture();try{
    const ui=dom(),assetId=f.images[0].id;
    let selected=assetId;
    const panel=await mountVerifiedWorkspaceCulling({container:ui.container,baseURL:f.baseURL,
      tokenProvider:()=>f.token(),selectionProvider:()=>({workspaceId:f.workspace.id,projectId:f.project.id,assetId:selected}),
      workspaceId:f.workspace.id,projectId:f.project.id,assetId,expectedSubject:'owner',expectedTenantId:'personal'});
    await until(()=>panel.getState().phase==='ready');
    ui.button('Project全件を取得').dispatch('click');
    await until(()=>panel.getState().loadedMarkCount===2);
    select(ui,0);select(ui,1);
    ui.button('出力前の参考照合（最大20枚）').dispatch('click');
    await until(()=>panel.getState().preflightStatus==='reference-checked');
    assert.equal(panel.getState().preflightCount,2);
    assert.equal(panel.getState().selectedCount,2);
    assert.match(ui.status().textContent,/Final出力の許可ではなく/u);
    assert.equal('orderedAssets' in panel.getState(),false);
    assert.equal('getVerifiedSelection' in panel,false);
    ui.label('Starsで絞り込む').value='4';ui.label('Starsで絞り込む').dispatch('change');
    assert.equal(panel.getState().preflightStatus,'unchecked');
    assert.equal(panel.getState().selectedCount,0);
    selected=f.images[1].id;
    assert.equal(await panel.checkSelection(),false);
    assert.equal(ui.container.children.length,0);
  }finally{await f.close();}
});

test('CULLING-WEB-PREFLIGHT03: stale Recipe, switched host, denied JWT and malformed response all discard the whole selection',async()=>{
  const f=await fixture();try{
    const version=f.http.workspaces.getCullingVersion(f.owner,f.workspace.id,f.project.id);
    const args={workspaceId:f.workspace.id,projectId:f.project.id,expectedCullingVersion:version,
      orderedAssetIds:[f.images[0].id,f.images[1].id]};
    const stale=new WorkspaceCullingClient({baseURL:f.baseURL,tokenProvider:()=>f.token(),
      fetchImpl:async(url,init)=>{
        if(new URL(url).pathname.endsWith('/export-preflight'))
          f.http.workspaces.saveRecipe(f.owner,f.workspace.id,f.project.id,f.images[1].id,{baseVersion:1,body:recipe()});
        return fetch(url,init);
      }});
    await assert.rejects(()=>stale.preflightExportSelection(args),error=>error.status===409);
    const denied=new WorkspaceCullingClient({baseURL:f.baseURL,tokenProvider:()=>f.token('stranger')});
    await assert.rejects(()=>denied.preflightExportSelection(args),error=>error.status===403);
    const bad=new WorkspaceCullingClient({baseURL:f.baseURL,tokenProvider:()=>f.token(),
      fetchImpl:async(url,init)=>{
        const response=await fetch(url,init);
        if(!new URL(url).pathname.endsWith('/export-preflight'))return response;
        const data=await response.json();data.preflight.authoritativeForFinal=true;
        return {ok:true,status:200,json:async()=>data};
      }});
    await assert.rejects(()=>bad.preflightExportSelection({...args,orderedAssetIds:[f.images[0].id]}),/CULLING_RESPONSE_INVALID/);
    const wrongHead=new WorkspaceCullingClient({baseURL:f.baseURL,tokenProvider:()=>f.token(),
      fetchImpl:async(url,init)=>{
        const response=await fetch(url,init);
        if(!new URL(url).pathname.endsWith('/export-preflight'))return response;
        const data=await response.json();data.preflight.orderedAssets[0].recipeVersionId=f.images[1].id;
        return {ok:true,status:200,json:async()=>data};
      }});
    await assert.rejects(()=>wrongHead.preflightExportSelection({...args,orderedAssetIds:[f.images[0].id]}),
      /CULLING_RESPONSE_INVALID/);
    const ui=dom(),assetId=f.images[0].id;let selected=assetId;
    const panel=await mountVerifiedWorkspaceCulling({container:ui.container,baseURL:f.baseURL,
      tokenProvider:()=>f.token(),selectionProvider:()=>({workspaceId:f.workspace.id,projectId:f.project.id,assetId:selected}),
      workspaceId:f.workspace.id,projectId:f.project.id,assetId,expectedSubject:'owner',expectedTenantId:'personal',
      fetchImpl:async(url,init)=>{const response=await fetch(url,init);
        if(new URL(url).pathname.endsWith('/export-preflight'))selected=f.images[1].id;
        return response;}});
    await until(()=>panel.getState().phase==='ready');ui.button('Project全件を取得').dispatch('click');
    await until(()=>panel.getState().loadedMarkCount===2);select(ui,0);
    ui.button('出力前の参考照合（最大20枚）').dispatch('click');
    await until(()=>panel.getState().phase==='error');
    assert.equal(panel.getState().preflightStatus,'unchecked');
    assert.equal(panel.getState().selectedCount,0);
    assert.equal(panel.getState().loadedMarkCount,null);
    assert.doesNotMatch(ui.status().textContent,/参考照合しました/u);
    panel.dispose();
  }finally{await f.close();}
});

test('CULLING-WEB-PREFLIGHT04: revoked host identity and cancellation never retain a partial reference',async()=>{
  const f=await fixture();try{
    const assetId=f.images[0].id,ui=dom();let tenant='personal';
    const panel=await mountVerifiedWorkspaceCulling({container:ui.container,baseURL:f.baseURL,
      tokenProvider:()=>f.token('owner',tenant),
      selectionProvider:()=>({workspaceId:f.workspace.id,projectId:f.project.id,assetId}),
      workspaceId:f.workspace.id,projectId:f.project.id,assetId,expectedSubject:'owner',expectedTenantId:'personal'});
    await until(()=>panel.getState().phase==='ready');ui.button('Project全件を取得').dispatch('click');
    await until(()=>panel.getState().loadedMarkCount===2);select(ui,0);
    tenant='wrong-tenant';ui.button('出力前の参考照合（最大20枚）').dispatch('click');
    await until(()=>panel.getState().phase==='denied');
    assert.equal(panel.getState().preflightStatus,'unchecked');
    assert.equal(panel.getState().selectedCount,0);
    panel.dispose();

    const secondUI=dom();let postStarted=false;
    const second=await mountVerifiedWorkspaceCulling({container:secondUI.container,baseURL:f.baseURL,
      tokenProvider:()=>f.token(),
      selectionProvider:()=>({workspaceId:f.workspace.id,projectId:f.project.id,assetId}),
      workspaceId:f.workspace.id,projectId:f.project.id,assetId,expectedSubject:'owner',expectedTenantId:'personal',
      fetchImpl:async(url,init)=>{
        if(!new URL(url).pathname.endsWith('/export-preflight'))return fetch(url,init);
        postStarted=true;
        return new Promise((resolve,reject)=>init.signal.addEventListener('abort',
          ()=>reject(new DOMException('cancelled','AbortError')),{once:true}));
      }});
    await until(()=>second.getState().phase==='ready');secondUI.button('Project全件を取得').dispatch('click');
    await until(()=>second.getState().loadedMarkCount===2);select(secondUI,0);
    secondUI.button('出力前の参考照合（最大20枚）').dispatch('click');
    await until(()=>postStarted);
    secondUI.button('通信を取消').dispatch('click');
    await until(()=>second.getState().phase==='error');
    assert.equal(second.getState().preflightStatus,'unchecked');
    assert.equal(second.getState().selectedCount,0);
    assert.doesNotMatch(secondUI.status().textContent,/参考照合しました/u);
    second.dispose();
  }finally{await f.close();}
});
