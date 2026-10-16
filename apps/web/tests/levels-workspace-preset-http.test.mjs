import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {WorkspacePresetClient, WorkspacePresetHTTPError} from '../src/workspace-preset-client.mjs';

// All bytes are synthetic non-RAW; no real decoder, OIDC host or Cloud path is asserted.
const LEVELS = {
  master: {inputBlack: 11, inputWhite: 241, gamma: 1.4, outputBlack: 5, outputWhite: 249},
  red: {inputBlack: 8, inputWhite: 250, gamma: .8, outputBlack: 2, outputWhite: 254},
  green: {inputBlack: 16, inputWhite: 233, gamma: 1.2, outputBlack: 7, outputWhite: 246},
  blue: {inputBlack: 3, inputWhite: 239, gamma: .7, outputBlack: 9, outputWhite: 240},
};
const OLD_LEVELS = {
  master: {inputBlack: 1, inputWhite: 252, gamma: .9, outputBlack: 0, outputWhite: 255},
  red: {inputBlack: 2, inputWhite: 248, gamma: 1, outputBlack: 4, outputWhite: 250},
  green: {inputBlack: 3, inputWhite: 247, gamma: 1.1, outputBlack: 5, outputWhite: 251},
  blue: {inputBlack: 4, inputWhite: 246, gamma: 1.3, outputBlack: 6, outputWhite: 252},
};
const GLOW = {mode:'halation',intensity:71,radius:9,threshold:120,
  exposure:30,diffusion:55,tint:-18};
const GRAIN = {amount:47,seed:0x12345678,shadows:11,midtones:22,
  highlights:33,size:44,roughness:55,colorVariation:66};
const CALIBRATION = {red:{hue:24,saturation:-30},green:{hue:-15,saturation:45},
  blue:{hue:9,saturation:60}};
