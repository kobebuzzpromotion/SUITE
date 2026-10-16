import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {makeManualEyelinerDocument,mountManualEyelinerUI} from '../src/manual-eyeliner-ui.mjs';
import {applyManualEyeliner,MANUAL_EYELINER_VERSION} from '../src/processing/manual-eyeliner-line.mjs';
import {syntheticPixels} from './fixtures.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),personID:'33333333-3333-4333-8333-333333333333',
  sourceWidth:200,sourceHeight:100};
const eyes=[{side:'image-left',rect:{x:.1,y:.2,width:.3,height:.5},
  edge:[{u:.15,v:.4},{u:.25,v:.3},{u:.35,v:.4}],
  wing:[{u:.35,v:.4},{u:.37,v:.3}]}];
const settings={color:{r:24,g:19,b:19},opacity:.8,lineRadiusFraction:.012};

test('EYELINER-UI-01: typed manual draft matches actual constant-width renderer without authority claim',()=>{
  const unchanged=structuredClone(eyes);
  const doc=makeManualEyelinerDocument(binding,eyes,settings);
  assert.deepEqual(doc,{schemaVersion:1,engineVersion:MANUAL_EYELINER_VERSION,
    representation:'normalized-continuous-lid-edge-v1',binding,eyeTargets:eyes,settings});
  doc.eyeTargets[0].edge[0].u=.2;
  assert.deepEqual(eyes,unchanged);
  const pixels=syntheticPixels(200,100),before=Uint8ClampedArray.from(pixels.data);
  const result=applyManualEyeliner(pixels,
    makeManualEyelinerDocument(binding,eyes,settings),
    {...binding,savedRevision:2,target:'source'});
  assert.ok(result.data.some((value,index)=>index%4!==3&&value!==before[index]));
  assert.deepEqual(pixels.data,before);
  assert.doesNotMatch(JSON.stringify(doc),/ownerConfirmed|permissionEvidence|evotoStyle|savedRevision/);
});

test('EYELINER-UI-02: eye/wing/setting limits and authority aliases are fail-closed',()=>{
  const create=(b=binding,e=eyes,s=settings)=>makeManualEyelinerDocument(b,e,s);
  for(const bad of [[],[{...eyes[0],edge:[]}],
    [{...eyes[0],wing:[{u:.34,v:.4},{u:.37,v:.3}]}],
    [{...eyes[0],edge:[...eyes[0].edge,{u:.9,v:.4}]}],
    [eyes[0],eyes[0]],
    [{...eyes[0],edge:Array.from({length:129},(_,i)=>({u:.12+i*.001,v:.4}))}]])
    assert.throws(()=>create(binding,bad),/MANUAL_EYELINER_UI_/);
  for(const opacity of [-1,1.1,NaN,Infinity,'0.4',-0])
    assert.throws(()=>create(binding,eyes,{...settings,opacity}),
      /MANUAL_EYELINER_UI_SETTINGS_INVALID/);
  assert.throws(()=>create({...binding,savedRevision:2}),/MANUAL_EYELINER_UI_BINDING_INVALID/);
  assert.throws(()=>create(binding,eyes,{...settings,style:'Smokey'}),
    /MANUAL_EYELINER_UI_SETTINGS_INVALID/);
  assert.throws(()=>create(binding,[{...eyes[0],ownerConfirmed:true}]),
    /MANUAL_EYELINER_UI_EYE_INVALID/);
});

class FakeElement{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag.toUpperCase();
    this.children=[];this.parentElement=null;
    this.style={position:'',touchAction:'',outline:'',outlineOffset:''};
    this.attributes=new Map();this.listeners=new Map();this.dataset={};this._text='';
    this.value='';this.disabled=false;this.complete=false;
    this.naturalWidth=0;this.naturalHeight=0;}
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
function drawLeft(image,c){
  gesture(image,1,[20,70],[80,120]);c.button('瞼線').click();
  gesture(image,2,[30,90]);gesture(image,3,[45,80]);gesture(image,4,[65,90]);
}

test('EYELINER-UI-03: pointer and touch author left/right continuous edges and connected wing',()=>fakeDOM(async({image,root})=>{
  const ui=mountManualEyelinerUI({root,afterImage:image,getContext:()=>context(),enabled:true});
  const c=controls(root);
  assert.equal(c.button('hostへ下書きを渡す').disabled,true);
  drawLeft(image,c);c.button('wing').click();gesture(image,5,[70,80]);
  c.button('画像右眼').click();c.button('眼矩形').click();
  gesture(image,6,[120,70],[180,120],'touch');c.button('瞼線').click();
  gesture(image,7,[130,90],[165,90],'touch');
  const doc=ui.getDocument();
  assert.deepEqual(doc.eyeTargets.map(eye=>eye.side),['image-left','image-right']);
  assert.equal(doc.eyeTargets[0].wing.length,2);
  assert.equal(doc.eyeTargets[1].edge.length,2);
  const before=ui.getDocument();
  gesture(image,8,[40,10]);
  assert.deepEqual(ui.getDocument(),before,'letterbox outside the After image is rejected');
  image.dispatch('pointerdown',{pointerId:9,clientX:140,clientY:80});
  image.dispatch('pointercancel',{pointerId:9});
  assert.deepEqual(ui.getDocument(),before);
  assert.equal(c.button('hostへ下書きを渡す').disabled,true,'no host means no submit');
  ui.dispose();
}));

