import {validateWebDepthRange} from '../../../dist/apps/backend/src/web-depth-range.js';

const MAX_FILE=2*1024*1024,SHA=/^[a-f0-9]{64}$/;
const copy=value=>structuredClone(value);
const keyOf=state=>JSON.stringify([state?.asset?.id,state?.asset?.sha256,state?.revision,state?.recipe]);
function exact(value,keys){
  if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return !d?.enumerable||!Object.hasOwn(d,'value');}))throw Error('DEPTH_JSON_FIELDS');
}
function dimensions(width,height,limit){if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height)||width*height>limit)throw Error('DEPTH_JSON_DIMENSIONS');}
function depthFile(value){
  exact(value,['schemaVersion','sourceSHA256','sourceWidth','sourceHeight','width','height','data','validity']);
  if(value.schemaVersion!==1||typeof value.sourceSHA256!=='string'||!SHA.test(value.sourceSHA256))throw Error('DEPTH_JSON_VERSION_OR_SHA');
  dimensions(value.sourceWidth,value.sourceHeight,96_000_000);dimensions(value.width,value.height,65536);
  const length=value.width*value.height;
  for(const key of ['data','validity']){
    const a=value[key];if(!Array.isArray(a)||a.length!==length||Reflect.ownKeys(a).length!==length+1)throw Error('DEPTH_JSON_GRID_LENGTH');
    for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(a,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='number'||!Number.isFinite(d.value)||
      (key==='data'?(d.value<0||d.value>1):(d.value!==0&&d.value!==1)))throw Error('DEPTH_JSON_GRID_VALUE');}
  }
  return {sourceSHA256:value.sourceSHA256,sourceWidth:value.sourceWidth,sourceHeight:value.sourceHeight,depth:{width:value.width,height:value.height,data:[...value.data],validity:[...value.validity]}};
}

