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
import {WorkspacePresetClient,WorkspacePresetHTTPError} from '../src/workspace-preset-client.mjs';

const calibration={red:{hue:24,saturation:-30},green:{hue:-15,saturation:45},
  blue:{hue:9,saturation:60}};
const oldCalibration={red:{hue:-8,saturation:3},green:{hue:4,saturation:-5},
  blue:{hue:7,saturation:-2}};
function recipe({exposure=0,contrast=1,saturation=1,calibrationValue=null,
  temperature,sharpness,boundAsset,boundSHA}={}){
  const extendedParameters={};
  if(calibrationValue!==null||temperature!==undefined||sharpness!==undefined){
    const postDecodeAdjustments={schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1'};
    if(calibrationValue!==null||temperature!==undefined)
      postDecodeAdjustments.color={...(temperature===undefined?{}:{temperature}),
        ...(calibrationValue===null?{}:{calibration:structuredClone(calibrationValue)})};
    if(sharpness!==undefined)postDecodeAdjustments.detail={sharpness};
    extendedParameters.postDecodeAdjustments=postDecodeAdjustments;
  }
  if(boundAsset){const stroke={operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.1,hardness:1};
    extendedParameters.bwEdgeManual={schemaVersion:1,
      engineVersion:'suite-srgb8-explicit-mask-bw-edge-1',
      binding:{assetID:boundAsset,originalSHA256:boundSHA,sourceWidth:16,sourceHeight:16},
      subjectStrokes:[structuredClone(stroke)],correctionStrokes:[structuredClone(stroke)]};}
  return {schemaVersion:1,parameters:{exposure,contrast,saturation,rotationDegrees:0,
    extendedParameters,processingOrder:extendedParameters.postDecodeAdjustments?
      ['exposure','contrast','saturation','postDecodeAdjustments','rotation']:
      ['exposure','contrast','saturation','rotation']}};
}
const calibrationOf=body=>body.parameters.extendedParameters.postDecodeAdjustments.color.calibration;

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-calibration-ws-preset-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const workspace=new WorkspaceHTTP(root,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='calibration-ws-test';
  const authenticate=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',
    jwks:createLocalJWKSet({keys:[jwk]})});
  const server=suiteServer(assets,storage,authenticate,workspace);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const baseURL=`http://127.0.0.1:${server.address().port}`;
  const tenants={'owner-a':'personal-a','owner-b':'personal-b'};
  const token=(user,expiry='5m')=>new SignJWT({tenant_id:tenants[user],
    email:`${user}@example.test`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'calibration-ws-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  async function request(path,{user='owner-a',method='GET',body}={}){
    const response=await fetch(baseURL+path,{method,headers:{authorization:`Bearer ${await token(user)}`,
      ...(body===undefined?{}:{'content-type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  const wid=(await request('/v1/workspaces',{method:'POST',body:{name:'Calibration Workspace'}})).body.workspace.id;
  const projectId=(await request(`/v1/workspaces/${wid}/projects`,{method:'POST',
    body:{name:'Synthetic'}})).body.project.id;
  const bytes=Buffer.from('SYNTHETIC_NON_RAW_CALIBRATION_WORKSPACE_PRESET');
  const originalSHA256=createHash('sha256').update(bytes).digest('hex');
  const assetId=(await request(`/v1/workspaces/${wid}/projects/${projectId}/assets`,{method:'POST',
    body:{name:'synthetic.nonraw',size:bytes.length,sha256:originalSHA256}})).body.asset.id;
  const assetPath=`/v1/workspaces/${wid}/projects/${projectId}/assets/${assetId}`;
  const client=(user='owner-a',overrides={})=>new WorkspacePresetClient({baseURL,
    workspaceId:wid,expectedSubject:user,expectedTenantId:tenants[user],
    tokenProvider:()=>token(user),...overrides});
  return {wid,projectId,assetId,assetPath,originalSHA256,request,client,
    async close(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      workspace.close();assets.close();await rm(root,{recursive:true,force:true});}};
}
const applyInput=(f,preset,baseVersion)=>({presetId:preset.id,
  expectedPresetVersion:preset.version,projectId:f.projectId,assetId:f.assetId,
  baseVersion,expectedOriginalSHA256:f.originalSHA256});
const status=(code,http)=>error=>error instanceof WorkspacePresetHTTPError&&
  error.status===http&&error.code===code;

test('CALIBRATION-WS-01 / REAL_JWT_HTTP_SQLITE_NON_RAW: Personal and Workspace full Save, Reload, Apply retain all six values',async()=>{
  const f=await fixture();
  try{const client=f.client();let revision=0;
    for(const scope of ['PERSONAL','WORKSPACE']){
      const created=(await client.createPreset({scope,name:`${scope} Calibration`,
        body:recipe({calibrationValue:calibration})})).preset;
      assert.deepEqual(calibrationOf(created.body),calibration);
      const reloaded=(await client.getPreset(created.id)).preset;
      assert.deepEqual(calibrationOf(reloaded.body),calibration);
      const applied=await client.applyPresetVersioned({...applyInput(f,reloaded,revision)});
      assert.deepEqual(calibrationOf(applied.version.body),calibration);
      assert.deepEqual(calibrationOf(applied.version.presetSnapshot.body),calibration);
      revision=applied.version.version;
      assert.deepEqual(calibrationOf((await f.request(`${f.assetPath}/recipe`)).body.recipe.body),calibration);
    }
  }finally{await f.close();}
});

test('CALIBRATION-WS-02 / REAL_JWT_HTTP_SQLITE_NON_RAW: six-value only Apply retains other color, Detail, global and bound photo settings',async()=>{
  const f=await fixture();
  try{const client=f.client();
    const target=recipe({exposure:.35,contrast:1.2,saturation:.8,
      calibrationValue:oldCalibration,temperature:27,sharpness:31,
      boundAsset:f.assetId,boundSHA:f.originalSHA256});
    const saved=await f.request(`${f.assetPath}/recipe`,{method:'PUT',body:{baseVersion:0,recipe:target}});
    assert.equal(saved.status,200);let revision=saved.body.version.version;
    for(const scope of ['PERSONAL','WORKSPACE']){
      const preset=(await client.createPreset({scope,name:`${scope} Only Calibration`,
        body:recipe({calibrationValue:calibration})})).preset;
      const reloaded=(await client.getPreset(preset.id)).preset;
      assert.deepEqual(calibrationOf(reloaded.body),calibration);
      const result=await client.applyCalibrationPresetVersioned(applyInput(f,reloaded,revision));
      assert.equal(result.outcome,'saved');assert.equal(result.version.branch,false);
      assert.deepEqual(calibrationOf(result.version.body),calibration);
      assert.deepEqual(calibrationOf(result.version.presetSnapshot.body),calibration);
      assert.equal(result.version.body.parameters.exposure,.35);
      assert.equal(result.version.body.parameters.contrast,1.2);
      assert.equal(result.version.body.parameters.saturation,.8);
      const effects=result.version.body.parameters.extendedParameters;
      assert.equal(effects.postDecodeAdjustments.color.temperature,27);
      assert.equal(effects.postDecodeAdjustments.detail.sharpness,31);
      assert.deepEqual(effects.bwEdgeManual,target.parameters.extendedParameters.bwEdgeManual);
      revision=result.version.version;
    }
    const loaded=(await f.request(`${f.assetPath}/recipe`)).body.recipe;
    assert.equal(loaded.version,3);assert.deepEqual(calibrationOf(loaded.body),calibration);
    const history=(await f.request(`${f.assetPath}/versions`)).body.versions;
    assert.deepEqual(calibrationOf(history[0].body),oldCalibration);
    assert.ok(history.every(row=>row.branch===false));
  }finally{await f.close();}
});

test('CALIBRATION-WS-03 / REAL_JWT_HTTP_SQLITE: stale Preset, Recipe, SHA and concurrent CAS reject without branch',async()=>{
  const f=await fixture();
  try{const client=f.client();
    const preset=(await client.createPreset({scope:'WORKSPACE',name:'Calibration v1',
      body:recipe({calibrationValue:calibration})})).preset;
    assert.equal((await f.request(`${f.assetPath}/recipe`,{method:'PUT',body:{baseVersion:0,
      recipe:recipe({exposure:.6})}})).status,200);
    const updated=(await client.updatePreset(preset.id,{baseVersion:1,name:'Calibration v2',
      body:recipe({calibrationValue:{...calibration,blue:{...calibration.blue,hue:77}}})})).preset;
    const current=applyInput(f,updated,1);
    await assert.rejects(client.applyCalibrationPresetVersioned({...current,expectedPresetVersion:1}),
      status('PRESET_VERSION_CONFLICT',409));
    await assert.rejects(client.applyCalibrationPresetVersioned({...current,
      expectedOriginalSHA256:'a'.repeat(64)}),status('ORIGINAL_IDENTITY_CONFLICT',409));
    await assert.rejects(client.applyCalibrationPresetVersioned({...current,baseVersion:2}),
      status('RECIPE_VERSION_CONFLICT',409));
    const results=await Promise.allSettled([
      client.applyCalibrationPresetVersioned(current),client.applyCalibrationPresetVersioned(current)]);
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
    assert.equal(results.filter(row=>row.status==='rejected').length,1);
    const history=(await f.request(`${f.assetPath}/versions`)).body.versions;
    assert.equal(history.length,2);assert.ok(history.every(row=>row.branch===false));
    assert.equal(calibrationOf((await f.request(`${f.assetPath}/recipe`)).body.recipe.body).blue.hue,77);
  }finally{await f.close();}
});

test('CALIBRATION-WS-04 / REAL_JWT_HTTP_SQLITE: Viewer, revocation, Personal isolation and impure Preset reject',async()=>{
  const f=await fixture();
  try{const owner=f.client();
    const preset=(await owner.createPreset({scope:'WORKSPACE',name:'Calibration',
      body:recipe({calibrationValue:calibration})})).preset;
    const personal=(await owner.createPreset({scope:'PERSONAL',name:'Private',
      body:recipe({calibrationValue:calibration})})).preset;
    const impure=(await owner.createPreset({scope:'WORKSPACE',name:'Impure',
      body:recipe({calibrationValue:calibration,exposure:.2})})).preset;
    await f.request(`${f.assetPath}/recipe`,{method:'PUT',body:{baseVersion:0,recipe:recipe()}});
    await assert.rejects(owner.applyCalibrationPresetVersioned(applyInput(f,impure,1)),
      status('INVALID_CALIBRATION_ONLY_PRESET',400));
    const invite=await f.request(`/v1/workspaces/${f.wid}/invitations`,{method:'POST',
      body:{email:'owner-b@example.test',role:'VIEWER',expiresAt:'2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status,201);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/invitations/accept`,{user:'owner-b',
      method:'POST',body:{token:invite.body.token}})).status,200);
    const viewer=f.client('owner-b');
    await assert.rejects(viewer.getPreset(personal.id),status('PRESET_NOT_FOUND',404));
    await assert.rejects(viewer.applyCalibrationPresetVersioned(applyInput(f,preset,1)),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/members/owner-b`,{method:'DELETE'})).status,200);
    await assert.rejects(viewer.listPresets(),error=>error.status===403);
    assert.equal((await f.request(`${f.assetPath}/recipe`)).body.recipe.version,1);
  }finally{await f.close();}
});

test('CALIBRATION-WS-05 / partial primary Preset remains valid for legacy full Apply but cannot masquerade as six-value only',async()=>{
  const f=await fixture();
  try{const client=f.client();
    const partial={red:{hue:23}};
    const preset=(await client.createPreset({scope:'PERSONAL',name:'Partial legacy',
      body:recipe({calibrationValue:partial})})).preset;
    assert.deepEqual(calibrationOf((await client.getPreset(preset.id)).preset.body),partial);
    assert.equal((await f.request(`${f.assetPath}/recipe`,{method:'PUT',
      body:{baseVersion:0,recipe:recipe({exposure:.4})}})).status,200);
    await assert.rejects(client.applyCalibrationPresetVersioned(applyInput(f,preset,1)),
      status('INVALID_CALIBRATION_ONLY_PRESET',400));
    assert.equal((await f.request(`${f.assetPath}/versions`)).body.versions.length,1);
    const full=await client.applyPresetVersioned({...applyInput(f,preset,1)});
    assert.deepEqual(calibrationOf(full.version.body),partial);
  }finally{await f.close();}
});
