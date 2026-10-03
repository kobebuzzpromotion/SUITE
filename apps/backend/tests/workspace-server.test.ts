import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceHTTP} from '../src/workspace-server.js';
import {suiteServer} from '../src/server.js';
import {jwtAuthenticator} from '../src/auth.js';
import type {RemoteStorageConfiguration} from '../src/workspace-storage.js';

// Arbitrary immutable boundary bytes, deliberately NOT RAW, Proxy, or image processing QA.
const bytes=Buffer.from('SUITE HTTP immutable storage boundary fixture, not a RAW image');
const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const recipe=(exposure=0.2)=>({schemaVersion:1,parameters:{exposure,contrast:1,saturation:1,rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
const configuration:RemoteStorageConfiguration={revision:'http-local-test-not-commercial',storagePlans:[{id:'large',quotaBytes:10000,monthlyPriceMinor:null,currency:null},{id:'tiny',quotaBytes:1,monthlyPriceMinor:null,currency:null}],studio:null,tariffs:{currency:null,storageGBMonthMinor:null,uploadGBMinor:null,downloadGBMinor:null,put1000Minor:null,get1000Minor:null,list1000Minor:null,other1000Minor:null}};
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-workspace-http-'));
  let repo=new AssetRepository(join(root,'assets.sqlite'));const storage=new LocalObjectStorage(join(root,'objects'));
  let now=Date.now(),http=new WorkspaceHTTP(root,repo,storage,()=>configuration,()=>now);
  const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='http-test';
  const authenticate=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})});
  const token=(user:string,emailVerified=true,tenant='personal',email=`${user}@example.com`,expiry='5m')=>new SignJWT({tenant_id:tenant,email,email_verified:emailVerified}).setProtectedHeader({alg:'RS256',kid:'http-test'}).setIssuer('https://issuer.example').setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  let server=suiteServer(repo,storage,authenticate,http);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');let base=`http://127.0.0.1:${address.port}`;
  const request=async(path:string,user='owner',method='GET',data?:unknown,bearer?:string)=>{
    const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${bearer??await token(user)}`,...(data===undefined?{}:{'content-type':Buffer.isBuffer(data)?'application/octet-stream':'application/json'})},...(data===undefined?{}:{body:Buffer.isBuffer(data)?new Uint8Array(data):JSON.stringify(data)})});
    return response;
  };
  const json=async(path:string,user='owner',method='GET',data?:unknown,status=200,bearer?:string)=>{
    const response=await request(path,user,method,data,bearer);const result=await response.json() as any;assert.equal(response.status,status,JSON.stringify(result));return result;
  };
  const wid=(await json('/v1/workspaces','owner','POST',{name:'Studio A'},201)).workspace.id as string;
  const pid=(await json(`/v1/workspaces/${wid}/projects`,'owner','POST',{name:'Shared Project'},201)).project.id as string;
  const path=`/v1/workspaces/${wid}`,project=`${path}/projects/${pid}`;
  const asset=(await json(`${project}/assets`,'owner','POST',{name:'fixture.bin',sha256:hash(bytes),size:bytes.length},201)).asset;
  const assetPath=`${project}/assets/${asset.id}`;
  const member=async(user:string,role='EDITOR')=>{
    const invite=await json(`${path}/invitations`,'owner','POST',{email:`${user}@example.com`,role,expiresAt:new Date(Date.now()+600000).toISOString()},201);
    await json(`${path}/invitations/accept`,user,'POST',{token:invite.token});return invite;
  };
  const configure=()=>{const actor={userId:'owner',workspaceId:wid};http.ledger.changePlan(actor,'large');http.ledger.setEntitlement(actor,'CLOUD_STORAGE',true);};
  const upload=()=>json(`${assetPath}/original`,'owner','PUT',bytes);
  const stop=()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return {root,get repo(){return repo;},storage,get http(){return http;},token,request,json,wid,pid,path,project,asset,assetPath,member,configure,upload,setNow:(value:number)=>{now=value;},reopen:async()=>{
    await stop();http.close();repo.close();repo=new AssetRepository(join(root,'assets.sqlite'));http=new WorkspaceHTTP(root,repo,storage,()=>configuration,()=>now);
    server=suiteServer(repo,storage,authenticate,http);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
  },close:async()=>{await stop();http.close();repo.close();await rm(root,{recursive:true,force:true});}};
}

test('WH01 signed JWT identity enforces workspace/project/asset isolation and blocks every legacy managed route',async()=>{
  const f=await fixture();try{
    const other=(await f.json('/v1/workspaces','stranger','POST',{name:'Studio B'},201)).workspace.id;
    await f.json(f.path,'stranger','GET',undefined,403);
    await f.json(`/v1/workspaces/${other}/projects/${f.pid}/assets/${f.asset.id}/recipe`,'stranger','GET',undefined,404);
    await f.json(`${f.assetPath}/recipe`,'stranger','PUT',{baseVersion:0,recipe:recipe(),userId:'owner',role:'OWNER',workspaceId:f.wid},403);
    const managed=await f.token('stranger',true,f.wid);
    for(const suffix of ['',`/${f.asset.id}/recipe`,`/${f.asset.id}/original`,`/${f.asset.id}/trash`,`/${f.asset.id}/restore`])await f.json('/v1/assets'+suffix,'stranger',suffix.endsWith('trash')||suffix.endsWith('restore')?'POST':'GET',undefined,403,managed);
    await f.json('/v1/assets','stranger','POST',{name:'bypass',sha256:hash(bytes),size:bytes.length},403,managed);
    await f.json(`${f.path}/members/stranger`,'stranger','PATCH',{role:'OWNER'},403);
    await f.json(f.path,'owner','GET',undefined,401,await f.token('owner',true,'personal','owner@example.com','0s'));
  }finally{await f.close();}
});
test('WH02 invitation accepts only signed verified matching email; viewer may select but cannot edit/export/manage',async()=>{
  const f=await fixture();try{
    const invite=await f.json(`${f.path}/invitations`,'owner','POST',{email:'viewer@example.com',role:'VIEWER',expiresAt:new Date(Date.now()+600000).toISOString()},201);
    assert.equal(invite.delivery,'NOT_CONFIGURED');
    await f.json(`${f.path}/invitations/accept`,'viewer','POST',{token:invite.token,verifiedEmail:'viewer@example.com',email_verified:true},403,await f.token('viewer',false));
    await f.json(`${f.path}/invitations/accept`,'stranger','POST',{token:invite.token,email:'viewer@example.com'},400);
    await f.json(`${f.path}/invitations/accept`,'viewer','POST',{token:invite.token});
    await f.json(`${f.assetPath}/recipe`,'viewer','PUT',{baseVersion:0,recipe:recipe()},403);
    await f.json(`${f.assetPath}/original?purpose=final-jpeg`,'viewer','GET',undefined,403);
    await f.json(`${f.assetPath}/access`,'viewer','POST',{purpose:'final-jpeg',lifetimeSeconds:10},403);
    await f.json(`${f.assetPath}/original`,'viewer','PUT',bytes,403);
    await f.json(`${f.assetPath}/selection`,'viewer','PUT',{baseVersion:0,selected:true});
    await f.json(`${f.project}/assets`,'viewer','GET');
    await f.json(`${f.path}/presets`,'viewer','POST',{name:'Denied',body:recipe()},403);
    await f.json(`${f.path}/audit`,'viewer','GET',undefined,403);
    await f.json(`${f.path}/members/owner`,'viewer','PATCH',{role:'VIEWER'},403);
  }finally{await f.close();}
});
test('WH03 two and three editors preserve stale branches, head, editor identity, field diff and history',async()=>{
  const f=await fixture();try{
    await f.member('editor-a');await f.member('editor-b');await f.member('editor-c');
    const results=await Promise.all(['editor-a','editor-b','editor-c'].map(async(user,index)=>{const response=await f.request(`${f.assetPath}/recipe`,user,'PUT',{baseVersion:0,recipe:recipe(index+0.1),editor_user_id:'forged'});return {status:response.status,value:await response.json() as any};}));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409,409]);
    const head=(await f.json(`${f.assetPath}/recipe`)).recipe;const versions=(await f.json(`${f.assetPath}/versions`)).versions;
    assert.equal(versions.length,3);assert.equal(versions.filter((v:any)=>v.branch).length,2);
    assert.deepEqual(new Set(versions.map((v:any)=>v.editorUserId)),new Set(['editor-a','editor-b','editor-c']));
    for(const result of results.filter(r=>r.status===409)){assert.equal(result.value.currentVersion,head.version);assert.ok(result.value.diff.some((d:any)=>d.path==='/parameters/exposure'));}
    const next=await f.json(`${f.assetPath}/recipe`,'editor-b','PUT',{baseVersion:head.version,recipe:recipe(0.7)});
    await f.json(`${f.assetPath}/recipe`,'editor-c','PUT',{baseVersion:head.version,recipe:recipe(0.8)},409);
    assert.equal((await f.json(`${f.assetPath}/recipe`)).recipe.version,next.version.version);
    assert.equal((await f.json(`${f.assetPath}/versions`)).versions.length,5);
    const events=(await f.json(`${f.path}/audit`)).events;assert.equal(events.filter((e:any)=>e.action==='recipe-conflict-preserved').length,3);
  }finally{await f.close();}
});
test('WH04 shared preset CAS, apply snapshot, delete retention and selection concurrency cross HTTP',async()=>{
  const f=await fixture();try{
    await f.member('admin','ADMIN');await f.member('editor');await f.member('viewer','VIEWER');
    const preset=(await f.json(`${f.path}/presets`,'owner','POST',{name:'Standard',body:recipe(0.4)},201)).preset;
    assert.equal((await f.json(`${f.path}/presets`,'viewer')).presets.length,1);
    await f.json(`${f.path}/presets/${preset.id}`,'editor','PATCH',{baseVersion:1,name:'Denied',body:recipe()},403);
    const updates=await Promise.all(['owner','admin'].map((user,index)=>f.request(`${f.path}/presets/${preset.id}`,user,'PATCH',{baseVersion:1,name:`Update ${index}`,body:recipe(index+0.5)})));
    assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);for(const response of updates)await response.json();
    const applied=await f.json(`${f.assetPath}/preset`,'editor','POST',{baseVersion:0,presetId:preset.id});
    await f.json(`${f.assetPath}/preset`,'viewer','POST',{baseVersion:1,presetId:preset.id},403);
    await f.json(`${f.path}/presets/${preset.id}`,'admin','DELETE');
    await f.json(`${f.path}/presets/${preset.id}`,'editor','GET',undefined,404);
    assert.deepEqual((await f.json(`${f.assetPath}/recipe`,'editor')).recipe,applied.version);
    assert.equal(applied.version.presetSnapshot.id,preset.id);assert.equal(applied.version.presetSnapshot.version,2);
    const selections=await Promise.all(['owner','editor','viewer'].map(user=>f.request(`${f.assetPath}/selection`,user,'PUT',{baseVersion:0,selected:true})));
    assert.deepEqual(selections.map(r=>r.status).sort(),[200,409,409]);for(const response of selections)await response.json();
    assert.equal((await f.json(`${f.assetPath}/selection`,'viewer')).selection.version,1);
  }finally{await f.close();}
});
test('WH05 server config gates upload; quota/downgrade never erase immutable bytes or self-grant billing',async()=>{
  const f=await fixture();try{
    await f.json(`${f.assetPath}/original`,'owner','PUT',bytes,409);
    assert.equal(f.repo.get(f.wid,f.asset.id).cloudSafe,false);
    for(const action of ['plan','entitlements','seats'])await f.json(`${f.path}/storage/${action}`,'owner','POST',{planId:'large',CLOUD_STORAGE:true,seats:500},501);
    assert.equal(f.http.ledger.entitlements({userId:'owner',workspaceId:f.wid}).CLOUD_STORAGE,false);
    f.configure();await f.upload();
    const stored=await readFile(join(f.root,'objects',f.asset.originalKey));assert.deepEqual(stored,bytes);
    f.http.ledger.changePlan({userId:'owner',workspaceId:f.wid},'tiny');
    const usage=(await f.json(`${f.path}/storage`)).usage;assert.equal(usage.overQuota,true);assert.equal(usage.usedBytes,bytes.length);
    const next=(await f.json(`${f.project}/assets`,'owner','POST',{name:'second.bin',sha256:hash(Buffer.from('new')),size:3},201)).asset;
    await f.json(`${f.project}/assets/${next.id}/original`,'owner','PUT',Buffer.from('new'),409);
    assert.deepEqual(await readFile(join(f.root,'objects',f.asset.originalKey)),bytes);
    assert.equal((await readdir(join(f.root,'objects'))).includes(next.originalKey),false);
    const downloaded=await f.request(`${f.assetPath}/original?purpose=final-jpeg`);assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
    await f.upload();assert.deepEqual(await readFile(join(f.root,'objects',f.asset.originalKey)),bytes);
    const events=(await f.json(`${f.path}/storage/audit`)).events;assert.ok(events.some((e:any)=>e.action==='storage-plan-change'));
  }finally{await f.close();}
});
test('WH06 metadata browsing performs no Original read; requested download records measured usage and audit',async()=>{
  const f=await fixture();try{
    f.configure();await f.upload();
    const browsing=await f.json(`${f.project}/assets`);assert.equal(browsing.representation,'PROXY_METADATA_ONLY');assert.equal(browsing.proxyTransport,'NOT_CONNECTED');
    const period=new Date().toISOString().slice(0,7);
    const before=(await f.json(`${f.path}/storage/cost?period=${period}`)).report.traffic;assert.equal(before.downloadBytes,0);
    await f.json(`${f.assetPath}/original?purpose=library`,'owner','GET',undefined,409);
    const response=await f.request(`${f.assetPath}/original?purpose=final-tiff`);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    const after=(await f.json(`${f.path}/storage/cost?period=${period}`)).report.traffic;assert.equal(after.downloadBytes,bytes.length);assert.equal(after.exportBytes,bytes.length);assert.equal(after.get,1);
    await f.json(`${f.path}/session`,'owner','POST');const events=(await f.json(`${f.path}/audit`)).events;
    assert.ok(events.some((e:any)=>e.action==='login'&&e.actorUserId==='owner'));assert.ok(events.some((e:any)=>e.action==='export'&&e.details.stage==='original-download-completed'));
  }finally{await f.close();}
});
test('WH07 deduplicated Original and asset/project trash recovery retain bytes and accurate usage buckets',async()=>{
  const f=await fixture();try{
    await f.member('editor');f.configure();await f.upload();
    const duplicate=(await f.json(`${f.project}/assets`,'editor','POST',{name:'peer.bin',sha256:hash(bytes),size:bytes.length},201)).asset;
    assert.equal(duplicate.id,f.asset.id);assert.equal(duplicate.originalKey,f.asset.originalKey);
    await f.json(`${f.assetPath}/trash`,'editor','POST',undefined,403);
    await f.json(`${f.assetPath}/trash`,'owner','POST');await f.json(`${f.assetPath}/recipe`,'owner','GET',undefined,404);
    let usage=(await f.json(`${f.path}/storage`)).usage;assert.equal(usage.usedBytes,bytes.length);assert.equal(usage.categories.Trash,bytes.length);assert.equal(usage.categories.Original,0);
    await f.json(`${f.assetPath}/restore`,'owner','POST');usage=(await f.json(`${f.path}/storage`)).usage;assert.equal(usage.categories.Original,bytes.length);assert.equal(usage.categories.Trash,0);
    await f.json(`${f.project}/trash`,'owner','POST');await f.json(`${f.project}/assets`,'editor','GET',undefined,404);
    assert.equal((await f.json(`${f.path}/storage`)).usage.categories.Trash,bytes.length);
    await f.json(`${f.project}/restore`,'owner','POST');assert.equal((await f.json(`${f.project}/assets`,'editor')).assets.length,1);
    usage=(await f.json(`${f.path}/storage`)).usage;assert.equal(usage.physicalAccountingObjectCount,1);assert.equal(usage.categories.Original,bytes.length);
    assert.deepEqual(await readFile(join(f.root,'objects',f.asset.originalKey)),bytes);
  }finally{await f.close();}
});
test('WH08 authenticated gateway grant binds subject/object/purpose/workspace/expiry and live member revocation',async()=>{
  const f=await fixture();try{
    await f.member('editor');await f.member('peer');f.configure();await f.upload();
    const grant=await f.json(`${f.assetPath}/access`,'editor','POST',{purpose:'final-jpeg',lifetimeSeconds:2},201);assert.equal(grant.scope,'AUTHENTICATED_GATEWAY_ONLY');
    const valid=await f.request(grant.path,'editor');assert.equal(valid.status,200);await valid.arrayBuffer();
    await f.json(grant.path,'peer','GET',undefined,403);
    await f.json(grant.path.replace('final-jpeg','final-tiff'),'editor','GET',undefined,403);
    const next=(await f.json(`${f.project}/assets`,'owner','POST',{name:'other.bin',sha256:hash(Buffer.from('different')),size:9},201)).asset;
    await f.json(grant.path.replace(f.asset.id,next.id),'editor','GET',undefined,403);
    const other=(await f.json('/v1/workspaces','editor','POST',{name:'Owned B'},201)).workspace.id;
    await f.json(grant.path.replace(f.wid,other),'editor','GET',undefined,404);
    f.setNow(grant.expiresAt);await f.json(grant.path,'editor','GET',undefined,403);
    const live=await f.json(`${f.assetPath}/access`,'peer','POST',{purpose:'high-precision',lifetimeSeconds:60},201);
    await f.json(`${f.path}/members/peer`,'owner','DELETE');
    await f.json(live.path,'peer','GET',undefined,403);await f.json(`${f.assetPath}/recipe`,'peer','GET',undefined,403);
    await f.json(`${f.path}/members/editor`,'owner','PATCH',{role:'VIEWER'});await f.json(`${f.assetPath}/original?purpose=high-precision`,'editor','GET',undefined,403);
  }finally{await f.close();}
});
test('WH09 corrupt persisted object invalidates Cloud Safe and refuses Original download',async()=>{
  const f=await fixture();try{
    f.configure();await f.upload();assert.equal(f.repo.get(f.wid,f.asset.id).cloudSafe,true);
    // Explicit corruption injection of arbitrary test bytes; production object API remains immutable.
    await writeFile(join(f.root,'objects',f.asset.originalKey),Buffer.alloc(bytes.length));
    await f.json(`${f.assetPath}/original?purpose=high-precision`,'owner','GET',undefined,503);
    assert.equal(f.repo.get(f.wid,f.asset.id).cloudSafe,false);
    await f.json(`${f.assetPath}/original?purpose=high-precision`,'owner','GET',undefined,409);
  }finally{await f.close();}
});
test('WH10 membership revoke during a slow download stops remaining bytes and retains partial user traffic',async()=>{
  const f=await fixture();try{
    await f.member('editor');f.configure();await f.upload();
    let resume!:()=>void;const blocked=new Promise<void>(resolve=>{resume=resolve;});
    f.storage.read=async function*(){yield bytes.subarray(0,8);await blocked;yield bytes.subarray(8);};
    const response=await f.request(`${f.assetPath}/original?purpose=final-jpeg`,'editor');assert.equal(response.status,200);
    const reader=response.body!.getReader();assert.deepEqual(Buffer.from((await reader.read()).value!),bytes.subarray(0,8));
    await f.json(`${f.path}/members/editor`,'owner','DELETE');resume();await assert.rejects(reader.read());
    const report=(await f.json(`${f.path}/storage/cost`)).report;
    assert.equal(report.traffic.byUser.editor.downloadBytes,8);assert.equal(report.traffic.byUser.editor.get,1);
    assert.throws(()=>f.http.ledger.recordUsage({userId:'editor',workspaceId:f.wid},{eventId:'forged-after-revoke',period:new Date().toISOString().slice(0,7),origin:'adapter-measured',uploadBytes:0,downloadBytes:999,exportBytes:0,put:0,get:0,list:0,other:0}),/FORBIDDEN/);
    const events=(await f.json(`${f.path}/audit`)).events;
    assert.ok(events.some((e:any)=>e.actorUserId==='editor'&&e.details.stage==='original-download-started'));
    assert.equal(events.some((e:any)=>e.actorUserId==='editor'&&e.details.stage==='original-download-completed'),false);
  }finally{await f.close();}
});
test('WH11 grant expiration during provider inspect refuses streaming and expiration during read stops remaining bytes',async()=>{
  const f=await fixture();try{
    f.configure();await f.upload();const inspect=f.storage.inspect.bind(f.storage);
    const expired=await f.json(`${f.assetPath}/access`,'owner','POST',{purpose:'final-jpeg',lifetimeSeconds:2},201);
    f.storage.inspect=async key=>{const evidence=await inspect(key);f.setNow(expired.expiresAt);return evidence;};
    await f.json(expired.path,'owner','GET',undefined,403);
    f.storage.inspect=inspect;const streaming=await f.json(`${f.assetPath}/access`,'owner','POST',{purpose:'final-jpeg',lifetimeSeconds:2},201);
    let resume!:()=>void;const blocked=new Promise<void>(resolve=>{resume=resolve;});
    f.storage.read=async function*(){yield bytes.subarray(0,7);await blocked;yield bytes.subarray(7);};
    const response=await f.request(streaming.path);const reader=response.body!.getReader();assert.equal((await reader.read()).value!.length,7);
    f.setNow(streaming.expiresAt);resume();await assert.rejects(reader.read());
    const traffic=(await f.json(`${f.path}/storage/cost`)).report.traffic;assert.equal(traffic.downloadBytes,7);assert.equal(traffic.exportBytes,7);
  }finally{await f.close();}
});
test('WH12 checksum failed upload and interrupted provider read record actual attempt bytes without successful export',async()=>{
  const f=await fixture();try{
    f.configure();await f.json(`${f.assetPath}/original`,'owner','PUT',Buffer.alloc(bytes.length),400);
    assert.equal(f.repo.get(f.wid,f.asset.id).cloudSafe,false);
    let traffic=(await f.json(`${f.path}/storage/cost`)).report.traffic;assert.equal(traffic.uploadBytes,bytes.length);assert.equal(traffic.put,1);
    await f.upload();f.storage.read=async function*(){yield bytes.subarray(0,6);throw new Error('TEST_READ_INTERRUPTED');};
    // Network failure may be observed while obtaining headers or consuming the stream.
    await assert.rejects(async()=>{const response=await f.request(`${f.assetPath}/original?purpose=final-tiff`);await response.arrayBuffer();});
    traffic=(await f.json(`${f.path}/storage/cost`)).report.traffic;assert.equal(traffic.downloadBytes,6);assert.equal(traffic.uploadBytes,bytes.length*2);assert.equal(traffic.put,2);
    const events=(await f.json(`${f.path}/audit`)).events;assert.equal(events.some((e:any)=>e.details.stage==='original-download-completed'),false);
    assert.deepEqual(await readFile(join(f.root,'objects',f.asset.originalKey)),bytes);
  }finally{await f.close();}
});
test('WH13 asset/project trash and restore retry reconciles ledger failure after tombstone commit across database reopen',async()=>{
  const f=await fixture();try{
    f.configure();await f.upload();
    for(const target of [f.assetPath,f.project]){
      for(const operation of ['trash','restore']){
        f.http.ledger.setTrash=()=>{throw new Error('TEST_LEDGER_COMMIT_INTERRUPTED');};
        await f.json(`${target}/${operation}`,'owner','POST',undefined,503);
        assert.equal((await f.json(`${f.path}/storage`)).usage.usedBytes,bytes.length);
        // New metadata/ledger/grant connections plus a new listening server; no in-memory mapping survives.
        await f.reopen();await f.json(`${target}/${operation}`,'owner','POST');
        const usage=(await f.json(`${f.path}/storage`)).usage;
        assert.equal(usage.categories.Trash,operation==='trash'?bytes.length:0);
        assert.equal(usage.categories.Original,operation==='restore'?bytes.length:0);assert.equal(usage.usedBytes,bytes.length);
        assert.deepEqual(await readFile(join(f.root,'objects',f.asset.originalKey)),bytes);
      }
    }
  }finally{await f.close();}
});
test('WH14 restoring a project retains individually deleted assets in Trash and restores only live references',async()=>{
  const f=await fixture();try{
    f.configure();await f.upload();await f.json(`${f.assetPath}/trash`,'owner','POST');
    await f.json(`${f.project}/trash`,'owner','POST');await f.json(`${f.project}/restore`,'owner','POST');
    assert.equal((await f.json(`${f.project}/assets`)).assets.length,0);
    assert.equal((await f.json(`${f.path}/storage`)).usage.categories.Trash,bytes.length);
    await f.json(`${f.assetPath}/restore`,'owner','POST');assert.equal((await f.json(`${f.path}/storage`)).usage.categories.Original,bytes.length);
  }finally{await f.close();}
});
test('WH15 oversized read chunks count only accepted prefix bytes and invalidate verification',async()=>{
  const f=await fixture();try{
    f.configure();await f.upload();
    f.storage.read=async function*(){yield Buffer.alloc(bytes.length+1);};
    await assert.rejects(async()=>{const response=await f.request(`${f.assetPath}/original?purpose=final-jpeg`);await response.arrayBuffer();});
    let traffic=(await f.json(`${f.path}/storage/cost`)).report.traffic;assert.equal(traffic.downloadBytes,0);assert.equal(traffic.exportBytes,0);
    assert.equal(f.repo.get(f.wid,f.asset.id).cloudSafe,false);
    await f.upload();f.storage.read=async function*(){yield bytes.subarray(0,8);yield Buffer.alloc(bytes.length);};
    await assert.rejects(async()=>{const response=await f.request(`${f.assetPath}/original?purpose=final-jpeg`);await response.arrayBuffer();});
    traffic=(await f.json(`${f.path}/storage/cost`)).report.traffic;assert.equal(traffic.downloadBytes,8);assert.equal(traffic.exportBytes,8);assert.equal(traffic.get,2);
    assert.equal(f.repo.get(f.wid,f.asset.id).cloudSafe,false);
    assert.deepEqual(await readFile(join(f.root,'objects',f.asset.originalKey)),bytes);
  }finally{await f.close();}
});
