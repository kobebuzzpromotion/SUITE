import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint} from './local-levels-brush-coordinate.mjs';
import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {MANUAL_EYELASH_VERSION} from './processing/manual-eyelash-render.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const MAX_CURVES=128,MAX_JSON=96*1024;
const STYLE=`.suite-manual-eyelash{box-sizing:border-box;max-width:100%;padding:1rem;border:1px solid #ccc8c0;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}.suite-manual-eyelash *{box-sizing:border-box}.suite-manual-eyelash h3{font:normal 1.5rem/1.25 Georgia,serif;margin:0 0 .4rem}.suite-manual-eyelash p{overflow-wrap:anywhere}.suite-manual-eyelash__controls{display:flex;flex-wrap:wrap;gap:.5rem}.suite-manual-eyelash button,.suite-manual-eyelash input{min-height:44px;min-width:44px;border:1px solid #66625c;border-radius:0;background:#fff;color:#242321;font:inherit}.suite-manual-eyelash button{padding:.5rem .7rem;cursor:pointer}.suite-manual-eyelash input{padding:.4rem}.suite-manual-eyelash label{display:grid;gap:.25rem;min-width:7rem}.suite-manual-eyelash :focus-visible{outline:3px solid #145b84;outline-offset:2px}.suite-manual-eyelash button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:600px){.suite-manual-eyelash{padding:.6rem}.suite-manual-eyelash__controls>*{flex:1 1 9rem}}@media(prefers-reduced-motion:reduce){.suite-manual-eyelash *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`;
const clone=value=>structuredClone(value);
const node=(doc,tag,text='')=>{const item=doc.createElement(tag);item.textContent=text;return item;};
const unit=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==null&&!(Object.getPrototypeOf(proto)===null&&
      Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object'))return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&Object.hasOwn(descriptor,'value');
  });
}
function dense(value,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max||
      Reflect.ownKeys(value).length!==value.length+1)return false;
  return Array.from({length:value.length},(_,i)=>i).every(i=>
    Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(i))??{},'value'));
}
function bound(binding){
  if(!exact(binding,['assetID','originalSHA256','personID','sourceWidth','sourceHeight'])||
      typeof binding.assetID!=='string'||!UUID.test(binding.assetID)||
      typeof binding.originalSHA256!=='string'||!SHA.test(binding.originalSHA256)||
      typeof binding.personID!=='string'||!UUID.test(binding.personID)||
      !Number.isSafeInteger(binding.sourceWidth)||binding.sourceWidth<1||
      !Number.isSafeInteger(binding.sourceHeight)||binding.sourceHeight<1||
      binding.sourceWidth*binding.sourceHeight>8_000_000)
    throw Error('MANUAL_EYELASH_UI_BINDING_INVALID');
  return binding;
}
const fromContext=context=>bound({assetID:context?.assetID,
  originalSHA256:context?.originalSHA256,personID:context?.personID,
  sourceWidth:context?.sourceWidth,sourceHeight:context?.sourceHeight});
const inRect=(point,rect)=>exact(point,['u','v'])&&unit(point.u)&&unit(point.v)&&
  point.u>=rect.x&&point.u<=rect.x+rect.width&&
  point.v>=rect.y&&point.v<=rect.y+rect.height;
const colorFromHex=value=>{
  if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))
    throw Error('MANUAL_EYELASH_UI_COLOR_INVALID');
  return {r:parseInt(value.slice(1,3),16),g:parseInt(value.slice(3,5),16),
    b:parseInt(value.slice(5,7),16)};
};
const toHex=({r,g,b})=>'#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('');

