import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {MANUAL_HAND_TONE_VERSION} from './processing/manual-hand-tone.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const MAX_STROKES=64,MAX_POINTS=4096,MAX_BYTES=96*1024;
const clone=value=>structuredClone(value);
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&
  !Object.is(value,-0)&&value>=0&&value<=1;
function plain(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return proto===null||(Object.getPrototypeOf(proto)===null&&
    Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object');
}
function exact(value,keys){
  return plain(value)&&Reflect.ownKeys(value).length===keys.length&&
    keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)??{},'value'));
}
function dense(value,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max||
      Reflect.ownKeys(value).length!==value.length+1)return false;
  return value.every((_item,index)=>Object.hasOwn(value,index));
}
function bindingOf(value){
  const binding={assetID:value?.assetID,originalSHA256:value?.originalSHA256,
    sourceWidth:value?.sourceWidth,sourceHeight:value?.sourceHeight};
  if(!exact(binding,['assetID','originalSHA256','sourceWidth','sourceHeight'])||
      typeof binding.assetID!=='string'||!UUID.test(binding.assetID)||
      typeof binding.originalSHA256!=='string'||!SHA.test(binding.originalSHA256)||
      !Number.isSafeInteger(binding.sourceWidth)||binding.sourceWidth<1||
      !Number.isSafeInteger(binding.sourceHeight)||binding.sourceHeight<1||
      binding.sourceWidth*binding.sourceHeight>8_000_000)
    throw Error('MANUAL_HAND_UI_BINDING_INVALID');
  return binding;
}
function number(input,min,max,integer=false){
  const raw=input.value.trim();
  if(!/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/u.test(raw))
    throw Error('MANUAL_HAND_UI_NUMBER_INVALID');
  const value=Number(raw);
  if(!Number.isFinite(value)||value<min||value>max||
      (integer&&!Number.isSafeInteger(value)))
    throw Error('MANUAL_HAND_UI_NUMBER_INVALID');
  return value;
}
function validateSettings(settings){
  if(!exact(settings,['strength','radiusSourcePixels'])||!unit(settings.strength)||
      !Number.isSafeInteger(settings.radiusSourcePixels)||
      settings.radiusSourcePixels<1||settings.radiusSourcePixels>6)
    throw Error('MANUAL_HAND_UI_SETTINGS_INVALID');
  return {strength:settings.strength,radiusSourcePixels:settings.radiusSourcePixels};
}

/** Geometry is an explicit user draft, not authentication or hand detection. */
export function makeManualHandToneDocument(binding,handStrokes,settings){
  if(!exact(binding,['assetID','originalSHA256','sourceWidth','sourceHeight']))
    throw Error('MANUAL_HAND_UI_BINDING_INVALID');
  const safeBinding=bindingOf(binding),safeSettings=validateSettings(settings);
  if(!dense(handStrokes,1,MAX_STROKES))throw Error('MANUAL_HAND_UI_STROKES_INVALID');
  let points=0,hasAdd=false;
  const safeStrokes=handStrokes.map(stroke=>{
    if(!exact(stroke,['operation','path','radiusFraction','hardness'])||
        !['ADD','ERASE'].includes(stroke.operation)||
        !dense(stroke.path,1,MAX_POINTS)||
        typeof stroke.radiusFraction!=='number'||
        !Number.isFinite(stroke.radiusFraction)||
        stroke.radiusFraction<.001||stroke.radiusFraction>.25||
        !unit(stroke.hardness))throw Error('MANUAL_HAND_UI_STROKE_INVALID');
    points+=stroke.path.length;
    if(points>MAX_POINTS)throw Error('MANUAL_HAND_UI_CAPACITY');
    if(stroke.operation==='ADD')hasAdd=true;
    return {operation:stroke.operation,
      path:stroke.path.map(point=>{
        if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
          throw Error('MANUAL_HAND_UI_POINT_INVALID');
        return {u:point.u,v:point.v};
      }),radiusFraction:stroke.radiusFraction,hardness:stroke.hardness};
  });
  if(!hasAdd)throw Error('MANUAL_HAND_UI_ADD_REQUIRED');
  const document={schemaVersion:1,engineVersion:MANUAL_HAND_TONE_VERSION,
    binding:safeBinding,handStrokes:safeStrokes,settings:safeSettings};
  if(new TextEncoder().encode(JSON.stringify(document)).byteLength>MAX_BYTES)
    throw Error('MANUAL_HAND_UI_JSON_LIMIT');
  return document;
}

