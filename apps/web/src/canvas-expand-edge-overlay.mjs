import {beginCanvasExpansionEdgeDrag,updateCanvasExpansionEdgeDrag,
  nudgeCanvasExpansionEdge} from './manual-canvas-expand-edge-drag.mjs';
import {projectCanvasExpansion} from './processing/canvas-expand-projection.mjs';

const EDGES=Object.freeze([['left','左'],['right','右'],['top','上'],['bottom','下']]);
const LABELS=Object.fromEntries(EDGES);
const finite=value=>typeof value==='number'&&Number.isFinite(value);

function frameContext(context,image){
  if(context?.ready!==true||context.busy===true||context.view!=='after'||
      !context.preview||!context.full||!context.margins||
      !image.complete||image.naturalWidth<1||image.naturalHeight<1)
    throw Error('CANVAS_EDGE_OVERLAY_UNAVAILABLE');
  const preview={...context.preview,naturalWidth:image.naturalWidth,
    naturalHeight:image.naturalHeight,afterRect:image.getBoundingClientRect()};
  return {...context,preview};
}

function locate(context,image,host){
  const config=frameContext(context,image);
  const {postCropWidth:width,postCropHeight:height}=config.preview;
  if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1)
    throw Error('CANVAS_EDGE_OVERLAY_POST_CROP_INVALID');
  const margins=projectCanvasExpansion({width,height},
    {schemaVersion:1,margins:config.margins}).margins;
  if(width+margins.left+margins.right!==config.preview.naturalWidth||
      height+margins.top+margins.bottom!==config.preview.naturalHeight)
    throw Error('CANVAS_EDGE_OVERLAY_PREVIEW_STALE');
  const rect=config.preview.afterRect;
  const scale=Math.min(rect.width/config.preview.naturalWidth,
    rect.height/config.preview.naturalHeight);
  if(!finite(scale)||scale<=0)throw Error('CANVAS_EDGE_OVERLAY_SCALE_INVALID');
  const left=rect.left+(rect.width-config.preview.naturalWidth*scale)/2+
    margins.left*scale;
  const top=rect.top+(rect.height-config.preview.naturalHeight*scale)/2+
    margins.top*scale;
  const right=left+width*scale,bottom=top+height*scale;
  const centers={left:{x:left,y:(top+bottom)/2},
    right:{x:right,y:(top+bottom)/2},top:{x:(left+right)/2,y:top},
    bottom:{x:(left+right)/2,y:bottom}};
  // The existing pure conversion must independently agree with this visual
  // placement before any handle is shown. A stale Crop/preview stays disabled.
  for(const [edge] of EDGES){
    beginCanvasExpansionEdgeDrag({...config,edge},
      {pointerId:-1,pointerType:'mouse',clientX:centers[edge].x,
        clientY:centers[edge].y});
  }
  const hostRect=host.getBoundingClientRect();
  return {config,centers,hostRect};
}

function shifted(event,anchor,start){
  return {pointerId:event.pointerId,pointerType:event.pointerType,
    clientX:anchor.x+event.clientX-start.x,
    clientY:anchor.y+event.clientY-start.y};
}

/**
 * Independent, reversible After overlay. onCandidate receives a validated
 * margin candidate; it is not proof of authentication, persistence, export or
 * permission. The real Editor host must supply those gates separately.
 *
 * getContext returns the pure conversion config plus ready/busy and exact
 * preview.postCropWidth/postCropHeight. The host is the After image's parent.
 */
