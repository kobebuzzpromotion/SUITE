import {createLocalBackdropPreviewSession} from './local-backdrop-preview-session.mjs';
import {exportAppleLocalBundle,importAppleLocalBundle} from './apple-local-bundle-store.mjs';
import {readAppleLocalEditJSON} from './apple-local-edit-import.mjs';
import {preflightCrossDeviceCapabilities} from './cross-device-capabilities.mjs';

export function createLocalBackdropPreviewUI({document,backdropHost}={}){
  const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const element=node('section'),status=node('p'),canvas=node('canvas');canvas.hidden=true;
  canvas.style.maxWidth='100%';canvas.style.height='auto';
  element.append(node('h4','Apple局所補正・背景・変形の非保存見本'),node('p','現在の写真の未編集プロキシから対応処理だけを再現します。L8マスクは人物プロキシとRecipeのmask寸法に一致する必要があります。背景PNGはmanifest寸法です。保存・編集復元・原本変更は行いません。'),node('p','影はWeb専用Gaussian（sigma＝指定半径、3σ範囲）です。Apple内部の補間・ぼかしと完全同一の画素結果は保証しません。計算量上限を超える指定は拒否します。'));
  const file=(label,accept)=>{const wrap=node('label',label),input=node('input');input.type='file';input.accept=accept;wrap.append(input);element.append(wrap);return input;};
  element.append(node('p','保存localRetouch → 背景 → localWarp → 保存順の露出・コントラスト・90度単位回転・整数画素境界の切抜きを再現します。非標準彩度・portrait・小数画素境界の切抜き・未知処理は省略せず見本全体を拒否します。コントラストはApple公開式をlinear sRGBで計算し、表示時だけSDRへ丸めます。Apple実機との画素一致は未検証です。書き出し設定は見本では実行しません。'));
  const png=file('背景PNG','.png,image/png'),mask=file('人物L8マスク','.mask,.bin'),manifest=file('固定背景manifest JSON','.json,application/json');
  const bodyMaskFile=file('保存変形の身体保護L8（bodyMask指定時のみ必須・同寸法・255のみ変形許可）','.mask,.bin');
  const portableFile=file('別端末から保存した素材付きApple編集JSONを取込','.json,application/json');
  const backup=node('button','見本の素材付き編集JSONを保存');backup.type='button';backup.disabled=true;element.append(backup);
  const fixture=node('button','Mac照合用の固定入力を書出す');fixture.type='button';element.append(fixture);
  element.append(node('p','Mac照合用ファイルには現在の未編集プロキシ写真とApple設定全文を含みます。原寸原本ではありません。Macの描画結果や比較結果はまだ含みません。'));
  element.append(node('p','素材付きJSONには背景画像・人物マスク・元の全編集履歴が入ります。写真の原本は含みません。共有先への開示可否は保存・共有前に確認してください。取込後も利用許可と同一原本の写真を再確認します。'));
  const label=node('label','この写真の人物処理と背景素材の利用に必要な許可を確認しました（自己申告）'),rights=node('input');rights.type='checkbox';label.append(rights);element.append(label);
  const shadowLabel=node('label','追加影を使う場合：背景に重複する影がなく、人物マスクに旧背景・旧影を含めていません'),shadowConfirmed=node('input');shadowConfirmed.type='checkbox';shadowLabel.append(shadowConfirmed);element.append(shadowLabel);
  const run=node('button','背景だけの見本を表示'),stop=node('button','見本を取消');run.type=stop.type='button';element.append(run,stop,status,canvas);
  const apply=node('button','この見本の編集と素材を端末に保存して適用');apply.type='button';apply.disabled=true;element.append(apply);
  element.append(node('p','適用素材はこのブラウザ内だけに保存します。他端末同期・Cloud Safeではありません。写真の原本は変更しません。通常の保存操作でRecipeを保存できます。'));
  let originalJSON=null,candidate=null,portable=null,api,sourceOnly=false;
  fixture.addEventListener('click',async()=>{
    if(disposed||busy||!available||!rights.checked||!originalJSON)return;
    const generation=epoch,fixedJSON=originalJSON,controller=new AbortController();aborter=controller;busy=true;refresh();
    let supplied,canvasCopy,pngBytes;
    const check=()=>{if(disposed||generation!==epoch||controller.signal.aborted||!rights.checked)throw new DOMException('Cancelled','AbortError');};
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    try{
      supplied=await backdropHost.sourceProvider({signal:controller.signal});check();
      const request={purpose:'mac-parity-fixture',originalJSON:fixedJSON,currentBinding:supplied.currentBinding};
      if(await backdropHost.authorize(request,{signal:controller.signal})!==true)throw Error('PERMISSION');check();
      const source=supplied.source;
      if(source.colorSpace!=='srgb'||source.alpha!=='straight'||source.rows!=='top-left'||source.orientation!==1||
        !(source.data instanceof Uint8ClampedArray)||source.width*source.height>8_000_000||source.data.length!==source.width*source.height*4)throw Error('SOURCE');
      const rgbaSHA256=await digest(source.data);check();
      canvasCopy=node('canvas');canvasCopy.width=source.width;canvasCopy.height=source.height;
      const context=canvasCopy.getContext('2d',{colorSpace:'srgb'});if(!context)throw Error('CANVAS');
      const data=context.createImageData(source.width,source.height);data.data.set(source.data);context.putImageData(data,0,0);data.data.fill(0);
      const blob=await new Promise(resolve=>canvasCopy.toBlob(resolve,'image/png'));check();if(!blob||blob.size>32*1024*1024)throw Error('PNG');
      pngBytes=new Uint8Array(await blob.arrayBuffer());const pngSHA256=await digest(pngBytes);check();
      let binary='';for(let i=0;i<pngBytes.length;i+=8192){binary+=String.fromCharCode(...pngBytes.subarray(i,i+8192));if(i%524288===0){await new Promise(resolve=>setTimeout(resolve,0));check();}}
      const record={format:'suite-mac-parity-input',schemaVersion:1,originalJSON:fixedJSON,input:{representation:'unedited-proxy',
        assetID:supplied.currentBinding.assetID,originalSHA256:supplied.currentBinding.originalSHA256,revision:supplied.currentBinding.revision,
        width:source.width,height:source.height,colorSpace:'srgb',alpha:'straight',rows:'top-left',orientation:1,
        rgbaSHA256,pngSHA256,pngByteCount:pngBytes.length,pngBase64:btoa(binary)},
        result:null,status:'input-only-not-rendered-not-compared',
        requiredMacResult:['inputPNG SHA-256','originalJSON SHA-256','OS and renderer version','output width and height','working/output color space','output alpha/row order','result PNG SHA-256'],
        originalJSONSHA256:await digest(new TextEncoder().encode(fixedJSON))};
      if(await backdropHost.authorize(request,{signal:controller.signal})!==true)throw Error('PERMISSION');check();
      const url=URL.createObjectURL(new Blob([JSON.stringify(record)],{type:'application/json'}));
      const link=node('a');link.href=url;link.download='suite-mac-parity-input.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      status.textContent='Mac照合用の固定入力を書き出しました。Macの描画・比較は未実施です。';
    }catch{if(!disposed&&generation===epoch)status.textContent='固定入力を書き出せません。写真・権限・容量を確認してください。';}
    finally{supplied?.source?.data?.fill(0);pngBytes?.fill(0);if(canvasCopy){canvasCopy.width=1;canvasCopy.height=1;}if(aborter===controller)aborter=null;busy=false;refresh();}
  });
  function clearPortable(){portable?.backgroundBytes?.fill(0);portable?.maskBytes?.fill(0);portable?.bodyMaskBytes?.fill(0);portable=null;}
  function clearCandidate(){candidate?.backgroundBytes?.fill(0);candidate?.maskBytes?.fill(0);candidate?.bodyMaskBytes?.fill(0);candidate=null;apply.disabled=true;backup.disabled=true;}
  portableFile.addEventListener('change',async()=>{
    changed();clearPortable();const generation=epoch,selected=portableFile.files?.[0];if(!selected)return;
    let loaded;
    try{
      if(selected.size>96*1024*1024)throw Error('SIZE');
      loaded=await importAppleLocalBundle(await selected.text());if(disposed||generation!==epoch)throw Error('STALE');
      const imported=readAppleLocalEditJSON(loaded.originalJSON,{preflight:preflightCrossDeviceCapabilities});
      api.setImported(imported);portable=loaded;loaded=null;
      status.textContent='素材と全履歴のSHAを照合しました。現在の写真が同じ原本か確認し、利用許可をチェックして見本を表示してください。';
    }catch{if(!disposed&&generation===epoch)status.textContent='素材付きJSONを読み込めません。未知版・破損・容量・未対応処理を確認してください。';}
    finally{loaded?.backgroundBytes?.fill(0);loaded?.maskBytes?.fill(0);loaded?.bodyMaskBytes?.fill(0);}
  });
  backup.addEventListener('click',async()=>{
    if(!candidate||!permitted())return;
    const generation=epoch,{schemaVersion,originalJSON,manifest,backgroundBytes,maskBytes,bodyMaskBytes,sourceWidth,sourceHeight}=candidate;
    try{
      const text=await exportAppleLocalBundle({schemaVersion,originalJSON,manifest,backgroundBytes,maskBytes,bodyMaskBytes,...(schemaVersion===2?{sourceWidth,sourceHeight}:{})});
      if(disposed||generation!==epoch||!permitted())return;
      const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
      const link=node('a');link.href=url;link.download='suite-apple-local-bundle.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{if(!disposed&&generation===epoch)status.textContent='素材付きJSONを保存できません。';}
  });
  let disposed=false,epoch=0,busy=false,recipe=null,warp=null,retouch=null,appleParameters=null,session=null,unsubscribe=null,aborter=null;
  const available=backdropHost&&['sourceProvider','authorize','subscribeContext'].every(k=>typeof backdropHost[k]==='function');
  const permitted=()=>rights.checked&&(recipe?.shadow?.kind!=='addDrop'||shadowConfirmed.checked);
  const refresh=()=>{run.disabled=disposed||busy||!available||!recipe||!permitted();fixture.disabled=disposed||busy||!available||!originalJSON||!rights.checked;};
  function cancel(){epoch++;clearCandidate();aborter?.abort();session?.cancel();canvas.width=1;canvas.height=1;canvas.hidden=true;status.textContent='見本を破棄しました。';refresh();}
  apply.addEventListener('click',async()=>{
    if(!candidate||!permitted()||typeof backdropHost?.applySavedBundle!=='function')return;
    const fixed=structuredClone(candidate),generation=epoch;apply.disabled=true;busy=true;refresh();
    try{await backdropHost.applySavedBundle(fixed,{isCurrent:()=>!disposed&&generation===epoch&&permitted()});status.textContent='端末限定の素材と編集をUndo履歴へ追加しました。通常の保存操作でRecipeを保存してください。';}
    catch{status.textContent='適用できません。権限・写真・版の変更や、未対応の処理・容量・素材不足を確認してください。';}
    finally{fixed.backgroundBytes?.fill(0);fixed.maskBytes?.fill(0);fixed.bodyMaskBytes?.fill(0);clearCandidate();busy=false;refresh();}
  });
  function changed(){rights.checked=false;shadowConfirmed.checked=false;cancel();}
  if(available){
    session=createLocalBackdropPreviewSession({...backdropHost,authorize:async(...args)=>{
      if(disposed||!permitted())return false;
      const granted=await backdropHost.authorize(...args);
      return granted===true&&!disposed&&permitted();
    }});
    unsubscribe=backdropHost.subscribeContext(changed);
  }else status.textContent='写真・権限のhostは未接続です。見本は作成できません。';
  for(const input of [png,mask,manifest,bodyMaskFile])input.addEventListener('change',()=>{clearPortable();changed();});
  rights.addEventListener('change',cancel);stop.addEventListener('click',cancel);
  shadowConfirmed.addEventListener('change',cancel);
  run.addEventListener('click',async()=>{
    if(run.disabled||!recipe)return;
    cancel();const generation=epoch,local=new AbortController();aborter=local;busy=true;refresh();
    const fixed=structuredClone(recipe),fixedWarp=structuredClone(warp),fixedRetouch=structuredClone(retouch),fixedParameters=structuredClone(appleParameters);let backgroundBytes,maskBytes,bodyBytes,result;
    const check=()=>{if(disposed||generation!==epoch||local.signal.aborted||!permitted())throw Error('STALE');};
    try{
      const p=png.files?.[0],m=mask.files?.[0],j=manifest.files?.[0];
      if(!sourceOnly&&!portable&&(!p||!m||!j||p.size!==fixed.background.byteCount||m.size!==fixed.maskByteCount||j.size>8192))throw Error('FILES');
      status.textContent='背景・マスクを照合して見本を作成中';
      const metadata=sourceOnly?null:portable?structuredClone(portable.manifest):JSON.parse(await j.text());check();
      backgroundBytes=sourceOnly?null:portable?portable.backgroundBytes.slice():new Uint8Array(await p.arrayBuffer());check();
      maskBytes=sourceOnly?null:portable?portable.maskBytes.slice():new Uint8Array(await m.arrayBuffer());check();
      if(fixedWarp?.bodyMask){
        const selected=bodyMaskFile.files?.[0];
        if(!portable&&(!selected||selected.size!==fixedWarp.bodyMask.byteCount||selected.size>8_000_000))throw Error('BODY_MASK_REQUIRED');
        bodyBytes=portable?portable.bodyMaskBytes?.slice():new Uint8Array(await selected.arrayBuffer());check();
      }
      result=await session.preview({recipe:sourceOnly?null:fixed,originalJSON,binding:{id:fixed.assetID,sha256:fixed.originalSHA256},
        manifest:metadata,backgroundBytes,maskBytes,maskKind:'preview'},{signal:local.signal,localWarp:fixedWarp,localRetouch:fixedRetouch,appleParameters:fixedParameters,bodyMask:bodyBytes??null});check();
      canvas.width=result.width;canvas.height=result.height;
      const context=canvas.getContext('2d',{colorSpace:'srgb'});if(!context)throw Error('CANVAS');
      const image=context.createImageData(result.width,result.height);image.data.set(result.data);context.putImageData(image,0,0);image.data.fill(0);
      canvas.hidden=false;status.textContent=`非保存の背景見本です。表示域へ丸めた画素 ${result.clippedPixels??0}。他の編集は含みません。`;
      if(originalJSON&&typeof backdropHost.applySavedBundle==='function'){
        if(portable?.schemaVersion===2&&(portable.sourceWidth!==result.sourceWidth||portable.sourceHeight!==result.sourceHeight)&&sourceOnly)throw Error('SOURCE_DIMENSIONS');
        candidate={schemaVersion:sourceOnly?2:1,...(sourceOnly?{sourceWidth:result.sourceWidth,sourceHeight:result.sourceHeight}:{}),originalJSON,manifest:structuredClone(metadata),backgroundBytes:backgroundBytes?.slice()??null,maskBytes:maskBytes?.slice()??null,bodyMaskBytes:bodyBytes?.slice()??null,
          currentBinding:structuredClone(result.currentBinding),recipe:sourceOnly?null:fixed,nativeParameters:fixedParameters,binding:{id:fixed.assetID,sha256:fixed.originalSHA256},localWarp:fixedWarp,localRetouch:fixedRetouch};apply.disabled=false;backup.disabled=false;
      }
    }catch{if(!disposed&&generation===epoch){canvas.width=1;canvas.height=1;canvas.hidden=true;status.textContent='見本を作れません。写真・版・許可、固定manifest、SHA、マスク寸法、対応PNGを確認してください。';}}
    finally{backgroundBytes?.fill(0);maskBytes?.fill(0);bodyBytes?.fill(0);result?.data?.fill(0);if(aborter===local)aborter=null;busy=false;refresh();}
  });
  refresh();
  return api={element,cancel,setImported(imported){
    clearPortable();
    changed();recipe=null;warp=null;retouch=null;appleParameters=null;
    originalJSON=imported?.originalJSON??null;
    const doc=imported?.document,parameters=doc?.history?doc.history.entries[doc.history.cursor]?.parameters:doc?.parameters;
    const ext=parameters?.extendedParameters;
    appleParameters=parameters==null?null:structuredClone(parameters);
    sourceOnly=!ext?.localBackdrop;
    if(sourceOnly&&(!ext?.localWarp&&!ext?.localRetouch||!doc?.asset)){status.textContent='現cursorに対応する局所補正・変形・背景Recipeがありません。';refresh();return;}
    warp=ext.localWarp==null?null:structuredClone(ext.localWarp);
    retouch=ext.localRetouch==null?null:structuredClone(ext.localRetouch);
    recipe=sourceOnly?{assetID:doc.asset.id,originalSHA256:doc.asset.sha256}:structuredClone(ext.localBackdrop);status.textContent=available?(sourceOnly?'背景なしの局所補正・変形です。bodyMask指定時はL8を選び、利用許可を確認してください。':'背景PNG・マスク・manifestを選び、利用許可を確認してください。'):'写真host未接続です。';refresh();
  },dispose(){disposed=true;cancel();clearPortable();unsubscribe?.();session?.dispose();element.remove();}};
}
