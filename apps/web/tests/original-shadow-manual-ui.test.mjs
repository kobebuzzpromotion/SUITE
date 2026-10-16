import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {makeOriginalShadowManualDocument,
  mountOriginalShadowManualUI} from '../src/original-shadow-manual-ui.mjs';

const ASSET='bc410d09-6a70-4225-97ad-82aee7a690a8';
const BACKDROP='e51be62f-7d98-493b-943e-d0b3146b74fb';
const SHA='a'.repeat(64),BACKDROP_SHA='b'.repeat(64);
const binding={assetID:ASSET,originalSHA256:SHA,sourceWidth:100,sourceHeight:100,
  backdropID:BACKDROP,backdropSHA256:BACKDROP_SHA};
const stroke=(u,v,operation='ADD')=>({operation,path:[{u,v}],
  radiusFraction:.04,hardness:.7});
const sleep=()=>new Promise(resolve=>setTimeout(resolve,0));

test('ORIGINAL-SHADOW-UI-01: detached typed two-layer document is bounded and never persists revision/auth evidence',()=>{
  const source=[stroke(.25,.5)],shadow=[stroke(.75,.5)];
  const result=makeOriginalShadowManualDocument(binding,source,shadow,{opacity:60});
  assert.equal(result.schemaVersion,1);
  assert.equal(result.subjectStrokes[0].path[0].u,.25);
  assert.equal(result.shadowStrokes[0].path[0].u,.75);
  assert.equal(result.settings.opacity,60);
  source[0].path[0].u=.9;shadow[0].path[0].u=.1;
  assert.equal(result.subjectStrokes[0].path[0].u,.25);
  assert.equal(result.shadowStrokes[0].path[0].u,.75);
  assert.doesNotMatch(JSON.stringify(result),
    /savedRevision|authorized|ownerConfirmed|permissionEvidence|maskBitmap/);
  assert.throws(()=>makeOriginalShadowManualDocument(binding,[stroke(.2,.5)],[],
    {opacity:60}),/STROKES_INVALID/);
  assert.throws(()=>makeOriginalShadowManualDocument(binding,[stroke(.2,.5)],
    [stroke(.75,.5,'ERASE')],{opacity:60}),/ADD_REQUIRED/);
  assert.throws(()=>makeOriginalShadowManualDocument(binding,[stroke(.2,.5)],
    [stroke(.75,.5)],{opacity:101}),/SETTINGS_INVALID/);
  assert.throws(()=>makeOriginalShadowManualDocument({...binding,
    assetID:BACKDROP},[stroke(.2,.5)],[stroke(.75,.5)],{opacity:60}),
  /BINDING_INVALID/);
  const accessor={...binding};
  Object.defineProperty(accessor,'assetID',{enumerable:true,
    get(){return ASSET;}});
  assert.throws(()=>makeOriginalShadowManualDocument(accessor,
    [stroke(.2,.5)],[stroke(.75,.5)],{opacity:60}),/BINDING_INVALID/);
});

