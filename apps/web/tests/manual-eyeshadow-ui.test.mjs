import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {makeManualEyeshadowDraft,mountManualEyeshadowUI} from '../src/manual-eyeshadow-ui.mjs';
import {MANUAL_EYESHADOW_COLOR_VERSION} from '../src/processing/manual-eyeshadow-color.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),personID:'33333333-3333-4333-8333-333333333333',
  sourceWidth:200,sourceHeight:100};
const shape={operation:'ADD',path:[{u:.4,v:.5}],radiusFraction:.04,hardness:.7};
const strokes={eyeArea:[shape],irisProtect:[{...shape,path:[{u:.42,v:.5}]}],
  pupilProtect:[{...shape,path:[{u:.43,v:.5}]}]};
const settings={color:{r:125,g:78,b:100},opacity:.5};

test('EYESHADOW-UI-01: document is bounded normalized authoring data, not permission or bitmap',()=>{
  const original=structuredClone(strokes);
  const output=makeManualEyeshadowDraft(binding,'image-left',strokes,settings);
  assert.deepEqual(output,{schemaVersion:1,engineVersion:MANUAL_EYESHADOW_COLOR_VERSION,
    representation:'normalized-owner-manual-eye-area-protections-v1',binding,
    eye:'image-left',strokes,settings});
  output.strokes.eyeArea[0].path[0].u=.2;
  assert.deepEqual(strokes,original);
  assert.doesNotMatch(JSON.stringify(output),
    /permissionEvidence|ownerConfirmed|savedRevision|bitmap|evotoStyle/);
});

test('EYESHADOW-UI-02: missing protection roles, out-of-range strokes and false authority fail',()=>{
  const make=(b=binding,eye='image-left',s=strokes,options=settings)=>
    makeManualEyeshadowDraft(b,eye,s,options);
  for(const broken of [{...strokes,irisProtect:[]},
    {...strokes,pupilProtect:[{...shape,operation:'ERASE'}]},
    {...strokes,eyeArea:[{...shape,path:[{u:1.2,v:.5}]}]},
    {...strokes,eyeArea:[{...shape,ownerConfirmed:true}]},
    {...strokes,eyeArea:Array.from({length:65},()=>shape)}])
    assert.throws(()=>make(binding,'image-left',broken),/MANUAL_EYESHADOW_UI_/);
  for(const opacity of [-1,1.1,NaN,Infinity,'0.5',-0])
    assert.throws(()=>make(binding,'image-left',strokes,{...settings,opacity}),
      /MANUAL_EYESHADOW_UI_SETTINGS_INVALID/);
  assert.throws(()=>make({...binding,savedRevision:2}),
    /MANUAL_EYESHADOW_UI_BINDING_INVALID/);
  assert.throws(()=>make(binding,'left'),/MANUAL_EYESHADOW_UI_EYE_INVALID/);
  assert.throws(()=>make(binding,'image-left',strokes,{...settings,style:1}),
    /MANUAL_EYESHADOW_UI_SETTINGS_INVALID/);
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
  dirty:false,busy:false,permissionExpired:false,rotationDegrees:0,...changes});
const gesture=(image,id,start,end=start,type='mouse')=>{
  image.dispatch('pointerdown',{pointerId:id,clientX:start[0],clientY:start[1],pointerType:type});
  image.dispatch('pointermove',{pointerId:id,clientX:end[0],clientY:end[1],pointerType:type});
  image.dispatch('pointerup',{pointerId:id,clientX:end[0],clientY:end[1],pointerType:type});
};

test('EYESHADOW-UI-03: Pointer/Touch/Keyboard draw three distinct roles and keep hostless submission disabled',()=>fakeDOM(async({image,root})=>{
  const ui=mountManualEyeshadowUI({root,afterImage:image,getContext:()=>context(),enabled:true});
  const c=controls(root);
  gesture(image,1,[70,95],[90,100]);
  c.button('虹彩を保護').click();gesture(image,2,[77,95],[84,97],'touch');
  c.button('瞳孔を保護').click();image.dispatch('keydown',{key:'Enter'});
  const draft=ui.getDocument();
  assert.deepEqual(Object.keys(draft.strokes),['eyeArea','irisProtect','pupilProtect']);
  assert.equal(draft.strokes.eyeArea[0].path.length,2);
  assert.equal(draft.strokes.irisProtect[0].path.length,2);
  assert.equal(draft.strokes.pupilProtect[0].path.length,1);
  assert.equal(c.button('hostへ下書きを渡す').disabled,true);
  c.button('画像右眼').click();
  assert.deepEqual(ui.getDraft().strokes,
    {eyeArea:[],irisProtect:[],pupilProtect:[]},
    'the other eye must not inherit the first eye strokes');
  assert.match(c.status().textContent,/破棄/);
  c.button('範囲を消去').click();
  gesture(image,3,[120,95]);assert.equal(ui.getDraft().eye,'image-right');
  assert.equal(ui.getDraft().strokes.pupilProtect.at(-1).operation,'ERASE');
  const before=ui.getDraft();gesture(image,4,[100,10]);
  assert.deepEqual(ui.getDraft(),before,'contain letterbox is not a stroke');
  image.dispatch('pointerdown',{pointerId:5,clientX:100,clientY:100});
  image.dispatch('pointercancel',{pointerId:5});
  assert.deepEqual(ui.getDraft(),before);
  ui.dispose();
}));

