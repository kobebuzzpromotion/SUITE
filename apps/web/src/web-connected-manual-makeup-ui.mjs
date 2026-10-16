import {applyManualMakeup,validateManualMakeup,MANUAL_MAKEUP_LAYERS_VERSION,LOCAL_BRUSH_VERSION} from './processing/manual-makeup-brush.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';
import {assertPixels} from './processing/pure.mjs';

/** Independent upright Proxy canvas; no recognition, person identifier, or
 * permission claim is manufactured. Current Recipe is changed only on Apply. */
export function mountWebConnectedManualMakeup(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('MANUAL_MAKEUP_UI_CONFIG');
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','手塗りメイク（顔認識なし）');
  root.append(el('h3','手塗りメイク（顔認識なし）'),el('p','回転・Crop前の専用キャンバスに手動指定します。頬・唇・目元など任意の名前で最大8レイヤー。顔検出・肌判定は行いません。上から順に合成し、消去は選択レイヤーだけに作用します。全体64線・4096点・合計処理量上限を共有します。'));
  const fields=el('fieldset');fields.append(el('legend','手動ブラシ'));
  const input=(label,type,value)=>{const l=el('label',label),n=el('input');n.type=type;n.value=value;l.append(n);fields.append(l);return n;};
  const color=input('色','color','#dc7393'),opacity=input('濃さ（%）','number','25'),radius=input('半径（短辺の%）','number','5'),hardness=input('硬さ（%）','number','50');
  for(const n of [opacity,hardness]){n.min='0';n.max='100';n.step='1';}
  radius.min='.1';radius.max='50';radius.step='.1';
  const mode=el('select');mode.setAttribute('aria-label','ブラシ操作');
  for(const [value,label] of [['add','追加'],['erase','消去']]){const option=el('option',label);option.value=value;mode.append(option);}fields.append(mode);
  const mask=input('マスクを表示','checkbox','');mask.checked=true;
  const button=text=>{const b=el('button',text);b.type='button';fields.append(b);return b;};
  const undo=button('未適用の最後の線を戻す'),clear=button('未適用の線をすべて消す'),apply=button('この手塗りを適用'),remove=button('適用済み手塗りを解除');
  const layerSelect=el('select');layerSelect.setAttribute('aria-label','手塗りレイヤー');fields.append(layerSelect);
  const layerName=input('選択レイヤー名','text','レイヤー1');layerName.maxLength=40;
  const addLayer=button('レイヤー追加'),deleteLayer=button('選択レイヤー削除'),upLayer=button('順序を前へ'),downLayer=button('順序を後へ');
  const canvas=el('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','未編集画像に手塗り。矢印キーで位置移動、Enterで点を追加');
  canvas.style.cssText='display:block;width:100%;height:auto;max-width:800px;touch-action:none;cursor:crosshair;';
  const context=canvas.getContext('2d');if(!context)throw Error('MANUAL_MAKEUP_CANVAS_UNAVAILABLE');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(fields,canvas,el('p','追加／消去は未適用の下書きです。「適用」で編集履歴に入り、保存は通常の保存操作で行います。マスクはピンク表示。原本は変更しません。処理量の上限を超える長い線は拒否されます。Finalにも同じ正規化座標を使います。'),status);container.append(root);
  let current,signature=null,binding=null,base=null,strokes=[],active=null,pending=false,disposed=false,frameRequest=null;
  let layers=[],selected=0;
  const newLayer=()=>({id:globalThis.crypto.randomUUID(),name:`レイヤー${layers.length+1}`,strokes:[],color:{r:220,g:115,b:147},opacity:.25});
  function layerOptions(){layerSelect.replaceChildren();layers.forEach((layer,index)=>{const o=el('option',`${index+1}. ${layer.name}`);o.value=String(index);layerSelect.append(o);});layerSelect.value=String(selected);}
  function selectLayer(index){selected=index;const layer=layers[selected];strokes=layer.strokes;layerName.value=layer.name;
    color.value='#'+[layer.color.r,layer.color.g,layer.color.b].map(v=>v.toString(16).padStart(2,'0')).join('');opacity.value=String(layer.opacity*100);layerOptions();}
  function captureLayer(){const layer=layers[selected];if(!layer)return;
    const name=layerName.value.trim();if(!name||name.length>40||/[\u0000-\u001f\u007f]/.test(name)||!/^#[0-9a-f]{6}$/i.test(color.value))throw Error('MANUAL_MAKEUP_CONTROLS_INVALID');
    layer.name=name;layer.strokes=strokes;layer.opacity=number(opacity,0,100)/100;
    layer.color={r:parseInt(color.value.slice(1,3),16),g:parseInt(color.value.slice(3,5),16),b:parseInt(color.value.slice(5,7),16)};}
  let keyboard={x:.5,y:.5};
  const listeners=[];
  const on=(target,type,fn)=>{target.addEventListener(type,fn);listeners.push(()=>target.removeEventListener(type,fn));};
  const sig=value=>JSON.stringify([value?.asset?.id,value?.asset?.sha256,value?.revision,value?.recipe,value?.afterURL]);
  function permitted(){try{return !disposed&&!pending&&Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setManualMakeup==='function';}catch{return false;}}
  function stopStroke(){const previous=active;active=null;if(previous&&canvas.hasPointerCapture?.(previous.pointerId))canvas.releasePointerCapture(previous.pointerId);}
  function invalidate(){stopStroke();binding=null;base=null;strokes=[];layers=[];selected=0;layerSelect.replaceChildren();context.clearRect(0,0,canvas.width,canvas.height);}
  function controls(){const ready=permitted()&&Boolean(binding);fields.disabled=!ready;canvas.setAttribute('aria-disabled',String(!ready));canvas.style.touchAction=ready?'none':'auto';
    apply.disabled=!strokes.length&&!layers.some((l,i)=>i!==selected&&l.strokes.length);undo.disabled=!strokes.length;clear.disabled=!strokes.length;remove.disabled=!current?.recipe?.parameters?.extendedParameters?.manualMakeup;
    addLayer.disabled=layers.length>=8;upLayer.disabled=selected<=0;downLayer.disabled=selected>=layers.length-1;root.setAttribute('aria-busy',String(pending));}
  function ensure(){if(!permitted()||!binding||binding.signature!==sig(session.state)||binding.proxy!==session.proxy)throw Error('MANUAL_MAKEUP_DRAFT_STALE');}
  function number(n,min,max){if(n.value.trim()==='')throw Error('MANUAL_MAKEUP_CONTROLS_INVALID');const v=Number(n.value);if(!Number.isFinite(v)||v<min||v>max)throw Error('MANUAL_MAKEUP_CONTROLS_INVALID');return v;}
  function settings(next=strokes){
    if(!/^#[0-9a-f]{6}$/i.test(color.value))throw Error('MANUAL_MAKEUP_CONTROLS_INVALID');
    captureLayer();
    const saved=layers.map((layer,index)=>({...layer,strokes:index===selected?next:layer.strokes})).filter(layer=>layer.strokes.length);
    const result={schemaVersion:2,engineVersion:MANUAL_MAKEUP_LAYERS_VERSION,brushVersion:LOCAL_BRUSH_VERSION,layers:structuredClone(saved)};
    validateManualMakeup(result);return result;
  }
  function paint(){
    if(!base||!binding||disposed)return;
    let data=base.data.slice();
    if(strokes.length||layers.some((l,i)=>i!==selected&&l.strokes.length)){
      const value=settings();
      data=applyManualMakeup(base,value).data;
      if(mask.checked&&strokes.length){const coverage=rasterizeLocalBrushMask({width:base.width,height:base.height,strokes});
        for(let i=0;i<coverage.data.length;i++){const at=i*4;if(!data[at+3])continue;const a=coverage.data[i]/255*.6;data[at]=Math.round(data[at]*(1-a)+255*a);data[at+1]=Math.round(data[at+1]*(1-a));data[at+2]=Math.round(data[at+2]*(1-a)+160*a);}}
    }
    const image=context.createImageData(base.width,base.height);image.data.set(data);context.putImageData(image,0,0);
    // While dragging, only show a path guide. True coverage is drawn on release.
    if(active){context.save();context.strokeStyle='#00d5ff';context.fillStyle='#00d5ff';context.lineWidth=Math.max(1,base.width/400);context.beginPath();
      active.stroke.points.forEach((p,i)=>{if(i)context.lineTo(p.x*base.width,p.y*base.height);else context.moveTo(p.x*base.width,p.y*base.height);});context.stroke();context.restore();}
  }
  function schedule(){if(frameRequest!==null)return;frameRequest=document.defaultView.requestAnimationFrame(()=>{frameRequest=null;try{paint();}catch(e){status.textContent=`表示できません：${e.message}`;}});}
  function hydrate(){
    assertPixels(session.proxy);
    if(session.proxy.width>1600||session.proxy.height>1600)throw Error('MANUAL_MAKEUP_PROXY_REQUIRED');
    base={...session.proxy,data:session.proxy.data.slice()};canvas.width=base.width;canvas.height=base.height;
    const saved=current.recipe?.parameters?.extendedParameters?.manualMakeup;
    if(saved){validateManualMakeup(saved);layers=saved.schemaVersion===2?structuredClone(saved.layers):
      [{id:'legacy-layer',name:'既存メイク',strokes:structuredClone(saved.strokes),color:{...saved.color},opacity:saved.opacity}];}
    else{layers=[];layers.push(newLayer());}
    selectLayer(0);
    binding={signature:sig(current),proxy:session.proxy};paint();
  }
  function sync(value){if(disposed)return;current=value;const next=sig(value),changed=next!==signature||binding&&binding.proxy!==session.proxy;signature=next;
    if(changed||!permitted()){const lost=Boolean(active)||strokes.length>0;invalidate();if(lost&&!pending)status.textContent='画像・版・編集状態が変わったため下書きを破棄しました。';}
    if(permitted()&&!binding){try{hydrate();}catch(e){invalidate();status.textContent=`手塗りを開始できません：${e.message}`;}}
    controls();
  }
  function point(event){const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)throw Error('MANUAL_MAKEUP_CANVAS_GEOMETRY');
    const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('MANUAL_MAKEUP_POINT_OUTSIDE');return {x,y};}
  function stroke(p){return {points:[p],radius:number(radius,.1,50)/100,hardness:number(hardness,0,100)/100,mode:mode.value};}
  function append(value){ensure();const candidate=[...strokes,value];settings(candidate);const previous=strokes;strokes=candidate;
    try{paint();}catch(error){strokes=previous;paint();throw error;}status.textContent='未適用です。範囲と色を確認して「適用」を押してください。';controls();}
  on(canvas,'pointerdown',event=>{if(event.button!==0||active)return;try{ensure();event.preventDefault();active={pointerId:event.pointerId,stroke:stroke(point(event))};canvas.setPointerCapture(event.pointerId);schedule();}catch(e){status.textContent=e.message;stopStroke();}});
  on(canvas,'pointermove',event=>{if(!active||active.pointerId!==event.pointerId)return;try{ensure();event.preventDefault();const p=point(event),last=active.stroke.points.at(-1);
    if(Math.hypot((p.x-last.x)*base.width,(p.y-last.y)*base.height)<2)return;
    if(strokes.reduce((n,s)=>n+s.points.length,0)+active.stroke.points.length>=4096)throw Error('MANUAL_MAKEUP_POINT_LIMIT');active.stroke.points.push(p);schedule();
  }catch(e){status.textContent=e.message;stopStroke();schedule();}});
  on(canvas,'pointerup',event=>{if(!active||active.pointerId!==event.pointerId)return;const value=active.stroke;stopStroke();try{append(value);}catch(e){status.textContent=e.message;schedule();}});
  for(const name of ['pointercancel','lostpointercapture'])on(canvas,name,()=>{if(active){stopStroke();schedule();}});
  on(canvas,'keydown',event=>{try{ensure();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();keyboard.x=Math.max(0,Math.min(1,keyboard.x+(event.key==='ArrowRight' ? .01 : event.key==='ArrowLeft' ? -.01 : 0)));keyboard.y=Math.max(0,Math.min(1,keyboard.y+(event.key==='ArrowDown' ? .01 : event.key==='ArrowUp' ? -.01 : 0)));status.textContent=`指定位置 ${Math.round(keyboard.x*100)}%, ${Math.round(keyboard.y*100)}%。Enterで点を追加。`;}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();append(stroke({...keyboard}));}}catch(e){status.textContent=e.message;}});
  for(const n of [color,opacity,mask])on(n,'input',()=>{try{ensure();paint();status.textContent='未適用の表示を更新しました。';}catch(e){status.textContent=e.message;}});
  on(undo,'click',()=>{try{ensure();strokes.pop();paint();controls();}catch(e){status.textContent=e.message;}});
  on(clear,'click',()=>{try{ensure();stopStroke();strokes=[];paint();controls();}catch(e){status.textContent=e.message;}});
  on(layerSelect,'change',()=>{try{ensure();stopStroke();const index=Number(layerSelect.value);captureLayer();if(!layers[index])throw Error('MANUAL_MAKEUP_LAYER_INVALID');selectLayer(index);paint();controls();}catch(e){layerSelect.value=String(selected);status.textContent=e.message;}});
  on(layerName,'change',()=>{try{ensure();captureLayer();layerOptions();status.textContent='レイヤー名は未適用です。';}catch(e){status.textContent=e.message;}});
  on(addLayer,'click',()=>{try{ensure();stopStroke();captureLayer();if(layers.length>=8)throw Error('MANUAL_MAKEUP_LAYER_LIMIT');layers.push(newLayer());selectLayer(layers.length-1);paint();controls();}catch(e){status.textContent=e.message;}});
  on(deleteLayer,'click',()=>{try{ensure();stopStroke();layers.splice(selected,1);if(!layers.length)layers.push(newLayer());selectLayer(Math.min(selected,layers.length-1));paint();controls();status.textContent='削除は未適用です。空レイヤーは保存されません。全体解除は「解除」を使用してください。';}catch(e){status.textContent=e.message;}});
  const moveLayer=delta=>{try{ensure();stopStroke();captureLayer();const next=selected+delta;if(next<0||next>=layers.length)return;
    [layers[selected],layers[next]]=[layers[next],layers[selected]];selectLayer(next);paint();controls();}catch(e){status.textContent=e.message;}};
  on(upLayer,'click',()=>moveLayer(-1));on(downLayer,'click',()=>moveLayer(1));
  async function commit(removeValue){try{ensure();const value=removeValue?null:settings();stopStroke();pending=true;controls();await session.setManualMakeup(value);
      if(!disposed)status.textContent=removeValue?'手塗りを解除しました。保存は通常の保存操作で行ってください。':'手塗りを編集に適用しました。保存は通常の保存操作で行ってください。';
    }catch(e){if(!disposed)status.textContent=`適用できません：${e.message}`;}finally{pending=false;if(!disposed)sync(session.state);}}
  on(apply,'click',()=>{void commit(false);});on(remove,'click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(sync);
  return Object.freeze({refresh(){if(!disposed)sync(session.state);},dispose(){if(disposed)return;disposed=true;stopStroke();if(frameRequest!==null)document.defaultView.cancelAnimationFrame(frameRequest);unsubscribe?.();for(const off of listeners)off();root.remove();}});
}
