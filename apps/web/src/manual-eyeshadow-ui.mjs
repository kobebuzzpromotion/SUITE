import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {MANUAL_EYESHADOW_COLOR_VERSION} from './processing/manual-eyeshadow-color.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const ROLES=['eyeArea','irisProtect','pupilProtect'];
const MAX_STROKES=64,MAX_POINTS=4096,MAX_JSON=96*1024;
const STYLE=`.suite-manual-eyeshadow{box-sizing:border-box;max-width:100%;padding:1rem;border:1px solid #ccc8c0;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}.suite-manual-eyeshadow *{box-sizing:border-box}.suite-manual-eyeshadow h3{font:normal 1.5rem/1.25 Georgia,serif;margin:0 0 .4rem}.suite-manual-eyeshadow p{overflow-wrap:anywhere}.suite-manual-eyeshadow__controls{display:flex;flex-wrap:wrap;gap:.5rem}.suite-manual-eyeshadow button,.suite-manual-eyeshadow input{min-height:44px;min-width:44px;border:1px solid #66625c;border-radius:0;background:#fff;color:#242321;font:inherit}.suite-manual-eyeshadow button{padding:.5rem .7rem;cursor:pointer}.suite-manual-eyeshadow input{padding:.4rem}.suite-manual-eyeshadow label{display:grid;gap:.25rem;min-width:7rem}.suite-manual-eyeshadow :focus-visible{outline:3px solid #145b84;outline-offset:2px}.suite-manual-eyeshadow button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:600px){.suite-manual-eyeshadow{padding:.6rem}.suite-manual-eyeshadow__controls>*{flex:1 1 9rem}}@media(prefers-reduced-motion:reduce){.suite-manual-eyeshadow *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`;
const clone=value=>structuredClone(value);
const node=(doc,tag,text='')=>{const element=doc.createElement(tag);element.textContent=text;return element;};
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==null&&proto!==Object.prototype&&
      !(Object.getPrototypeOf(proto)===null&&
        Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object'))
    return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
  });
}
function dense(value,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max||
      Reflect.ownKeys(value).length!==value.length+1)return false;
  return Array.from({length:value.length},(_,index)=>index).every(index=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
  });
}
function checkedBinding(value){
  if(!exact(value,['assetID','originalSHA256','personID','sourceWidth','sourceHeight'])||
      typeof value.assetID!=='string'||!UUID.test(value.assetID)||
      typeof value.originalSHA256!=='string'||!SHA.test(value.originalSHA256)||
      typeof value.personID!=='string'||!UUID.test(value.personID)||
      !Number.isSafeInteger(value.sourceWidth)||value.sourceWidth<1||
      !Number.isSafeInteger(value.sourceHeight)||value.sourceHeight<1||
      !Number.isSafeInteger(value.sourceWidth*value.sourceHeight)||
      value.sourceWidth*value.sourceHeight>8_000_000)
    throw Error('MANUAL_EYESHADOW_UI_BINDING_INVALID');
  return value;
}
const fromContext=value=>checkedBinding({assetID:value?.assetID,
  originalSHA256:value?.originalSHA256,personID:value?.personID,
  sourceWidth:value?.sourceWidth,sourceHeight:value?.sourceHeight});
