import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {makeManualEyelashDocument,mountManualEyelashUI} from '../src/manual-eyelash-ui.mjs';
import {applyManualEyelashes,MANUAL_EYELASH_VERSION} from '../src/processing/manual-eyelash-render.mjs';
import {syntheticPixels} from './fixtures.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),personID:'33333333-3333-4333-8333-333333333333',
  sourceWidth:200,sourceHeight:100};
const curve={root:{u:.15,v:.4},control:{u:.25,v:.3},tip:{u:.35,v:.25},
  rootRadiusFraction:.012};
const eyes=[{side:'image-left',rect:{x:.1,y:.2,width:.3,height:.5},curves:[curve]}];
const settings={color:{r:24,g:19,b:19},opacity:.8};

test('EYELASH-UI-01: exact manual document matches pure renderer and has no authority/style claim',()=>{
  const original=structuredClone(eyes);
  const output=makeManualEyelashDocument(binding,eyes,settings);
  assert.deepEqual(output,{schemaVersion:1,engineVersion:MANUAL_EYELASH_VERSION,
    representation:'normalized-quadratic-root-control-tip-v1',binding,
    eyeTargets:eyes,settings});
  output.eyeTargets[0].curves[0].root.u=.2;
  assert.deepEqual(eyes,original);
  const result=applyManualEyelashes(syntheticPixels(200,100),
    makeManualEyelashDocument(binding,eyes,settings),
    {...binding,savedRevision:2,target:'source'});
  assert.ok(result.data.some((v,i)=>i%4!==3&&v!==64));
  assert.doesNotMatch(JSON.stringify(output),/permissionEvidence|ownerConfirmed|evotoStyle|savedRevision/);
});

test('EYELASH-UI-02: invalid eyes, settings and authority aliases fail structurally',()=>{
  const create=(b=binding,e=eyes,s=settings)=>makeManualEyelashDocument(b,e,s);
  for(const bad of [[],[{...eyes[0],curves:[]}],
    [{...eyes[0],curves:[{...curve,tip:{u:.9,v:.25}}]}],
    [eyes[0],eyes[0]],
    [{...eyes[0],curves:Array.from({length:129},()=>curve)}]])
    assert.throws(()=>create(binding,bad),/MANUAL_EYELASH_UI_/);
  for(const opacity of [-1,1.1,NaN,Infinity,'0.4',-0])
    assert.throws(()=>create(binding,eyes,{...settings,opacity}),/MANUAL_EYELASH_UI_SETTINGS_INVALID/);
  assert.throws(()=>create({...binding,savedRevision:2}),/MANUAL_EYELASH_UI_BINDING_INVALID/);
  assert.throws(()=>create(binding,eyes,{...settings,style:1}),/MANUAL_EYELASH_UI_SETTINGS_INVALID/);
  assert.throws(()=>create(binding,[{...eyes[0],curves:[{...curve,ownerConfirmed:true}]}]),
    /MANUAL_EYELASH_UI_CURVE_INVALID/);
});

