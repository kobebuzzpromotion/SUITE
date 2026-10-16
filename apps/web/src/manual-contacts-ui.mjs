import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {MANUAL_CONTACTS_IRIS_COLOR_VERSION} from
  './processing/manual-contacts-iris-color.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const MAX_STROKES=64,MAX_POINTS=4096,MAX_JSON_BYTES=96*1024;
const STYLE=`.suite-contacts{box-sizing:border-box;max-width:100%;min-width:0;padding:1rem;border:1px solid #cecac2;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}
.suite-contacts *{box-sizing:border-box}.suite-contacts h3{font:normal clamp(1.3rem,3vw,1.8rem)/1.25 Georgia,serif;margin:0 0 .4rem}.suite-contacts p{margin:.4rem 0 .8rem;overflow-wrap:anywhere}
.suite-contacts__grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;min-width:0}.suite-contacts label{display:grid;gap:.2rem;min-width:0}
.suite-contacts input{width:100%;max-width:100%;min-width:0;min-height:44px;padding:.4rem;border:1px solid #77736b;border-radius:0;background:#fff;color:#242321;font:inherit}
.suite-contacts__actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:.8rem 0}.suite-contacts button{min-height:44px;min-width:44px;padding:.5rem .8rem;border:1px solid #494640;border-radius:0;background:#fff;color:#242321;font:inherit;cursor:pointer}
.suite-contacts button:disabled{cursor:not-allowed;opacity:.5}.suite-contacts :focus-visible{outline:3px solid #145b84;outline-offset:2px}.suite-contacts__scope{font-size:.8rem;color:#4c4843}
@media(max-width:600px){.suite-contacts{padding:.7rem}.suite-contacts__grid{grid-template-columns:repeat(2,minmax(0,1fr))}.suite-contacts__actions>*{flex:1 1 8rem}}
@media(max-width:390px){.suite-contacts__grid{grid-template-columns:minmax(0,1fr)}}
@media(prefers-reduced-motion:reduce){.suite-contacts *, .suite-contacts *::before, .suite-contacts *::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&prototype!==Object.prototype&&
      !(Object.getPrototypeOf(prototype)===null&&
        Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object'))
    return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
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
  if(!exact(binding,['assetID','originalSHA256','personID','eye',
    'sourceWidth','sourceHeight'])||
      typeof binding.assetID!=='string'||!UUID.test(binding.assetID)||
      typeof binding.originalSHA256!=='string'||!SHA.test(binding.originalSHA256)||
      typeof binding.personID!=='string'||!UUID.test(binding.personID)||
      !['left','right'].includes(binding.eye)||
      !Number.isSafeInteger(binding.sourceWidth)||binding.sourceWidth<1||
      !Number.isSafeInteger(binding.sourceHeight)||binding.sourceHeight<1||
      binding.sourceWidth*binding.sourceHeight>8_000_000)
    throw Error('MANUAL_CONTACTS_UI_BINDING_INVALID');
  return binding;
}
function selectedBinding(context,eye){
  return checkedBinding({assetID:context?.assetID,
    originalSHA256:context?.originalSHA256,personID:context?.personID,
    eye,sourceWidth:context?.sourceWidth,sourceHeight:context?.sourceHeight});
}
function colorSettings(settings){
  if(!exact(settings,['color','amount'])||
      !exact(settings.color,['r','g','b'])||
      !['r','g','b'].every(channel=>Number.isSafeInteger(settings.color[channel])&&
        settings.color[channel]>=0&&settings.color[channel]<=255)||
      !unit(settings.amount)||Object.is(settings.amount,-0))
    throw Error('MANUAL_CONTACTS_UI_SETTINGS_INVALID');
  return {color:{r:settings.color.r,g:settings.color.g,b:settings.color.b},
    amount:settings.amount};
}
function hexColor(value){
  if(typeof value!=='string'||!/^#[a-f0-9]{6}$/iu.test(value))
    throw Error('MANUAL_CONTACTS_UI_COLOR_INVALID');
  return {r:parseInt(value.slice(1,3),16),g:parseInt(value.slice(3,5),16),
    b:parseInt(value.slice(5,7),16)};
}
const toHex=({r,g,b})=>'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
function percent(input,min,max,code){
  const raw=input.value.trim();
  if(!/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/u.test(raw))throw Error(code);
  const value=Number(raw);
  if(!Number.isFinite(value)||value<min||value>max)throw Error(code);
  return value/100;
}

/** One document is bound to one eye. Distinct coverage roles are never merged. */
export function makeManualContactsDocument(binding,irisRingStrokes,
  pupilExclusionStrokes,settings){
  checkedBinding(binding);
  const chosen=colorSettings(settings);
  let strokesSeen=0,pointsSeen=0;
  const copyStrokes=(value,role)=>{
    if(!dense(value,1,MAX_STROKES))
      throw Error(`MANUAL_CONTACTS_UI_${role}_STROKES_INVALID`);
    let hasAdd=false;
    const result=value.map(stroke=>{
      if(!exact(stroke,['operation','path','radiusFraction','hardness'])||
          !['ADD','ERASE'].includes(stroke.operation)||
          !dense(stroke.path,1,MAX_POINTS)||
          typeof stroke.radiusFraction!=='number'||
          !Number.isFinite(stroke.radiusFraction)||
          stroke.radiusFraction<.001||stroke.radiusFraction>.25||
          !unit(stroke.hardness))
        throw Error(`MANUAL_CONTACTS_UI_${role}_STROKE_INVALID`);
      strokesSeen++;pointsSeen+=stroke.path.length;
      if(strokesSeen>MAX_STROKES||pointsSeen>MAX_POINTS)
        throw Error('MANUAL_CONTACTS_UI_CAPACITY');
      if(stroke.operation==='ADD')hasAdd=true;
      const path=stroke.path.map(point=>{
        if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
          throw Error(`MANUAL_CONTACTS_UI_${role}_POINT_INVALID`);
        return {u:point.u,v:point.v};
      });
      return {operation:stroke.operation,path,
        radiusFraction:stroke.radiusFraction,hardness:stroke.hardness};
    });
    if(!hasAdd)throw Error(`MANUAL_CONTACTS_UI_${role}_ADD_REQUIRED`);
    return result;
  };
  const result={schemaVersion:1,engineVersion:MANUAL_CONTACTS_IRIS_COLOR_VERSION,
    binding:{assetID:binding.assetID,originalSHA256:binding.originalSHA256,
      personID:binding.personID,eye:binding.eye,
      sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight},
    irisRingStrokes:copyStrokes(irisRingStrokes,'RING'),
    pupilExclusionStrokes:copyStrokes(pupilExclusionStrokes,'PUPIL'),
    settings:chosen};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_CONTACTS_UI_JSON_LIMIT');
  return result;
}
function checkedInitial(initial,binding){
  if(!exact(initial,['schemaVersion','engineVersion','binding',
    'irisRingStrokes','pupilExclusionStrokes','settings'])||
      initial.schemaVersion!==1||
      initial.engineVersion!==MANUAL_CONTACTS_IRIS_COLOR_VERSION)
    throw Error('MANUAL_CONTACTS_UI_INITIAL_INVALID');
  const validated=makeManualContactsDocument(initial.binding,
    initial.irisRingStrokes,initial.pupilExclusionStrokes,initial.settings);
  for(const field of ['assetID','originalSHA256','personID',
    'sourceWidth','sourceHeight'])
    if(validated.binding[field]!==binding[field])
      throw Error('MANUAL_CONTACTS_UI_INITIAL_BINDING_MISMATCH');
  return validated;
}

/** Detached After-only draft. Host callbacks/boolean flags never prove that
 * the user, person or iris was authenticated, or that a Recipe was saved. */
export function mountManualContactsUI({root,afterImage,getContext,host,
  initial,enabled=false}={}){
  if(!(root instanceof HTMLElement)||!(afterImage instanceof HTMLImageElement)||
      root.ownerDocument!==afterImage.ownerDocument||!afterImage.parentElement||
      typeof getContext!=='function'||
      (host!==undefined&&(!exact(host,['verifyFresh','submitDraft'])||
        typeof host.verifyFresh!=='function'||typeof host.submitDraft!=='function')))
    throw Error('MANUAL_CONTACTS_UI_MOUNT_INVALID');
  const doc=root.ownerDocument,parent=afterImage.parentElement;
  const mounted=getContext(),binding=selectedBinding(mounted,
    mounted?.eye==='right'?'right':'left');
  if(!Number.isSafeInteger(mounted.savedRevision)||mounted.savedRevision<1)
    throw Error('MANUAL_CONTACTS_UI_CONTEXT_INVALID');
  const mountedKey=[binding.assetID,binding.originalSHA256,binding.personID,
    binding.sourceWidth,binding.sourceHeight,mounted.savedRevision].join(':');
  const existing=initial===undefined?null:checkedInitial(initial,binding);
  const initialState=()=>({eyes:{left:{ring:[],pupil:[]},
      right:{ring:[],pupil:[]}},eye:existing?.binding.eye??binding.eye,
    role:'ring',operation:'ADD',color:toHex(existing?.settings.color??
      {r:40,g:90,b:130}),amount:existing?.settings.amount??.5});
  const restore=(state,document)=>{
    if(!document)return;
    state.eyes[document.binding.eye].ring=clone(document.irisRingStrokes);
    state.eyes[document.binding.eye].pupil=clone(document.pupilExclusionStrokes);
  };
  let state=initialState();restore(state,existing);
  let history=[],future=[],drawing=null,keyboard={x:.5,y:.5};
  let busy=false,disposed=false,invalidated=false,generation=0,inFlight=null;
  let ownsImage=false,savedImage=null;
  const events=new AbortController();
  const panel=node(doc,'section');panel.className='suite-contacts';
  panel.setAttribute('aria-label','Contacts 手動虹彩範囲');
  panel.append(node(doc,'style',STYLE),node(doc,'h3','Contacts · 手動虹彩範囲'),
    node(doc,'p','After写真に本人が虹彩ringと瞳孔除外を別々に描きます。片眼ごとの下書きです。自動検出・公式11スタイル・保存・Finalは未接続です。'));
  const scope=node(doc,'p',`対象 Asset ${binding.assetID} / 人物 ${binding.personID}`);
  scope.className='suite-contacts__scope';panel.append(scope);
  const color=node(doc,'input');color.type='color';color.value=state.color;
  color.setAttribute('aria-label','虹彩の色');
  const amount=node(doc,'input');amount.type='number';amount.min='0';
  amount.max='100';amount.step='any';amount.value=String(state.amount*100);
  amount.setAttribute('aria-label','Contacts Amount %');
  const radius=node(doc,'input');radius.type='number';radius.min='0.1';
  radius.max='25';radius.step='any';radius.value='4';
  radius.setAttribute('aria-label','ブラシ半径 %');
  const hardness=node(doc,'input');hardness.type='number';hardness.min='0';
  hardness.max='100';hardness.step='any';hardness.value='70';
  hardness.setAttribute('aria-label','ブラシ硬さ %');
  const grid=node(doc,'div');grid.className='suite-contacts__grid';
  grid.append(labelled(doc,'色',color),labelled(doc,'Amount',amount),
    labelled(doc,'半径',radius),labelled(doc,'硬さ',hardness));panel.append(grid);
  const actions=node(doc,'div');actions.className='suite-contacts__actions';
  const button=text=>{const result=node(doc,'button',text);result.type='button';return result;};
  const left=button('左眼'),right=button('右眼'),ring=button('虹彩ring'),
    pupil=button('瞳孔除外'),add=button('追加'),erase=button('消去'),
    undo=button('戻す'),redo=button('やり直す'),
    submit=button('hostへ下書きを渡す'),cancel=button('下書きを破棄');
  actions.append(left,right,ring,pupil,add,erase,undo,redo,submit,cancel);
  panel.append(actions);
  const status=node(doc,'p','下書きのみ。保存・適用・Finalは未確認です。');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  panel.append(status);root.append(panel);
  const overlay=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.setAttribute('aria-hidden','true');overlay.style.position='absolute';
  overlay.style.pointerEvents='none';overlay.style.overflow='visible';
  const hostPosition=parent.style.position;
  if(getComputedStyle(parent).position==='static')parent.style.position='relative';
  parent.append(overlay);
  function claimImage(){
    if(ownsImage)return;
    savedImage={tabindex:afterImage.getAttribute('tabindex'),
      role:afterImage.getAttribute('role'),label:afterImage.getAttribute('aria-label'),
      shortcuts:afterImage.getAttribute('aria-keyshortcuts'),
      touch:afterImage.style.touchAction,outline:afterImage.style.outline,
      outlineOffset:afterImage.style.outlineOffset};
    afterImage.tabIndex=0;afterImage.setAttribute('role','button');
    afterImage.setAttribute('aria-label',
      'After写真のContacts手動ブラシ。矢印で移動、Enterで描画、Escapeで取消');
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
    history=[];future=[];generation++;
    if(inFlight)inFlight.abort();inFlight=null;busy=false;
    status.textContent=reason;
  }
  function freshContext(){
    if(disposed||invalidated||!enabled||!afterImage.complete||
        !afterImage.naturalWidth||!afterImage.naturalHeight)
      throw Error('MANUAL_CONTACTS_UI_AFTER_NOT_READY');
    let context,current;
    try{context=getContext();current=selectedBinding(context,binding.eye);}catch{
      retire('対象・版・権限を確認できないため下書きを破棄しました。');
      throw Error('MANUAL_CONTACTS_UI_CONTEXT_INVALID');
    }
    const key=[current.assetID,current.originalSHA256,current.personID,
      current.sourceWidth,current.sourceHeight,context.savedRevision].join(':');
    if(key!==mountedKey||context.permissionExpired===true){
      retire('対象・版・権限が変わったため下書きを破棄しました。');
      throw Error('MANUAL_CONTACTS_UI_STALE_ASSET_PERSON_OR_REVISION');
    }
    if(context.ready!==true||context.dirty!==false||context.busy===true||
        context.view!=='after')
      throw Error('MANUAL_CONTACTS_UI_CONTEXT_NOT_READY');
    return context;
  }
  function geometry(){
    const context=freshContext();
    if(busy)throw Error('MANUAL_CONTACTS_UI_BUSY');
    if(context.expectedAfterURL&&afterImage.getAttribute('src')!==context.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {...context,afterRect:afterImage.getBoundingClientRect(),
      uprightWidth:context.uprightWidth??binding.sourceWidth,uprightHeight:context.uprightHeight??binding.sourceHeight,
      naturalWidth:afterImage.naturalWidth,naturalHeight:afterImage.naturalHeight};
  }
  const strokes=()=>state.eyes[state.eye];
  function draft(){
    freshContext();
    return makeManualContactsDocument(selectedBinding(binding,state.eye),
      strokes().ring,strokes().pupil,
      {color:hexColor(state.color),amount:state.amount});
  }
  function update(change,message){
    if(busy)throw Error('MANUAL_CONTACTS_UI_BUSY');
    freshContext();history.push(clone(state));if(history.length>128)history.shift();
    change();future=[];status.textContent=message;render();
  }
  function render(){
    let ready=false;try{geometry();ready=true;}catch{}
    if(ready)claimImage();else releaseImage();
    color.value=state.color;amount.value=String(state.amount*100);
    for(const control of [color,amount,radius,hardness,left,right,ring,pupil,add,erase])
      control.disabled=!ready||busy;
    undo.disabled=!ready||busy||history.length===0;
    redo.disabled=!ready||busy||future.length===0;
    submit.disabled=!ready||busy||!host||
      !strokes().ring.some(item=>item.operation==='ADD')||
      !strokes().pupil.some(item=>item.operation==='ADD');
    cancel.disabled=disposed||invalidated||
      (!busy&&!drawing&&!history.length&&
        !Object.values(state.eyes).some(eye=>eye.ring.length||eye.pupil.length));
    for(const [control,pressed] of [[left,state.eye==='left'],
      [right,state.eye==='right'],[ring,state.role==='ring'],
      [pupil,state.role==='pupil'],[add,state.operation==='ADD'],
      [erase,state.operation==='ERASE']])
      control.setAttribute('aria-pressed',String(pressed));
    overlay.replaceChildren();if(!ready)return;
    try{
      const g=geometry(),box=afterImage.getBoundingClientRect();
      const parentBox=parent.getBoundingClientRect();
      overlay.style.left=`${box.left-parentBox.left}px`;
      overlay.style.top=`${box.top-parentBox.top}px`;
      overlay.style.width=`${box.width}px`;overlay.style.height=`${box.height}px`;
      overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
      for(const role of ['ring','pupil'])appendProjectedBrushOverlay(overlay,g,strokes()[role],{color:role==='ring'?[32,130,210]:[220,130,30]});
    }catch{overlay.replaceChildren();}
  }
  function pointerPoint(event){
    const mapped=mapAfterToLocalBrushPoint({...geometry(),
      clientX:event.clientX,clientY:event.clientY});
    return {u:mapped.x,v:mapped.y};
  }
  function addStroke(path){
    const all=Object.values(state.eyes).flatMap(eye=>[...eye.ring,...eye.pupil]);
    if(!path.length||all.length>=MAX_STROKES||
        all.reduce((sum,stroke)=>sum+stroke.path.length,path.length)>MAX_POINTS)
      throw Error('MANUAL_CONTACTS_UI_CAPACITY');
    const shape={operation:state.operation,path,
      radiusFraction:percent(radius,.1,25,'MANUAL_CONTACTS_UI_RADIUS_INVALID'),
      hardness:percent(hardness,0,100,'MANUAL_CONTACTS_UI_HARDNESS_INVALID')};
    update(()=>strokes()[state.role].push(shape),
      `${state.eye==='left'?'左':'右'}眼の${state.role==='ring'?'ring':'瞳孔除外'}を下書きしました。未保存です。`);
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
      status.textContent='After画像外・古い版ではstrokeを確定しません。';render();}
  }
  afterImage.addEventListener('pointerdown',event=>{
    if(drawing||event.isPrimary===false||
        (event.pointerType!=='touch'&&event.button!==0))return;
    try{const point=pointerPoint(event);
      drawing={id:event.pointerId,path:[point],invalid:false};
      try{afterImage.setPointerCapture?.(event.pointerId);}catch{}
      event.preventDefault();render();}
    catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='After画像上だけ描画できます。';}
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
      event.preventDefault();const next={x:Math.max(0,Math.min(1,keyboard.x+dx)),
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
      catch{status.textContent='After画像上だけ描画できます。';}
    }
  },{signal:events.signal});
  const switchMode=(control,change)=>control.addEventListener('click',()=>{
    try{update(change,'描画モードを切り替えました。未保存です。');}
    catch{render();}
  },{signal:events.signal});
  switchMode(left,()=>{state.eye='left';});switchMode(right,()=>{state.eye='right';});
  switchMode(ring,()=>{state.role='ring';});switchMode(pupil,()=>{state.role='pupil';});
  switchMode(add,()=>{state.operation='ADD';});
  switchMode(erase,()=>{state.operation='ERASE';});
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
  amount.addEventListener('change',()=>{
    try{const value=percent(amount,0,100,'MANUAL_CONTACTS_UI_AMOUNT_INVALID');
      update(()=>{state.amount=value;},'Amountを下書きへ変更しました。未保存です。');}
    catch{status.textContent='Amountは0〜100%の有限値です。';render();}
  },{signal:events.signal});
  submit.addEventListener('click',async()=>{
    if(busy||disposed||!host)return;
    let candidate;
    try{candidate=draft();}catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='両mask・版・権限を確認できずhostへ渡しません。';return;}
    busy=true;const token=++generation,abort=new AbortController();inFlight=abort;
    status.textContent='fresh hostを確認中。実保存・Finalは未確認です。';render();
    try{
      const verification=await host.verifyFresh({binding:clone(candidate.binding),
        savedRevision:mounted.savedRevision,signal:abort.signal});
      if(disposed||token!==generation||abort.signal.aborted)return;
      // This is only the injected host's reported check, never proof to this
      // detached UI that identity, iris location or persistence is authentic.
      if(!exact(verification,['status','binding','savedRevision'])||
          verification.status!=='verified'||
          !exact(verification.binding,['assetID','originalSHA256','personID','eye',
            'sourceWidth','sourceHeight'])||
          Object.keys(candidate.binding).some(key=>
            verification.binding[key]!==candidate.binding[key])||
          verification.savedRevision!==mounted.savedRevision)
        throw Error('MANUAL_CONTACTS_UI_HOST_VERIFICATION_INVALID');
      freshContext();
      await host.submitDraft(clone(candidate),{savedRevision:mounted.savedRevision,
        signal:abort.signal});
      if(disposed||token!==generation||abort.signal.aborted)return;
      freshContext();
      status.textContent='hostへ渡しました。保存・再読込・Finalは別途確認してください。';
    }catch(error){if(disposed||token!==generation)return;
      status.dataset.error=String(error?.message??error);
      status.textContent='依頼結果は未確認です。保存先を再読込して確認してください。';}
    finally{if(!disposed&&token===generation){busy=false;inFlight=null;render();}}
  },{signal:events.signal});
  cancel.addEventListener('click',()=>{
    dropDrawing();if(inFlight)inFlight.abort();generation++;inFlight=null;busy=false;
    state=initialState();history=[];future=[];
    status.textContent='下書きを破棄しました。保存・適用は未確認です。';render();
  },{signal:events.signal});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(render):null;
  resize?.observe(afterImage);
  afterImage.addEventListener('load',render,{signal:events.signal});render();
  return Object.freeze({refresh:render,
    getDraft(){if(!invalidated){try{freshContext();}catch{}}
      return clone(state);},
    getDocument(){return draft();},
    setEnabled(value){enabled=value===true;
      if(!enabled)retire('hostが無効化したため下書きを破棄しました。');render();},
    reset(next){
      freshContext();if(inFlight)inFlight.abort();generation++;busy=false;inFlight=null;
      dropDrawing();history=[];future=[];
      const checked=next===undefined?null:checkedInitial(next,binding);
      state=initialState();restore(state,checked);
      status.textContent='下書きを再読込しました。保存・Finalは未確認です。';render();
    },
    dispose(){disposed=true;generation++;if(inFlight)inFlight.abort();
      dropDrawing();events.abort();resize?.disconnect();overlay.remove();panel.remove();
      releaseImage();parent.style.position=hostPosition;}});
}
