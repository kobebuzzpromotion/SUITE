import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {makeManualContactsDocument,mountManualContactsUI} from
  '../src/manual-contacts-ui.mjs';

const base={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),personID:'33333333-3333-4333-8333-333333333333',
  sourceWidth:200,sourceHeight:100};
const binding={...base,eye:'left'};
const stroke=(u=.4,v=.5,operation='ADD')=>({operation,path:[{u,v}],
  radiusFraction:.04,hardness:.7});
const settings={color:{r:40,g:90,b:130},amount:.457};

test('CONTACTS-UI-01 typed document keeps ring and pupil separate, not authority or style claims',()=>{
  const ring=stroke(),pupil=stroke(.5,.5),before=structuredClone(ring);
  const output=makeManualContactsDocument(binding,[ring],[pupil],settings);
  assert.deepEqual(output,{schemaVersion:1,
    engineVersion:'suite-srgb8-manual-iris-color-1',binding,
    irisRingStrokes:[ring],pupilExclusionStrokes:[pupil],settings});
  output.irisRingStrokes[0].path[0].u=.2;
  assert.deepEqual(ring,before);
  assert.doesNotMatch(JSON.stringify(output),
    /ownerConfirmed|permissionEvidence|savedRevision|bitmap|authorization|style/u);
});

