import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {createPresetFacade} from '../src/preset-facade.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {recipe as neutralRecipe,syntheticPixels} from './fixtures.mjs';

// Shipped loopback Trial HTTP and SQLite. Decoding/encoding below is a fixed
// synthetic non-RAW seam, not a real browser Worker or camera RAW proof.
const clone=value=>structuredClone(value);
const VIGNETTE={schemaVersion:1,engineVersion:'suite-srgb8-manual-vignette-1',
  vignette:{amount:-50,midpoint:42,roundness:-25,feather:61,highlights:30}};
const START=Date.parse('2026-10-05T00:00:00.000Z');
function withVignette(){const body=neutralRecipe();body.parameters.extendedParameters.postCropAdjustments=clone(VIGNETTE);return body;}
function withLocalMask(){const body=neutralRecipe();body.parameters.exposure=.25;
  body.parameters.extendedParameters.localLevels={schemaVersion:1,
    engineVersion:'suite-srgb8-local-levels-coverage-1',
    brushVersion:'suite-normalized-coverage-brush-1',
    strokes:[{points:[{x:.4,y:.5}],radius:.2,hardness:.8,mode:'add'}],
    levels:{master:{gamma:1.2}}};
  body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',detail:{clarity:14}};
  body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  validateRecipe(body);return body;
}
async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-author-vignette-only-'));
  let now=START;
  const context=await createTrialServer({dataDir,port:0,clock:()=>now});
  await new Promise((resolve,reject)=>{context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',resolve);});
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  async function login(name,role='author'){
    const author=context.auth.createAuthor({authorName:name,role,
      trialEndsAt:'2026-11-05T00:00:00.000Z'});
    const invite=context.auth.issueInvite(author.id);
    const response=await fetch(baseURL+'/trial/login',{method:'POST',
      headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:invite.inviteToken})});
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('suite_trial='));
    const client=new TrialClient({baseURL,fetcher:(url,init)=>fetch(url,{...init,
      headers:{...init.headers,Cookie:cookie}})});
    return {author,client};
  }
  async function asset(client,label,body){
    const bytes=Uint8Array.from(Buffer.from(`NON-RAW Vignette-only ${label}`));
    const sha256=createHash('sha256').update(bytes).digest('hex');
    const created=await client.createAsset({name:`${label}.bin`,sha256,size:bytes.byteLength});
    await client.putOriginal(created.id,bytes.buffer);
    const saved=await client.saveRecipe(created.id,0,body);
    assert.equal(saved.revision,1);
    return {created,bytes,sha256};
  }
  async function publish(owner,reviewer,source,body){
    const draft=await owner.client.createDraft({name:'Published Vignette',recipe:body,
      assetID:source.created.id,recipeRevision:1});
    const submitted=await owner.client.submitDraft(draft.id,{expectedRevision:draft.revision});
    await reviewer.client.reviewDraft(draft.id,{expectedRevision:submitted.revision,decision:'ACCEPTED'});
    return (await owner.client.listPresets()).find(item=>item.name==='Published Vignette');
  }
  return {context,login,asset,publish,advance:ms=>{now+=ms;},async close(){
    await new Promise((resolve,reject)=>context.server.close(error=>error?reject(error):resolve()));
    await rm(dataDir,{recursive:true,force:true});
  }};
}
function syntheticProcessing(){const pixels=syntheticPixels(16,12,135);
  pixels.data.set([250,238,220,255],(5*pixels.width+6)*4);
  return {pixels,processing:{
    decodeRaw:async()=>({pixels:clone(pixels),provenance:'SYNTHETIC_NON_RAW'}),
    makeProxy:async frame=>clone(frame),
    render:async(frame,body)=>renderPixels(frame,body,{validateRecipe,resolutionAssessment}),
    encode:async frame=>new Blob([frame.data],{type:'application/octet-stream'}),
  }};
}
async function open(client,storage,processing,id){
  let next=0;const session=new EditorSession({api:client,storage,processing,
    urlAPI:{createObjectURL:()=>`blob:synthetic-vignette-${++next}`,revokeObjectURL(){}}});
  await session.initialize();await session.openAsset(id);return session;
}

test('AUTHOR-VIGNETTE-ONLY01: published five values alone merge over saved photo, preserve local mask and reach CAS/synthetic Final',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Author'),reviewer=await f.login('Reviewer','admin');
    const source=await f.asset(owner.client,'source',withVignette());
    const target=await f.asset(owner.client,'target',withLocalMask());
    const preset=await f.publish(owner,reviewer,source,withVignette());
    assert.ok(/^[a-f0-9]{64}$/.test(preset.sha256));
    const {pixels,processing}=syntheticProcessing();
    const records=new Map(),storage={get:async id=>clone(records.get(id)),
      put:async(id,value)=>{records.set(id,clone(value));}};
    const session=await open(owner.client,storage,processing,target.created.id);
    const before=clone(session.state.recipe),originalBefore=await owner.client.getOriginal(target.created.id);
    const facade=createPresetFacade({author:owner.client,session,principal:owner.author});
    const result=await facade.applyVignetteOnly({kind:'AUTHOR_PUBLISHED',id:preset.id,
      version:preset.version,expectedSHA256:preset.sha256});
    assert.equal(result.applyMode,'AUTHOR_VIGNETTE_ONLY');
    assert.equal(result.result.saved,false);
    const applied=clone(session.state.recipe);
    assert.deepEqual(applied.parameters.extendedParameters.postCropAdjustments,VIGNETTE);
    assert.deepEqual(applied.parameters.extendedParameters.localLevels,
      before.parameters.extendedParameters.localLevels);
    assert.deepEqual(applied.parameters.extendedParameters.postDecodeAdjustments,
      before.parameters.extendedParameters.postDecodeAdjustments);
    assert.equal(applied.parameters.exposure,before.parameters.exposure);
    assert.equal((await owner.client.getRecipe(target.created.id)).revision,1,'apply is unsaved');
    await session.undo();assert.deepEqual(session.state.recipe,before);
    await session.redo();assert.deepEqual(session.state.recipe,applied);
    const saved=await session.save();assert.equal(saved.revision,2);
    const reloaded=await open(owner.client,storage,processing,target.created.id);
    assert.deepEqual(reloaded.state.recipe,applied);
    const final=await reloaded.exportFinal({format:'png',quality:1});
    const expected=renderPixels(pixels,applied,{validateRecipe,resolutionAssessment});
    assert.deepEqual(new Uint8ClampedArray(await final.arrayBuffer()),expected.data);
    const noVignette=clone(applied);delete noVignette.parameters.extendedParameters.postCropAdjustments;
    assert.notDeepEqual(expected.data,renderPixels(pixels,noVignette,
      {validateRecipe,resolutionAssessment}).data);
    assert.deepEqual(await owner.client.getOriginal(target.created.id),originalBefore);
  }finally{await f.close();}
});

