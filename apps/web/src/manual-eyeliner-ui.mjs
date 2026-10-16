import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {MANUAL_EYELINER_VERSION} from './processing/manual-eyeliner-line.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const MAX_VERTICES=256,MAX_PATH=128,MAX_JSON=96*1024;
const clone=value=>structuredClone(value);
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&
  !Object.is(value,-0)&&value>=0&&value<=1;
const node=(doc,tag,text='')=>{const item=doc.createElement(tag);item.textContent=text;return item;};
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==null&&!(Object.getPrototypeOf(proto)===null&&
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
  for(let index=0;index<value.length;index++)
    if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(index))??{},'value'))
      return false;
  return true;
}
function checkedBinding(binding){
  if(!exact(binding,['assetID','originalSHA256','personID',
    'sourceWidth','sourceHeight'])||
      typeof binding.assetID!=='string'||!UUID.test(binding.assetID)||
      typeof binding.originalSHA256!=='string'||!SHA.test(binding.originalSHA256)||
      typeof binding.personID!=='string'||!UUID.test(binding.personID)||
      !Number.isSafeInteger(binding.sourceWidth)||binding.sourceWidth<1||
      !Number.isSafeInteger(binding.sourceHeight)||binding.sourceHeight<1||
      binding.sourceWidth*binding.sourceHeight>8_000_000)
    throw Error('MANUAL_EYELINER_UI_BINDING_INVALID');
  return binding;
}
const fromContext=context=>checkedBinding({assetID:context?.assetID,
  originalSHA256:context?.originalSHA256,personID:context?.personID,
  sourceWidth:context?.sourceWidth,sourceHeight:context?.sourceHeight});
const inside=(point,rect)=>exact(point,['u','v'])&&unit(point.u)&&
  unit(point.v)&&point.u>=rect.x&&point.u<=rect.x+rect.width&&
  point.v>=rect.y&&point.v<=rect.y+rect.height;
function checkedPath(value,rect,min){
  if(!dense(value,min,MAX_PATH)||!value.every(point=>inside(point,rect)))return false;
  return value.every((point,index)=>index===0||
    Math.hypot(point.u-value[index-1].u,point.v-value[index-1].v)>=1e-5);
}
function colorFromHex(value){
  if(typeof value!=='string'||!/^#[0-9a-f]{6}$/iu.test(value))
    throw Error('MANUAL_EYELINER_UI_COLOR_INVALID');
  return {r:parseInt(value.slice(1,3),16),g:parseInt(value.slice(3,5),16),
    b:parseInt(value.slice(5,7),16)};
}
const toHex=({r,g,b})=>'#'+[r,g,b].map(value=>
  value.toString(16).padStart(2,'0')).join('');
function percentage(input,min,max){
  const raw=input.value.trim();
  if(!/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/u.test(raw))
    throw Error('MANUAL_EYELINER_UI_NUMBER_INVALID');
  const value=Number(raw);
  if(!Number.isFinite(value)||value<min||value>max)
    throw Error('MANUAL_EYELINER_UI_NUMBER_INVALID');
  return value/100;
}

/** Typed geometry only. Eye labels and strokes cannot authenticate a person. */
export function makeManualEyelinerDocument(binding,eyeTargets,settings){
  checkedBinding(binding);
  if(!exact(settings,['color','opacity','lineRadiusFraction'])||
      !exact(settings.color,['r','g','b'])||
      !['r','g','b'].every(channel=>
        Number.isSafeInteger(settings.color[channel])&&
        settings.color[channel]>=0&&settings.color[channel]<=255)||
      !unit(settings.opacity)||
      typeof settings.lineRadiusFraction!=='number'||
      !Number.isFinite(settings.lineRadiusFraction)||
      settings.lineRadiusFraction<.001||settings.lineRadiusFraction>.03)
    throw Error('MANUAL_EYELINER_UI_SETTINGS_INVALID');
  if(!dense(eyeTargets,1,2))throw Error('MANUAL_EYELINER_UI_EYES_INVALID');
  const seen=new Set();let count=0;
  const eyes=eyeTargets.map(eye=>{
    if(!exact(eye,['side','rect','edge','wing'])||
        !['image-left','image-right'].includes(eye.side)||seen.has(eye.side)||
        !exact(eye.rect,['x','y','width','height'])||
        !unit(eye.rect.x)||!unit(eye.rect.y)||
        !unit(eye.rect.width)||!unit(eye.rect.height)||
        eye.rect.width<=0||eye.rect.height<=0||
        eye.rect.x+eye.rect.width>1||eye.rect.y+eye.rect.height>1||
        !checkedPath(eye.edge,eye.rect,2)||
        !(eye.wing===null||checkedPath(eye.wing,eye.rect,2)))
      throw Error('MANUAL_EYELINER_UI_EYE_INVALID');
    if(eye.wing&&(eye.wing[0].u!==eye.edge.at(-1).u||
        eye.wing[0].v!==eye.edge.at(-1).v))
      throw Error('MANUAL_EYELINER_UI_WING_DISCONNECTED');
    seen.add(eye.side);count+=eye.edge.length+(eye.wing?.length??0);
    if(count>MAX_VERTICES)throw Error('MANUAL_EYELINER_UI_CAPACITY');
    return clone(eye);
  });
  if(seen.size===2){
    const left=eyes.find(eye=>eye.side==='image-left').rect;
    const right=eyes.find(eye=>eye.side==='image-right').rect;
    if(left.x+left.width>right.x)
      throw Error('MANUAL_EYELINER_UI_EYES_OVERLAP');
  }
  const result={schemaVersion:1,engineVersion:MANUAL_EYELINER_VERSION,
    representation:'normalized-continuous-lid-edge-v1',binding:clone(binding),
    eyeTargets:eyes,settings:clone(settings)};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>MAX_JSON)
    throw Error('MANUAL_EYELINER_UI_JSON_LIMIT');
  return result;
}

