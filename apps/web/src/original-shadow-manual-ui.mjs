import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {validateOriginalShadowManualDocument} from './original-shadow-manual-recipe.mjs';
import {MAX_SOURCE_PIXELS} from './processing/pure.mjs';

// This is an owner-drawn draft surface, not authentication, AI extraction,
// a Recipe writer, a renderer, or proof of Final output.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const MAX_STROKES=64,MAX_POINTS=4096;
const STYLE=`.suite-original-shadow-manual{box-sizing:border-box;max-width:100%;min-width:0;padding:1rem;border:1px solid #cecac2;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}
.suite-original-shadow-manual *{box-sizing:border-box}.suite-original-shadow-manual h3{font:normal clamp(1.3rem,3vw,1.8rem)/1.25 Georgia,serif;margin:0 0 .4rem}
.suite-original-shadow-manual p{margin:.4rem 0 .8rem}.suite-original-shadow-manual__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;min-width:0}
.suite-original-shadow-manual label{display:grid;gap:.2rem;min-width:0}.suite-original-shadow-manual input,.suite-original-shadow-manual select{width:100%;max-width:100%;min-width:0;min-height:44px;padding:.4rem;border:1px solid #77736b;border-radius:0;background:#fff;color:#242321;font:inherit}
.suite-original-shadow-manual__actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:.8rem 0}.suite-original-shadow-manual button{min-height:44px;min-width:44px;padding:.5rem .8rem;border:1px solid #494640;border-radius:0;background:#fff;color:#242321;font:inherit;cursor:pointer}
.suite-original-shadow-manual button:disabled{cursor:not-allowed;opacity:.5}.suite-original-shadow-manual :focus-visible{outline:3px solid #145b84;outline-offset:2px}
.suite-original-shadow-manual__status{min-height:2.5em;overflow-wrap:anywhere}.suite-original-shadow-manual__scope{overflow-wrap:anywhere;font-size:.8rem;color:#4c4843}
@media(max-width:600px){.suite-original-shadow-manual{padding:.7rem}.suite-original-shadow-manual__grid{grid-template-columns:minmax(0,1fr)}.suite-original-shadow-manual__actions>*{flex:1 1 8rem}}
@media(prefers-reduced-motion:reduce){.suite-original-shadow-manual *, .suite-original-shadow-manual *::before, .suite-original-shadow-manual *::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;
const clone=value=>structuredClone(value);
const element=(doc,tag,text='')=>{const node=doc.createElement(tag);node.textContent=text;return node;};
const labelled=(doc,text,input)=>{const label=element(doc,'label',text);label.append(input);return label;};
function integer(input,min,max){
  const raw=input.value.trim();
  if(!/^\d+$/u.test(raw))throw Error('ORIGINAL_SHADOW_UI_NUMBER_INVALID');
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw Error('ORIGINAL_SHADOW_UI_NUMBER_INVALID');
  return value;
}
function bindingFromContext(context){
  const target=context?.target,backdrop=context?.backdrop;
  const binding={assetID:target?.id,originalSHA256:target?.sha256,
    sourceWidth:target?.sourceWidth,sourceHeight:target?.sourceHeight,
    backdropID:backdrop?.id,backdropSHA256:backdrop?.sha256};
  if(!UUID.test(binding.assetID)||!SHA.test(binding.originalSHA256)||
      !UUID.test(binding.backdropID)||!SHA.test(binding.backdropSHA256)||
      binding.assetID.toLowerCase()===binding.backdropID.toLowerCase()||
      !Number.isSafeInteger(binding.sourceWidth)||binding.sourceWidth<1||
      !Number.isSafeInteger(binding.sourceHeight)||binding.sourceHeight<1||
      binding.sourceWidth*binding.sourceHeight>MAX_SOURCE_PIXELS||
      !Number.isSafeInteger(target.savedRevision)||target.savedRevision<1)
    throw Error('ORIGINAL_SHADOW_UI_BINDING_MISSING');
  return {binding,savedRevision:target.savedRevision};
}
const bindingKey=({binding,savedRevision})=>[...Object.values(binding),savedRevision].join(':');
const sameBinding=(left,right)=>Object.keys(left).every(key=>left[key]===right[key]);
const pointCount=state=>[...state.subjectStrokes,...state.shadowStrokes]
  .reduce((sum,stroke)=>sum+stroke.path.length,0);
const strokeCount=state=>state.subjectStrokes.length+state.shadowStrokes.length;
const readyLayers=state=>state.subjectStrokes.some(stroke=>stroke.operation==='ADD')&&
  state.shadowStrokes.some(stroke=>stroke.operation==='ADD');

/** Typed photo-local document only. Fresh authenticated Asset/Recipe authority
 * and CAS must be established by the host, not this shape validator. */
export function makeOriginalShadowManualDocument(binding,subjectStrokes,
  shadowStrokes,{opacity}={}){
  return validateOriginalShadowManualDocument({schemaVersion:1,
    engineVersion:'suite-srgb8-explicit-original-shadow-1',
    source:'owner-manual-input-unverified',binding,
    subjectStrokes,shadowStrokes,
    settings:{opacity}},binding);
}

/** Independent After brush; onApply must be a real authenticated host callback
 * that rechecks live Asset/Original/Recipe permission, version and save CAS.
 * A UI `ready` flag or callback response is not authentication or Final proof. */
export function mountOriginalShadowManualUI({root,afterImage,getContext,onApply,
  initial,enabled=false}={}){
  if(!(root instanceof HTMLElement)||!(afterImage instanceof HTMLImageElement)||
      root.ownerDocument!==afterImage.ownerDocument||!afterImage.parentElement||
      typeof getContext!=='function'||
      (onApply!==undefined&&typeof onApply!=='function'))
    throw Error('ORIGINAL_SHADOW_UI_MOUNT_INVALID');
  const doc=root.ownerDocument,host=afterImage.parentElement;
  let saved=initial===undefined?null:
    validateOriginalShadowManualDocument(initial,initial?.binding);
  let base={subjectStrokes:clone(saved?.subjectStrokes??[]),
    shadowStrokes:clone(saved?.shadowStrokes??[]),opacity:saved?.settings.opacity??100};
  let state=clone(base),history=[clone(base)],cursor=0,layer='subject',operation='ADD';
  let drawing=null,keyboard={x:.5,y:.5},busy=false,disposed=false,generation=0;
  let pending=null,lockedKey=null,ownsImage=false,savedImage=null;
  const events=new AbortController();
  const panel=element(doc,'section');panel.className='suite-original-shadow-manual';
  panel.setAttribute('aria-label','Original Shadow 手動範囲');
  panel.append(element(doc,'style',STYLE));
  panel.append(element(doc,'h3','Original Shadow · 手動範囲'));
  panel.append(element(doc,'p',
    'After写真で被写体と元の影を別々に指定します。自動抽出・保存・Finalの完了表示ではありません。'));
  const scope=element(doc,'p','対象・背景・保存版の確認待ちです。');
  scope.className='suite-original-shadow-manual__scope';panel.append(scope);
  const layerSelect=element(doc,'select');layerSelect.setAttribute('aria-label','範囲の層');
  for(const [value,name] of [['subject','被写体'],['shadow','元の影']]){
    const option=element(doc,'option',name);option.value=value;layerSelect.append(option);
  }
  layerSelect.value='subject';
  const radius=element(doc,'input');radius.type='number';radius.min='1';
  radius.max='25';radius.step='1';radius.value='4';radius.setAttribute('aria-label','ブラシ半径 %');
  const hardness=element(doc,'input');hardness.type='number';hardness.min='0';
  hardness.max='100';hardness.step='1';hardness.value='70';
  hardness.setAttribute('aria-label','ブラシ硬さ %');
  const opacity=element(doc,'input');opacity.type='number';opacity.min='0';
  opacity.max='100';opacity.step='1';opacity.value=String(state.opacity);
  opacity.setAttribute('aria-label','影の不透明度 %');
  const grid=element(doc,'div');grid.className='suite-original-shadow-manual__grid';
  grid.append(labelled(doc,'範囲の層',layerSelect),labelled(doc,'ブラシ半径',radius),
    labelled(doc,'ブラシ硬さ',hardness),labelled(doc,'影の不透明度',opacity));
  panel.append(grid);
  const actions=element(doc,'div');actions.className='suite-original-shadow-manual__actions';
  const button=(label,action)=>{const node=element(doc,'button',label);
    node.type='button';node.dataset.originalShadowAction=action;return node;};
  const add=button('範囲を追加','add'),erase=button('範囲を消去','erase');
  const undo=button('戻す','undo'),redo=button('やり直す','redo');
  const submit=button('認証済みhostへ保存・適用を依頼','submit');
  const cancel=button('下書きを取消','cancel');
  actions.append(add,erase,undo,redo,submit,cancel);panel.append(actions);
  const status=element(doc,'p','下書きのみ。保存・適用・Finalは未確認です。');
  status.className='suite-original-shadow-manual__status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  panel.append(status);root.append(panel);
  const overlay=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.setAttribute('aria-hidden','true');overlay.style.position='absolute';
  overlay.style.pointerEvents='none';overlay.style.overflow='visible';
  const originalHostPosition=host.style.position;
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
      'After写真のOriginal Shadow手動ブラシ。矢印キーで移動、Enterで描画、Escapeで取消');
    afterImage.setAttribute('aria-keyshortcuts',
      'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape Control+Z Control+Y');
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
      throw Error('ORIGINAL_SHADOW_UI_AFTER_NOT_READY');
    const context=getContext(),selection=bindingFromContext(context);
    if(context?.ready!==true||context.dirty!==false||context.busy===true||
        context.permissionExpired===true||context.view!=='after')
      throw Error('ORIGINAL_SHADOW_UI_CONTEXT_NOT_READY');
    if(saved&&!sameBinding(saved.binding,selection.binding))
      throw Error('ORIGINAL_SHADOW_UI_INITIAL_BINDING_MISMATCH');
    const key=bindingKey(selection);
    if(lockedKey&&key!==lockedKey)
      throw Error('ORIGINAL_SHADOW_UI_STALE_ASSET_BACKDROP_OR_REVISION');
    if(!lockedKey)lockedKey=key;
    return {context,...selection};
  }
  function geometry(){
    if(busy)throw Error('ORIGINAL_SHADOW_UI_BUSY');
    const {context,binding}=freshContext();
    if(context.expectedAfterURL&&afterImage.getAttribute('src')!==context.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {...context,afterRect:afterImage.getBoundingClientRect(),
      uprightWidth:context.uprightWidth??binding.sourceWidth,uprightHeight:context.uprightHeight??binding.sourceHeight,
      naturalWidth:afterImage.naturalWidth,naturalHeight:afterImage.naturalHeight};
  }
  function createDocument(){
    const {binding}=freshContext();
    return makeOriginalShadowManualDocument(binding,state.subjectStrokes,
      state.shadowStrokes,{opacity:state.opacity});
  }
  function render(){
    let ready=false,selection;
    try{selection=freshContext();geometry();ready=true;}catch{}
    if(ready){
      claimImage();scope.textContent=`対象 Asset ${selection.binding.assetID} / 背景 ${selection.binding.backdropID} / Recipe版 ${selection.savedRevision}`;
    }else{
      releaseImage();scope.textContent='対象・背景・保存版の確認待ち、または写真・権限が変わりました。';
    }
    for(const control of [layerSelect,radius,hardness,opacity,add,erase])
      control.disabled=!ready||busy;
    undo.disabled=!ready||busy||cursor===0;
    redo.disabled=!ready||busy||cursor===history.length-1;
    submit.disabled=!ready||busy||typeof onApply!=='function'||!readyLayers(state)||
      opacity.value.trim()===''||!/^\d+$/u.test(opacity.value.trim())||
      Number(opacity.value)<0||Number(opacity.value)>100;
    cancel.disabled=disposed||(!busy&&!drawing&&JSON.stringify(state)===JSON.stringify(base));
    add.setAttribute('aria-pressed',String(operation==='ADD'));
    erase.setAttribute('aria-pressed',String(operation==='ERASE'));
    overlay.replaceChildren();
    if(!ready)return;
    try{
      const g=geometry(),box=afterImage.getBoundingClientRect(),
        parent=host.getBoundingClientRect();
      overlay.style.left=`${box.left-parent.left}px`;
      overlay.style.top=`${box.top-parent.top}px`;
      overlay.style.width=`${box.width}px`;overlay.style.height=`${box.height}px`;
      overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
      for(const [role,strokes] of [['subject',state.subjectStrokes],['shadow',state.shadowStrokes]])appendProjectedBrushOverlay(overlay,g,strokes,{color:role==='subject'?[27,107,143]:[162,101,46]});
    }catch{overlay.replaceChildren();}
  }
  function commit(next,notice){
    if(busy||disposed)throw Error('ORIGINAL_SHADOW_UI_BUSY');
    if(strokeCount(next)>MAX_STROKES||pointCount(next)>MAX_POINTS)
      throw Error('ORIGINAL_SHADOW_UI_CAPACITY');
    state=clone(next);history=history.slice(0,cursor+1);
    history.push(clone(state));cursor++;
    opacity.value=String(state.opacity);
    status.textContent=notice;render();
  }
  function travel(nextCursor){
    if(busy||nextCursor<0||nextCursor>=history.length)return;
    state=clone(history[nextCursor]);cursor=nextCursor;
    opacity.value=String(state.opacity);
    status.textContent='下書きの履歴を変更しました。未保存です。';render();
  }
  function addStroke(path){
    freshContext();
    const stroke={operation,path,radiusFraction:integer(radius,1,25)/100,
      hardness:integer(hardness,0,100)/100};
    if(path.length<1||path.length>MAX_POINTS)
      throw Error('ORIGINAL_SHADOW_UI_STROKE_INVALID');
    const next=clone(state);
    next[layer==='subject'?'subjectStrokes':'shadowStrokes'].push(stroke);
    commit(next,`${layer==='subject'?'被写体':'元の影'}の${operation==='ADD'?'追加':'消去'}を下書きしました。未保存です。`);
  }
  function point(event){
    const mapped=mapAfterToLocalBrushPoint({...geometry(),
      clientX:event.clientX,clientY:event.clientY});
    return {u:mapped.x,v:mapped.y};
  }
  function clearDrawing(){
    if(!drawing)return;
    const id=drawing.id;drawing=null;
    try{if(afterImage.hasPointerCapture?.(id))
      afterImage.releasePointerCapture(id);}catch{}
  }
  function stop(event,cancelled){
    if(!drawing||event.pointerId!==drawing.id)return;
    const current=drawing;clearDrawing();
    if(cancelled||current.invalid){status.textContent='strokeを取消しました。';render();return;}
    try{const last=point(event);
      if(current.path.at(-1)?.u!==last.u||current.path.at(-1)?.v!==last.v)
        current.path.push(last);
      addStroke(current.path);
    }catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='After実画像外または古い版では確定しません。';render();}
  }
  afterImage.addEventListener('pointerdown',event=>{
    if(drawing||event.isPrimary===false||
        (event.pointerType!=='touch'&&event.button!==0))return;
    try{const start=point(event);drawing={id:event.pointerId,path:[start],invalid:false};
      try{afterImage.setPointerCapture?.(event.pointerId);}catch{}
      event.preventDefault();render();}
    catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='After実画像上だけ描画できます。';}
  },{signal:events.signal});
  afterImage.addEventListener('pointermove',event=>{
    if(!drawing||event.pointerId!==drawing.id)return;
    try{const next=point(event);
      if(drawing.path.length>=MAX_POINTS){drawing.invalid=true;return;}
      if(Math.abs(next.u-drawing.path.at(-1).u)+
          Math.abs(next.v-drawing.path.at(-1).v)>.0001)drawing.path.push(next);
    }catch{drawing.invalid=true;}
  },{signal:events.signal});
  afterImage.addEventListener('pointerup',event=>stop(event,false),{signal:events.signal});
  afterImage.addEventListener('pointercancel',event=>stop(event,true),{signal:events.signal});
  afterImage.addEventListener('focus',()=>{if(ownsImage)
    afterImage.style.outline='3px solid #145b84';},{signal:events.signal});
  afterImage.addEventListener('blur',()=>{if(ownsImage)
    afterImage.style.outline=savedImage.outline;},{signal:events.signal});
  afterImage.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      clearDrawing();if(pending){pending.abort();generation++;pending=null;busy=false;}
      status.textContent='進行中の操作を取消しました。保存結果はhostで再確認してください。';
      render();return;
    }
    if(event.ctrlKey&&event.key.toLowerCase()==='z'){
      event.preventDefault();travel(cursor-1);return;
    }
    if(event.ctrlKey&&event.key.toLowerCase()==='y'){
      event.preventDefault();travel(cursor+1);return;
    }
    try{geometry();}catch{return;}
    const dx=event.key==='ArrowRight'?.01:event.key==='ArrowLeft'?-.01:0;
    const dy=event.key==='ArrowDown'?.01:event.key==='ArrowUp'?-.01:0;
    if(dx||dy){
      event.preventDefault();
      const candidate={x:Math.max(0,Math.min(1,keyboard.x+dx)),
        y:Math.max(0,Math.min(1,keyboard.y+dy))};
      try{mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX:candidate.x,afterY:candidate.y});keyboard=candidate;
        status.textContent=`位置 ${Math.round(keyboard.x*100)}%, ${Math.round(keyboard.y*100)}%`;}
      catch{status.textContent='余白・Crop外には移動できません。';}
    }else if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      try{const mapped=mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX:keyboard.x,afterY:keyboard.y});
        addStroke([{u:mapped.x,v:mapped.y}]);}
      catch(error){status.dataset.error=String(error?.message??error);
        status.textContent='After実画像上だけ描画できます。';}
    }
  },{signal:events.signal});
  layerSelect.addEventListener('change',()=>{layer=layerSelect.value;render();},
    {signal:events.signal});
  add.addEventListener('click',()=>{operation='ADD';render();},{signal:events.signal});
  erase.addEventListener('click',()=>{operation='ERASE';render();},{signal:events.signal});
  undo.addEventListener('click',()=>travel(cursor-1),{signal:events.signal});
  redo.addEventListener('click',()=>travel(cursor+1),{signal:events.signal});
  opacity.addEventListener('change',()=>{
    try{freshContext();const value=integer(opacity,0,100);
      if(value!==state.opacity)commit({...clone(state),opacity:value},
        '影の不透明度を下書きしました。未保存です。');
      else render();}
    catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='不透明度は0〜100の整数で指定してください。';render();}
  },{signal:events.signal});
  submit.addEventListener('click',()=>{
    if(submit.disabled||busy||typeof onApply!=='function')return;
    let value,selection;
    try{selection=freshContext();value=createDocument();}
    catch(error){status.dataset.error=String(error?.message??error);
      status.textContent='対象・背景・版または二層下書きを再確認してください。';render();return;}
    const controller=new AbortController(),token=++generation;
    pending=controller;busy=true;
    status.textContent='認証済みhostへ確認を依頼中です。保存・適用は未確認です。';render();
    const options=Object.freeze({target:Object.freeze({id:selection.binding.assetID,
      sha256:selection.binding.originalSHA256,
      sourceWidth:selection.binding.sourceWidth,
      sourceHeight:selection.binding.sourceHeight}),
      backdrop:Object.freeze({id:selection.binding.backdropID,
        sha256:selection.binding.backdropSHA256}),
      expectedRevision:selection.savedRevision,signal:controller.signal});
    Promise.resolve().then(()=>onApply(clone(value),options)).then(response=>{
      if(disposed||token!==generation||controller.signal.aborted)return;
      try{freshContext();}
      catch{
        status.textContent='写真・背景・保存版が変わりました。hostで結果を再確認してください。';
        return;
      }
      if(response?.accepted!==true)
        throw Error('ORIGINAL_SHADOW_UI_HOST_NOT_ACCEPTED');
      // Even a positive host response is not evidence that Final or cloud
      // processing completed; a changed Recipe revision now disables this UI.
      status.textContent='hostが依頼を受け付けました。保存・Finalはhostで再確認してください。';
    }).catch(error=>{
      if(disposed||token!==generation||controller.signal.aborted)return;
      status.dataset.error=String(error?.message??error);
      status.textContent='hostの保存結果を確認できません。写真とRecipeを再読み込みして確認してください。';
    }).finally(()=>{
      if(disposed||token!==generation)return;
      pending=null;busy=false;render();
    });
  },{signal:events.signal});
  cancel.addEventListener('click',()=>{
    if(pending){pending.abort();generation++;pending=null;busy=false;}
    clearDrawing();state=clone(base);history=[clone(base)];cursor=0;
    opacity.value=String(state.opacity);
    status.textContent='下書きを取消しました。進行中のhost処理は結果を再確認してください。';render();
  },{signal:events.signal});
  const resize=new ResizeObserver(render);resize.observe(afterImage);
  render();
  return Object.freeze({getDraft:()=>clone(state),getDocument:createDocument,
    refresh:render,
    setEnabled(value){enabled=value===true;
      if(!enabled){clearDrawing();if(pending)pending.abort();generation++;
        pending=null;busy=false;}render();},
    reset(value){
      if(pending)pending.abort();generation++;pending=null;busy=false;clearDrawing();
      const next=value===undefined?null:
        validateOriginalShadowManualDocument(value,value?.binding);
      const current=bindingFromContext(getContext());
      if(next&&!sameBinding(next.binding,current.binding))
        throw Error('ORIGINAL_SHADOW_UI_INITIAL_BINDING_MISMATCH');
      lockedKey=bindingKey(current);
      const replacement={subjectStrokes:clone(next?.subjectStrokes??[]),
        shadowStrokes:clone(next?.shadowStrokes??[]),
        opacity:next?.settings.opacity??100};
      saved=next;base=clone(replacement);
      state=clone(replacement);history=[clone(state)];cursor=0;
      opacity.value=String(state.opacity);
      status.textContent='下書きを現在の写真へ読み込みました。保存・Finalは未確認です。';
      render();
    },
    dispose(){disposed=true;clearDrawing();if(pending)pending.abort();generation++;
      events.abort();resize.disconnect();overlay.remove();panel.remove();
      releaseImage();host.style.position=originalHostPosition;}});
}
