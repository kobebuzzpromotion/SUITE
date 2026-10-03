import {mountAuthor,mountPresetLibrary,mountAdminReview,mountTrialMembers} from './author-ui.mjs';
const EMPTY = {assets:[],asset:null,recipe:null,revision:0,dirty:false,busy:null,error:null,people:[],selectedPersonID:null,beforeURL:null,afterURL:null,canUndo:false,canRedo:false,evidence:null,status:'RAW を読み込んでください',exporting:false,personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'};
const adjustments = [
  {key:'exposure',label:'露光量',english:'EXPOSURE',min:-4,max:4,step:0.1,initial:0,unit:' EV'},
  {key:'contrast',label:'コントラスト',english:'CONTRAST',min:0,max:2,step:0.05,initial:1,unit:''},
  {key:'saturation',label:'彩度',english:'SATURATION',min:0,max:2,step:0.05,initial:1,unit:''},
  ...[
    ['highlights','ハイライト'],['shadows','シャドウ'],['whites','白レベル'],['blacks','黒レベル'],['vibrance','自然な彩度']
  ].map(([name,label])=>({key:`color.${name}`,id:`color-${name}`,group:'color',label,english:'POST-DECODE sRGB',min:-100,max:100,step:1,initial:0,unit:''})),
  ...[
    ['clarity','明瞭度',-100],['texture','テクスチャ',-100],['sharpness','シャープ量',0]
  ].map(([name,label,min])=>({key:`detail.${name}`,id:`detail-${name}`,group:'detail',label,english:'POST-DECODE sRGB',min,max:100,step:1,initial:0,unit:''})),
  ...['red','orange','yellow','green','aqua','blue','purple','magenta'].flatMap(color=>
    [['hue','色相'],['saturation','彩度'],['luminance','輝度相当']].map(([field,label])=>({key:`hsl.${color}.${field}`,id:`hsl-${color}-${field}`,group:'hsl',label:`${color} · ${label}`,english:'HSL / 8-BIT sRGB',min:-100,max:100,step:1,initial:0,unit:''})))
];
function adjustmentValue(params,key){
  const parts=key.split('.');if(parts.length===1)return params[parts[0]];
  const ext=params.extendedParameters?.postDecodeAdjustments;
  if(parts[0]==='color')return ext?.color?.[parts[1]];
  if(parts[0]==='detail')return ext?.detail?.[parts[1]];
  if(parts[0]==='hsl')return ext?.color?.hsl?.[parts[1]]?.[parts[2]];
  return undefined;
}
const formatValue = (value,unit='') => `${Number(value).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1')}${unit}`;
function element(tag,className,text) {const node=document.createElement(tag); if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function shortID(id) {return String(id??'').slice(0,8);}
function assetName(asset) {return asset?.name??asset?.originalFilename??'未選択';}
function safeImageURL(value) {if(typeof value!=='string'||!value)return null;try {const url=new URL(value,location.href);return ['blob:','http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function actionButton(label,action,className='button') {const button=element('button',className,label);button.type='button';button.dataset.action=action;return button;}
export function adjacentPhotoID(assets,selectedID,direction){
  if(!Array.isArray(assets)||![-1,1].includes(direction))return null;
  const current=assets.findIndex(asset=>asset.id===selectedID),next=current<0?(direction===1?0:-1):current+direction;
  return assets[next]?.id??null;
}
export function canSwitchPhoto(state,{pending=false,blocked=false}={}){return !pending&&!blocked&&!state.busy&&!state.exporting&&!state.dirty;}
/** Let touch use native momentum; distinguish mouse/pen dragging from a photo tap. */
export function createFilmstripGesture(viewport,{clock=()=>Date.now(),threshold=8}={}){
  let pointer=null,suppressUntil=0;
  const release=()=>{if(pointer?.captured&&viewport.hasPointerCapture?.(pointer.id))viewport.releasePointerCapture(pointer.id);pointer=null;};
  return {
    pointerDown(event){if(event.isPrimary===false||event.pointerType!=='touch'&&event.button!==0)return;pointer={id:event.pointerId,type:event.pointerType,x:event.clientX,y:event.clientY,scrollLeft:viewport.scrollLeft,moved:false,captured:false};},
    pointerMove(event){if(!pointer||event.pointerId!==pointer.id)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
      if(Math.abs(dx)>threshold||Math.abs(dy)>threshold)pointer.moved=true;
      if(!pointer.moved||pointer.type==='touch')return;
      if(!pointer.captured&&viewport.setPointerCapture){viewport.setPointerCapture(pointer.id);pointer.captured=true;}
      viewport.scrollLeft=pointer.scrollLeft-dx;event.preventDefault?.();},
    pointerEnd(event){if(!pointer||event.pointerId!==pointer.id)return;if(pointer.moved||Math.abs(viewport.scrollLeft-pointer.scrollLeft)>threshold)suppressUntil=clock()+350;release();},
    // Native iPad momentum keeps scrolling after pointerup; a tap during that motion must not open a photo.
    scroll(){suppressUntil=clock()+350;},
    wheel(event){if(event.deltaX){suppressUntil=clock()+200;return;}
      const factor=event.deltaMode===1?18:event.deltaMode===2?viewport.clientWidth:1;
      const max=Math.max(0,viewport.scrollWidth-viewport.clientWidth),next=Math.max(0,Math.min(max,viewport.scrollLeft+event.deltaY*factor));
      if(next===viewport.scrollLeft)return;viewport.scrollLeft=next;suppressUntil=clock()+200;event.preventDefault?.();},
    suppressClick(){return clock()<suppressUntil;}
  };
}
/** Accept only the two explicitly supported same-origin identity routes. */
export function validatedSignOutURL(value,base=location.href){if(typeof value!=='string'||!value)throw Error('SIGNOUT_ROUTE_UNCONFIRMED');let url,current;try{current=new URL(base);url=new URL(value,current);}catch{throw Error('SIGNOUT_ROUTE_UNCONFIRMED');}if(!['http:','https:'].includes(url.protocol)||url.origin!==current.origin||!['/signout-with-chatgpt','/auth/logout'].includes(url.pathname)||url.username||url.password||url.hash||url.searchParams.get('return_to')!=='/'||[...url.searchParams.keys()].length!==1)throw Error('SIGNOUT_ROUTE_UNCONFIRMED');return url.href;}
export function validatedSignInURL(value,base=location.href){if(typeof value!=='string'||!value)throw Error('SIGNIN_ROUTE_UNCONFIRMED');let url,current;try{current=new URL(base);url=new URL(value,current);}catch{throw Error('SIGNIN_ROUTE_UNCONFIRMED');}if(!['http:','https:'].includes(url.protocol)||url.origin!==current.origin||!['/signin-with-chatgpt','/auth/complete'].includes(url.pathname)||url.username||url.password||url.hash||url.searchParams.get('return_to')!=='/'||[...url.searchParams.keys()].length!==1)throw Error('SIGNIN_ROUTE_UNCONFIRMED');return url.href;}

/** The session owns processing, validation, persistence and export. UI never invents an image or a person. */
export function mountEditor(session,{trialSession,authorAPI}={}) {
  if(!session||typeof session.subscribe!=='function')throw Error('EDITOR_SESSION_NOT_CONNECTED');
  const root=document.querySelector('#app');if(!root)throw Error('EDITOR_ROOT_MISSING');
  const lifetime=new AbortController();let state={...EMPTY,...session.state};let pending=false;let localError='';let disposed=false;let mode='after';let downloadURL=null;let downloadAssetID=null;
  let previewAssetID=null;let previousBeforeURL=null;let previousAfterURL=null;let blockedBeforeURL=null;let blockedAfterURL=null;let stripSelectedID=null;
  const requestedView=new URL(location.href).searchParams.get('view'),adminMode=requestedView==='admin',authorMode=requestedView==='author'||adminMode;
  const invited=['INVITED_LOCAL_TRIAL','SITES'].includes(trialSession?.mode)&&Boolean(trialSession.principal?.id&&trialSession.principal?.authorName);let authorDispose=null;const additionalDisposers=[];
  const endedCodes=['TRIAL_EXPIRED','TRIAL_REVOKED','TRIAL_END_NOT_CONFIGURED'];let endedReason=null;const accessListeners=new Set();
  const access={reason(){if(!invited)return null;if(endedReason)return endedReason;if(trialSession.principal.role==='admin'&&!trialSession.principal.trialEndsAt)return null;const deadline=Date.parse(trialSession.principal.trialEndsAt);return !Number.isFinite(deadline)?'TRIAL_END_NOT_CONFIGURED':Date.now()>=deadline?'TRIAL_EXPIRED':null;},end(reason){if(!endedCodes.includes(reason)||endedReason===reason)return;endedReason=reason;for(const fn of accessListeners)fn();if(!disposed)render(state);},subscribe(fn){accessListeners.add(fn);return()=>accessListeners.delete(fn);}};
  root.innerHTML=`
    <header class="app-header">
      <a class="wordmark" href="/" aria-label="SUITE ワークスペース">SUITE<span class="wordmark-dot">.</span></a>
      <span class="header-context">PHOTOGRAPH WORKSPACE <span class="header-divider">/</span> <span>${adminMode&&invited&&trialSession.principal.role==='admin'?'ADMIN REVIEW':authorMode?(invited?'AUTHOR DRAFTS':'AUTHOR PREVIEW'):'RAW EDITOR'}</span></span>
      <nav class="header-nav" aria-label="ワークスペース"><a href="/" ${authorMode?'':'aria-current="page"'}>Editor</a><a href="/?view=author" ${requestedView==='author'?'aria-current="page"':''}>Author</a>${invited&&trialSession.principal.role==='admin'?`<a href="/?view=admin" ${adminMode?'aria-current="page"':''}>Admin</a>`:''}</nav>
      <span class="environment-tag" id="account-status"><span class="status-dot"></span>LOCAL QA · クラウド未接続</span><button class="quiet-button account-logout" id="trial-logout" type="button" hidden>ログアウト</button>
    </header>
    <section class="workspace-heading"><div><p class="eyebrow">${authorMode?'CRAFT A LOOK':'YOUR ORIGINAL. YOUR INTENTION.'}</p><h1>${authorMode?'作者ワークスペース':'写真を、意図した一枚に。'}</h1></div><div class="heading-actions"><span class="save-indicator" id="save-indicator">写真未選択</span><button class="button primary" data-action="import">＋ RAW を読み込む</button></div></section>
    <p class="trial-scope-notice" id="trial-scope-notice" role="note">Web試用版です。実カメラRAWの画質、実人物補正、iPad実機操作は未検証です。一般販売版ではありません。</p>
    <input id="raw-file" type="file" accept=".raw,.dng,.cr2,.cr3,.nef,.nrw,.arw,.raf,.rw2,.orf,.pef,.srw" hidden>
    <div class="error-banner" id="error-banner" role="alert" hidden></div>
    <div class="trial-deadline" id="trial-deadline" hidden><span id="trial-deadline-value"></span><p id="trial-ended-notice" role="status" aria-live="polite" hidden></p></div>
    <div class="workspace-grid">
      <aside class="library-panel" aria-label="写真ライブラリ"><div class="panel-title"><h2>ライブラリ</h2><span id="asset-count" class="count-label">0</span></div><p class="panel-caption">Original はそのまま。<br>編集は Recipe に。</p><div id="library-list" class="library-list"></div><div class="library-bottom"><span class="small-status">LOCAL ORIGINALS</span><p>この検証版の保存先はローカル QA サーバーです。本番認証・Cloud Sync は未接続です。</p></div></aside>
      <main class="image-workspace" aria-label="写真プレビュー">
        <div class="image-toolbar"><div class="image-title"><span class="small-status">EDITING</span><span id="asset-name">未選択</span></div><div class="history-actions"><button class="icon-button" data-action="undo" aria-label="元に戻す" title="Undo">↶</button><button class="icon-button" data-action="redo" aria-label="やり直す" title="Redo">↷</button><button class="quiet-button" data-action="reset">リセット</button></div></div>
        <div class="photo-stage" id="photo-stage">
          <div class="empty-photo" id="empty-photo"><div class="empty-frame" aria-hidden="true"><span>＋</span></div><p class="eyebrow">BEGIN WITH A RAW ORIGINAL</p><h2>まだ、あなたの写真がありません。</h2><p>RAW を読み込み、実際の写真で編集を始めます。<br>サンプル写真や仮の人物は表示しません。</p><button class="button primary" data-action="import">RAW ファイルを選択</button><span class="empty-footnote">原本保持 · 非破壊 Recipe · ローカル検証版</span></div>
          <div id="image-view" class="image-view" hidden><figure class="photo-figure" id="before-figure"><img id="before-image" alt="補正前の実 RAW upright プレビュー"><figcaption>BEFORE <span>unedited upright</span></figcaption></figure><figure class="photo-figure" id="after-figure"><img id="after-image" alt="現在の Recipe による回転・Crop後のプレビュー"><figcaption>AFTER <span>rotation / crop applied</span></figcaption></figure></div>
          <div class="stage-busy" id="stage-busy" role="status" hidden><span class="spinner" aria-hidden="true"></span><span id="busy-label"></span></div>
        </div>
        <div class="preview-footer"><span id="preview-note">RAW を選択するとプレビューが表示されます</span><div class="segmented" role="group" aria-label="比較表示"><button data-view="before">Before</button><button data-view="split">比較</button><button data-view="after" aria-pressed="true">After</button></div></div>
        <div class="session-footer"><span class="status-dot" aria-hidden="true"></span><p id="session-status" role="status" aria-live="polite"></p><span id="revision-label">REV —</span></div>
        <details class="provenance-panel"><summary>処理の出典・安全確認 <span>PROVENANCE</span></summary><pre id="provenance">実写真の処理情報はまだありません。</pre><p>Web の数値・画面確認は Apple / Safari / iPad 実機・人物画素・実 RAW 合格の代わりではありません。</p></details>
      </main>
      <aside class="adjustment-panel" aria-label="編集調整">
        <div class="panel-title"><h2>調整</h2><span class="small-status">RECIPE</span></div>
        <section class="control-section"><div class="section-heading"><h3>写真全体</h3><span>GLOBAL</span></div><div id="global-controls"></div><div class="rotation-row"><span>回転 <output id="rotation-value">0°</output></span><button class="button compact" data-action="rotate">↻ 90°</button></div><label class="crop-control" for="crop-ratio">切り抜き比率<select id="crop-ratio"><option value="original">Original</option><option value="1:1">1:1</option><option value="3:2">3:2</option><option value="2:3">2:3</option><option value="4:3">4:3</option><option value="3:4">3:4</option><option value="5:4">5:4</option><option value="4:5">4:5</option><option value="16:9">16:9</option><option value="9:16">9:16</option></select></label><p class="crop-state">Recipe: <output id="crop-preset-value">original</output></p><p class="safety-note">固定9比率を回転後の画像中央で切り抜きます。Free/Custom矩形編集と印刷実寸resizeは未対応です。</p></section>
        <section class="control-section"><div class="section-heading"><h3>明るさ・色</h3><span>8-BIT sRGB</span></div><div id="color-controls"></div><p class="safety-note">RAW段階のWBや失われたハイライト復元ではありません。現在の画素から局所トーンと彩度を調整します。</p></section>
        <section class="control-section"><div class="section-heading"><h3>質感・細部</h3><span>8-BIT sRGB</span></div><div id="detail-controls"></div><p class="safety-note">明瞭度、テクスチャ、シャープは別処理です。実RAW・大容量画像の画質とメモリは未検証です。</p></section>
        <details class="control-section"><summary>HSL · 色別調整</summary><div id="hsl-controls"></div><p class="safety-note">8色の色相・彩度・HSL明度。RAW色復元やカメラプロファイル調整ではありません。</p></details>
        <section class="control-section"><div class="section-heading"><h3>人物</h3><span>FACE BRIGHTNESS</span></div><p class="control-help">この写真を解析し、補正する人物を明示的に選択します。</p><p class="control-help" id="person-processing-notice" role="status">顔解析SDKの通信・同意確認待ちのため、実写真の人物処理は停止中</p><button class="button full" data-action="detect">顔の対象を確認</button><div class="person-reference" id="person-reference" hidden><div class="person-reference-image"><img id="person-reference-image" alt="人物選択用の未補正 upright 写真"><div id="person-reference-boxes"></div></div></div><div id="people-list" class="people-list"></div><p id="person-note" class="person-note">人物は未解析です。</p><label class="range-control face-control"><span class="range-label"><span>顔の明るさ <small>CUSTOM EV</small></span><output id="face-value">0 EV</output></span><input id="face-brightness" type="range" min="-4" max="4" step="0.1" value="0" aria-label="選択人物の顔の明るさ"><span class="range-scale"><span>−4</span><span>0</span><span>＋4 EV</span></span></label><p class="safety-note">変更後は安全再検証で選択が解除されます。再編集には「顔の対象を確認」→人物選択が必要です。顔 oval 限定で Apple と同等の解析ではありません。</p></section>
        <section class="control-section save-section"><div class="section-heading"><h3>Recipe を保存</h3><span>LOCAL SERVER</span></div><div class="button-pair"><button class="button primary" data-action="save">保存</button><button class="button" data-action="reload">再読込</button></div><p class="control-help" id="save-help">写真を読み込んでください。</p></section>
        <section class="control-section export-section"><div class="section-heading"><h3>最終書き出し</h3><span>ORIGINAL → FINAL</span></div><p class="control-help">保存済み Recipe を固定し、Original を再確認して書き出します。</p><div class="button-pair"><button class="button" data-action="export-jpeg">JPEG</button><button class="button" data-action="export-png">PNG</button></div><button class="quiet-button full" data-action="cancel-export" hidden>書き出しを中断</button><a id="download-link" class="download-link" hidden>生成済み Final をダウンロード</a><p class="export-note" id="export-note">先に写真を保存してください。</p><p class="safety-note">JPEG / PNG · 8-bit sRGB · metadata除去。ブラウザ既定dpi（通常96、印刷dpi未保証）。TIFF / Adobe RGB / 16-bit / 印刷実寸resize は未対応です。</p></section>
      </aside>
    </div>
    <section class="author-preview" id="author-preview" ${authorMode?'':'hidden'}><div class="author-heading"><div><p class="eyebrow">AUTHORING · PREVIEW ONLY</p><h2>あなたの Look を、形に。</h2><p>入力と現在の Recipe のプレビューだけです。作者認証・下書き保存・提出は未接続です。</p></div><span class="blocked-tag">NOT_CONNECTED</span></div><div class="author-grid"><form id="author-form"><label>Look の名前<input name="lookName" maxlength="120" placeholder="例：Soft afternoon" autocomplete="off"></label><div class="author-field-pair"><label>作者名<input name="author" maxlength="120" placeholder="Your name" autocomplete="name"></label><label>Version<input name="version" maxlength="40" placeholder="例：1.0.0" autocomplete="off"></label></div><label>Draft メモ<textarea name="draft" maxlength="2000" rows="3" placeholder="この Look の意図や使い方"></textarea></label><div class="button-pair"><button class="button" type="button" disabled>下書きを保存 · 未接続</button><button class="button primary" type="submit" disabled>レビューへ提出 · 未接続</button></div><p class="control-help">入力はこの画面のメモリ内のみ。移動・再読込で失われます。招待・一般公開・採用はできません。</p></form><article class="look-card"><span class="small-status">LOOK PREVIEW / NOT SUBMITTED</span><h3 id="look-title">Untitled look</h3><p id="look-byline">作者未入力 · version 未入力</p><p id="look-description">Look のメモがここに表示されます。</p><div class="look-recipe"><span id="look-asset">写真未選択</span><span id="look-revision">Recipe 未保存</span></div><p class="safety-note">認証された作者ページや保存済み Preset ではありません。</p></article></div></section>
    <section class="filmstrip" aria-label="写真一覧"><div class="filmstrip-heading"><div><span class="small-status">PHOTO LIST</span><h2>写真一覧 <span id="filmstrip-position">0 / 0</span></h2></div><p id="filmstrip-help">写真を横にスクロールして選択できます。</p></div><div class="filmstrip-row"><button class="filmstrip-edge" type="button" data-strip-nav="previous" aria-label="前の写真" title="前の写真">‹</button><div class="filmstrip-track" id="filmstrip-track" role="group" aria-label="写真を横にスクロール"><div class="filmstrip-items" id="filmstrip-items"></div></div><button class="filmstrip-edge" type="button" data-strip-nav="next" aria-label="次の写真" title="次の写真">›</button></div></section>
    <footer class="app-footer"><span>SUITE / EARLY WEB VERIFICATION</span><span id="trial-footer">Author / Auth / Cloud / Billing 未接続 · Safari / iPad 実機 NOT_RUN</span></footer>`;
  const byID=id=>root.querySelector(`#${id}`);
  if(invited){
    byID('account-status').textContent=`招待試用 · ${trialSession.principal.authorName} · 期限 ${trialSession.principal.trialEndsAt||'未設定'}`;byID('trial-logout').hidden=false;byID('trial-footer').textContent='INVITED LOCAL TRIAL · Cloud / Billing未接続 · 人物Privacy BLOCK · Safari / iPad実機NOT_RUN';
    if(authorMode){const authorSection=byID('author-preview');authorDispose=mountAuthor({container:authorSection,api:authorAPI,session,principal:trialSession.principal,mode:trialSession.mode,access});root.querySelector('.workspace-grid').before(authorSection);}
    byID('account-status').textContent=trialSession.principal.role==='admin'&&!trialSession.principal.trialEndsAt?`Sites 管理者 · ${trialSession.principal.authorName}`:`${trialSession.mode==='SITES'?'Sites 招待試用':'ローカル招待試用'} · ${trialSession.principal.authorName} · 期限 ${trialSession.principal.trialEndsAt||'未設定'}`;
    byID('trial-footer').textContent=`${trialSession.mode} · Cloud / Billing未接続 · 人物Privacy BLOCK · Safari / iPad実機NOT_RUN`;
    root.querySelector('.library-bottom p').textContent='招待本人のOriginalとRecipeを試用サーバーへ保存します。本番Cloud Syncとは別です。';
    const presets=element('section','preset-library');root.querySelector('.provenance-panel').after(presets);additionalDisposers.push(mountPresetLibrary({container:presets,api:authorAPI,session,access}));
    if(authorMode&&trialSession.principal.role==='admin'){const review=element('section','admin-review');byID('author-preview').append(review);additionalDisposers.push(mountAdminReview({container:review,api:authorAPI,principal:trialSession.principal,access}));}
    if(authorMode&&trialSession.principal.role==='admin'){const members=element('section','trial-members');byID('author-preview').append(members);additionalDisposers.push(mountTrialMembers({container:members,api:authorAPI,principal:trialSession.principal,mode:trialSession.mode,access}));}
  }
  if(trialSession?.mode==='PUBLIC_BROWSER_LOCAL'){
    byID('account-status').textContent='ブラウザ内ローカル · Cloud未接続';
    byID('trial-scope-notice').textContent='Web試用版：実カメラRAWの画質・iPad実機は未検証、実写真の人物解析は停止中です。写真と編集はこのブラウザ内だけに保存されます。Cloud保存・同期・プリセット提出は利用できません。共有端末では利用者別の保護はできません。';
    byID('trial-footer').textContent='この端末のみ · Cloud提出/同期未接続 · Safari / iPad実機NOT_RUN';
    root.querySelector('.library-bottom p').textContent='このブラウザ内の写真一覧です。別端末同期とCloud提出は未接続です。';
    if(trialSession.signInURL){try{const link=element('a','cloud-sign-in','本人確認 · 所有者/招待済みのみ');link.href=validatedSignInURL(trialSession.signInURL);root.querySelector('.header-nav').append(link);}catch{/* No unverified sign-in link. Local editing remains available. */}}
  }
  const strip=byID('filmstrip-track'),stripGesture=createFilmstripGesture(strip);
  for(const config of adjustments){
    const id=config.id||config.key;const label=element('label','range-control');label.innerHTML=`<span class="range-label"><span>${config.label}<small>${config.english}</small></span><output id="${id}-value">${config.initial}</output></span><input type="range" id="${id}" min="${config.min}" max="${config.max}" step="${config.step}" value="${config.initial}" aria-label="${config.label}"><span class="range-scale"><span>${config.min}</span><span>${config.initial}</span><span>${config.max}</span></span>`;byID(config.group?`${config.group}-controls`:'global-controls').append(label);
    byID(id).addEventListener('input',event=>{byID(`${id}-value`).textContent=formatValue(event.target.value,config.unit);},{signal:lifetime.signal});
    byID(id).addEventListener('change',event=>run('setAdjustment',config.key,Number(event.target.value)),{signal:lifetime.signal});
  }
  async function run(method,...args){
    const cancellation=method==='cancelExport';
    if(access.reason()&&!cancellation){render(state);return;}
    if(disposed||(pending&&!cancellation)||((state.busy||state.exporting)&&!cancellation))return;
    if(typeof session[method]!=='function'){localError=`${method}: NOT_CONNECTED`;render(state);return;}
    if(!cancellation)pending=true;localError='';render(state);
    try {const result=await session[method](...args);if(method==='exportFinal')publishDownload(result,args[0]?.format);}
    catch(error){localError=error instanceof Error?error.message:String(error);access.end(localError);}
    finally{if(!cancellation)pending=false;if(!disposed)render(session.state??state);}
  }
  function publishDownload(result,format){
    if(access.reason())return;
    const blob=result instanceof Blob?result:result?.blob;
    if(!(blob instanceof Blob))return; // Session may own delivery; never fabricate an export result.
    if(downloadURL)URL.revokeObjectURL(downloadURL);
    downloadURL=URL.createObjectURL(blob);downloadAssetID=state.asset?.id;const link=byID('download-link');link.href=downloadURL;link.download=`${String(assetName(state.asset)).replace(/\.[^.]+$/,'')}-r${state.revision}-final.${format==='png'?'png':'jpg'}`;link.textContent=`生成済み Final · r${state.revision} · ${format.toUpperCase()}`;link.hidden=false;link.click();
  }
  function setImage(id,url){const image=byID(id);const safe=safeImageURL(url);if(safe){if(image.getAttribute('src')!==safe)image.src=safe;}else image.removeAttribute('src');image.hidden=!safe;return Boolean(safe);}
  function render(next){
    if(disposed)return;state={...EMPTY,...next};const busy=Boolean(state.busy)||Boolean(state.exporting)||pending;const loaded=Boolean(state.asset);const params=state.recipe?.parameters??{};const personBlocked=state.personProcessingStatus!=='SYNTHETIC_TEST_ONLY';
    root.setAttribute('aria-busy',String(busy));
    if(invited){const reason=access.reason(),owner=trialSession.principal.role==='admin'&&!trialSession.principal.trialEndsAt;byID('trial-deadline').hidden=owner;byID('trial-deadline-value').textContent=owner?'管理者本人の操作です。':`編集期限: ${trialSession.principal.trialEndsAt||'未設定（操作不可）'}`;byID('account-status').title=owner?`${trialSession.principal.authorName} / 管理者本人認証済み`:`${trialSession.principal.authorName} / 編集期限: ${trialSession.principal.trialEndsAt||'未設定'}`;byID('trial-ended-notice').hidden=!reason;byID('trial-ended-notice').textContent=reason?`${reason} — 試用は終了または取り消されています。追加編集・書出し・作者操作は停止中です。表示中の写真、原本、保存済みRecipe・提出は削除しません。管理者へ確認してください。`:'';if(reason&&downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;downloadAssetID=null;byID('download-link').removeAttribute('href');byID('download-link').hidden=true;}}
    byID('asset-count').textContent=String(state.assets?.length??0);byID('asset-name').textContent=assetName(state.asset);byID('revision-label').textContent=loaded?`REV ${state.revision??0}`:'REV —';
    byID('save-indicator').textContent=!loaded?'写真未選択':state.dirty?'未保存の変更あり':`保存済み · r${state.revision??0}`;byID('save-indicator').classList.toggle('is-dirty',Boolean(state.dirty));
    byID('session-status').textContent=state.status??(loaded?'ローカル検証版':'RAW を読み込んでください');
    const error=localError||state.error;byID('error-banner').hidden=!error;byID('error-banner').textContent=error?`処理を完了できませんでした：${error instanceof Error?error.message:String(error)}。未完了の操作を成功扱いにしません。`:'';
    if(previewAssetID!==state.asset?.id){blockedBeforeURL=previousBeforeURL;blockedAfterURL=previousAfterURL;previewAssetID=state.asset?.id??null;}
    const currentBeforeURL=state.beforeURL!==blockedBeforeURL?state.beforeURL:null;const currentAfterURL=state.afterURL!==blockedAfterURL?state.afterURL:null;
    previousBeforeURL=state.beforeURL;previousAfterURL=state.afterURL;
    const before=loaded&&setImage('before-image',currentBeforeURL);const after=loaded&&setImage('after-image',currentAfterURL);
    if(!loaded){setImage('before-image',null);setImage('after-image',null);}
    const hasImage=before||after;byID('empty-photo').hidden=hasImage;byID('empty-photo').querySelector('h2').textContent=loaded?'プレビューを表示できていません。':'まだ、あなたの写真がありません。';byID('image-view').hidden=!hasImage;byID('image-view').classList.toggle('is-split',mode==='split');byID('before-figure').hidden=!(before&&(mode==='before'||mode==='split'||!after));byID('after-figure').hidden=!(after&&(mode==='after'||mode==='split'||!before));
    byID('stage-busy').hidden=!busy;byID('busy-label').textContent=typeof state.busy==='string'?state.busy:'処理中…';byID('photo-stage').classList.toggle('has-image',Boolean(hasImage));
    byID('preview-note').textContent=!loaded?'RAW を選択するとプレビューが表示されます':!hasImage?'この写真のプレビューはまだありません':'Before: 未補正upright / After: 回転・中心Crop後（画像枠は異なります）· FinalはOriginalから';
    for(const button of root.querySelectorAll('[data-view]')){button.disabled=!hasImage;button.setAttribute('aria-pressed',String(button.dataset.view===mode));}
    const list=byID('library-list');list.replaceChildren();
    if(!state.assets?.length)list.append(element('p','library-empty','読み込んだ写真がここに並びます。'));
    const canNavigate=canSwitchPhoto(state,{pending,blocked:Boolean(access.reason())});
    for(const asset of state.assets??[]){const button=element('button',`asset-card${asset.id===state.asset?.id?' is-selected':''}`);button.type='button';button.dataset.assetId=asset.id;button.disabled=!canNavigate;button.title=state.dirty?'未保存の変更を先に保存してください。':'';button.setAttribute('aria-pressed',String(asset.id===state.asset?.id));button.append(element('span','asset-file-mark','RAW'),element('span','asset-card-name',assetName(asset)),element('span','asset-card-id',shortID(asset.id)));list.append(button);}
    const assets=state.assets??[],selectedID=state.asset?.id,selectedIndex=assets.findIndex(asset=>asset.id===selectedID),stripItems=byID('filmstrip-items'),fragment=document.createDocumentFragment();
    byID('filmstrip-position').textContent=`${selectedIndex+1} / ${assets.length}`;
    byID('filmstrip-help').textContent=state.dirty?'未保存の変更があります。保存してから別の写真を選択してください。':trialSession?.mode==='PUBLIC_BROWSER_LOCAL'?'この端末だけの写真一覧です。Cloud提出は未接続です。':'横にスクロールして写真を選択できます。';
    for(const [index,asset] of assets.entries()){const button=element('button',`filmstrip-item${asset.id===selectedID?' is-selected':''}`);button.type='button';button.dataset.assetId=asset.id;button.disabled=!canNavigate;button.title=state.dirty?'未保存の変更を先に保存してください。':assetName(asset);button.setAttribute('aria-pressed',String(asset.id===selectedID));button.setAttribute('aria-label',`${index+1}枚目: ${assetName(asset)}`);button.append(element('span','filmstrip-number',String(index+1)),element('span','filmstrip-raw','RAW'),element('span','filmstrip-name',assetName(asset)));fragment.append(button);}
    if(!assets.length)fragment.append(element('p','filmstrip-empty','写真を読み込むと、ここから横に移動できます。'));
    stripItems.replaceChildren(fragment);
    byID('filmstrip-track').setAttribute('aria-disabled',String(!canNavigate));
    byID('filmstrip-track').setAttribute('aria-label',`写真一覧、${assets.length}枚、選択中${selectedIndex+1}枚目`);
    root.querySelector('[data-strip-nav="previous"]').disabled=!canNavigate||!adjacentPhotoID(assets,selectedID,-1);
    root.querySelector('[data-strip-nav="next"]').disabled=!canNavigate||!adjacentPhotoID(assets,selectedID,1);
    if(stripSelectedID!==selectedID){stripSelectedID=selectedID;stripItems.querySelector('.is-selected')?.scrollIntoView?.({inline:'nearest',block:'nearest'});}
    for(const config of adjustments){const id=config.id||config.key,current=adjustmentValue(params,config.key),value=Number.isFinite(current)?current:config.initial;byID(id).value=String(value);byID(id).disabled=!loaded||busy||typeof session.setAdjustment!=='function';byID(`${id}-value`).textContent=formatValue(value,config.unit);}
    byID('rotation-value').textContent=`${params.rotationDegrees??0}°`;
    const cropPreset=params.extendedParameters?.crop?.preset_name??'original';const cropValue=String(cropPreset).toLowerCase();const cropSelect=byID('crop-ratio');cropSelect.value=Array.from(cropSelect.options).some(option=>option.value===cropValue)?cropValue:'';byID('crop-preset-value').textContent=String(cropPreset);cropSelect.disabled=!loaded||busy||typeof session.setAdjustment!=='function';
    const people=loaded?(state.people??[]):[];const selected=people.find(person=>person.id===state.selectedPersonID);const peopleList=byID('people-list');peopleList.replaceChildren();
    people.forEach((person,index)=>{const button=element('button',`person-chip${person.id===state.selectedPersonID?' is-selected':''}`);button.type='button';button.dataset.personId=person.id;button.disabled=busy||person.complete!==true||typeof session.selectPerson!=='function';button.setAttribute('aria-pressed',String(person.id===state.selectedPersonID));button.append(element('span','person-chip-number',String(index+1)),element('span','',`人物 ${index+1}`),element('small','',shortID(person.id)));peopleList.append(button);});
    byID('person-reference').hidden=!before||!people.length;setImage('person-reference-image',people.length?currentBeforeURL:null);const boxes=byID('person-reference-boxes');boxes.replaceChildren();people.forEach((person,index)=>{const a=person.anchor;if(!a||![a.x,a.y,a.width,a.height].every(Number.isFinite)||a.x<0||a.y<0||a.width<=0||a.height<=0||a.x+a.width>1||a.y+a.height>1)return;const button=element('button',`person-box${person.id===state.selectedPersonID?' is-selected':''}`,String(index+1));button.type='button';button.dataset.personId=person.id;button.setAttribute('aria-label',`写真上の人物 ${index+1} を選択`);button.disabled=busy||person.complete!==true;button.style.left=`${a.x*100}%`;button.style.top=`${(1-a.y-a.height)*100}%`;button.style.width=`${a.width*100}%`;button.style.height=`${a.height*100}%`;boxes.append(button);});
    byID('person-note').textContent=!loaded?'人物は未解析です。':selected?`選択中：${shortID(selected.id)} · 写真内 UUID`:people.length?'写真上の番号かボタンで補正する人物を選んでください。':'未解析 / 再検証後。顔の対象を確認して選択してください。';
    byID('person-processing-notice').textContent=personBlocked?'顔解析SDKの通信・同意確認待ちのため、実写真の人物処理は停止中':'SYNTHETIC_TEST_ONLY — 合成人工fixture専用。実写真の人物処理許可ではありません。';
    const selectedRecipeTarget=params.extendedParameters?.portrait?.targets?.find(target=>target.id===state.selectedPersonID);const face=Number.isFinite(selectedRecipeTarget?.value)?selectedRecipeTarget.value:Number.isFinite(selected?.value)?selected.value:0;byID('face-brightness').value=String(face);byID('face-value').textContent=formatValue(face,' EV');byID('face-brightness').disabled=personBlocked||!loaded||busy||!selected||selected.complete!==true||typeof session.setAdjustment!=='function';
    const enabled={import:!busy&&!state.dirty,undo:loaded&&!busy&&state.canUndo,redo:loaded&&!busy&&state.canRedo,reset:loaded&&!busy,rotate:loaded&&!busy,detect:!personBlocked&&loaded&&!busy,save:loaded&&!busy&&state.dirty,reload:loaded&&!busy&&!state.dirty,'export-jpeg':loaded&&!busy&&!state.dirty&&state.revision>0,'export-png':loaded&&!busy&&!state.dirty&&state.revision>0,'cancel-export':Boolean(state.exporting)};
    const methods={import:'importRaw',undo:'undo',redo:'redo',reset:'reset',rotate:'setAdjustment',detect:'detectPeople',save:'save',reload:'reload','export-jpeg':'exportFinal','export-png':'exportFinal','cancel-export':'cancelExport'};
    for(const button of root.querySelectorAll('[data-action]'))button.disabled=!enabled[button.dataset.action]||typeof session[methods[button.dataset.action]]!=='function';
    root.querySelector('[data-action="cancel-export"]').hidden=!state.exporting;byID('raw-file').disabled=busy||state.dirty;if(downloadAssetID!==state.asset?.id)byID('download-link').hidden=true;
    byID('save-help').textContent=!loaded?'写真を読み込んでください。':state.dirty?'未保存の変更があります。保存後に Final を書き出せます。':'保存済み Recipe。再読込はサーバーの記録を取得します。';
    byID('export-note').textContent=!loaded?'先に写真を保存してください。':state.dirty?'未保存の変更あり — 先に保存してください。':state.revision>0?`固定対象：revision ${state.revision} · Original SHA を再確認`:'先に Recipe を保存してください。';
    byID('provenance').textContent=loaded?JSON.stringify({provenance:state.provenance??'NOT_AVAILABLE',metadata:state.metadata??'NOT_AVAILABLE',evidence:state.evidence??[]},null,2):'実写真の処理情報はまだありません。';
    if(byID('look-asset'))byID('look-asset').textContent=loaded?assetName(state.asset):'写真未選択';if(byID('look-revision'))byID('look-revision').textContent=loaded?`${state.dirty?'未保存 · ':''}revision ${state.revision??0}`:'Recipe 未保存';
    byID('trial-logout').disabled=busy||state.dirty||typeof authorAPI?.logout!=='function';
    const reason=access.reason();if(endedCodes.includes(state.error))access.end(state.error);if(reason){for(const control of root.querySelectorAll('.workspace-grid input,.workspace-grid select,.workspace-grid button,.heading-actions button'))if(control.dataset.view===undefined&&control.dataset.action!=='cancel-export')control.disabled=true;byID('raw-file').disabled=true;byID('download-link').hidden=true;}
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.view){mode=button.dataset.view;render(state);return;}
    if(button.dataset.stripNav){if(!canSwitchPhoto(state,{pending,blocked:Boolean(access.reason())}))return;const id=adjacentPhotoID(state.assets,state.asset?.id,button.dataset.stripNav==='next'?1:-1);if(id)run('openAsset',id);return;}
    if(button.dataset.assetId){if(button.closest('#filmstrip-track')&&stripGesture.suppressClick())return;if(!canSwitchPhoto(state,{pending,blocked:Boolean(access.reason())})){if(state.dirty){localError='未保存の変更があります。先に保存してください。';render(state);}return;}if(button.dataset.assetId!==state.asset?.id)run('openAsset',button.dataset.assetId);return;}
    if(button.dataset.personId){run('selectPerson',button.dataset.personId);return;}
    switch(button.dataset.action){case'import':byID('raw-file').click();break;case'rotate':run('setAdjustment','rotationDegrees',((state.recipe?.parameters?.rotationDegrees??0)+90)%360);break;case'detect':run('detectPeople');break;case'reload':if(!state.dirty||window.confirm('未保存の変更を保持するかどうかは session の再読込処理で確認されます。再読込を続けますか？'))run('reload');break;case'export-jpeg':run('exportFinal',{format:'jpeg',quality:0.95});break;case'export-png':run('exportFinal',{format:'png',quality:1});break;case'cancel-export':run('cancelExport');break;default:if(button.dataset.action)run(button.dataset.action);}
  },{signal:lifetime.signal});
  strip.addEventListener('pointerdown',event=>stripGesture.pointerDown(event),{signal:lifetime.signal});
  strip.addEventListener('pointermove',event=>stripGesture.pointerMove(event),{signal:lifetime.signal});
  strip.addEventListener('pointerup',event=>stripGesture.pointerEnd(event),{signal:lifetime.signal});
  strip.addEventListener('pointercancel',event=>stripGesture.pointerEnd(event),{signal:lifetime.signal});
  strip.addEventListener('scroll',()=>stripGesture.scroll(),{passive:true,signal:lifetime.signal});
  strip.addEventListener('wheel',event=>stripGesture.wheel(event),{passive:false,signal:lifetime.signal});
  strip.addEventListener('dragstart',event=>event.preventDefault(),{signal:lifetime.signal});
  strip.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key)||!canSwitchPhoto(state,{pending,blocked:Boolean(access.reason())}))return;const id=adjacentPhotoID(state.assets,state.asset?.id,event.key==='ArrowRight'?1:-1);if(id){event.preventDefault();run('openAsset',id);}},{signal:lifetime.signal});
  byID('raw-file').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)run('importRaw',file);},{signal:lifetime.signal});
  byID('face-brightness').addEventListener('input',event=>{byID('face-value').textContent=formatValue(event.target.value,' EV');},{signal:lifetime.signal});
  byID('face-brightness').addEventListener('change',event=>run('setAdjustment','faceBrightness',Number(event.target.value)),{signal:lifetime.signal});
  byID('crop-ratio').addEventListener('change',event=>{if(event.target.disabled){render(state);return;}run('setAdjustment','cropRatio',event.target.value);},{signal:lifetime.signal});
  if(byID('author-form')){
    byID('author-form').addEventListener('submit',event=>event.preventDefault(),{signal:lifetime.signal});
    byID('author-form').addEventListener('input',()=>{const fields=new FormData(byID('author-form'));byID('look-title').textContent=String(fields.get('lookName')||'Untitled look');byID('look-byline').textContent=`${fields.get('author')||'作者未入力'} · version ${fields.get('version')||'未入力'}`;byID('look-description').textContent=String(fields.get('draft')||'Look のメモがここに表示されます。');},{signal:lifetime.signal});
  }
  byID('trial-logout').addEventListener('click',async()=>{
    if(byID('trial-logout').disabled)return;if(authorDispose?.hasUnsavedChanges?.()){localError='未保存の作者下書きがあります。先に保存してください。';render(state);return;}
    pending=true;localError='';render(state);try{const result=await authorAPI.logout();if(trialSession?.mode==='SITES'){if(!result||Object.keys(result).length!==1||!Object.hasOwn(result,'signOutURL'))throw Error('SIGNOUT_ROUTE_UNCONFIRMED');const signOutURL=validatedSignOutURL(result.signOutURL);if(!disposed)location.assign(signOutURL);}else{const check=await authorAPI.getSession();if(check.principal)throw Error('LOGOUT_NOT_CONFIRMED');if(!disposed)location.assign('/login');}}catch(err){localError=err.message??String(err);}finally{pending=false;if(!disposed)render(state);}
  },{signal:lifetime.signal});
  render(state);const unsubscribe=session.subscribe(render);
  const deadlineTimer=invited?setInterval(()=>{if(access.reason()){for(const fn of accessListeners)fn();render(state);}},1000):null;
  return ()=>{disposed=true;lifetime.abort();if(deadlineTimer!==null)clearInterval(deadlineTimer);accessListeners.clear();if(typeof unsubscribe==='function')unsubscribe();if(typeof authorDispose==='function')authorDispose();for(const dispose of additionalDisposers)dispose();if(downloadURL)URL.revokeObjectURL(downloadURL);};
}
