import {createLocalFaceRuntimeController,LOCAL_FACE_PINNED_MODELS} from './local-face-runtime-controller.mjs';
import {createLocalFaceAnalysisSession} from './local-face-analysis-session.mjs';
import {createLocalFaceGalleryHost} from './local-face-gallery-host.mjs';

/** Explicit local-only session. User declarations are NOT legal approval and
 * are never persisted; no file selection triggers inference or a network upload. */
// identityProvider(binding,{signal}) optionally returns explicit policy/gallery/
// analysisVersion and validateCurrent(binding,{signal}). It must check current
// gallery consent/revision as well as photo. No provider means detection only.
export function mountLocalFaceRuntimePanel(root,{inputProvider,subscribeContext,identityProvider,hostAccess=()=>false,onStateChange}={}){
  const document=root.ownerDocument,el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const section=el('section'),title=el('h3','人物照合runtimeの明示準備');
  section.append(title,el('p',`固定版 ${LOCAL_FACE_PINNED_MODELS.revision} / OpenCV ${LOCAL_FACE_PINNED_MODELS.runtimeVersion}。モデルは自分で選択してください。ダウンロード・送信・自動登録はしません。`));
  const field=(label,type)=>{const wrap=el('label',label),input=el('input');input.type=type;wrap.append(input);section.append(wrap);return input;};
  const files={yunet:field('YuNet 2023mar ONNX','file'),sface:field('SFace 2021dec ONNX','file')};
  for(const [id,input] of Object.entries(files)){input.accept='.onnx';section.append(el('p',`${id}: ${LOCAL_FACE_PINNED_MODELS[id].byteCount} bytes / SHA-256 ${LOCAL_FACE_PINNED_MODELS[id].sha256}`));}
  const references=[['YuNet条件','https://github.com/opencv/opencv_zoo/blob/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet/LICENSE'],['SFace条件','https://github.com/opencv/opencv_zoo/blob/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_recognition_sface/LICENSE']];
  for(const [label,url] of references){const link=el('a',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';section.append(link);}
  const reviewer=field('確認者','text'),reference=field('利用条件の確認資料URL（https）','url'),date=field('確認日','date');
  const reviewed=field('固定版モデル・runtimeの商用利用条件を自分で確認した（自己申告・法務承認ではありません）','checkbox');
  const consent=field('対象写真について必要な人物処理の許可を得たことを確認した','checkbox');
  const galleryFile=field('Web専用人物gallery・明示照合policy JSON（任意）','file');galleryFile.accept='.json,application/json';
  const galleryConsent=field('このgalleryの全人物について、この写真との端末内照合の許可を確認した','checkbox');
  const galleryStatus=el('p','gallery未読込：検出のみ。Appleの特徴量は混用できません。');section.append(galleryStatus);
  const localGallery=createLocalFaceGalleryHost({canUse:()=>!disposed&&reviewedNow()&&hostAccess()===true});
  let galleryLoaded=false;
  const status=el('p','未確認・未初期化'),result=el('p');status.setAttribute('role','status');
  const initialize=el('button','選択モデルを照合して初期化'),analyze=el('button','この写真を一回解析'),cancel=el('button','取消・runtimeを破棄');
  for(const b of [initialize,analyze,cancel])b.type='button';
  analyze.hidden=typeof inputProvider!=='function';analyze.disabled=true;
  section.append(initialize,analyze,cancel,status,result,el('p','確認内容はこの画面内だけです。再配布許可は別途確認が必要です。顔特徴の値は表示・保存しません。'));
  section.append(el('p','人物照合は許可されたWeb専用galleryと明示policyで候補だけを表示します。任意JSONを読み込まなければ検出のみ。galleryはこの画面内だけに保持し、人物の登録や自動確定はしません。'));
  root.append(section);let disposed=false,generation=0,reading=false,controller,unsubscribe,analysisSession,matchContext=null,requestAbort=null;
  const reviewedNow=()=>{
    let url;try{url=new URL(reference.value);}catch{return false;}
    return reviewed.checked&&consent.checked&&reviewer.value.trim().length>0&&reviewer.value.length<=256&&
      url.protocol==='https:'&&!url.username&&!url.password&&reference.value.length<=2048&&
      /^\d{4}-\d{2}-\d{2}$/.test(date.value)&&Number.isFinite(Date.parse(date.value))&&Date.parse(date.value)<=Date.now();
  };
  function create(){
    controller=createLocalFaceRuntimeController({authorize:async()=>!disposed&&reviewedNow()&&hostAccess()===true});
    unsubscribe=controller.subscribe(s=>{
      onStateChange?.(s);
      status.textContent=`状態：${s.status}${s.reason?` / ${s.reason}`:''}。利用条件：${reviewedNow()?'利用者の確認申告あり（承認ではない）':'未確認'}`;
      initialize.disabled=reading||['loading','running','ready'].includes(s.status);
      analyze.disabled=reading||s.status!=='ready'||!reviewedNow();
    });
  }
  create();
  analysisSession=createLocalFaceAnalysisSession({controller,validateCurrent:async(binding,options)=>{
    const current=matchContext;
    if(!current||disposed||current.epoch!==generation||!reviewedNow())return false;
    const valid=await current.validateCurrent(binding,options);
    return valid===true&&matchContext===current&&!disposed&&current.epoch===generation&&reviewedNow();
  }});
  function changed(){generation++;reading=false;requestAbort?.abort();matchContext=null;analysisSession.cancel();
    localGallery.invalidate();galleryConsent.checked=false;result.textContent='設定変更により以前の解析結果を破棄しました。';}
  galleryConsent.addEventListener('change',()=>{const approved=galleryConsent.checked;changed();galleryConsent.checked=approved;localGallery.approve(approved);});
  galleryFile.addEventListener('change',async()=>{
    changed();galleryLoaded=false;const epoch=generation,file=galleryFile.files?.[0];
    try{
      localGallery.load('');
    }catch{ /* Clears any previous gallery even if the next read fails. */ }
    if(!file){galleryStatus.textContent='gallery未読込：検出のみ。';return;}
    try{
      if(file.size>8_000_000)throw Error('SIZE');
      const text=await file.text();if(disposed||epoch!==generation)return;
      const info=localGallery.load(text);galleryLoaded=true;
      galleryStatus.textContent=`${info.people}人物 / ${info.templates}特徴。gallery版 ${info.revision}、policy版 ${info.policyRevision}。許可を確認してください。端末保存はしません。`;
    }catch{if(!disposed&&epoch===generation)galleryStatus.textContent='galleryを読み込めません。Web専用モデル版・明示policy・形式・容量を確認してください。';}
  });
  const unsubscribeContext=typeof subscribeContext==='function'?subscribeContext(changed):null;
  const controls=[...Object.values(files),reviewer,reference,date,reviewed,consent];
  for(const input of controls)input.addEventListener('change',changed);
  const textControls=[reviewer,reference,date];
  for(const input of textControls)input.addEventListener('input',changed);
  initialize.addEventListener('click',async()=>{
    if(disposed||reading)return;
    const epoch=++generation;result.textContent='';
    if(!reviewedNow()){status.textContent='確認者・資料URL・確認日・利用条件・人物許可の明示確認が必要です。';return;}
    reading=true;initialize.disabled=true;
    let models;
    try{
      const selected={};for(const id of ['yunet','sface']){selected[id]=files[id].files?.[0];if(!selected[id]||selected[id].size!==LOCAL_FACE_PINNED_MODELS[id].byteCount)throw Error('MODEL_SIZE');}
      models={yunet:new Uint8Array(await selected.yunet.arrayBuffer()),sface:new Uint8Array(await selected.sface.arrayBuffer())};
      if(disposed||epoch!==generation)return;
      reading=false;await controller.initialize(models);
    }catch{if(!disposed&&epoch===generation){controller.cancel();status.textContent='初期化できません。固定モデル・許可記録・WASM配置を確認してください。';}}
    finally{models?.yunet.fill(0);models?.sface.fill(0);if(!disposed&&epoch===generation){reading=false;initialize.disabled=controller.snapshot().status==='ready';}}
  });
  analyze.addEventListener('click',async()=>{
    if(disposed||typeof inputProvider!=='function'||!reviewedNow()||controller.snapshot().status!=='ready')return;
    const epoch=++generation;analyze.disabled=true;result.textContent='';
    const abort=new AbortController();requestAbort=abort;
    let prepared,output;
    try{
      prepared=await inputProvider({signal:abort.signal});if(disposed||epoch!==generation)return;
      if(typeof identityProvider==='function'||galleryLoaded){
        // Own a fixed copy before asking another async provider for sensitive data.
        const fixed={...prepared.binding,...prepared.input,bgr:prepared.input.bgr.slice()};
        let provided;
        try{
          const binding=Object.freeze(structuredClone(prepared.binding));
          const provideIdentity=typeof identityProvider==='function'?identityProvider:localGallery.identityProvider;
          provided=await provideIdentity(binding,{signal:abort.signal});
          if(disposed||epoch!==generation||abort.signal.aborted)return;
          if(typeof provided?.validateCurrent!=='function')throw Error('LOCAL_FACE_IDENTITY_HOST_NOT_READY');
          matchContext={epoch,validateCurrent:provided.validateCurrent};
          const outcome=await analysisSession.analyze({prepared:fixed,analysisVersion:provided.analysisVersion,
            policy:provided.policy,gallery:provided.gallery},{signal:abort.signal});
          if(disposed||epoch!==generation||abort.signal.aborted)return;
          const count=status=>outcome.matches.filter(m=>m.decision.status===status).length;
          result.textContent=`検出 ${outcome.analysis.faces.length} 件。照合候補 ${count('matched')} 件、曖昧 ${count('ambiguous')} 件、未一致 ${count('unknown')} 件。人物の確定・登録・保存・編集適用はしていません。`;
        }finally{provided?.release?.();fixed.bgr.fill(0);}
        return;
      }
      output=await controller.analyze(prepared.input,{binding:prepared.binding,signal:abort.signal});
      if(disposed||epoch!==generation)return;
      result.textContent=`検出 ${output.faces.length} 件。人物名の確定・登録・編集適用はしていません。`;
      for(const face of output.faces)face.embedding?.fill(0);
    }catch{if(!disposed&&epoch===generation){controller.cancel();result.textContent='解析できません。未対応・取消を成功扱いしません。';}}
    finally{if(requestAbort===abort){requestAbort=null;matchContext=null;}prepared?.input?.bgr?.fill(0);for(const face of output?.faces??[])face.embedding?.fill(0);if(!disposed&&epoch===generation)analyze.disabled=controller.snapshot().status!=='ready';}
  });
  cancel.addEventListener('click',changed);
  return {snapshot:()=>controller.snapshot(),dispose(){disposed=true;generation++;requestAbort?.abort();matchContext=null;unsubscribeContext?.();unsubscribe?.();analysisSession.dispose();controller.dispose();localGallery.dispose();for(const input of controls)input.removeEventListener('change',changed);for(const input of textControls)input.removeEventListener('input',changed);section.remove();}};
}
