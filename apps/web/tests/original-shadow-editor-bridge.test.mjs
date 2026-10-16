import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {createProcessing} from '../src/processing/index.mjs';
import {makeProxyPixels} from '../src/processing/pure.mjs';
import {ORIGINAL_SHADOW_VERSION} from '../src/processing/original-shadow.mjs';
import {createOriginalShadowEditorBridge} from
  '../src/original-shadow-editor-bridge.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const neutral=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,
  saturation:1,rotationDegrees:0,extendedParameters:{},
  processingOrder:['exposure','contrast','saturation','rotation']}});
const stroke=u=>({operation:'ADD',path:[{u,v:.5}],
  radiusFraction:.1,hardness:.8});
const pixels=(value,width=40,height=20)=>({width,height,
  data:Uint8ClampedArray.from({length:width*height*4},(_,index)=>
    index%4===3?255:value)});
const bundle=await build({entryPoints:[fileURLToPath(new URL(
  '../src/processing/worker.mjs',import.meta.url))],bundle:true,
  format:'iife',platform:'browser',target:'es2022',external:['module'],
  write:false,logLevel:'silent'});
function bridgeWorker(calls){
  const messages=[],self={postMessage(message){messages.push(message);}};
  const realm=createContext({self,Uint8Array,Uint8ClampedArray,ArrayBuffer,
    DataView,DOMException,TextEncoder,Blob,URL,structuredClone,crypto:webcrypto,
    setTimeout,clearTimeout,fetch,console});
  runInContext(bundle.outputFiles[0].text,realm);
  return class Worker{
    postMessage(message){
      calls.push(message.method);
      queueMicrotask(async()=>{
        try{
          realm.json=JSON.stringify(message,(_,value)=>
            value instanceof Uint8ClampedArray?{__kind:'clamped',data:[...value]}:
            value instanceof Uint8Array?{__kind:'bytes',data:[...value]}:value);
          const payload=runInContext(`JSON.parse(json,(_,value)=>
            value?.__kind==='clamped'?new Uint8ClampedArray(value.data):
            value?.__kind==='bytes'?new Uint8Array(value.data):value)`,realm);
          messages.length=0;await self.onmessage({data:payload});
          this.onmessage({data:messages[0]});
        }catch(error){this.onerror({message:error.message});}
      });
    }
    terminate(){}
  };
}
async function fixture({backgroundWidth=40}={}){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-shadow-bridge-'));
  const context=await createTrialServer({dataDir,port:0,
    clock:()=>Date.parse('2026-10-03T08:00:00.000Z')});
  await new Promise((done,reject)=>{context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);});
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  const author=context.auth.createAuthor({authorName:'Shadow bridge owner',
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
  async function asset(name){
    const bytes=Buffer.from(`SYNTHETIC_NONRAW_SHADOW_BRIDGE_${name}`);
    const created=await api.createAsset({name:`${name}.nonraw`,
      sha256:sha(bytes),size:bytes.length});
    await api.putOriginal(created.id,bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset+bytes.byteLength));
    return {...created,bytes};
  }
  const target=await asset('target'),backdrop=await asset('backdrop');
  await api.saveRecipe(target.id,0,neutral());
  const calls=[],oldWorker=globalThis.Worker;
  globalThis.Worker=bridgeWorker(calls);
  const processing=createProcessing();processing.syntheticTestOnly=true;
  processing.decodeRaw=async(bytes,{mode,signal}={})=>{
    if(signal?.aborted)throw Error('DECODE_ABORTED');
    const sourceSHA256=sha(Buffer.from(bytes));
    const frame=sourceSHA256===target.sha256?pixels(40):
      sourceSHA256===backdrop.sha256?pixels(180,backgroundWidth):null;
    if(!frame)throw Error('UNKNOWN_SYNTHETIC_BYTES');
    return {pixels:frame,provenance:{sourceSHA256,
      sourceRepresentation:'synthetic-nonraw-test',mode}};
  };
  processing.makeProxy=async(frame,maxEdge)=>makeProxyPixels(frame,maxEdge);
  processing.encode=async(frame,{format}={})=>
    new Blob([frame.data],{type:`image/${format}`});
  let serial=0;const urls=new Map();
  const session=new EditorSession({api,processing,urlAPI:{
    createObjectURL(blob){const url=`blob:bridge-${++serial}`;
      urls.set(url,blob);return url;},
    revokeObjectURL(url){urls.delete(url);}}});
  await session.initialize();await session.openAsset(target.id);
  const selected={targetAssetID:target.id,backdropAssetID:backdrop.id,view:'after'};
  assert.ok(session instanceof EditorSession);
  assert.ok(session.api instanceof TrialClient);
  assert.match(target.id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
  assert.match(backdrop.id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
  assert.notEqual(target.id,backdrop.id);
  const bridge=createOriginalShadowEditorBridge({session,targetAssetID:target.id,
    backdropAssetID:backdrop.id,getSelection:()=>({...selected})});
  const document=context=>({schemaVersion:1,
    engineVersion:ORIGINAL_SHADOW_VERSION,
    source:'owner-manual-input-unverified',binding:{assetID:context.target.id,
      originalSHA256:context.target.sha256,
      sourceWidth:context.target.sourceWidth,
      sourceHeight:context.target.sourceHeight,
      backdropID:context.backdrop.id,
      backdropSHA256:context.backdrop.sha256},
    subjectStrokes:[stroke(.25)],shadowStrokes:[stroke(.75)],
    settings:{opacity:100}});
  const options=(ctx,signal=new AbortController().signal)=>({
    target:{id:ctx.target.id,sha256:ctx.target.sha256,
      sourceWidth:ctx.target.sourceWidth,sourceHeight:ctx.target.sourceHeight},
    backdrop:{id:ctx.backdrop.id,sha256:ctx.backdrop.sha256},
    expectedRevision:ctx.target.savedRevision,signal});
  return {context,author,api,target,backdrop,session,bridge,selected,calls,urls,
    document,options,async close(){bridge.dispose();processing.dispose();
      globalThis.Worker=oldWorker;
      await new Promise((done,reject)=>context.server.close(error=>
        error?reject(error):done()));
      const path=resolve(dataDir),base=resolve(tmpdir())+sep;
      if(!path.startsWith(base)||
          !path.split(sep).at(-1).startsWith('suite-shadow-bridge-'))
        throw Error('UNSAFE_TEST_CLEANUP');
      await rm(path,{recursive:true,force:true});}};
}

test('ORIGINAL-SHADOW-BRIDGE-01 / fake host injection and non-Trial sessions never enable apply',()=>{
  assert.throws(()=>createOriginalShadowEditorBridge({session:{api:{}},
    targetAssetID:'a',backdropAssetID:'b',getSelection:()=>({})}),
  /BRIDGE_INIT_INVALID/u);
  assert.throws(()=>createOriginalShadowEditorBridge({session:{api:{}},
    targetAssetID:'a',backdropAssetID:'b',getSelection:()=>({}),
    onApply:()=>({accepted:true})}),/BRIDGE_INIT_INVALID/u);
});

test('ORIGINAL-SHADOW-BRIDGE-02 / authenticated Trial bridge saves two layers then reloads actual Session Preview',async()=>{
  const f=await fixture();
  try{
    assert.equal(f.bridge.getContext().ready,false);
    await assert.rejects(f.bridge.onApply({},{}),/REFRESH_REQUIRED/u);
    const scope=await f.bridge.refresh();
    assert.equal(scope.ready,true);
    const response=await f.bridge.onApply(f.document(scope),f.options(scope));
    assert.deepEqual(response,{accepted:true});
    assert.equal(f.session.state.revision,2);
    assert.equal(f.session.state.shadowVerification,'verified');
    assert.equal(f.bridge.getContext().ready,true);
    assert.ok(f.urls.has(f.session.state.afterURL));
    assert.equal(f.calls.includes('applyBoundOriginalShadowManual'),true);
    const saved=await f.api.getRecipe(f.target.id);
    assert.deepEqual(saved.body.parameters.extendedParameters.originalShadowManual,
      f.document(scope));
    for(const asset of [f.target,f.backdrop]){
      const stored=f.context.repo.get(asset.tenantId,asset.id);
      assert.equal((await f.context.storage.inspect(stored.originalKey)).sha256,
        asset.sha256);
    }
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-BRIDGE-03 / Before, selection, stale revision and Add Shadow block host callback',async()=>{
  const f=await fixture();
  try{
    const scope=await f.bridge.refresh(),doc=f.document(scope);
    f.selected.view='before';
    assert.equal(f.bridge.getContext().ready,false);
    await assert.rejects(f.bridge.onApply(doc,f.options(scope)),/REFRESH_REQUIRED/u);
    f.selected.view='after';f.selected.backdropAssetID=f.target.id;
    await assert.rejects(f.bridge.onApply(doc,f.options(scope)),/REFRESH_REQUIRED/u);
    f.selected.backdropAssetID=f.backdrop.id;
    const stale=f.options(scope);stale.expectedRevision++;
    await assert.rejects(f.bridge.onApply(doc,stale),/UI_SCOPE_MISMATCH/u);
    f.session.data.recipe.parameters.extendedParameters.addShadowManual={binding:{}};
    await assert.rejects(f.bridge.onApply(doc,f.options(scope)),/REFRESH_REQUIRED/u);
    assert.equal((await f.api.getRecipe(f.target.id)).revision,1);
  }finally{await f.close();}
});

test('ORIGINAL-SHADOW-BRIDGE-04 / cancellation, revocation and unequal backdrop fail before CAS',async()=>{
  const cancelled=await fixture();
  try{
    const scope=await cancelled.bridge.refresh();
    const controller=new AbortController();controller.abort();
    await assert.rejects(cancelled.bridge.onApply(cancelled.document(scope),
      cancelled.options(scope,controller.signal)),/AbortError|cancelled/u);
    assert.equal((await cancelled.api.getRecipe(cancelled.target.id)).revision,1);
  }finally{await cancelled.close();}
  const revoked=await fixture();
  try{
    const scope=await revoked.bridge.refresh();
    revoked.context.auth.revokeAuthor(revoked.author.id);
    await assert.rejects(revoked.bridge.onApply(revoked.document(scope),
      revoked.options(scope)),/TRIAL_REVOKED|SESSION_REQUIRED/u);
  }finally{await revoked.close();}
  const dimensions=await fixture({backgroundWidth:39});
  try{
    await assert.rejects(dimensions.bridge.refresh(),
      /BACKDROP_DIMENSIONS_UNSUPPORTED/u);
    assert.equal(dimensions.bridge.getContext().ready,false);
    assert.equal((await dimensions.api.getRecipe(dimensions.target.id)).revision,1);
  }finally{await dimensions.close();}
});

class FakeNode{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag.toUpperCase();
    this.children=[];this.parentElement=null;this.attributes=new Map();
    this.listeners=new Map();this.style={position:'',pointerEvents:'',overflow:'',
      touchAction:'',outline:'',outlineOffset:''};this.dataset={};
    this.textContent='';this.value='';this.disabled=false;this.className='';
    this.tabIndex=-1;this.hidden=false;}
  append(...nodes){for(const node of nodes){node.parentElement=this;
    this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(!this.parentElement)return;
    this.parentElement.children=this.parentElement.children.filter(node=>node!==this);
    this.parentElement=null;}
  setAttribute(key,value){this.attributes.set(key,String(value));}
  getAttribute(key){return this.attributes.get(key)??null;}
  removeAttribute(key){this.attributes.delete(key);}
  addEventListener(type,listener,{signal}={}){
    if(!this.listeners.has(type))this.listeners.set(type,[]);
    this.listeners.get(type).push(listener);
    signal?.addEventListener('abort',()=>this.listeners.set(type,
      (this.listeners.get(type)??[]).filter(item=>item!==listener)),{once:true});
  }
  getBoundingClientRect(){return {left:0,top:0,width:40,height:20};}
}
class FakeImage extends FakeNode{
  constructor(doc){super(doc,'img');this.complete=true;
    this.naturalWidth=40;this.naturalHeight=20;}
}
class FakeDocument{
  createElement(tag){return new FakeNode(this,tag);}
  createElementNS(_namespace,tag){return new FakeNode(this,tag);}
}
function fakeDOM(){
  const previous={HTMLElement:globalThis.HTMLElement,
    HTMLImageElement:globalThis.HTMLImageElement,
    ResizeObserver:globalThis.ResizeObserver,
    getComputedStyle:globalThis.getComputedStyle};
  globalThis.HTMLElement=FakeNode;globalThis.HTMLImageElement=FakeImage;
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.getComputedStyle=()=>({position:'static'});
  const doc=new FakeDocument(),root=new FakeNode(doc,'div'),
    host=new FakeNode(doc,'div'),image=new FakeImage(doc);
  host.append(image);
  return {root,image,restore(){for(const [key,value] of Object.entries(previous)){
    if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}
function action(root,key){const queue=[root];while(queue.length){
  const node=queue.shift();if(node.dataset.originalShadowAction===key)return node;
  queue.push(...node.children);}throw Error('ACTION_NOT_FOUND');}

test('ORIGINAL-SHADOW-BRIDGE-05 / actual two-layer UI mount is disabled on Before and stale image',async()=>{
  const f=await fixture(),dom=fakeDOM();
  try{
    await f.bridge.refresh();
    dom.image.setAttribute('src',f.session.state.afterURL);
    const ui=f.bridge.mount({root:dom.root,afterImage:dom.image});
    assert.equal(f.bridge.getContext().ready,true);
    assert.equal(action(dom.root,'add').disabled,false);
    f.selected.view='before';f.bridge.sync();
    assert.equal(action(dom.root,'add').disabled,true);
    f.selected.view='after';dom.image.setAttribute('src','blob:stale');
    f.bridge.sync();
    assert.equal(action(dom.root,'submit').disabled,true);
    dom.image.setAttribute('src',f.session.state.afterURL);
    await f.bridge.refresh();
    assert.equal(action(dom.root,'add').disabled,false);
    assert.ok(ui.getDraft());
  }finally{await f.close();dom.restore();}
});
