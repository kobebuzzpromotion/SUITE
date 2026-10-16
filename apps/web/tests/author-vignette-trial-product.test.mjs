import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {createPresetFacade} from '../src/preset-facade.mjs';
import {portableParameters} from '../preset-policy.mjs';
import {AUTHOR_PORTABLE_SCOPE_NOTE} from '../src/author-ui.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {recipe as neutralRecipe, syntheticPixels} from './fixtures.mjs';

// The shipped loopback Trial routes and SQLite stores are used below. Pixel
// decoding/encoding is a synthetic non-RAW seam; no Chrome, LibRaw or Cloud PASS.
const clone = value => structuredClone(value);
const vignette = {amount:-43, midpoint:35, roundness:-18, feather:72, highlights:27};
const postCrop = {schemaVersion:1, engineVersion:'suite-srgb8-manual-vignette-1', vignette};
const START = Date.parse('2026-10-05T00:00:00.000Z');

function sourceRecipe() {
  const body = neutralRecipe();
  body.parameters.exposure = .4;
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion:1, engineVersion:'suite-srgb8-color-detail-1', color:{temperature:15},
  };
  body.parameters.extendedParameters.postCropAdjustments = clone(postCrop);
  body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  validateRecipe(body);
  return body;
}

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(),'suite-vignette-author-http-'));
  let now = START;
  const context = await createTrialServer({dataDir,port:0,clock:()=>now});
  await new Promise((resolve,reject)=>{
    context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',resolve);
  });
  const baseURL = `http://127.0.0.1:${context.server.address().port}`;
  async function login(name,role='author') {
    const author = context.auth.createAuthor({authorName:name,role,
      trialEndsAt:'2026-11-05T00:00:00.000Z'});
    const invite = context.auth.issueInvite(author.id);
    const response = await fetch(baseURL+'/trial/login',{method:'POST',headers:{
      'X-Suite-Trial':'1','Content-Type':'application/json',
    },body:JSON.stringify({inviteToken:invite.inviteToken})});
    assert.equal(response.status,200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('suite_trial='));
    const client = new TrialClient({baseURL,fetcher:(url,init)=>fetch(url,{...init,
      headers:{...init.headers,Cookie:cookie},
    })});
    return {author,client};
  }
  async function asset(client,label,body) {
    const original = Uint8Array.from(Buffer.from(`NON-RAW Author Vignette ${label}`));
    const sha256 = createHash('sha256').update(original).digest('hex');
    const record = await client.createAsset({name:`${label}.bin`,sha256,size:original.byteLength});
    assert.equal(record.sha256,sha256);
    await client.putOriginal(record.id,original.buffer);
    const saved = await client.saveRecipe(record.id,0,body);
    assert.equal(saved.revision,1);
    return {record,original,sha256};
  }
  return {context,login,asset,advance:ms=>{now+=ms;},async close(){
    await new Promise((resolve,reject)=>context.server.close(error=>error?reject(error):resolve()));
    await rm(dataDir,{recursive:true,force:true});
  }};
}

function processingSeam() {
  const pixels = syntheticPixels(14,10,128);
  pixels.data.set([250,230,190,255],(4*pixels.width+4)*4);
  return {pixels,processing:{
    decodeRaw:async()=>({pixels:clone(pixels),provenance:'SYNTHETIC_NON_RAW'}),
    makeProxy:async frame=>clone(frame),
    render:async(frame,body)=>renderPixels(frame,body,{validateRecipe,resolutionAssessment}),
    encode:async frame=>new Blob([frame.data],{type:'application/octet-stream'}),
  }};
}

async function sessionFor(client,storage,processing) {
  let sequence=0;
  const session=new EditorSession({api:client,storage,processing,urlAPI:{
    createObjectURL:()=>`blob:synthetic-${++sequence}`,revokeObjectURL(){},
  }});
  await session.initialize();
  return session;
}

