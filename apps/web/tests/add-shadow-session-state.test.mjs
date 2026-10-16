import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession} from '../src/session.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {ADD_SHADOW_VERSION} from '../src/processing/add-shadow.mjs';
import {ASSET_A, ASSET_B, SHA, recipe, syntheticPixels} from './fixtures.mjs';

// This is a deliberately mocked Session state/CAS probe. It cannot authenticate
// an Asset or decode RAW; separate Trial HTTP tests verify the actual Gates.
function fixture() {
  const pixels = syntheticPixels();
  const asset = {id:ASSET_A,sha256:SHA,name:'synthetic.raw',cloudSafe:true,deletedAt:null};
  const backdrop = {id:ASSET_B,sha256:'b'.repeat(64),name:'backdrop.raw',cloudSafe:true,deletedAt:null};
  const saved = {revision:1,body:recipe()};
  const calls = [],revoked=[];
  const api = Object.assign(Object.create(TrialClient.prototype), {
    listAssets:async()=>[asset,backdrop],assertPermission:async()=>({authorized:true}),
    saveRecipe:async(id,expected,body)=>{assert.equal(id,asset.id);assert.equal(expected,saved.revision);
      saved.revision++;saved.body=structuredClone(body);calls.push('CAS');return structuredClone(saved);},
    getRecipe:async()=>structuredClone(saved)
  });
  let urlNumber=0;
  const processing={encode:async p=>new Blob([p.data]),render:async (p,_r,options)=>{
    calls.push(options.addShadowTarget?'render-shadow':'render-neutral');return p;}};
  const session=new EditorSession({api,processing,storage:{put:async()=>{}},
    urlAPI:{createObjectURL:()=>`blob:shadow-${++urlNumber}`,
      revokeObjectURL:url=>revoked.push(url)}});
  session.proxy=pixels;session.history=[recipe()];session.cursor=0;
  session.data={...session.data,assets:[asset,backdrop],asset,recipe:recipe(),revision:1,dirty:false};
  const document={schemaVersion:1,engineVersion:ADD_SHADOW_VERSION,
    binding:{assetID:asset.id,originalSHA256:asset.sha256,
      sourceWidth:pixels.width,sourceHeight:pixels.height,
      backdropID:backdrop.id,backdropSHA256:backdrop.sha256},
    subjectStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],
      radiusFraction:.04,hardness:.75}],settings:{mode:'soft',opacity:70,
      blur:8,gradient:0,blend:'normal',offsetX:8,offsetY:8,
      shadowColor:[0,0,0]}};
  return {session,asset,backdrop,document,pixels,saved,calls,revoked};
}

test('SHADOW-SESSION-01 / MOCK_GATE: draft applies only to the bound photo and requires explicit background Replace',async()=>{
  const {session,document,backdrop,calls}=fixture();
  session.readAddShadowRuntime=async (draft,options={})=>{
    calls.push(`${options.mode??(session.data.dirty?'draft':'saved')}:${options.target??'proxy'}`);
    assert.deepEqual(draft.parameters.extendedParameters.addShadowManual,document);
    return {runtime:{kind:'MOCK_ONLY'},original:session.proxy};};
  await session.setAddShadowManualDocument(document);
  assert.equal(session.state.dirty,true);
  assert.equal(session.state.shadowVerification,'draft');
  assert.ok(session.state.afterURL);
  assert.ok(calls.includes('render-shadow'));
  const replacement=structuredClone(document);
  replacement.binding.backdropID='33333333-3333-4333-8333-333333333333';
  replacement.binding.backdropSHA256='c'.repeat(64);
  session.api.listAssets=async()=>[session.data.asset,backdrop,
    {id:replacement.binding.backdropID,sha256:replacement.binding.backdropSHA256,
      name:'new.raw',cloudSafe:true,deletedAt:null}];
  await assert.rejects(session.setAddShadowManualDocument(replacement),/EXISTING_BINDING_CONFLICT/);
});

test('SHADOW-SESSION-02 / MOCK_GATE: CAS success with failed post-save Gate remains saved but unverified and revokes draft Blob',async()=>{
  const {session,document,saved,revoked,calls}=fixture();
  let failSaved=false;
  session.readAddShadowRuntime=async (_recipe,options={})=>{
    if(failSaved&&options.mode==='saved')throw Error('ADD_SHADOW_TRIAL_SAVED_DOCUMENT_CHANGED');
    return {runtime:{kind:'MOCK_ONLY'},original:session.proxy};};
  await session.setAddShadowManualDocument(document);
  const oldURL=session.state.afterURL;
  failSaved=true;
  await assert.rejects(session.save(),/SAVED_DOCUMENT_CHANGED/);
  assert.equal(saved.revision,2);
  assert.equal(session.state.revision,2);
  assert.equal(session.state.dirty,false);
  assert.equal(session.state.shadowVerification,'unverified');
  assert.equal(session.state.afterURL,null);
  assert.ok(revoked.includes(oldURL));
  assert.deepEqual(saved.body.parameters.extendedParameters.addShadowManual,document);
  assert.deepEqual(calls.filter(value=>value==='CAS'),['CAS']);
});

test('SHADOW-SESSION-03 / MOCK_GATE: explicit Replace invalidates old Preview and stores only new bound background at next CAS',async()=>{
  const {session,document,backdrop,saved,revoked}=fixture();
  session.readAddShadowRuntime=async()=>({runtime:{kind:'MOCK_ONLY'},original:session.proxy});
  await session.setAddShadowManualDocument(document);
  await session.save();
  assert.equal(saved.revision,2);
  const oldURL=session.state.afterURL;
  const replacement=structuredClone(document);
  replacement.binding.backdropID='33333333-3333-4333-8333-333333333333';
  replacement.binding.backdropSHA256='c'.repeat(64);
  session.api.listAssets=async()=>[session.data.asset,backdrop,
    {id:replacement.binding.backdropID,sha256:replacement.binding.backdropSHA256,
      name:'new.raw',cloudSafe:true,deletedAt:null}];
  await session.setAddShadowManualDocument(replacement,{replaceBackdrop:true});
  assert.equal(session.state.dirty,true);
  assert.ok(revoked.includes(oldURL));
  assert.equal(session.state.recipe.parameters.extendedParameters.addShadowManual.binding.backdropID,
    replacement.binding.backdropID);
  assert.equal(saved.body.parameters.extendedParameters.addShadowManual.binding.backdropID,
    document.binding.backdropID);
  await session.save();
  assert.equal(saved.revision,3);
  assert.deepEqual(saved.body.parameters.extendedParameters.addShadowManual,replacement);
});
