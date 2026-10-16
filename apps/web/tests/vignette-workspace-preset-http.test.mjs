import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {WorkspacePresetClient,WorkspacePresetHTTPError} from
  '../src/workspace-preset-client.mjs';

const VIGNETTE={amount:-34,midpoint:37,roundness:-26,feather:72,highlights:18};
const OLD_VIGNETTE={amount:21,midpoint:58,roundness:11,feather:44,highlights:7};
const PERSON='33333333-3333-4333-8333-333333333333';
const STROKE={operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.1,hardness:1};
function recipe({exposure=0,contrast=1,saturation=1,vignette=null,
  temperature,sharpness,boundAsset,boundSHA}={}){
  const extendedParameters={};
  if(vignette!==null)extendedParameters.postCropAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-manual-vignette-1',vignette:structuredClone(vignette)};
  if(temperature!==undefined||sharpness!==undefined){
    const postDecodeAdjustments={schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1'};
    if(temperature!==undefined)postDecodeAdjustments.color={temperature};
    if(sharpness!==undefined)postDecodeAdjustments.detail={sharpness};
    extendedParameters.postDecodeAdjustments=postDecodeAdjustments;
  }
  if(boundAsset)extendedParameters.bwEdgeManual={schemaVersion:1,
    engineVersion:'suite-srgb8-explicit-mask-bw-edge-1',
    binding:{assetID:boundAsset,originalSHA256:boundSHA,sourceWidth:16,sourceHeight:16},
    subjectStrokes:[structuredClone(STROKE)],correctionStrokes:[structuredClone(STROKE)]};
  return {schemaVersion:1,parameters:{exposure,contrast,saturation,rotationDegrees:0,
    extendedParameters,processingOrder:extendedParameters.postDecodeAdjustments?
      ['exposure','contrast','saturation','postDecodeAdjustments','rotation']:
      ['exposure','contrast','saturation','rotation']}};
}
const vignetteOf=body=>body.parameters.extendedParameters.postCropAdjustments.vignette;
function boundDocument(kind,assetId,sha256){
  const binding={assetID:assetId,originalSHA256:sha256,
    sourceWidth:16,sourceHeight:16,personID:PERSON};
  return kind==='teethManual'?{schemaVersion:1,
    engineVersion:'suite-srgb8-owner-manual-teeth-whitening-1',
    binding,teethStrokes:[structuredClone(STROKE)],
    settings:{brightness:10,desaturation:20}}:
    {schemaVersion:1,engineVersion:'suite-srgb8-owner-manual-makeup-highlight-1',
      binding,highlightStrokes:[structuredClone(STROKE)],settings:{intensity:30}};
}

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-vignette-ws-preset-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const workspace=new WorkspaceHTTP(root,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='vignette-ws-test';
  const authenticate=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',
    jwks:createLocalJWKSet({keys:[jwk]})});
  const server=suiteServer(assets,storage,authenticate,workspace);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
  });
  const baseURL=`http://127.0.0.1:${server.address().port}`;
  const tenants={'owner-a':'personal-a','owner-b':'personal-b'};
  const token=(user,expiry='5m')=>new SignJWT({tenant_id:tenants[user],
    email:`${user}@example.test`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'vignette-ws-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  async function request(path,{user='owner-a',method='GET',body}={}){
    const response=await fetch(baseURL+path,{method,headers:{
      authorization:`Bearer ${await token(user)}`,
      ...(body===undefined?{}:{'content-type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  const wid=(await request('/v1/workspaces',{method:'POST',
    body:{name:'Vignette Workspace'}})).body.workspace.id;
  const projectId=(await request(`/v1/workspaces/${wid}/projects`,
    {method:'POST',body:{name:'Synthetic'}})).body.project.id;
  const bytes=Buffer.from('SYNTHETIC_NON_RAW_VIGNETTE_WORKSPACE_PRESET');
  const originalSHA256=createHash('sha256').update(bytes).digest('hex');
  const assetId=(await request(`/v1/workspaces/${wid}/projects/${projectId}/assets`,
    {method:'POST',body:{name:'synthetic.nonraw',size:bytes.length,
      sha256:originalSHA256}})).body.asset.id;
  const assetPath=`/v1/workspaces/${wid}/projects/${projectId}/assets/${assetId}`;
  const client=(user='owner-a',overrides={})=>new WorkspacePresetClient({baseURL,
    workspaceId:wid,expectedSubject:user,expectedTenantId:tenants[user],
    tokenProvider:()=>token(user),...overrides});
  return {root,wid,projectId,assetId,assetPath,originalSHA256,request,client,
    async close(){
      await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      workspace.close();assets.close();
      const target=resolve(root),base=resolve(tmpdir())+sep;
      if(!target.startsWith(base)||
          !target.split(sep).at(-1).startsWith('suite-vignette-ws-preset-'))
        throw Error('VIGNETTE_TEST_CLEANUP_TARGET_INVALID');
      await rm(target,{recursive:true,force:true});
    }};
}
const applyInput=(f,preset,baseVersion)=>({presetId:preset.id,
  expectedPresetVersion:preset.version,projectId:f.projectId,assetId:f.assetId,
  baseVersion,expectedOriginalSHA256:f.originalSHA256});
const status=(code,http)=>error=>error instanceof WorkspacePresetHTTPError&&
  error.status===http&&error.code===code;

test('VIGNETTE-WS-01 / REAL_JWT_HTTP_SQLITE_NON_RAW: Personal and Workspace full Save/Reload/Apply retain five values',async()=>{
  const f=await fixture();
  try{const client=f.client();let revision=0;
    for(const scope of ['PERSONAL','WORKSPACE']){
      const created=(await client.createPreset({scope,name:`${scope} Vignette`,
        body:recipe({vignette:VIGNETTE})})).preset;
      assert.deepEqual(vignetteOf(created.body),VIGNETTE);
      const reloaded=(await client.getPreset(created.id)).preset;
      assert.deepEqual(vignetteOf(reloaded.body),VIGNETTE);
      const applied=await client.applyPresetVersioned(applyInput(f,reloaded,revision));
      assert.deepEqual(vignetteOf(applied.version.body),VIGNETTE);
      assert.deepEqual(vignetteOf(applied.version.presetSnapshot.body),VIGNETTE);
      revision=applied.version.version;
      assert.deepEqual(vignetteOf((await f.request(`${f.assetPath}/recipe`)).body.recipe.body),
        VIGNETTE);
    }
  }finally{await f.close();}
});

test('VIGNETTE-WS-02 / REAL_JWT_HTTP_SQLITE_NON_RAW: only-apply preserves global, color, detail and target photo-bound settings',async()=>{
  const f=await fixture();
  try{const client=f.client();
    const target=recipe({exposure:.35,contrast:1.2,saturation:.8,
      vignette:OLD_VIGNETTE,temperature:27,sharpness:31,
      boundAsset:f.assetId,boundSHA:f.originalSHA256});
    const saved=await f.request(`${f.assetPath}/recipe`,
      {method:'PUT',body:{baseVersion:0,recipe:target}});
    assert.equal(saved.status,200);let revision=saved.body.version.version;
    for(const scope of ['PERSONAL','WORKSPACE']){
      const preset=(await client.createPreset({scope,name:`${scope} Only Vignette`,
        body:recipe({vignette:VIGNETTE})})).preset;
      const reloaded=(await client.getPreset(preset.id)).preset;
      const result=await client.applyVignettePresetVersioned(applyInput(f,reloaded,revision));
      assert.equal(result.outcome,'saved');assert.equal(result.version.branch,false);
      assert.deepEqual(vignetteOf(result.version.body),VIGNETTE);
      assert.deepEqual(vignetteOf(result.version.presetSnapshot.body),VIGNETTE);
      assert.equal(result.version.body.parameters.exposure,.35);
      assert.equal(result.version.body.parameters.contrast,1.2);
      assert.equal(result.version.body.parameters.saturation,.8);
      const extra=result.version.body.parameters.extendedParameters;
      assert.equal(extra.postDecodeAdjustments.color.temperature,27);
      assert.equal(extra.postDecodeAdjustments.detail.sharpness,31);
      assert.deepEqual(extra.bwEdgeManual,target.parameters.extendedParameters.bwEdgeManual);
      assert.deepEqual(result.version.body.parameters.processingOrder,
        target.parameters.processingOrder);
      revision=result.version.version;
    }
    const latest=(await f.request(`${f.assetPath}/recipe`)).body.recipe;
    assert.equal(latest.version,3);assert.deepEqual(vignetteOf(latest.body),VIGNETTE);
    const history=(await f.request(`${f.assetPath}/versions`)).body.versions;
    assert.deepEqual(vignetteOf(history[0].body),OLD_VIGNETTE);
    assert.ok(history.every(row=>row.branch===false));
  }finally{await f.close();}
});

test('VIGNETTE-WS-03 / REAL_JWT_HTTP_SQLITE: stale Preset, Recipe, SHA and simultaneous CAS reject without branch',async()=>{
  const f=await fixture();
  try{const client=f.client();
    const preset=(await client.createPreset({scope:'WORKSPACE',name:'Vignette v1',
      body:recipe({vignette:VIGNETTE})})).preset;
    assert.equal((await f.request(`${f.assetPath}/recipe`,{method:'PUT',
      body:{baseVersion:0,recipe:recipe({exposure:.6})}})).status,200);
    const updated=(await client.updatePreset(preset.id,{baseVersion:1,name:'Vignette v2',
      body:recipe({vignette:{...VIGNETTE,amount:-77}})})).preset;
    const current=applyInput(f,updated,1);
    await assert.rejects(client.applyVignettePresetVersioned({...current,
      expectedPresetVersion:1}),status('PRESET_VERSION_CONFLICT',409));
    await assert.rejects(client.applyVignettePresetVersioned({...current,
      expectedOriginalSHA256:'a'.repeat(64)}),status('ORIGINAL_IDENTITY_CONFLICT',409));
    await assert.rejects(client.applyVignettePresetVersioned({...current,baseVersion:2}),
      status('RECIPE_VERSION_CONFLICT',409));
    const results=await Promise.allSettled([
      client.applyVignettePresetVersioned(current),
      client.applyVignettePresetVersioned(current)]);
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
    assert.equal(results.filter(row=>row.status==='rejected').length,1);
    const history=(await f.request(`${f.assetPath}/versions`)).body.versions;
    assert.equal(history.length,2);assert.ok(history.every(row=>row.branch===false));
    assert.equal(vignetteOf((await f.request(`${f.assetPath}/recipe`)).body.recipe.body).amount,-77);
  }finally{await f.close();}
});

test('VIGNETTE-WS-04 / REAL_JWT_HTTP_SQLITE: Viewer, revocation, Personal isolation and impure Preset reject',async()=>{
  const f=await fixture();
  try{const owner=f.client();
    const preset=(await owner.createPreset({scope:'WORKSPACE',name:'Vignette',
      body:recipe({vignette:VIGNETTE})})).preset;
    const personal=(await owner.createPreset({scope:'PERSONAL',name:'Private',
      body:recipe({vignette:VIGNETTE})})).preset;
    const impure=(await owner.createPreset({scope:'WORKSPACE',name:'Impure',
      body:recipe({vignette:VIGNETTE,exposure:.2})})).preset;
    await f.request(`${f.assetPath}/recipe`,{method:'PUT',
      body:{baseVersion:0,recipe:recipe()}});
    await assert.rejects(owner.applyVignettePresetVersioned(applyInput(f,impure,1)),
      status('INVALID_VIGNETTE_ONLY_PRESET',400));
    const invite=await f.request(`/v1/workspaces/${f.wid}/invitations`,{method:'POST',
      body:{email:'owner-b@example.test',role:'VIEWER',
        expiresAt:'2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status,201);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/invitations/accept`,
      {user:'owner-b',method:'POST',body:{token:invite.body.token}})).status,200);
    const viewer=f.client('owner-b');
    await assert.rejects(viewer.getPreset(personal.id),status('PRESET_NOT_FOUND',404));
    await assert.rejects(viewer.applyVignettePresetVersioned(applyInput(f,preset,1)),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/members/owner-b`,
      {method:'DELETE'})).status,200);
    await assert.rejects(viewer.listPresets(),error=>error.status===403);
    assert.equal((await f.request(`${f.assetPath}/recipe`)).body.recipe.version,1);
  }finally{await f.close();}
});

test('VIGNETTE-WS-05: legacy Amount-only remains full/only compatible, but partial five-value snapshots reject only-apply',async()=>{
  const f=await fixture();
  try{const client=f.client();
    const legacy=(await client.createPreset({scope:'PERSONAL',name:'Legacy Amount',
      body:recipe({vignette:{amount:-18}})})).preset;
    assert.deepEqual(vignetteOf((await client.getPreset(legacy.id)).preset.body),
      {amount:-18});
    assert.equal((await f.request(`${f.assetPath}/recipe`,{method:'PUT',
      body:{baseVersion:0,recipe:recipe({vignette:OLD_VIGNETTE,exposure:.4})}})).status,200);
    const applied=await client.applyVignettePresetVersioned(applyInput(f,legacy,1));
    assert.deepEqual(vignetteOf(applied.version.body),{amount:-18});
    assert.equal(applied.version.body.parameters.exposure,.4);
    const partial=(await client.createPreset({scope:'PERSONAL',name:'Partial',
      body:recipe({vignette:{amount:4,midpoint:50}})})).preset;
    await assert.rejects(client.applyVignettePresetVersioned(applyInput(f,partial,2)),
      status('INVALID_VIGNETTE_ONLY_PRESET',400));
    const full=await client.applyPresetVersioned(applyInput(f,partial,2));
    assert.deepEqual(vignetteOf(full.version.body),{amount:4,midpoint:50});
  }finally{await f.close();}
});

test('VIGNETTE-WS-06 / REAL_JWT_HTTP_SQLITE: new and legacy photo-bound Teeth/Makeup presets cannot cross Assets',async()=>{
  const f=await fixture();
  try{const client=f.client();
    const clean=(await client.createPreset({scope:'WORKSPACE',name:'Clean',
      body:recipe({vignette:VIGNETTE})})).preset;
    const originalRecipe=recipe({vignette:{amount:-9}});
    assert.equal((await f.request(`${f.assetPath}/recipe`,{method:'PUT',
      body:{baseVersion:0,recipe:originalRecipe}})).status,200);
    for(const [index,kind] of ['teethManual','makeupHighlightManual'].entries()){
      const body=recipe({vignette:VIGNETTE});
      body.parameters.extendedParameters[kind]=
        boundDocument(kind,f.assetId,f.originalSHA256);
      await assert.rejects(client.createPreset({scope:'PERSONAL',name:`${kind} bad`,body}),
        status(kind==='teethManual'?'PHOTO_BOUND_TEETH_PRESET_FORBIDDEN':
          'PHOTO_BOUND_MAKEUP_HIGHLIGHT_PRESET_FORBIDDEN',403));
      await assert.rejects(client.updatePreset(clean.id,{baseVersion:index+1,
        name:'Bad Update',body}),status(kind==='teethManual'?
        'PHOTO_BOUND_TEETH_PRESET_FORBIDDEN':
        'PHOTO_BOUND_MAKEUP_HIGHLIGHT_PRESET_FORBIDDEN',403));
      const db=new DatabaseSync(join(f.root,'workspace.sqlite'));
      const legacyVersion=index+2;
      try{
        // Simulate an older accepted version without mutating immutable history.
        db.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,?,?,?,?,?)')
          .run(clean.id,legacyVersion,'Legacy unsafe',JSON.stringify(body),'owner-a',new Date().toISOString());
        db.prepare('UPDATE ws_presets SET current_version=? WHERE id=?')
          .run(legacyVersion,clean.id);
      }finally{db.close();}
      const unsafe={...clean,version:legacyVersion};
      await assert.rejects(client.applyPresetVersioned(applyInput(f,unsafe,1)),
        status(kind==='teethManual'?'PHOTO_BOUND_TEETH_PRESET_FORBIDDEN':
          'PHOTO_BOUND_MAKEUP_HIGHLIGHT_PRESET_FORBIDDEN',403));
      await assert.rejects(client.applyVignettePresetVersioned(applyInput(f,unsafe,1)),
        status(kind==='teethManual'?'PHOTO_BOUND_TEETH_PRESET_FORBIDDEN':
          'PHOTO_BOUND_MAKEUP_HIGHLIGHT_PRESET_FORBIDDEN',403));
      const reloaded=(await f.request(`${f.assetPath}/recipe`)).body.recipe;
      assert.equal(reloaded.version,1);
      assert.deepEqual(reloaded.body,originalRecipe);
    }
  }finally{await f.close();}
});