test('AUTHOR-VIGNETTE-TRIAL01: saved capture, Trial draft/review, Library apply, Undo/Redo, CAS reload and synthetic Final',async()=>{
  const f=await fixture();
  try {
    const owner=await f.login('Vignette Author');
    const reviewer=await f.login('Independent Reviewer','admin');
    const source=await f.asset(owner.client,'source',sourceRecipe());
    const targetRecipe=neutralRecipe();
    targetRecipe.parameters.saturation=1.2;
    const target=await f.asset(owner.client,'target',targetRecipe);
    const {pixels,processing}=processingSeam();
    const records=new Map();
    const storage={get:async id=>clone(records.get(id)),put:async(id,value)=>{records.set(id,clone(value));}};
    const session=await sessionFor(owner.client,storage,processing);
    await session.openAsset(source.record.id);
    assert.equal(session.state.dirty,false);
    const captured=clone(session.state.recipe);
    assert.deepEqual(portableParameters(captured).postCropAdjustments,postCrop);
    assert.match(AUTHOR_PORTABLE_SCOPE_NOTE,/周辺光量5値/);
    const created=await owner.client.createDraft({name:'Quiet Vignette',recipe:captured,
      assetID:source.record.id,recipeRevision:session.state.revision});
    assert.deepEqual(created.parameters.postCropAdjustments,postCrop);
    assert.deepEqual((await owner.client.listDrafts())[0].parameters.postCropAdjustments,postCrop);
    const submitted=await owner.client.submitDraft(created.id,{expectedRevision:created.revision});
    assert.equal(submitted.status,'SUBMITTED');
    const accepted=await reviewer.client.reviewDraft(created.id,{expectedRevision:submitted.revision,decision:'ACCEPTED'});
    assert.deepEqual(accepted.preset.parameters.postCropAdjustments,postCrop);
    const published=(await owner.client.listPresets())[0];
    assert.deepEqual(published.parameters.postCropAdjustments,postCrop);
    assert.equal(JSON.stringify(published).includes(source.record.id),false);
    await session.openAsset(target.record.id);
    const prior=clone(session.state.recipe),originalBefore=await owner.client.getOriginal(target.record.id);
    const facade=createPresetFacade({author:owner.client,session,principal:owner.author});
    const listed=await facade.reload({kind:'AUTHOR_PUBLISHED',id:published.id});
    assert.deepEqual(listed.parameters.postCropAdjustments,postCrop);
    const applied=await facade.apply({kind:'AUTHOR_PUBLISHED',id:published.id,version:published.version});
    assert.equal(applied.outcome,'applied_unsaved');
    assert.deepEqual(session.state.recipe.parameters.extendedParameters.postCropAdjustments,postCrop);
    assert.equal(session.state.recipe.parameters.saturation,1);
    assert.equal(session.state.dirty,true);
    await session.undo();
    assert.deepEqual(session.state.recipe,prior);
    await session.redo();
    assert.deepEqual(session.state.recipe.parameters.extendedParameters.postCropAdjustments,postCrop);
    const saved=await session.save();
    assert.equal(saved.revision,2);
    const reopened=await sessionFor(owner.client,storage,processing);
    await reopened.openAsset(target.record.id);
    assert.deepEqual(reopened.state.recipe.parameters.extendedParameters.postCropAdjustments,postCrop);
    assert.equal(reopened.state.dirty,false);
    const final=await reopened.exportFinal({format:'png',quality:1});
    const expected=renderPixels(pixels,reopened.state.recipe,{validateRecipe,resolutionAssessment});
    assert.deepEqual(new Uint8ClampedArray(await final.arrayBuffer()),expected.data);
    const withoutVignette=clone(reopened.state.recipe);
    delete withoutVignette.parameters.extendedParameters.postCropAdjustments;
    assert.notDeepEqual(expected.data,renderPixels(pixels,withoutVignette,
      {validateRecipe,resolutionAssessment}).data,'Vignette changes Final pixels');
    assert.deepEqual(await owner.client.getOriginal(target.record.id),originalBefore);
    assert.equal((await owner.client.getRecipe(target.record.id)).revision,2);
  }finally{await f.close();}
});

test('AUTHOR-VIGNETTE-TRIAL02: older preset leaves target Vignette, other adjustment and photo-local exclusion intact',async()=>{
  const target=sourceRecipe();
  target.parameters.rotationDegrees=90;
  const before=clone(target);
  const {processing}=processingSeam();
  const asset={id:'aaaaaaaa-1111-4111-8111-111111111111',sha256:'a'.repeat(64)};
  const api={listAssets:async()=>[asset],getRecipe:async()=>({revision:1,body:clone(target)})};
  const storage={get:async()=>({asset,proxy:syntheticPixels(8,8,128),history:[clone(target)],cursor:0,revision:1,dirty:false}),put:async()=>{}};
  const session=await sessionFor(api,storage,processing);
  await session.openAsset(asset.id);
  await session.applyPortablePreset({exposure:1,contrast:1,saturation:1});
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postCropAdjustments,postCrop);
  assert.equal(session.state.recipe.parameters.rotationDegrees,90);
  assert.deepEqual(before,target);
  await assert.rejects(session.applyPortablePreset({exposure:0,contrast:1,saturation:1,
    postCropAdjustments:{...postCrop,vignette:{...vignette,mask:{data:[1]}}}}),/INVALID_POST_CROP_PRESET/);
});

test('AUTHOR-VIGNETTE-TRIAL03: foreign source, stale revision, prohibited Crop and expired Trial fail closed',async()=>{
  const f=await fixture();
  try {
    const owner=await f.login('Author'),other=await f.login('Other');
    const source=await f.asset(owner.client,'source',sourceRecipe());
    const input={name:'Vignette',recipe:sourceRecipe(),assetID:source.record.id,recipeRevision:1};
    await assert.rejects(other.client.createDraft(input),/ASSET_NOT_FOUND|NOT_FOUND|SOURCE_RECIPE_MISMATCH/);
    await assert.rejects(owner.client.createDraft({...input,recipeRevision:2}),/SOURCE_RECIPE_MISMATCH/);
    const cropped=sourceRecipe();cropped.parameters.extendedParameters.crop={};
    await assert.rejects(owner.client.createDraft({...input,recipe:cropped}),/INVALID_CROP_EXPORT_FIELDS|PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
    const created=await owner.client.createDraft(input);
    await assert.rejects(owner.client.saveDraft(created.id,{...input,expectedRevision:2}),/REVISION_CONFLICT/);
    assert.deepEqual((await owner.client.listDrafts())[0].parameters.postCropAdjustments,postCrop);
    f.advance(32*24*60*60*1000);
    await assert.rejects(owner.client.listDrafts(),/TRIAL_EXPIRED|UNAUTHORIZED/);
    await assert.rejects(owner.client.listPresets(),/TRIAL_EXPIRED|UNAUTHORIZED/);
    assert.equal(f.context.repo.get(owner.author.tenantId,source.record.id).sha256,source.sha256);
  }finally{await f.close();}
});