function settingsOf(settings){
  if(!exact(settings,['color','opacity'])||!exact(settings.color,['r','g','b'])||
      !['r','g','b'].every(key=>Number.isSafeInteger(settings.color[key])&&
        settings.color[key]>=0&&settings.color[key]<=255)||
      !unit(settings.opacity)||Object.is(settings.opacity,-0))
    throw Error('MANUAL_EYESHADOW_UI_SETTINGS_INVALID');
  return clone(settings);
}
function checkStrokes(strokes){
  if(!exact(strokes,ROLES))throw Error('MANUAL_EYESHADOW_UI_STROKES_INVALID');
  let total=0,points=0;
  const safe={};
  for(const role of ROLES){
    if(!dense(strokes[role],1,MAX_STROKES)||
        !strokes[role].some(item=>item?.operation==='ADD'))
      throw Error('MANUAL_EYESHADOW_UI_ROLE_REQUIRED');
    safe[role]=strokes[role].map(item=>{
      if(!exact(item,['operation','path','radiusFraction','hardness'])||
          !['ADD','ERASE'].includes(item.operation)||
          !dense(item.path,1,MAX_POINTS)||
          typeof item.radiusFraction!=='number'||!Number.isFinite(item.radiusFraction)||
          item.radiusFraction<.001||item.radiusFraction>.25||!unit(item.hardness))
        throw Error('MANUAL_EYESHADOW_UI_STROKE_INVALID');
      total++;points+=item.path.length;
      if(total>MAX_STROKES||points>MAX_POINTS)
        throw Error('MANUAL_EYESHADOW_UI_CAPACITY');
      return {operation:item.operation,path:item.path.map(point=>{
        if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
          throw Error('MANUAL_EYESHADOW_UI_POINT_INVALID');
        return {u:point.u,v:point.v};
      }),radiusFraction:item.radiusFraction,hardness:item.hardness};
    });
  }
  return safe;
}
const colorFromHex=value=>{
  if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))
    throw Error('MANUAL_EYESHADOW_UI_COLOR_INVALID');
  return {r:parseInt(value.slice(1,3),16),g:parseInt(value.slice(3,5),16),
    b:parseInt(value.slice(5,7),16)};
};
const toHex=color=>'#'+['r','g','b'].map(k=>color[k].toString(16).padStart(2,'0')).join('');

/** Structural normalized draft, not a saved Recipe or authority proof. */
export function makeManualEyeshadowDraft(binding,eye,strokes,settings){
  checkedBinding(binding);
  if(!['image-left','image-right'].includes(eye))
    throw Error('MANUAL_EYESHADOW_UI_EYE_INVALID');
  const result={schemaVersion:1,engineVersion:MANUAL_EYESHADOW_COLOR_VERSION,
    representation:'normalized-owner-manual-eye-area-protections-v1',
    binding:clone(binding),eye,strokes:checkStrokes(strokes),
    settings:settingsOf(settings)};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>MAX_JSON)
    throw Error('MANUAL_EYESHADOW_UI_JSON_LIMIT');
  return result;
}

