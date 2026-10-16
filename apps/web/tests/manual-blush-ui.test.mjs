import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';
import {makeManualBlushDocument,mountManualBlushUI} from '../src/manual-blush-ui.mjs';

const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),personID:'33333333-3333-4333-8333-333333333333',
  sourceWidth:200,sourceHeight:100};
const stroke={operation:'ADD',path:[{u:.4,v:.5}],radiusFraction:.04,hardness:.7};
const settings={color:{r:200,g:90,b:112},opacity:.457};

test('BLUSH-UI-01: detached typed document stores normalized geometry and exact color/opacity, not side or authority',()=>{
  const before=structuredClone(stroke);
  const output=makeManualBlushDocument(binding,[stroke],settings);
  assert.deepEqual(output,{schemaVersion:1,
    engineVersion:'suite-srgb8-owner-manual-blush-color-1',binding,
    cheekStrokes:[stroke],settings});
  output.cheekStrokes[0].path[0].u=.2;
  assert.deepEqual(stroke,before);
  assert.doesNotMatch(JSON.stringify(output),
    /side|ownerConfirmed|permissionEvidence|savedRevision|bitmap|authorization/);
});

test('BLUSH-UI-02: invalid binding, strokes, style claims and color/opacity fail before a saved-looking draft',()=>{
  const create=(b=binding,strokes=[stroke],s=settings)=>
    makeManualBlushDocument(b,strokes,s);
  for(const bad of [[],[{...stroke,operation:'ERASE'}],
    Array.from({length:65},()=>stroke)])
    assert.throws(()=>create(binding,bad),/MANUAL_BLUSH_UI_/);
  for(const opacity of [-1,1.1,-0,NaN,Infinity,'0.5'])
    assert.throws(()=>create(binding,[stroke],{...settings,opacity}),
      /MANUAL_BLUSH_UI_SETTINGS_INVALID/);
  for(const bad of [{...stroke,side:'left'},
    {...stroke,aiCheek:true},{...stroke,radiusFraction:.3},
    {...stroke,path:[{u:1.2,v:.5}]}])
    assert.throws(()=>create(binding,[bad]),/MANUAL_BLUSH_UI_/);
  assert.throws(()=>create({...binding,savedRevision:3}),
    /MANUAL_BLUSH_UI_BINDING_INVALID/);
  assert.throws(()=>create(binding,[stroke],{...settings,style:1}),
    /MANUAL_BLUSH_UI_SETTINGS_INVALID/);
  const getter={...settings};
  Object.defineProperty(getter,'color',{get(){throw Error('getter must not run');}});
  assert.throws(()=>create(binding,[stroke],getter),/MANUAL_BLUSH_UI_SETTINGS_INVALID/);
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
  const all=[];const visit=node=>{all.push(node);node.children.forEach(visit);};visit(root);
  return {button:text=>all.find(node=>node.tagName==='BUTTON'&&node.textContent===text),
    input:label=>all.find(node=>node.tagName==='INPUT'&&
      node.getAttribute('aria-label')===label),
    status:()=>all.find(node=>node.getAttribute('role')==='status')};
}
async function withFakeDOM(run){
  const previous={HTMLElement:globalThis.HTMLElement,
    HTMLImageElement:globalThis.HTMLImageElement,
    getComputedStyle:globalThis.getComputedStyle};
  globalThis.HTMLElement=FakeElement;globalThis.HTMLImageElement=FakeImage;
  globalThis.getComputedStyle=()=>({position:'relative'});
  try{
    const doc=new FakeDocument(),host=doc.createElement('div');
    const image=new FakeImage(doc);host.append(image);
    const root=doc.createElement('div');await run({doc,host,image,root});
  }finally{
    for(const [key,value] of Object.entries(previous)){
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
}
const nextTick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('BLUSH-UI-03: left/right Pointer, Touch and Keyboard draft, color/opacity, full Undo/Redo remain local',()=>withFakeDOM(async({image,root})=>{
  const context=()=>({...binding,savedRevision:3,rotationDegrees:0,view:'after',
    ready:true,dirty:false,busy:false,permissionExpired:false});
  const ui=mountManualBlushUI({root,afterImage:image,getContext:context,enabled:true});
  const control=controls(root),at=(id,x=100,y=100,pointerType='mouse')=>{
    image.dispatch('pointerdown',{pointerId:id,clientX:x,clientY:y,pointerType});
    image.dispatch('pointerup',{pointerId:id,clientX:x,clientY:y,pointerType});
  };
  assert.equal(control.button('hostへ下書きを渡す').disabled,true);
  at(1);assert.equal(ui.getDraft().strokes[0].side,'left');
  control.button('右頬を描く').click();at(2,120,100,'touch');
  assert.equal(ui.getDraft().strokes[1].side,'right');
  image.dispatch('keydown',{key:'ArrowRight'});image.dispatch('keydown',{key:'Enter'});
  assert.equal(ui.getDraft().strokes.length,3);
  control.button('範囲を消去').click();at(3,125,100);
  assert.equal(ui.getDraft().strokes.at(-1).stroke.operation,'ERASE');
  const before=ui.getDraft().strokes.length;
  image.dispatch('pointerdown',{pointerId:4,clientY:5});
  image.dispatch('pointerup',{pointerId:4,clientY:5});
  assert.equal(ui.getDraft().strokes.length,before,'contain letterbox is rejected');
  image.dispatch('pointerdown',{pointerId:5});image.dispatch('pointercancel',{pointerId:5});
  assert.equal(ui.getDraft().strokes.length,before);
  const color=control.input('頬の色');color.value='#336699';color.dispatch('change');
  const opacity=control.input('Blush 不透明度 %');
  opacity.value='37.5';opacity.dispatch('change');
  assert.equal(ui.getDocument().settings.opacity,.375);
  assert.deepEqual(ui.getDocument().settings.color,{r:51,g:102,b:153});
  control.button('戻す').click();assert.equal(ui.getDocument().settings.opacity,.5);
  control.button('やり直す').click();assert.equal(ui.getDocument().settings.opacity,.375);
  assert.equal(ui.getDocument().cheekStrokes.length,4);
  assert.equal(ui.getDocument().cheekStrokes.some(item=>'side'in item),false);
  ui.dispose();
}));

test('BLUSH-UI-04: missing host, cancellation and Asset/revision/permission change cannot claim saved',()=>withFakeDOM(async({doc,image,root})=>{
  let revision=3,expired=false,view='after',delayed=false,resolveLater;
  const calls=[];
  const context=()=>({...binding,savedRevision:revision,rotationDegrees:0,view,
    ready:true,dirty:false,busy:false,permissionExpired:expired});
  const ui=mountManualBlushUI({root,afterImage:image,getContext:context,enabled:true,
    onSubmit:(value,options)=>{
      calls.push({value,options});
      return delayed?new Promise(resolve=>{resolveLater=resolve;}):
        Promise.resolve({saved:true,applied:true});
    }});
  const nohostRoot=doc.createElement('div'),nohostImage=new FakeImage(doc);
  const nohostBox=doc.createElement('div');nohostBox.append(nohostImage);
  const nohost=mountManualBlushUI({root:nohostRoot,afterImage:nohostImage,
    getContext:context,enabled:true});
  const control=controls(root);
  assert.equal(controls(nohostRoot).button('hostへ下書きを渡す').disabled,true);
  image.dispatch('pointerdown');image.dispatch('pointerup');
  control.button('hostへ下書きを渡す').click();await nextTick();
  assert.equal(calls.length,1);
  assert.match(control.status().textContent,/別途確認/);
  assert.doesNotMatch(control.status().textContent,/保存しました/);
  delayed=true;control.button('hostへ下書きを渡す').click();await nextTick();
  control.button('下書きを破棄').click();
  assert.equal(calls[1].options.signal.aborted,true);
  resolveLater({saved:true});await nextTick();
  assert.match(control.status().textContent,/破棄/);
  assert.equal(ui.getDraft().strokes.length,0);
  image.dispatch('pointerdown');image.dispatch('pointerup');
  view='before';ui.refresh();
  assert.equal(control.button('hostへ下書きを渡す').disabled,true);
  view='after';revision=4;ui.refresh();
  assert.equal(ui.getDraft().strokes.length,0);
  assert.throws(()=>ui.getDocument(),/AFTER_NOT_READY/);
  assert.equal(control.button('hostへ下書きを渡す').disabled,true);
  expired=true;ui.refresh();
  assert.equal(control.button('hostへ下書きを渡す').disabled,true);
  ui.dispose();nohost.dispose();
}));

test('BLUSH-UI-05: Asset switch or permission expiry discards draft and aborts delayed host response',()=>withFakeDOM(async({doc,image,root})=>{
  let assetID=binding.assetID,expired=false,resolveLater,signal;
  const context=()=>({...binding,assetID,savedRevision:3,rotationDegrees:0,
    view:'after',ready:true,dirty:false,busy:false,permissionExpired:expired});
  const ui=mountManualBlushUI({root,afterImage:image,getContext:context,enabled:true,
    onSubmit:(_value,options)=>{signal=options.signal;
      return new Promise(resolve=>{resolveLater=resolve;});}});
  const control=controls(root);
  image.dispatch('pointerdown');image.dispatch('pointerup');
  control.button('hostへ下書きを渡す').click();await nextTick();
  assetID='22222222-2222-4222-8222-222222222222';ui.refresh();
  assert.equal(signal.aborted,true);
  assert.equal(ui.getDraft().strokes.length,0);
  resolveLater({saved:true});await nextTick();
  assert.equal(control.button('hostへ下書きを渡す').disabled,true);
  assert.doesNotMatch(control.status().textContent,/渡しました/);
  ui.dispose();
  const host2=doc.createElement('div'),image2=new FakeImage(doc),root2=doc.createElement('div');
  host2.append(image2);assetID=binding.assetID;
  const next=mountManualBlushUI({root:root2,afterImage:image2,
    getContext:context,enabled:true,onSubmit:()=>Promise.resolve({saved:true})});
  image2.dispatch('pointerdown');image2.dispatch('pointerup');
  assert.equal(next.getDraft().strokes.length,1);
  expired=true;next.refresh();
  assert.equal(next.getDraft().strokes.length,0);
  assert.equal(controls(root2).button('hostへ下書きを渡す').disabled,true);
  assert.throws(()=>next.getDocument(),/AFTER_NOT_READY/);
  assert.throws(()=>next.reset(),/AFTER_NOT_READY/);
  next.dispose();
}));

test('BLUSH-UI-06: readback itself discards a stale draft even before UI refresh',()=>withFakeDOM(async({image,root})=>{
  let sourceWidth=binding.sourceWidth;
  const context=()=>({...binding,sourceWidth,savedRevision:3,rotationDegrees:0,
    view:'after',ready:true,dirty:false,busy:false,permissionExpired:false});
  const ui=mountManualBlushUI({root,afterImage:image,getContext:context,enabled:true});
  image.dispatch('pointerdown');image.dispatch('pointerup');
  assert.equal(ui.getDraft().strokes.length,1);
  sourceWidth=0;
  assert.equal(ui.getDraft().strokes.length,0);
  assert.throws(()=>ui.reset(),/AFTER_NOT_READY/);
  assert.equal(controls(root).button('hostへ下書きを渡す').disabled,true);
  ui.dispose();
}));

test('BLUSH-UI-BUNDLE: independent UI bundles After coordinate, keyboard and typed draft only',async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL('../src/manual-blush-ui.mjs',
    import.meta.url))],bundle:true,format:'esm',platform:'browser',target:'es2022',
    write:false,logLevel:'silent'});
  const source=result.outputFiles[0].text;
  assert.match(source,/mapAfterToLocalBrushPoint/);
  assert.match(source,/mapAfterImagePointToLocalBrushPoint/);
  assert.match(source,/cheekStrokes/);
  assert.match(source,/pointercancel/);
  assert.match(source,/MANUAL_BLUSH_UI_STALE_ASSET_PERSON_OR_REVISION/);
});