/** User-supplied depth only; no inference, sidecar discovery or network upload. */
export function mountWebDepthRange(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('DEPTH_RANGE_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','手持ち深度データによる範囲調整');
  root.append(el('h3','手持ち深度データの範囲調整'),el('p','2MiB以下のJSONを明示選択してください。元写真全体のupright（向き補正済み・未Crop）に対応する、左上原点・near=0／far=1の正規化深度だけを扱います。AI推論や深度の推測・補完はしません。写真のSHAと原寸寸法を照合しますが、対応の正しさはご自身でも確認してください。'));
  const fields=el('fieldset'),file=el('input');file.type='file';file.accept='.json,application/json';
  const wrap=(text,input)=>{const label=el('label',text);label.append(input);fields.append(label);};wrap('深度JSONを1件選択 ',file);
  const load=el('button','選択JSONを確認して下書きへ読み込む');load.type='button';fields.append(load);
  const summary=el('p');fields.append(summary);
  const consent=el('input');consent.type='checkbox';wrap('この深度データが現在の写真1枚全体（向き補正済み・未Crop）と一致することを確認した ',consent);
  function numeric(text,min,max,step,value){const input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);input.required=true;wrap(text,input);return input;}
  const edges=['近側フェード開始','近側の全適用開始','遠側の全適用終了','遠側フェード終了'].map((label,i)=>numeric(label+'（0〜1、昇順） ',0,1,.01,i<2?0:1));
  const invert=el('input');invert.type='checkbox';wrap('範囲を反転（無効な深度は反転しても除外） ',invert);
  const exposure=numeric('露光量（EV） ',-4,4,.1,0),contrast=numeric('コントラスト ',-100,100,1,0),saturation=numeric('彩度 ',-100,100,1,0);
  const apply=el('button','確認した深度範囲を適用'),reset=el('button','保存済み設定へ戻す'),clear=el('button','深度範囲調整を解除');
  for(const button of [apply,reset,clear])button.type='button';fields.append(apply,reset);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(fields,clear,el('p','深度グリッドは最大65,536点、原寸metadataは96MP以下です。これは96MPのFinal描画を保証する上限ではありません。各dataは0〜1、validityは同じ点数の0／1配列が必要です。読み込み・数値変更だけでは画像は変わりません。写真固有の深度をRecipeへ保存し、可搬Presetには含めません。'),status);container.append(root);
  let state=null,key=null,accessKey=null,sourceKey=null,draft=null,pending=false,disposed=false,generation=0,dirty=false;
  function allowed(){try{return !disposed&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setWebDepthRange==='function';}catch{return false;}}
  function source(){const size=session.depthRangeSourceDimensions;dimensions(size?.width,size?.height,96_000_000);return {width:size.width,height:size.height};}
  function sourceSignature(){try{return JSON.stringify(source());}catch{return 'unavailable';}}
  function bound(value){const size=source();if(value.assetID!==undefined&&value.assetID!==state.asset.id||value.sourceSHA256!==state.asset.sha256?.toLowerCase()||value.sourceWidth!==size.width||value.sourceHeight!==size.height)throw Error('現在の写真のSHAまたは原寸寸法と一致しません。');}
  function controls(){fields.disabled=pending||!allowed();load.disabled=file.files?.length!==1;apply.disabled=!draft||!consent.checked;reset.disabled=!dirty;consent.disabled=!draft;clear.disabled=pending||!allowed()||state?.recipe?.parameters?.extendedParameters?.webDepthRange===undefined;root.setAttribute('aria-busy',String(pending));}
  function describe(){summary.textContent=draft?`写真：${typeof state.asset.name==='string'?state.asset.name:'選択中の写真'} ／ SHA-256 ${draft.sourceSHA256.slice(0,12)}… ／ 原寸 ${draft.sourceWidth}×${draft.sourceHeight} ／ 深度 ${draft.depth.width}×${draft.depth.height} ／ 有効 ${draft.depth.validity.reduce((n,v)=>n+v,0)} 点`:'深度データは未確認です。';}
  function fill(value){for(let i=0;i<4;i++)edges[i].value=String(value?.edges?.[i]??(i<2?0:1));invert.checked=value?.invert??false;exposure.value=String(value?.basic?.exposure??0);contrast.value=String(value?.basic?.contrast??0);saturation.value=String(value?.basic?.saturation??0);}
  function hydrate(){
    const saved=state?.recipe?.parameters?.extendedParameters?.webDepthRange;draft=null;consent.checked=false;dirty=false;file.value='';
    if(saved!==undefined){validateWebDepthRange(saved);bound(saved);draft=copy(saved);}fill(draft);describe();
  }
  function synchronize(value){
    if(disposed)return;state=value;const next=keyOf(value),available=allowed(),size=sourceSignature();
    if(next!==key||available!==accessKey||size!==sourceKey){
      const lost=dirty;key=next;accessKey=available;sourceKey=size;generation++;
      try{hydrate();status.textContent=lost?'写真・Recipe・利用状態が変わったため、未適用の下書きを破棄しました。':draft?'保存済みの深度設定を読み込みました。再編集して適用する際は写真との対応を再確認してください。':'';}
      catch(error){draft=null;consent.checked=false;summary.textContent='保存済み深度を確認できません。明示解除は可能です。';status.textContent=String(error.message);}
    }controls();
  }
  function fresh(){const current=session.state??state;state=current;if(disposed||pending||!allowed()||keyOf(current)!==key||sourceSignature()!==sourceKey){synchronize(current);throw Error('写真・編集状態・原寸情報を再確認してください。');}}
  function number(input){if(!input.value.trim())throw Error('すべての数値を指定してください。');const value=Number(input.value);if(!Number.isFinite(value))throw Error('有限の数値を指定してください。');return value;}
  function settings(){if(!draft)throw Error('深度JSONを確認してください。');const result={...copy(draft),edges:edges.map(number),invert:invert.checked,basic:{exposure:number(exposure),contrast:number(contrast),saturation:number(saturation)}};validateWebDepthRange(result);bound(result);return result;}
  file.addEventListener('change',()=>{generation++;draft=null;consent.checked=false;dirty=true;summary.textContent='選択ファイルはまだ確認していません。';status.textContent='読み込みボタンで写真との対応を確認してください。';controls();});
  for(const input of [...edges,invert,exposure,contrast,saturation])input.addEventListener('input',()=>{if(disposed||pending||!allowed())return;dirty=true;status.textContent='数値は未適用です。確認後に明示適用してください。';controls();});
  consent.addEventListener('change',controls);
  load.addEventListener('click',async()=>{
    let token,binding,sizeKey;
    try{
      fresh();const selected=file.files?.length===1?file.files[0]:null;if(!selected||selected.size<1||selected.size>MAX_FILE)throw Error('深度JSONは1件・2MiB以下で指定してください。');
      draft=null;consent.checked=false;describe();binding=key;sizeKey=sourceKey;token=++generation;pending=true;controls();status.textContent='深度JSONを読み込み、写真との対応を確認中…';
      const buffer=await selected.arrayBuffer();
      if(disposed||token!==generation)return;
      state=session.state??state;if(keyOf(state)!==binding||sourceSignature()!==sizeKey||!allowed()||file.files?.[0]!==selected)throw Error('深度読込中に写真または選択ファイルが変わりました。');
      if(buffer.byteLength!==selected.size||buffer.byteLength>MAX_FILE)throw Error('深度JSONの読込サイズが一致しません。');
      const decoded=depthFile(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer)));bound(decoded);
      const value={schemaVersion:1,engineVersion:'suite-web-depth-range-1',assetID:state.asset.id,...decoded,edges:[0,0,1,1],invert:false,basic:{exposure:0,contrast:0,saturation:0}};
      validateWebDepthRange(value);draft=value;dirty=true;fill(draft);describe();status.textContent='深度JSONを下書きへ読み込みました。写真との一致を確認してチェックを入れ、調整値を指定してから適用してください。';
    }catch(error){if(!disposed&&(token===undefined||token===generation)){draft=null;consent.checked=false;describe();status.textContent=`深度を読み込めませんでした: ${error.message}`;}}
    finally{pending=false;if(!disposed)controls();}
  });
  reset.addEventListener('click',()=>{try{fresh();generation++;hydrate();status.textContent='保存済み設定へ戻しました。適用前に写真との対応を再確認してください。';}catch(error){status.textContent=error.message;}controls();});
  async function commit(remove){
    if(disposed||pending)return;let asset,sha;
    try{
      fresh();if(!remove&&!consent.checked)throw Error('写真との対応を確認してチェックを入れてください。');const value=remove?null:settings();asset=state.asset.id;sha=state.asset.sha256;pending=true;generation++;controls();
      await session.setWebDepthRange(value);
      state=session.state??state;if(!disposed&&state?.asset?.id===asset&&state?.asset?.sha256===sha&&allowed()&&JSON.stringify(state.recipe?.parameters?.extendedParameters?.webDepthRange??null)===JSON.stringify(value)){
        key=null;synchronize(state);status.textContent=remove?'深度範囲調整を解除しました。Recipeを保存してください。':'深度範囲調整を適用しました。Recipeを保存してください。';
      }
    }catch(error){if(!disposed&&(!asset||state?.asset?.id===asset&&state?.asset?.sha256===sha))status.textContent=`変更できませんでした: ${error.message}`;}
    finally{pending=false;if(!disposed)controls();}
  }
  apply.addEventListener('click',()=>{void commit(false);});clear.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??state);},dispose(){if(disposed)return;disposed=true;generation++;unsubscribe?.();draft=null;file.value='';root.remove();}});
}
