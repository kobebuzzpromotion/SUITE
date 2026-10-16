import {validateWebManualLiquify,applyWebManualLiquify} from './processing/web-manual-liquify.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';

const empty=()=>({schemaVersion:1,engineVersion:'suite-web-manual-liquify-1',operations:[],freezeStrokes:[]});
const clone=value=>structuredClone(value);
const MAX_PIXELS=8_000_000;

/** Original-Proxy authoring only. The Session owns certified render/commit/Undo. */
export function mountWebManualLiquify(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('LIQUIFY_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.append(el('h3','手動ゆがみ補正'),el('p','AIを使わず、未編集の原Proxy上で位置を指定します。右の通常After上には描きません。既存のメイク・マスクブラシは別の操作として維持します。原本は変更しません。'));
  const fields=el('fieldset'),tool=el('select'),toolLabel=el('label','操作 ');
  for(const [value,label] of [['translate','移動（ドラッグ）'],['scale','拡大・縮小（クリック）'],['scaleX','横方向だけ拡大・縮小（クリック）'],['scaleY','縦方向だけ拡大・縮小（クリック）'],['rotate','回転（クリック）'],['restore','部分的に元の位置へ戻す（クリック）'],['freeze','固定ブラシ'],['erase-freeze','固定を消すブラシ']]){const option=el('option',label);option.value=value;tool.append(option);}toolLabel.append(tool);fields.append(toolLabel);
  const numeric=(label,min,max,step,value)=>{const wrap=el('label',label),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);wrap.append(input);fields.append(wrap);return input;};
  const radius=numeric('半径（画像短辺に対する比率）',.001,.5,.001,.12),strength=numeric('移動の強さ',0,1,.05,.5),scale=numeric('拡縮量（−縮小 / ＋拡大、横・縦も共通）',-1,1,.05,.2),angle=numeric('回転角（最大±30度）',-30,30,1,5),restore=numeric('部分復元量（0:変更なし / 1:最大）',0,1,.05,.5),hardness=numeric('固定ブラシの硬さ',0,1,.05,.5);
  const cx=numeric('中心 X（左上0 / 右下1）',0,1,.01,.5),cy=numeric('中心 Y',0,1,.01,.5),dx=numeric('数値移動 X（半径比）',-1,1,.05,0),dy=numeric('数値移動 Y（半径比）',-1,1,.05,0);
  fields.append(el('p','移動は弱い局所変形です。ドラッグの強さ1でも実移動はドラッグ量の最大18%で、1回のドラッグは半径以内にしてください。拡縮・回転も中心から離れるほど弱くなります。横・縦の拡縮は原Proxyの軸方向です。部分復元は指定領域の変位を元の位置へ近づける操作で、AI修復ではありません。数値中心を使う場合は「数値位置に操作を追加」。固定ブラシは色の濃さで変形量を混ぜず、少しでも塗られた画素を固定します。青い領域が固定対象です。'));
  const buttons={};for(const [name,label] of [['add','数値位置に操作を追加'],['undo','最後の下書き操作を取り消す'],['draftReset','下書きを保存済み状態へ戻す'],['clearFreeze','固定ブラシを全解除（下書き）'],['preview','下書きのProxyを確認'],['apply','このゆがみを適用'],['clear','適用済みのゆがみを解除']]){const button=el('button',label);button.type='button';buttons[name]=button;fields.append(button);}
  const count=el('p'),limit=el('p'),status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const sourceLabel=el('p','操作面：未編集の原Proxy（線と固定領域は操作ガイド）'),canvas=el('canvas'),previewLabel=el('p','下書き確認（現在のAfterやFinalには未適用）'),preview=el('canvas');
  for(const view of [canvas,preview]){view.style.maxWidth='100%';view.style.height='auto';}canvas.style.touchAction='none';canvas.setAttribute('aria-label','手動ゆがみの原Proxy操作面');preview.hidden=true;previewLabel.hidden=true;
  root.append(fields,count,limit,sourceLabel,canvas,previewLabel,preview,el('p','最大128操作、固定ブラシ64本・合計4096点。折返しや境界の安全条件を満たさない変形は、適用全体を拒否します。処理対象の実画像は8MPまでです。Proxyが小さくても、原寸Finalが8MPを超える写真のFinal対応を意味しません。'),status);container.append(root);
  let state=null,key=null,proxy=null,draft=empty(),saved=empty(),history=[],dirty=false,invalid=false,pending=false,disposed=false,gesture=null,generation=0;
  const permitted=()=>{try{return !disposed&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setWebManualLiquify==='function';}catch{return false;}};
  const frameReady=()=>proxy&&Number.isSafeInteger(proxy.width)&&Number.isSafeInteger(proxy.height)&&proxy.width>0&&proxy.height>0&&proxy.width*proxy.height<=MAX_PIXELS&&proxy.data?.length===proxy.width*proxy.height*4;
  function controls(){fields.disabled=pending||!permitted();const ready=frameReady()&&!invalid;
    for(const name of ['add','preview','apply','clearFreeze'])buttons[name].disabled=!ready;
    buttons.undo.disabled=!history.length||!ready;buttons.draftReset.disabled=invalid||!dirty;
    count.textContent=`変形 ${draft.operations.length} / 128 · 固定 ${draft.freezeStrokes.length} / 64${dirty?' · 未適用':''}`;
    canvas.style.cursor=permitted()&&ready&&!pending?'crosshair':'default';root.setAttribute('aria-busy',String(pending));
  }
  function number(input){const value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max))throw Error('数値の範囲を確認してください。');return value;}
  function paint(view,frame){view.width=frame.width;view.height=frame.height;const context=view.getContext('2d');if(!context)throw Error('LIQUIFY_CANVAS_UNAVAILABLE');const image=context.createImageData(frame.width,frame.height);image.data.set(frame.data);context.putImageData(image,0,0);return context;}
  function hidePreview(){preview.hidden=true;previewLabel.hidden=true;preview.width=preview.height=1;}
  function draw(){if(!frameReady()){canvas.width=canvas.height=1;return;}const context=paint(canvas,proxy);
    if(draft.freezeStrokes.length){const mask=rasterizeLocalBrushMask({width:proxy.width,height:proxy.height,strokes:draft.freezeStrokes}).data;const overlay=context.createImageData(proxy.width,proxy.height);for(let i=0;i<mask.length;i++){overlay.data[i*4]=40;overlay.data[i*4+1]=150;overlay.data[i*4+2]=255;overlay.data[i*4+3]=mask[i]?89:0;}const layer=el('canvas');layer.width=proxy.width;layer.height=proxy.height;layer.getContext('2d').putImageData(overlay,0,0);context.drawImage(layer,0,0);layer.width=layer.height=1;}
    context.strokeStyle='#ffce38';context.lineWidth=Math.max(1,proxy.width/700);for(const operation of draft.operations){const x=operation.center.x*proxy.width,y=operation.center.y*proxy.height;context.beginPath();context.ellipse(x,y,operation.rx*proxy.width,operation.ry*proxy.height,0,0,Math.PI*2);context.stroke();if(operation.type==='translate'){context.beginPath();context.moveTo(x,y);context.lineTo(x+operation.dx*operation.rx*proxy.width,y+operation.dy*operation.ry*proxy.height);context.stroke();}}
  }
  function change(candidate){validateWebManualLiquify(candidate);history.push(clone(draft));if(history.length>128)history.shift();draft=candidate;dirty=true;hidePreview();draw();status.textContent='下書きへ追加しました。確認して明示適用してください。';controls();}
  function operation(point,end){const fraction=number(radius),r=fraction*Math.min(proxy.width,proxy.height),rx=r/proxy.width,ry=r/proxy.height;if(r<1)throw Error('半径はProxy上で1画素以上にしてください。');const type=tool.value;
    if(type==='freeze'||type==='erase-freeze')return {stroke:{points:[point],radius:fraction,hardness:number(hardness),mode:type==='freeze'?'add':'erase'}};
    const value={type,center:point,rx,ry,amount:0,dx:0,dy:0,angle:0};
    if(type==='translate'){value.dx=(end?(end.x-point.x)/rx:number(dx))*number(strength);value.dy=(end?(end.y-point.y)/ry:number(dy))*number(strength);if(Math.abs(value.dx)>1||Math.abs(value.dy)>1)throw Error('ドラッグが長すぎます。半径以内の短い移動に分けてください。');}
    else if(['scale','scaleX','scaleY'].includes(type))value.amount=number(scale);else if(type==='restore')value.amount=number(restore);else if(type==='rotate')value.angle=number(angle)/30;else throw Error('LIQUIFY_TOOL_INVALID');return {operation:value};
  }
  function add(point,end){const next=clone(draft),result=operation(point,end);if(result.stroke)next.freezeStrokes.push(result.stroke);else next.operations.push(result.operation);change(next);}
  function point(event){const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)throw Error('LIQUIFY_CANVAS_LAYOUT');const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;if(x<0||x>1||y<0||y>1)throw Error('画像の内側で操作してください。');return {x,y};}
  function cancelGesture(){if(gesture){try{canvas.releasePointerCapture(gesture.id);}catch{}gesture=null;}}
  canvas.addEventListener('pointerdown',event=>{if(pending||!permitted()||!frameReady()||invalid||event.button!==0||gesture)return;event.preventDefault();event.stopPropagation();try{const start=point(event),result=operation(start,start);gesture={id:event.pointerId,start,token:generation,stroke:result.stroke};canvas.setPointerCapture(event.pointerId);}catch(error){status.textContent=error.message;cancelGesture();}});
  canvas.addEventListener('pointermove',event=>{if(!gesture||gesture.id!==event.pointerId)return;event.preventDefault();if(!permitted()||pending||gesture.token!==generation){cancelGesture();return;}if(gesture.stroke){try{const p=point(event),last=gesture.stroke.points.at(-1);if(Math.hypot((p.x-last.x)*proxy.width,(p.y-last.y)*proxy.height)<2)return;if(gesture.stroke.points.length+draft.freezeStrokes.reduce((n,s)=>n+s.points.length,0)>=4096)throw Error('固定ブラシは合計4096点までです。');gesture.stroke.points.push(p);}catch(error){status.textContent=error.message;cancelGesture();}}});
  canvas.addEventListener('pointerup',event=>{const current=gesture;if(!current||current.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();cancelGesture();if(!permitted()||pending||current.token!==generation)return;try{if(current.stroke){const next=clone(draft);next.freezeStrokes.push(current.stroke);change(next);}else add(current.start,point(event));}catch(error){status.textContent=error.message;}});
  canvas.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',()=>{gesture=null;});
  function synchronize(value){if(disposed)return;state=value;const next=JSON.stringify([value?.asset?.id,value?.asset?.sha256,value?.revision,value?.recipe,value?.busy,value?.exporting,permitted()]);
    if(key!==next||proxy!==session.proxy){const lost=dirty;key=next;generation++;cancelGesture();proxy=session.proxy;history=[];dirty=false;invalid=false;hidePreview();
      try{const stored=value?.recipe?.parameters?.extendedParameters?.webManualLiquify;saved=stored===undefined?empty():clone(stored);validateWebManualLiquify(saved);draft=clone(saved);draw();status.textContent=lost?'写真・Recipe・権限や処理状態が変わったため下書きを破棄しました。':'';}catch(error){invalid=true;draft=empty();saved=empty();canvas.width=canvas.height=1;status.textContent=`保存設定または操作面を表示できません。明示解除は可能です: ${error.message}`;}
      const w=proxy?.sourceWidth??value?.asset?.width??proxy?.width,h=proxy?.sourceHeight??value?.asset?.height??proxy?.height;limit.textContent=!frameReady()?'8MP以下の原Proxyが必要です。':w*h>MAX_PIXELS?'原寸が8MPを超えています。Proxy編集のみ。原寸Finalはこのゆがみ処理の上限外です。':'Proxy確認と原寸Finalは別に安全条件を検証します。';
    }controls();
  }
  const action=fn=>()=>{if(disposed||pending||!permitted())return;try{fn();}catch(error){status.textContent=error.message;}controls();};
  buttons.add.addEventListener('click',action(()=>add({x:number(cx),y:number(cy)})));
  buttons.undo.addEventListener('click',action(()=>{if(!history.length)return;draft=history.pop();dirty=true;hidePreview();draw();status.textContent='最後の下書き操作を取り消しました。';}));
  buttons.draftReset.addEventListener('click',action(()=>{draft=clone(saved);history=[];dirty=false;hidePreview();draw();status.textContent='保存済みの設定へ戻しました。';}));
  buttons.clearFreeze.addEventListener('click',action(()=>{const next=clone(draft);next.freezeStrokes=[];change(next);}));
  buttons.preview.addEventListener('click',action(()=>{if(!frameReady()||invalid)return;const output=applyWebManualLiquify(proxy,draft);paint(preview,output.pixels);preview.hidden=false;previewLabel.hidden=false;status.textContent='下書きProxyの安全条件を確認しました。原寸Finalの検証結果ではありません。';}));
  tool.addEventListener('change',cancelGesture);
  async function commit(clear){if(disposed||pending||!permitted()||!clear&&(!frameReady()||invalid))return;const value=clear?null:clone(draft);try{if(value)validateWebManualLiquify(value);}catch(error){status.textContent=error.message;return;}const asset=state.asset.id,sha=state.asset.sha256;pending=true;cancelGesture();controls();
    try{await session.setWebManualLiquify(value);if(!disposed&&state?.asset?.id===asset&&state?.asset?.sha256===sha&&permitted()&&JSON.stringify(state?.recipe?.parameters?.extendedParameters?.webManualLiquify??null)===JSON.stringify(value)){key=null;synchronize(session.state??state);status.textContent=clear?'適用済みのゆがみを解除しました。Recipeを保存してください。':'適用しました。Recipeを保存してください。';}}
    catch(error){if(!disposed&&state?.asset?.id===asset&&state?.asset?.sha256===sha&&permitted())status.textContent=`適用できませんでした。折返し・境界条件を満たさない変形は全体が拒否されます: ${error.message}`;}
    finally{pending=false;if(!disposed)controls();}
  }
  buttons.apply.addEventListener('click',()=>{void commit(false);});buttons.clear.addEventListener('click',()=>{void commit(true);});const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??state);},dispose(){if(disposed)return;disposed=true;generation++;cancelGesture();if(typeof unsubscribe==='function')unsubscribe();proxy=null;history=[];draft=empty();canvas.width=canvas.height=preview.width=preview.height=1;root.remove();}});
}
