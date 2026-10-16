import {applyManualEyes,validateManualEyes,MANUAL_EYES_VERSION,LOCAL_BRUSH_VERSION} from './processing/manual-eyes.mjs';
import {assertPixels} from './processing/pure.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';

const REGIONS={eye:'目全体の明るさ',sclera:'白目の明るさ',iris:'瞳の鮮やかさ'};
const empty=()=>Object.fromEntries(Object.keys(REGIONS).map(key=>[key,{strokes:[],amount:25}]));
export function mountWebConnectedManualEyes(container,{session,canUse=()=>false}={}){
  const doc=container?.ownerDocument;
  if(!doc?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('MANUAL_EYES_UI_CONFIG');
  const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','手動目補正');
  root.append(el('h3','手動目補正'),el('p','未編集・回転Crop前の画像で、目全体・白目・瞳をそれぞれ手塗りします。顔や目の自動検出は行いません。目全体と白目は明るさ、瞳は鮮やかさの補正です。'));
  const fields=el('fieldset');fields.append(el('legend','領域別の手動補正'));
  const region=el('select');region.setAttribute('aria-label','補正する目の領域');
  for(const [key,label] of Object.entries(REGIONS)){const o=el('option',label);o.value=key;region.append(o);}fields.append(region);
  const numeric=(label,value,min,max,step='1')=>{const wrap=el('label',label),n=el('input');n.type='number';n.value=String(value);n.min=String(min);n.max=String(max);n.step=step;wrap.append(n);fields.append(wrap);return n;};
  const amount=numeric('選択領域の強さ',25,0,100),radius=numeric('ブラシ半径（短辺の%）',1,.1,50,'.1'),hardness=numeric('硬さ（%）',50,0,100);
  const mode=el('select');mode.setAttribute('aria-label','選択領域を塗る・消す');
  for(const [value,label] of [['add','選択領域を塗る'],['erase','選択領域を消す']]){const o=el('option',label);o.value=value;mode.append(o);}fields.append(mode);
  const maskLabel=el('label','選択領域のマスクを表示'),mask=el('input');mask.type='checkbox';mask.checked=true;maskLabel.append(mask);fields.append(maskLabel);
  const button=text=>{const n=el('button',text);n.type='button';fields.append(n);return n;};
  const undo=button('選択領域の最後の線を戻す'),clear=button('選択領域の下書きを空にする'),apply=button('全領域の目補正を適用');
  const remove=el('button','適用済み目補正をすべて解除');remove.type='button';
  const canvas=el('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','選択した目の領域。矢印キーで位置移動、Enterで点を追加');
  canvas.style.cssText='display:block;width:100%;height:auto;max-width:800px;touch-action:none;cursor:crosshair;';
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('MANUAL_EYES_CANVAS_UNAVAILABLE');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(fields,remove,canvas,el('p','マスクOFFでは全領域の補正を表示します。領域合計64線・4096点・ブラシ処理量96Mまで。空の下書き領域は保存しません。全領域を空にした場合は専用解除を使用してください。「適用」でUndo可能な編集に入り、保存は通常の保存操作です。原本は変更しません。'),status);container.append(root);
  let state,signature=null,binding=null,base=null,drafts=empty(),selected='eye',active=null,pending=false,disposed=false,raf=null,lastImage=null;
  const listeners=[],keyboard={x:.5,y:.5};
  const on=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push(()=>node.removeEventListener(type,fn));};
  const sig=s=>JSON.stringify([s?.asset?.id,s?.asset?.sha256,s?.revision,s?.recipe,s?.afterURL]);
  const hasStrokes=()=>Object.values(drafts).some(r=>r.strokes.length);
  function available(){try{return !disposed&&!pending&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setManualEyes==='function';}catch{return false;}}
  function stop(){const old=active;active=null;if(old&&canvas.hasPointerCapture?.(old.id))canvas.releasePointerCapture(old.id);}
  function invalidate(){stop();binding=null;base=null;drafts=empty();lastImage=null;ctx.clearRect(0,0,canvas.width,canvas.height);}
  function controls(){fields.disabled=!available()||!binding;canvas.setAttribute('aria-disabled',String(fields.disabled));canvas.style.touchAction=fields.disabled?'auto':'none';
    apply.disabled=!hasStrokes();undo.disabled=clear.disabled=!drafts[selected].strokes.length;remove.disabled=!available()||!state?.recipe?.parameters?.extendedParameters?.manualEyes;root.setAttribute('aria-busy',String(pending));}
  function ensure(){if(!available()||!binding||binding.signature!==sig(session.state)||binding.proxy!==session.proxy)throw Error('MANUAL_EYES_DRAFT_STALE');}
  function num(n,min,max){if(!n.value.trim())throw Error('MANUAL_EYES_CONTROLS');const v=Number(n.value);if(!Number.isFinite(v)||v<min||v>max)throw Error('MANUAL_EYES_CONTROLS');return v;}
  function settings(list=drafts[selected].strokes){
    const regions={};for(const key of Object.keys(REGIONS)){const r=drafts[key],strokes=key===selected?list:r.strokes;
      if(strokes.length)regions[key]={strokes:structuredClone(strokes),amount:key===selected?num(amount,0,100):r.amount};}
    const value={schemaVersion:1,engineVersion:MANUAL_EYES_VERSION,brushVersion:LOCAL_BRUSH_VERSION,regions};validateManualEyes(value);return value;
  }
  function message(error){return `${error.message}${error.region&&REGIONS[error.region]?`（${REGIONS[error.region]}。完全に消した領域は「下書きを空にする」で除外してください）`:''}`;}
  function guide(){if(!lastImage||disposed)return;ctx.putImageData(lastImage,0,0);if(active){ctx.save();ctx.strokeStyle='#00d5ff';ctx.lineWidth=Math.max(1,base.width/400);ctx.beginPath();
    active.stroke.points.forEach((p,i)=>{if(i)ctx.lineTo(p.x*base.width,p.y*base.height);else ctx.moveTo(p.x*base.width,p.y*base.height);});ctx.stroke();ctx.restore();}}
  function paint(){if(!binding||!base||disposed)return;let data=base.data.slice();
    if(hasStrokes()){const value=settings();if(mask.checked){const strokes=drafts[selected].strokes;
      if(strokes.length){const coverage=rasterizeLocalBrushMask({width:base.width,height:base.height,strokes,workBudget:{remaining:96_000_000}});
        for(let i=0;i<coverage.data.length;i++){const at=i*4;if(!data[at+3])continue;const weight=coverage.data[i]/255*.6;data[at]=Math.round(data[at]*(1-weight)+255*weight);data[at+1]=Math.round(data[at+1]*(1-weight));data[at+2]=Math.round(data[at+2]*(1-weight)+170*weight);}}
      }else data=applyManualEyes(base,value).data;}
    lastImage=ctx.createImageData(base.width,base.height);lastImage.data.set(data);guide();}
  function schedule(){if(raf!==null)return;raf=doc.defaultView.requestAnimationFrame(()=>{raf=null;guide();});}
  function hydrate(){assertPixels(session.proxy);if(session.proxy.width>1600||session.proxy.height>1600)throw Error('MANUAL_EYES_PROXY_REQUIRED');
    base={...session.proxy,data:session.proxy.data.slice()};canvas.width=base.width;canvas.height=base.height;drafts=empty();
    const saved=state.recipe?.parameters?.extendedParameters?.manualEyes;if(saved){validateManualEyes(saved);for(const [key,value] of Object.entries(saved.regions))drafts[key]=structuredClone(value);}
    amount.value=String(drafts[selected].amount);region.value=selected;binding={signature:sig(state),proxy:session.proxy};paint();}
  function sync(value){if(disposed)return;state=value;const next=sig(value),changed=next!==signature||binding&&binding.proxy!==session.proxy;signature=next;
    if(changed||!available()){const lost=Boolean(active)||hasStrokes();invalidate();if(lost&&!pending)status.textContent='画像・版・編集状態が変わったため下書きを破棄しました。';}
    if(available()&&!binding)try{hydrate();}catch(error){invalidate();status.textContent=message(error);}controls();}
  function point(event){const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
    if(r.width<=0||r.height<=0||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('MANUAL_EYES_POINT_OUTSIDE');return {x,y};}
  function stroke(p){return {points:[p],radius:num(radius,.1,50)/100,hardness:num(hardness,0,100)/100,mode:mode.value};}
  function append(s){ensure();const previous=drafts[selected].strokes,next=[...previous,s];settings(next);drafts[selected].strokes=next;
    try{paint();}catch(error){drafts[selected].strokes=previous;paint();throw error;}status.textContent='未適用です。領域と補正結果を確認してください。';controls();}
  on(region,'change',()=>{try{ensure();stop();if(!Object.hasOwn(REGIONS,region.value))throw Error('MANUAL_EYES_REGION');drafts[selected].amount=num(amount,0,100);selected=region.value;amount.value=String(drafts[selected].amount);paint();controls();}catch(error){region.value=selected;status.textContent=message(error);}});
  on(canvas,'pointerdown',event=>{if(event.button!==0||active)return;try{ensure();event.preventDefault();active={id:event.pointerId,stroke:stroke(point(event))};canvas.setPointerCapture(event.pointerId);schedule();}catch(error){stop();status.textContent=message(error);}});
  on(canvas,'pointermove',event=>{if(!active||active.id!==event.pointerId)return;try{ensure();event.preventDefault();const p=point(event),last=active.stroke.points.at(-1);
    if(Math.hypot((p.x-last.x)*base.width,(p.y-last.y)*base.height)<2)return;
    const count=Object.values(drafts).reduce((sum,r)=>sum+r.strokes.reduce((n,s)=>n+s.points.length,0),0);
    if(count+active.stroke.points.length>=4096)throw Error('MANUAL_EYES_POINT_LIMIT');active.stroke.points.push(p);schedule();}catch(error){stop();status.textContent=message(error);schedule();}});
  on(canvas,'pointerup',event=>{if(!active||active.id!==event.pointerId)return;const s=active.stroke;stop();try{append(s);}catch(error){status.textContent=message(error);schedule();}});
  for(const event of ['pointercancel','lostpointercapture'])on(canvas,event,()=>{if(active){stop();schedule();}});
  on(canvas,'keydown',event=>{try{ensure();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();keyboard.x=Math.max(0,Math.min(1,keyboard.x+(event.key==='ArrowRight' ? .01 : event.key==='ArrowLeft' ? -.01 : 0)));keyboard.y=Math.max(0,Math.min(1,keyboard.y+(event.key==='ArrowDown' ? .01 : event.key==='ArrowUp' ? -.01 : 0)));status.textContent=`位置 ${Math.round(keyboard.x*100)}%, ${Math.round(keyboard.y*100)}%。Enterで点を追加。`;}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();append(stroke({...keyboard}));}}catch(error){status.textContent=message(error);}});
  for(const n of [amount,mask])on(n,'input',()=>{try{ensure();paint();}catch(error){status.textContent=message(error);}});
  on(undo,'click',()=>{try{ensure();stop();drafts[selected].strokes.pop();paint();controls();}catch(error){status.textContent=message(error);}});
  on(clear,'click',()=>{try{ensure();stop();drafts[selected].strokes=[];paint();controls();}catch(error){status.textContent=message(error);}});
  async function commit(clearValue){try{if(clearValue){if(!available()||signature!==sig(session.state))throw Error('MANUAL_EYES_DRAFT_STALE');}else ensure();
    const value=clearValue?null:settings();if(value)applyManualEyes(base,value);stop();pending=true;controls();await session.setManualEyes(value);
    if(!disposed)status.textContent=clearValue?'適用済み目補正を解除しました。':'全領域の目補正を編集に反映しました。通常の保存操作で保存してください。';
    }catch(error){if(!disposed)status.textContent=`適用できません：${message(error)}`;}finally{pending=false;if(!disposed)sync(session.state);}}
  on(apply,'click',()=>{void commit(false);});on(remove,'click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(sync);
  return Object.freeze({refresh(){if(!disposed)sync(session.state);},dispose(){if(disposed)return;disposed=true;stop();if(raf!==null)doc.defaultView.cancelAnimationFrame(raf);unsubscribe?.();for(const off of listeners)off();root.remove();}});
}