export function mountCanvasExpandEdgeOverlay({afterImage,getContext,onCandidate,
  enabled=false}={}){
  if(!(afterImage instanceof HTMLImageElement)||
      typeof getContext!=='function'||
      (onCandidate!==undefined&&typeof onCandidate!=='function'))
    throw Error('CANVAS_EDGE_OVERLAY_MOUNT_INVALID');
  const host=afterImage.parentElement;
  if(!(host instanceof HTMLElement))throw Error('CANVAS_EDGE_OVERLAY_HOST_INVALID');
  const doc=afterImage.ownerDocument;
  const overlay=doc.createElement('div');
  overlay.className='canvas-expand-edge-overlay';
  overlay.setAttribute('aria-label','手動キャンバス拡張の四辺ハンドル');
  const buttons=Object.fromEntries(EDGES.map(([edge,label])=>{
    const button=doc.createElement('button');
    button.type='button';button.className='canvas-expand-edge-handle';
    button.dataset.canvasEdge=edge;
    button.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight ArrowUp ArrowDown Home End Escape');
    button.setAttribute('aria-label',`${label}の余白を調整`);
    button.textContent=edge==='left'||edge==='right'?'↔':'↕';
    overlay.append(button);
    return [edge,button];
  }));
  const status=doc.createElement('p');
  status.className='canvas-expand-edge-status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  status.textContent='四辺ハンドルは下書き操作です。保存・書出しは未確認です。';
  overlay.append(status);
  const initialPosition=host.style.position;
  if(getComputedStyle(host).position==='static')host.style.position='relative';
  host.append(overlay);
  const lifetime=new AbortController();
  let isEnabled=enabled,disposed=false,active=null,pending=null,
    located=null,generation=0;

  function setStatus(message){status.textContent=message;}
  function invalidate(message){
    located=null;
    for(const button of Object.values(buttons))button.disabled=true;
    if(message)setStatus(message);
  }
  function render({keepStatus=false}={}){
    if(disposed)return;
    if(active||pending)return;
    if(!isEnabled||typeof onCandidate!=='function'){
      invalidate('操作先が未接続です。保存・適用はできません。');return;
    }
    try{
      const next=locate(getContext(),afterImage,host);
      located=next;
      for(const [edge,button] of Object.entries(buttons)){
        const center=next.centers[edge];
        button.style.left=`${center.x-next.hostRect.left}px`;
        button.style.top=`${center.y-next.hostRect.top}px`;
        button.disabled=false;
        button.setAttribute('aria-label',`${LABELS[edge]}の余白 ${Math.round(
          next.config.margins[edge]*100)}%、ドラッグまたは矢印キーで調整`);
      }
      if(!keepStatus)setStatus('四辺の余白を調整できます。変更候補はまだ保存されていません。');
    }catch{
      invalidate('After写真・寸法・操作状態を確認できません。変更はできません。');
    }
  }
  function cancel(message='変更候補を取り消しました。表示を元に戻しました。'){
    generation++;
    if(pending){pending.controller.abort();pending=null;}
    if(active){
      try{active.button.releasePointerCapture(active.pointerId);}catch{}
      active=null;
    }
    render({keepStatus:true});
    setStatus(message);
  }
  async function submit(candidate,edge){
    if(disposed||!located||typeof onCandidate!=='function'||!candidate.changed)return;
    const controller=new AbortController(),serial=++generation;
    pending={controller,serial};
    // Keep the initiating handle focusable so Escape can cancel a pending
    // request. The pending guard prevents a second edit from starting.
    for(const [name,button] of Object.entries(buttons))button.disabled=name!==edge;
    setStatus(`${LABELS[edge]}の余白 ${candidate.marginPercent}% をホストへ渡しています。保存・書出しは未確認です。`);
    try{
      await onCandidate(structuredClone(candidate),{signal:controller.signal});
      if(disposed||serial!==generation||controller.signal.aborted)return;
      pending=null;
      render({keepStatus:true});
      setStatus('変更候補をホストへ渡しました。保存・再読込・Finalは未確認です。');
    }catch{
      if(disposed||serial!==generation)return;
      pending=null;
      render({keepStatus:true});
      setStatus('ホストが変更を受け付けませんでした。表示を元に戻しました。');
    }
  }
  function start(event,edge){
    if(disposed||!located||active||pending||buttons[edge].disabled||event.button!==0)return;
    const anchor=located.centers[edge];
    try{
      const gesture=beginCanvasExpansionEdgeDrag({...located.config,edge},
        shifted(event,anchor,{x:event.clientX,y:event.clientY}));
      active={gesture,edge,button:buttons[edge],pointerId:event.pointerId,
        pointerType:event.pointerType,start:{x:event.clientX,y:event.clientY},anchor,
        config:located.config};
      try{buttons[edge].setPointerCapture?.(event.pointerId);}catch{}
      event.preventDefault();
    }catch{setStatus('写真またはハンドル位置が変わりました。操作をやり直してください。');render({keepStatus:true});}
  }
  function candidate(event){
    const current=active;
    if(!current||current.pointerId!==event.pointerId||
        current.pointerType!==event.pointerType)return null;
    return updateCanvasExpansionEdgeDrag(current.gesture,
      shifted(event,current.anchor,current.start),{
        afterRect:afterImage.getBoundingClientRect(),
        selectionKey:getContext()?.selectionKey});
  }
  function moving(event){
    if(!active)return;
    try{
      const value=candidate(event);
      if(value?.changed)setStatus(`${LABELS[active.edge]}の余白候補 ${value.marginPercent}% · 未保存`);
    }catch{cancel('写真・選択・レイアウトが変わりました。変更候補を取り消しました。');}
  }
  function ending(event){
    if(!active)return;
    const current=active;
    try{
      const value=candidate(event);
      active=null;
      try{current.button.releasePointerCapture(event.pointerId);}catch{}
      if(value?.changed)void submit(value,current.edge);
      else{render({keepStatus:true});setStatus('クリックのみのため余白は変更していません。');}
    }catch{cancel('写真・選択・レイアウトが変わりました。変更候補を取り消しました。');}
  }
  function keydown(event,edge){
    if(event.key==='Escape'){
      if(active||pending){event.preventDefault();cancel('操作を中止しました。ホスト処理の状態は再読込で確認してください。');}
      return;
    }
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)||
        !located||active||pending||buttons[edge].disabled)return;
    event.preventDefault();
    try{
      const value=nudgeCanvasExpansionEdge({...located.config,edge},
        {key:event.key,shiftKey:event.shiftKey});
      if(value.changed)void submit(value,edge);
    }catch{render({keepStatus:true});setStatus('写真の寸法または余白上限により変更できません。');}
  }
  for(const [edge,button] of Object.entries(buttons)){
    button.addEventListener('pointerdown',event=>start(event,edge),{signal:lifetime.signal});
    button.addEventListener('pointermove',moving,{signal:lifetime.signal});
    button.addEventListener('pointerup',ending,{signal:lifetime.signal});
    button.addEventListener('pointercancel',()=>cancel(),{signal:lifetime.signal});
    button.addEventListener('lostpointercapture',()=>{if(active)cancel();},{signal:lifetime.signal});
    button.addEventListener('keydown',event=>keydown(event,edge),{signal:lifetime.signal});
  }
  afterImage.addEventListener('load',()=>render(),{signal:lifetime.signal});
  doc.defaultView?.addEventListener('resize',()=>render({keepStatus:true}),
    {signal:lifetime.signal});
  doc.defaultView?.addEventListener('scroll',()=>render({keepStatus:true}),
    {capture:true,passive:true,signal:lifetime.signal});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>render({keepStatus:true})):null;
  resize?.observe(afterImage);resize?.observe(host);
  render();
  return Object.freeze({
    refresh:()=>render(),
    setEnabled:value=>{if(typeof value!=='boolean')throw Error('CANVAS_EDGE_OVERLAY_ENABLED_INVALID');
      isEnabled=value;if(!value)cancel('操作を無効にしました。');else render();},
    cancel:()=>cancel(),
    dispose:()=>{
      if(disposed)return;
      cancel();disposed=true;lifetime.abort();resize?.disconnect();overlay.remove();
      host.style.position=initialPosition;
    },
  });
}