/** A structural draft only: these fields do not authenticate eye location or user. */
export function makeManualEyelashDocument(binding,eyeTargets,settings){
  bound(binding);
  if(!exact(settings,['color','opacity'])||
      !exact(settings.color,['r','g','b'])||
      !['r','g','b'].every(k=>Number.isSafeInteger(settings.color[k])&&
        settings.color[k]>=0&&settings.color[k]<=255)||
      !unit(settings.opacity)||Object.is(settings.opacity,-0))
    throw Error('MANUAL_EYELASH_UI_SETTINGS_INVALID');
  if(!dense(eyeTargets,1,2))throw Error('MANUAL_EYELASH_UI_EYES_INVALID');
  const sides=new Set();let count=0;
  const eyes=eyeTargets.map(eye=>{
    if(!exact(eye,['side','rect','curves'])||
        !['image-left','image-right'].includes(eye.side)||sides.has(eye.side)||
        !exact(eye.rect,['x','y','width','height'])||
        !unit(eye.rect.x)||!unit(eye.rect.y)||!unit(eye.rect.width)||
        !unit(eye.rect.height)||eye.rect.width<=0||eye.rect.height<=0||
        eye.rect.x+eye.rect.width>1||eye.rect.y+eye.rect.height>1||
        !dense(eye.curves,1,MAX_CURVES))
      throw Error('MANUAL_EYELASH_UI_EYES_INVALID');
    sides.add(eye.side);
    const curves=eye.curves.map(curve=>{
      if(++count>MAX_CURVES||!exact(curve,['root','control','tip','rootRadiusFraction'])||
          !inRect(curve.root,eye.rect)||!inRect(curve.control,eye.rect)||
          !inRect(curve.tip,eye.rect)||
          Math.hypot(curve.root.u-curve.tip.u,curve.root.v-curve.tip.v)<1e-5||
          typeof curve.rootRadiusFraction!=='number'||
          !Number.isFinite(curve.rootRadiusFraction)||
          curve.rootRadiusFraction<.001||curve.rootRadiusFraction>.03)
        throw Error('MANUAL_EYELASH_UI_CURVE_INVALID');
      return clone(curve);
    });
    return {side:eye.side,rect:clone(eye.rect),curves};
  });
  if(sides.size===2){
    const left=eyes.find(eye=>eye.side==='image-left').rect;
    const right=eyes.find(eye=>eye.side==='image-right').rect;
    if(left.x+left.width>right.x)throw Error('MANUAL_EYELASH_UI_EYES_OVERLAP');
  }
  const result={schemaVersion:1,engineVersion:MANUAL_EYELASH_VERSION,
    representation:'normalized-quadratic-root-control-tip-v1',binding:clone(binding),
    eyeTargets:eyes,settings:clone(settings)};
  if(new TextEncoder().encode(JSON.stringify(result)).byteLength>MAX_JSON)
    throw Error('MANUAL_EYELASH_UI_JSON_LIMIT');
  return result;
}