const VIGNETTE = {amount:-34,midpoint:37,roundness:-26,feather:72,highlights:18};
const STROKE = {operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.1,hardness:1};
const clone = value => structuredClone(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const levelsOf = body => body.parameters.extendedParameters.postDecodeAdjustments.color.levels;

function recipe({levels=undefined,exposure=0,rich=false,boundAsset,boundSHA}={}) {
  const extra = {};
  if (levels !== undefined || rich) {
    const color = {...(levels === undefined ? {} : {levels: clone(levels)}),
      ...(rich ? {glow: clone(GLOW), calibration: clone(CALIBRATION), temperature:27} : {})};
    extra.postDecodeAdjustments = {schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',
      ...(Object.keys(color).length ? {color} : {}),
      ...(rich ? {detail:{grain:clone(GRAIN),sharpness:31}} : {})};
  }
  if (rich) extra.postCropAdjustments = {schemaVersion:1,
    engineVersion:'suite-srgb8-manual-vignette-1',vignette:clone(VIGNETTE)};
  if (boundAsset) extra.bwEdgeManual = {schemaVersion:1,
    engineVersion:'suite-srgb8-explicit-mask-bw-edge-1',
    binding:{assetID:boundAsset,originalSHA256:boundSHA,sourceWidth:16,sourceHeight:16},
    subjectStrokes:[clone(STROKE)],correctionStrokes:[clone(STROKE)]};
  return {schemaVersion:1,parameters:{exposure,contrast:rich?1.2:1,
    saturation:rich?.8:1,rotationDegrees:0,extendedParameters:extra,
    processingOrder:extra.postDecodeAdjustments?
      ['exposure','contrast','saturation','postDecodeAdjustments','rotation']:
      ['exposure','contrast','saturation','rotation']}};
}
function withoutLevels(body) {
  const copy = clone(body);
  delete copy.parameters.extendedParameters.postDecodeAdjustments.color.levels;
  return copy;
}
async function fixture() {
  const dir=await mkdtemp(join(tmpdir(),'suite-levels-ws-preset-'));
  const assets=new AssetRepository(join(dir,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(dir,'objects'));
  const workspace=new WorkspaceHTTP(dir,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='levels-ws-test';
  const server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
    audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),workspace);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const baseURL=`http://127.0.0.1:${server.address().port}`;
  const tenants={'owner-a':'personal-a','owner-b':'personal-b'};
  const token=(user='owner-a',expiry='5m')=>new SignJWT({tenant_id:tenants[user],
    email:`${user}@example.test`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'levels-ws-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  async function request(path,{user='owner-a',method='GET',body}={}) {
    const response=await fetch(baseURL+path,{method,headers:{authorization:`Bearer ${await token(user)}`,
      ...(body===undefined?{}:{'content-type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  const wid=(await request('/v1/workspaces',{method:'POST',body:{name:'Levels Workspace'}})).body.workspace.id;
  const pid=(await request(`/v1/workspaces/${wid}/projects`,{method:'POST',
    body:{name:'Synthetic non-RAW'}})).body.project.id;
  const bytes=Buffer.from('SYNTHETIC_NON_RAW_RGB_LEVELS_WORKSPACE_PRESET');
  const sha256=hash(bytes);
  const assetId=(await request(`/v1/workspaces/${wid}/projects/${pid}/assets`,{method:'POST',
    body:{name:'synthetic.nonraw',size:bytes.length,sha256}})).body.asset.id;
  const assetPath=`/v1/workspaces/${wid}/projects/${pid}/assets/${assetId}`;
  const originalKey=workspace.workspaces.getAsset({userId:'owner-a'},wid,pid,assetId).originalKey;
  await storage.putImmutable(originalKey,Readable.from([bytes]),{sha256,size:bytes.length});
  const client=(user='owner-a',overrides={})=>new WorkspacePresetClient({baseURL,
    workspaceId:wid,expectedSubject:user,expectedTenantId:tenants[user],
    tokenProvider:()=>token(user),...overrides});
  return {wid,pid,assetId,assetPath,sha256,bytes,originalKey,storage,request,client,token,
    async close(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      workspace.close();assets.close();await rm(dir,{recursive:true,force:true});}};
}
const input=(f,preset,baseVersion)=>({presetId:preset.id,expectedPresetVersion:preset.version,
  projectId:f.pid,assetId:f.assetId,baseVersion,expectedOriginalSHA256:f.sha256});
const status=(code,http)=>error=>error instanceof WorkspacePresetHTTPError&&
  error.status===http&&error.code===code;

test('LEVELS-WS-01 / REAL_JWT_HTTP_SQLITE_NON_RAW: Personal and Workspace Full Save→Reload→Apply retain four channels × five controls',async()=>{
  const f=await fixture();
  try {const client=f.client();let revision=0;
    for (const scope of ['PERSONAL','WORKSPACE']) {
      const created=(await client.createPreset({scope,name:`${scope} RGB Levels`,
        body:recipe({levels:LEVELS})})).preset;
      assert.deepEqual(levelsOf(created.body),LEVELS);
      const reloaded=(await client.getPreset(created.id)).preset;
      assert.deepEqual(levelsOf(reloaded.body),LEVELS);
      const applied=await client.applyPresetVersioned(input(f,reloaded,revision));
      assert.deepEqual(levelsOf(applied.version.body),LEVELS);
      assert.deepEqual(levelsOf(applied.version.presetSnapshot.body),LEVELS);
      revision=applied.version.version;
      assert.deepEqual(levelsOf((await f.request(`${f.assetPath}/recipe`)).body.recipe.body),LEVELS);
    }
    assert.deepEqual(await f.storage.inspect(f.originalKey),
      {sha256:f.sha256,size:f.bytes.length,persisted:true});
  } finally {await f.close();}
});

test('LEVELS-WS-02 / REAL_JWT_HTTP_SQLITE_NON_RAW: atomic Levels-only retains target Glow/Grain/Calibration/Vignette, portrait-bound BW and other edits',async()=>{
  const f=await fixture();
  try {const client=f.client();const target=recipe({levels:OLD_LEVELS,exposure:.35,rich:true,
      boundAsset:f.assetId,boundSHA:f.sha256});
    const stored=await f.request(`${f.assetPath}/recipe`,{method:'PUT',
      body:{baseVersion:0,recipe:target}});
    assert.equal(stored.status,200);
    let revision=1;
    for (const scope of ['PERSONAL','WORKSPACE']) {
      const preset=(await client.createPreset({scope,name:`${scope} Levels only`,
        body:recipe({levels:LEVELS})})).preset;
      const fresh=(await client.getPreset(preset.id)).preset;
      const applied=await client.applyLevelsPresetVersioned(input(f,fresh,revision));
      assert.equal(applied.outcome,'saved');assert.equal(applied.version.branch,false);
      assert.deepEqual(levelsOf(applied.version.body),LEVELS);
      assert.deepEqual(levelsOf(applied.version.presetSnapshot.body),LEVELS);
      assert.deepEqual(withoutLevels(applied.version.body),withoutLevels(target));
      revision=applied.version.version;
    }
    const persisted=(await f.request(`${f.assetPath}/recipe`)).body.recipe;
    assert.equal(persisted.version,3);assert.deepEqual(levelsOf(persisted.body),LEVELS);
    assert.deepEqual(withoutLevels(persisted.body),withoutLevels(target));
    assert.deepEqual(levelsOf((await f.request(`${f.assetPath}/versions`)).body.versions[0].body),OLD_LEVELS);
    assert.deepEqual(await f.storage.inspect(f.originalKey),
      {sha256:f.sha256,size:f.bytes.length,persisted:true});
  } finally {await f.close();}
});

test('LEVELS-WS-03 / REAL_JWT_HTTP_SQLITE: stale Preset/Recipe/SHA and racing CAS reject without branch or partial version',async()=>{
  const f=await fixture();
  try {const client=f.client();
    const initial=(await client.createPreset({scope:'WORKSPACE',name:'Levels v1',
      body:recipe({levels:LEVELS})})).preset;
    assert.equal((await f.request(`${f.assetPath}/recipe`,{method:'PUT',
      body:{baseVersion:0,recipe:recipe({exposure:.6})}})).status,200);
    const updated=(await client.updatePreset(initial.id,{baseVersion:1,name:'Levels v2',
      body:recipe({levels:{...LEVELS,blue:{...LEVELS.blue,gamma:1.8}}})})).preset;
    const current=input(f,updated,1);
    await assert.rejects(client.applyLevelsPresetVersioned({...current,expectedPresetVersion:1}),
      status('PRESET_VERSION_CONFLICT',409));
    await assert.rejects(client.applyLevelsPresetVersioned({...current,expectedOriginalSHA256:'a'.repeat(64)}),
      status('ORIGINAL_IDENTITY_CONFLICT',409));
    await assert.rejects(client.applyLevelsPresetVersioned({...current,baseVersion:2}),
      status('RECIPE_VERSION_CONFLICT',409));
    await assert.rejects(client.applyLevelsPresetVersioned({...current,assetId:randomUUID()}),
      error=>error.status===404);
    const results=await Promise.allSettled([
      client.applyLevelsPresetVersioned(current),client.applyLevelsPresetVersioned(current)]);
    assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(results.filter(item=>item.status==='rejected').length,1);
    const history=(await f.request(`${f.assetPath}/versions`)).body.versions;
    assert.equal(history.length,2);assert.ok(history.every(row=>row.branch===false));
    assert.equal(levelsOf((await f.request(`${f.assetPath}/recipe`)).body.recipe.body).blue.gamma,1.8);
  } finally {await f.close();}
});

test('LEVELS-WS-04 / REAL_JWT_HTTP_SQLITE: Viewer, revocation, Personal isolation and impure/photo-bound Presets fail closed',async()=>{
  const f=await fixture();
  try {const owner=f.client();
    const shared=(await owner.createPreset({scope:'WORKSPACE',name:'Levels',
      body:recipe({levels:LEVELS})})).preset;
    const personal=(await owner.createPreset({scope:'PERSONAL',name:'Private Levels',
      body:recipe({levels:LEVELS})})).preset;
    const impure=(await owner.createPreset({scope:'WORKSPACE',name:'Exposure plus Levels',
      body:recipe({levels:LEVELS,exposure:.2})})).preset;
    const mixed=(await owner.createPreset({scope:'WORKSPACE',name:'Levels plus other effects',
      body:recipe({levels:LEVELS,rich:true})})).preset;
    const partial=(await owner.createPreset({scope:'PERSONAL',name:'Legacy sparse Levels',
      body:recipe({levels:{red:{gamma:1.3}}})})).preset;
    await assert.rejects(owner.createPreset({scope:'WORKSPACE',name:'Bound mask',
      body:recipe({levels:LEVELS,boundAsset:f.assetId,boundSHA:f.sha256})}),
      status('PHOTO_BOUND_BW_EDGE_PRESET_FORBIDDEN',403));
    assert.equal((await f.request(`${f.assetPath}/recipe`,{method:'PUT',
      body:{baseVersion:0,recipe:recipe()}})).status,200);
    for (const preset of [impure,mixed,partial])
      await assert.rejects(owner.applyLevelsPresetVersioned(input(f,preset,1)),
        status('INVALID_LEVELS_ONLY_PRESET',400));
    await assert.rejects(f.client('owner-a',{expectedSubject:'owner-b'})
      .applyLevelsPresetVersioned(input(f,shared,1)),/WORKSPACE_SESSION_IDENTITY_CHANGED/);
    await assert.rejects(f.client('owner-a',{expectedTenantId:'personal-b'})
      .applyLevelsPresetVersioned(input(f,shared,1)),/WORKSPACE_SESSION_IDENTITY_CHANGED/);
    assert.equal((await f.request(`${f.assetPath}/versions`)).body.versions.length,1);
    const invite=await f.request(`/v1/workspaces/${f.wid}/invitations`,{method:'POST',
      body:{email:'owner-b@example.test',role:'VIEWER',expiresAt:'2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status,201);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/invitations/accept`,{user:'owner-b',
      method:'POST',body:{token:invite.body.token}})).status,200);
    const viewer=f.client('owner-b');
    await assert.rejects(viewer.getPreset(personal.id),status('PRESET_NOT_FOUND',404));
    await assert.rejects(viewer.applyLevelsPresetVersioned(input(f,shared,1)),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/members/owner-b`,
      {method:'DELETE'})).status,200);
    await assert.rejects(viewer.listPresets(),error=>error.status===403);
    const expired=f.client('owner-a',{tokenProvider:()=>f.token('owner-a','-1s')});
    await assert.rejects(expired.applyLevelsPresetVersioned(input(f,shared,1)),
      error=>error.status===401);
    assert.equal((await f.request(`${f.assetPath}/recipe`)).body.recipe.version,1);
    assert.deepEqual(await f.storage.inspect(f.originalKey),
      {sha256:f.sha256,size:f.bytes.length,persisted:true});
  } finally {await f.close();}
});

test('LEVELS-WS-05 / REAL_JWT_HTTP_SQLITE_NON_RAW: legacy sparse Levels remains Full-compatible, never mistaken for 20-control only Apply',async()=>{
  const f=await fixture();
  try {const client=f.client();const sparse={red:{gamma:1.3}};
    const preset=(await client.createPreset({scope:'PERSONAL',name:'Legacy sparse Levels',
      body:recipe({levels:sparse})})).preset;
    assert.deepEqual(levelsOf((await client.getPreset(preset.id)).preset.body),sparse);
    assert.equal((await f.request(`${f.assetPath}/recipe`,{method:'PUT',
      body:{baseVersion:0,recipe:recipe({exposure:.4})}})).status,200);
    await assert.rejects(client.applyLevelsPresetVersioned(input(f,preset,1)),
      status('INVALID_LEVELS_ONLY_PRESET',400));
    assert.equal((await f.request(`${f.assetPath}/versions`)).body.versions.length,1);
    const full=await client.applyPresetVersioned(input(f,preset,1));
    assert.deepEqual(levelsOf(full.version.body),sparse);
    assert.equal(full.version.branch,false);
    assert.deepEqual(await f.storage.inspect(f.originalKey),
      {sha256:f.sha256,size:f.bytes.length,persisted:true});
  } finally {await f.close();}
});
