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
import {WorkspaceExportPresetClient,WorkspaceExportPresetHTTPError,
  validateWorkspaceExportPresetSettings} from '../src/workspace-export-preset-client.mjs';

const baseSettings=()=>({format:'png',size:{kind:'dimensions',width:1200,height:800},
  resolution:{unit:'ppi',value:300},outputSharpening:{kind:'none'}});
const manualSettings=()=>({format:'tiff',size:{kind:'long-edge',value:1000},
  resolution:{unit:'ppc',value:118},outputSharpening:{kind:'manual',gain:0.6,radiusPx:1.5,thresholdLuma:8}});

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-web-export-preset-client-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const workspaceHTTP=new WorkspaceHTTP(root,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='web-export-test';
  const authenticator=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',
    jwks:createLocalJWKSet({keys:[jwk]})});
  const server=suiteServer(assets,storage,authenticator,workspaceHTTP);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const baseURL=`http://127.0.0.1:${address.port}`;
  const token=(user,expiry='5m')=>new SignJWT({tenant_id:'personal',email:`${user}@example.test`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'web-export-test'}).setIssuer('https://issuer.example')
    .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const request=async(path,user='owner',method='GET',body)=>{
    const response=await fetch(baseURL+path,{method,headers:{authorization:`Bearer ${await token(user)}`,
      ...(body===undefined?{}:{'content-type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  };
  const create=await request('/v1/workspaces','owner','POST',{name:'Export workspace'});
  assert.equal(create.status,201);const workspaceId=create.body.workspace.id;
  const member=async(user,role)=>{
    const path=`/v1/workspaces/${workspaceId}/invitations`;
    const invited=await request(path,'owner','POST',{email:`${user}@example.test`,role,
      expiresAt:new Date(Date.now()+600000).toISOString()});assert.equal(invited.status,201);
    const accepted=await request(`${path}/accept`,user,'POST',{token:invited.body.token});assert.equal(accepted.status,200);
  };
  const client=(user='owner',provider=()=>token(user),fetchImpl=fetch)=>new WorkspaceExportPresetClient({baseURL,
    workspaceId,expectedSubject:user,expectedTenantId:'personal',tokenProvider:provider,fetchImpl});
  return {root,baseURL,workspaceId,workspaceHTTP,client,member,request,token,close:async()=>{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    workspaceHTTP.close();assets.close();await rm(root,{recursive:true,force:true});
  }};
}

test('EXP-CLIENT01: real JWT/SQLite list-get-create-update uses fresh bearer and CAS',async()=>{
  const f=await fixture();try{
    await f.member('admin','ADMIN');await f.member('editor','EDITOR');
    let issued=0;const owner=f.client('owner',async()=>{issued++;return f.token('owner');});
    assert.deepEqual(await owner.listExportPresets(),{presets:[]});
    const created=(await owner.createExportPreset({scope:'WORKSPACE',name:'Web output',settings:baseSettings()})).preset;
    assert.equal(created.version,1);assert.deepEqual(created.settings,baseSettings());
    assert.equal((await f.client('editor').listExportPresets()).presets.length,1);
    assert.deepEqual((await owner.getExportPreset(created.id)).preset,created);
    const updated=(await owner.updateExportPreset(created.id,{baseVersion:1,name:'Print output',settings:manualSettings()})).preset;
    assert.equal(updated.version,2);assert.deepEqual(updated.settings,manualSettings());
    await assert.rejects(owner.updateExportPreset(created.id,{baseVersion:1,name:'Stale',settings:baseSettings()}),
      error=>error instanceof WorkspaceExportPresetHTTPError&&error.status===409&&error.code==='EXPORT_PRESET_VERSION_CONFLICT');
    const personal=(await f.client('editor').createExportPreset({scope:'PERSONAL',name:'My settings',settings:baseSettings()})).preset;
    assert.equal((await owner.listExportPresets()).presets.length,1);
    await assert.rejects(owner.getExportPreset(personal.id),error=>error.status===404);
    assert.equal(issued,7);
  }finally{await f.close();}
});

test('EXP-CLIENT02: current identity/tenant/role gate and HTTP revocation never produce success',async()=>{
  const f=await fixture();try{
    await f.member('editor','EDITOR');await f.member('viewer','VIEWER');
    await assert.rejects(f.client('viewer').listExportPresets(),/WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    await assert.rejects(f.client('owner',()=>f.token('editor')).listExportPresets(),/WORKSPACE_SESSION_IDENTITY_CHANGED/);
    await assert.rejects(f.client('owner',()=>f.token('owner','0s')).listExportPresets(),error=>error.status===401);
    const editor=f.client('editor');
    await f.request(`/v1/workspaces/${f.workspaceId}/members/editor`,'owner','DELETE');
    await assert.rejects(editor.listExportPresets(),error=>error.status===403);
  }finally{await f.close();}
});

test('EXP-CLIENT03: settings, response, origin and redirect are fail-closed',async()=>{
  for(const bad of [
    {...baseSettings(),format:'raw'},
    {...baseSettings(),size:{kind:'percentage',value:101}},
    {...baseSettings(),resolution:{unit:'ppi',value:0}},
    {...baseSettings(),outputSharpening:{kind:'For Screen – High'}},
    {...baseSettings(),extra:'forged'},
  ])assert.throws(()=>validateWorkspaceExportPresetSettings(bad),/WORKSPACE_EXPORT_PRESET_SETTINGS_INVALID/);
  const f=await fixture();try{
    assert.throws(()=>new WorkspaceExportPresetClient({baseURL:'http://example.com',workspaceId:f.workspaceId,
      expectedSubject:'owner',expectedTenantId:'personal',tokenProvider:()=>f.token('owner')}),/WORKSPACE_SESSION_CONFIG_INVALID/);
    const options=[];
    const guarded=f.client('owner',()=>f.token('owner'),async(url,init)=>{
      options.push({url,init});return fetch(url,init);
    });
    const cancelled=new AbortController();cancelled.abort();
    await assert.rejects(guarded.listExportPresets({signal:cancelled.signal}),{name:'AbortError'});
    assert.equal(options.length,0);
    await guarded.listExportPresets();assert.equal(options.length,2);
    for(const {url,init} of options){
      assert.equal(new URL(url).origin,f.baseURL);
      assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
      assert.equal(init.referrerPolicy,'no-referrer');assert.equal(init.credentials,'omit');
      assert.match(init.headers.Authorization,/^Bearer /);
    }
    const redirected=f.client('owner',()=>f.token('owner'),async(url,init)=>{
      const response=await fetch(url,init);
      if(url.endsWith('/export-presets'))Object.defineProperty(response,'redirected',{value:true});
      return response;
    });
    await assert.rejects(redirected.listExportPresets(),/WORKSPACE_EXPORT_PRESET_REQUEST_FAILED/);
    const foreignResponse=f.client('owner',()=>f.token('owner'),async(url,init)=>{
      const response=await fetch(url,init);
      if(url.endsWith('/export-presets'))Object.defineProperty(response,'url',{value:'https://other.example/presets'});
      return response;
    });
    await assert.rejects(foreignResponse.listExportPresets(),/WORKSPACE_EXPORT_PRESET_REQUEST_FAILED/);
    const forged=f.client('owner',()=>f.token('owner'),async(url,init)=>{
      const response=await fetch(url,init);
      if(url.endsWith('/export-presets'))return new Response(JSON.stringify({presets:[{id:f.workspaceId}]}),
        {status:200,headers:{'content-type':'application/json'}});
      return response;
    });
    await assert.rejects(forged.listExportPresets(),/WORKSPACE_EXPORT_PRESET_RESPONSE_INVALID/);
  }finally{await f.close();}
});
