import {validateWebManualSpot,applyWebManualSpot} from './processing/web-manual-spot.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';
import {assertPixels} from './processing/pure.mjs';

const copy=value=>structuredClone(value);
const empty=()=>({schemaVersion:1,engineVersion:'suite-web-manual-spot-1',brushVersion:'suite-normalized-coverage-brush-1',defects:[],domain:[],strength:1,iterations:24});
const signature=s=>JSON.stringify([s?.asset?.id,s?.asset?.sha256,s?.revision,s?.recipe,s?.busy,s?.exporting]);

/** Explicit source-Proxy authoring. No face detection or generated texture. */
export function mountWebManualSpot(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('MANUAL_SPOT_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.append(el('h3','小領域の手動修復'),el('p','未編集Proxy上で、赤の修復範囲と、周囲の正常部分を含む青の参照可能範囲を別々に塗ります。コピー元の点指定ではなく、同じ参照範囲内の周辺色を使う拡散修復です。生成・質感復元・自動検出ではありません。Afterの変形後座標とは別の操作面です。'));
  const fields=el('fieldset'),target=el('select'),mode=el('select');
  for(const [value,text] of [['defects','赤：修復範囲'],['domain','青：修復箇所と周囲を含む参照範囲']]){const option=el('option',text);option.value=value;target.append(option);}
  for(const [value,text] of [['add','塗り足す'],['erase','選択範囲を消す']]){const option=el('option',text);option.value=value;mode.append(option);}
  const label=(text,input)=>{const wrap=el('label',text);wrap.append(input);fields.append(wrap);};label('編集対象 ',target);label('ブラシ ',mode);
  function numeric(text,min,max,step,value){const input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);label(text,input);return input;}
  const radius=numeric('ブラシ半径（短辺比率） ',.001,.5,.001,.01),hardness=numeric('硬さ ',0,1,.05,.75),
    strength=numeric('修復強度 ',0,1,.05,1),iterations=numeric('反復回数 ',1,64,1,24),
    x=numeric('数値位置 X（左上0・右下1） ',0,1,.01,.5),y=numeric('数値位置 Y ',0,1,.01,.5);
  const maskView=el('input');maskView.type='checkbox';maskView.checked=true;label('赤青の範囲を表示（OFFはこの修復だけの下書きプレビュー） ',maskView);
  const buttons={};for(const [key,text] of [['dab','数値位置に1点塗る'],['undo','最後の下書き変更を取り消す'],['reset','保存済み設定へ戻す'],['empty','選択範囲のブラシを空にする'],['apply','この修復を編集へ適用']]){const button=el('button',text);button.type='button';buttons[key]=button;fields.append(button);}
  const clear=el('button','この修復を解除');clear.type='button';
  const canvas=el('canvas'),count=el('p'),status=el('p');canvas.style.maxWidth='100%';canvas.style.height='auto';canvas.style.touchAction='none';canvas.setAttribute('aria-label','修復範囲と参照範囲を塗る未編集Proxy');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(fields,clear,count,el('p','各範囲64本・4096点まで。修復範囲と、その周囲の正常部分を含む参照範囲の両方が必要です。実処理画像24MP以下、参照範囲を囲む処理領域1MP以下。境界に届かない修復は適用しません。Proxyで処理できても原寸Finalの処理領域が上限を超える場合は書出せません。原本は変更せず、明示適用後も通常のRecipe保存が必要です。'),canvas,status);container.append(root);
  let state=null,key=null,source=null,proxy=null,draft=empty(),saved=empty(),history=[],dirty=false,invalid=false,pending=false,disposed=false,gesture=null,generation=0;
  function access(){try{return !disposed&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setWebManualSpot==='function';}catch{return false;}}
  const usable=()=>Boolean(proxy)&&!invalid;
  function controls(){
    fields.disabled=pending||!access()||!usable();clear.disabled=pending||!access()||!state?.recipe?.parameters?.extendedParameters?.webManualSpot;
    buttons.undo.disabled=!history.length;buttons.reset.disabled=!dirty;buttons.apply.disabled=!draft.defects.length||!draft.domain.length;
    count.textContent=`修復 ${draft.defects.length}/64本・${draft.defects.reduce((n,s)=>n+s.points.length,0)}/4096点 ／ 参照 ${draft.domain.length}/64本・${draft.domain.reduce((n,s)=>n+s.points.length,0)}/4096点${dirty?'（未適用）':''}`;
    root.setAttribute('aria-busy',String(pending));canvas.style.cursor=access()&&usable()&&!pending?'crosshair':'default';
  }
  function num(input,integer=false){const value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max)||integer&&!Number.isInteger(value))throw Error('数値の範囲を確認してください。');return value;}
  function hydrate(){strength.value=String(draft.strength);iterations.value=String(draft.iterations);}
  function paint(){
    if(!proxy){canvas.width=canvas.height=1;return;}
    canvas.width=proxy.width;canvas.height=proxy.height;const context=canvas.getContext('2d');if(!context)throw Error('MANUAL_SPOT_CANVAS_UNAVAILABLE');
    const image=context.createImageData(proxy.width,proxy.height);
    if(!maskView.checked){validateWebManualSpot(draft);image.data.set(applyWebManualSpot(proxy,draft).data);}
    else{
      image.data.set(proxy.data);const workBudget={remaining:96_000_000};
      for(const [role,color] of [['domain',[30,150,255]],['defects',[255,65,65]]]){
        const mask=rasterizeLocalBrushMask({width:proxy.width,height:proxy.height,strokes:draft[role],workBudget}).data;
        for(let i=0;i<mask.length;i++){if(!image.data[i*4+3])continue;const weight=mask[i]/255*.45;for(let c=0;c<3;c++)image.data[i*4+c]=Math.round(image.data[i*4+c]*(1-weight)+color[c]*weight);}
      }
    }
    context.putImageData(image,0,0);
  }
  function cancelGesture(){const prior=gesture;gesture=null;if(prior)try{canvas.releasePointerCapture(prior.id);}catch{}}
  function synchronize(value){
    if(disposed)return;state=value;const next=signature(value)+':'+access();
    if(key!==next||source!==session.proxy){
      const lost=dirty;key=next;source=session.proxy;generation++;cancelGesture();history=[];dirty=false;invalid=false;proxy=null;
      try{
        const stored=value?.recipe?.parameters?.extendedParameters?.webManualSpot;
        if(stored!==undefined)validateWebManualSpot(stored);saved=stored===undefined?empty():copy(stored);draft=copy(saved);hydrate();maskView.checked=true;
        if(access()&&source){assertPixels(source);if(source.width>1600||source.height>1600)throw Error('1600px以下の未編集Proxyが必要です。');proxy={...source,data:new Uint8ClampedArray(source.data)};}
        paint();status.textContent=!proxy?'利用可能な写真の未編集Proxyを準備してください。':lost?'写真・編集状態・権限が変わったため下書きを破棄しました。':'';
      }catch(error){invalid=true;draft=empty();saved=empty();canvas.width=canvas.height=1;status.textContent=`操作面を表示できません。保存済み修復の明示解除は可能です: ${error.message}`;}
    }controls();
  }
  function fresh(){const current=session.state??state;if(signature(current)+':'+access()!==key||session.proxy!==source){synchronize(current);throw Error('写真・編集状態が変わりました。');}if(disposed||pending||!access()||!usable())throw Error('現在は修復範囲を編集できません。');}
  function change(next){
    // Empty intermediate masks are legitimate drafts; strict complete-document
    // validation belongs to preview/apply. Rasterization validates each stroke.
    if(next.defects.length&&next.domain.length)validateWebManualSpot(next);
    const previous=draft,previousView=maskView.checked;draft=next;if(!draft.defects.length||!draft.domain.length)maskView.checked=true;
    try{paint();}catch(error){draft=previous;maskView.checked=previousView;try{paint();}catch{}throw error;}
    history.push(copy(previous));if(history.length>128)history.shift();dirty=true;hydrate();status.textContent='未適用の下書きです。範囲と周辺参照を確認して適用してください。';controls();
  }
  function makeStroke(point){if(!['add','erase'].includes(mode.value))throw Error('ブラシモードを選んでください。');return {points:[point],radius:num(radius),hardness:num(hardness),mode:mode.value};}
  function point(event){const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)throw Error('操作面の大きさを確認できません。');const p={x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>1||p.y>1)throw Error('画像の内側で塗ってください。');return p;}
  function append(role,stroke){if(!['defects','domain'].includes(role))throw Error('編集範囲を選んでください。');const next=copy(draft);next[role].push(stroke);change(next);}
  const action=fn=>()=>{try{fresh();cancelGesture();fn();}catch(error){if(!disposed)status.textContent=error.message;}if(!disposed)controls();};
  canvas.addEventListener('pointerdown',event=>{if(gesture||event.isPrimary===false||event.button!==0)return;try{fresh();if(!['defects','domain'].includes(target.value)||draft[target.value].length>=64)throw Error('選択範囲のブラシは64本までです。');gesture={id:event.pointerId,token:generation,role:target.value,stroke:makeStroke(point(event))};canvas.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation();}catch(error){cancelGesture();status.textContent=error.message;}});
  canvas.addEventListener('pointermove',event=>{if(!gesture||gesture.id!==event.pointerId)return;try{fresh();if(gesture.token!==generation)throw Error('下書きが変わりました。');const p=point(event),last=gesture.stroke.points.at(-1);if(Math.hypot((p.x-last.x)*proxy.width,(p.y-last.y)*proxy.height)<2)return;if(draft[gesture.role].reduce((n,s)=>n+s.points.length,0)+gesture.stroke.points.length>=4096)throw Error('選択範囲は4096点までです。');gesture.stroke.points.push(p);event.preventDefault();event.stopPropagation();}catch(error){cancelGesture();status.textContent=error.message;}});
  canvas.addEventListener('pointerup',event=>{const value=gesture;if(!value||value.id!==event.pointerId)return;cancelGesture();try{fresh();if(value.token!==generation)throw Error('下書きが変わりました。');const p=point(event),last=value.stroke.points.at(-1);if(p.x!==last.x||p.y!==last.y)value.stroke.points.push(p);append(value.role,value.stroke);event.preventDefault();event.stopPropagation();}catch(error){status.textContent=error.message;}controls();});
  canvas.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',()=>{gesture=null;});for(const control of [target,mode,radius,hardness])control.addEventListener('change',cancelGesture);
  buttons.dab.addEventListener('click',action(()=>append(target.value,makeStroke({x:num(x),y:num(y)}))));
  buttons.empty.addEventListener('click',action(()=>{const next=copy(draft);if(!['defects','domain'].includes(target.value))throw Error('編集範囲を選んでください。');next[target.value]=[];change(next);}));
  buttons.undo.addEventListener('click',action(()=>{if(!history.length)return;draft=history.pop();dirty=true;maskView.checked=true;hydrate();paint();status.textContent='最後の下書き変更を取り消しました。';}));
  buttons.reset.addEventListener('click',action(()=>{draft=copy(saved);history=[];dirty=false;maskView.checked=true;hydrate();paint();status.textContent='保存済み設定へ戻しました。';}));
  for(const control of [strength,iterations])control.addEventListener('change',action(()=>{try{const next=copy(draft);next.strength=num(strength);next.iterations=num(iterations,true);change(next);}catch(error){hydrate();throw error;}}));
  maskView.addEventListener('change',action(()=>{try{paint();}catch(error){maskView.checked=true;paint();throw error;}}));
  async function commit(remove){
    if(disposed||pending)return;let value,asset,sha;
    try{
      if(remove){const current=session.state??state;if(signature(current)+':'+access()!==key||session.proxy!==source){synchronize(current);throw Error('写真・編集状態が変わりました。');}state=current;if(!access())throw Error('修復を解除できません。');value=null;}
      else{fresh();value=copy(draft);validateWebManualSpot(value);applyWebManualSpot(proxy,value);}
      cancelGesture();asset=state.asset.id;sha=state.asset.sha256;pending=true;controls();
      await session.setWebManualSpot(value);
      if(!disposed&&state?.asset?.id===asset&&state?.asset?.sha256===sha&&access()&&JSON.stringify(state.recipe?.parameters?.extendedParameters?.webManualSpot??null)===JSON.stringify(value)){
        key=null;synchronize(session.state??state);status.textContent=remove?'この修復を解除しました。Recipeを保存してください。':'修復を編集へ適用しました。Recipe保存は通常の保存操作で行ってください。';
      }
    }catch(error){if(!disposed&&(!asset||state?.asset?.id===asset&&state?.asset?.sha256===sha))status.textContent=`適用できませんでした。範囲を小さくし、正常な周辺部分を参照範囲へ含めてください: ${error.message}`;}
    finally{pending=false;if(!disposed)controls();}
  }
  buttons.apply.addEventListener('click',()=>{void commit(false);});clear.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??state);},dispose(){if(disposed)return;disposed=true;generation++;cancelGesture();unsubscribe?.();proxy=null;source=null;history=[];draft=empty();canvas.width=canvas.height=1;root.remove();}});
}