/** After-only owner-authored draft. onSubmit is transport, not saved/authorized proof. */
export function mountManualEyelashUI({root,afterImage,getContext,onSubmit,enabled=false,
  initial}={}){
  if(!(root instanceof HTMLElement)||!(afterImage instanceof HTMLImageElement)||
      root.ownerDocument!==afterImage.ownerDocument||!afterImage.parentElement||
      typeof getContext!=='function'||
      (onSubmit!==undefined&&typeof onSubmit!=='function'))
    throw Error('MANUAL_EYELASH_UI_MOUNT_INVALID');
  const doc=root.ownerDocument,host=afterImage.parentElement,mounted=getContext();
  const binding=fromContext(mounted);
  if(!Number.isSafeInteger(mounted.savedRevision)||mounted.savedRevision<1)
    throw Error('MANUAL_EYELASH_UI_CONTEXT_INVALID');
  const pinned=[binding.assetID,binding.originalSHA256,binding.personID,
    binding.sourceWidth,binding.sourceHeight,mounted.savedRevision].join(':');
  if(initial!==undefined){
    if(!exact(initial,['schemaVersion','engineVersion','representation','binding','eyeTargets','settings'])||
        initial.schemaVersion!==1||initial.engineVersion!==MANUAL_EYELASH_VERSION||
        initial.representation!=='normalized-quadratic-root-control-tip-v1')
      throw Error('MANUAL_EYELASH_UI_INITIAL_INVALID');
    makeManualEyelashDocument(initial.binding,initial.eyeTargets,initial.settings);
    if(['assetID','originalSHA256','personID','sourceWidth','sourceHeight'].some(k=>
      initial.binding[k]!==binding[k]))throw Error('MANUAL_EYELASH_UI_INITIAL_BINDING_MISMATCH');
  }
  const initialState=()=>({eyes:clone(initial?.eyeTargets??[]),
    color:toHex(initial?.settings.color??{r:24,g:19,b:19}),
    opacity:initial?.settings.opacity??.8,radius:.012,
    side:'image-left',tool:'rect',pending:[]});
  let state=initialState(),history=[],future=[],invalid=false,disposed=false;
  let pointer=null,keyboard={u:.5,v:.5},busy=false,generation=0,inFlight=null;
  const events=new AbortController();
  const panel=node(doc,'section');panel.className='suite-manual-eyelash';
  panel.setAttribute('aria-label','まつ毛 · 本人手描き');
  panel.append(node(doc,'style',STYLE),node(doc,'h3','まつ毛 · 本人手描き'),
    node(doc,'p','After写真で眼矩形を指定後、root・control・tipを順に選びます。自動眼検出・公式スタイル・実保存は未接続です。'));
  const controls=node(doc,'div');controls.className='suite-manual-eyelash__controls';
  const button=text=>{const item=node(doc,'button',text);item.type='button';return item;};
  const left=button('画像左眼'),right=button('画像右眼'),rect=button('眼矩形'),
    curve=button('root・control・tip'),undo=button('戻す'),redo=button('やり直す'),
    submit=button('hostへ下書きを渡す'),cancel=button('下書きを破棄');
  const color=node(doc,'input');color.type='color';color.value=state.color;
  color.setAttribute('aria-label','まつ毛の色');
  const opacity=node(doc,'input');opacity.type='number';opacity.min='0';
  opacity.max='100';opacity.step='any';opacity.value=String(state.opacity*100);
  opacity.setAttribute('aria-label','まつ毛 opacity %');
  const radius=node(doc,'input');radius.type='number';radius.min='0.1';
  radius.max='3';radius.step='any';radius.value='1.2';
  radius.setAttribute('aria-label','root 半径 %');
  const labelled=(label,input)=>{const item=node(doc,'label',label);item.append(input);return item;};
  controls.append(left,right,rect,curve,labelled('色',color),
    labelled('Opacity',opacity),labelled('root半径',radius),undo,redo,submit,cancel);
  panel.append(controls);
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
    touch:afterImage.style.touchAction,outline:afterImage.style.outline};
  let imageClaimed=false;
  function claim(){
    if(imageClaimed)return;imageClaimed=true;afterImage.tabIndex=0;
    afterImage.setAttribute('role','button');
    afterImage.setAttribute('aria-label','After写真のまつ毛手描き。矢印で移動、Enterで点、Escapeで取消');
    afterImage.style.touchAction='none';
  }
  function release(){
    if(!imageClaimed)return;imageClaimed=false;
    for(const [key,value] of [['tabindex',previous.tabindex],['role',previous.role],
      ['aria-label',previous.label]]){
      if(value===null)afterImage.removeAttribute(key);else afterImage.setAttribute(key,value);
    }
    afterImage.style.touchAction=previous.touch;afterImage.style.outline=previous.outline;
  }
  const eye=()=>state.eyes.find(item=>item.side===state.side);
  function retire(reason){
    if(invalid)return;invalid=true;pointer=null;state=initialState();
    state.eyes=[];state.pending=[];history=[];future=[];generation++;
    inFlight?.abort();inFlight=null;busy=false;status.textContent=reason;
  }
  function fresh(){
    if(disposed||invalid||!enabled||!afterImage.complete||!afterImage.naturalWidth||
        !afterImage.naturalHeight)throw Error('MANUAL_EYELASH_UI_AFTER_NOT_READY');
    let current,b;
    try{current=getContext();b=fromContext(current);}catch{
      retire('対象・版・権限が不明なため下書きを破棄しました。');
      throw Error('MANUAL_EYELASH_UI_CONTEXT_INVALID');
    }
    const key=[b.assetID,b.originalSHA256,b.personID,b.sourceWidth,b.sourceHeight,
      current.savedRevision].join(':');
    if(key!==pinned||current.permissionExpired===true){
      retire('Asset・人物・版・権限の変更により下書きを破棄しました。');
      throw Error('MANUAL_EYELASH_UI_STALE_CONTEXT');
    }
    if(current.ready!==true||current.dirty!==false||current.busy===true||
        current.view!=='after')throw Error('MANUAL_EYELASH_UI_CONTEXT_NOT_READY');
    return current;
  }
  function geometry(){
    const context=fresh();
    if(context.expectedAfterURL&&afterImage.getAttribute('src')!==context.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {...context,afterRect:afterImage.getBoundingClientRect(),
      naturalWidth:afterImage.naturalWidth,naturalHeight:afterImage.naturalHeight,
      uprightWidth:context.uprightWidth??binding.sourceWidth,uprightHeight:context.uprightHeight??binding.sourceHeight};
  }
  function point(clientX,clientY){
    const p=mapAfterToLocalBrushPoint({...geometry(),clientX,clientY});
    return {u:p.x,v:p.y};
  }
  function snapshot(change,message){
    if(busy)throw Error('MANUAL_EYELASH_UI_BUSY');fresh();
    const old=clone(state);change();history.push(old);if(history.length>128)history.shift();
    future=[];status.textContent=message;render();
  }
  function setPoint(p){
    if(state.tool==='rect'){
      if(state.pending.length===0){snapshot(()=>{state.pending=[p];},
        '矩形の対角点を選んでください。未保存です。');return;}
      const a=state.pending[0],x=Math.min(a.u,p.u),y=Math.min(a.v,p.v),
        width=Math.abs(a.u-p.u),height=Math.abs(a.v-p.v);
      if(width<.005||height<.005)throw Error('MANUAL_EYELASH_UI_RECT_TOO_SMALL');
      snapshot(()=>{
        const next={side:state.side,rect:{x,y,width,height},curves:[]};
        state.eyes=state.eyes.filter(item=>item.side!==state.side);
        state.eyes.push(next);state.pending=[];
      },'眼矩形を下書きしました。曲線を追加してください。未保存です。');return;
    }
    const selected=eye();if(!selected||!inRect(p,selected.rect))
      throw Error('MANUAL_EYELASH_UI_POINT_OUTSIDE_EYE');
    if(state.pending.length<2){snapshot(()=>{state.pending.push(p);},
      `${['control','tip'][state.pending.length]}を選んでください。未保存です。`);return;}
    const [root,control]=state.pending,tip=p;
    const value=Number(radius.value.trim());
    if(!Number.isFinite(value)||value<.1||value>3||
        Math.hypot(root.u-tip.u,root.v-tip.v)<1e-5)
      throw Error('MANUAL_EYELASH_UI_CURVE_INVALID');
    snapshot(()=>{
      selected.curves.push({root,control,tip,rootRadiusFraction:value/100});
      state.pending=[];
    },'まつ毛曲線を追加しました。未保存です。');
  }
  function document(){
    fresh();return makeManualEyelashDocument(binding,state.eyes,
      {color:colorFromHex(state.color),opacity:state.opacity});
  }
  function render(){
    let ready=false;try{fresh();ready=!busy;}catch{}
    if(ready)claim();else release();
    color.value=state.color;opacity.value=String(state.opacity*100);
    radius.value=String(state.radius*100);
    for(const item of [left,right,rect,curve,color,opacity,radius])item.disabled=!ready;
    undo.disabled=!ready||history.length===0;redo.disabled=!ready||future.length===0;
    submit.disabled=!ready||typeof onSubmit!=='function'||
      !state.eyes.some(item=>item.curves.length);
    cancel.disabled=disposed||invalid||(!busy&&!history.length&&!state.pending.length);
    left.setAttribute('aria-pressed',String(state.side==='image-left'));
    right.setAttribute('aria-pressed',String(state.side==='image-right'));
    rect.setAttribute('aria-pressed',String(state.tool==='rect'));
    curve.setAttribute('aria-pressed',String(state.tool==='curve'));
    overlay.replaceChildren();if(!ready)return;
    const box=afterImage.getBoundingClientRect(),parent=host.getBoundingClientRect();
    overlay.style.left=`${box.left-parent.left}px`;overlay.style.top=`${box.top-parent.top}px`;
    overlay.style.width=`${box.width}px`;overlay.style.height=`${box.height}px`;
    overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
    try{appendProjectedBrushOverlay(overlay,geometry(),[],{vectors:state.eyes.flatMap(item=>[
      {rect:item.rect},...item.curves.map(line=>({quadratic:line,radius:line.rootRadiusFraction}))
    ]),opacity:.7});}catch{overlay.replaceChildren();}

  }
  const mode=(item,change)=>item.addEventListener('click',()=>{
    try{snapshot(()=>{change();state.pending=[];},'描画対象を変更しました。未保存です。');}
    catch{render();}
  },{signal:events.signal});
  mode(left,()=>{state.side='image-left';});mode(right,()=>{state.side='image-right';});
  mode(rect,()=>{state.tool='rect';});mode(curve,()=>{state.tool='curve';});
  afterImage.addEventListener('pointerdown',event=>{
    if(pointer||event.isPrimary===false||
        (event.pointerType!=='touch'&&event.button!==0))return;
    try{const start=point(event.clientX,event.clientY);
      pointer={id:event.pointerId,start,last:start};
      afterImage.setPointerCapture?.(event.pointerId);event.preventDefault();}
    catch{status.textContent='Afterの画像内のみ選択できます。';}
  },{signal:events.signal});
  afterImage.addEventListener('pointermove',event=>{
    if(!pointer||event.pointerId!==pointer.id)return;
    try{pointer.last=point(event.clientX,event.clientY);}catch{pointer.invalid=true;}
  },{signal:events.signal});
  afterImage.addEventListener('pointerup',event=>{
    if(!pointer||event.pointerId!==pointer.id)return;
    const active=pointer;pointer=null;
    try{afterImage.releasePointerCapture?.(event.pointerId);}catch{}
    if(active.invalid)return;
    try{const end=point(event.clientX,event.clientY);
      if(state.tool==='rect'&&Math.hypot(end.u-active.start.u,end.v-active.start.v)>=.005){
        if(state.pending.length)throw Error('MANUAL_EYELASH_UI_PENDING_RECT');
        setPoint(active.start);setPoint(end);
      }else if(state.tool==='curve'&&
          Math.hypot(end.u-active.start.u,end.v-active.start.v)>.02){
        throw Error('MANUAL_EYELASH_UI_DRAG_NOT_CURVE_POINT');
      }else setPoint(end);
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='眼矩形・点を確定できません。対象と位置を確認してください。';render();}
  },{signal:events.signal});
  afterImage.addEventListener('pointercancel',event=>{
    if(pointer?.id===event.pointerId){pointer=null;state.pending=[];
      status.textContent='ポインター操作を取消しました。';render();}
  },{signal:events.signal});
  afterImage.addEventListener('focus',()=>{if(imageClaimed)
    afterImage.style.outline='3px solid #145b84';},{signal:events.signal});
  afterImage.addEventListener('blur',()=>{if(imageClaimed)
    afterImage.style.outline=previous.outline;},{signal:events.signal});
  afterImage.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      pointer=null;state.pending=[];if(inFlight){inFlight.abort();generation++;
        inFlight=null;busy=false;}
      status.textContent='進行中の操作を取消しました。未保存です。';render();return;
    }
    try{fresh();}catch{return;}
    const dx=event.key==='ArrowRight'?.01:event.key==='ArrowLeft'?-.01:0;
    const dy=event.key==='ArrowDown'?.01:event.key==='ArrowUp'?-.01:0;
    if(dx||dy){event.preventDefault();keyboard={u:Math.max(0,Math.min(1,keyboard.u+dx)),
      v:Math.max(0,Math.min(1,keyboard.v+dy))};
      status.textContent=`画像位置 ${Math.round(keyboard.u*100)}%, ${Math.round(keyboard.v*100)}%`;
    }else if(event.key==='Enter'||event.key===' '){
      event.preventDefault();try{const p=mapAfterImagePointToLocalBrushPoint({...geometry(),afterX:keyboard.u,afterY:keyboard.v});setPoint({u:p.x,v:p.y});}
      catch(error){status.dataset.error=String(error?.message??error);
        status.textContent='画像内または眼矩形内で点を指定してください。';}
    }
  },{signal:events.signal});
  undo.addEventListener('click',()=>{try{fresh();if(!history.length)return;
    future.push(clone(state));state=history.pop();status.textContent='下書きを戻しました。未保存です。';
    render();}catch{render();}},{signal:events.signal});
  redo.addEventListener('click',()=>{try{fresh();if(!future.length)return;
    history.push(clone(state));state=future.pop();status.textContent='下書きをやり直しました。未保存です。';
    render();}catch{render();}},{signal:events.signal});
  color.addEventListener('change',()=>{try{const value=toHex(colorFromHex(color.value));
    snapshot(()=>{state.color=value;},'色を変更しました。未保存です。');}
    catch{status.textContent='色は6桁のRGBで指定してください。';render();}
  },{signal:events.signal});
  opacity.addEventListener('change',()=>{try{const value=Number(opacity.value.trim());
    if(!Number.isFinite(value)||opacity.value.trim()===''||value<0||value>100)
      throw Error('MANUAL_EYELASH_UI_OPACITY_INVALID');
    snapshot(()=>{state.opacity=value/100;},'Opacityを変更しました。未保存です。');}
    catch{status.textContent='Opacityは0〜100%で指定してください。';render();}
  },{signal:events.signal});
  radius.addEventListener('change',()=>{try{const value=Number(radius.value.trim());
    if(!Number.isFinite(value)||radius.value.trim()===''||value<.1||value>3)
      throw Error('MANUAL_EYELASH_UI_RADIUS_INVALID');
    snapshot(()=>{state.radius=value/100;},'root半径を変更しました。未保存です。');}
    catch{status.textContent='root半径は0.1〜3%です。';render();}
  },{signal:events.signal});
  submit.addEventListener('click',async()=>{
    if(busy||disposed||typeof onSubmit!=='function')return;
    let candidate;try{candidate=document();}catch(error){
      status.dataset.error=String(error?.message??error);
      status.textContent='下書き・対象・版を確認できずhostへ渡しません。';return;
    }
    busy=true;const token=++generation,abort=new AbortController();inFlight=abort;
    status.textContent='hostへ下書きを依頼中。実保存・Finalは未確認です。';render();
    try{await onSubmit(clone(candidate),{savedRevision:mounted.savedRevision,
      personID:binding.personID,signal:abort.signal});
      if(disposed||token!==generation||abort.signal.aborted)return;
      fresh();status.textContent='hostへ渡しました。実保存・適用・Finalは別途確認してください。';
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
        opacity:state.opacity},side:state.side,tool:state.tool,pending:state.pending});},
    getDocument:document,
    setEnabled(value){enabled=value===true;
      if(!enabled)retire('hostが無効化したため下書きを破棄しました。');render();},
    dispose(){disposed=true;generation++;inFlight?.abort();pointer=null;
      events.abort();resize?.disconnect();overlay.remove();panel.remove();
      release();host.style.position=oldPosition;}});
}