test('CONTACTS-UI-02 invalid identity, role strokes, amount/color and hostile getters reject',()=>{
  const make=(b=binding,r=[stroke()],p=[stroke(.5,.5)],s=settings)=>
    makeManualContactsDocument(b,r,p,s);
  for(const bad of [[],[stroke(.4,.5,'ERASE')],
    [{...stroke(),radiusFraction:.3}],[stroke(1.1,.5)],
    Array.from({length:65},()=>stroke())])
    assert.throws(()=>make(binding,bad),/MANUAL_CONTACTS_UI_/u);
  assert.throws(()=>make(binding,[stroke()],[]),/MANUAL_CONTACTS_UI_PUPIL/u);
  for(const amount of [-1,1.1,-0,NaN,Infinity,'0.5'])
    assert.throws(()=>make(binding,[stroke()],[stroke()],{...settings,amount}),
      /MANUAL_CONTACTS_UI_SETTINGS_INVALID/u);
  assert.throws(()=>make({...binding,eye:'both'}),/MANUAL_CONTACTS_UI_BINDING_INVALID/u);
  assert.throws(()=>make(binding,[stroke()],[stroke()],
    {...settings,style:1}),/MANUAL_CONTACTS_UI_SETTINGS_INVALID/u);
  const getter={...settings};
  Object.defineProperty(getter,'color',{get(){throw Error('getter ran');}});
  assert.throws(()=>make(binding,[stroke()],[stroke()],getter),
    /MANUAL_CONTACTS_UI_SETTINGS_INVALID/u);
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
    for(const handler of this.listeners.get(type)??[])handler(event);return event;}
  click(){if(!this.disabled)this.dispatch('click');}
  getBoundingClientRect(){return {left:0,top:0,width:200,height:200,right:200,bottom:200};}
  hasPointerCapture(){return false;}
  setPointerCapture(){}releasePointerCapture(){}
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
  const all=[];const visit=item=>{all.push(item);item.children.forEach(visit);};visit(root);
  return {button:text=>all.find(item=>item.tagName==='BUTTON'&&item.textContent===text),
    input:label=>all.find(item=>item.tagName==='INPUT'&&
      item.getAttribute('aria-label')===label),
    status:()=>all.find(item=>item.getAttribute('role')==='status')};
}
async function withFakeDOM(run){
  const previous={HTMLElement:globalThis.HTMLElement,
    HTMLImageElement:globalThis.HTMLImageElement,
    getComputedStyle:globalThis.getComputedStyle};
  globalThis.HTMLElement=FakeElement;globalThis.HTMLImageElement=FakeImage;
  globalThis.getComputedStyle=()=>({position:'relative'});
  try{const doc=new FakeDocument(),parent=doc.createElement('div');
    const image=new FakeImage(doc);parent.append(image);
    const root=doc.createElement('div');await run({doc,parent,image,root});}
  finally{for(const [key,value] of Object.entries(previous)){
    if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
}
const nextTick=()=>new Promise(resolve=>setTimeout(resolve,0));
const context=()=>({...base,eye:'left',savedRevision:3,rotationDegrees:0,
  view:'after',ready:true,dirty:false,busy:false,permissionExpired:false});
const paint=(image,id,x=100,y=100,pointerType='mouse')=>{
  image.dispatch('pointerdown',{pointerId:id,clientX:x,clientY:y,pointerType});
  image.dispatch('pointerup',{pointerId:id,clientX:x,clientY:y,pointerType});
};

test('CONTACTS-UI-03 Pointer/Touch/Keyboard, eye/role, Undo/Redo and settings stay local',()=>withFakeDOM(async({image,root})=>{
  const ui=mountManualContactsUI({root,afterImage:image,getContext:context,enabled:true});
  const c=controls(root);
  assert.equal(c.button('hostへ下書きを渡す').disabled,true);
  paint(image,1);assert.equal(ui.getDraft().eyes.left.ring.length,1);
  c.button('瞳孔除外').click();paint(image,2,110,100,'touch');
  assert.equal(ui.getDraft().eyes.left.pupil.length,1);
  image.dispatch('keydown',{key:'ArrowRight'});
  image.dispatch('keydown',{key:'Enter'});
  assert.equal(ui.getDraft().eyes.left.pupil.length,2);
  c.button('右眼').click();c.button('虹彩ring').click();paint(image,3,120,100);
  assert.equal(ui.getDraft().eyes.right.ring.length,1);
  assert.equal(ui.getDraft().eyes.left.ring.length,1);
  c.button('戻す').click();assert.equal(ui.getDraft().eyes.right.ring.length,0);
  c.button('やり直す').click();assert.equal(ui.getDraft().eyes.right.ring.length,1);
  const color=c.input('虹彩の色');color.value='#336699';color.dispatch('change');
  const amount=c.input('Contacts Amount %');amount.value='25.5';amount.dispatch('change');
  assert.equal(ui.getDraft().color,'#336699');
  assert.equal(ui.getDraft().amount,.255);
  c.button('左眼').click();
  const result=ui.getDocument();
  assert.equal(result.binding.eye,'left');
  assert.equal(result.irisRingStrokes.length,1);
  assert.equal(result.pupilExclusionStrokes.length,2);
  assert.equal(result.settings.amount,.255);
  assert.equal(c.button('hostへ下書きを渡す').disabled,true,'no host is not a save path');
  ui.dispose();
}));

test('CONTACTS-UI-04 After-only, letterbox, Cancel, Asset/revision/permission changes fail closed',()=>withFakeDOM(async({image,root})=>{
  let current=context();
  const ui=mountManualContactsUI({root,afterImage:image,
    getContext:()=>current,enabled:true});
  const c=controls(root);paint(image,1);
  const count=ui.getDraft().eyes.left.ring.length;
  paint(image,2,100,5);
  assert.equal(ui.getDraft().eyes.left.ring.length,count);
  image.dispatch('pointerdown',{pointerId:3});image.dispatch('pointercancel',{pointerId:3});
  assert.equal(ui.getDraft().eyes.left.ring.length,count);
  c.button('下書きを破棄').click();
  assert.equal(ui.getDraft().eyes.left.ring.length,0);
  paint(image,4);current={...current,view:'before'};ui.refresh();
  assert.equal(c.button('虹彩ring').disabled,true);
  current={...current,view:'after',savedRevision:4};ui.refresh();
  assert.equal(ui.getDraft().eyes.left.ring.length,0);
  assert.equal(c.button('虹彩ring').disabled,true);
  ui.dispose();
}));

test('CONTACTS-UI-05 host verify/submit are separate; failure, cancel and stale response never say saved',()=>withFakeDOM(async({image,root})=>{
  let resolveSubmit,verifyCount=0,submitCount=0,current=context();
  const host={verifyFresh:async()=>{verifyCount++;return {status:'verified',
    binding,savedRevision:3};},
    submitDraft:()=>{submitCount++;return new Promise(resolve=>{resolveSubmit=resolve;});}};
  const ui=mountManualContactsUI({root,afterImage:image,
    getContext:()=>current,host,enabled:true});
  const c=controls(root);paint(image,1);c.button('瞳孔除外').click();paint(image,2,110,100);
  assert.equal(c.button('hostへ下書きを渡す').disabled,false);
  c.button('hostへ下書きを渡す').click();await nextTick();
  assert.equal(verifyCount,1);assert.equal(submitCount,1);
  c.button('下書きを破棄').click();resolveSubmit({saved:true});await nextTick();
  assert.doesNotMatch(c.status().textContent,/保存しました/u);
  assert.equal(ui.getDraft().eyes.left.ring.length,0);
  paint(image,3);c.button('瞳孔除外').click();paint(image,4,110,100);
  current={...current,permissionExpired:true};ui.refresh();
  assert.equal(c.button('hostへ下書きを渡す').disabled,true);
  assert.equal(ui.getDraft().eyes.left.ring.length,0);
  ui.dispose();
}));

test('CONTACTS-UI-06 ambiguous host verification cannot submit a draft',()=>withFakeDOM(async({image,root})=>{
  let calls=0;
  const host={verifyFresh:async()=>({status:'verified',binding:{...binding,
    personID:'44444444-4444-4444-8444-444444444444'},savedRevision:3}),
    submitDraft:async()=>{calls++;}};
  const ui=mountManualContactsUI({root,afterImage:image,getContext:context,
    host,enabled:true});
  const c=controls(root);paint(image,1);c.button('瞳孔除外').click();paint(image,2,110,100);
  c.button('hostへ下書きを渡す').click();await nextTick();
  assert.equal(calls,0);
  assert.match(c.status().textContent,/未確認/u);
  ui.dispose();
}));

test('CONTACTS-UI-07 standalone bundle, focus/reduced-motion and 390px layout rules exist',async()=>{
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/manual-contacts-ui.mjs',
    import.meta.url))],bundle:true,format:'esm',platform:'browser',target:'es2022',
    write:false,logLevel:'silent'});
  const text=bundle.outputFiles[0].text;
  assert.match(text,/prefers-reduced-motion/u);
  assert.match(text,/focus-visible/u);
  assert.match(text,/max-width:390px/u);
  assert.match(text,/min-height:44px/u);
});
