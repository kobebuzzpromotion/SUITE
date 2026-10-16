import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {readTrialAddShadowTarget} from '../src/add-shadow-target-gate.mjs';
import {ADD_SHADOW_VERSION} from '../src/processing/add-shadow.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const neutral=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,
  saturation:1,rotationDegrees:0,extendedParameters:{},
  processingOrder:['exposure','contrast','saturation','rotation']}});
async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-add-shadow-session-http-'));
  const context=await createTrialServer({dataDir,port:0,
    clock:()=>Date.parse('2026-10-03T08:00:00.000Z')});
  await new Promise((done,reject)=>{context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);});
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  const author=context.auth.createAuthor({authorName:'Shadow session owner',
    trialEndsAt:'2026-11-03T08:00:00.000Z'});
  const invite=context.auth.issueInvite(author.id);
  const login=await fetch(baseURL+'/trial/login',{method:'POST',
    headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
    body:JSON.stringify({inviteToken:invite.inviteToken})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie,/^suite_trial=/);
  const api=new TrialClient({baseURL,fetcher:(url,init)=>fetch(url,
    {...init,headers:{...init.headers,Cookie:cookie}})});
  async function asset(label){
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_SHADOW_SESSION_${label}`);
    const created=await api.createAsset({name:`${label}.nonraw`,sha256:sha(bytes),size:bytes.length});
    await api.putOriginal(created.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    return (await api.listAssets()).find(item=>item.id===created.id);
  }
  return {context,api,asset,async close(){
    await new Promise((done,reject)=>context.server.close(error=>error?reject(error):done()));
    const target=resolve(dataDir),base=resolve(tmpdir())+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1).startsWith('suite-add-shadow-session-http-'))throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});}};
}
function document(target,backdrop){return {schemaVersion:1,engineVersion:ADD_SHADOW_VERSION,
  binding:{assetID:target.id,originalSHA256:target.sha256,sourceWidth:40,
    sourceHeight:20,backdropID:backdrop.id,backdropSHA256:backdrop.sha256},
  subjectStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.04,
    hardness:.8}],settings:{mode:'soft',opacity:70,blur:6,gradient:20,
    blend:'normal',offsetX:2,offsetY:3,shadowColor:[10,20,30]}};}

test('SHADOW-SESSION-HTTP01 / REAL_TRIAL_SQLITE_SYNTHETIC_NON_RAW: saved ID/SHA/revision bind Session; Node Worker is unavailable without proving image decode',async()=>{
  const f=await fixture();
  try{
    const target=await f.asset('target'),backdrop=await f.asset('backdrop');
    const base=await f.api.saveRecipe(target.id,0,neutral());
    assert.equal(base.revision,1);
    const doc=document(target,backdrop),fixed=neutral();
    fixed.parameters.extendedParameters.addShadowManual=doc;
    const saved=await f.api.saveRecipe(target.id,1,fixed);
    assert.equal(saved.revision,2);
    const reloaded=await f.api.getRecipe(target.id);
    assert.deepEqual(reloaded.body.parameters.extendedParameters.addShadowManual,doc);
    const pixels={width:40,height:20,data:new Uint8ClampedArray(40*20*4)};
    let renders=0,outputs=0;
    const processing={encode:async()=>{outputs++;return new Blob(['synthetic']);},
      decodeRaw:async()=>({pixels,provenance:{kind:'SYNTHETIC_NON_RAW_ONLY'}}),
      render:async()=>{renders++;throw Error('UNEXPECTED_RENDER');}};
    const session=new EditorSession({api:f.api,processing,
      urlAPI:{createObjectURL:()=>{throw Error('UNEXPECTED_BLOB_URL');},revokeObjectURL(){}}});
    session.proxy=pixels;session.history=[reloaded.body];session.cursor=0;
    session.data={...session.data,assets:[target,backdrop],asset:target,
      recipe:reloaded.body,revision:reloaded.revision,dirty:false,
      shadowVerification:'unverified'};
    session.bind(reloaded.body);
    assert.equal(session.state.recipe.parameters.extendedParameters.addShadowManual.binding.backdropID,backdrop.id);
    const binding={...doc.binding,savedRevision:2};
    const fresh=await readTrialAddShadowTarget({api:f.api,binding,action:'export'});
    assert.equal(fresh.assetID,target.id);
    assert.equal(fresh.originalSHA256,target.sha256);
    assert.equal(fresh.savedRevision,2);
    await assert.rejects(readTrialAddShadowTarget({api:f.api,
      binding:{...binding,savedRevision:1},action:'export'}),
      /ADD_SHADOW_TARGET_REVISION_CONFLICT/);
    await assert.rejects(session.readAddShadowRuntime(reloaded.body,
      {target:'proxy',mode:'saved',revision:1}),/REVISION_CONFLICT/);
    // Node cannot start the browser LibRaw Worker. This is NOT evidence that
    // synthetic non-RAW bytes reached or were rejected by the decoder.
    await assert.rejects(session.refreshPreview(),/BROWSER_WORKER_UNAVAILABLE/);
    assert.equal(renders,0);assert.equal(session.state.afterURL,null);
    await assert.rejects(session.exportFinal({format:'png'}),/BROWSER_WORKER_UNAVAILABLE/);
    assert.equal(renders,0);assert.equal(session.state.revision,2);
    assert.equal(session.state.shadowVerification,'unverified');
    assert.equal(outputs,1,'only internal unexposed Before encoding may run');
    const forged=structuredClone(reloaded.body);
    forged.parameters.extendedParameters.addShadowManual.binding.originalSHA256='f'.repeat(64);
    assert.throws(()=>session.bind(forged),/ASSET_BINDING_MISMATCH/);
    assert.deepEqual((await f.api.getRecipe(target.id)).body,reloaded.body);
    f.context.auth.revokeAuthor((await f.api.getSession()).principal.id);
    await assert.rejects(readTrialAddShadowTarget({api:f.api,binding,
      action:'export'}),/TRIAL_REVOKED/);
    await assert.rejects(session.refreshPreview(),/TRIAL_REVOKED/);
    assert.equal(session.state.afterURL,null);
  }finally{await f.close();}
});
