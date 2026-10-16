import {summarizeSavedVersionAdjustments} from './saved-version-adjustment-summary.mjs';

/** Independent saved-version Proxy comparison; never replaces Editor After. */
export function mountWebConnectedVersionComparison(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('VERSION_COMPARISON_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','保存済み編集版の画像比較');root.hidden=true;
  root.append(el('h3','保存済み編集版の画像比較'),el('p','比較用の縮小画像を表示します。通常調整はキャッシュ済みProxyを使い、白黒縁・影は権限を確認して保存済み原本・背景を取得します。現在のRecipe・After画像・原本は変更しません。Final品質や原寸比較ではありません。左右の寸法・縦横比が異なる場合も、引き伸ばさず表示します。'));
  const images=el('div');images.style.display='flex';images.style.flexWrap='wrap';images.style.gap='1rem';
  const panels={};for(const side of ['left','right']){const figure=el('figure');figure.style.flex='1 1 18rem';figure.style.minWidth='0';figure.style.margin='0';const caption=el('figcaption'),canvas=el('canvas');canvas.style.maxWidth='100%';canvas.style.height='auto';canvas.style.display='block';canvas.setAttribute('aria-label',side==='left'?'左の保存済み編集版':'右の保存済み編集版');figure.append(caption,canvas);images.append(figure);panels[side]={caption,canvas};}
  const cancel=el('button','比較を取消・閉じる');cancel.type='button';const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(images,cancel,status);container.append(root);
  let current=null,signature=null,disposed=false,generation=0,controller=null;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true;}catch{return false;}}
  function clear(){generation++;controller?.abort();controller=null;for(const {caption,canvas} of Object.values(panels)){caption.textContent='';canvas.width=0;canvas.height=0;}status.textContent='';root.hidden=true;root.setAttribute('aria-busy','false');}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null,value?.beforeURL??null,value?.afterURL??null,value?.localSavedMakeupConsentEpoch??0,value?.localSavedShadowConsentEpoch??0]);if(next!==signature||!permitted()){signature=next;clear();}}
  function descriptor(side){const entry=side?.entry;if(side?.assetId!==current?.asset?.id||!Number.isSafeInteger(entry?.recipeVersion)||entry.recipeVersion<1||typeof entry.bodySHA256!=='string'||!/^[a-f0-9]{64}$/.test(entry.bodySHA256))throw Error('VERSION_COMPARISON_REFERENCE');return {assetId:side.assetId,revision:entry.recipeVersion,bodySHA256:entry.bodySHA256};}
  function checkedFrame(frame){if(!frame||!Number.isSafeInteger(frame.width)||!Number.isSafeInteger(frame.height)||frame.width<1||frame.height<1||frame.width*frame.height>24000000||!(frame.data instanceof Uint8ClampedArray||frame.data instanceof Uint8Array)||frame.data.length!==frame.width*frame.height*4)throw Error('VERSION_COMPARISON_PIXELS');return frame;}
  async function show(result){
    clear();if(disposed)throw Error('VERSION_COMPARISON_DISPOSED');
    // Re-read permission even if the host has not emitted a new session state.
    current=session.state??current;
    if(!permitted()||typeof session.renderSavedRecipeComparison!=='function')throw Error('VERSION_COMPARISON_UNAVAILABLE');
    const left=descriptor(result?.left),right=descriptor(result?.right),external=result?.signal;
    if(external!==undefined&&(!external||typeof external.aborted!=='boolean'||typeof external.addEventListener!=='function'||typeof external.removeEventListener!=='function'))throw Error('VERSION_COMPARISON_SIGNAL');
    const token=generation,own=new (document.defaultView?.AbortController??globalThis.AbortController)();controller=own;
    const stop=()=>{if(controller===own)clear();else own.abort();};external?.addEventListener('abort',stop,{once:true});
    root.hidden=false;root.setAttribute('aria-busy','true');status.textContent='保存済み版を再確認し、Proxyを描画しています…';
    try{
      if(external?.aborted){stop();throw new DOMException('Cancelled','AbortError');}
      const rendered=await session.renderSavedRecipeComparison({left,right,signal:own.signal});
      if(disposed||token!==generation||own.signal.aborted||!permitted())throw new DOMException('Cancelled','AbortError');
      // Validate both before presenting either side as a successful comparison.
      const frames={left:checkedFrame(rendered?.left),right:checkedFrame(rendered?.right)};
      for(const side of ['left','right']){const {width,height,data}=frames[side],panel=panels[side];panel.canvas.width=width;panel.canvas.height=height;const context=panel.canvas.getContext('2d',{colorSpace:'srgb'});if(!context)throw Error('VERSION_COMPARISON_CANVAS');const pixels=context.createImageData(width,height);pixels.data.set(data);context.putImageData(pixels,0,0);
        const summary=summarizeSavedVersionAdjustments(result[side].recipe?.body);
        panel.caption.textContent=`${side==='left'?'左':'右'}：${String(result[side].entry.name??'名前付き版')} · v${result[side].entry.recipeVersion} ／ ${width} × ${height}px${summary.length?' ／ 保存設定：'+summary.join('・'):''}`;}
      status.textContent='保存済み版のProxy比較です。現在の編集には適用していません。';root.setAttribute('aria-busy','false');
    }catch(error){if(!disposed&&token===generation){clear();if(error?.name!=='AbortError'){root.hidden=false;status.textContent='比較できませんでした。権限・保存済み版・Proxyまたは必要な原本と背景・対応する寸法や補正を確認してください。';}}throw error;}
    finally{external?.removeEventListener('abort',stop);if(controller===own)controller=null;}
  }
  cancel.addEventListener('click',clear);
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({show,clear,dispose(){if(disposed)return;disposed=true;clear();if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