/** Independent After-only UI. Submission callback cannot certify persistence. */
export function mountManualEyeshadowUI({root,afterImage,getContext,onSubmit,
  initial,enabled=false}={}){
  if(!(root instanceof HTMLElement)||!(afterImage instanceof HTMLImageElement)||
      root.ownerDocument!==afterImage.ownerDocument||!afterImage.parentElement||
      typeof getContext!=='function'||
      (onSubmit!==undefined&&typeof onSubmit!=='function'))
    throw Error('MANUAL_EYESHADOW_UI_MOUNT_INVALID');
  const doc=root.ownerDocument,host=afterImage.parentElement,mounted=getContext();
  const binding=fromContext(mounted);
  if(!Number.isSafeInteger(mounted.savedRevision)||mounted.savedRevision<1)
    throw Error('MANUAL_EYESHADOW_UI_CONTEXT_INVALID');
  const pinned=[binding.assetID,binding.originalSHA256,binding.personID,
    binding.sourceWidth,binding.sourceHeight,mounted.savedRevision].join(':');
  if(initial!==undefined){
    if(!exact(initial,['schemaVersion','engineVersion','representation','binding','eye','strokes','settings'])||
        initial.schemaVersion!==1||initial.engineVersion!==MANUAL_EYESHADOW_COLOR_VERSION||
        initial.representation!=='normalized-owner-manual-eye-area-protections-v1')
      throw Error('MANUAL_EYESHADOW_UI_INITIAL_INVALID');
    makeManualEyeshadowDraft(initial.binding,initial.eye,initial.strokes,initial.settings);
    if(['assetID','originalSHA256','personID','sourceWidth','sourceHeight'].some(key=>
      initial.binding[key]!==binding[key]))
      throw Error('MANUAL_EYESHADOW_UI_INITIAL_BINDING_MISMATCH');
  }
  const initialState=()=>({eye:initial?.eye??'image-left',role:'eyeArea',
    operation:'ADD',strokes:clone(initial?.strokes??
      {eyeArea:[],irisProtect:[],pupilProtect:[]}),
    color:toHex(initial?.settings.color??{r:125,g:78,b:100}),
    opacity:initial?.settings.opacity??.5});
  let state=initialState(),history=[],future=[],drawing=null,keyboard={x:.5,y:.5};
  let disposed=false,invalid=false,busy=false,generation=0,inFlight=null;
  const events=new AbortController();
  const panel=node(doc,'section');panel.className='suite-manual-eyeshadow';
  panel.setAttribute('aria-label','Eyeshadow 本人手描き');
  panel.append(node(doc,'style',STYLE),node(doc,'h3','Eyeshadow · 本人手描き'),
    node(doc,'p','After写真で眼周囲の彩色範囲と、虹彩・瞳孔の保護範囲を別々に描きます。眼位置の自動検出や公式スタイル、実保存は未接続です。'));
  const controls=node(doc,'div');controls.className='suite-manual-eyeshadow__controls';
  const button=text=>{const item=node(doc,'button',text);item.type='button';return item;};
  const left=button('画像左眼'),right=button('画像右眼'),
    area=button('眼周囲を彩色'),iris=button('虹彩を保護'),pupil=button('瞳孔を保護'),
    add=button('範囲を追加'),erase=button('範囲を消去'),undo=button('戻す'),
    redo=button('やり直す'),submit=button('hostへ下書きを渡す'),
    cancel=button('下書きを破棄');
  const color=node(doc,'input');color.type='color';color.value=state.color;
  color.setAttribute('aria-label','Eyeshadowの色');
  const opacity=node(doc,'input');opacity.type='number';opacity.min='0';
  opacity.max='100';opacity.step='any';opacity.value=String(state.opacity*100);
  opacity.setAttribute('aria-label','Eyeshadow opacity %');
  const radius=node(doc,'input');radius.type='number';radius.min='0.1';
  radius.max='25';radius.step='any';radius.value='4';
  radius.setAttribute('aria-label','ブラシ半径 %');
  const hardness=node(doc,'input');hardness.type='number';hardness.min='0';
  hardness.max='100';hardness.step='any';hardness.value='70';
  hardness.setAttribute('aria-label','ブラシ硬さ %');
  const labelled=(text,input)=>{const item=node(doc,'label',text);item.append(input);return item;};
  controls.append(left,right,area,iris,pupil,add,erase,labelled('色',color),
    labelled('Opacity',opacity),labelled('半径',radius),labelled('硬さ',hardness),
    undo,redo,submit,cancel);panel.append(controls);
  const status=node(doc,'p','下書きのみ。保存・適用・Finalは未確認です。');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  panel.append(status);root.append(panel);
  const overlay=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.setAttribute('aria-hidden','true');overlay.style.position='absolute';
  overlay.style.pointerEvents='none';
  const oldPosition=host.style.position;
  if(getComputedStyle(host).position==='static')host.style.position='relative';
  host.append(overlay);
  const previous={tabindex:afterImage.getAttribute('tabindex'),
    role:afterImage.getAttribute('role'),label:afterImage.getAttribute('aria-label'),
    shortcuts:afterImage.getAttribute('aria-keyshortcuts'),
    touch:afterImage.style.touchAction,outline:afterImage.style.outline};
  let imageClaimed=false;
  function claim(){
    if(imageClaimed)return;imageClaimed=true;afterImage.tabIndex=0;
    afterImage.setAttribute('role','button');
    afterImage.setAttribute('aria-label',
      'After写真のEyeshadow手描き。矢印で移動、Enterで点、Escapeで取消');
    afterImage.setAttribute('aria-keyshortcuts',
      'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape');
    afterImage.style.touchAction='none';
  }
  function release(){
    if(!imageClaimed)return;imageClaimed=false;
    for(const [key,value] of [['tabindex',previous.tabindex],['role',previous.role],
      ['aria-label',previous.label],['aria-keyshortcuts',previous.shortcuts]]){
      if(value===null)afterImage.removeAttribute(key);else afterImage.setAttribute(key,value);
    }
    afterImage.style.touchAction=previous.touch;afterImage.style.outline=previous.outline;
  }
  function dropDrawing(){
    if(!drawing)return;try{afterImage.releasePointerCapture?.(drawing.id);}catch{}
    drawing=null;
  }
  function retire(reason){
    if(invalid)return;invalid=true;dropDrawing();state=initialState();
    state.strokes={eyeArea:[],irisProtect:[],pupilProtect:[]};
    history=[];future=[];generation++;inFlight?.abort();inFlight=null;busy=false;
    status.textContent=reason;
  }
  function fresh(){
    if(disposed||invalid||!enabled||!afterImage.complete||
        !afterImage.naturalWidth||!afterImage.naturalHeight)
      throw Error('MANUAL_EYESHADOW_UI_AFTER_NOT_READY');
    let current,b;
    try{current=getContext();b=fromContext(current);}catch{
      retire('対象・版・権限が不明なため下書きを破棄しました。');
      throw Error('MANUAL_EYESHADOW_UI_CONTEXT_INVALID');
    }
    const key=[b.assetID,b.originalSHA256,b.personID,b.sourceWidth,b.sourceHeight,
      current.savedRevision].join(':');
    if(key!==pinned||current.permissionExpired===true){
      retire('Asset・人物・版・権限が変わったため下書きを破棄しました。');
      throw Error('MANUAL_EYESHADOW_UI_STALE_CONTEXT');
    }
    if(current.ready!==true||current.dirty!==false||current.busy===true||
        current.view!=='after')throw Error('MANUAL_EYESHADOW_UI_CONTEXT_NOT_READY');
    return current;
  }
  function geometry(){
    const current=fresh();return {...current,
      afterRect:afterImage.getBoundingClientRect(),
      naturalWidth:afterImage.naturalWidth,naturalHeight:afterImage.naturalHeight,
      uprightWidth:current.uprightWidth??binding.sourceWidth,uprightHeight:current.uprightHeight??binding.sourceHeight};
  }
  function pointerPoint(event){
    const mapped=mapAfterToLocalBrushPoint({...geometry(),clientX:event.clientX,
      clientY:event.clientY});return {u:mapped.x,v:mapped.y};
  }
  function change(fn,message){
    if(busy)throw Error('MANUAL_EYESHADOW_UI_BUSY');fresh();
    dropDrawing();
    const previous=clone(state);fn();history.push(previous);
    if(history.length>128)history.shift();future=[];
    status.textContent=message;render();
  }
  function stroke(path){
    const total=ROLES.reduce((sum,role)=>sum+state.strokes[role].length,0);
    const points=ROLES.reduce((sum,role)=>sum+
      state.strokes[role].reduce((sub,item)=>sub+item.path.length,0),0);
    if(!path.length||total>=MAX_STROKES||points+path.length>MAX_POINTS)
      throw Error('MANUAL_EYESHADOW_UI_CAPACITY');
    const r=Number(radius.value.trim()),h=Number(hardness.value.trim());
    if(!Number.isFinite(r)||r<.1||r>25||radius.value.trim()===''||
        !Number.isFinite(h)||h<0||h>100||hardness.value.trim()==='')
      throw Error('MANUAL_EYESHADOW_UI_BRUSH_INVALID');
    const entry={operation:state.operation,path,radiusFraction:r/100,hardness:h/100};
    change(()=>state.strokes[state.role].push(entry),
      `${state.role} の手動範囲を追加しました。未保存です。`);
  }
  function document(){
    fresh();return makeManualEyeshadowDraft(binding,state.eye,state.strokes,
      {color:colorFromHex(state.color),opacity:state.opacity});
  }
  function render(){
    let ready=false;try{geometry();ready=!busy;}catch{}
    if(ready)claim();else release();
    color.value=state.color;opacity.value=String(state.opacity*100);
    for(const item of [left,right,area,iris,pupil,add,erase,color,opacity,radius,hardness])
      item.disabled=!ready;
    undo.disabled=!ready||history.length===0;redo.disabled=!ready||future.length===0;
    submit.disabled=!ready||typeof onSubmit!=='function'||
      !ROLES.every(role=>state.strokes[role].some(item=>item.operation==='ADD'));
    cancel.disabled=disposed||invalid||
      (!busy&&!drawing&&!history.length&&!ROLES.some(role=>state.strokes[role].length));
    for(const [button,value,selected] of [[left,'image-left',state.eye],
      [right,'image-right',state.eye],[area,'eyeArea',state.role],
      [iris,'irisProtect',state.role],[pupil,'pupilProtect',state.role],
      [add,'ADD',state.operation],[erase,'ERASE',state.operation]])
      button.setAttribute('aria-pressed',String(value===selected));
    overlay.replaceChildren();if(!ready)return;
    try{
      const g=geometry(),box=afterImage.getBoundingClientRect(),
        parent=host.getBoundingClientRect();
      overlay.style.left=`${box.left-parent.left}px`;
      overlay.style.top=`${box.top-parent.top}px`;
      overlay.style.width=`${box.width}px`;overlay.style.height=`${box.height}px`;
      overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
      for(const role of ROLES)appendProjectedBrushOverlay(overlay,g,state.strokes[role]);
    }catch{overlay.replaceChildren();}
  }
  function end(event,cancelled){
    if(!drawing||drawing.id!==event.pointerId)return;
    const active=drawing;drawing=null;
    try{afterImage.releasePointerCapture?.(event.pointerId);}catch{}
    if(cancelled||active.invalid){status.textContent='strokeを取消しました。';render();return;}
    try{const last=pointerPoint(event);
      if(active.path.at(-1)?.u!==last.u||active.path.at(-1)?.v!==last.v)
        active.path.push(last);
      stroke(active.path);
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='After画像外・古い版ではstrokeを確定しません。';render();}
  }
  afterImage.addEventListener('pointerdown',event=>{
    if(drawing||event.isPrimary===false||
        (event.pointerType!=='touch'&&event.button!==0))return;
    try{const p=pointerPoint(event);drawing={id:event.pointerId,path:[p],invalid:false};
      afterImage.setPointerCapture?.(event.pointerId);event.preventDefault();}
    catch{status.textContent='After画像内だけ描画できます。';}
  },{signal:events.signal});
  afterImage.addEventListener('pointermove',event=>{
    if(!drawing||drawing.id!==event.pointerId)return;
    try{const p=pointerPoint(event);
      if(drawing.path.length>=MAX_POINTS){drawing.invalid=true;return;}
      if(Math.abs(p.u-drawing.path.at(-1).u)+
          Math.abs(p.v-drawing.path.at(-1).v)>.0001)drawing.path.push(p);
    }catch{drawing.invalid=true;}
  },{signal:events.signal});
  afterImage.addEventListener('pointerup',event=>end(event,false),{signal:events.signal});
  afterImage.addEventListener('pointercancel',event=>end(event,true),{signal:events.signal});
  afterImage.addEventListener('focus',()=>{if(imageClaimed)
    afterImage.style.outline='3px solid #145b84';},{signal:events.signal});
  afterImage.addEventListener('blur',()=>{if(imageClaimed)
    afterImage.style.outline=previous.outline;},{signal:events.signal});
  afterImage.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      dropDrawing();if(inFlight){inFlight.abort();generation++;
        inFlight=null;busy=false;}
      status.textContent='進行中の操作を取消しました。未保存です。';render();return;
    }
    let g;try{g=geometry();}catch{return;}
    const dx=event.key==='ArrowRight'?.01:event.key==='ArrowLeft'?-.01:0;
    const dy=event.key==='ArrowDown'?.01:event.key==='ArrowUp'?-.01:0;
    if(dx||dy){event.preventDefault();const next={x:Math.max(0,Math.min(1,keyboard.x+dx)),
      y:Math.max(0,Math.min(1,keyboard.y+dy))};
      try{mapAfterImagePointToLocalBrushPoint({...g,afterX:next.x,afterY:next.y});
        keyboard=next;status.textContent=`位置 ${Math.round(next.x*100)}%, ${Math.round(next.y*100)}%`;}
      catch{status.textContent='余白・Crop外には移動できません。';}
    }else if(event.key==='Enter'||event.key===' '){
      event.preventDefault();try{const p=mapAfterImagePointToLocalBrushPoint({...g,
        afterX:keyboard.x,afterY:keyboard.y});stroke([{u:p.x,v:p.y}]);}
      catch{status.textContent='After画像内だけ描画できます。';}
    }
  },{signal:events.signal});
  const mode=(button,changeMode,message='下書きの対象を切り替えました。未保存です。')=>button.addEventListener('click',()=>{
    try{change(changeMode,message);}
    catch{render();}
  },{signal:events.signal});
  // One draft document is bound to one image-side eye. Never relabel prior
  // strokes as the other eye merely because the selection button changed.
  mode(left,()=>{if(state.eye!=='image-left'){
    state.eye='image-left';state.strokes={eyeArea:[],irisProtect:[],pupilProtect:[]};}},
    '画像左眼へ切り替え、前の眼の下書きを破棄しました。未保存です。');
  mode(right,()=>{if(state.eye!=='image-right'){
    state.eye='image-right';state.strokes={eyeArea:[],irisProtect:[],pupilProtect:[]};}},
    '画像右眼へ切り替え、前の眼の下書きを破棄しました。未保存です。');
  mode(area,()=>{state.role='eyeArea';});
  mode(iris,()=>{state.role='irisProtect';});
  mode(pupil,()=>{state.role='pupilProtect';});
  mode(add,()=>{state.operation='ADD';});mode(erase,()=>{state.operation='ERASE';});
  undo.addEventListener('click',()=>{try{fresh();if(!history.length)return;
    future.push(clone(state));state=history.pop();
    status.textContent='下書きを戻しました。未保存です。';render();}catch{render();}
  },{signal:events.signal});
  redo.addEventListener('click',()=>{try{fresh();if(!future.length)return;
    history.push(clone(state));state=future.pop();
    status.textContent='下書きをやり直しました。未保存です。';render();}catch{render();}
  },{signal:events.signal});
  color.addEventListener('change',()=>{try{const value=toHex(colorFromHex(color.value));
    change(()=>{state.color=value;},'色を変更しました。未保存です。');}
    catch{status.textContent='色は6桁のRGBで指定してください。';render();}
  },{signal:events.signal});
  opacity.addEventListener('change',()=>{try{
    const text=opacity.value.trim(),value=Number(text);
    if(text===''||!Number.isFinite(value)||value<0||value>100)
      throw Error('MANUAL_EYESHADOW_UI_OPACITY_INVALID');
    change(()=>{state.opacity=value/100;},'Opacityを変更しました。未保存です。');}
    catch{status.textContent='Opacityは0〜100%です。';render();}
  },{signal:events.signal});
  submit.addEventListener('click',async()=>{
    if(busy||disposed||typeof onSubmit!=='function')return;
    let draft;try{draft=document();}catch(error){
      status.dataset.error=String(error?.message??error);
      status.textContent='眼周囲・虹彩・瞳孔の下書きと版を確認できずhostへ渡しません。';return;
    }
    busy=true;const token=++generation,abort=new AbortController();inFlight=abort;
    status.textContent='hostへ下書きを依頼中。実保存・Finalは未確認です。';render();
    try{await onSubmit(clone(draft),{savedRevision:mounted.savedRevision,
      personID:binding.personID,signal:abort.signal});
      if(disposed||token!==generation||abort.signal.aborted)return;
      fresh();status.textContent='hostへ渡しました。実保存・適用・Finalは別途確認してください。';
    }catch(error){if(disposed||token!==generation)return;
      status.dataset.error=String(error?.message??error);
      status.textContent='依頼は完了していません。実保存も未確認です。';
    }finally{if(!disposed&&token===generation){busy=false;inFlight=null;render();}}
  },{signal:events.signal});
  cancel.addEventListener('click',()=>{
    dropDrawing();inFlight?.abort();generation++;inFlight=null;busy=false;
    state=initialState();state.strokes={eyeArea:[],irisProtect:[],pupilProtect:[]};
    history=[];future=[];status.textContent='下書きを破棄しました。保存・適用は未確認です。';render();
  },{signal:events.signal});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(render):null;
  resize?.observe(afterImage);
  afterImage.addEventListener('load',render,{signal:events.signal});
  render();
  return Object.freeze({refresh:render,
    getDraft(){if(!invalid){try{fresh();}catch{}}
      return clone({eye:state.eye,strokes:state.strokes,color:state.color,
        opacity:state.opacity,role:state.role,operation:state.operation});},
    getDocument:document,
    setEnabled(value){enabled=value===true;
      if(!enabled)retire('hostが無効化したため下書きを破棄しました。');render();},
    dispose(){disposed=true;generation++;inFlight?.abort();dropDrawing();
      events.abort();resize?.disconnect();overlay.remove();panel.remove();
      release();host.style.position=oldPosition;}});
}
