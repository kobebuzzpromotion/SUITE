import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {MANUAL_BLUSH_COLOR_VERSION} from './processing/manual-blush-color.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const MAX_STROKES=64,MAX_POINTS=4096,MAX_JSON_BYTES=96*1024;
const STYLE=`.suite-manual-blush{box-sizing:border-box;max-width:100%;min-width:0;padding:1rem;border:1px solid #cecac2;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}
.suite-manual-blush *{box-sizing:border-box}.suite-manual-blush h3{font:normal clamp(1.3rem,3vw,1.8rem)/1.25 Georgia,serif;margin:0 0 .4rem}.suite-manual-blush p{margin:.4rem 0 .8rem;overflow-wrap:anywhere}
.suite-manual-blush__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;min-width:0}.suite-manual-blush label{display:grid;gap:.2rem;min-width:0}
.suite-manual-blush input{width:100%;max-width:100%;min-width:0;min-height:44px;padding:.4rem;border:1px solid #77736b;border-radius:0;background:#fff;color:#242321;font:inherit}
.suite-manual-blush__actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:.8rem 0}.suite-manual-blush button{min-height:44px;min-width:44px;padding:.5rem .8rem;border:1px solid #494640;border-radius:0;background:#fff;color:#242321;font:inherit;cursor:pointer}
.suite-manual-blush button:disabled{cursor:not-allowed;opacity:.5}.suite-manual-blush :focus-visible{outline:3px solid #145b84;outline-offset:2px}.suite-manual-blush__scope{font-size:.8rem;color:#4c4843}
@media(max-width:600px){.suite-manual-blush{padding:.7rem}.suite-manual-blush__grid{grid-template-columns:minmax(0,1fr)}.suite-manual-blush__actions>*{flex:1 1 8rem}}
@media(prefers-reduced-motion:reduce){.suite-manual-blush *, .suite-manual-blush *::before, .suite-manual-blush *::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;

function exact(value,keys){
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
const clone=value=>structuredClone(value);
const node=(doc,tag,text='')=>{const result=doc.createElement(tag);result.textContent=text;return result;};
const labelled=(doc,text,input)=>{const label=node(doc,'label',text);label.append(input);return label;};
function checkedBinding(binding){
  if(!exact(binding,['assetID','originalSHA256','personID','sourceWidth','sourceHeight'])||
      typeof binding.assetID!=='string'||!UUID.test(binding.assetID)||
      typeof binding.originalSHA256!=='string'||!SHA.test(binding.originalSHA256)||
      typeof binding.personID!=='string'||!UUID.test(binding.personID)||
      !Number.isSafeInteger(binding.sourceWidth)||binding.sourceWidth<1||
      !Number.isSafeInteger(binding.sourceHeight)||binding.sourceHeight<1||
      binding.sourceWidth*binding.sourceHeight>8_000_000)
    throw Error('MANUAL_BLUSH_UI_BINDING_INVALID');
  return binding;
}
function selectedBinding(context){
  return checkedBinding({assetID:context?.assetID,originalSHA256:context?.originalSHA256,
    personID:context?.personID,sourceWidth:context?.sourceWidth,
    sourceHeight:context?.sourceHeight});
}
function colorSettings(settings){
  const color=exact(settings,['color','opacity'])?settings.color:undefined;
  if(!exact(settings,['color','opacity'])||!exact(color,['r','g','b'])||
      !['r','g','b'].every(channel=>Number.isSafeInteger(color[channel])&&
        color[channel]>=0&&color[channel]<=255)||
      typeof settings.opacity!=='number'||!Number.isFinite(settings.opacity)||
      Object.is(settings.opacity,-0)||settings.opacity<0||settings.opacity>1)
    throw Error('MANUAL_BLUSH_UI_SETTINGS_INVALID');
  return {color:{r:color.r,g:color.g,b:color.b},opacity:settings.opacity};
}
function hexColor(value){
  if(typeof value!=='string'||!/^#[a-f0-9]{6}$/iu.test(value))
    throw Error('MANUAL_BLUSH_UI_COLOR_INVALID');
  return {r:parseInt(value.slice(1,3),16),g:parseInt(value.slice(3,5),16),
    b:parseInt(value.slice(5,7),16)};
}
const toHex=({r,g,b})=>'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
function integer(input,min,max){
  if(input.value.trim()===''||!/^[0-9]+$/u.test(input.value.trim()))
    throw Error('MANUAL_BLUSH_UI_NUMBER_INVALID');
  const value=Number(input.value);
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw Error('MANUAL_BLUSH_UI_NUMBER_INVALID');
  return value;
}
function percent(input){
  const raw=input.value.trim();
  if(!/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/u.test(raw))
    throw Error('MANUAL_BLUSH_UI_OPACITY_INVALID');
  const value=Number(raw);
  if(!Number.isFinite(value)||value<0||value>100)
    throw Error('MANUAL_BLUSH_UI_OPACITY_INVALID');
  return value/100;
}

/** Flat saved strokes encode coordinates, not a verified left/right cheek ID. */
export function makeManualBlushDocument(binding,cheekStrokes,settings){
  checkedBinding(binding);
  const chosen=colorSettings(settings);
  if(!dense(cheekStrokes,1,MAX_STROKES))throw Error('MANUAL_BLUSH_UI_STROKES_INVALID');
  let points=0,hasAdd=false;
  const strokes=cheekStrokes.map(stroke=>{
    if(!exact(stroke,['operation','path','radiusFraction','hardness'])||
        !['ADD','ERASE'].includes(stroke.operation)||
        !dense(stroke.path,1,MAX_POINTS)||
        typeof stroke.radiusFraction!=='number'||!Number.isFinite(stroke.radiusFraction)||
        stroke.radiusFraction<.001||stroke.radiusFraction>.25||!unit(stroke.hardness))
      throw Error('MANUAL_BLUSH_UI_STROKE_INVALID');
    points+=stroke.path.length;if(points>MAX_POINTS)
      throw Error('MANUAL_BLUSH_UI_STROKE_CAPACITY');
    if(stroke.operation==='ADD')hasAdd=true;
    const path=stroke.path.map(point=>{
      if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
        throw Error('MANUAL_BLUSH_UI_POINT_INVALID');
      return {u:point.u,v:point.v};
    });
    return {operation:stroke.operation,path,radiusFraction:stroke.radiusFraction,
      hardness:stroke.hardness};
  });
  if(!hasAdd)throw Error('MANUAL_BLUSH_UI_ADD_REQUIRED');
  const result={schemaVersion:1,engineVersion:MANUAL_BLUSH_COLOR_VERSION,
    binding:{assetID:binding.assetID,originalSHA256:binding.originalSHA256,
      sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight,
      personID:binding.personID},cheekStrokes:strokes,settings:chosen};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_BLUSH_UI_JSON_LIMIT');
  return result;
}
function checkedInitial(initial,binding){
  if(!exact(initial,['schemaVersion','engineVersion','binding','cheekStrokes','settings'])||
      initial.schemaVersion!==1||initial.engineVersion!==MANUAL_BLUSH_COLOR_VERSION)
    throw Error('MANUAL_BLUSH_UI_INITIAL_INVALID');
  const validated=makeManualBlushDocument(initial.binding,initial.cheekStrokes,
    initial.settings);
  for(const field of ['assetID','originalSHA256','personID','sourceWidth','sourceHeight'])
    if(validated.binding[field]!==binding[field])
      throw Error('MANUAL_BLUSH_UI_INITIAL_BINDING_MISMATCH');
  return validated;
}

/**
 * Independent After-only draft UI. The chosen left/right side is an authoring
 * label, not a detected anatomical cheek, and is not encoded in Recipe v1.
 * A fresh authenticated host must verify Asset, Original, person, revision,
 * permission and saved-result readback. onSubmit cannot certify persistence.
 */
export function mountManualBlushUI({root,afterImage,getContext,onSubmit,
  initial,enabled=false}={}){
  if(!(root instanceof HTMLElement)||!(afterImage instanceof HTMLImageElement)||
      root.ownerDocument!==afterImage.ownerDocument||!afterImage.parentElement||
      typeof getContext!=='function'||
      (onSubmit!==undefined&&typeof onSubmit!=='function'))
    throw Error('MANUAL_BLUSH_UI_MOUNT_INVALID');
  const doc=root.ownerDocument,host=afterImage.parentElement;
  const mounted=getContext(),binding=selectedBinding(mounted);
  if(!Number.isSafeInteger(mounted.savedRevision)||mounted.savedRevision<1)
    throw Error('MANUAL_BLUSH_UI_CONTEXT_INVALID');
  const mountedKey=[binding.assetID,binding.originalSHA256,binding.personID,
    binding.sourceWidth,binding.sourceHeight,mounted.savedRevision].join(':');
  const existing=initial===undefined?null:checkedInitial(initial,binding);
  const initialState=()=>({strokes:(existing?.cheekStrokes??[]).map(stroke=>
      ({side:'restored',stroke:clone(stroke)})),color:toHex(existing?.settings.color??
      {r:200,g:90,b:112}),opacity:existing?.settings.opacity??.5,
    side:'left',operation:'ADD'});
  let state=initialState(),history=[],future=[],drawing=null,keyboard={x:.5,y:.5};
  let busy=false,disposed=false,invalidated=false,generation=0,inFlight=null;
  let ownsImage=false,savedImage=null;
  const events=new AbortController();
  const panel=node(doc,'section');panel.className='suite-manual-blush';
  panel.setAttribute('aria-label','Blush 手動頬範囲');
  panel.append(node(doc,'style',STYLE),node(doc,'h3','Blush · 手動頬範囲'),
    node(doc,'p','After写真に本人が範囲を描きます。左右は編集時のラベルで、頬の自動検出ではありません。保存・Finalは未接続です。'));
  const scope=node(doc,'p',`対象 Asset ${binding.assetID} / 人物 ${binding.personID}`);
  scope.className='suite-manual-blush__scope';panel.append(scope);
  const color=node(doc,'input');color.type='color';color.value=state.color;
  color.setAttribute('aria-label','頬の色');
  const opacity=node(doc,'input');opacity.type='number';opacity.min='0';
  opacity.max='100';opacity.step='any';opacity.value=String(state.opacity*100);
  opacity.setAttribute('aria-label','Blush 不透明度 %');
  const radius=node(doc,'input');radius.type='number';radius.min='1';radius.max='25';
  radius.step='1';radius.value='4';radius.setAttribute('aria-label','ブラシ半径 %');
  const hardness=node(doc,'input');hardness.type='number';hardness.min='0';
  hardness.max='100';hardness.step='1';hardness.value='70';
  hardness.setAttribute('aria-label','ブラシ硬さ %');
  const grid=node(doc,'div');grid.className='suite-manual-blush__grid';
  grid.append(labelled(doc,'色',color),labelled(doc,'Opacity',opacity),
    labelled(doc,'半径',radius),labelled(doc,'硬さ',hardness));panel.append(grid);
  const actions=node(doc,'div');actions.className='suite-manual-blush__actions';
  const button=(text)=>{const result=node(doc,'button',text);result.type='button';return result;};
  const left=button('左頬を描く'),right=button('右頬を描く');
  const add=button('範囲を追加'),erase=button('範囲を消去');
  const undo=button('戻す'),redo=button('やり直す');
  const submit=button('hostへ下書きを渡す'),cancel=button('下書きを破棄');
  actions.append(left,right,add,erase,undo,redo,submit,cancel);panel.append(actions);
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
      'After写真のBlush手動ブラシ。矢印で移動、Enterで描画、Escapeで取消');
    afterImage.setAttribute('aria-keyshortcuts',
      'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape');
    afterImage.style.touchAction='none';afterImage.style.outlineOffset='3px';
    ownsImage=true;
  }
  function releaseImage(){
    if(!ownsImage)return;
    for(const [name,value] of [['tabindex',savedImage.tabindex],
      ['role',savedImage.role],['aria-label',savedImage.label],
      ['aria-keyshortcuts',savedImage.shortcuts]]){
      if(value===null)afterImage.removeAttribute(name);
      else afterImage.setAttribute(name,value);
    }
    afterImage.style.touchAction=savedImage.touch;
    afterImage.style.outline=savedImage.outline;
    afterImage.style.outlineOffset=savedImage.outlineOffset;
    ownsImage=false;savedImage=null;
  }
  function dropDrawing(){
    if(!drawing)return;
    try{if(afterImage.hasPointerCapture?.(drawing.id))
      afterImage.releasePointerCapture(drawing.id);}catch{}
    drawing=null;
  }
  function retire(reason){
    if(invalidated)return;
    invalidated=true;dropDrawing();state=initialState();state.strokes=[];
    history=[];future=[];generation++;
    if(inFlight)inFlight.abort();inFlight=null;busy=false;
    status.textContent=reason;
  }
  function freshContext(){
    if(disposed||invalidated||!enabled||!afterImage.complete||
        !afterImage.naturalWidth||!afterImage.naturalHeight)
      throw Error('MANUAL_BLUSH_UI_AFTER_NOT_READY');
    let context,current;
    try{context=getContext();current=selectedBinding(context);}catch{
      retire('対象・版・権限を確認できないため下書きを破棄しました。');
      throw Error('MANUAL_BLUSH_UI_CONTEXT_INVALID');
    }
    const key=[current.assetID,current.originalSHA256,current.personID,
      current.sourceWidth,current.sourceHeight,context.savedRevision].join(':');
    if(key!==mountedKey||context.permissionExpired===true){
      retire('対象・版・権限が変わったため下書きを破棄しました。');
      throw Error('MANUAL_BLUSH_UI_STALE_ASSET_PERSON_OR_REVISION');
    }
    if(context.ready!==true||context.dirty!==false||context.busy===true||
        context.view!=='after')
      throw Error('MANUAL_BLUSH_UI_CONTEXT_NOT_READY');
    return context;
  }
  function geometry(){
    const context=freshContext();
    // A pending host write must still observe an Asset/revision/permission change.
    if(busy)throw Error('MANUAL_BLUSH_UI_BUSY');
    if(context.expectedAfterURL&&afterImage.getAttribute('src')!==context.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {...context,afterRect:afterImage.getBoundingClientRect(),
      uprightWidth:context.uprightWidth??binding.sourceWidth,uprightHeight:context.uprightHeight??binding.sourceHeight,
      naturalWidth:afterImage.naturalWidth,naturalHeight:afterImage.naturalHeight};
  }
  function strokeList(){return state.strokes.map(entry=>clone(entry.stroke));}
  function draft(){
    freshContext();return makeManualBlushDocument(binding,
      strokeList(),{color:hexColor(state.color),opacity:state.opacity});
  }
  function update(change,message){
    if(busy)throw Error('MANUAL_BLUSH_UI_BUSY');
    freshContext();
    history.push(clone(state));if(history.length>128)history.shift();
    change();future=[];status.textContent=message;render();
  }
  function render(){
    let ready=false;
    try{geometry();ready=true;}catch{}
    if(ready)claimImage();else releaseImage();
    color.value=state.color;opacity.value=String(state.opacity*100);
    for(const control of [color,opacity,radius,hardness,left,right,add,erase])
      control.disabled=!ready||busy;
    undo.disabled=!ready||busy||history.length===0;
    redo.disabled=!ready||busy||future.length===0;
    submit.disabled=!ready||busy||typeof onSubmit!=='function'||
      !state.strokes.some(entry=>entry.stroke.operation==='ADD');
    cancel.disabled=disposed||invalidated||
      (!busy&&!drawing&&!state.strokes.length&&!history.length);
    left.setAttribute('aria-pressed',String(state.side==='left'));
    right.setAttribute('aria-pressed',String(state.side==='right'));
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
      appendProjectedBrushOverlay(overlay,g,state.strokes.map(entry=>entry.stroke),{color:[158,74,104]});
    }catch{overlay.replaceChildren();}
  }
  function pointerPoint(event){
    const mapped=mapAfterToLocalBrushPoint({...geometry(),clientX:event.clientX,
      clientY:event.clientY});
    return {u:mapped.x,v:mapped.y};
  }
  function addStroke(path){
    if(!path.length||state.strokes.length>=MAX_STROKES||
        state.strokes.reduce((sum,entry)=>sum+entry.stroke.path.length,path.length)>MAX_POINTS)
      throw Error('MANUAL_BLUSH_UI_STROKE_CAPACITY');
    const shape={operation:state.operation,path,radiusFraction:integer(radius,1,25)/100,
      hardness:integer(hardness,0,100)/100};
    update(()=>state.strokes.push({side:state.side,stroke:shape}),
      `${state.side==='left'?'左':'右'}頬の手動範囲を追加しました。未保存です。`);
  }
  function end(event,cancelled){
    if(!drawing||drawing.id!==event.pointerId)return;
    const active=drawing;drawing=null;
    try{if(afterImage.hasPointerCapture?.(event.pointerId))
      afterImage.releasePointerCapture(event.pointerId);}catch{}
    if(cancelled||active.invalid){status.textContent='strokeを取消しました。';render();return;}
    try{const last=pointerPoint(event);
      if(active.path.at(-1)?.u!==last.u||active.path.at(-1)?.v!==last.v)
        active.path.push(last);
      addStroke(active.path);
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='Afterの画像外・古い版ではstrokeを確定しません。';render();}
  }
  afterImage.addEventListener('pointerdown',event=>{
    if(drawing||event.isPrimary===false||
        (event.pointerType!=='touch'&&event.button!==0))return;
    try{const point=pointerPoint(event);
      drawing={id:event.pointerId,path:[point],invalid:false};
      try{afterImage.setPointerCapture?.(event.pointerId);}catch{}
      event.preventDefault();render();}
    catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='Afterの画像上だけ描画できます。';}
  },{signal:events.signal});
  afterImage.addEventListener('pointermove',event=>{
    if(!drawing||event.pointerId!==drawing.id)return;
    try{const point=pointerPoint(event);
      if(drawing.path.length>=MAX_POINTS){drawing.invalid=true;return;}
      if(Math.abs(point.u-drawing.path.at(-1).u)+
          Math.abs(point.v-drawing.path.at(-1).v)>.0001)drawing.path.push(point);
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
      try{const point=mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX:keyboard.x,afterY:keyboard.y});
        addStroke([{u:point.x,v:point.y}]);}
      catch{status.textContent='Afterの画像上だけ描画できます。';}
    }
  },{signal:events.signal});
  const switchMode=(button,change)=>button.addEventListener('click',()=>{
    try{update(change,'描画モードを切り替えました。未保存です。');}
    catch{render();}
  },{signal:events.signal});
  switchMode(left,()=>{state.side='left';});switchMode(right,()=>{state.side='right';});
  switchMode(add,()=>{state.operation='ADD';});switchMode(erase,()=>{state.operation='ERASE';});
  undo.addEventListener('click',()=>{
    if(!history.length)return;
    try{freshContext();future.push(clone(state));state=history.pop();
      status.textContent='下書きを戻しました。未保存です。';render();}catch{render();}
  },{signal:events.signal});
  redo.addEventListener('click',()=>{
    if(!future.length)return;
    try{freshContext();history.push(clone(state));state=future.pop();
      status.textContent='下書きをやり直しました。未保存です。';render();}catch{render();}
  },{signal:events.signal});
  color.addEventListener('change',()=>{
    try{const value=toHex(hexColor(color.value));
      update(()=>{state.color=value;},'色を下書きへ変更しました。未保存です。');}
    catch{status.textContent='色は6桁の16進RGBです。';render();}
  },{signal:events.signal});
  opacity.addEventListener('change',()=>{
    try{const value=percent(opacity);
      update(()=>{state.opacity=value;},'Opacityを下書きへ変更しました。未保存です。');}
    catch{status.textContent='Opacityは0〜100%の有限値です。';render();}
  },{signal:events.signal});
  submit.addEventListener('click',async()=>{
    if(busy||disposed||typeof onSubmit!=='function')return;
    let candidate;
    try{candidate=draft();}catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='下書き・版・権限を確認できずhostへ渡しません。';return;}
    busy=true;const token=++generation,abort=new AbortController();inFlight=abort;
    status.textContent='hostへ下書きを依頼中。実保存・Finalは未確認です。';render();
    try{
      await onSubmit(clone(candidate),{savedRevision:mounted.savedRevision,
        personID:binding.personID,signal:abort.signal});
      if(disposed||token!==generation||abort.signal.aborted)return;
      freshContext();
      status.textContent='hostへ渡しました。実保存・適用・Finalは別途確認してください。';
    }catch(error){if(disposed||token!==generation)return;
      status.dataset.error=String(error?.message??error);
      status.textContent='依頼は完了していません。確認後に再実行できます。';}
    finally{if(!disposed&&token===generation){busy=false;inFlight=null;render();}}
  },{signal:events.signal});
  cancel.addEventListener('click',()=>{
    dropDrawing();if(inFlight)inFlight.abort();generation++;inFlight=null;busy=false;
    state=initialState();state.strokes=[];history=[];future=[];
    status.textContent='下書きを破棄しました。保存・適用は未確認です。';render();
  },{signal:events.signal});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(render):null;
  resize?.observe(afterImage);
  afterImage.addEventListener('load',render,{signal:events.signal});
  render();
  return Object.freeze({refresh:render,
    getDraft(){if(!invalidated){try{freshContext();}catch{}}
      return clone({strokes:state.strokes,color:state.color,
      opacity:state.opacity,side:state.side,operation:state.operation});},
    getDocument(){return draft();},
    setEnabled(value){enabled=value===true;
      if(!enabled)retire('hostが無効化したため下書きを破棄しました。');
      render();},
    reset(next){
      freshContext();
      if(inFlight)inFlight.abort();generation++;busy=false;inFlight=null;
      dropDrawing();history=[];future=[];
      const checked=next===undefined?null:checkedInitial(next,binding);
      state={strokes:(checked?.cheekStrokes??[]).map(stroke=>
        ({side:'restored',stroke:clone(stroke)})),
        color:toHex(checked?.settings.color??{r:200,g:90,b:112}),
        opacity:checked?.settings.opacity??.5,
        side:'left',operation:'ADD'};
      status.textContent='下書きを再読込しました。保存・Finalは未確認です。';render();
    },
    dispose(){disposed=true;generation++;if(inFlight)inFlight.abort();
      dropDrawing();
      events.abort();resize?.disconnect();overlay.remove();panel.remove();
      releaseImage();host.style.position=hostPosition;}});
}
