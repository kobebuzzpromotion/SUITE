import {validatePersonalLook} from './local-personal-look-contract.mjs';
import {decodePersonalLookRaw} from './local-personal-look-raw-input.mjs';
import {listLocalPersonalLooks,saveLocalPersonalLook,importLocalPersonalLook,duplicateLocalPersonalLook,deleteLocalPersonalLook} from './local-personal-look-store.mjs';
import {encodePersonalLookBackup,decodePersonalLookBackup,PERSONAL_LOOK_BACKUP_MAX_BYTES} from './local-personal-look-transfer.mjs';

/** Anonymous browser-local only. Pair images never enter an Asset/API/storage. */
export function mountWebConnectedPersonalLook(container,{session,canUse=()=>true}={}){
  if(!container?.ownerDocument||typeof session?.setPersonalLook!=='function'||typeof canUse!=='function')throw Error('LOCAL_LOOK_UI_CONFIG');
  const document=container.ownerDocument;
  const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const root=make('section'),title=make('h3','個人Look'),notice=make('p','明示対応したbefore/after 1〜200組から全体色だけを学習します。1〜199組はLite、200組はPersonalです。各組は同じ構図・向き・原寸が必要です。JPEG/PNGは各16MiB・8MP以下。RAWモードはBeforeのみRAW（128MiB以下・原寸現像後8MP以下）、AfterはJPEG/PNGです。縮小せず現像後sRGB8の全体色を学習します。CFAモデル・大型RAW・局所レタッチ・AIサービスではありません。一組ずつ処理し、全組成功後だけ保存します。画像は送信・保存しません。Lookはこのブラウザ限定（最大50件）です。');
  const fields=make('fieldset'),status=make('p');status.setAttribute('role','status');
  const field=(label,type)=>{const wrap=make('label',label),node=make('input');node.type=type;wrap.append(node);fields.append(wrap);return node;};
  const modeLabel=make('label','学習入力形式 '),inputMode=make('select');
  for(const [value,text] of [['nonraw','JPEG/PNG → JPEG/PNG'],['raw','RAW → JPEG/PNG']]){const option=make('option',text);option.value=value;inputMode.append(option);}
  modeLabel.append(inputMode);fields.append(modeLabel);
  const rawAccept='.arw,.cr2,.cr3,.nef,.nrw,.dng,.raf,.rw2,.orf,.pef,.srw,.raw';
  const rawName=/\.(arw|cr2|cr3|nef|nrw|dng|raf|rw2|orf|pef|srw|raw)$/i;
  const pairContainer=make('div');fields.append(pairContainer);const pairRows=[];
  const addPair=make('button','対応ペアを追加（最大200組）');addPair.type='button';fields.append(addPair);
  const name=field('Look名（学習時／選択したLookの改名）','text');name.maxLength=80;
  const select=make('select');select.setAttribute('aria-label','保存済み個人Look');fields.append(select);
  const strength=field('適用強度 0〜100%','number');strength.min='0';strength.max='100';strength.value='100';
  const button=text=>{const n=make('button',text);n.type='button';fields.append(n);return n;};
  const train=button('学習してローカル保存'),rename=button('選択Lookを改名'),apply=button('選択Lookを適用'),clear=button('現在のLookを解除'),reload=button('一覧再取得');
  const duplicate=button('選択Lookの係数を複製'),prepareDelete=button('選択Lookの削除対象を確認');
  const deleteSummary=make('p');fields.append(deleteSummary);
  const deleteConsent=field('表示された係数ライブラリ1件だけを削除することに同意する','checkbox');
  const executeDelete=button('確認したLookを削除'),cancelDelete=button('削除確認を取消');
  fields.append(make('p','自分用の係数JSONバックアップです。通常の共有Presetとは別形式で、学習写真・原写真は含みません。取込は確認後に新しいLookとして保存します。'));
  const backup=button('選択Look 1件をJSON保存'),importFile=field('係数JSON 1件（64KiB以下）','file');importFile.accept='.json,application/json';
  const inspectImport=button('JSONを読み込み内容確認'),importSummary=make('p');fields.append(importSummary);
  const saveImport=button('確認したLookを新規保存');
  const cancel=make('button','学習・読込を取消');cancel.type='button';
  root.append(title,notice,fields,cancel,status);container.append(root);
  let dead=false,busy=false,applying=false,generation=0,worker=null,pendingReject=null,controller=null,records=[];
  let importCandidate=null;const downloads=new Map();
  let deleteCandidate=null;
  const clearDelete=()=>{deleteCandidate=null;deleteConsent.checked=false;deleteSummary.textContent='';executeDelete.disabled=true;deleteConsent.disabled=true;cancelDelete.disabled=true;};
  const clearImport=()=>{importCandidate=null;importSummary.textContent='';saveImport.disabled=true;};
  const revokeDownloads=()=>{for(const [url,timer] of downloads){clearTimeout(timer);URL.revokeObjectURL(url);}downloads.clear();};
  const allowed=()=>{try{return !dead&&canUse()&&!session.state?.busy&&!session.state?.exporting;}catch{return false;}};
  const controls=()=>{fields.disabled=busy||!allowed();cancel.disabled=!busy;saveImport.disabled=!importCandidate;
    executeDelete.disabled=!deleteCandidate||!deleteConsent.checked;deleteConsent.disabled=!deleteCandidate;cancelDelete.disabled=!deleteCandidate;
    addPair.disabled=pairRows.length>=200;for(const row of pairRows)row.remove.disabled=pairRows.length<=1;};
  const stop=()=>{generation++;controller?.abort();controller=null;worker?.terminate();worker=null;
    pendingReject?.(new DOMException('Cancelled','AbortError'));pendingReject=null;busy=false;clearImport();clearDelete();revokeDownloads();controls();};
  function appendPair(){
    if(pairRows.length>=200)return;const row={id:crypto.randomUUID(),element:make('fieldset')};
    row.legend=make('legend');row.element.append(row.legend);
    for(const key of ['before','after']){const label=make('label',key==='before'?'Before（JPEG/PNG、16MiB以下）':'After（このBeforeに対応）');
      row[key]=make('input');row[key].type='file';row[key].accept=key==='before'&&inputMode.value==='raw'?rawAccept:'image/jpeg,image/png';
      if(key==='before'){row.beforeCaption=make('span');label.textContent='';label.append(row.beforeCaption);row.beforeCaption.textContent=inputMode.value==='raw'?'Before（RAW、128MiB以下）':'Before（JPEG/PNG、16MiB以下）';}
      label.append(row[key]);row.element.append(label);
      row[key].onchange=()=>{stop();row.consent.checked=false;status.textContent='画像変更により学習を取消しました。この組の対応を再確認してください。';};}
    const label=make('label','この組の両画像の使用権を持ち、向き・構図・位置が一致していることを確認しました');
    row.consent=make('input');row.consent.type='checkbox';label.prepend(row.consent);row.element.append(label);
    row.consent.onchange=()=>{if(busy)stop();};
    row.remove=make('button','この対応ペアを外す');row.remove.type='button';row.element.append(row.remove);
    row.remove.onclick=()=>{if(pairRows.length<=1)return;stop();const index=pairRows.indexOf(row);if(index<0)return;
      pairRows.splice(index,1);row.before.value=row.after.value='';row.element.remove();labelPairs();controls();};
    pairRows.push(row);pairContainer.append(row.element);labelPairs();controls();
  }
  function labelPairs(){pairRows.forEach((row,index)=>{row.legend.textContent=`対応ペア ${index+1}`;});}
  addPair.onclick=()=>{if(!allowed()||busy)return;stop();appendPair();};
  inputMode.onchange=()=>{stop();for(const row of pairRows){row.before.value=row.after.value='';row.consent.checked=false;
    row.before.accept=inputMode.value==='raw'?rawAccept:'image/jpeg,image/png';
    row.beforeCaption.textContent=inputMode.value==='raw'?'Before（RAW、128MiB以下）':'Before（JPEG/PNG、16MiB以下）';}
    status.textContent='入力形式を変更しました。全組の画像と同意を消去しました。';};
  const current=()=>records.find(r=>r.id===select.value);
  const draw=()=>{clearDelete();const selected=select.value;select.replaceChildren(make('option','選択してください'));
    select.firstChild.value='';for(const row of records){const o=make('option',`${row.name}（${row.document.format==='raw'?'RAW現像後用':'JPEG/PNG用'}）`);o.value=row.id;select.append(o);}select.value=selected;};
  async function run(work,success='完了。編集の保存は別操作です。'){
    if(busy||!allowed())return;clearDelete();busy=true;const token=++generation;controller=new AbortController();const signal=controller.signal;
    const ensure=()=>{if(dead||token!==generation||signal.aborted||!allowed())throw new DOMException('Cancelled','AbortError');};
    controls();status.textContent='処理中…';
    try{await work({ensure,signal});ensure();status.textContent=success;}
    catch(error){if(!dead&&token===generation)status.textContent=error.name==='AbortError'?'取り消しました。':`処理できません: ${error.message}`;}
    finally{if(token===generation){worker?.terminate();worker=null;pendingReject=null;busy=false;controller=null;controls();}}
  }
  async function inspectImage(file,ensure){
    if(!file||!['image/jpeg','image/png'].includes(file.type)||!file.size||file.size>16*1024*1024)throw Error('LOOK_IMAGE_TYPE_OR_SIZE');
    // Bound declared raster dimensions BEFORE invoking the browser decoder.
    // Its codec-internal overhead is still browser-managed, not a JS heap cap.
    const bytes=new Uint8Array(await file.arrayBuffer());ensure();
    const view=new DataView(bytes.buffer);let w=0,h=0;
    if(file.type==='image/png'){
      if(bytes.length<24||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v)||
          view.getUint32(8)!==13||view.getUint32(12)!==0x49484452)throw Error('LOOK_PNG_HEADER');
      w=view.getUint32(16);h=view.getUint32(20);
    }else{
      if(bytes[0]!==255||bytes[1]!==216)throw Error('LOOK_JPEG_HEADER');
      let p=2;
      while(p<bytes.length){
        if(bytes[p++]!==255)throw Error('LOOK_JPEG_HEADER');
        while(bytes[p]===255)p++;const marker=bytes[p++];
        if(marker===217||marker===218)break;
        if(marker===1||marker>=208&&marker<=215)continue;
        if(p+2>bytes.length)throw Error('LOOK_JPEG_HEADER');const length=view.getUint16(p);
        if(length<2||p+length>bytes.length)throw Error('LOOK_JPEG_HEADER');
        if([192,193,194].includes(marker)){
          if(length<8)throw Error('LOOK_JPEG_HEADER');h=view.getUint16(p+3);w=view.getUint16(p+5);break;
        }p+=length;
      }
    }
    if(!w||!h||w*h>8_000_000)throw Error('LOOK_IMAGE_PIXEL_LIMIT');
    return {width:w,height:h};
  }
  async function decode(file,expected,ensure){
    // Browser decoder applies embedded orientation. The resulting upright
    // dimensions must match; no automatic alignment, crop or resampling.
    const bitmap=await createImageBitmap(file,{imageOrientation:'from-image',premultiplyAlpha:'none',colorSpaceConversion:'default'});
    try{ensure();if(bitmap.width*bitmap.height>8_000_000||bitmap.width<1||bitmap.height<1||
      !(bitmap.width===expected.width&&bitmap.height===expected.height||bitmap.width===expected.height&&bitmap.height===expected.width))throw Error('LOOK_IMAGE_PIXEL_LIMIT');
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      try{const ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});if(!ctx)throw Error('LOOK_CANVAS_UNAVAILABLE');
        ctx.drawImage(bitmap,0,0);const image=ctx.getImageData(0,0,canvas.width,canvas.height);ensure();
        return {width:image.width,height:image.height,data:image.data};
      }finally{canvas.width=canvas.height=0;}
    }finally{bitmap.close();}
  }
  const list=async({ensure,signal})=>{const rows=await listLocalPersonalLooks({signal});ensure();records=rows;draw();};
  train.onclick=()=>run(async context=>{
    const label=name.value.trim();if(!label||label.length>80||pairRows.length<1||pairRows.length>200||pairRows.some(row=>!row.consent.checked))throw Error('LOOK_NAME_AND_OWNER_ALIGNMENT_CONSENT_REQUIRED');
    const selected=pairRows.map(row=>({row,id:row.id,before:row.before.files?.[0],after:row.after.files?.[0]}));
    const format=inputMode.value;if(!['raw','nonraw'].includes(format))throw Error('LOOK_INPUT_FORMAT');
    let workerFailure=null;
    const ensure=()=>{context.ensure();if(workerFailure)throw workerFailure;if(inputMode.value!==format||selected.length!==pairRows.length||selected.some((item,index)=>pairRows[index]!==item.row||
      !item.row.consent.checked||item.row.before.files?.[0]!==item.before||item.row.after.files?.[0]!==item.after))throw Error('LOOK_PAIR_SELECTION_STALE');};
    const mode=selected.length===200?'Personal':'Lite';let inspected=0;
    // Validate every file header and pair BEFORE any decode. Only file handles
    // and dimensions survive preflight; there is no aggregate raster allocation.
    for(const item of selected){status.textContent=`${mode}: 入力確認 ${inspected+1}/${selected.length}`;
      if(format==='raw'){
        if(!item.before||!rawName.test(item.before.name)||!Number.isSafeInteger(item.before.size)||item.before.size<1||item.before.size>128*1024*1024)throw Error('LOOK_RAW_INPUT_INVALID');
      }else item.beforeSize=await inspectImage(item.before,ensure);
      item.afterSize=await inspectImage(item.after,ensure);
      const a=item.beforeSize,b=item.afterSize;
      if(a&&!(a.width===b.width&&a.height===b.height||a.width===b.height&&a.height===b.width))throw Error('LOOK_PAIR_ALIGNMENT_REQUIRED');
      inspected++;}
    ensure();const trainingWorker=new Worker(new URL('./local-personal-look-training-worker.mjs',import.meta.url),{type:'module'});worker=trainingWorker;
    let receive=null,waitingReject=null;
    const fail=error=>{workerFailure=error;waitingReject?.(error);};
    trainingWorker.onerror=()=>fail(Error('LOOK_WORKER_FAILED'));
    trainingWorker.onmessageerror=()=>fail(Error('LOOK_WORKER_MESSAGE_FAILED'));
    trainingWorker.onmessage=({data})=>{
      try{ensure();if(data?.error)throw Error(String(data.error));if(!receive)throw Error('LOOK_WORKER_PROTOCOL');receive(data);}
      catch(error){fail(error);}
    };
    const request=(message,transfer,read)=>new Promise((resolve,reject)=>{
      const cleanup=()=>{receive=null;waitingReject=null;if(pendingReject===rejectPending)pendingReject=null;};
      const rejectPending=error=>{cleanup();reject(error);};
      pendingReject=rejectPending;waitingReject=rejectPending;
      receive=data=>{try{ensure();const value=read(data);cleanup();resolve(value);}catch(error){rejectPending(error);}};
      try{ensure();trainingWorker.postMessage(message,transfer);}catch(error){rejectPending(error);}
    });
    await request({type:'start',count:selected.length,format},[],data=>{if(data?.type!=='ready')throw Error('LOOK_WORKER_PROTOCOL');});
    for(let index=0;index<selected.length;index++){
      const item=selected[index];status.textContent=`${mode}: 学習 ${index}/${selected.length}（次の一組を読込中）`;
      const a=format==='raw'?await decodePersonalLookRaw(item.before,{signal:context.signal,guard:ensure}):await decode(item.before,item.beforeSize,ensure);
      ensure();const b=await decode(item.after,item.afterSize,ensure);ensure();
      if(a.width!==b.width||a.height!==b.height)throw Error('LOOK_PAIR_ALIGNMENT_REQUIRED');
      // Transfer ownership, then wait for consumption before decoding another pair.
      await request({type:'pair',pair:{id:item.id,before:a,after:b}},[a.data.buffer,b.data.buffer],data=>{
        if(data?.type!=='accepted'||data.completed!==index+1)throw Error('LOOK_WORKER_PROTOCOL');
      });
      status.textContent=`${mode}: 学習 ${index+1}/${selected.length}`;
    }
    const result=await request({type:'finish'},[],data=>{const value=validatePersonalLook(data?.document);
      if(value.format!==format)throw Error('LOOK_WORKER_FORMAT_MISMATCH');return value;});
    ensure();trainingWorker.terminate();worker=null;pendingReject=null;
    const saved=await saveLocalPersonalLook({id:crypto.randomUUID(),name:label,document:result},{signal:context.signal});
    await list(context);select.value=saved.id;for(const row of pairRows){row.before.value=row.after.value='';row.consent.checked=false;}
  });
  rename.onclick=()=>run(async context=>{const row=current();if(!row)throw Error('LOOK_SELECTION_REQUIRED');
    await saveLocalPersonalLook({...row,name:name.value.trim()},{signal:context.signal});await list(context);});
  duplicate.onclick=()=>run(async context=>{
    const selected=current();if(!selected)throw Error('LOOK_SELECTION_REQUIRED');const snapshot=structuredClone(selected);
    const guard=()=>{context.ensure();if(select.value!==snapshot.id)throw Error('LOCAL_LOOK_SELECTION_STALE');};
    const saved=await duplicateLocalPersonalLook(snapshot,{signal:context.signal,guard});
    await list(context);select.value=saved.id;name.value=saved.name;
  },'係数ライブラリに新しいIDで複製しました。写真・現在のRecipeは変更していません。');
  prepareDelete.onclick=()=>{
    if(busy||!allowed())return;clearDelete();const selected=current();
    if(!selected){status.textContent='削除対象のLookを選択してください。';return;}
    deleteCandidate=structuredClone(selected);
    deleteSummary.textContent=`削除対象: 「${selected.name}」。このブラウザの係数ライブラリ1件だけを削除します。写真・適用済みRecipeは変更しません。ライブラリ削除のUndoはありません。必要なら先にJSONバックアップしてください。`;
    controls();
  };
  deleteConsent.onchange=controls;
  cancelDelete.onclick=()=>{clearDelete();controls();status.textContent='削除を取り消しました。';};
  executeDelete.onclick=()=>{
    if(busy||!allowed()||!deleteCandidate||!deleteConsent.checked)return;
    const selected=structuredClone(deleteCandidate);
    if(select.value!==selected.id){clearDelete();controls();return;}
    void run(async context=>{
      const guard=()=>{context.ensure();if(select.value!==selected.id)throw Error('LOCAL_LOOK_SELECTION_STALE');};
      await deleteLocalPersonalLook(selected,{signal:context.signal,guard});await list(context);name.value='';
    },`「${selected.name}」の係数ライブラリ1件を削除しました。写真・現在のRecipeは変更していません。復元には事前のJSONバックアップが必要です。`);
  };
  backup.onclick=()=>run(async({ensure})=>{
    const row=current();if(!row)throw Error('LOOK_SELECTION_REQUIRED');const bytes=encodePersonalLookBackup(row);ensure();
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'}));
    const anchor=make('a');anchor.href=url;anchor.download='suite-personal-look.json';anchor.hidden=true;
    try{ensure();root.append(anchor);anchor.click();}finally{anchor.remove();
      downloads.set(url,setTimeout(()=>{URL.revokeObjectURL(url);downloads.delete(url);},1000));}
  });
  importFile.onchange=()=>{stop();status.textContent='JSONはまだ保存していません。「内容確認」を押してください。';};
  inspectImport.onclick=()=>run(async({ensure})=>{
    clearImport();const file=importFile.files?.[0];
    if(!file||!file.size||file.size>PERSONAL_LOOK_BACKUP_MAX_BYTES)throw Error('LOOK_BACKUP_SIZE_LIMIT');
    const bytes=new Uint8Array(await file.arrayBuffer());ensure();const candidate=decodePersonalLookBackup(bytes);ensure();
    importCandidate=candidate;
    importSummary.textContent=`名前: ${candidate.name} ／ RGB各11係数（計33） ／ 強度 ${Math.round(candidate.document.strength*100)}% ／ ${candidate.document.format==='raw'?'RAW現像後':'JPEG/PNG'} sRGB用全体色。写真は含みません。保存する場合は下の新規保存を押してください。`;
  });
  saveImport.onclick=()=>run(async context=>{
    if(!importCandidate)throw Error('LOOK_BACKUP_CONFIRM_REQUIRED');const candidate=structuredClone(importCandidate);context.ensure();
    const saved=await importLocalPersonalLook(candidate,{signal:context.signal});clearImport();importFile.value='';
    await list(context);select.value=saved.id;name.value=saved.name;
  });
  apply.onclick=()=>run(async({ensure})=>{const row=current(),amount=Number(strength.value);if(!row||!strength.value.trim()||!Number.isFinite(amount)||amount<0||amount>100)throw Error('LOOK_SELECTION_OR_STRENGTH');
    ensure();applying=true;cancel.disabled=true;try{await session.setPersonalLook(validatePersonalLook({...row.document,strength:amount/100}));}finally{applying=false;}});
  clear.onclick=()=>run(async({ensure})=>{ensure();applying=true;cancel.disabled=true;try{await session.setPersonalLook(null);}finally{applying=false;}});
  reload.onclick=()=>run(list);select.onchange=()=>{if(busy)stop();clearDelete();controls();name.value=current()?.name??'';};
  cancel.onclick=()=>{stop();status.textContent='取り消しました。';};
  const refresh=()=>{if(applying){fields.disabled=true;cancel.disabled=true;return;}
    if(!allowed()){if(busy)stop();clearImport();clearDelete();revokeDownloads();records=[];select.replaceChildren();status.textContent='現在は利用できません。';}controls();};
  appendPair();controls();void run(list);
  return Object.freeze({refresh,dispose(){dead=true;stop();root.remove();records=[];importFile.value='';for(const row of pairRows)row.before.value=row.after.value='';pairRows.length=0;}});
}
