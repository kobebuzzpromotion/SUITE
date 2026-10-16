import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {makeManualClothingSpotDocument,mountManualClothingSpotUI} from
  '../src/manual-clothing-spot-ui.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),sourceWidth:200,sourceHeight:100};
const target={x:.1,y:.2,width:.2,height:.2};
const reference={x:.6,y:.2,width:.2,height:.2};
const stroke={operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.2,hardness:1};

test('CLOTHING-UI-01: typed normalized target/reference and local strokes omit authority, bitmap and saved revision',()=>{
  const old=structuredClone(stroke);
  const document=makeManualClothingSpotDocument(binding,target,reference,[stroke]);
  assert.deepEqual(document,{schemaVersion:1,
    engineVersion:'suite-srgb8-manual-clothing-spot-1',binding,
    targetRect:target,referenceRect:reference,targetStrokes:[stroke]});
  document.targetStrokes[0].path[0].u=.3;
  assert.deepEqual(stroke,old);
  assert.doesNotMatch(JSON.stringify(document),
    /savedRevision|ownerConfirmed|permissionEvidence|bitmap|authorization/);
});

test('CLOTHING-UI-02: invalid region, extra claims, malicious getters and empty/oversize strokes reject',()=>{
  const make=(b=binding,t=target,r=reference,s=[stroke])=>
    makeManualClothingSpotDocument(b,t,r,s);
  for(const bad of [{...target,width:.3},{...target,x:.95},
    {...target,width:.001},{...target,width:1.3},{...target,bitmap:[]},
    {...target,x:NaN}])assert.throws(()=>make(binding,bad),/MANUAL_CLOTHING_UI_/);
  assert.throws(()=>make(binding,target,{...reference,x:.15}),
    /MANUAL_CLOTHING_UI_REGIONS_INVALID/);
  assert.throws(()=>make({...binding,savedRevision:3}),
    /MANUAL_CLOTHING_UI_BINDING_INVALID/);
  for(const bad of [[],[{...stroke,operation:'ERASE'}],
    Array.from({length:65},()=>stroke),
    [{...stroke,path:[{u:1.1,v:.5}]}],
    [{...stroke,side:'clothing'}]])
    assert.throws(()=>make(binding,target,reference,bad),/MANUAL_CLOTHING_UI_/);
  const getter={...target};let reads=0;
  Object.defineProperty(getter,'x',{get(){reads++;throw Error('unsafe getter');}});
  assert.throws(()=>make(binding,getter),/MANUAL_CLOTHING_UI_RECT_INVALID/);
  assert.equal(reads,0);
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
    button:0,isPrimary:true,clientX:100,clientY:100,key:'',shiftKey:false,
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
  const all=[];const visit=node=>{all.push(node);node.children.forEach(visit);};visit(root);
  return {button:text=>all.find(node=>node.tagName==='BUTTON'&&node.textContent===text),
    status:()=>all.find(node=>node.getAttribute('role')==='status'),
    input:label=>all.find(node=>node.tagName==='INPUT'&&
      node.getAttribute('aria-label')===label)};
}
async function withFakeDOM(run){
  const previous={HTMLElement:globalThis.HTMLElement,
    HTMLImageElement:globalThis.HTMLImageElement,
    getComputedStyle:globalThis.getComputedStyle};
  globalThis.HTMLElement=FakeElement;globalThis.HTMLImageElement=FakeImage;
  globalThis.getComputedStyle=()=>({position:'relative'});
  try{const doc=new FakeDocument(),host=doc.createElement('div');
    const image=new FakeImage(doc);host.append(image);
    const root=doc.createElement('div');await run({doc,host,image,root});
  }finally{for(const [key,value] of Object.entries(previous)){
    if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }}
}
const context=(changes={})=>({...binding,savedRevision:3,uprightWidth:200,
  uprightHeight:100,rotationDegrees:0,view:'after',ready:true,dirty:false,
  busy:false,permissionExpired:false,...changes});
function pointer(image,id,x,y,type='mouse',endX=x,endY=y){
  image.dispatch('pointerdown',{pointerId:id,clientX:x,clientY:y,pointerType:type});
  image.dispatch('pointerup',{pointerId:id,clientX:endX,clientY:endY,pointerType:type});
}
function threeSteps(image,control){
  pointer(image,1,20,70,'mouse',60,90);
  control.button('参照位置を指定').click();pointer(image,2,140,80,'touch');
  control.button('範囲を追加').click();pointer(image,3,40,80);
}

test('CLOTHING-UI-03: Pointer/Touch authoring, Undo/Redo, contain rejection and Cancel stay local',()=>withFakeDOM(async({image,root})=>{
  const ui=mountManualClothingSpotUI({root,afterImage:image,getContext:context,enabled:true});
  const control=controls(root);
  assert.equal(control.button('hostへ下書きを渡す').disabled,true);
  threeSteps(image,control);
  const draft=ui.getDraft(),doc=ui.getDocument();
  assert.ok(draft.targetRect);assert.ok(draft.referenceRect);
  assert.equal(doc.targetStrokes[0].operation,'ADD');
  assert.ok(Math.abs(doc.targetStrokes[0].path[0].u-.5)<1e-9);
  assert.equal(control.button('hostへ下書きを渡す').disabled,true,'no host callback');
  control.button('範囲を消去').click();pointer(image,4,42,80,'touch');
  assert.equal(ui.getDraft().targetStrokes.at(-1).operation,'ERASE');
  control.button('戻す').click();assert.equal(ui.getDraft().targetStrokes.length,1);
  control.button('やり直す').click();assert.equal(ui.getDraft().targetStrokes.length,2);
  const before=ui.getDraft().targetStrokes.length;
  pointer(image,5,40,5);assert.equal(ui.getDraft().targetStrokes.length,before,
    'contain letterbox is not part of After pixels');
  image.dispatch('pointerdown',{pointerId:6,clientX:40,clientY:80});
  image.dispatch('pointercancel',{pointerId:6,clientX:40,clientY:80});
  assert.equal(ui.getDraft().targetStrokes.length,before);
  control.button('下書きを破棄').click();
  assert.equal(ui.getDraft().targetRect,null);
  assert.equal(ui.getDraft().referenceRect,null);
  assert.equal(ui.getDraft().targetStrokes.length,0);
  ui.dispose();
}));

test('CLOTHING-UI-04: keyboard target rectangle, reference and brush have focusable alternative',()=>withFakeDOM(async({image,root})=>{
  const ui=mountManualClothingSpotUI({root,afterImage:image,getContext:context,enabled:true});
  const control=controls(root);
  assert.equal(image.getAttribute('role'),'button');
  image.dispatch('keydown',{key:'Enter'});
  for(let i=0;i<4;i++)image.dispatch('keydown',{key:'ArrowRight'});
  for(let i=0;i<8;i++)image.dispatch('keydown',{key:'ArrowDown'});
  image.dispatch('keydown',{key:'Enter'});
  assert.ok(ui.getDraft().targetRect);
  control.button('参照位置を指定').click();
  for(let i=0;i<30;i++)image.dispatch('keydown',{key:'ArrowLeft'});
  image.dispatch('keydown',{key:'Enter'});
  assert.ok(ui.getDraft().referenceRect);
  control.button('範囲を追加').click();
  for(let i=0;i<30;i++)image.dispatch('keydown',{key:'ArrowRight'});
  image.dispatch('keydown',{key:'Enter'});
  assert.equal(ui.getDraft().targetStrokes.length,1);
  assert.doesNotThrow(()=>ui.getDocument());
  image.dispatch('keydown',{key:'Escape'});
  assert.equal(ui.getDraft().targetStrokes.length,1,'Escape cancels active gesture only');
  ui.dispose();
  assert.equal(image.getAttribute('role'),null);
}));

test('CLOTHING-UI-05: host callback never claims saved; cancel, stale Asset and permission change discard pending draft',()=>withFakeDOM(async({image,root})=>{
  let current=context(),resolve,submitted=0,aborted=false;
  const onSubmit=(_document,{signal})=>{
    submitted++;signal.addEventListener('abort',()=>{aborted=true;});
    return new Promise(done=>{resolve=done;});
  };
  const ui=mountManualClothingSpotUI({root,afterImage:image,
    getContext:()=>current,onSubmit,enabled:true});
  const control=controls(root);threeSteps(image,control);
  control.button('hostへ下書きを渡す').click();
  assert.equal(submitted,1);
  assert.match(control.status().textContent,/未確認/);
  control.button('下書きを破棄').click();assert.equal(aborted,true);
  resolve({status:'saved'});await new Promise(done=>setTimeout(done,0));
  assert.match(control.status().textContent,/未確認/);
  assert.equal(ui.getDraft().targetRect,null);
  threeSteps(image,control);
  current=context({assetID:'22222222-2222-4222-8222-222222222222'});
  ui.refresh();assert.equal(ui.getDraft().targetRect,null);
  assert.equal(control.button('hostへ下書きを渡す').disabled,true);
  ui.dispose();
}));

test('CLOTHING-UI-06: dirty/Before/permission loss disables tools; 390px, focus and reduced-motion rules bundle',async()=>{
  await withFakeDOM(async({image,root})=>{
    let current=context({view:'before'});
    const ui=mountManualClothingSpotUI({root,afterImage:image,
      getContext:()=>current,onSubmit:async()=>{},enabled:true});
    const control=controls(root);
    assert.equal(control.button('対象領域を指定').disabled,true);
    current=context({dirty:true});ui.refresh();
    assert.equal(control.button('対象領域を指定').disabled,true);
    current=context();ui.refresh();
    assert.equal(control.button('対象領域を指定').disabled,false);
    image.dispatch('focus');assert.match(image.style.outline,/3px/);
    current=context({permissionExpired:true});ui.refresh();
    assert.equal(control.button('対象領域を指定').disabled,true);
    ui.dispose();
  });
  const bundle=await build({entryPoints:[fileURLToPath(new URL(
    '../src/manual-clothing-spot-ui.mjs',import.meta.url))],bundle:true,
    format:'iife',platform:'browser',target:'es2022',write:false,logLevel:'silent'});
  const code=bundle.outputFiles[0].text;
  assert.match(code,/@media\(max-width:600px\)/);
  assert.match(code, /prefers-reduced-motion:reduce/);
  assert.match(code, /min-height:44px/);
  assert.match(code, /focus-visible/);
});
