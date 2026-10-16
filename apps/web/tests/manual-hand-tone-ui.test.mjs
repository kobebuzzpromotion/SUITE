import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {makeManualHandToneDocument,mountManualHandToneUI} from
  '../src/manual-hand-tone-ui.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),sourceWidth:200,sourceHeight:100};
const stroke={operation:'ADD',path:[{u:.4,v:.5}],radiusFraction:.04,hardness:.7};
const settings={strength:.5,radiusSourcePixels:3};

test('HAND-UI-01 typed draft matches backend stroke document without authority or region claims',()=>{
  const before=structuredClone(stroke);
  const output=makeManualHandToneDocument(binding,[stroke],settings);
  assert.deepEqual(output,{schemaVersion:1,
    engineVersion:'suite-srgb8-owner-manual-hand-tone-1',binding,
    handStrokes:[stroke],settings});
  output.handStrokes[0].path[0].u=.2;
  assert.deepEqual(stroke,before);
  assert.doesNotMatch(JSON.stringify(output),
    /ownerConfirmed|permissionEvidence|savedRevision|region|bitmap|authorization/);
});

test('HAND-UI-02 bound size, stroke capacity, no-add, aliases and invalid settings fail closed',()=>{
  const create=(b=binding,s=[stroke],value=settings)=>
    makeManualHandToneDocument(b,s,value);
  for(const bad of [[],[{...stroke,operation:'ERASE'}],
    Array.from({length:65},()=>stroke),[{...stroke,region:'hand'}],
    [{...stroke,radiusFraction:.3}],[{...stroke,path:[{u:1.1,v:.5}]}]])
    assert.throws(()=>create(binding,bad),/MANUAL_HAND_UI_/);
  for(const value of [-1,1.1,-0,NaN,Infinity,'0.5'])
    assert.throws(()=>create(binding,[stroke],{...settings,strength:value}),
      /MANUAL_HAND_UI_SETTINGS_INVALID/);
  for(const value of [0,7,2.5,'3'])
    assert.throws(()=>create(binding,[stroke],{...settings,radiusSourcePixels:value}),
      /MANUAL_HAND_UI_SETTINGS_INVALID/);
  assert.throws(()=>create({...binding,savedRevision:3}),
    /MANUAL_HAND_UI_BINDING_INVALID/);
  assert.throws(()=>create(binding,[stroke],{...settings,ownerConfirmed:true}),
    /MANUAL_HAND_UI_SETTINGS_INVALID/);
});

