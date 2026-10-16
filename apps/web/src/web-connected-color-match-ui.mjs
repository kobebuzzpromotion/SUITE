const MAX_BYTES=32*1024*1024,MAX_PIXELS=24_000_000;
// Bound decoded source dimensions before invoking browser codecs. SVG/RAW and
// unrecognized formats are deliberately excluded; MIME/filename is not evidence.
function imageHeader(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width,height,type;
  if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)&&view.getUint32(8)===13&&view.getUint32(12)===0x49484452){width=view.getUint32(16);height=view.getUint32(20);type='image/png';}
  else if(bytes[0]===255&&bytes[1]===216){
    let offset=2;while(offset+3<bytes.length){if(bytes[offset++]!==255)throw Error('REFERENCE_JPEG_HEADER');while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;if(offset+2>bytes.length)break;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)break;height=view.getUint16(offset+3);width=view.getUint16(offset+5);type='image/jpeg';break;}offset+=length;}
  }
  if(!type||!width||!height||width*height>MAX_PIXELS)throw Error('REFERENCE_FORMAT_OR_DIMENSIONS');return {width,height,type};
}

export function mountWebConnectedColorMatch(container,{session,canUse=()=>false,getBatchTargets}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function'||getBatchTargets!==undefined&&typeof getBatchTargets!=='function')throw Error('COLOR_MATCH_PANEL_CONFIG');
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','参照画像の色合わせ');root.append(el('h3','参照画像の色合わせ'),el('p','画像全体の色分布を近似する処理で、AIではありません。参照画像はアップロードしません。JPEG/PNGのみ、32 MiB・24MP以下。EXIFの向きを反映し、長辺1024px以下で推定します。RAW/ICCの厳密な色再現ではありません。'));
  const fields=el('fieldset');fields.append(el('legend','ローカル参照画像'));
  const label=el('label','JPEG / PNG'),file=el('input');file.type='file';file.accept='image/jpeg,image/png,.jpg,.jpeg,.png';label.append(file);fields.append(label);
  const amountLabel=el('label','適用量（0〜1）'),amount=el('input');amount.type='number';amount.min='0';amount.max='1';amount.step='.01';amount.value='1';amountLabel.append(amount);fields.append(amountLabel);
  fields.append(el('p','以下は推定に使う領域です。補正は写真全体へ適用します。座標は左上を原点とする0〜1の割合で、未指定時は全体を使います。'));
  const regions=new Map();
  for(const [key,title] of [['sourceRegion','元写真：未編集Before（原Proxy）'],['referenceRegion','参照画像：EXIFの向きを補正した後の画像']]){
    const group=el('fieldset');group.append(el('legend',title));const checkLabel=el('label','推定領域を指定する'),enabled=el('input');enabled.type='checkbox';checkLabel.prepend(enabled);group.append(checkLabel);const inputs={};
    for(const [name,labelText,initial] of [['x','左位置',0],['y','上位置',0],['width','幅',1],['height','高さ',1]]){const label=el('label',labelText),input=el('input');input.type='number';input.min='0';input.max='1';input.step='.01';input.value=String(initial);label.append(input);group.append(label);inputs[name]=input;}
    regions.set(key,{enabled,inputs});fields.append(group);
  }
  const button=text=>{const n=el('button',text);n.type='button';fields.append(n);return n;};
  const estimate=button('参照色を推定'),apply=button('推定結果を適用'),reset=button('参照色合わせをリセット');
  const batch=button('選択写真へ個別に色合わせして保存');
  const batchHelp=el('p','一括は全体推定のみです。現在写真以外の選択写真（2〜20枚）を個別に推定し、各Recipeを自動保存します。キャッシュ済み原Proxyがない写真は拒否し、原本をダウンロードしません。取消前の保存は取り消しません。');
  const cancelBatch=el('button','一括処理を取消');cancelBatch.type='button';cancelBatch.disabled=true;
  const batchResult=el('div');batchResult.setAttribute('role','status');batchResult.setAttribute('aria-live','polite');
  const result=el('p','未推定'),status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(fields,result,status);container.append(root);
  root.append(batchHelp,cancelBatch,batchResult);
  let current=null,signature=null,proposal=null,referencePixels=null,pending=false,disposed=false,generation=0,batchController=null;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true;}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();estimate.disabled=!file.files?.length||typeof session.proposeSceneMatch!=='function';apply.disabled=!proposal||typeof session.applyProposedSceneMatch!=='function';reset.disabled=typeof session.resetSceneMatch!=='function';const regional=[...regions.values()].some(region=>region.enabled.checked);batch.disabled=!proposal||!referencePixels||regional||typeof getBatchTargets!=='function'||typeof session.batchMatchScene!=='function';batch.title=regional?'一括は全体推定のみです。領域指定を解除して再推定してください。':'';cancelBatch.disabled=disposed||!batchController||batchController.signal.aborted;for(const region of regions.values())for(const input of Object.values(region.inputs))input.disabled=!region.enabled.checked;root.setAttribute('aria-busy',String(pending));}
  function regionOptions(){const options={};for(const [key,{enabled,inputs}] of regions){if(!enabled.checked)continue;const value={};for(const [name,input] of Object.entries(inputs)){const number=Number(input.value);if(input.value.trim()===''||!Number.isFinite(number)||number<0||number>1){input.focus();throw Error('REFERENCE_REGION_RANGE');}value[name]=number;}if(value.width<=0||value.height<=0||value.x+value.width>1||value.y+value.height>1)throw Error('REFERENCE_REGION_BOUNDS');options[key]=value;}return options;}
  function invalidate(){generation++;proposal=null;referencePixels=null;batchController?.abort();result.textContent='未推定';}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null,value?.beforeURL??null,value?.afterURL??null]);if(next!==signature){const lost=Boolean(proposal)||Boolean(file.files?.length);signature=next;invalidate();file.value='';for(const region of regions.values()){region.enabled.checked=false;for(const [key,input] of Object.entries(region.inputs))input.value=key==='width'||key==='height'?'1':'0';}if(lost)status.textContent='画像またはRecipeが変わったため、参照選択・領域・未適用の推定を破棄しました。';}controls();}
  file.addEventListener('change',()=>{invalidate();status.textContent='参照を選択しました。推定はまだ実行していません。';controls();});
  amount.addEventListener('input',()=>{invalidate();status.textContent='適用量を変更したため再推定が必要です。';controls();});
  for(const region of regions.values()){
    const changed=()=>{invalidate();status.textContent='推定領域を変更したため再推定が必要です。';controls();};
    region.enabled.addEventListener('change',changed);for(const input of Object.values(region.inputs))input.addEventListener('input',changed);
  }
  estimate.addEventListener('click',async()=>{
    if(disposed||pending||!permitted()||estimate.disabled)return;const selected=file.files?.[0],value=Number(amount.value);
    if(!selected||!Number.isSafeInteger(selected.size)||selected.size<1||selected.size>MAX_BYTES||amount.value.trim()===''||!Number.isFinite(value)||value<0||value>1){status.textContent='32 MiB以下の画像と、0〜1の適用量を指定してください。';return;}
    let selectedRegions;try{selectedRegions=regionOptions();}catch{status.textContent='領域は0〜1の範囲で、幅・高さを0より大きくし、右端・下端が1を超えないよう指定してください。';return;}
    invalidate();const token=generation;pending=true;controls();let bitmap,canvas;
    const active=()=>!disposed&&token===generation&&permitted();
    try{const buffer=await selected.arrayBuffer();if(!active())return;if(buffer.byteLength!==selected.size)throw Error('REFERENCE_SIZE_CHANGED');const header=imageHeader(new Uint8Array(buffer));
      const view=document.defaultView;if(typeof view?.createImageBitmap!=='function')throw Error('REFERENCE_CODEC_UNAVAILABLE');
      // One-axis resize preserves aspect ratio after browser EXIF orientation.
      // The source pixel cap also bounds portrait/panorama intermediate sizes.
      bitmap=await view.createImageBitmap(new view.Blob([buffer],{type:header.type}),{imageOrientation:'from-image',premultiplyAlpha:'none',colorSpaceConversion:'default',resizeWidth:Math.min(1024,header.width,header.height),resizeQuality:'high'});
      if(!active())return;if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>MAX_PIXELS)throw Error('REFERENCE_DECODE_LIMIT');
      const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));canvas=el('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});if(!context)throw Error('REFERENCE_CANVAS');context.drawImage(bitmap,0,0,width,height);
      const pixels={width,height,data:context.getImageData(0,0,width,height).data};const next=await session.proposeSceneMatch(pixels,{amount:value,...selectedRegions});if(!active())return;
      if(!next?.binding||!next.settings||['scale','offset'].some(key=>!Array.isArray(next.settings[key])||next.settings[key].length!==3||next.settings[key].some(n=>!Number.isFinite(n))))throw Error('REFERENCE_PROPOSAL');proposal=next;referencePixels=pixels;
      result.textContent=`参照 ${width} × ${height}px ／ RGB倍率 ${next.settings.scale.map(n=>n.toFixed(3)).join(', ')} ／ RGBオフセット ${next.settings.offset.map(n=>n.toFixed(3)).join(', ')}`;status.textContent='未適用です。近似結果を明示適用してください。';
    }catch{if(!disposed&&token===generation){proposal=null;status.textContent='推定できませんでした。JPEG/PNG形式・画像寸法・ブラウザのデコード対応・現在のRecipeを確認してください。';}}
    finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}pending=false;if(!disposed)controls();}
  });
  async function commit(clear){if(disposed||pending||!permitted()||!clear&&!proposal)return;const value=proposal,assetID=current.asset.id;pending=true;controls();try{if(clear)await session.resetSceneMatch();else await session.applyProposedSceneMatch(value);if(!disposed&&current?.asset?.id===assetID){invalidate();status.textContent=clear?'参照色合わせをリセットしました。':'参照色合わせを適用しました。Recipe保存は既存の保存操作で行ってください。';}}catch{if(!disposed){invalidate();status.textContent='適用できませんでした。再推定してやり直してください。';}}finally{pending=false;if(!disposed)controls();}}
  apply.addEventListener('click',()=>{void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  cancelBatch.addEventListener('click',()=>{batchController?.abort();batchResult.textContent='取消を要求しました。保存済み結果は取り消されません。結果の返却を待っています。';controls();});
  batch.addEventListener('click',async()=>{
    if(disposed||pending||!permitted()||batch.disabled)return;
    const token=generation,pixels=referencePixels,value=proposal.settings.amount;
    const controller=new (document.defaultView?.AbortController??globalThis.AbortController)();batchController=controller;pending=true;batchResult.textContent='選択写真を確認しています…';controls();
    try{
      const ids=await getBatchTargets();if(disposed)return;if(token!==generation||controller.signal.aborted){batchResult.textContent='対象確認中に中断しました。一括保存は開始していません。';return;}if(!permitted())throw Error('SCENE_MATCH_BATCH_NOT_PERMITTED');
      if(!Array.isArray(ids)||ids.length<2||ids.length>20||ids.some(id=>typeof id!=='string'||!id||id===current.asset.id)||new Set(ids).size!==ids.length)throw Error('SCENE_MATCH_BATCH_TARGETS');
      batchResult.textContent='写真ごとに推定・保存しています…';
      const report=await session.batchMatchScene(ids,{referencePixels:pixels,amount:value,signal:controller.signal});if(disposed)return;
      if(!report||!['complete','partial','failed'].includes(report.status)||!Array.isArray(report.results)||report.results.length!==ids.length||new Set(report.results.map(row=>row.assetId)).size!==ids.length||report.results.some(row=>!ids.includes(row.assetId)||!['saved','conflict','failed','unverified'].includes(row.status))||report.saved!==report.results.filter(row=>row.status==='saved').length||report.notSaved!==ids.length-report.saved)throw Error('SCENE_MATCH_BATCH_REPORT');
      batchResult.replaceChildren(el('p',`一括結果：${String(report.status)}${report.cancelled?'（取消あり）':''} ／ 保存確定 ${String(report.saved)} ／ 保存確定以外 ${String(report.notSaved)}（未確認を含む）`));
      const labels={saved:'保存済み',conflict:'競合・未保存',failed:'失敗・未保存',unverified:'保存結果未確認'};
      const list=el('ul');for(const row of report.results)list.append(el('li',`${row.assetId}：${labels[row.status]}${row.reason?` — ${String(row.reason)}`:''}`));batchResult.append(list);
    }catch{if(!disposed)batchResult.textContent=controller.signal.aborted?'一括処理を中断しました。結果を取得できなかったため、保存の有無は未確認です。再実行前に各写真を確認してください。':'一括処理を完了できませんでした。対象は現在写真以外の2〜20枚、キャッシュ済み原Proxyが必要です。結果を取得できなかった保存は未確認として扱ってください。';}
    finally{if(batchController===controller)batchController=null;pending=false;if(!disposed)controls();}
  });
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;invalidate();if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
