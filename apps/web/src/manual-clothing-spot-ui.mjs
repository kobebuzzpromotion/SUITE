import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {MANUAL_CLOTHING_SPOT_VERSION} from './processing/manual-clothing-spot.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const MAX_STROKES=64,MAX_POINTS=4096,MAX_JSON_BYTES=96*1024;
const STYLE=`.suite-clothing-spot{box-sizing:border-box;max-width:100%;min-width:0;padding:1rem;border:1px solid #cecac2;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}
.suite-clothing-spot *{box-sizing:border-box}.suite-clothing-spot h3{font:normal clamp(1.3rem,3vw,1.8rem)/1.25 Georgia,serif;margin:0 0 .4rem}.suite-clothing-spot p{margin:.4rem 0 .8rem;overflow-wrap:anywhere}
.suite-clothing-spot__actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:.8rem 0}.suite-clothing-spot button{min-height:44px;min-width:44px;padding:.5rem .8rem;border:1px solid #494640;border-radius:0;background:#fff;color:#242321;font:inherit;cursor:pointer}
.suite-clothing-spot button:disabled{cursor:not-allowed;opacity:.5}.suite-clothing-spot :focus-visible{outline:3px solid #145b84;outline-offset:2px}.suite-clothing-spot__settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.suite-clothing-spot label{display:grid;gap:.2rem;min-width:0}.suite-clothing-spot input{width:100%;min-width:0;min-height:44px;padding:.4rem;border:1px solid #77736b;background:#fff;color:#242321;font:inherit}
@media(max-width:600px){.suite-clothing-spot{padding:.7rem}.suite-clothing-spot__settings{grid-template-columns:minmax(0,1fr)}.suite-clothing-spot__actions>*{flex:1 1 8rem}}
@media(prefers-reduced-motion:reduce){.suite-clothing-spot *, .suite-clothing-spot *::before, .suite-clothing-spot *::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;

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
  return Array.from({length:value.length},(_,index)=>
    Object.getOwnPropertyDescriptor(value,String(index))).every(descriptor=>
    descriptor&&Object.hasOwn(descriptor,'value'));
}
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
const clone=value=>structuredClone(value);
const node=(doc,tag,text='')=>{const result=doc.createElement(tag);result.textContent=text;return result;};
const button=(doc,text)=>{const result=node(doc,'button',text);result.type='button';return result;};
const labelled=(doc,text,input)=>{const label=node(doc,'label',text);label.append(input);return label;};
function checkedBinding(binding){
  if(!exact(binding,['assetID','originalSHA256','sourceWidth','sourceHeight'])||
      typeof binding.assetID!=='string'||!UUID.test(binding.assetID)||
      typeof binding.originalSHA256!=='string'||!SHA.test(binding.originalSHA256)||
      !Number.isSafeInteger(binding.sourceWidth)||binding.sourceWidth<1||
      !Number.isSafeInteger(binding.sourceHeight)||binding.sourceHeight<1||
      binding.sourceWidth*binding.sourceHeight>8_000_000)
    throw Error('MANUAL_CLOTHING_UI_BINDING_INVALID');
  return binding;
}
const selectedBinding=context=>checkedBinding({assetID:context?.assetID,
  originalSHA256:context?.originalSHA256,sourceWidth:context?.sourceWidth,
  sourceHeight:context?.sourceHeight});
function checkedRect(value,binding){
  if(!exact(value,['x','y','width','height'])||
      !['x','y','width','height'].every(key=>
        typeof value[key]==='number'&&Number.isFinite(value[key]))||
      value.x<0||value.y<0||value.width<=0||value.height<=0||
      value.x+value.width>1||value.y+value.height>1||
      Math.round(value.width*binding.sourceWidth)<2||
      Math.round(value.height*binding.sourceHeight)<2||
      Math.round(value.width*binding.sourceWidth)>256||
      Math.round(value.height*binding.sourceHeight)>256)
    throw Error('MANUAL_CLOTHING_UI_RECT_INVALID');
  return {x:value.x,y:value.y,width:value.width,height:value.height};
}
function checkedRegions(targetRect,referenceRect,binding){
  const target=checkedRect(targetRect,binding),reference=checkedRect(referenceRect,binding);
  if(target.width!==reference.width||target.height!==reference.height||
      (target.x<reference.x+reference.width&&reference.x<target.x+target.width&&
        target.y<reference.y+reference.height&&reference.y<target.y+target.height))
    throw Error('MANUAL_CLOTHING_UI_REGIONS_INVALID');
  return {target,reference};
}

/** Draft geometry only. No bitmap, authentication or saved revision is serialized. */
export function makeManualClothingSpotDocument(binding,targetRect,referenceRect,targetStrokes){
  checkedBinding(binding);
  const {target,reference}=checkedRegions(targetRect,referenceRect,binding);
  if(!dense(targetStrokes,1,MAX_STROKES))
    throw Error('MANUAL_CLOTHING_UI_STROKES_INVALID');
  let count=0,hasAdd=false;
  const strokes=targetStrokes.map(stroke=>{
    if(!exact(stroke,['operation','path','radiusFraction','hardness'])||
        !['ADD','ERASE'].includes(stroke.operation)||
        !dense(stroke.path,1,MAX_POINTS)||
        typeof stroke.radiusFraction!=='number'||!Number.isFinite(stroke.radiusFraction)||
        stroke.radiusFraction<.001||stroke.radiusFraction>.25||!unit(stroke.hardness))
      throw Error('MANUAL_CLOTHING_UI_STROKE_INVALID');
    count+=stroke.path.length;
    if(count>MAX_POINTS)throw Error('MANUAL_CLOTHING_UI_STROKE_CAPACITY');
    if(stroke.operation==='ADD')hasAdd=true;
    const path=stroke.path.map(point=>{
      if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
        throw Error('MANUAL_CLOTHING_UI_POINT_INVALID');
      return {u:point.u,v:point.v};
    });
    return {operation:stroke.operation,path,radiusFraction:stroke.radiusFraction,
      hardness:stroke.hardness};
  });
  if(!hasAdd)throw Error('MANUAL_CLOTHING_UI_ADD_REQUIRED');
  const result={schemaVersion:1,engineVersion:MANUAL_CLOTHING_SPOT_VERSION,
    binding:{assetID:binding.assetID,originalSHA256:binding.originalSHA256,
      sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight},
    targetRect:target,referenceRect:reference,targetStrokes:strokes};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_CLOTHING_UI_JSON_LIMIT');
  return result;
}
function checkedInitial(initial,binding){
  if(!exact(initial,['schemaVersion','engineVersion','binding','targetRect',
      'referenceRect','targetStrokes'])||initial.schemaVersion!==1||
      initial.engineVersion!==MANUAL_CLOTHING_SPOT_VERSION)
    throw Error('MANUAL_CLOTHING_UI_INITIAL_INVALID');
  const copy=makeManualClothingSpotDocument(initial.binding,initial.targetRect,
    initial.referenceRect,initial.targetStrokes);
  for(const key of ['assetID','originalSHA256','sourceWidth','sourceHeight'])
    if(copy.binding[key]!==binding[key])
      throw Error('MANUAL_CLOTHING_UI_INITIAL_BINDING_MISMATCH');
  return copy;
}
function integer(input,min,max){
  if(input.value.trim()===''||!/^[0-9]+$/u.test(input.value.trim()))
    throw Error('MANUAL_CLOTHING_UI_NUMBER_INVALID');
  const value=Number(input.value);
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw Error('MANUAL_CLOTHING_UI_NUMBER_INVALID');
  return value;
}

/** After-only authoring component. Host callback must establish fresh rights,
 * real Original dimensions/Asset/SHA, Recipe CAS and saved readback. This UI
 * never treats getContext, onSubmit or garment labels as authentication. */
export function mountManualClothingSpotUI({root,afterImage,getContext,onSubmit,
  initial,enabled=false}={}){
  if(!(root instanceof HTMLElement)||!(afterImage instanceof HTMLImageElement)||
      root.ownerDocument!==afterImage.ownerDocument||!afterImage.parentElement||
      typeof getContext!=='function'||
      (onSubmit!==undefined&&typeof onSubmit!=='function'))
    throw Error('MANUAL_CLOTHING_UI_MOUNT_INVALID');
  const doc=root.ownerDocument,host=afterImage.parentElement;
  const mounted=getContext(),binding=selectedBinding(mounted);
  if(!Number.isSafeInteger(mounted.savedRevision)||mounted.savedRevision<1)
    throw Error('MANUAL_CLOTHING_UI_CONTEXT_INVALID');
  const mountedKey=[binding.assetID,binding.originalSHA256,binding.sourceWidth,
    binding.sourceHeight,mounted.savedRevision].join(':');
  const existing=initial===undefined?null:checkedInitial(initial,binding);
  const initialState=()=>({targetRect:existing?clone(existing.targetRect):null,
    referenceRect:existing?clone(existing.referenceRect):null,
    targetStrokes:existing?clone(existing.targetStrokes):[],mode:'target',
    operation:'ADD'});
  let state=initialState(),history=[],future=[],drawing=null,keyboard={x:.5,y:.5};
  let keyboardCorner=null,busy=false,disposed=false,invalidated=false;
  let generation=0,inFlight=null,ownsImage=false,savedImage=null;
  const events=new AbortController();
  const panel=node(doc,'section');panel.className='suite-clothing-spot';
  panel.setAttribute('aria-label','衣服スポット手動補修');
  panel.append(node(doc,'style',STYLE),node(doc,'h3','衣服 · 手動スポット補修'),
    node(doc,'p','Afterで小さな対象領域をドラッグし、同じ大きさの参照位置を選択して対象内を描きます。衣服検出ではありません。保存・Finalは未接続です。'));
  const scope=node(doc,'p',`対象 Asset ${binding.assetID}`);panel.append(scope);
  const radius=node(doc,'input');radius.type='number';radius.min='1';radius.max='25';
  radius.step='1';radius.value='20';radius.setAttribute('aria-label','ブラシ半径 %');
  const hardness=node(doc,'input');hardness.type='number';hardness.min='0';
  hardness.max='100';hardness.step='1';hardness.value='100';
  hardness.setAttribute('aria-label','ブラシ硬さ %');
  const settings=node(doc,'div');settings.className='suite-clothing-spot__settings';
  settings.append(labelled(doc,'半径',radius),labelled(doc,'硬さ',hardness));panel.append(settings);
  const actions=node(doc,'div');actions.className='suite-clothing-spot__actions';
  const target=button(doc,'対象領域を指定'),reference=button(doc,'参照位置を指定');
  const add=button(doc,'範囲を追加'),erase=button(doc,'範囲を消去');
  const undo=button(doc,'戻す'),redo=button(doc,'やり直す');
  const submit=button(doc,'hostへ下書きを渡す'),cancel=button(doc,'下書きを破棄');
  actions.append(target,reference,add,erase,undo,redo,submit,cancel);panel.append(actions);
  const status=node(doc,'p','下書きのみ。本人・保存・Finalは未確認です。');
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
      'After衣服手動範囲。矢印で移動、Enterで選択、Escapeで取消');
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
    invalidated=true;dropDrawing();state=initialState();
    state.targetRect=null;state.referenceRect=null;state.targetStrokes=[];
    history=[];future=[];keyboardCorner=null;generation++;
    if(inFlight)inFlight.abort();inFlight=null;busy=false;
    status.textContent=reason;
  }
  function freshContext(){
    if(disposed||invalidated||!enabled||!afterImage.complete||
        !afterImage.naturalWidth||!afterImage.naturalHeight)
      throw Error('MANUAL_CLOTHING_UI_AFTER_NOT_READY');
    let context,current;
    try{context=getContext();current=selectedBinding(context);}catch{
      retire('対象・版・権限を確認できないため下書きを破棄しました。');
      throw Error('MANUAL_CLOTHING_UI_CONTEXT_INVALID');
    }
    const key=[current.assetID,current.originalSHA256,current.sourceWidth,
      current.sourceHeight,context.savedRevision].join(':');
    if(key!==mountedKey||context.permissionExpired===true){
      retire('対象・版・権限が変わったため下書きを破棄しました。');
      throw Error('MANUAL_CLOTHING_UI_STALE_ASSET_OR_REVISION');
    }
    if(context.ready!==true||context.dirty!==false||context.busy===true||
        !['after','split'].includes(context.view))
      throw Error('MANUAL_CLOTHING_UI_CONTEXT_NOT_READY');
    return context;
  }
  function geometry(){
    const context=freshContext();
    if(busy)throw Error('MANUAL_CLOTHING_UI_BUSY');
    if(!Number.isSafeInteger(context.uprightWidth)||
        !Number.isSafeInteger(context.uprightHeight))
      throw Error('MANUAL_CLOTHING_UI_UPRIGHT_DIMENSIONS_REQUIRED');
    if(context.expectedAfterURL&&afterImage.getAttribute('src')!==context.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {afterRect:afterImage.getBoundingClientRect(),
      beforeRect:context.beforeRect,naturalWidth:afterImage.naturalWidth,
      naturalHeight:afterImage.naturalHeight,
      uprightWidth:context.uprightWidth,uprightHeight:context.uprightHeight,
      rotationDegrees:context.rotationDegrees??0,crop:context.crop,
      canvasExpand:context.canvasExpand,view:context.view,
      sceneGeometry:context.sceneGeometry,liquifyField:context.liquifyField,lensGeometry:context.lensGeometry,
      sourceWidth:context.sourceWidth,sourceHeight:context.sourceHeight};
  }
  function pointerPoint(event){
    const point=mapAfterToLocalBrushPoint({...geometry(),
      clientX:event.clientX,clientY:event.clientY});
    return {x:point.x,y:point.y};
  }
  function keyboardPoint(){
    const point=mapAfterImagePointToLocalBrushPoint({...geometry(),
      afterX:keyboard.x,afterY:keyboard.y});
    return {x:point.x,y:point.y};
  }
  function localPoint(point,rect){
    const u=(point.x-rect.x)/rect.width,v=(point.y-rect.y)/rect.height;
    if(!Number.isFinite(u)||!Number.isFinite(v)||
        u<0||u>1||v<0||v>1)
      throw Error('MANUAL_CLOTHING_UI_OUTSIDE_TARGET');
    return {u,v};
  }
  function fromCorners(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),
    width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};}
  function placedReference(center,rect){return {x:center.x-rect.width/2,
    y:center.y-rect.height/2,width:rect.width,height:rect.height};}
  function update(change,message){
    if(busy)throw Error('MANUAL_CLOTHING_UI_BUSY');
    freshContext();
    const next=clone(state);change(next);
    history.push(clone(state));if(history.length>128)history.shift();
    state=next;future=[];status.textContent=message;render();
  }
  function drawRect(rect,color,g,box){
    if(!rect)return;
    const rgb=[1,3,5].map(at=>parseInt(color.slice(at,at+2),16));
    appendProjectedBrushOverlay(overlay,g,[],{vectors:[{rect}],color:rgb,opacity:.8});
  }
  function render(){
    let ready=false,g;
    try{g=geometry();mapAfterImagePointToLocalBrushPoint({...g,afterX:.5,afterY:.5});
      ready=true;}catch{}
    if(ready)claimImage();else releaseImage();
    for(const control of [target,reference,add,erase,radius,hardness])
      control.disabled=!ready||busy||
        ((control===reference||control===add||control===erase)&&!state.targetRect)||
        ((control===add||control===erase)&&!state.referenceRect);
    undo.disabled=!ready||busy||history.length===0;
    redo.disabled=!ready||busy||future.length===0;
    submit.disabled=!ready||busy||typeof onSubmit!=='function'||
      !state.targetRect||!state.referenceRect||
      !state.targetStrokes.some(stroke=>stroke.operation==='ADD');
    cancel.disabled=disposed||invalidated||
      (!busy&&!drawing&&!state.targetRect&&!history.length);
    target.setAttribute('aria-pressed',String(state.mode==='target'));
    reference.setAttribute('aria-pressed',String(state.mode==='reference'));
    add.setAttribute('aria-pressed',String(state.mode==='brush'&&state.operation==='ADD'));
    erase.setAttribute('aria-pressed',String(state.mode==='brush'&&state.operation==='ERASE'));
    overlay.replaceChildren();if(!ready)return;
    try{
      const box=afterImage.getBoundingClientRect(),parent=host.getBoundingClientRect();
      overlay.style.left=`${box.left-parent.left}px`;
      overlay.style.top=`${box.top-parent.top}px`;
      overlay.style.width=`${box.width}px`;overlay.style.height=`${box.height}px`;
      overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
      drawRect(state.targetRect,'#9e4a68',g,box);
      drawRect(state.referenceRect,'#526c83',g,box);
      if(state.targetRect)appendProjectedBrushOverlay(overlay,g,state.targetStrokes,{region:state.targetRect,color:[160,88,53]});
    }catch{overlay.replaceChildren();}
  }
  function chooseTarget(a,b){
    const candidate=checkedRect(fromCorners(a,b),binding);
    update(next=>{next.targetRect=candidate;next.referenceRect=null;
      next.targetStrokes=[];},'対象領域を指定しました。参照位置を選んでください。');
  }
  function chooseReference(point){
    if(!state.targetRect)throw Error('MANUAL_CLOTHING_UI_TARGET_REQUIRED');
    const candidate=placedReference(point,state.targetRect);
    checkedRegions(state.targetRect,candidate,binding);
    update(next=>{next.referenceRect=candidate;next.targetStrokes=[];},
      '同じ大きさの参照領域を指定しました。対象内を描いてください。');
  }
  function addStroke(path){
    if(!state.targetRect||!state.referenceRect||!path.length||
        state.targetStrokes.length>=MAX_STROKES||
        state.targetStrokes.reduce((sum,stroke)=>sum+stroke.path.length,path.length)>MAX_POINTS)
      throw Error('MANUAL_CLOTHING_UI_STROKE_CAPACITY');
    const stroke={operation:state.operation,path,radiusFraction:integer(radius,1,25)/100,
      hardness:integer(hardness,0,100)/100};
    update(next=>next.targetStrokes.push(stroke),
      '手動範囲を追加しました。未保存です。');
  }
  function end(event,cancelled){
    if(!drawing||drawing.id!==event.pointerId)return;
    const active=drawing;drawing=null;
    try{if(afterImage.hasPointerCapture?.(event.pointerId))
      afterImage.releasePointerCapture(event.pointerId);}catch{}
    if(cancelled||active.invalid){status.textContent='操作を取消しました。';render();return;}
    try{
      const last=pointerPoint(event);
      if(active.mode==='target')chooseTarget(active.start,last);
      else if(active.mode==='reference')chooseReference(last);
      else{
        const local=localPoint(last,state.targetRect);
        if(active.path.at(-1)?.u!==local.u||active.path.at(-1)?.v!==local.v)
          active.path.push(local);
        addStroke(active.path);
      }
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='画像外・不正な領域・古い版では確定しません。';render();}
  }
  afterImage.addEventListener('pointerdown',event=>{
    if(drawing||event.isPrimary===false||
        (event.pointerType!=='touch'&&event.button!==0))return;
    try{
      const point=pointerPoint(event);
      drawing={id:event.pointerId,mode:state.mode,start:point,
        path:state.mode==='brush'?[localPoint(point,state.targetRect)]:[],invalid:false};
      try{afterImage.setPointerCapture?.(event.pointerId);}catch{}
      event.preventDefault();render();
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='Afterの画像上で、対象内だけ操作できます。';}
  },{signal:events.signal});
  afterImage.addEventListener('pointermove',event=>{
    if(!drawing||drawing.id!==event.pointerId||drawing.mode!=='brush')return;
    try{
      const point=localPoint(pointerPoint(event),state.targetRect);
      if(drawing.path.length>=MAX_POINTS){drawing.invalid=true;return;}
      if(Math.abs(point.u-drawing.path.at(-1).u)+
          Math.abs(point.v-drawing.path.at(-1).v)>.0001)drawing.path.push(point);
    }catch{if(drawing)drawing.invalid=true;}
  },{signal:events.signal});
  afterImage.addEventListener('pointerup',event=>end(event,false),{signal:events.signal});
  afterImage.addEventListener('pointercancel',event=>end(event,true),{signal:events.signal});
  afterImage.addEventListener('focus',()=>{if(ownsImage)
    afterImage.style.outline='3px solid #145b84';},{signal:events.signal});
  afterImage.addEventListener('blur',()=>{if(ownsImage)
    afterImage.style.outline=savedImage.outline;},{signal:events.signal});
  afterImage.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      dropDrawing();keyboardCorner=null;
      if(inFlight){inFlight.abort();generation++;inFlight=null;busy=false;}
      status.textContent='操作を取消しました。保存・適用は未確認です。';render();return;
    }
    try{geometry();}catch{return;}
    const step=event.shiftKey?.001:.005;
    const dx=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0;
    const dy=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;
    if(dx||dy){
      event.preventDefault();
      const next={x:Math.max(0,Math.min(1,keyboard.x+dx)),
        y:Math.max(0,Math.min(1,keyboard.y+dy))};
      try{mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX:next.x,afterY:next.y});keyboard=next;
        status.textContent=`位置 ${Math.round(next.x*1000)/10}%, ${Math.round(next.y*1000)/10}%`;}
      catch{status.textContent='余白・Crop外へは移動できません。';}
    }else if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      try{
        const point=keyboardPoint();
        if(state.mode==='target'){
          if(!keyboardCorner){keyboardCorner=point;
            status.textContent='対象領域の反対側へ移動してEnter。';}
          else{chooseTarget(keyboardCorner,point);keyboardCorner=null;}
        }else if(state.mode==='reference')chooseReference(point);
        else addStroke([localPoint(point,state.targetRect)]);
      }catch(error){status.dataset.error=String(error?.message??error);
        status.textContent='Afterの有効領域内だけ指定できます。';}
    }
  },{signal:events.signal});
  const switchMode=(control,mode,operation)=>control.addEventListener('click',()=>{
    try{freshContext();keyboardCorner=null;state.mode=mode;
      if(operation)state.operation=operation;
      status.textContent='操作モードを切り替えました。未保存です。';render();}
    catch{render();}
  },{signal:events.signal});
  switchMode(target,'target');switchMode(reference,'reference');
  switchMode(add,'brush','ADD');switchMode(erase,'brush','ERASE');
  undo.addEventListener('click',()=>{
    if(!history.length)return;
    try{freshContext();future.push(clone(state));state=history.pop();
      keyboardCorner=null;status.textContent='下書きを戻しました。未保存です。';render();}
    catch{render();}
  },{signal:events.signal});
  redo.addEventListener('click',()=>{
    if(!future.length)return;
    try{freshContext();history.push(clone(state));state=future.pop();
      keyboardCorner=null;status.textContent='下書きをやり直しました。未保存です。';render();}
    catch{render();}
  },{signal:events.signal});
  submit.addEventListener('click',async()=>{
    if(busy||disposed||typeof onSubmit!=='function')return;
    let candidate;
    try{freshContext();candidate=makeManualClothingSpotDocument(binding,
      state.targetRect,state.referenceRect,state.targetStrokes);}
    catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='下書き・版・権限を確認できずhostへ渡しません。';return;}
    busy=true;const token=++generation,abort=new AbortController();inFlight=abort;
    status.textContent='hostへ下書きを依頼中。実保存・Finalは未確認です。';render();
    try{
      await onSubmit(clone(candidate),{savedRevision:mounted.savedRevision,
        signal:abort.signal});
      if(disposed||token!==generation||abort.signal.aborted)return;
      freshContext();
      status.textContent='hostへ渡しました。実保存・適用・Finalは別途確認してください。';
    }catch(error){if(disposed||token!==generation)return;
      status.dataset.error=String(error?.message??error);
      status.textContent='依頼は完了していません。確認後に再実行できます。';}
    finally{if(!disposed&&token===generation){busy=false;inFlight=null;render();}}
  },{signal:events.signal});
  cancel.addEventListener('click',()=>{
    dropDrawing();keyboardCorner=null;
    if(inFlight)inFlight.abort();generation++;inFlight=null;busy=false;
    state=initialState();state.targetRect=null;state.referenceRect=null;
    state.targetStrokes=[];history=[];future=[];
    status.textContent='下書きを破棄しました。保存・適用は未確認です。';render();
  },{signal:events.signal});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(render):null;
  resize?.observe(afterImage);
  afterImage.addEventListener('load',render,{signal:events.signal});
  render();
  return Object.freeze({refresh:render,
    getDraft(){if(!invalidated){try{freshContext();}catch{}}
      return clone(state);},
    getDocument(){freshContext();return makeManualClothingSpotDocument(binding,
      state.targetRect,state.referenceRect,state.targetStrokes);},
    setEnabled(value){enabled=value===true;
      if(!enabled)retire('hostが無効化したため下書きを破棄しました。');
      render();},
    reset(next){
      freshContext();if(inFlight)inFlight.abort();generation++;busy=false;
      inFlight=null;dropDrawing();history=[];future=[];keyboardCorner=null;
      const checked=next===undefined?null:checkedInitial(next,binding);
      state={targetRect:checked?clone(checked.targetRect):null,
        referenceRect:checked?clone(checked.referenceRect):null,
        targetStrokes:checked?clone(checked.targetStrokes):[],
        mode:'target',operation:'ADD'};
      status.textContent='下書きを再読込しました。保存・Finalは未確認です。';render();
    },
    dispose(){disposed=true;generation++;if(inFlight)inFlight.abort();
      dropDrawing();events.abort();resize?.disconnect();overlay.remove();panel.remove();
      releaseImage();host.style.position=hostPosition;}});
}