test('AUTHOR-VIGNETTE-ONLY02: stale published selection, changed target and changed Original refuse before Recipe mutation',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Author'),reviewer=await f.login('Reviewer','admin');
    const source=await f.asset(owner.client,'source',withVignette());
    const target=await f.asset(owner.client,'target',withLocalMask());
    const preset=await f.publish(owner,reviewer,source,withVignette());
    const {processing}=syntheticProcessing();const storage={get:async()=>undefined,put:async()=>{}};
    const session=await open(owner.client,storage,processing,target.created.id);
    const before=clone(session.state.recipe);
    const selected={presetID:preset.id,expectedVersion:preset.version,expectedSHA256:preset.sha256};
    await assert.rejects(session.applyPublishedAuthorVignetteOnly({...selected,expectedVersion:preset.version+1}),
      /AUTHOR_VIGNETTE_PRESET_VERSION_CHANGED/);
    assert.deepEqual(session.state.recipe,before);
    const replacement=clone(before);replacement.parameters.contrast=1.1;
    await owner.client.saveRecipe(target.created.id,1,replacement);
    await assert.rejects(session.applyPublishedAuthorVignetteOnly(selected),
      /AUTHOR_VIGNETTE_TARGET_REVISION_CHANGED/);
    assert.deepEqual(session.state.recipe,before);
    const fresh=await open(owner.client,storage,processing,target.created.id);
    const freshBefore=clone(fresh.state.recipe),getOriginal=owner.client.getOriginal.bind(owner.client);
    owner.client.getOriginal=async()=>Uint8Array.from([1,2,3,4]).buffer;
    await assert.rejects(fresh.applyPublishedAuthorVignetteOnly(selected),
      /AUTHOR_VIGNETTE_ORIGINAL_CHANGED/);
    assert.deepEqual(fresh.state.recipe,freshBefore);
    let reads=0;
    owner.client.getOriginal=async(...args)=>++reads===1?getOriginal(...args):
      Uint8Array.from([4,3,2,1]).buffer;
    await assert.rejects(fresh.applyPublishedAuthorVignetteOnly(selected),
      /AUTHOR_VIGNETTE_ORIGINAL_CHANGED/);
    assert.equal(reads,2,'a new Original fetch after the first verification is checked');
    assert.deepEqual(fresh.state.recipe,freshBefore);
    owner.client.getOriginal=getOriginal;
  }finally{await f.close();}
});

test('AUTHOR-VIGNETTE-ONLY03: legacy published preset, dirty target, wrong kind and expired Trial refuse without Full fallback',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Author'),reviewer=await f.login('Reviewer','admin');
    const source=await f.asset(owner.client,'source',neutralRecipe());
    const target=await f.asset(owner.client,'target',withLocalMask());
    const old=await f.publish(owner,reviewer,source,neutralRecipe());
    const {processing}=syntheticProcessing(),storage={get:async()=>undefined,put:async()=>{}};
    const session=await open(owner.client,storage,processing,target.created.id);
    const before=clone(session.state.recipe),facade=createPresetFacade({author:owner.client,session,principal:owner.author});
    await assert.rejects(facade.applyVignetteOnly({kind:'AUTHOR_DRAFT',id:old.id,
      version:old.version,expectedSHA256:old.sha256}),/PRESET_ACTION_UNSUPPORTED/);
    await assert.rejects(facade.applyVignetteOnly({kind:'AUTHOR_PUBLISHED',id:old.id,
      version:old.version,expectedSHA256:old.sha256}),/AUTHOR_VIGNETTE_PRESET_MISSING/);
    assert.deepEqual(session.state.recipe,before);
    await session.setAdjustment('exposure',.5);
    const dirty=clone(session.state.recipe);
    await assert.rejects(session.applyPublishedAuthorVignetteOnly({presetID:old.id,
      expectedVersion:old.version,expectedSHA256:old.sha256}),/AUTHOR_VIGNETTE_TARGET_SAVE_REQUIRED/);
    assert.deepEqual(session.state.recipe,dirty);
    await session.undo();await session.save();
    f.advance(32*24*60*60*1000);
    const stable=clone(session.state.recipe);
    await assert.rejects(session.applyPublishedAuthorVignetteOnly({presetID:old.id,
      expectedVersion:old.version,expectedSHA256:old.sha256}),/TRIAL_EXPIRED|UNAUTHORIZED/);
    assert.deepEqual(session.state.recipe,stable);
  }finally{await f.close();}
});