class FakeElement{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag.toUpperCase();
    this.children=[];this.parentElement=null;this.style={position:'',touchAction:'',outline:''};
    this.attributes=new Map();this.listeners=new Map();this.dataset={};this._text='';
    this.value='';this.disabled=false;this.complete=false;this.naturalWidth=0;this.naturalHeight=0;}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  append(...children){for(const child of children){this.children.push(child);child.parentElement=this;}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  remove(){if(this.parentElement)this.parentElement.children=
    this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
  setAttribute(key,value){this.attributes.set(key,String(value));}
  getAttribute(key){return this.attributes.get(key)??null;}
  removeAttribute(key){this.attributes.delete(key);}
  addEventListener(type,handler){const list=this.listeners.get(type)??[];
    list.push(handler);this.listeners.set(type,list);}
  dispatch(type,fields={}){const event={type,pointerId:1,pointerType:'mouse',button:0,
    isPrimary:true,clientX:100,clientY:100,key:'',preventDefault(){this.defaultPrevented=true;},
    ...fields};for(const handler of this.listeners.get(type)??[])handler(event);return event;}
  click(){if(!this.disabled)this.dispatch('click');}
  getBoundingClientRect(){return {left:0,top:0,width:200,height:200,right:200,bottom:200};}
  setPointerCapture(){}releasePointerCapture(){}
}
class FakeImage extends FakeElement{
  constructor(doc){super(doc,'img');this.complete=true;this.naturalWidth=200;this.naturalHeight=100;}
}
class FakeDocument{
  createElement(tag){return new FakeElement(this,tag);}
  createElementNS(_uri,tag){return new FakeElement(this,tag);}
}
function controls(root){
  const nodes=[];const visit=item=>{nodes.push(item);item.children.forEach(visit);};visit(root);
  return {button:text=>nodes.find(item=>item.tagName==='BUTTON'&&item.textContent===text),
    input:label=>nodes.find(item=>item.tagName==='INPUT'&&item.getAttribute('aria-label')===label),
    status:()=>nodes.find(item=>item.getAttribute('role')==='status')};
}
async function fakeDOM(run){
  const previous={HTMLElement:globalThis.HTMLElement,HTMLImageElement:globalThis.HTMLImageElement,
    getComputedStyle:globalThis.getComputedStyle};
  globalThis.HTMLElement=FakeElement;globalThis.HTMLImageElement=FakeImage;
  globalThis.getComputedStyle=()=>({position:'relative'});
  try{const doc=new FakeDocument(),host=doc.createElement('div'),image=new FakeImage(doc),
    root=doc.createElement('div');host.append(image);await run({doc,host,image,root});}
  finally{for(const [key,value] of Object.entries(previous)){
    if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }}
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const context=(changes={})=>({...binding,savedRevision:2,view:'after',ready:true,
  dirty:false,busy:false,permissionExpired:false,...changes});
const gesture=(image,id,start,end=start,type='mouse')=>{
  image.dispatch('pointerdown',{pointerId:id,clientX:start[0],clientY:start[1],pointerType:type});
  image.dispatch('pointermove',{pointerId:id,clientX:end[0],clientY:end[1],pointerType:type});
  image.dispatch('pointerup',{pointerId:id,clientX:end[0],clientY:end[1],pointerType:type});
};

test('EYELASH-UI-03: pointer/touch author left/right rectangles and three explicit curve points',()=>fakeDOM(async({image,root})=>{
  const ui=mountManualEyelashUI({root,afterImage:image,getContext:()=>context(),enabled:true});
  const c=controls(root);
  assert.equal(c.button('hostへ下書きを渡す').disabled,true);
  gesture(image,1,[20,70],[80,120]);
  c.button('root・control・tip').click();
  gesture(image,2,[30,90]);gesture(image,3,[45,80]);gesture(image,4,[65,78]);
  c.button('画像右眼').click();c.button('眼矩形').click();
  gesture(image,5,[120,70],[180,120],'touch');
  c.button('root・control・tip').click();
  gesture(image,6,[130,90],[130,90],'touch');
  gesture(image,7,[145,80],[145,80],'touch');
  gesture(image,8,[165,78],[165,78],'touch');
  const draft=ui.getDocument();
  assert.deepEqual(draft.eyeTargets.map(e=>e.side),['image-left','image-right']);
  assert.equal(draft.eyeTargets[0].curves.length,1);
  assert.equal(draft.eyeTargets[1].curves.length,1);
  assert.equal(c.button('hostへ下書きを渡す').disabled,true,'no host means no submit');
  const before=ui.getDocument();
  gesture(image,9,[40,10]);
  assert.deepEqual(ui.getDocument(),before,'letterbox outside After is rejected');
  image.dispatch('pointerdown',{pointerId:10,clientX:140,clientY:80});
  image.dispatch('pointercancel',{pointerId:10});
  assert.deepEqual(ui.getDocument(),before);
  ui.dispose();
}));

test('EYELASH-UI-04: keyboard, color/opacity, Undo/Redo and Cancel stay draft-only',()=>fakeDOM(async({image,root})=>{
  const ui=mountManualEyelashUI({root,afterImage:image,getContext:()=>context(),enabled:true});
  const c=controls(root);
  image.dispatch('keydown',{key:'Enter'});
  for(let i=0;i<10;i++)image.dispatch('keydown',{key:'ArrowRight'});
  for(let i=0;i<10;i++)image.dispatch('keydown',{key:'ArrowDown'});
  image.dispatch('keydown',{key:'Enter'});
  c.button('root・control・tip').click();
  for(let i=0;i<5;i++)image.dispatch('keydown',{key:'ArrowLeft'});
  for(let i=0;i<5;i++)image.dispatch('keydown',{key:'ArrowUp'});
  image.dispatch('keydown',{key:'Enter'});
  for(let i=0;i<2;i++)image.dispatch('keydown',{key:'ArrowRight'});
  image.dispatch('keydown',{key:'Enter'});
  image.dispatch('keydown',{key:'ArrowRight'});image.dispatch('keydown',{key:'ArrowDown'});
  image.dispatch('keydown',{key:'Enter'});
  assert.equal(ui.getDocument().eyeTargets[0].curves.length,1);
  const color=c.input('まつ毛の色');color.value='#336699';color.dispatch('change');
  const opacity=c.input('まつ毛 opacity %');opacity.value='37.5';opacity.dispatch('change');
  assert.deepEqual(ui.getDocument().settings,{color:{r:51,g:102,b:153},opacity:.375});
  c.button('戻す').click();assert.equal(ui.getDocument().settings.opacity,.8);
  c.button('やり直す').click();assert.equal(ui.getDocument().settings.opacity,.375);
  c.button('下書きを破棄').click();
  assert.deepEqual(ui.getDraft().eyeTargets,[]);
  assert.throws(()=>ui.getDocument(),/MANUAL_EYELASH_UI_EYES_INVALID/);
  assert.match(c.status().textContent,/未確認/);
  ui.dispose();
}));

test('EYELASH-UI-05: async host, Cancel, asset change and expiry cannot claim saved',()=>fakeDOM(async({image,root})=>{
  let current=context(),resolve;
  const seen=[];
  const ui=mountManualEyelashUI({root,afterImage:image,getContext:()=>current,
    enabled:true,onSubmit:(candidate,{signal})=>{
      seen.push({candidate,signal});return new Promise(done=>{resolve=done;});}});
  const c=controls(root);
  gesture(image,1,[20,70],[80,120]);c.button('root・control・tip').click();
  gesture(image,2,[30,90]);gesture(image,3,[45,80]);gesture(image,4,[65,78]);
  c.button('hostへ下書きを渡す').click();
  assert.equal(seen.length,1);assert.equal(seen[0].signal.aborted,false);
  c.button('下書きを破棄').click();assert.equal(seen[0].signal.aborted,true);
  resolve({saved:true});await tick();
  assert.deepEqual(ui.getDraft().eyeTargets,[]);
  assert.doesNotMatch(c.status().textContent,/保存しました/);
  gesture(image,5,[20,70],[80,120]);
  current=context({assetID:'22222222-2222-4222-8222-222222222222'});
  ui.refresh();assert.deepEqual(ui.getDraft().eyeTargets,[]);
  assert.equal(c.button('hostへ下書きを渡す').disabled,true);
  assert.throws(()=>ui.getDocument(),/MANUAL_EYELASH_UI_AFTER_NOT_READY/);
  ui.dispose();
  const otherRoot=image.ownerDocument.createElement('div');
  current=context();const next=mountManualEyelashUI({root:otherRoot,afterImage:image,
    getContext:()=>current,enabled:true});
  gesture(image,6,[20,70],[80,120]);current=context({permissionExpired:true});
  next.refresh();assert.deepEqual(next.getDraft().eyeTargets,[]);
  next.dispose();
}));

test('EYELASH-UI-06: browser bundle and accessible non-dummy controls',async()=>{
  const output=await build({entryPoints:[fileURLToPath(new URL('../src/manual-eyelash-ui.mjs',
    import.meta.url))],bundle:true,format:'esm',platform:'browser',write:false});
  assert.ok(output.outputFiles[0].contents.length>0);
  const text=new TextDecoder().decode(output.outputFiles[0].contents);
  assert.match(text,/focus-visible/);assert.match(text,/prefers-reduced-motion/);
  assert.match(text,/min-height:\s*44px/);
  assert.doesNotMatch(text,/17スタイル|14スタイル|Evoto同等/);
});