const STYLE=`.suite-manual-eyeliner{box-sizing:border-box;max-width:100%;min-width:0;padding:1rem;border:1px solid #ccc8c0;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}
.suite-manual-eyeliner *{box-sizing:border-box}.suite-manual-eyeliner h3{font:normal clamp(1.3rem,3vw,1.8rem)/1.25 Georgia,serif;margin:0 0 .4rem}
.suite-manual-eyeliner p{overflow-wrap:anywhere}.suite-manual-eyeliner__controls{display:flex;flex-wrap:wrap;gap:.5rem}
.suite-manual-eyeliner button,.suite-manual-eyeliner input{min-height:44px;min-width:44px;border:1px solid #66625c;border-radius:0;background:#fff;color:#242321;font:inherit}
.suite-manual-eyeliner button{padding:.5rem .7rem;cursor:pointer}.suite-manual-eyeliner input{padding:.4rem;max-width:100%}
.suite-manual-eyeliner label{display:grid;gap:.25rem;min-width:7rem}.suite-manual-eyeliner :focus-visible{outline:3px solid #145b84;outline-offset:2px}
.suite-manual-eyeliner button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:600px){.suite-manual-eyeliner{padding:.6rem}.suite-manual-eyeliner__controls>*{flex:1 1 9rem}}
@media(prefers-reduced-motion:reduce){.suite-manual-eyeliner *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`;

