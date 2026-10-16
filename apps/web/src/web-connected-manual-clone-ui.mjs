import {applyManualClone,validateManualClone,MANUAL_CLONE_VERSION,MANUAL_CLONE_MAX_PIXELS,LOCAL_BRUSH_VERSION} from './processing/manual-clone.mjs';
import {assertPixels} from './processing/pure.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';

export function mountWebConnectedManualClone(container,{session,canUse=()=>false}={}){
  const doc=container?.ownerDocument;
  if(!doc?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('MANUAL_CLONE_UI_CONFIG');
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','手動クローン・修復');
  root.append(el('h3','手動クローン・修復'),el('p','顔認識・AIを使わず、コピー元を指定して塗ります。この専用キャンバスは回転・Crop前の未編集Proxyです。対応する大きな原本も縮小Proxyで編集できます。この処理が扱う実画素はFinalを含め24MPまでで、それを超える原寸Final出力を保証するものではありません。RAW読込・出力の制限は別です。1レイヤーでは同じ相対位置からコピーします。'));
  const fields=el('fieldset');fields.append(el('legend','コピー元と対象'));
  const button=text=>{const n=el('button',text);n.type='button';fields.append(n);return n;};
  const choose=button('コピー元を選び直す（下書きの線を消去）');
  const input=(text,type,value)=>{const label=el('label',text),n=el('input');n.type=type;n.value=value;label.append(n);fields.append(label);return n;};
  const heal=input('境界の色を合わせて修復','checkbox','');heal.checked=true;
  const opacity=input('濃さ（%）','number','100'),radius=input('半径（短辺の%）','number','2'),hardness=input('硬さ（%）','number','50');
  for(const n of [opacity,hardness]){n.min='0';n.max='100';n.step='1';}radius.min='.1';radius.max='50';radius.step='.1';
  const mode=el('select');mode.setAttribute('aria-label','塗る・消す');for(const [value,label] of [['add','塗る'],['erase','範囲を消す']]){const n=el('option',label);n.value=value;mode.append(n);}fields.append(mode);
  const mask=input('対象マスクを表示','checkbox','');
  const undo=button('最後の線を戻す'),clear=button('下書きの線を消す'),apply=button('クローン・修復を適用'),remove=button('適用済みクローン・修復を解除');
  const canvas=el('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','コピー元と対象を指定。矢印で位置移動、Enterで指定または点を追加');
  canvas.style.cssText='display:block;width:100%;height:auto;max-width:800px;touch-action:none;cursor:crosshair;';
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('MANUAL_CLONE_CANVAS_UNAVAILABLE');
  const scope=el('p'),status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(fields,remove,scope,canvas,el('p','最初にコピー元をクリックし、次に対象をドラッグしてください。修復OFFはそのまま複写、ONは対象との境界色を合わせます。画像外のコピーは拒否します。下書きの確認後に適用し、通常の保存操作で保存してください。原本は変更しません。'),status);container.append(root);
  let state,signature=null,binding=null,base=null,strokes=[],offset=null,donor=null,selecting=true,active=null,disposed=false,pending=false,raf=null;
  let keyboard={x:.5,y:.5};const listeners=[];
  const on=(n,t,f)=>{n.addEventListener(t,f);listeners.push(()=>n.removeEventListener(t,f));};
  const sig=s=>JSON.stringify([s?.asset?.id,s?.asset?.sha256,s?.revision,s?.recipe,s?.afterURL]);
  function available(){try{return !disposed&&!pending&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setManualClone==='function';}catch{return false;}}
  function stop(){const a=active;active=null;if(a&&canvas.hasPointerCapture?.(a.id))canvas.releasePointerCapture(a.id);}
  function invalidate(){stop();binding=null;base=null;strokes=[];offset=null;donor=null;selecting=true;ctx.clearRect(0,0,canvas.width,canvas.height);}
  function controls(){fields.disabled=!available()||!binding;canvas.setAttribute('aria-disabled',String(fields.disabled));canvas.style.touchAction=fields.disabled?'auto':'none';apply.disabled=!strokes.length||!offset;undo.disabled=!strokes.length;clear.disabled=!strokes.length;remove.disabled=!available()||!state?.recipe?.parameters?.extendedParameters?.manualClone;root.setAttribute('aria-busy',String(pending));
    scope.textContent=selecting?'コピー元を指定してください。':!offset?'対象の最初の位置を指定してください。':`固定コピー移動量 X ${(offset.dx*100).toFixed(2)}% / Y ${(offset.dy*100).toFixed(2)}%`;
  }
  function ensure(){if(!available()||!binding||binding.signature!==sig(session.state)||binding.proxy!==session.proxy)throw Error('MANUAL_CLONE_DRAFT_STALE');}
  function numeric(n,min,max){if(n.value.trim()==='')throw Error('MANUAL_CLONE_CONTROLS');const v=Number(n.value);if(!Number.isFinite(v)||v<min||v>max)throw Error('MANUAL_CLONE_CONTROLS');return v;}
  function settings(list=strokes){const value={schemaVersion:1,engineVersion:MANUAL_CLONE_VERSION,brushVersion:LOCAL_BRUSH_VERSION,
    strokes:structuredClone(list),offset:offset?{...offset}:null,heal:heal.checked,opacity:numeric(opacity,0,100)/100};validateManualClone(value);return value;}
  function paint(){
    if(!base||!binding||disposed)return;
    let data=base.data.slice();
    if(strokes.length){const value=settings();
      // Validate donor bounds even when the coverage overlay is selected.
      const result=applyManualClone(base,value);
      if(mask.checked){const coverage=rasterizeLocalBrushMask({width:base.width,height:base.height,strokes});
        for(let i=0;i<coverage.data.length;i++){const at=i*4;if(!data[at+3])continue;const a=coverage.data[i]/255*.55;data[at]=Math.round(data[at]*(1-a)+255*a);data[at+1]=Math.round(data[at+1]*(1-a));data[at+2]=Math.round(data[at+2]*(1-a)+170*a);}}
      else data=result.data;
    }
    const image=ctx.createImageData(base.width,base.height);image.data.set(data);ctx.putImageData(image,0,0);
    ctx.save();ctx.strokeStyle='#00d5ff';ctx.lineWidth=Math.max(1,base.width/400);
    if(donor){const x=donor.x*base.width,y=donor.y*base.height,r=Math.max(4,base.width/100);ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke();}
    if(active){ctx.beginPath();active.stroke.points.forEach((p,i)=>{if(i)ctx.lineTo(p.x*base.width,p.y*base.height);else ctx.moveTo(p.x*base.width,p.y*base.height);});ctx.stroke();}ctx.restore();
  }
  function schedule(){if(raf!==null)return;raf=doc.defaultView.requestAnimationFrame(()=>{raf=null;try{paint();}catch(e){status.textContent=e.message;}});}
  function hydrate(){assertPixels(session.proxy);
    if(session.proxy.width*session.proxy.height>MANUAL_CLONE_MAX_PIXELS)throw Error('実処理画像の画素数がクローン・修復の上限を超えています。');
    if(session.proxy.width>1600||session.proxy.height>1600)throw Error('MANUAL_CLONE_PROXY_REQUIRED');
    base={...session.proxy,data:session.proxy.data.slice()};canvas.width=base.width;canvas.height=base.height;
    const saved=state.recipe?.parameters?.extendedParameters?.manualClone;
    if(saved){validateManualClone(saved);strokes=structuredClone(saved.strokes);offset={...saved.offset};heal.checked=saved.heal;opacity.value=String(saved.opacity*100);selecting=false;}
    else{strokes=[];offset=null;selecting=true;heal.checked=true;opacity.value='100';}
    donor=null;binding={signature:sig(state),proxy:session.proxy};paint();
  }
  function sync(value){if(disposed)return;state=value;const next=sig(value),changed=signature!==next||binding&&binding.proxy!==session.proxy;signature=next;
    if(changed||!available()){const lost=Boolean(active)||strokes.length>0;invalidate();if(lost&&!pending)status.textContent='画像・版・編集状態が変わったため下書きを破棄しました。';}
    if(available()&&!binding)try{hydrate();}catch(e){invalidate();status.textContent=e.message;}
    controls();
  }
  function point(event){const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
    if(r.width<=0||r.height<=0||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('MANUAL_CLONE_POINT_OUTSIDE');return {x,y};}
  function start(p){ensure();if(selecting){donor=p;offset=null;selecting=false;status.textContent='次に対象を塗ってください。';controls();paint();return null;}
    if(!offset){if(!donor)throw Error('MANUAL_CLONE_DONOR_REQUIRED');offset={dx:donor.x-p.x,dy:donor.y-p.y};}
    return {points:[p],radius:numeric(radius,.1,50)/100,hardness:numeric(hardness,0,100)/100,mode:mode.value};
  }
  function append(stroke){ensure();const previous=strokes,next=[...strokes,stroke];settings(next);strokes=next;
    try{paint();}catch(error){strokes=previous;paint();throw error;}status.textContent='未適用です。結果を確認して適用してください。';controls();}
  on(choose,'click',()=>{try{ensure();stop();strokes=[];offset=null;donor=null;selecting=true;paint();controls();}catch(e){status.textContent=e.message;}});
  on(canvas,'pointerdown',event=>{if(event.button!==0||active)return;try{ensure();event.preventDefault();const s=start(point(event));if(s){active={id:event.pointerId,stroke:s};canvas.setPointerCapture(event.pointerId);schedule();}}catch(e){stop();status.textContent=e.message;}});
  on(canvas,'pointermove',event=>{if(!active||active.id!==event.pointerId)return;try{ensure();event.preventDefault();const p=point(event),last=active.stroke.points.at(-1);
    if(Math.hypot((p.x-last.x)*base.width,(p.y-last.y)*base.height)<2)return;
    if(strokes.reduce((n,s)=>n+s.points.length,0)+active.stroke.points.length>=4096)throw Error('MANUAL_CLONE_POINT_LIMIT');active.stroke.points.push(p);schedule();
  }catch(e){stop();status.textContent=e.message;schedule();}});
  on(canvas,'pointerup',event=>{if(!active||active.id!==event.pointerId)return;const s=active.stroke;stop();try{append(s);}catch(e){status.textContent=e.message;schedule();}});
  for(const name of ['pointercancel','lostpointercapture'])on(canvas,name,()=>{if(active){stop();schedule();}});
  on(canvas,'keydown',event=>{try{ensure();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();keyboard.x=Math.max(0,Math.min(1,keyboard.x+(event.key==='ArrowRight' ? .01 : event.key==='ArrowLeft' ? -.01 : 0)));keyboard.y=Math.max(0,Math.min(1,keyboard.y+(event.key==='ArrowDown' ? .01 : event.key==='ArrowUp' ? -.01 : 0)));status.textContent=`位置 ${Math.round(keyboard.x*100)}%, ${Math.round(keyboard.y*100)}%。Enterで指定。`;}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();const s=start({...keyboard});if(s)append(s);}}catch(e){status.textContent=e.message;}});
  for(const n of [heal,opacity,mask])on(n,'input',()=>{try{ensure();paint();}catch(e){status.textContent=e.message;}});
  on(undo,'click',()=>{try{ensure();strokes.pop();paint();controls();}catch(e){status.textContent=e.message;}});
  on(clear,'click',()=>{try{ensure();stop();strokes=[];paint();controls();}catch(e){status.textContent=e.message;}});
  async function commit(clearValue){try{if(clearValue){if(!available()||signature!==sig(session.state))throw Error('MANUAL_CLONE_DRAFT_STALE');}else ensure();const value=clearValue?null:settings();if(value)applyManualClone(base,value);stop();pending=true;controls();await session.setManualClone(value);
    if(!disposed)status.textContent=clearValue?'クローン・修復を解除しました。':'編集へ適用しました。通常の保存操作で保存してください。';
  }catch(e){if(!disposed)status.textContent=`適用できません：${e.message}`;}finally{pending=false;if(!disposed)sync(session.state);}}
  on(apply,'click',()=>{void commit(false);});on(remove,'click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(sync);
  return Object.freeze({refresh(){if(!disposed)sync(session.state);},dispose(){if(disposed)return;disposed=true;stop();if(raf!==null)doc.defaultView.cancelAnimationFrame(raf);unsubscribe?.();for(const off of listeners)off();root.remove();}});
}