class FakeNode{
  constructor(doc,tag){
    this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.children=[];
    this.parentElement=null;this.attributes=new Map();this.listeners=new Map();
    this.style={position:'',pointerEvents:'',overflow:'',touchAction:'',outline:'',
      outlineOffset:''};this.dataset={};this.textContent='';this.value='';
    this.disabled=false;this.className='';this.tabIndex=-1;
  }
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
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
    signal?.addEventListener('abort',()=>{
      this.listeners.set(type,(this.listeners.get(type)??[]).filter(item=>item!==listener));
    },{once:true});
  }
  dispatch(type,details={}){
    const event={type,preventDefault(){this.defaultPrevented=true;},
      isPrimary:true,pointerType:'mouse',button:0,pointerId:1,...details};
    for(const listener of [...(this.listeners.get(type)??[])])listener(event);
    return event;
  }
  click(){if(!this.disabled)this.dispatch('click');}
  focus(){this.ownerDocument.activeElement=this;this.dispatch('focus');}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
}
class FakeImage extends FakeNode{
  constructor(doc){super(doc,'img');this.complete=true;
    this.naturalWidth=100;this.naturalHeight=100;}
  setPointerCapture(){}
  hasPointerCapture(){return false;}
}
class FakeDocument{
  constructor(){this.activeElement=null;}
  createElement(tag){return new FakeNode(this,tag);}
  createElementNS(_namespace,tag){return new FakeNode(this,tag);}
}
function dom(){
  const prior={HTMLElement:globalThis.HTMLElement,
    HTMLImageElement:globalThis.HTMLImageElement,
    ResizeObserver:globalThis.ResizeObserver,
    getComputedStyle:globalThis.getComputedStyle};
  globalThis.HTMLElement=FakeNode;globalThis.HTMLImageElement=FakeImage;
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.getComputedStyle=()=>({position:'static'});
  const document=new FakeDocument(),root=new FakeNode(document,'div'),
    host=new FakeNode(document,'div'),image=new FakeImage(document);
  host.append(image);
  return {root,host,image,document,restore(){
    for(const [key,value] of Object.entries(prior)){
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }};
}
function find(root,action){
  const queue=[root];
  while(queue.length){const node=queue.shift();
    if(node.dataset.originalShadowAction===action)return node;
    queue.push(...node.children);
  }
  throw Error(`ACTION_MISSING_${action}`);
}
function control(root,label){
  const queue=[root];
  while(queue.length){const node=queue.shift();
    if(node.getAttribute('aria-label')===label)return node;
    queue.push(...node.children);
  }
  throw Error(`CONTROL_MISSING_${label}`);
}
function context(){return {target:{id:ASSET,sha256:SHA,sourceWidth:100,
  sourceHeight:100,savedRevision:2},backdrop:{id:BACKDROP,sha256:BACKDROP_SHA},
  view:'after',ready:true,dirty:false,busy:false,permissionExpired:false,
  rotationDegrees:0};}
const draw=(image,x,y,pointerType='mouse',id=1)=>{
  image.dispatch('pointerdown',{pointerId:id,pointerType,clientX:x,clientY:y});
  image.dispatch('pointerup',{pointerId:id,pointerType,clientX:x,clientY:y});
};

test('ORIGINAL-SHADOW-UI-02: pointer/touch/keyboard keep subject and shadow separate; Undo/Redo/Opacity/cancel',()=>{
  const d=dom();let current=context();const requests=[];
  try{
    const ui=mountOriginalShadowManualUI({root:d.root,afterImage:d.image,
      enabled:true,getContext:()=>current,
      onApply:(document,options)=>{requests.push({document,options});
        return {accepted:true};}});
    assert.equal(find(d.root,'submit').disabled,true);
    draw(d.image,25,50);
    assert.equal(ui.getDraft().subjectStrokes.length,1);
    d.image.dispatch('pointerdown',{pointerId:80,pointerType:'touch',
      clientX:30,clientY:50});
    d.image.dispatch('pointercancel',{pointerId:80,pointerType:'touch',
      clientX:30,clientY:50});
    draw(d.image,110,50,'mouse',81);
    assert.equal(ui.getDraft().subjectStrokes.length,1);
    const select=control(d.root,'範囲の層');select.value='shadow';
    select.dispatch('change');draw(d.image,75,50,'touch',2);
    assert.equal(ui.getDraft().shadowStrokes.length,1);
    assert.equal(find(d.root,'submit').disabled,false);
    find(d.root,'erase').click();draw(d.image,70,50,'mouse',3);
    assert.equal(ui.getDraft().shadowStrokes[1].operation,'ERASE');
    find(d.root,'undo').click();assert.equal(ui.getDraft().shadowStrokes.length,1);
    find(d.root,'redo').click();assert.equal(ui.getDraft().shadowStrokes.length,2);
    const opacity=control(d.root,'影の不透明度 %');opacity.value='35';
    opacity.dispatch('change');assert.equal(ui.getDraft().opacity,35);
    find(d.root,'undo').click();assert.equal(ui.getDraft().opacity,100);
    find(d.root,'redo').click();assert.equal(ui.getDraft().opacity,35);
    d.image.focus();assert.equal(d.document.activeElement,d.image);
    assert.match(d.image.style.outline,/3px/);
    d.image.dispatch('keydown',{key:'ArrowRight'});
    d.image.dispatch('keydown',{key:'Enter'});
    assert.equal(ui.getDraft().shadowStrokes.length,3);
    d.image.dispatch('keydown',{key:'z',ctrlKey:true});
    assert.equal(ui.getDraft().shadowStrokes.length,2);
    assert.equal(ui.getDocument().settings.opacity,35);
    assert.equal(ui.getDocument().binding.backdropID,BACKDROP);
    find(d.root,'cancel').click();
    assert.equal(ui.getDraft().subjectStrokes.length,0);
    assert.equal(ui.getDraft().shadowStrokes.length,0);
    assert.equal(requests.length,0);
    ui.dispose();
  }finally{d.restore();}
});

test('ORIGINAL-SHADOW-UI-03: missing host, invalid scope, stale revision and Before prevent submit',()=>{
  const d=dom();let current=context();
  try{
    const ui=mountOriginalShadowManualUI({root:d.root,afterImage:d.image,
      enabled:true,getContext:()=>current});
    draw(d.image,25,50);
    const select=control(d.root,'範囲の層');select.value='shadow';
    select.dispatch('change');draw(d.image,75,50);
    assert.equal(find(d.root,'submit').disabled,true);
    current={...current,target:{...current.target,savedRevision:3}};
    ui.refresh();assert.equal(find(d.root,'submit').disabled,true);
    current=context();current.view='before';ui.refresh();
    assert.equal(find(d.root,'submit').disabled,true);
    current=context();current.backdrop=null;ui.refresh();
    assert.equal(find(d.root,'submit').disabled,true);
    ui.dispose();
  }finally{d.restore();}
});

test('ORIGINAL-SHADOW-UI-04: real callback receives typed draft and abort/cancel suppress late success',async()=>{
  const d=dom();let current=context(),resolvePending;
  const requests=[];
  try{
    const ui=mountOriginalShadowManualUI({root:d.root,afterImage:d.image,
      enabled:true,getContext:()=>current,
      onApply:(document,options)=>{requests.push({document,options});
        return new Promise(resolve=>{resolvePending=resolve;});}});
    draw(d.image,25,50);
    const select=control(d.root,'範囲の層');select.value='shadow';
    select.dispatch('change');draw(d.image,75,50);
    find(d.root,'submit').click();await sleep();
    assert.equal(requests.length,1);
    assert.equal(requests[0].document.subjectStrokes.length,1);
    assert.equal(requests[0].document.shadowStrokes.length,1);
    assert.equal(requests[0].options.expectedRevision,2);
    assert.equal(find(d.root,'submit').disabled,true);
    find(d.root,'cancel').click();
    assert.equal(requests[0].options.signal.aborted,true);
    resolvePending({accepted:true});await sleep();
    const status=d.root.children[0].children.at(-1);
    assert.match(status.textContent,/取消/);
    assert.doesNotMatch(status.textContent,/受け付けました/);
    assert.equal(ui.getDraft().shadowStrokes.length,0);
    current={...current,permissionExpired:true};ui.refresh();
    assert.equal(find(d.root,'submit').disabled,true);
    ui.dispose();
  }finally{d.restore();}
});

test('ORIGINAL-SHADOW-UI-05: independent UI bundles with 44px focus, mobile and reduced-motion rules',async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL(
    '../src/original-shadow-manual-ui.mjs',import.meta.url))],bundle:true,
    platform:'browser',format:'esm',target:'es2022',write:false,logLevel:'silent'});
  const source=new TextDecoder().decode(result.outputFiles[0].contents);
  assert.ok(source.length>10000);
  assert.match(source,/min-height:44px/);
  assert.match(source,/:focus-visible/);
  assert.match(source,/prefers-reduced-motion/);
  assert.match(source,/mapAfterToLocalBrushPoint/);
  assert.match(source,/subjectStrokes/);
  assert.match(source,/shadowStrokes/);
});

