import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceHTTP} from '../src/workspace-server.js';
import {WorkspaceRepository, type WorkspaceExportPresetSettings} from '../src/workspace.js';
import {suiteServer} from '../src/server.js';
import {jwtAuthenticator} from '../src/auth.js';

const settings = (): WorkspaceExportPresetSettings => ({format:'png',size:{kind:'dimensions',width:1920,height:1080},
  resolution:{unit:'ppi',value:300},outputSharpening:{kind:'none'}});
const manual = (): WorkspaceExportPresetSettings => ({format:'tiff',size:{kind:'long-edge',value:1200},
  resolution:{unit:'ppc',value:118},outputSharpening:{kind:'manual',gain:0.8,radiusPx:1.5,thresholdLuma:12}});
const recipe = () => ({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:0,
  extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});

async function httpFixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-export-preset-http-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const http=new WorkspaceHTTP(root,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='export-preset-test';
  const auth=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})});
  const server=suiteServer(assets,storage,auth,http);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}`;
  const token=(user:string,expiry='5m')=>new SignJWT({tenant_id:'personal',email:`${user}@example.test`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'export-preset-test'}).setIssuer('https://issuer.example')
    .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const request=async(path:string,user='owner',method='GET',data?:unknown,bearer?:string)=>{
    const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${bearer??await token(user)}`,
      ...(data===undefined?{}:{'content-type':'application/json'})},
    ...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:response.status,body:await response.json() as any};
  };
  const expect=async(path:string,user='owner',method='GET',data?:unknown,status=200,bearer?:string)=>{
    const result=await request(path,user,method,data,bearer);
    assert.equal(result.status,status,JSON.stringify(result.body));return result.body;
  };
  const workspace=(await expect('/v1/workspaces','owner','POST',{name:'Preset workspace'},201)).workspace;
  const path=`/v1/workspaces/${workspace.id}`;
  const member=async(user:string,role:'ADMIN'|'EDITOR'|'VIEWER')=>{
    const invitation=(await expect(`${path}/invitations`,'owner','POST',
      {email:`${user}@example.test`,role,expiresAt:new Date(Date.now()+600_000).toISOString()},201)).token;
    await expect(`${path}/invitations/accept`,user,'POST',{token:invitation});
  };
  return {root,http,assets,path,request,expect,member,token,close:async()=>{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    http.close();assets.close();await rm(root,{recursive:true,force:true});
  }};
}

test('Workspace Export Preset HTTP: saved versions, CAS, typed settings, and distinct photo presets',async()=>{
  const f=await httpFixture();try{
    await f.member('admin','ADMIN');await f.member('editor','EDITOR');
    const path=`${f.path}/export-presets`;
    const created=(await f.expect(path,'owner','POST',{scope:'WORKSPACE',name:'Web output',settings:settings()},201)).preset;
    assert.equal(created.version,1);assert.deepEqual(created.settings,settings());
    assert.equal((await f.expect(path,'editor')).presets.length,1);
    assert.deepEqual((await f.expect(`${path}/${created.id}`,'editor')).preset.settings,settings());
    await f.expect(`${path}/${created.id}`,'editor','PATCH',{baseVersion:1,name:'No',settings:manual()},403);
    const attempts=await Promise.all(['owner','admin'].map((user,index)=>f.request(`${path}/${created.id}`,user,'PATCH',
      {baseVersion:1,name:`Updated ${index}`,settings:manual()})));
    assert.deepEqual(attempts.map(result=>result.status).sort(),[200,409]);
    const current=(await f.expect(`${path}/${created.id}`)).preset;
    assert.equal(current.version,2);assert.deepEqual(current.settings,manual());
    assert.equal((await f.expect(`${f.path}/presets`)).presets.length,0);
    const personal=(await f.expect(path,'editor','POST',{scope:'PERSONAL',name:'Private',settings:settings()},201)).preset;
    assert.equal((await f.expect(path,'owner')).presets.length,1);
    await f.expect(`${path}/${personal.id}`,'owner','GET',undefined,404);
    await f.expect(`${path}/${personal.id}`,'admin','PATCH',{baseVersion:1,name:'Claimed',settings:manual()},404);
    assert.equal((await f.expect(path,'editor')).presets.length,2);
  }finally{await f.close();}
});

