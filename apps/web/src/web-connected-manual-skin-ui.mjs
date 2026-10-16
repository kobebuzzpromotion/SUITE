import {applyManualSkin,validateManualSkin,MANUAL_SKIN_LAYERS_VERSION,LOCAL_BRUSH_VERSION} from './processing/manual-skin.mjs';
import {assertPixels} from './processing/pure.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';

export function mountWebConnectedManualSkin(container,{session,canUse=()=>false}={}){
  const doc=container?.ownerDocument;
  if(!doc?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('MANUAL_SKIN_UI_CONFIG');
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','手動範囲の肌補正');
  root.append(el('h3','手動範囲の肌補正'),el('p','未編集・回転Crop前の専用画像に、補正したい範囲を手で塗ります。肌や顔の自動認識はしません。実処理フレームは24MPまで。RAWの原寸書き出し制限は別に適用されます。'));
  const fields=el('fieldset');fields.append(el('legend','肌補正とブラシ'));
  const numeric=(label,value,min,max,step='1')=>{const l=el('label',label),n=el('input');n.type='number';n.value=String(value);n.min=String(min);n.max=String(max);n.step=step;l.append(n);fields.append(l);return n;};
  const smoothness=numeric('滑らかさ',25,0,100),texture=numeric('質感',0,-100,100),rosy=numeric('赤み',0,-100,100),radius=numeric('補正半径（原寸pixel）',5,1,32);
  const temperature=numeric('肌色温度（青←0→暖色）',0,-100,100),tint=numeric('色かぶり（緑←0→マゼンタ）',0,-100,100),radiance=numeric('明るさ',0,-100,100);
  const finishLabel=el('label','質感仕上げ'),finish=el('select');
  for(const [value,label] of [['natural','Natural（中立）'],['matte','Matte（つやを抑える）'],['satin','Satin（控えめなつや）'],['dewy','Dewy（つやを加える）']]){const option=el('option',label);option.value=value;finish.append(option);}finishLabel.append(finish);fields.append(finishLabel);
  const brushRadius=numeric('ブラシ半径（短辺の%）',5,.1,50,'.1'),hardness=numeric('ブラシ硬さ（%）',50,0,100);
  const mode=el('select');mode.setAttribute('aria-label','範囲を塗る・消す');for(const [v,label] of [['add','範囲を塗る'],['erase','範囲を消す']]){const n=el('option',label);n.value=v;mode.append(n);}fields.append(mode);
  const maskLabel=el('label','マスクを表示'),mask=el('input');mask.type='checkbox';mask.checked=true;maskLabel.append(mask);fields.append(maskLabel);
  const button=text=>{const n=el('button',text);n.type='button';fields.append(n);return n;};
  const undo=button('最後の線を戻す'),clear=button('下書きの線を消す'),apply=button('肌補正を適用'),remove=button('適用済み肌補正を解除');
  fields.append(el('p','名前付きレイヤーは最大8個、上から順に補正します。全体で64線・4096点・ブラシ処理量96Mを共有します。空レイヤーは保存しません。全削除する場合は「適用済み肌補正を解除」を押してください。'));
  const layerSelect=el('select');layerSelect.setAttribute('aria-label','肌補正レイヤー');fields.append(layerSelect);
  const nameLabel=el('label','選択レイヤー名'),layerName=el('input');layerName.type='text';layerName.maxLength=40;nameLabel.append(layerName);fields.append(nameLabel);
  const addLayer=button('レイヤー追加'),deleteLayer=button('選択レイヤー削除'),upLayer=button('順序を前へ'),downLayer=button('順序を後へ');
  const canvas=el('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','肌補正の範囲。矢印キーで位置移動、Enterで点を追加');canvas.style.cssText='display:block;width:100%;height:auto;max-width:800px;touch-action:none;cursor:crosshair;';
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('MANUAL_SKIN_CANVAS_UNAVAILABLE');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(fields,remove,canvas,el('p','マスク表示は選択レイヤーの範囲です。OFFにすると全レイヤーの補正結果を確認できます。ドラッグ中の青い線は経路です。離すと実マスクを更新します。「適用」で編集へ反映し、通常の保存操作で保存してください。半径はProxyへ縮尺変換するため、原寸とプレビューの画素一致は保証しません。'),status);container.append(root);
  let state,signature=null,binding=null,base=null,strokes=[],active=null,pending=false,disposed=false,raf=null,lastImage=null;
  let keyboard={x:.5,y:.5},optionalKeys=new Set();const listeners=[];
  let layers=[],selected=0;
  const newLayer=()=>({id:globalThis.crypto.randomUUID(),name:`肌補正${layers.length+1}`,strokes:[],smoothness:25,texture:0,rosy:0,radius:5});
  function layerOptions(){layerSelect.replaceChildren();layers.forEach((layer,index)=>{const option=el('option',`${index+1}. ${layer.name}`);option.value=String(index);layerSelect.append(option);});layerSelect.value=String(selected);}
  function selectLayer(index){selected=index;const layer=layers[index];strokes=layer.strokes;layerName.value=layer.name;
    for(const [key,input] of [['smoothness',smoothness],['texture',texture],['rosy',rosy],['radius',radius],['temperature',temperature],['tint',tint],['radiance',radiance]])input.value=String(layer[key]??0);
    finish.value=layer.finish??'natural';optionalKeys=new Set(['temperature','tint','radiance','finish'].filter(key=>Object.hasOwn(layer,key)));layerOptions();}
  function captureLayer(){const layer=layers[selected];if(!layer)return;const name=layerName.value.trim();
    if(!name||name.length>40||/[\u0000-\u001f\u007f]/.test(name))throw Error('MANUAL_SKIN_CONTROLS');
    const value={id:layer.id,name,strokes,smoothness:num(smoothness,0,100),texture:num(texture,-100,100),rosy:num(rosy,-100,100),radius:num(radius,1,32,true)};
    for(const [key,input] of [['temperature',temperature],['tint',tint],['radiance',radiance]]){const n=num(input,-100,100);if(n!==0||optionalKeys.has(key))value[key]=n;}
    if(!['natural','matte','satin','dewy'].includes(finish.value))throw Error('MANUAL_SKIN_CONTROLS');
    if(finish.value!=='natural'||optionalKeys.has('finish'))value.finish=finish.value;
    layers[selected]=value;
  }
  function hasStrokes(){return strokes.length>0||layers.some((layer,index)=>index!==selected&&layer.strokes.length>0);}
  const on=(n,t,f)=>{n.addEventListener(t,f);listeners.push(()=>n.removeEventListener(t,f));};
  const sig=s=>JSON.stringify([s?.asset?.id,s?.asset?.sha256,s?.revision,s?.recipe,s?.afterURL]);
  function available(){try{return !disposed&&!pending&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setManualSkin==='function';}catch{return false;}}
  function stop(){const a=active;active=null;if(a&&canvas.hasPointerCapture?.(a.id))canvas.releasePointerCapture(a.id);}
  function invalidate(){stop();binding=null;base=null;strokes=[];layers=[];selected=0;layerSelect.replaceChildren();lastImage=null;ctx.clearRect(0,0,canvas.width,canvas.height);}
  function controls(){fields.disabled=!available()||!binding;canvas.setAttribute('aria-disabled',String(fields.disabled));canvas.style.touchAction=fields.disabled?'auto':'none';apply.disabled=!hasStrokes();undo.disabled=!strokes.length;clear.disabled=!strokes.length;remove.disabled=!available()||!state?.recipe?.parameters?.extendedParameters?.manualSkin;addLayer.disabled=layers.length>=8;upLayer.disabled=selected<=0;downLayer.disabled=selected>=layers.length-1;root.setAttribute('aria-busy',String(pending));}
  function ensure(){if(!available()||!binding||binding.signature!==sig(session.state)||binding.proxy!==session.proxy)throw Error('MANUAL_SKIN_DRAFT_STALE');}
  function num(n,min,max,integer=false){if(n.value.trim()==='')throw Error('MANUAL_SKIN_CONTROLS');const value=Number(n.value);if(!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw Error('MANUAL_SKIN_CONTROLS');return value;}
  function settings(list=strokes){captureLayer();const saved=layers.map((layer,index)=>({...layer,strokes:index===selected?list:layer.strokes})).filter(layer=>layer.strokes.length);
    if(!saved.length)throw Error('MANUAL_SKIN_USE_REMOVE_FOR_EMPTY');
    const value={schemaVersion:2,engineVersion:MANUAL_SKIN_LAYERS_VERSION,brushVersion:LOCAL_BRUSH_VERSION,layers:structuredClone(saved)};
    validateManualSkin(value);return value;}
  function guide(){if(!lastImage||disposed)return;ctx.putImageData(lastImage,0,0);if(active){ctx.save();ctx.strokeStyle='#00d5ff';ctx.lineWidth=Math.max(1,base.width/400);ctx.beginPath();active.stroke.points.forEach((p,i)=>{if(i)ctx.lineTo(p.x*base.width,p.y*base.height);else ctx.moveTo(p.x*base.width,p.y*base.height);});ctx.stroke();ctx.restore();}}
  function paint(){if(!binding||!base||disposed)return;let data=base.data.slice();
    captureLayer();
    if(hasStrokes()){const value=settings();if(mask.checked&&strokes.length){const coverage=rasterizeLocalBrushMask({width:base.width,height:base.height,strokes});
      for(let i=0;i<coverage.data.length;i++){const at=i*4;if(!data[at+3])continue;const a=coverage.data[i]/255*.6;data[at]=Math.round(data[at]*(1-a)+255*a);data[at+1]=Math.round(data[at+1]*(1-a));data[at+2]=Math.round(data[at+2]*(1-a)+170*a);}}
      else if(!mask.checked)data=applyManualSkin(base,value).data;}
    lastImage=ctx.createImageData(base.width,base.height);lastImage.data.set(data);guide();
  }
  function schedule(){if(raf!==null)return;raf=doc.defaultView.requestAnimationFrame(()=>{raf=null;guide();});}
  function hydrate(){assertPixels(session.proxy);if(session.proxy.width>1600||session.proxy.height>1600)throw Error('MANUAL_SKIN_PROXY_REQUIRED');
    base={...session.proxy,data:session.proxy.data.slice()};canvas.width=base.width;canvas.height=base.height;
    const saved=state.recipe?.parameters?.extendedParameters?.manualSkin;
    if(saved){validateManualSkin(saved);if(saved.schemaVersion===2)layers=structuredClone(saved.layers);
      else{const {schemaVersion,engineVersion,brushVersion,...settings}=structuredClone(saved);layers=[{id:'legacy-skin',name:'既存肌補正',...settings}];}}
    else{layers=[];layers.push(newLayer());}selectLayer(0);
    binding={signature:sig(state),proxy:session.proxy};paint();
  }
  function sync(value){if(disposed)return;state=value;const next=sig(value),changed=next!==signature||binding&&binding.proxy!==session.proxy;signature=next;
    if(changed||!available()){const lost=Boolean(active)||hasStrokes();invalidate();if(lost&&!pending)status.textContent='画像・版・編集状態が変わったため下書きを破棄しました。';}
    if(available()&&!binding)try{hydrate();}catch(e){invalidate();status.textContent=e.message;}controls();
  }
  function point(event){const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
    if(r.width<=0||r.height<=0||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('MANUAL_SKIN_POINT_OUTSIDE');return {x,y};}
  function stroke(p){return {points:[p],radius:num(brushRadius,.1,50)/100,hardness:num(hardness,0,100)/100,mode:mode.value};}
  function append(s){ensure();const previous=strokes,next=[...strokes,s];settings(next);strokes=next;try{paint();}catch(e){strokes=previous;paint();throw e;}status.textContent='未適用です。範囲と補正値を確認して適用してください。';controls();}
  on(canvas,'pointerdown',event=>{if(event.button!==0||active)return;try{ensure();event.preventDefault();active={id:event.pointerId,stroke:stroke(point(event))};canvas.setPointerCapture(event.pointerId);schedule();}catch(e){stop();status.textContent=e.message;}});
  on(canvas,'pointermove',event=>{if(!active||active.id!==event.pointerId)return;try{ensure();event.preventDefault();const p=point(event),last=active.stroke.points.at(-1);if(Math.hypot((p.x-last.x)*base.width,(p.y-last.y)*base.height)<2)return;
    if(layers.reduce((sum,layer,index)=>sum+(index===selected?strokes:layer.strokes).reduce((n,s)=>n+s.points.length,0),0)+active.stroke.points.length>=4096)throw Error('MANUAL_SKIN_POINT_LIMIT');active.stroke.points.push(p);schedule();}catch(e){stop();status.textContent=e.message;schedule();}});
  on(canvas,'pointerup',event=>{if(!active||active.id!==event.pointerId)return;const s=active.stroke;stop();try{append(s);}catch(e){status.textContent=e.message;schedule();}});
  for(const name of ['pointercancel','lostpointercapture'])on(canvas,name,()=>{if(active){stop();schedule();}});
  on(canvas,'keydown',event=>{try{ensure();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();keyboard.x=Math.max(0,Math.min(1,keyboard.x+(event.key==='ArrowRight' ? .01 : event.key==='ArrowLeft' ? -.01 : 0)));keyboard.y=Math.max(0,Math.min(1,keyboard.y+(event.key==='ArrowDown' ? .01 : event.key==='ArrowUp' ? -.01 : 0)));status.textContent=`位置 ${Math.round(keyboard.x*100)}%, ${Math.round(keyboard.y*100)}%。Enterで点を追加。`;}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();append(stroke({...keyboard}));}}catch(e){status.textContent=e.message;}});
  for(const n of [smoothness,texture,rosy,radius,temperature,tint,radiance,finish,mask])on(n,'input',()=>{try{ensure();paint();}catch(e){status.textContent=e.message;}});
  on(undo,'click',()=>{try{ensure();strokes.pop();paint();controls();}catch(e){status.textContent=e.message;}});
  on(clear,'click',()=>{try{ensure();stop();strokes=[];paint();controls();}catch(e){status.textContent=e.message;}});
  on(layerSelect,'change',()=>{try{ensure();stop();const index=Number(layerSelect.value);captureLayer();if(!Number.isInteger(index)||!layers[index])throw Error('MANUAL_SKIN_LAYER_INVALID');selectLayer(index);paint();controls();}catch(e){layerSelect.value=String(selected);status.textContent=e.message;}});
  on(layerName,'change',()=>{try{ensure();captureLayer();layerOptions();status.textContent='レイヤー名は未適用です。';}catch(e){status.textContent=e.message;}});
  on(addLayer,'click',()=>{try{ensure();stop();captureLayer();if(layers.length>=8)throw Error('MANUAL_SKIN_LAYER_LIMIT');layers.push(newLayer());selectLayer(layers.length-1);paint();controls();}catch(e){status.textContent=e.message;}});
  on(deleteLayer,'click',()=>{try{ensure();stop();layers.splice(selected,1);if(!layers.length)layers.push(newLayer());selectLayer(Math.min(selected,layers.length-1));paint();controls();status.textContent='削除は未適用です。空レイヤーは保存しません。全体を削除する場合は「適用済み肌補正を解除」を押してください。';}catch(e){status.textContent=e.message;}});
  function moveLayer(delta){try{ensure();stop();captureLayer();const next=selected+delta;if(next<0||next>=layers.length)return;[layers[selected],layers[next]]=[layers[next],layers[selected]];selectLayer(next);paint();controls();}catch(e){status.textContent=e.message;}}
  on(upLayer,'click',()=>moveLayer(-1));on(downLayer,'click',()=>moveLayer(1));
  async function commit(clearValue){try{if(clearValue){if(!available()||signature!==sig(session.state))throw Error('MANUAL_SKIN_DRAFT_STALE');}else ensure();
    const value=clearValue?null:settings();if(value)applyManualSkin(base,value);stop();pending=true;controls();await session.setManualSkin(value);
    if(!disposed)status.textContent=clearValue?'肌補正を解除しました。':'肌補正を編集へ適用しました。通常の保存操作で保存してください。';
  }catch(e){if(!disposed)status.textContent=`適用できません：${e.message}`;}finally{pending=false;if(!disposed)sync(session.state);}}
  on(apply,'click',()=>{void commit(false);});on(remove,'click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(sync);
  return Object.freeze({refresh(){if(!disposed)sync(session.state);},dispose(){if(disposed)return;disposed=true;stop();if(raf!==null)doc.defaultView.cancelAnimationFrame(raf);unsubscribe?.();for(const off of listeners)off();root.remove();}});
}