test('ORIGINAL-SHADOW-UI-06: Asset or Recipe changes while callback waits never display acceptance',async()=>{
  const d=dom();let current=context(),resolvePending;
  try{
    const ui=mountOriginalShadowManualUI({root:d.root,afterImage:d.image,
      enabled:true,getContext:()=>current,
      onApply:()=>new Promise(resolve=>{resolvePending=resolve;})});
    draw(d.image,25,50);
    const select=control(d.root,'範囲の層');select.value='shadow';
    select.dispatch('change');draw(d.image,75,50);
    find(d.root,'submit').click();await sleep();
    current={...current,target:{...current.target,savedRevision:3}};
    resolvePending({accepted:true});await sleep();
    const status=d.root.children[0].children.at(-1);
    assert.match(status.textContent,/変わりました/);
    assert.doesNotMatch(status.textContent,/受け付けました/);
    assert.equal(find(d.root,'submit').disabled,true);
    ui.dispose();
  }finally{d.restore();}
});

test('ORIGINAL-SHADOW-UI-07: callback rejection after an unknown save outcome never claims no write',async()=>{
  const d=dom();let current=context();
  try{
    const ui=mountOriginalShadowManualUI({root:d.root,afterImage:d.image,
      enabled:true,getContext:()=>current,
      onApply:async()=>{throw Error('READBACK_LOST_AFTER_CAS');}});
    draw(d.image,25,50);
    const select=control(d.root,'範囲の層');select.value='shadow';
    select.dispatch('change');draw(d.image,75,50);
    find(d.root,'submit').click();await sleep();await sleep();
    const status=d.root.children[0].children.at(-1);
    assert.match(status.textContent,/保存結果を確認できません/);
    assert.match(status.textContent,/再読み込み/);
    assert.doesNotMatch(status.textContent,/未適用|保存しました|Final/);
    ui.dispose();
  }finally{d.restore();}
});