test('Workspace Export Preset HTTP: Viewer, revocation, foreign tenant, expired JWT, and invalid settings fail closed',async()=>{
  const f=await httpFixture();try{
    await f.member('editor','EDITOR');await f.member('viewer','VIEWER');
    const path=`${f.path}/export-presets`;
    const preset=(await f.expect(path,'owner','POST',{scope:'WORKSPACE',name:'Print output',settings:manual()},201)).preset;
    const otherWorkspace=(await f.expect('/v1/workspaces','owner','POST',{name:'Other tenant'},201)).workspace.id;
    await f.expect(`/v1/workspaces/${otherWorkspace}/export-presets/${preset.id}`,'owner','GET',undefined,404);
    await f.expect(path,'viewer','GET',undefined,403);
    await f.expect(`${path}/${preset.id}`,'viewer','GET',undefined,403);
    await f.expect(path,'viewer','POST',{scope:'PERSONAL',name:'Denied',settings:settings()},403);
    await f.expect(path,'stranger','GET',undefined,403);
    await f.expect(path,'owner','GET',undefined,401,await f.token('owner','0s'));
    await f.expect(`${f.path}/members/editor`,'owner','DELETE');
    await f.expect(path,'editor','GET',undefined,403);
    await f.expect(`${path}/${preset.id}`,'editor','PATCH',{baseVersion:1,name:'Denied',settings:settings()},403);
    const invalid=[
      {...settings(),format:'raw'},
      {...settings(),size:{kind:'percentage',value:101}},
      {...settings(),size:{kind:'dimensions',width:1,height:0}},
      {...settings(),resolution:{unit:'ppi',value:0}},
      {...settings(),outputSharpening:{kind:'manual',gain:3,radiusPx:1,thresholdLuma:0}},
      {...settings(),outputSharpening:{kind:'For Screen – High'}},
      {...settings(),presetName:'forged'},
    ];
    for(const bad of invalid)await f.expect(path,'owner','POST',{scope:'WORKSPACE',name:'Bad',settings:bad},400);
    await f.expect(path,'owner','POST',{scope:'WORKSPACE',name:'Unknown',settings:settings(),ownerUserId:'forged'},400);
    await f.expect(path,'owner','POST',{scope:'WORKSPACE',name:'../unsafe',settings:settings()},400);
    await f.expect(`${path}/${preset.id}`,'owner','PATCH',{baseVersion:1,name:'No',settings:manual(),version:99},400);
    assert.deepEqual((await f.expect(`${path}/${preset.id}`)).preset.settings,manual());
    assert.equal((await f.expect(path)).presets.length,1);
  }finally{await f.close();}
});

test('Workspace Export Preset SQLite: adding absent tables preserves old photo presets on restart and retains immutable versions',async()=>{
  const root=await mkdtemp(join(tmpdir(),'suite-export-preset-migration-'));
  const path=join(root,'workspace.sqlite');const assets=new AssetRepository(join(root,'assets.sqlite'));
  let repo:WorkspaceRepository|undefined;
  try{
    repo=new WorkspaceRepository(path,(wid,id,deleted)=>assets.get(wid,id,deleted));
    const owner={userId:'owner'},workspace=repo.createWorkspace(owner,'Old workspace');
    const photo=repo.createPreset(owner,workspace.id,{name:'Photo edit',scope:'WORKSPACE',body:recipe()});
    repo.close();repo=undefined;
    // An existing Workspace DB without the new tables is the additive-migration case.
    const old=new DatabaseSync(path);old.exec('DROP TABLE ws_export_preset_versions; DROP TABLE ws_export_presets;');old.close();
    repo=new WorkspaceRepository(path,(wid,id,deleted)=>assets.get(wid,id,deleted));
    assert.equal(repo.getPreset(owner,workspace.id,photo.id).name,'Photo edit');
    assert.deepEqual(repo.listExportPresets(owner,workspace.id),[]);
    const exported=repo.createExportPreset(owner,workspace.id,{scope:'WORKSPACE',name:'JPEG',settings:{...settings(),format:'jpeg'}});
    const revised=repo.updateExportPreset(owner,workspace.id,exported.id,{baseVersion:1,name:'JPEG revised',settings:manual()});
    assert.equal(revised.version,2);
    repo.close();repo=undefined;
    const db=new DatabaseSync(path,{readOnly:true});
    const versions=db.prepare('SELECT version,name FROM ws_export_preset_versions WHERE preset_id=? ORDER BY version').all(exported.id);
    assert.deepEqual(versions.map(row=>[row.version,row.name]),[[1,'JPEG'],[2,'JPEG revised']]);db.close();
    const immutable=new DatabaseSync(path);
    assert.throws(()=>immutable.prepare('UPDATE ws_export_preset_versions SET name=? WHERE preset_id=? AND version=1').run('tampered',exported.id),/IMMUTABLE_EXPORT_PRESET_VERSION/);
    immutable.close();
    repo=new WorkspaceRepository(path,(wid,id,deleted)=>assets.get(wid,id,deleted));
    assert.equal(repo.getPreset(owner,workspace.id,photo.id).version,1);
    assert.deepEqual(repo.getExportPreset(owner,workspace.id,exported.id).settings,manual());
    assert.throws(()=>repo!.updateExportPreset(owner,workspace.id,exported.id,{baseVersion:1,name:'Stale',settings:settings()}),/EXPORT_PRESET_VERSION_CONFLICT/);
  }finally{repo?.close();assets.close();await rm(root,{recursive:true,force:true});}
});