test('EYELINER-UI-04: keyboard, controls, Undo/Redo and Cancel remain draft-only',()=>fakeDOM(async({image,root})=>{
  const ui=mountManualEyelinerUI({root,afterImage:image,getContext:()=>context(),enabled:true});
  const c=controls(root);
  image.dispatch('keydown',{key:'Enter'});
  for(let i=0;i<10;i++)image.dispatch('keydown',{key:'ArrowRight'});
  for(let i=0;i<10;i++)image.dispatch('keydown',{key:'ArrowDown'});
  image.dispatch('keydown',{key:'Enter'});
  c.button('瞼線').click();
  for(let i=0;i<5;i++)image.dispatch('keydown',{key:'ArrowLeft'});
  for(let i=0;i<5;i++)image.dispatch('keydown',{key:'ArrowUp'});
  image.dispatch('keydown',{key:'Enter'});
  image.dispatch('keydown',{key:'ArrowRight'});image.dispatch('keydown',{key:'Enter'});
  assert.equal(ui.getDocument().eyeTargets[0].edge.length,2);
  const color=c.input('瞼線の色');color.value='#336699';color.dispatch('change');
  const opacity=c.input('瞼線 opacity %');opacity.value='37.5';opacity.dispatch('change');
  const radius=c.input('瞼線半径 %');radius.value='1.5';radius.dispatch('change');
  assert.deepEqual(ui.getDocument().settings,
    {color:{r:51,g:102,b:153},opacity:.375,lineRadiusFraction:.015});
  c.button('戻す').click();assert.equal(ui.getDocument().settings.lineRadiusFraction,.012);
  c.button('やり直す').click();assert.equal(ui.getDocument().settings.lineRadiusFraction,.015);
  c.button('下書きを破棄').click();
  assert.deepEqual(ui.getDraft().eyeTargets,[]);
  assert.throws(()=>ui.getDocument(),/MANUAL_EYELINER_UI_EYES_INVALID/);
  assert.match(c.status().textContent,/未確認/);
  ui.dispose();
}));

test('EYELINER-UI-05: pending host, cancel, stale asset/revision, Before and expiry cannot claim saved',()=>fakeDOM(async({image,root})=>{
  let current=context(),resolve;
  const seen=[];
  const ui=mountManualEyelinerUI({root,afterImage:image,getContext:()=>current,
    enabled:true,onSubmit:(candidate,{signal})=>{
      seen.push({candidate,signal});return new Promise(done=>{resolve=done;});}});
  const c=controls(root);drawLeft(image,c);
  c.button('hostへ下書きを渡す').click();
  assert.equal(seen.length,1);assert.equal(seen[0].signal.aborted,false);
  assert.equal(c.button('瞼線').disabled,true,'no double edits while host is pending');
  c.button('下書きを破棄').click();assert.equal(seen[0].signal.aborted,true);
  resolve({saved:true});await tick();
  assert.deepEqual(ui.getDraft().eyeTargets,[]);
  assert.doesNotMatch(c.status().textContent,/保存しました/);
  gesture(image,10,[20,70],[80,120]);
  current=context({savedRevision:3});ui.refresh();
  assert.deepEqual(ui.getDraft().eyeTargets,[]);
  assert.equal(c.button('hostへ下書きを渡す').disabled,true);
  assert.throws(()=>ui.getDocument(),/MANUAL_EYELINER_UI_AFTER_NOT_READY/);
  ui.dispose();
  const otherRoot=image.ownerDocument.createElement('div');current=context();
  const next=mountManualEyelinerUI({root:otherRoot,afterImage:image,
    getContext:()=>current,enabled:true});
  gesture(image,11,[20,70],[80,120]);current=context({permissionExpired:true});
  next.refresh();assert.deepEqual(next.getDraft().eyeTargets,[]);next.dispose();
  const thirdRoot=image.ownerDocument.createElement('div');current=context();
  const third=mountManualEyelinerUI({root:thirdRoot,afterImage:image,
    getContext:()=>current,enabled:true});
  gesture(image,12,[20,70],[80,120]);current=context({view:'before'});
  third.refresh();assert.equal(controls(thirdRoot).button('瞼線').disabled,true);
  third.dispose();
}));

test('EYELINER-UI-06: browser bundle has keyboard focus, tap size, reduced motion and no dummy styles',async()=>{
  const output=await build({entryPoints:[fileURLToPath(new URL('../src/manual-eyeliner-ui.mjs',
    import.meta.url))],bundle:true,format:'esm',platform:'browser',write:false});
  assert.ok(output.outputFiles[0].contents.length>0);
  const text=new TextDecoder().decode(output.outputFiles[0].contents);
  assert.match(text,/focus-visible/);assert.match(text,/prefers-reduced-motion/);
  assert.match(text,/min-height:\s*44px/);
  assert.doesNotMatch(text,/9スタイル|6デザイン|Evoto同等/);
});
