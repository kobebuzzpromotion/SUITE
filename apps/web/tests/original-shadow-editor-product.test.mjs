import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession,neutralRecipe} from '../src/session.mjs';
import {originalShadowEditorGate} from '../src/editor-ui.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ready={trialMode:'INVITED_LOCAL_TRIAL',view:'after',pending:false,
  blocked:false,otherBrushActive:false,geometryReady:true,imageReady:true};
async function trial(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-shadow-editor-product-'));
  const context=await createTrialServer({dataDir,port:0,
    clock:()=>Date.parse('2026-10-03T08:00:00.000Z')});
  await new Promise((done,reject)=>{context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);});
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  const author=context.auth.createAuthor({authorName:'Editor shadow owner',
    trialEndsAt:'2026-11-03T08:00:00.000Z'});
  const invitation=context.auth.issueInvite(author.id);
  const login=await fetch(baseURL+'/trial/login',{method:'POST',
    headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
    body:JSON.stringify({inviteToken:invitation.inviteToken})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  const api=new TrialClient({baseURL,fetcher:(url,init)=>fetch(url,
    {...init,headers:{...init.headers,Cookie:cookie}})});
  async function asset(label){const bytes=Buffer.from(`SYNTHETIC_NONRAW_EDITOR_${label}`);
    const item=await api.createAsset({name:`${label}.nonraw`,sha256:sha(bytes),
      size:bytes.length});
    await api.putOriginal(item.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    await api.saveRecipe(item.id,0,neutralRecipe());
    return item;}
  const target=await asset('target'),backdrop=await asset('backdrop');
  const stored=await api.getRecipe(target.id);
  const session=new EditorSession({api,processing:{syntheticTestOnly:true},
    personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
  session.publish({asset:target,assets:[target,backdrop],recipe:stored.body,
    revision:stored.revision,beforeURL:'blob:before',afterURL:'blob:after'});
  return {context,api,author,target,backdrop,session,
    async close(){await new Promise((done,reject)=>context.server.close(error=>
      error?reject(error):done()));
      const path=resolve(dataDir),base=resolve(tmpdir())+sep;
      if(!path.startsWith(base)||
          !path.split(sep).at(-1).startsWith('suite-shadow-editor-product-'))
        throw Error('UNSAFE_TEST_CLEANUP');
      await rm(path,{recursive:true,force:true});}};
}

test('ORIGINAL-SHADOW-EDITOR-01 / actual authenticated Trial assets are only UI-eligible after explicit After and background selection',async()=>{
  const f=await trial();
  try{
    const state=f.session.state;
    assert.equal(originalShadowEditorGate(f.session,state,
      {...ready,backdropID:f.backdrop.id}),null);
    for(const [change,expected] of [
      [{trialMode:'SITES'},'TRIAL_REQUIRED'],
      [{backdropID:''},'BACKDROP_SELECTION_REQUIRED'],
      [{backdropID:f.target.id},'BACKDROP_SELECTION_REQUIRED'],
      [{view:'before'},'AFTER_REQUIRED'],
      [{view:'split'},'AFTER_REQUIRED'],
      [{geometryReady:false},'AFTER_REQUIRED'],
      [{imageReady:false},'AFTER_REQUIRED'],
      [{blocked:true},'ACCESS_EXPIRED'],
      [{pending:true},'BUSY'],
      [{otherBrushActive:true},'BUSY']]){
      assert.match(originalShadowEditorGate(f.session,state,
        {...ready,backdropID:f.backdrop.id,...change}),new RegExp(expected));
    }
    assert.match(originalShadowEditorGate(f.session,{...state,dirty:true},
      {...ready,backdropID:f.backdrop.id}),/SAVED_TARGET_REQUIRED/u);
    const combined=structuredClone(state);combined.recipe.parameters.
      extendedParameters.addShadowManual={binding:{}};
    assert.match(originalShadowEditorGate(f.session,combined,
      {...ready,backdropID:f.backdrop.id}),/COMBINATION_UNSUPPORTED/u);
    f.context.auth.revokeAuthor(f.author.id);
    const revoked=await f.api.getSession();
    assert.equal(revoked.endedReason,'TRIAL_REVOKED');
    assert.match(originalShadowEditorGate(f.session,state,
      {...ready,blocked:true,backdropID:f.backdrop.id}),/ACCESS_EXPIRED/u);
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-EDITOR-02 / product Editor mounts the real Trial bridge and browser fixture bundles without mock authority',async()=>{
  const editor=await readFile(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
  assert.match(editor,/createOriginalShadowEditorBridge\(\{session,targetAssetID/u);
  assert.match(editor,/bridge\.refresh\(\)/u);
  assert.match(editor,/bridge\.mount\(\{root:byID\('original-shadow-manual-root'\)/u);
  assert.match(editor,/stopOriginalShadow\(\)/u);
  const fixture=fileURLToPath(new URL(
    './fixtures/original-shadow-editor-product-fixture.mjs',import.meta.url));
  const result=await build({entryPoints:[fixture],bundle:true,
    format:'iife',platform:'browser',target:'es2022',write:false,
    logLevel:'silent'});
  assert.ok(result.outputFiles[0].text.length>10000);
  assert.match(result.outputFiles[0].text,/ORIGINAL_SHADOW_EDITOR_PRODUCT_BROWSER_PASS/u);
});
