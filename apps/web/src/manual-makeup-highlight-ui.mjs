import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {MANUAL_MAKEUP_HIGHLIGHT_VERSION} from './processing/manual-makeup-highlight.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const MAX_STROKES=64,MAX_POINTS=4096,MAX_JSON_BYTES=96*1024;
const STYLE=`.suite-makeup-highlight-manual{box-sizing:border-box;max-width:100%;min-width:0;padding:1rem;border:1px solid #cecac2;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}
.suite-makeup-highlight-manual *{box-sizing:border-box}.suite-makeup-highlight-manual h3{font:normal clamp(1.3rem,3vw,1.8rem)/1.25 Georgia,serif;margin:0 0 .4rem}
.suite-makeup-highlight-manual p{margin:.4rem 0 .8rem}.suite-makeup-highlight-manual__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;min-width:0}
.suite-makeup-highlight-manual label{display:grid;gap:.2rem;min-width:0}.suite-makeup-highlight-manual input{width:100%;max-width:100%;min-width:0;min-height:44px;padding:.4rem;border:1px solid #77736b;border-radius:0;background:#fff;color:#242321;font:inherit}
.suite-makeup-highlight-manual__actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:.8rem 0}.suite-makeup-highlight-manual button{min-height:44px;min-width:44px;padding:.5rem .8rem;border:1px solid #494640;border-radius:0;background:#fff;color:#242321;font:inherit;cursor:pointer}
.suite-makeup-highlight-manual button:disabled{cursor:not-allowed;opacity:.5}.suite-makeup-highlight-manual :focus-visible{outline:3px solid #145b84;outline-offset:2px}
.suite-makeup-highlight-manual__status{min-height:2.5em;overflow-wrap:anywhere}.suite-makeup-highlight-manual__scope{overflow-wrap:anywhere;font-size:.8rem;color:#4c4843}
@media(max-width:600px){.suite-makeup-highlight-manual{padding:.7rem}.suite-makeup-highlight-manual__grid{grid-template-columns:minmax(0,1fr)}.suite-makeup-highlight-manual__actions>*{flex:1 1 8rem}}
@media(prefers-reduced-motion:reduce){.suite-makeup-highlight-manual *, .suite-makeup-highlight-manual *::before, .suite-makeup-highlight-manual *::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;

function record(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&prototype!==Object.prototype&&
      !(Object.getPrototypeOf(prototype)===null&&
        Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object'))return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&Object.hasOwn(descriptor,'value');
  });
}
function dense(value,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max||
      Reflect.ownKeys(value).length!==value.length+1)return false;
  for(let index=0;index<value.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if(!descriptor||!Object.hasOwn(descriptor,'value'))return false;
  }
  return true;
}
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
const copy=value=>structuredClone(value);
const element=(doc,tag,text='')=>{const node=doc.createElement(tag);node.textContent=text;return node;};
const labelled=(doc,name,input)=>{const node=element(doc,'label',name);node.append(input);return node;};
function integer(input,min,max){
  if(input.value.trim()===''||!/^\d+$/u.test(input.value.trim()))
    throw Error('MAKEUP_HIGHLIGHT_UI_NUMBER_INVALID');
  const value=Number(input.value);
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw Error('MAKEUP_HIGHLIGHT_UI_NUMBER_INVALID');
  return value;
}
function checkedBinding(binding){
  if(!record(binding,['assetID','originalSHA256','personID','sourceWidth','sourceHeight'])||
      typeof binding.assetID!=='string'||!UUID.test(binding.assetID)||
      typeof binding.originalSHA256!=='string'||!SHA.test(binding.originalSHA256)||
      typeof binding.personID!=='string'||!UUID.test(binding.personID)||
      !Number.isSafeInteger(binding.sourceWidth)||binding.sourceWidth<1||
      !Number.isSafeInteger(binding.sourceHeight)||binding.sourceHeight<1||
      binding.sourceWidth*binding.sourceHeight>8_000_000)
    throw Error('MAKEUP_HIGHLIGHT_UI_BINDING_INVALID');
  return binding;
}
function selectedBinding(context){
  return checkedBinding({assetID:context?.assetID,
    originalSHA256:context?.originalSHA256,personID:context?.personID,
    sourceWidth:context?.sourceWidth,sourceHeight:context?.sourceHeight});
}

/** Detached, typed Recipe v1 extension document. This is shape, not authority. */
export function makeManualMakeupHighlightDocument(binding,highlightStrokes,settings){
  checkedBinding(binding);
  if(!record(settings,['intensity'])||!Number.isSafeInteger(settings.intensity)||
      settings.intensity<0||settings.intensity>100)
    throw Error('MAKEUP_HIGHLIGHT_UI_INTENSITY_INVALID');
  if(!dense(highlightStrokes,1,MAX_STROKES))
    throw Error('MAKEUP_HIGHLIGHT_UI_STROKES_INVALID');
  let points=0,hasAdd=false;
  const strokes=highlightStrokes.map(stroke=>{
    if(!record(stroke,['operation','path','radiusFraction','hardness'])||
        !['ADD','ERASE'].includes(stroke.operation)||
        !dense(stroke.path,1,MAX_POINTS)||
        typeof stroke.radiusFraction!=='number'||!Number.isFinite(stroke.radiusFraction)||
        stroke.radiusFraction<.001||stroke.radiusFraction>.25||!unit(stroke.hardness))
      throw Error('MAKEUP_HIGHLIGHT_UI_STROKE_INVALID');
    if(stroke.operation==='ADD')hasAdd=true;
    points+=stroke.path.length;
    if(points>MAX_POINTS)throw Error('MAKEUP_HIGHLIGHT_UI_STROKE_CAPACITY');
    const path=stroke.path.map(point=>{
      if(!record(point,['u','v'])||!unit(point.u)||!unit(point.v))
        throw Error('MAKEUP_HIGHLIGHT_UI_POINT_INVALID');
      return {u:point.u,v:point.v};
    });
    return {operation:stroke.operation,path,
      radiusFraction:stroke.radiusFraction,hardness:stroke.hardness};
  });
  if(!hasAdd)throw Error('MAKEUP_HIGHLIGHT_UI_ADD_REQUIRED');
  const output={schemaVersion:1,engineVersion:MANUAL_MAKEUP_HIGHLIGHT_VERSION,
    binding:{assetID:binding.assetID,originalSHA256:binding.originalSHA256,
      sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight,
      personID:binding.personID},highlightStrokes:strokes,
    settings:{intensity:settings.intensity}};
  if(new TextEncoder().encode(JSON.stringify(output)).byteLength>MAX_JSON_BYTES)
    throw Error('MAKEUP_HIGHLIGHT_UI_JSON_LIMIT');
  return output;
}

function checkedInitial(initial,binding){
  if(!record(initial,['schemaVersion','engineVersion','binding','highlightStrokes','settings'])||
      initial.schemaVersion!==1||initial.engineVersion!==MANUAL_MAKEUP_HIGHLIGHT_VERSION)
    throw Error('MAKEUP_HIGHLIGHT_UI_INITIAL_INVALID');
  const checked=makeManualMakeupHighlightDocument(initial.binding,
    initial.highlightStrokes,initial.settings);
  for(const field of ['assetID','originalSHA256','personID','sourceWidth','sourceHeight'])
    if(checked.binding[field]!==binding[field])
      throw Error('MAKEUP_HIGHLIGHT_UI_INITIAL_BINDING_MISMATCH');
  return checked;
}

/**
 * Unauthenticated, independent manual draft UI. The host must provide fresh
 * context, person/Asset authority and a real onSubmit callback. A callback's
 * response is never displayed as proof of save, Preview, Final or permission.
 */
export function mountManualMakeupHighlightUI({root,afterImage,getContext,onSubmit,
  initial,enabled=false}={}){
  if(!(root instanceof HTMLElement)||!(afterImage instanceof HTMLImageElement)||
      root.ownerDocument!==afterImage.ownerDocument||!afterImage.parentElement||
      typeof getContext!=='function'||
      (onSubmit!==undefined&&typeof onSubmit!=='function'))
    throw Error('MAKEUP_HIGHLIGHT_UI_MOUNT_INVALID');
  const doc=root.ownerDocument,host=afterImage.parentElement;
  const mounted=getContext(),binding=selectedBinding(mounted);
  if(!Number.isSafeInteger(mounted.savedRevision)||mounted.savedRevision<1)
    throw Error('MAKEUP_HIGHLIGHT_UI_CONTEXT_INVALID');
  const mountedKey=[binding.assetID,binding.originalSHA256,binding.personID,
    binding.sourceWidth,binding.sourceHeight,mounted.savedRevision].join(':');
  const saved=initial===undefined?null:checkedInitial(initial,binding);
  let strokes=copy(saved?.highlightStrokes??[]),intensity=saved?.settings.intensity??0;
  let operation='ADD',drawing=null,keyboard={x:.5,y:.5},redo=[];
  let busy=false,disposed=false,generation=0,inFlight=null;
  let ownsImage=false,savedImage=null;
  const events=new AbortController();
  const panel=element(doc,'section');panel.className='suite-makeup-highlight-manual';
  panel.setAttribute('aria-label','Makeup Highlight 手動範囲');
  panel.append(element(doc,'style',STYLE));
  panel.append(element(doc,'h3','Makeup Highlight · 手動範囲'));
  panel.append(element(doc,'p',
    'After写真で範囲を指定します。自動顔認識・保存・書出しを実行する画面ではありません。'));
  const scope=element(doc,'p',`対象 Asset ${binding.assetID} / 人物 ${binding.personID}`);
  scope.className='suite-makeup-highlight-manual__scope';panel.append(scope);
  function numeric(name,value,min,max){
    const input=element(doc,'input');input.type='number';input.min=String(min);
    input.max=String(max);input.step='1';input.value=String(value);
    input.setAttribute('aria-label',name);return input;
  }
  const strength=numeric('手動Highlight強度',intensity,0,100);
  const radius=numeric('ブラシ半径 %',4,1,25);
  const hardness=numeric('ブラシ硬さ %',70,0,100);
  const grid=element(doc,'div');grid.className='suite-makeup-highlight-manual__grid';
  grid.append(labelled(doc,'Intensity',strength),labelled(doc,'半径',radius),
    labelled(doc,'硬さ',hardness));panel.append(grid);
  const actions=element(doc,'div');actions.className='suite-makeup-highlight-manual__actions';
  const add=element(doc,'button','範囲を追加');add.type='button';
  const erase=element(doc,'button','範囲を消去');erase.type='button';
  const undo=element(doc,'button','1筆戻す');undo.type='button';
  const repeat=element(doc,'button','やり直す');repeat.type='button';
  const submit=element(doc,'button','hostへ下書きを渡す');submit.type='button';
  const cancel=element(doc,'button','依頼を中止');cancel.type='button';
  actions.append(add,erase,undo,repeat,submit,cancel);panel.append(actions);
  const status=element(doc,'p','下書きのみ。保存・適用・Finalは未確認です。');
  status.className='suite-makeup-highlight-manual__status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  panel.append(status);root.append(panel);
  const overlay=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.setAttribute('aria-hidden','true');overlay.style.position='absolute';
  overlay.style.pointerEvents='none';overlay.style.overflow='visible';
  const hostPosition=host.style.position;
  if(getComputedStyle(host).position==='static')host.style.position='relative';
  host.append(overlay);
  function claimImage(){
    if(ownsImage)return;
    savedImage={tabindex:afterImage.getAttribute('tabindex'),
      role:afterImage.getAttribute('role'),label:afterImage.getAttribute('aria-label'),
      shortcuts:afterImage.getAttribute('aria-keyshortcuts'),
      touch:afterImage.style.touchAction,outline:afterImage.style.outline,
      outlineOffset:afterImage.style.outlineOffset};
    afterImage.tabIndex=0;afterImage.setAttribute('role','button');
    afterImage.setAttribute('aria-label',
      'After写真の手動Highlightブラシ。矢印キーで移動、Enterで描画、Escapeで取消');
    afterImage.setAttribute('aria-keyshortcuts',
      'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape');
    afterImage.style.touchAction='none';afterImage.style.outlineOffset='3px';
    ownsImage=true;
  }
  function releaseImage(){
    if(!ownsImage)return;
    for(const [name,value] of [['tabindex',savedImage.tabindex],['role',savedImage.role],
      ['aria-label',savedImage.label],['aria-keyshortcuts',savedImage.shortcuts]]){
      if(value===null)afterImage.removeAttribute(name);
      else afterImage.setAttribute(name,value);
    }
    afterImage.style.touchAction=savedImage.touch;
    afterImage.style.outline=savedImage.outline;
    afterImage.style.outlineOffset=savedImage.outlineOffset;
    ownsImage=false;savedImage=null;
  }
  function freshContext(){
    if(!enabled||disposed||!afterImage.complete||
        !afterImage.naturalWidth||!afterImage.naturalHeight)
      throw Error('MAKEUP_HIGHLIGHT_UI_AFTER_NOT_READY');
    const context=getContext(),current=selectedBinding(context);
    const key=[current.assetID,current.originalSHA256,current.personID,
      current.sourceWidth,current.sourceHeight,context.savedRevision].join(':');
    if(key!==mountedKey)throw Error('MAKEUP_HIGHLIGHT_UI_STALE_ASSET_PERSON_OR_REVISION');
    if(context.ready!==true||context.dirty!==false||context.busy===true||
        context.permissionExpired===true||context.view!=='after')
      throw Error('MAKEUP_HIGHLIGHT_UI_CONTEXT_NOT_READY');
    return context;
  }
  function geometry(){
    if(busy)throw Error('MAKEUP_HIGHLIGHT_UI_BUSY');
    const context=freshContext();
    if(context.expectedAfterURL&&afterImage.getAttribute('src')!==context.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {...context,afterRect:afterImage.getBoundingClientRect(),
      uprightWidth:context.uprightWidth??binding.sourceWidth,uprightHeight:context.uprightHeight??binding.sourceHeight,
      naturalWidth:afterImage.naturalWidth,naturalHeight:afterImage.naturalHeight};
  }
  function draft(){
    const context=freshContext();
    return makeManualMakeupHighlightDocument(selectedBinding(context),
      copy(strokes),{intensity:integer(strength,0,100)});
  }
  function render(){
    let ready=false;
    try{geometry();ready=true;}catch{}
    if(ready)claimImage();else releaseImage();
    for(const control of [strength,radius,hardness,add,erase])control.disabled=!ready||busy;
    undo.disabled=!ready||busy||strokes.length===0;
    repeat.disabled=!ready||busy||redo.length===0;
    submit.disabled=!ready||busy||typeof onSubmit!=='function'||
      !strokes.some(stroke=>stroke.operation==='ADD');
    cancel.disabled=disposed||(!busy&&!drawing);
    add.setAttribute('aria-pressed',String(operation==='ADD'));
    erase.setAttribute('aria-pressed',String(operation==='ERASE'));
    overlay.replaceChildren();
    if(!ready)return;
    try{
      const g=geometry(),box=afterImage.getBoundingClientRect();
      const parent=host.getBoundingClientRect();
      overlay.style.left=`${box.left-parent.left}px`;
      overlay.style.top=`${box.top-parent.top}px`;
      overlay.style.width=`${box.width}px`;
      overlay.style.height=`${box.height}px`;
      overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
      appendProjectedBrushOverlay(overlay,g,strokes,{color:[153,107,54]});
    }catch{overlay.replaceChildren();}
  }
  function addStroke(path){
    if(!path.length||strokes.length>=MAX_STROKES||
        strokes.reduce((sum,stroke)=>sum+stroke.path.length,path.length)>MAX_POINTS)
      throw Error('MAKEUP_HIGHLIGHT_UI_STROKE_CAPACITY');
    const radiusFraction=integer(radius,1,25)/100;
    const hard=integer(hardness,0,100)/100;
    strokes.push({operation,path,radiusFraction,hardness:hard});
    redo=[];status.textContent='手動範囲を下書きへ追加しました。未保存です。';render();
  }
  function pointerPoint(event){
    const mapped=mapAfterToLocalBrushPoint({...geometry(),
      clientX:event.clientX,clientY:event.clientY});
    return {u:mapped.x,v:mapped.y};
  }
  function end(event,cancelled){
    if(!drawing||event.pointerId!==drawing.id)return;
    const ongoing=drawing;drawing=null;
    try{if(afterImage.hasPointerCapture?.(event.pointerId))
      afterImage.releasePointerCapture(event.pointerId);}catch{}
    if(cancelled||ongoing.invalid){status.textContent='strokeを取消しました。';render();return;}
    try{const last=pointerPoint(event);
      if(ongoing.path.at(-1)?.u!==last.u||ongoing.path.at(-1)?.v!==last.v)
        ongoing.path.push(last);
      addStroke(ongoing.path);
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='Afterの実画像外または古い版では確定しません。';render();}
  }
  afterImage.addEventListener('pointerdown',event=>{
    if(drawing||event.isPrimary===false||
        (event.pointerType!=='touch'&&event.button!==0))return;
    try{const point=pointerPoint(event);
      drawing={id:event.pointerId,path:[point],invalid:false};
      try{afterImage.setPointerCapture?.(event.pointerId);}catch{}
      event.preventDefault();render();}
    catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='Afterの実画像上だけ描画できます。';}
  },{signal:events.signal});
  afterImage.addEventListener('pointermove',event=>{
    if(!drawing||event.pointerId!==drawing.id)return;
    try{const point=pointerPoint(event);
      if(drawing.path.length>=MAX_POINTS){drawing.invalid=true;return;}
      if(Math.abs(point.u-drawing.path.at(-1).u)+
          Math.abs(point.v-drawing.path.at(-1).v)>.0001)
        drawing.path.push(point);
    }catch{drawing.invalid=true;}
  },{signal:events.signal});
  afterImage.addEventListener('pointerup',event=>end(event,false),{signal:events.signal});
  afterImage.addEventListener('pointercancel',event=>end(event,true),{signal:events.signal});
  afterImage.addEventListener('focus',()=>{if(ownsImage)
    afterImage.style.outline='3px solid #145b84';},{signal:events.signal});
  afterImage.addEventListener('blur',()=>{if(ownsImage)
    afterImage.style.outline=savedImage.outline;},{signal:events.signal});
  afterImage.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      drawing=null;if(inFlight){inFlight.abort();generation++;inFlight=null;busy=false;}
      status.textContent='操作を取消しました。保存・適用は未確認です。';render();return;
    }
    try{geometry();}catch{return;}
    const dx=event.key==='ArrowRight'?.01:event.key==='ArrowLeft'?-.01:0;
    const dy=event.key==='ArrowDown'?.01:event.key==='ArrowUp'?-.01:0;
    if(dx||dy){
      event.preventDefault();
      const next={x:Math.max(0,Math.min(1,keyboard.x+dx)),
        y:Math.max(0,Math.min(1,keyboard.y+dy))};
      try{mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX:next.x,afterY:next.y});keyboard=next;
        status.textContent=`位置 ${Math.round(next.x*100)}%, ${Math.round(next.y*100)}%`;}
      catch{status.textContent='余白・Crop外には移動できません。';}
    }else if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      try{const point=mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX:keyboard.x,afterY:keyboard.y});
        addStroke([{u:point.x,v:point.y}]);}
      catch{status.textContent='Afterの実画像上だけ描画できます。';}
    }
  },{signal:events.signal});
  add.addEventListener('click',()=>{operation='ADD';render();},{signal:events.signal});
  erase.addEventListener('click',()=>{operation='ERASE';render();},{signal:events.signal});
  undo.addEventListener('click',()=>{if(strokes.length){redo.push(strokes.pop());
    status.textContent='1筆戻しました。未保存です。';render();}},{signal:events.signal});
  repeat.addEventListener('click',()=>{if(redo.length){strokes.push(redo.pop());
    status.textContent='1筆やり直しました。未保存です。';render();}},{signal:events.signal});
  strength.addEventListener('change',()=>{try{intensity=integer(strength,0,100);
    status.textContent='Intensityを下書きへ変更しました。未保存です。';}
    catch{status.textContent='Intensityは0〜100の整数です。';}render();},
  {signal:events.signal});
  submit.addEventListener('click',async()=>{
    if(busy||disposed||typeof onSubmit!=='function')return;
    let candidate;
    try{candidate=draft();}catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='下書き・版・権限を確認できず、hostへ渡しません。';return;}
    busy=true;const token=++generation,abort=new AbortController();inFlight=abort;
    status.textContent='hostへ下書きを依頼中。保存・Finalは未確認です。';render();
    try{
      await onSubmit(copy(candidate),{savedRevision:mounted.savedRevision,
        personID:binding.personID,signal:abort.signal});
      if(disposed||token!==generation||abort.signal.aborted)return;
      const fresh=getContext();
      if([fresh.assetID,fresh.originalSHA256,fresh.personID,
        fresh.sourceWidth,fresh.sourceHeight,fresh.savedRevision].join(':')!==mountedKey)
        throw Error('MAKEUP_HIGHLIGHT_UI_STALE_ASSET_PERSON_OR_REVISION');
      status.textContent='hostへ渡しました。実保存・適用・Finalは別途確認してください。';
    }catch(error){if(disposed||token!==generation)return;
      status.dataset.error=String(error?.message??error);
      status.textContent='依頼は完了していません。確認後に再実行できます。';}
    finally{if(!disposed&&token===generation){busy=false;inFlight=null;render();}}
  },{signal:events.signal});
  cancel.addEventListener('click',()=>{
    drawing=null;if(inFlight){inFlight.abort();generation++;inFlight=null;busy=false;}
    status.textContent='依頼を中止しました。保存・適用は未確認です。';render();
  },{signal:events.signal});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(render):null;
  resize?.observe(afterImage);
  afterImage.addEventListener('load',render,{signal:events.signal});
  render();
  return Object.freeze({refresh:render,
    getDraft(){return copy({highlightStrokes:strokes,settings:{intensity}});},
    getDocument(){return draft();},
    setEnabled(value){enabled=value===true;
      if(!enabled){drawing=null;if(inFlight)inFlight.abort();
        generation++;busy=false;inFlight=null;}render();},
    reset(next){
      if(inFlight)inFlight.abort();generation++;busy=false;inFlight=null;
      drawing=null;redo=[];
      const checked=next===undefined?null:checkedInitial(next,binding);
      strokes=copy(checked?.highlightStrokes??[]);
      intensity=checked?.settings.intensity??0;
      strength.value=String(intensity);
      status.textContent='下書きを再読込しました。保存・Finalは未確認です。';render();
    },
    dispose(){disposed=true;generation++;if(inFlight)inFlight.abort();
      events.abort();resize?.disconnect();overlay.remove();panel.remove();
      releaseImage();host.style.position=hostPosition;}});
}