class FakeElement{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag.toUpperCase();
    this.children=[];this.parentElement=null;this.style={};this.attributes=new Map();
    this.listeners=new Map();this.dataset={};this._text='';this.value='';
    this.disabled=false;this.complete=false;this.naturalWidth=0;this.naturalHeight=0;}
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
  dispatch(type,fields={}){const event={type,pointerId:1,pointerType:'mouse',
    button:0,isPrimary:true,clientX:100,clientY:100,key:'',
    preventDefault(){this.defaultPrevented=true;},...fields};
    for(const handler of this.listeners.get(type)??[])handler(event);
    return event;}
  click(){if(!this.disabled)this.dispatch('click');}
  getBoundingClientRect(){return {left:0,top:0,width:200,height:200,right:200,bottom:200};}
  hasPointerCapture(){return false;}
  setPointerCapture(){}
  releasePointerCapture(){}
}
class FakeImage extends FakeElement{
  constructor(doc){super(doc,'img');this.complete=true;this.naturalWidth=200;
    this.naturalHeight=100;}
}
class FakeDocument{
  createElement(tag){return new FakeElement(this,tag);}
  createElementNS(_uri,tag){return new FakeElement(this,tag);}
}
function controls(root){
  const all=[];const visit=element=>{all.push(element);element.children.forEach(visit);};
  visit(root);
  return {button:text=>all.find(element=>element.tagName==='BUTTON'&&
      element.textContent===text),
    input:label=>all.find(element=>element.tagName==='INPUT'&&
      element.getAttribute('aria-label')===label),
    status:()=>all.find(element=>element.getAttribute('role')==='status')};
}
async function withFakeDOM(run){
  const previous={HTMLElement:globalThis.HTMLElement,
    HTMLImageElement:globalThis.HTMLImageElement,
    getComputedStyle:globalThis.getComputedStyle};
  globalThis.HTMLElement=FakeElement;globalThis.HTMLImageElement=FakeImage;
  globalThis.getComputedStyle=()=>({position:'relative'});
  try{const doc=new FakeDocument(),host=doc.createElement('div');
    const image=new FakeImage(doc);host.append(image);
    const root=doc.createElement('div');await run({doc,host,image,root});}
  finally{for(const [key,value] of Object.entries(previous)){
    if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
}
const nextTick=()=>new Promise(resolve=>setTimeout(resolve,0));
const context=()=>({...binding,savedRevision:3,rotationDegrees:0,
  view:'after',ready:true,dirty:false,busy:false,permissionExpired:false});

test('HAND-UI-03 hand/forearm Pointer Touch Keyboard, settings, Undo/Redo and Cancel stay draft-only',()=>withFakeDOM(async({image,root})=>{
  const ui=mountManualHandToneUI({root,afterImage:image,getContext:context,enabled:true});
  const control=controls(root),at=(id,x=100,y=100,pointerType='mouse')=>{
    image.dispatch('pointerdown',{pointerId:id,clientX:x,clientY:y,pointerType});
    image.dispatch('pointerup',{pointerId:id,clientX:x,clientY:y,pointerType});
  };
  assert.equal(control.button('認証hostへ下書きを渡す').disabled,true);
  at(1);assert.equal(ui.getDraft().entries[0].region,'hand');
  control.button('前腕を描く').click();at(2,120,100,'touch');
  assert.equal(ui.getDraft().entries[1].region,'forearm');
  image.dispatch('keydown',{key:'ArrowRight'});image.dispatch('keydown',{key:'Enter'});
  assert.equal(ui.getDraft().entries.length,3);
  control.button('範囲を消去').click();at(3,125,100);
  assert.equal(ui.getDraft().entries.at(-1).stroke.operation,'ERASE');
  const count=ui.getDraft().entries.length;
  at(4,100,5);assert.equal(ui.getDraft().entries.length,count);
  image.dispatch('pointerdown',{pointerId:5});image.dispatch('pointercancel',{pointerId:5});
  assert.equal(ui.getDraft().entries.length,count);
  const strength=control.input('手の均一化 Strength %');
  strength.value='37.5';strength.dispatch('change');
  const radius=control.input('均一化 Radius 原寸px');
  radius.value='6';radius.dispatch('change');
  assert.deepEqual(ui.getDocument().settings,{strength:.375,radiusSourcePixels:6});
  control.button('戻す').click();assert.equal(ui.getDocument().settings.radiusSourcePixels,3);
  control.button('やり直す').click();
  assert.equal(ui.getDocument().settings.radiusSourcePixels,6);
  assert.equal(ui.getDocument().handStrokes.length,4);
  assert.equal(ui.getDocument().handStrokes.some(item=>'region'in item),false);
  control.button('下書きを破棄').click();
  assert.equal(ui.getDraft().entries.length,0);
  assert.match(control.status().textContent,/未確認/);
  ui.dispose();
}));

test('HAND-UI-04 host callback cannot claim saved; cancel aborts and stale Asset/revision invalidates',()=>withFakeDOM(async({image,root})=>{
  let assetID=binding.assetID,revision=3,resolveLater,signal;
  const getContext=()=>({...context(),assetID,savedRevision:revision});
  const ui=mountManualHandToneUI({root,afterImage:image,getContext,enabled:true,
    onSubmit:(_document,options)=>{signal=options.signal;
      return new Promise(resolve=>{resolveLater=resolve;});}});
  const control=controls(root);
  image.dispatch('pointerdown');image.dispatch('pointerup');
  control.button('認証hostへ下書きを渡す').click();await nextTick();
  assert.equal(control.button('認証hostへ下書きを渡す').disabled,true);
  control.button('下書きを破棄').click();
  assert.equal(signal.aborted,true);
  resolveLater({saved:true});await nextTick();
  assert.doesNotMatch(control.status().textContent,/保存しました/);
  image.dispatch('pointerdown');image.dispatch('pointerup');
  control.button('認証hostへ下書きを渡す').click();await nextTick();
  assetID='22222222-2222-4222-8222-222222222222';ui.refresh();
  assert.equal(signal.aborted,true);
  assert.equal(ui.getDraft().entries.length,0);
  resolveLater({saved:true});await nextTick();
  assert.equal(control.button('認証hostへ下書きを渡す').disabled,true);
  assert.throws(()=>ui.getDocument(),/AFTER_NOT_READY/);
  revision=4;ui.refresh();assert.equal(ui.getDraft().entries.length,0);
  ui.dispose();
}));

test('HAND-UI-05 Before, permission expiry and absent fresh host disable submission',()=>withFakeDOM(async({doc,image,root})=>{
  let view='after',expired=false;
  const getContext=()=>({...context(),view,permissionExpired:expired});
  const ui=mountManualHandToneUI({root,afterImage:image,getContext,enabled:true,
    onSubmit:()=>Promise.resolve({saved:true})});
  const control=controls(root);
  image.dispatch('pointerdown');image.dispatch('pointerup');
  view='before';ui.refresh();
  assert.equal(control.button('認証hostへ下書きを渡す').disabled,true);
  view='after';expired=true;ui.refresh();
  assert.equal(ui.getDraft().entries.length,0);
  assert.equal(control.button('認証hostへ下書きを渡す').disabled,true);
  ui.dispose();
  const host=doc.createElement('div'),image2=new FakeImage(doc),root2=doc.createElement('div');
  host.append(image2);view='after';expired=false;
  const noHost=mountManualHandToneUI({root:root2,afterImage:image2,getContext,
    enabled:true});
  image2.dispatch('pointerdown');image2.dispatch('pointerup');
  assert.equal(controls(root2).button('認証hostへ下書きを渡す').disabled,true);
  noHost.dispose();
}));

test('HAND-UI-06 browser bundle of standalone component builds without product mount',async()=>{
  const entry=fileURLToPath(new URL('../src/manual-hand-tone-ui.mjs',import.meta.url));
  const result=await build({entryPoints:[entry],bundle:true,write:false,
    platform:'browser',format:'esm'});
  assert.ok(result.outputFiles[0].contents.length>0);
});