test('EYESHADOW-UI-04: color/opacity, Undo/Redo, Cancel and focus remain draft only',()=>fakeDOM(async({image,root})=>{
  const ui=mountManualEyeshadowUI({root,afterImage:image,getContext:()=>context(),enabled:true});
  const c=controls(root);
  gesture(image,1,[70,95]);c.button('虹彩を保護').click();gesture(image,2,[77,95]);
  c.button('瞳孔を保護').click();gesture(image,3,[80,95]);
  const color=c.input('Eyeshadowの色');color.value='#336699';color.dispatch('change');
  const opacity=c.input('Eyeshadow opacity %');opacity.value='37.5';opacity.dispatch('change');
  assert.deepEqual(ui.getDocument().settings,{color:{r:51,g:102,b:153},opacity:.375});
  c.button('戻す').click();assert.equal(ui.getDocument().settings.opacity,.5);
  c.button('やり直す').click();assert.equal(ui.getDocument().settings.opacity,.375);
  image.dispatch('focus');assert.match(image.style.outline,/3px/);
  image.dispatch('keydown',{key:'Escape'});
  c.button('下書きを破棄').click();assert.deepEqual(ui.getDraft().strokes,
    {eyeArea:[],irisProtect:[],pupilProtect:[]});
  assert.throws(()=>ui.getDocument(),/MANUAL_EYESHADOW_UI_ROLE_REQUIRED/);
  assert.match(c.status().textContent,/未確認/);
  ui.dispose();
}));

test('EYESHADOW-UI-05: delayed host, Cancel, Asset/revision and permission changes never claim saved',()=>fakeDOM(async({doc,image,root})=>{
  let current=context(),resolve;
  const calls=[];
  const ui=mountManualEyeshadowUI({root,afterImage:image,getContext:()=>current,
    enabled:true,onSubmit:(draft,{signal})=>{
      calls.push({draft,signal});return new Promise(done=>{resolve=done;});}});
  const c=controls(root);
  gesture(image,1,[70,95]);c.button('虹彩を保護').click();gesture(image,2,[77,95]);
  c.button('瞳孔を保護').click();gesture(image,3,[80,95]);
  assert.equal(c.button('hostへ下書きを渡す').disabled,false);
  c.button('hostへ下書きを渡す').click();assert.equal(calls.length,1);
  c.button('下書きを破棄').click();assert.equal(calls[0].signal.aborted,true);
  resolve({saved:true});await tick();
  assert.deepEqual(ui.getDraft().strokes,{eyeArea:[],irisProtect:[],pupilProtect:[]});
  assert.doesNotMatch(c.status().textContent,/保存しました/);
  gesture(image,4,[70,95]);current=context({savedRevision:3});
  ui.refresh();assert.deepEqual(ui.getDraft().strokes,
    {eyeArea:[],irisProtect:[],pupilProtect:[]});
  assert.equal(c.button('hostへ下書きを渡す').disabled,true);
  ui.dispose();
  const nextRoot=doc.createElement('div');current=context();
  const next=mountManualEyeshadowUI({root:nextRoot,afterImage:image,
    getContext:()=>current,enabled:true});
  gesture(image,5,[70,95]);current=context({permissionExpired:true});
  next.refresh();assert.deepEqual(next.getDraft().strokes,
    {eyeArea:[],irisProtect:[],pupilProtect:[]});
  next.dispose();
  const assetRoot=doc.createElement('div');current=context();
  const assetUI=mountManualEyeshadowUI({root:assetRoot,afterImage:image,
    getContext:()=>current,enabled:true});
  gesture(image,6,[70,95]);current=context({assetID:'22222222-2222-4222-8222-222222222222'});
  assetUI.refresh();assert.deepEqual(assetUI.getDraft().strokes,
    {eyeArea:[],irisProtect:[],pupilProtect:[]});
  assetUI.dispose();
}));

test('EYESHADOW-UI-06: host acknowledgement is not displayed as a verified save',()=>fakeDOM(async({image,root})=>{
  let received;
  const ui=mountManualEyeshadowUI({root,afterImage:image,getContext:()=>context(),
    enabled:true,onSubmit:async draft=>{received=draft;return {saved:true};}});
  const c=controls(root);
  gesture(image,1,[70,95]);c.button('虹彩を保護').click();gesture(image,2,[77,95]);
  c.button('瞳孔を保護').click();gesture(image,3,[80,95]);
  c.button('hostへ下書きを渡す').click();await tick();
  assert.equal(received.eye,'image-left');
  assert.match(c.status().textContent,/実保存.*別途確認/);
  assert.doesNotMatch(c.status().textContent,/保存しました|適用しました/);
  ui.dispose();
}));

test('EYESHADOW-UI-07: browser bundle and accessible non-dummy controls',async()=>{
  const output=await build({entryPoints:[fileURLToPath(new URL('../src/manual-eyeshadow-ui.mjs',
    import.meta.url))],bundle:true,format:'esm',platform:'browser',write:false});
  assert.ok(output.outputFiles[0].contents.length>0);
  const code=new TextDecoder().decode(output.outputFiles[0].contents);
  assert.match(code,/focus-visible/);assert.match(code,/prefers-reduced-motion/);
  assert.match(code,/min-height:\s*44px/);
  assert.doesNotMatch(code,/14スタイル|8スタイル|Evoto同等/);
});
