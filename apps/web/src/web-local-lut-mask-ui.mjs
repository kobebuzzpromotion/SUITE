import {validateLocalLUTMask} from './processing/local-lut-mask.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';

const empty=()=>({schemaVersion:1,engineVersion:'suite-local-lut-mask-1',brushVersion:'suite-normalized-coverage-brush-1',strokes:[],invert:false});
const copy=value=>structuredClone(value);

/** Local LUT coverage, authored on the unedited Proxy, never on a warped After. */
export function mountWebLocalLUTMask(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('LOCAL_LUT_MASK_PANEL_CONFIG');
  const el=(tag,text)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;return result;};
  const root=el('section');root.append(el('h3','ローカルLUTの適用範囲'),el('p','未編集の原Proxy上で、LUTを適用する範囲を塗ります。青い領域が適用範囲です。現在のローカルLUTと強度は変更しません。原本・LUTファイルは変更しません。'));
  const fields=el('fieldset'),mode=el('select'),modeLabel=el('label','ブラシ ');
  for(const [value,label] of [['add','適用範囲を追加'],['erase','適用範囲を消す']]){const option=el('option',label);option.value=value;mode.append(option);}modeLabel.append(mode);fields.append(modeLabel);
  function numeric(label,min,max,step,value){const wrap=el('label',label),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);wrap.append(input);fields.append(wrap);return input;}
  const radius=numeric('半径（画像短辺の比率）',.001,.5,.001,.05),hardness=numeric('硬さ',0,1,.05,.5),x=numeric('数値位置 X（左上0 / 右下1）',0,1,.01,.5),y=numeric('数値位置 Y',0,1,.01,.5);
  const invert=el('input');invert.type='checkbox';const invertLabel=el('label','適用範囲を反転');invertLabel.prepend(invert);fields.append(invertLabel);
  const buttons={};for(const [key,label] of [['dab','数値位置に1点塗る'],['undo','最後の下書き変更を取り消す'],['reset','下書きを保存済み状態へ戻す'],['empty','ブラシを空にする（下書き）'],['apply','この範囲を適用'],['clear','マスクを解除して全域LUTへ戻す']]){const button=el('button',label);button.type='button';buttons[key]=button;fields.append(button);}
  const count=el('p'),status=el('p'),canvas=el('canvas');status.setAttribute('role','status');status.setAttribute('aria-live','polite');canvas.style.maxWidth='100%';canvas.style.height='auto';canvas.style.touchAction='none';canvas.setAttribute('aria-label','LUT範囲を塗る未編集Proxy');
  root.append(fields,count,el('p','最大64本・合計4096点。空のブラシ＋反転なしはLUT効果なし、空＋反転ありは全域適用です。マスクの解除も全域LUTへ戻ります。下書きは明示適用するまでAfterやRecipeに反映しません。この範囲は写真固有のため、範囲を含むRecipeの可搬Preset書出しは拒否されます。'),canvas,status);container.append(root);
  let state=null,signature=null,proxy=null,draft=empty(),saved=empty(),history=[],dirty=false,invalid=false,pending=false,disposed=false,gesture=null,generation=0;
  const localProfile=()=>state?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.profile?.kind==='local-lut';
  const access=()=>{try{return !disposed&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setLocalLUTMask==='function';}catch{return false;}};
  const ready=()=>proxy&&Number.isSafeInteger(proxy.width)&&Number.isSafeInteger(proxy.height)&&proxy.width>0&&proxy.height>0&&proxy.width*proxy.height<=24_000_000&&proxy.data?.length===proxy.width*proxy.height*4;
  function controls(){fields.disabled=pending||!access()||!localProfile();const usable=ready()&&!invalid;
    for(const name of ['dab','empty','apply'])buttons[name].disabled=!usable;buttons.undo.disabled=!usable||!history.length;buttons.reset.disabled=invalid||!dirty;invert.disabled=!usable;
    count.textContent=!localProfile()?'ローカルLUTパネルでLUTを選んでください。':`${draft.strokes.length} / 64 本 · ${draft.strokes.reduce((n,s)=>n+s.points.length,0)} / 4096 点${dirty?' · 未適用の変更あり':''}`;
    root.setAttribute('aria-busy',String(pending));canvas.style.cursor=access()&&localProfile()&&usable&&!pending?'crosshair':'default';
  }
  function number(input){const value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max))throw Error('数値の範囲を確認してください。');return value;}
  function paint(){if(!ready()){canvas.width=canvas.height=1;return;}const mask=rasterizeLocalBrushMask({width:proxy.width,height:proxy.height,strokes:draft.strokes}).data;
    canvas.width=proxy.width;canvas.height=proxy.height;const context=canvas.getContext('2d');if(!context)throw Error('LOCAL_LUT_MASK_CANVAS_UNAVAILABLE');const image=context.createImageData(proxy.width,proxy.height);image.data.set(proxy.data);
    for(let i=0;i<mask.length;i++){const weight=(draft.invert?255-mask[i]:mask[i])/255*.45;if(!image.data[i*4+3])continue;image.data[i*4]=Math.round(image.data[i*4]*(1-weight)+30*weight);image.data[i*4+1]=Math.round(image.data[i*4+1]*(1-weight)+150*weight);image.data[i*4+2]=Math.round(image.data[i*4+2]*(1-weight)+255*weight);}context.putImageData(image,0,0);
  }
  function change(candidate){validateLocalLUTMask(candidate);const previous=draft;draft=candidate;try{paint();}catch(error){draft=previous;throw error;}history.push(copy(previous));if(history.length>128)history.shift();dirty=true;invert.checked=draft.invert;status.textContent='未適用の範囲です。確認して「この範囲を適用」を押してください。';controls();}
  function stroke(point){return {points:[point],radius:number(radius),hardness:number(hardness),mode:mode.value};}
  function point(event){const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)throw Error('LOCAL_LUT_MASK_CANVAS_LAYOUT');const px=(event.clientX-rect.left)/rect.width,py=(event.clientY-rect.top)/rect.height;if(px<0||px>1||py<0||py>1)throw Error('画像の内側で塗ってください。');return {x:px,y:py};}
  function cancelGesture(){const old=gesture;gesture=null;if(old)try{canvas.releasePointerCapture(old.id);}catch{}}
  const drawable=()=>!pending&&access()&&localProfile()&&ready()&&!invalid;
  canvas.addEventListener('pointerdown',event=>{if(!drawable()||gesture||event.button!==0)return;event.preventDefault();event.stopPropagation();try{if(draft.strokes.length>=64)throw Error('ブラシは64本までです。取り消すか空にしてください。');gesture={id:event.pointerId,token:generation,stroke:stroke(point(event))};canvas.setPointerCapture(event.pointerId);}catch(error){cancelGesture();status.textContent=error.message;}});
  canvas.addEventListener('pointermove',event=>{if(!gesture||event.pointerId!==gesture.id)return;event.preventDefault();event.stopPropagation();if(!drawable()||gesture.token!==generation){cancelGesture();return;}try{const next=point(event),last=gesture.stroke.points.at(-1);if(Math.hypot((next.x-last.x)*proxy.width,(next.y-last.y)*proxy.height)<2)return;if(draft.strokes.reduce((n,s)=>n+s.points.length,0)+gesture.stroke.points.length>=4096)throw Error('ブラシは合計4096点までです。');gesture.stroke.points.push(next);}catch(error){cancelGesture();status.textContent=error.message;}});
  canvas.addEventListener('pointerup',event=>{const current=gesture;if(!current||current.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();cancelGesture();if(!drawable()||current.token!==generation)return;try{const next=copy(draft);next.strokes.push(current.stroke);change(next);}catch(error){status.textContent=error.message;}});
  canvas.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',()=>{gesture=null;});mode.addEventListener('change',cancelGesture);
  function synchronize(value){if(disposed)return;state=value;const next=JSON.stringify([value?.asset?.id,value?.asset?.sha256,value?.revision,value?.recipe,value?.busy,value?.exporting,access()]);
    if(next!==signature||proxy!==session.proxy){const lost=dirty;signature=next;generation++;cancelGesture();proxy=session.proxy;history=[];dirty=false;invalid=false;
      try{const stored=value?.recipe?.parameters?.extendedParameters?.localLUTMask;saved=stored===undefined?empty():copy(stored);validateLocalLUTMask(saved);draft=copy(saved);invert.checked=draft.invert;paint();status.textContent=!ready()?'24MP以下の未編集Proxyが必要です。':lost?'写真・Recipe・権限や処理状態が変わったため下書きを破棄しました。':'';}catch(error){invalid=true;draft=empty();saved=empty();canvas.width=canvas.height=1;status.textContent=`保存済み範囲または操作面を表示できません。明示解除は可能です: ${error.message}`;}
    }controls();
  }
  const action=fn=>()=>{if(!drawable())return;cancelGesture();try{fn();}catch(error){status.textContent=error.message;}controls();};
  buttons.dab.addEventListener('click',action(()=>{const next=copy(draft);next.strokes.push(stroke({x:number(x),y:number(y)}));change(next);}));
  buttons.empty.addEventListener('click',action(()=>{const next=copy(draft);next.strokes=[];change(next);}));
  buttons.undo.addEventListener('click',action(()=>{if(!history.length)return;draft=history.pop();dirty=true;invert.checked=draft.invert;paint();status.textContent='最後の下書き変更を取り消しました。';}));
  buttons.reset.addEventListener('click',action(()=>{draft=copy(saved);history=[];dirty=false;invert.checked=draft.invert;paint();status.textContent='保存済み範囲へ戻しました。';}));
  invert.addEventListener('change',action(()=>{const next=copy(draft);next.invert=invert.checked;try{change(next);}catch(error){invert.checked=draft.invert;throw error;}}));
  async function commit(clear){if(disposed||pending||!access()||!localProfile()||!clear&&(!ready()||invalid))return;cancelGesture();const value=clear?null:copy(draft);try{if(value)validateLocalLUTMask(value);}catch(error){status.textContent=error.message;return;}const asset=state.asset.id,sha=state.asset.sha256;pending=true;controls();
    try{await session.setLocalLUTMask(value);if(!disposed&&state?.asset?.id===asset&&state?.asset?.sha256===sha&&access()&&localProfile()&&JSON.stringify(state?.recipe?.parameters?.extendedParameters?.localLUTMask??null)===JSON.stringify(value)){signature=null;synchronize(session.state??state);status.textContent=clear?'マスクを解除し、全域LUTへ戻しました。Recipeを保存してください。':'範囲を適用しました。LUT強度はそのままです。Recipeを保存してください。';}}
    catch(error){if(!disposed&&state?.asset?.id===asset&&state?.asset?.sha256===sha&&access())status.textContent=`範囲を適用できませんでした: ${error.message}`;}
    finally{pending=false;if(!disposed)controls();}
  }
  buttons.apply.addEventListener('click',()=>{void commit(false);});buttons.clear.addEventListener('click',()=>{void commit(true);});const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??state);},dispose(){if(disposed)return;disposed=true;generation++;cancelGesture();if(typeof unsubscribe==='function')unsubscribe();proxy=null;history=[];draft=empty();canvas.width=canvas.height=1;root.remove();}});
}