const STYLE=`.suite-manual-hand-tone{box-sizing:border-box;max-width:100%;min-width:0;padding:1rem;border:1px solid #cecac2;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}
.suite-manual-hand-tone *{box-sizing:border-box}.suite-manual-hand-tone h3{font:normal clamp(1.3rem,3vw,1.8rem)/1.25 Georgia,serif;margin:0 0 .4rem}
.suite-manual-hand-tone p{margin:.4rem 0 .8rem;overflow-wrap:anywhere}.suite-manual-hand-tone__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;min-width:0}
.suite-manual-hand-tone label{display:grid;gap:.2rem;min-width:0}.suite-manual-hand-tone input{width:100%;max-width:100%;min-width:0;min-height:44px;padding:.4rem;border:1px solid #77736b;background:#fff;color:#242321;font:inherit}
.suite-manual-hand-tone__actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:.8rem 0}.suite-manual-hand-tone button{min-height:44px;min-width:44px;padding:.5rem .8rem;border:1px solid #494640;background:#fff;color:#242321;font:inherit;cursor:pointer}
.suite-manual-hand-tone button:disabled{cursor:not-allowed;opacity:.5}.suite-manual-hand-tone :focus-visible{outline:3px solid #145b84;outline-offset:2px}
@media(max-width:600px){.suite-manual-hand-tone{padding:.7rem}.suite-manual-hand-tone__grid{grid-template-columns:minmax(0,1fr)}.suite-manual-hand-tone__actions>*{flex:1 1 8rem}}
@media(prefers-reduced-motion:reduce){.suite-manual-hand-tone *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;
const node=(doc,tag,text='')=>{const element=doc.createElement(tag);element.textContent=text;return element;};
const label=(doc,text,input)=>{const element=node(doc,'label',text);element.append(input);return element;};

/**
 * Independent After-only draft authoring UI. Its hand/forearm buttons are
 * author labels only; neither selected anatomy nor owner authority is proven.
 * onSubmit is a host request, not proof of persistence. A fresh authenticated
 * host must gate, CAS-save, and read back before product UI may claim saved.
 */
export function mountManualHandToneUI({root,afterImage,getContext,onSubmit,
  enabled=false,initial}={}){
  if(!(root instanceof HTMLElement)||!(afterImage instanceof HTMLImageElement)||
      root.ownerDocument!==afterImage.ownerDocument||!afterImage.parentElement||
      typeof getContext!=='function'||
      (onSubmit!==undefined&&typeof onSubmit!=='function'))
    throw Error('MANUAL_HAND_UI_MOUNT_INVALID');
  const doc=root.ownerDocument,host=afterImage.parentElement;
  const mounted=getContext(),binding=bindingOf(mounted);
  if(!Number.isSafeInteger(mounted.savedRevision)||mounted.savedRevision<1)
    throw Error('MANUAL_HAND_UI_REVISION_INVALID');
  const mountedKey=[binding.assetID,binding.originalSHA256,binding.sourceWidth,
    binding.sourceHeight,mounted.savedRevision].join(':');
  let existing=null;
  if(initial!==undefined){
    if(!exact(initial,['schemaVersion','engineVersion','binding','handStrokes','settings'])||
        initial.schemaVersion!==1||initial.engineVersion!==MANUAL_HAND_TONE_VERSION)
      throw Error('MANUAL_HAND_UI_INITIAL_INVALID');
    existing=makeManualHandToneDocument(initial.binding,initial.handStrokes,
      initial.settings);
    for(const key of Object.keys(binding))if(existing.binding[key]!==binding[key])
      throw Error('MANUAL_HAND_UI_INITIAL_BINDING_MISMATCH');
  }
  const empty=()=>({entries:(existing?.handStrokes??[]).map(stroke=>
      ({region:'restored',stroke:clone(stroke)})),strength:existing?.settings.strength??.5,
    radiusSourcePixels:existing?.settings.radiusSourcePixels??3,
    region:'hand',operation:'ADD'});
  let state=empty(),history=[],future=[],drawing=null,keyboard={x:.5,y:.5};
  let invalidated=false,disposed=false,busy=false,generation=0,inFlight=null;
  let ownsImage=false,savedImage=null;
  const listeners=new AbortController();
  const panel=node(doc,'section');panel.className='suite-manual-hand-tone';
  panel.setAttribute('aria-label','Hands 手動範囲');
  panel.append(node(doc,'style',STYLE),node(doc,'h3','Hands · 手動トーン範囲'),
    node(doc,'p','After写真に本人が手・前腕の範囲を描きます。部位の自動検出や本人認証ではありません。'));
  const scope=node(doc,'p',`対象 Asset ${binding.assetID}`);panel.append(scope);
  const strength=node(doc,'input');strength.type='number';strength.min='0';
  strength.max='100';strength.step='any';strength.value=String(state.strength*100);
  strength.setAttribute('aria-label','手の均一化 Strength %');
  const toneRadius=node(doc,'input');toneRadius.type='number';toneRadius.min='1';
  toneRadius.max='6';toneRadius.step='1';toneRadius.value=String(state.radiusSourcePixels);
  toneRadius.setAttribute('aria-label','均一化 Radius 原寸px');
  const brushRadius=node(doc,'input');brushRadius.type='number';brushRadius.min='1';
  brushRadius.max='25';brushRadius.step='1';brushRadius.value='4';
  brushRadius.setAttribute('aria-label','ブラシ半径 %');
  const hardness=node(doc,'input');hardness.type='number';hardness.min='0';
  hardness.max='100';hardness.step='1';hardness.value='70';
  hardness.setAttribute('aria-label','ブラシ硬さ %');
  const grid=node(doc,'div');grid.className='suite-manual-hand-tone__grid';
  grid.append(label(doc,'Strength',strength),label(doc,'Radius',toneRadius),
    label(doc,'ブラシ半径',brushRadius),label(doc,'硬さ',hardness));panel.append(grid);
  const actions=node(doc,'div');actions.className='suite-manual-hand-tone__actions';
  const button=text=>{const element=node(doc,'button',text);element.type='button';return element;};
  const hand=button('手を描く'),forearm=button('前腕を描く');
  const add=button('範囲を追加'),erase=button('範囲を消去');
  const undo=button('戻す'),redo=button('やり直す');
  const submit=button('認証hostへ下書きを渡す'),cancel=button('下書きを破棄');
  actions.append(hand,forearm,add,erase,undo,redo,submit,cancel);panel.append(actions);
  const status=node(doc,'p','下書きのみ。保存・適用・Finalは未確認です。');
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
      'After写真のHands手動ブラシ。矢印で移動、Enterで描画、Escapeで取消');
    afterImage.setAttribute('aria-keyshortcuts',
      'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape');
    afterImage.style.touchAction='none';afterImage.style.outlineOffset='3px';
    ownsImage=true;
  }
  function releaseImage(){
    if(!ownsImage)return;
    for(const [key,value] of [['tabindex',savedImage.tabindex],
      ['role',savedImage.role],['aria-label',savedImage.label],
      ['aria-keyshortcuts',savedImage.shortcuts]]){
      if(value===null)afterImage.removeAttribute(key);
      else afterImage.setAttribute(key,value);
    }
    afterImage.style.touchAction=savedImage.touch;
    afterImage.style.outline=savedImage.outline;
    afterImage.style.outlineOffset=savedImage.outlineOffset;
    savedImage=null;ownsImage=false;
  }
  function dropDrawing(){
    if(!drawing)return;
    try{if(afterImage.hasPointerCapture?.(drawing.id))
      afterImage.releasePointerCapture(drawing.id);}catch{}
    drawing=null;
  }
  function retire(message){
    if(invalidated)return;
    invalidated=true;dropDrawing();state=empty();state.entries=[];
    history=[];future=[];generation++;
    inFlight?.abort();inFlight=null;busy=false;status.textContent=message;
  }
  function freshContext(){
    if(disposed||invalidated||!enabled||!afterImage.complete||
        !afterImage.naturalWidth||!afterImage.naturalHeight)
      throw Error('MANUAL_HAND_UI_AFTER_NOT_READY');
    let context,current;
    try{context=getContext();current=bindingOf(context);}catch{
      retire('対象・版・権限を確認できないため下書きを破棄しました。');
      throw Error('MANUAL_HAND_UI_CONTEXT_INVALID');
    }
    const key=[current.assetID,current.originalSHA256,current.sourceWidth,
      current.sourceHeight,context.savedRevision].join(':');
    if(key!==mountedKey||context.permissionExpired===true){
      retire('対象・版・権限が変わったため下書きを破棄しました。');
      throw Error('MANUAL_HAND_UI_STALE_ASSET_OR_REVISION');
    }
    if(context.ready!==true||context.dirty!==false||context.busy===true||
        context.view!=='after')throw Error('MANUAL_HAND_UI_CONTEXT_NOT_READY');
    return context;
  }
  function geometry(){
    const context=freshContext();
    if(busy)throw Error('MANUAL_HAND_UI_BUSY');
    if(context.expectedAfterURL&&afterImage.getAttribute('src')!==context.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {...context,afterRect:afterImage.getBoundingClientRect(),
      uprightWidth:context.uprightWidth??binding.sourceWidth,uprightHeight:context.uprightHeight??binding.sourceHeight,
      naturalWidth:afterImage.naturalWidth,naturalHeight:afterImage.naturalHeight};
  }
  function document(){
    freshContext();return makeManualHandToneDocument(binding,
      state.entries.map(entry=>clone(entry.stroke)),
      {strength:state.strength,radiusSourcePixels:state.radiusSourcePixels});
  }
  function update(change,message){
    if(busy)throw Error('MANUAL_HAND_UI_BUSY');
    freshContext();history.push(clone(state));if(history.length>128)history.shift();
    change();future=[];status.textContent=message;render();
  }
  function render(){
    let ready=false;
    try{geometry();ready=true;}catch{}
    if(ready)claimImage();else releaseImage();
    strength.value=String(state.strength*100);
    toneRadius.value=String(state.radiusSourcePixels);
    for(const control of [strength,toneRadius,brushRadius,hardness,
      hand,forearm,add,erase])control.disabled=!ready||busy;
    undo.disabled=!ready||busy||history.length===0;
    redo.disabled=!ready||busy||future.length===0;
    submit.disabled=!ready||busy||typeof onSubmit!=='function'||
      !state.entries.some(entry=>entry.stroke.operation==='ADD');
    cancel.disabled=disposed||invalidated||
      (!busy&&!drawing&&!state.entries.length&&!history.length);
    hand.setAttribute('aria-pressed',String(state.region==='hand'));
    forearm.setAttribute('aria-pressed',String(state.region==='forearm'));
    add.setAttribute('aria-pressed',String(state.operation==='ADD'));
    erase.setAttribute('aria-pressed',String(state.operation==='ERASE'));
    overlay.replaceChildren();if(!ready)return;
    try{
      const g=geometry(),box=afterImage.getBoundingClientRect();
      const parent=host.getBoundingClientRect();
      overlay.style.left=`${box.left-parent.left}px`;
      overlay.style.top=`${box.top-parent.top}px`;
      overlay.style.width=`${box.width}px`;overlay.style.height=`${box.height}px`;
      overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
      appendProjectedBrushOverlay(overlay,g,state.entries.map(entry=>entry.stroke));
    }catch{overlay.replaceChildren();}
  }
  function point(event){
    const mapped=mapAfterToLocalBrushPoint({...geometry(),clientX:event.clientX,
      clientY:event.clientY});return {u:mapped.x,v:mapped.y};
  }
  function addStroke(path){
    if(!path.length||state.entries.length>=MAX_STROKES||
        state.entries.reduce((sum,entry)=>sum+entry.stroke.path.length,path.length)>MAX_POINTS)
      throw Error('MANUAL_HAND_UI_CAPACITY');
    const stroke={operation:state.operation,path,
      radiusFraction:number(brushRadius,1,25)/100,
      hardness:number(hardness,0,100)/100};
    update(()=>state.entries.push({region:state.region,stroke}),
      '手・前腕の手動範囲を下書きへ追加しました。未保存です。');
  }
  function finish(event,cancelled){
    if(!drawing||drawing.id!==event.pointerId)return;
    const active=drawing;drawing=null;
    try{if(afterImage.hasPointerCapture?.(event.pointerId))
      afterImage.releasePointerCapture(event.pointerId);}catch{}
    if(cancelled||active.invalid){status.textContent='strokeを取消しました。';render();return;}
    try{const last=point(event);
      if(active.path.at(-1)?.u!==last.u||active.path.at(-1)?.v!==last.v)
        active.path.push(last);
      addStroke(active.path);
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='Afterの画像外・古い版ではstrokeを確定しません。';render();}
  }
  afterImage.addEventListener('pointerdown',event=>{
    if(drawing||event.isPrimary===false||
        (event.pointerType!=='touch'&&event.button!==0))return;
    try{const first=point(event);
      drawing={id:event.pointerId,path:[first],invalid:false};
      try{afterImage.setPointerCapture?.(event.pointerId);}catch{}
      event.preventDefault();render();
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='Afterの画像上だけ描画できます。';}
  },{signal:listeners.signal});
  afterImage.addEventListener('pointermove',event=>{
    if(!drawing||event.pointerId!==drawing.id)return;
    try{const next=point(event);
      if(drawing.path.length>=MAX_POINTS){drawing.invalid=true;return;}
      if(Math.abs(next.u-drawing.path.at(-1).u)+
          Math.abs(next.v-drawing.path.at(-1).v)>.0001)drawing.path.push(next);
    }catch{drawing.invalid=true;}
  },{signal:listeners.signal});
  afterImage.addEventListener('pointerup',event=>finish(event,false),
    {signal:listeners.signal});
  afterImage.addEventListener('pointercancel',event=>finish(event,true),
    {signal:listeners.signal});
  afterImage.addEventListener('focus',()=>{if(ownsImage)
    afterImage.style.outline='3px solid #145b84';},{signal:listeners.signal});
  afterImage.addEventListener('blur',()=>{if(ownsImage)
    afterImage.style.outline=savedImage.outline;},{signal:listeners.signal});
  afterImage.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      dropDrawing();if(inFlight){inFlight.abort();generation++;inFlight=null;busy=false;}
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
      try{const mapped=mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX:keyboard.x,afterY:keyboard.y});
        addStroke([{u:mapped.x,v:mapped.y}]);}
      catch{status.textContent='Afterの画像上だけ描画できます。';}
    }
  },{signal:listeners.signal});
  for(const [button,change] of [[hand,()=>{state.region='hand';}],
    [forearm,()=>{state.region='forearm';}],
    [add,()=>{state.operation='ADD';}],[erase,()=>{state.operation='ERASE';}]]){
    button.addEventListener('click',()=>{
      try{update(change,'描画モードを切り替えました。未保存です。');}catch{render();}
    },{signal:listeners.signal});
  }
  undo.addEventListener('click',()=>{
    if(!history.length)return;
    try{freshContext();future.push(clone(state));state=history.pop();
      status.textContent='下書きを戻しました。未保存です。';render();}catch{render();}
  },{signal:listeners.signal});
  redo.addEventListener('click',()=>{
    if(!future.length)return;
    try{freshContext();history.push(clone(state));state=future.pop();
      status.textContent='下書きをやり直しました。未保存です。';render();}catch{render();}
  },{signal:listeners.signal});
  strength.addEventListener('change',()=>{
    try{const value=number(strength,0,100)/100;
      update(()=>{state.strength=value;},'Strengthを変更しました。未保存です。');}
    catch{status.textContent='Strengthは0〜100%の有限値です。';render();}
  },{signal:listeners.signal});
  toneRadius.addEventListener('change',()=>{
    try{const value=number(toneRadius,1,6,true);
      update(()=>{state.radiusSourcePixels=value;},'Radiusを変更しました。未保存です。');}
    catch{status.textContent='Radiusは原寸1〜6pxの整数です。';render();}
  },{signal:listeners.signal});
  submit.addEventListener('click',async()=>{
    if(busy||disposed||typeof onSubmit!=='function')return;
    let candidate;
    try{candidate=document();}catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='下書き・版・権限を確認できずhostへ渡しません。';return;}
    busy=true;const token=++generation,controller=new AbortController();inFlight=controller;
    status.textContent='認証hostへ下書きを依頼中。実保存・Finalは未確認です。';render();
    try{
      await onSubmit(clone(candidate),{savedRevision:mounted.savedRevision,
        signal:controller.signal});
      if(disposed||token!==generation||controller.signal.aborted)return;
      freshContext();
      status.textContent='hostへ渡しました。実保存・適用・Finalは別途確認してください。';
    }catch(error){if(disposed||token!==generation)return;
      status.dataset.error=String(error?.message??error);
      status.textContent='依頼は完了していません。確認後に再実行できます。';
    }finally{if(!disposed&&token===generation){busy=false;inFlight=null;render();}}
  },{signal:listeners.signal});
  cancel.addEventListener('click',()=>{
    dropDrawing();inFlight?.abort();generation++;inFlight=null;busy=false;
    state=empty();state.entries=[];history=[];future=[];
    status.textContent='下書きを破棄しました。保存・適用は未確認です。';render();
  },{signal:listeners.signal});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(render):null;
  resize?.observe(afterImage);
  afterImage.addEventListener('load',render,{signal:listeners.signal});
  render();
  return Object.freeze({refresh:render,
    getDraft(){if(!invalidated){try{freshContext();}catch{}}
      return clone(state);},
    getDocument(){return document();},
    setEnabled(value){enabled=value===true;
      if(!enabled)retire('hostが無効化したため下書きを破棄しました。');render();},
    dispose(){disposed=true;generation++;inFlight?.abort();dropDrawing();
      listeners.abort();resize?.disconnect();overlay.remove();panel.remove();
      releaseImage();host.style.position=hostPosition;}});
}