/** After-only explicit line draft. onSubmit is transport, not proof of save. */
export function mountManualEyelinerUI({root,afterImage,getContext,onSubmit,
  enabled=false,initial}={}){
  if(!(root instanceof HTMLElement)||!(afterImage instanceof HTMLImageElement)||
      root.ownerDocument!==afterImage.ownerDocument||!afterImage.parentElement||
      typeof getContext!=='function'||
      (onSubmit!==undefined&&typeof onSubmit!=='function'))
    throw Error('MANUAL_EYELINER_UI_MOUNT_INVALID');
  const doc=root.ownerDocument,host=afterImage.parentElement,mounted=getContext();
  const binding=fromContext(mounted);
  if(!Number.isSafeInteger(mounted.savedRevision)||mounted.savedRevision<1)
    throw Error('MANUAL_EYELINER_UI_CONTEXT_INVALID');
  const pinned=[binding.assetID,binding.originalSHA256,binding.personID,
    binding.sourceWidth,binding.sourceHeight,mounted.savedRevision].join(':');
  let existing=null;
  if(initial!==undefined){
    if(!exact(initial,['schemaVersion','engineVersion','representation','binding',
      'eyeTargets','settings'])||initial.schemaVersion!==1||
        initial.engineVersion!==MANUAL_EYELINER_VERSION||
        initial.representation!=='normalized-continuous-lid-edge-v1')
      throw Error('MANUAL_EYELINER_UI_INITIAL_INVALID');
    existing=makeManualEyelinerDocument(initial.binding,initial.eyeTargets,
      initial.settings);
    if(Object.keys(binding).some(key=>existing.binding[key]!==binding[key]))
      throw Error('MANUAL_EYELINER_UI_INITIAL_BINDING_MISMATCH');
  }
  const initialState=()=>({eyes:clone(existing?.eyeTargets??[]),
    color:toHex(existing?.settings.color??{r:24,g:19,b:19}),
    opacity:existing?.settings.opacity??.8,
    lineRadiusFraction:existing?.settings.lineRadiusFraction??.012,
    side:'image-left',tool:'rect',pending:[]});
  let state=initialState(),history=[],future=[],invalid=false,disposed=false;
  let pointer=null,keyboard={x:.5,y:.5},busy=false,generation=0,inFlight=null;
  const events=new AbortController();
  const panel=node(doc,'section');panel.className='suite-manual-eyeliner';
  panel.setAttribute('aria-label','Eyeliner · 本人手描き');
  panel.append(node(doc,'style',STYLE),node(doc,'h3','Eyeliner · 本人手描き'),
    node(doc,'p','After写真で眼矩形を指定し、連続した瞼線と任意のwingを描きます。自動眼検出・公式スタイル・実保存は未接続です。'));
  const controls=node(doc,'div');controls.className='suite-manual-eyeliner__controls';
  const button=text=>{const item=node(doc,'button',text);item.type='button';return item;};
  const left=button('画像左眼'),right=button('画像右眼'),rect=button('眼矩形'),
    edge=button('瞼線'),wing=button('wing'),undo=button('戻す'),
    redo=button('やり直す'),submit=button('hostへ下書きを渡す'),
    cancel=button('下書きを破棄');
  const color=node(doc,'input');color.type='color';color.value=state.color;
  color.setAttribute('aria-label','瞼線の色');
  const opacity=node(doc,'input');opacity.type='number';opacity.min='0';
  opacity.max='100';opacity.step='any';opacity.value=String(state.opacity*100);
  opacity.setAttribute('aria-label','瞼線 opacity %');
  const radius=node(doc,'input');radius.type='number';radius.min='0.1';
  radius.max='3';radius.step='any';radius.value=String(state.lineRadiusFraction*100);
  radius.setAttribute('aria-label','瞼線半径 %');
  const labelled=(text,input)=>{const label=node(doc,'label',text);label.append(input);return label;};
  controls.append(left,right,rect,edge,wing,labelled('色',color),
    labelled('Opacity',opacity),labelled('線半径',radius),
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
    touch:afterImage.style.touchAction,outline:afterImage.style.outline,
    outlineOffset:afterImage.style.outlineOffset};
  let imageClaimed=false;
  function claim(){
    if(imageClaimed)return;imageClaimed=true;afterImage.tabIndex=0;
    afterImage.setAttribute('role','button');
    afterImage.setAttribute('aria-label',
      'After写真のEyeliner手描き。矢印で移動、Enterで点、Escapeで取消');
    afterImage.setAttribute('aria-keyshortcuts',
      'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape');
    afterImage.style.touchAction='none';afterImage.style.outlineOffset='3px';
  }
  function release(){
    if(!imageClaimed)return;imageClaimed=false;
    for(const [key,value] of [['tabindex',previous.tabindex],
      ['role',previous.role],['aria-label',previous.label],
      ['aria-keyshortcuts',previous.shortcuts]]){
      if(value===null)afterImage.removeAttribute(key);
      else afterImage.setAttribute(key,value);
    }
    afterImage.style.touchAction=previous.touch;
    afterImage.style.outline=previous.outline;
    afterImage.style.outlineOffset=previous.outlineOffset;
  }
  const eye=()=>state.eyes.find(item=>item.side===state.side);
  function retire(reason){
    if(invalid)return;invalid=true;pointer=null;state=initialState();
    state.eyes=[];state.pending=[];history=[];future=[];generation++;
    inFlight?.abort();inFlight=null;busy=false;status.textContent=reason;
  }
  function fresh(){
    if(disposed||invalid||!enabled||!afterImage.complete||!afterImage.naturalWidth||
        !afterImage.naturalHeight)
      throw Error('MANUAL_EYELINER_UI_AFTER_NOT_READY');
    let current,b;
    try{current=getContext();b=fromContext(current);}catch{
      retire('対象・版・権限が不明なため下書きを破棄しました。');
      throw Error('MANUAL_EYELINER_UI_CONTEXT_INVALID');
    }
    const key=[b.assetID,b.originalSHA256,b.personID,b.sourceWidth,b.sourceHeight,
      current.savedRevision].join(':');
    if(key!==pinned||current.permissionExpired===true){
      retire('Asset・人物・版・権限の変更により下書きを破棄しました。');
      throw Error('MANUAL_EYELINER_UI_STALE_CONTEXT');
    }
    if(current.ready!==true||current.dirty!==false||current.busy===true||
        current.view!=='after')
      throw Error('MANUAL_EYELINER_UI_CONTEXT_NOT_READY');
    return current;
  }
  function geometry(){
    const current=fresh();
    if(busy)throw Error('MANUAL_EYELINER_UI_BUSY');
    if(current.expectedAfterURL&&afterImage.getAttribute('src')!==current.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {...current,afterRect:afterImage.getBoundingClientRect(),
      uprightWidth:current.uprightWidth??binding.sourceWidth,uprightHeight:current.uprightHeight??binding.sourceHeight,
      naturalWidth:afterImage.naturalWidth,naturalHeight:afterImage.naturalHeight};
  }
  function pointerPoint(clientX,clientY){
    const mapped=mapAfterToLocalBrushPoint({...geometry(),clientX,clientY});
    return {u:mapped.x,v:mapped.y};
  }
  function snapshot(change,message){
    if(busy)throw Error('MANUAL_EYELINER_UI_BUSY');fresh();
    const old=clone(state);change();history.push(old);
    if(history.length>128)history.shift();future=[];
    status.textContent=message;render();
  }
  function inSelected(point){const selected=eye();
    return selected&&inside(point,selected.rect);}
  function appendPoint(point){
    if(state.tool==='rect'){
      if(!state.pending.length){snapshot(()=>{state.pending=[point];},
        '眼矩形の対角点を選んでください。未保存です。');return;}
      const a=state.pending[0],x=Math.min(a.u,point.u),
        y=Math.min(a.v,point.v),width=Math.abs(a.u-point.u),
        height=Math.abs(a.v-point.v);
      if(width<.005||height<.005)
        throw Error('MANUAL_EYELINER_UI_RECT_TOO_SMALL');
      snapshot(()=>{
        state.eyes=state.eyes.filter(item=>item.side!==state.side);
        state.eyes.push({side:state.side,rect:{x,y,width,height},edge:[],wing:null});
        state.pending=[];
      },'眼矩形を下書きしました。瞼線を指定してください。未保存です。');return;
    }
    if(!inSelected(point))throw Error('MANUAL_EYELINER_UI_POINT_OUTSIDE_EYE');
    const selected=eye();
    if(state.tool==='wing'&&selected.edge.length<2)
      throw Error('MANUAL_EYELINER_UI_EDGE_REQUIRED');
    const list=state.tool==='edge'?selected.edge:selected.wing??[selected.edge.at(-1)];
    if(list.length>=MAX_PATH||
        (list.length>0&&Math.hypot(point.u-list.at(-1).u,
          point.v-list.at(-1).v)<1e-5))
      throw Error('MANUAL_EYELINER_UI_POINT_INVALID');
    snapshot(()=>{
      if(state.tool==='edge'){
        selected.edge.push(point);
        selected.wing=null; // wing must remain attached to the latest edge end.
      }else selected.wing=[...list,point];
    },'連続した瞼線を下書きしました。未保存です。');
  }
  function appendPath(points){
    if(!points.length)return;
    if(state.tool==='rect'){
      if(state.pending.length)throw Error('MANUAL_EYELINER_UI_PENDING_RECT');
      const a=points[0],b=points.at(-1),x=Math.min(a.u,b.u),
        y=Math.min(a.v,b.v),width=Math.abs(a.u-b.u),height=Math.abs(a.v-b.v);
      if(width<.005||height<.005)
        throw Error('MANUAL_EYELINER_UI_RECT_TOO_SMALL');
      snapshot(()=>{
        state.eyes=state.eyes.filter(item=>item.side!==state.side);
        state.eyes.push({side:state.side,rect:{x,y,width,height},edge:[],wing:null});
        state.pending=[];
      },'眼矩形を下書きしました。瞼線を指定してください。未保存です。');
      return;
    }
    if(points.some(point=>!inSelected(point)))
      throw Error('MANUAL_EYELINER_UI_POINT_OUTSIDE_EYE');
    const selected=eye();
    if(state.tool==='wing'&&selected.edge.length<2)
      throw Error('MANUAL_EYELINER_UI_EDGE_REQUIRED');
    const list=state.tool==='edge'?selected.edge:selected.wing??[selected.edge.at(-1)];
    const additions=[];
    for(const point of points){
      const prior=additions.at(-1)??list.at(-1);
      if(prior&&Math.hypot(point.u-prior.u,point.v-prior.v)<1e-5)continue;
      additions.push(point);
    }
    if(!additions.length||list.length+additions.length>MAX_PATH)
      throw Error('MANUAL_EYELINER_UI_CAPACITY');
    snapshot(()=>{
      if(state.tool==='edge'){
        selected.edge.push(...additions);selected.wing=null;
      }else selected.wing=[...list,...additions];
    },'連続した瞼線を下書きしました。未保存です。');
  }
  function document(){
    fresh();return makeManualEyelinerDocument(binding,state.eyes,
      {color:colorFromHex(state.color),opacity:state.opacity,
        lineRadiusFraction:state.lineRadiusFraction});
  }
  function render(){
    let ready=false;try{geometry();ready=true;}catch{}
    if(ready)claim();else release();
    color.value=state.color;opacity.value=String(state.opacity*100);
    radius.value=String(state.lineRadiusFraction*100);
    for(const item of [left,right,rect,edge,wing,color,opacity,radius])
      item.disabled=!ready||busy;
    undo.disabled=!ready||busy||!history.length;
    redo.disabled=!ready||busy||!future.length;
    submit.disabled=!ready||busy||typeof onSubmit!=='function'||
      !state.eyes.length||state.eyes.some(item=>item.edge.length<2);
    cancel.disabled=disposed||invalid||
      (!busy&&!history.length&&!state.pending.length&&!pointer);
    left.setAttribute('aria-pressed',String(state.side==='image-left'));
    right.setAttribute('aria-pressed',String(state.side==='image-right'));
    rect.setAttribute('aria-pressed',String(state.tool==='rect'));
    edge.setAttribute('aria-pressed',String(state.tool==='edge'));
    wing.setAttribute('aria-pressed',String(state.tool==='wing'));
    overlay.replaceChildren();if(!ready)return;
    try{
      const g=geometry(),box=afterImage.getBoundingClientRect(),
        parent=host.getBoundingClientRect();
      overlay.style.left=`${box.left-parent.left}px`;
      overlay.style.top=`${box.top-parent.top}px`;
      overlay.style.width=`${box.width}px`;overlay.style.height=`${box.height}px`;
      overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
      appendProjectedBrushOverlay(overlay,g,[],{vectors:state.eyes.flatMap(item=>[
        {rect:item.rect},...([item.edge,...(item.wing?[item.wing]:[])].filter(points=>points.length).map(points=>({points,radius:state.lineRadiusFraction})))
      ]),opacity:.7});
    }catch{overlay.replaceChildren();}
  }
  const mode=(item,change)=>item.addEventListener('click',()=>{
    try{snapshot(()=>{change();state.pending=[];},
      '描画対象を変更しました。未保存です。');}catch{render();}
  },{signal:events.signal});
  mode(left,()=>{state.side='image-left';});
  mode(right,()=>{state.side='image-right';});
  mode(rect,()=>{state.tool='rect';});
  mode(edge,()=>{state.tool='edge';});
  mode(wing,()=>{state.tool='wing';});
  afterImage.addEventListener('pointerdown',event=>{
    if(pointer||event.isPrimary===false||
        (event.pointerType!=='touch'&&event.button!==0))return;
    try{const start=pointerPoint(event.clientX,event.clientY);
      pointer={id:event.pointerId,points:[start],invalid:false};
      afterImage.setPointerCapture?.(event.pointerId);event.preventDefault();
    }catch{status.textContent='Afterの画像内のみ選択できます。';}
  },{signal:events.signal});
  afterImage.addEventListener('pointermove',event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    try{const next=pointerPoint(event.clientX,event.clientY);
      if(pointer.points.length>=MAX_PATH){pointer.invalid=true;return;}
      const last=pointer.points.at(-1);
      if(Math.hypot(next.u-last.u,next.v-last.v)>.001)
        pointer.points.push(next);
    }catch{pointer.invalid=true;}
  },{signal:events.signal});
  afterImage.addEventListener('pointerup',event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    const active=pointer;pointer=null;
    try{afterImage.releasePointerCapture?.(event.pointerId);}catch{}
    if(active.invalid){status.textContent='画像外へ出た操作を取消しました。';render();return;}
    try{
      const end=pointerPoint(event.clientX,event.clientY),last=active.points.at(-1);
      if(Math.hypot(end.u-last.u,end.v-last.v)>.001)active.points.push(end);
      if(active.points.length===1)appendPoint(end);
      else appendPath(active.points);
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='眼矩形・瞼線を確定できません。対象と位置を確認してください。';
      render();}
  },{signal:events.signal});
  afterImage.addEventListener('pointercancel',event=>{
    if(pointer?.id===event.pointerId){pointer=null;
      status.textContent='ポインター操作を取消しました。';render();}
  },{signal:events.signal});
  afterImage.addEventListener('focus',()=>{if(imageClaimed)
    afterImage.style.outline='3px solid #145b84';},{signal:events.signal});
  afterImage.addEventListener('blur',()=>{if(imageClaimed)
    afterImage.style.outline=previous.outline;},{signal:events.signal});
  afterImage.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      pointer=null;state.pending=[];
      if(inFlight){inFlight.abort();generation++;inFlight=null;busy=false;}
      status.textContent='進行中の操作を取消しました。未保存です。';render();return;
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
        status.textContent=`画像位置 ${Math.round(next.x*100)}%, ${Math.round(next.y*100)}%`;}
      catch{status.textContent='余白・Crop外には移動できません。';}
    }else if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      try{const mapped=mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX:keyboard.x,afterY:keyboard.y});
        appendPoint({u:mapped.x,v:mapped.y});}
      catch(error){status.dataset.error=String(error?.message??error);
        status.textContent='画像内または眼矩形内で点を指定してください。';}
    }
  },{signal:events.signal});
  undo.addEventListener('click',()=>{
    try{fresh();if(!history.length)return;
      future.push(clone(state));state=history.pop();
      status.textContent='下書きを戻しました。未保存です。';render();}
    catch{render();}
  },{signal:events.signal});
  redo.addEventListener('click',()=>{
    try{fresh();if(!future.length)return;
      history.push(clone(state));state=future.pop();
      status.textContent='下書きをやり直しました。未保存です。';render();}
    catch{render();}
  },{signal:events.signal});
  color.addEventListener('change',()=>{
    try{const value=toHex(colorFromHex(color.value));
      snapshot(()=>{state.color=value;},'色を変更しました。未保存です。');}
    catch{status.textContent='色は6桁のRGBで指定してください。';render();}
  },{signal:events.signal});
  opacity.addEventListener('change',()=>{
    try{const value=percentage(opacity,0,100);
      snapshot(()=>{state.opacity=value;},'Opacityを変更しました。未保存です。');}
    catch{status.textContent='Opacityは0〜100%で指定してください。';render();}
  },{signal:events.signal});
  radius.addEventListener('change',()=>{
    try{const value=percentage(radius,.1,3);
      snapshot(()=>{state.lineRadiusFraction=value;},
        '線半径を変更しました。未保存です。');}
    catch{status.textContent='線半径は0.1〜3%です。';render();}
  },{signal:events.signal});
  submit.addEventListener('click',async()=>{
    if(busy||disposed||typeof onSubmit!=='function')return;
    let candidate;
    try{candidate=document();}catch(error){
      status.dataset.error=String(error?.message??error);
      status.textContent='下書き・対象・版を確認できずhostへ渡しません。';return;
    }
    busy=true;const token=++generation,abort=new AbortController();inFlight=abort;
    status.textContent='hostへ下書きを依頼中。実保存・Finalは未確認です。';render();
    try{
      await onSubmit(clone(candidate),{savedRevision:mounted.savedRevision,
        personID:binding.personID,signal:abort.signal});
      if(disposed||token!==generation||abort.signal.aborted)return;
      fresh();
      status.textContent='hostへ渡しました。実保存・適用・Finalは別途確認してください。';
    }catch(error){if(disposed||token!==generation)return;
      status.dataset.error=String(error?.message??error);
      status.textContent='依頼は完了していません。実保存も未確認です。';
    }finally{if(!disposed&&token===generation){busy=false;inFlight=null;render();}}
  },{signal:events.signal});
  cancel.addEventListener('click',()=>{
    pointer=null;inFlight?.abort();generation++;inFlight=null;busy=false;
    state=initialState();state.eyes=[];state.pending=[];history=[];future=[];
    status.textContent='下書きを破棄しました。保存・適用は未確認です。';render();
  },{signal:events.signal});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(render):null;
  resize?.observe(afterImage);
  afterImage.addEventListener('load',render,{signal:events.signal});
  render();
  return Object.freeze({refresh:render,
    getDraft(){if(!invalid){try{fresh();}catch{}}
      return clone({eyeTargets:state.eyes,settings:{color:colorFromHex(state.color),
        opacity:state.opacity,lineRadiusFraction:state.lineRadiusFraction},
      side:state.side,tool:state.tool,pending:state.pending});},
    getDocument:document,
    setEnabled(value){enabled=value===true;
      if(!enabled)retire('hostが無効化したため下書きを破棄しました。');render();},
    dispose(){disposed=true;generation++;inFlight?.abort();pointer=null;
      events.abort();resize?.disconnect();overlay.remove();panel.remove();
      release();host.style.position=oldPosition;}});
}
