import {mountLocalAIRuntimeStatus} from './local-ai-runtime-status-ui.mjs';
// Discoverability inventory only. A visible item is never evidence of a working renderer.
export const FEATURE_CATALOG=Object.freeze([
  {group:'RAW color',items:[['RAW-stage Kelvin White Balance','NOT_CONNECTED'],['White Balance picker','NOT_CONNECTED'],['Post-decode Temperature (8-bit sRGB)','WEB_CODED_QA_PENDING'],['Post-decode Tint (8-bit sRGB)','WEB_CODED_QA_PENDING']]},
  {group:'Light',items:[['Exposure','WEB_CODED_QA_PENDING'],['Contrast','WEB_CODED_QA_PENDING'],['Highlights','WEB_CODED_QA_PENDING'],['Shadows','WEB_CODED_QA_PENDING'],['Whites','WEB_CODED_QA_PENDING'],['Blacks','WEB_CODED_QA_PENDING'],['Brightness','NOT_CONNECTED'],['Auto Tone','NOT_CONNECTED']]},
  {group:'Curve',items:[['3-zone parametric luma curve (8-bit sRGB)','WEB_CODED_QA_PENDING'],['RGB point curve','WEB_CODED_QA_PENDING'],['Per-channel point curve','WEB_CODED_QA_PENDING'],['Levels','WEB_CODED_QA_PENDING']]},
  {group:'Color',items:[['Saturation','WEB_CODED_QA_PENDING'],['Vibrance','WEB_CODED_QA_PENDING'],['8-band HSL','WEB_CODED_QA_PENDING'],['RGB primary calibration (8-bit sRGB)','WEB_CODED_QA_PENDING'],['Selective Color (8-bit sRGB)','WEB_CODED_QA_PENDING'],['Point Color','NOT_CONNECTED'],['Color Grading','NOT_CONNECTED'],['B&W mixer','NOT_CONNECTED']]},
  {group:'Detail',items:[['Clarity','WEB_CODED_QA_PENDING'],['Texture','WEB_CODED_QA_PENDING'],['Sharpness (8-bit sRGB)','WEB_CODED_QA_PENDING'],['Denoise (8-bit sRGB)','WEB_CODED_QA_PENDING'],['Tonal film grain (8-bit sRGB)','WEB_CODED_QA_PENDING'],['Highlight glow (8-bit sRGB)','WEB_CODED_QA_PENDING'],['RAW-stage denoise','NOT_CONNECTED'],['Sharpen radius (8-bit sRGB)','WEB_CODED_QA_PENDING'],['Sharpen detail (8-bit sRGB)','WEB_CODED_QA_PENDING'],['Sharpen masking (8-bit sRGB)','WEB_CODED_QA_PENDING']]},
  {group:'Optics',items:[['Lens profile','NOT_CONNECTED'],['Distortion','NOT_CONNECTED'],['Chromatic aberration','NOT_CONNECTED'],['Manual canvas Expand (local flat fill)','WEB_CODED_QA_PENDING'],['Post-crop Vignette Amount only (8-bit sRGB)','WEB_CODED_QA_PENDING']]},
  {group:'Masks',items:[['Brush mask','NOT_CONNECTED'],['Linear gradient mask','NOT_CONNECTED'],['Radial gradient mask','NOT_CONNECTED'],['Sky mask','NOT_CONNECTED'],['Subject mask','NOT_CONNECTED']]},
  {group:'Portrait',items:[['Face Brightness','PRIVACY_REVIEW_REQUIRED'],['Skin','NOT_CONNECTED'],['Hair','NOT_CONNECTED'],['Teeth','NOT_CONNECTED'],['Eyes','NOT_CONNECTED'],['Body','NOT_CONNECTED'],['Multi-photo identity','NOT_CONNECTED']]},
  {group:'Cleanup and AI',items:[['Healing','NOT_CONNECTED'],['Object removal','NOT_CONNECTED'],['Generative edits','NOT_CONNECTED'],['Upscale','NOT_CONNECTED']]},
  {group:'Workflow',items:[['Local Recipe','WEB_CODED_QA_PENDING'],['Undo','WEB_CODED_QA_PENDING'],['Redo','WEB_CODED_QA_PENDING'],['Author trial preset','WEB_CODED_QA_PENDING'],['Cloud Proxy','NOT_CONNECTED'],['Offline sync','NOT_CONNECTED'],['Tether','NOT_CONNECTED'],['Community','NOT_CONNECTED']]},
  {group:'Output',items:[['JPEG from Original + fixed Recipe','WEB_CODED_QA_PENDING'],['PNG from Original + fixed Recipe','WEB_CODED_QA_PENDING'],['TIFF','NOT_CONNECTED'],['16-bit','NOT_CONNECTED'],['Adobe RGB','NOT_CONNECTED'],['Background batch resume','NOT_CONNECTED']]}
]);
export const LIGHTROOM_SECTIONS=Object.freeze(['Profiles','Histogram and clipping','Light and Auto','Parametric Curve','RGB and channel Point Curves','Color Mixer','Point Color','Color Grading','Effects','Detail and Noise Reduction','Optics and Lens Corrections','Lens Blur','Masking and Local Adjustments','Crop/Rotate/Geometry','Remove/Healing/Generative Remove','HDR Optimization','Presets and Versions','Export and Share']);

// Planning labels only: partial browser code does not establish Evoto/Lightroom parity or real-RAW QA.
const EVOTO_PARTIAL=new Set(['Color|Basic','Color|White Balance','Color|Curves','Color|HSL','Color|Detail','Color|Color Calibration','Color|Selective Color','Color|Mobile Glow Effect','Color|Mobile Post-Crop Vignetting','Crop / Rotate|Desktop Crop','Crop / Rotate|Rotate','Crop / Rotate|Manual canvas Expand','Import / Export|Desktop Import','Import / Export|Desktop Export format','Import / Export|Desktop Export naming','Import / Export|Desktop Export size','Import / Export|Mobile Export']);
const EVOTO_PRIVACY_STOP=new Set(['Portrait|AI Facial Recognition','Masking|Person']);
const LIGHTROOM_PARTIAL=new Set(['Histogram and clipping','Light and Auto','Parametric Curve','RGB and channel Point Curves','Color Mixer','Effects','Detail and Noise Reduction','Crop/Rotate/Geometry','Presets and Versions','Export and Share']);
const LIGHTROOM_PRIVACY_STOP=new Set(['Masking and Local Adjustments']);
const CATEGORY_ORDER=['明るさ','色・HSL','HSL','曲線','質感・細部','光学・構図','部分調整','人物・被写体','背景','AI・修復','取込・書出し','撮影・テザー','ワークフロー'];
function commonCategory(category,name){
  if(category==='Color')return /Curve|Levels/i.test(name)?'曲線':/HSL/i.test(name)?'HSL':/Detail|Denoise|Grain/i.test(name)?'質感・細部':/Lens|Transform|Vignett|Blur/i.test(name)?'光学・構図':/Basic/i.test(name)?'明るさ':'色・HSL';
  if(category==='Portrait'||category==='Clothing'||category==='Pet')return '人物・被写体';
  if(category==='Background')return '背景';
  if(category==='Masking'||category==='Manual tools')return '部分調整';
  if(category==='Crop / Rotate')return '光学・構図';
  if(category==='Import / Export')return '取込・書出し';
  if(category==='Tether')return '撮影・テザー';
  if(category==='AI Lab')return 'AI・修復';
  return 'ワークフロー';
}
function lightroomCategory(name){
  if(/Curve/i.test(name))return '曲線';if(/Color Mixer/i.test(name))return 'HSL';if(/Color|Profiles/i.test(name))return '色・HSL';if(/Light and Auto|Histogram|HDR/i.test(name))return '明るさ';
  if(/Detail|Effects/i.test(name))return '質感・細部';if(/Optics|Lens Blur|Crop/i.test(name))return '光学・構図';
  if(/Masking/i.test(name))return '部分調整';if(/Remove|Healing/i.test(name))return 'AI・修復';return 'ワークフロー';
}
export function missingFeatureTypes(rows){
  const evoto=new Map(),supplement=[];
  for(const row of rows){
    if(row.category==='Pricing / Credit'||row.category==='SUITE advantage'||/inquiry/i.test(row.feature)){supplement.push(row);continue;}
    const key=`${row.category}|${row.feature}`;
    if(!evoto.has(key))evoto.set(key,{id:row.id,name:row.feature,source:'Evoto',category:commonCategory(row.category,row.feature),status:EVOTO_PRIVACY_STOP.has(key)?'停止中':EVOTO_PARTIAL.has(key)?'一部のみ':'未接続'});
  }
  const lightroom=LIGHTROOM_SECTIONS.map((name,index)=>({id:`LR-${String(index+1).padStart(2,'0')}`,name,source:'Lightroom',category:lightroomCategory(name),status:LIGHTROOM_PRIVACY_STOP.has(name)?'停止中':LIGHTROOM_PARTIAL.has(name)?'一部のみ':'未接続'}));
  return {items:[...evoto.values(),...lightroom].sort((a,b)=>CATEGORY_ORDER.indexOf(a.category)-CATEGORY_ORDER.indexOf(b.category)||a.name.localeCompare(b.name)),supplement};
}

export function mountFeatureCatalog(document,personStatus,root,existingChoices=[],{localAIStatusProvider,localAIManualTargets=[],localAIInputProvider,localAIContextSubscriber,localAIDisposers,localAIHostAccess}={}){
  const aiStatus=mountLocalAIRuntimeStatus(document,root,{snapshotProvider:localAIStatusProvider,manualTargets:localAIManualTargets,inputProvider:localAIInputProvider,subscribeContext:localAIContextSubscriber,hostAccess:localAIHostAccess});
  localAIDisposers?.push(aiStatus.dispose);
  if(!document.querySelector('#suite-feature-catalog-style')){const style=document.createElement('style');style.id='suite-feature-catalog-style';style.textContent='.feature-missing{list-style:none;margin:14px 0 0;padding:0;border-top:1px solid #dedfda}.feature-missing li{display:flex;justify-content:space-between;gap:7px;padding:7px 0;border-bottom:1px solid #eee;font-size:11px;line-height:1.4}.feature-missing label{display:flex;gap:6px;align-items:center;min-width:0}.feature-missing input{flex:0 0 auto}.feature-missing-name{color:#a32620}.feature-existing-name{color:#30312e}.feature-missing small{color:#62635f;font-size:9px;flex:0 0 75px}.feature-missing li[data-excluded="true"]{opacity:.55}.feature-decision-toolbar{padding:9px 0;border-top:1px solid #d7d7d3;font-size:10px;line-height:1.6}.feature-decision-toolbar button{margin:3px 7px 3px 0;min-height:30px;border:1px solid #ccc;background:#fff;font-size:10px}.feature-audit-supplement{margin-top:15px;color:#62635f;font-size:10px}.feature-audit-supplement li{line-height:1.5;margin:4px 0}';document.head.append(style);}
  const supplemental=document.createElement('details');supplemental.className='feature-audit-supplement';const title=document.createElement('summary');title.textContent='Evoto / Lightroom 比較の出典・監査原文';supplemental.append(title);const raw=document.createElement('ul');supplemental.append(raw);
  const additional=new Map([['部分調整','Masking'],['背景','Background'],['AI・修復','AI / Cleanup'],['撮影・テザー','Tether'],['光学・構図','Optics / Geometry']]);
  const targets=new Map([['明るさ',root.querySelector('#global-controls')],['色・HSL',root.querySelector('#color-controls')],['HSL',root.querySelector('#hsl-controls')],['曲線',root.querySelector('#curve-controls')],['質感・細部',root.querySelector('#detail-controls')],['人物・被写体',root.querySelector('#person-section')],['取込・書出し',root.querySelector('#export-section')],['ワークフロー',root.querySelector('#save-section')]]);
  for(const [category,english] of additional){const section=document.createElement('section');section.className='control-section';const head=document.createElement('div');head.className='section-heading';const h3=document.createElement('h3');h3.textContent=category;const badge=document.createElement('span');badge.textContent=english;head.append(h3,badge);section.append(head);root.querySelector('#save-section').before(section);targets.set(category,section);}
  const containers=new Map();for(const [category,target] of targets){if(!target)continue;const list=document.createElement('ul');list.className='feature-missing';list.setAttribute('aria-label',`${category}の機能と不足項目`);target.append(list);containers.set(category,list);}
  const toolbar=document.createElement('section');toolbar.className='feature-decision-toolbar';const warning=document.createElement('p');warning.textContent='□ 除外対象を選び「保存」。ブラウザ内の判断記録のみで、既存機能・写真・原本は削除しません。';toolbar.append(warning);
  const save=document.createElement('button');save.type='button';save.textContent='選択を保存';const show=document.createElement('button');show.type='button';show.textContent='除外済みを表示';const json=document.createElement('button');json.type='button';json.textContent='JSON出力';const csv=document.createElement('button');csv.type='button';csv.textContent='CSV出力';const message=document.createElement('p');message.setAttribute('role','status');message.textContent='判断は未保存です。';toolbar.append(save,show,json,csv,message);root.querySelector('.adjustment-panel .panel-title').after(toolbar);
  const storageKey='suite:feature-exclusions:v1';let excluded=new Set(),dirty=false,showExcluded=false,features=[];try{const stored=JSON.parse(localStorage.getItem(storageKey)||'null');if(stored?.version===1&&Array.isArray(stored.excludedIds))excluded=new Set(stored.excludedIds.filter(id=>typeof id==='string'));}catch{message.textContent='保存済みの判断を読み込めません。';}
  function refresh(){for(const row of root.querySelectorAll('[data-feature-choice-id]')){const isExcluded=excluded.has(row.dataset.featureChoiceId);row.dataset.excluded=String(isExcluded);row.hidden=isExcluded&&!showExcluded&&!dirty;row.querySelector('input').checked=isExcluded;}show.textContent=showExcluded?'除外済みを隠す':'除外済みを表示';message.textContent=dirty?'未保存の判断があります。ブラウザ内へ保存してください。':`ブラウザ内の除外判断 ${excluded.size} 件。クラウド同期はありません。`;}
  function addChoice(feature){const list=containers.get(feature.category);if(!list)return;features.push(feature);const item=document.createElement('li');item.dataset.featureChoiceId=feature.id;const label=document.createElement('label');const box=document.createElement('input');box.type='checkbox';box.setAttribute('aria-label',`${feature.name}を除外対象にする`);const name=document.createElement('span');name.className=feature.missing===false?'feature-existing-name':'feature-missing-name';name.textContent=feature.name;label.append(box,name);const status=document.createElement('small');status.textContent=`${feature.source} · ${feature.status}`;item.append(label,status);list.append(item);box.addEventListener('change',()=>{box.checked?excluded.add(feature.id):excluded.delete(feature.id);dirty=true;refresh();});}
  for(const feature of existingChoices)addChoice({...feature,missing:feature.missing===true});refresh();
  show.addEventListener('click',()=>{showExcluded=!showExcluded;refresh();});
  save.addEventListener('click',()=>{try{const records=features.map(({id,name,category,source,status})=>({id,name,category,source,implementationStatus:status,decision:excluded.has(id)?'EXCLUDED':'UNDECIDED'}));localStorage.setItem(storageKey,JSON.stringify({version:1,excludedIds:[...excluded],records}));dirty=false;refresh();message.textContent=`ブラウザ内に保存しました。除外 ${excluded.size} 件。Cloud未接続。`;}catch{message.textContent='保存に失敗しました。判断はこの画面内だけです。';}});
  function exportRecords(format){const records=features.map(({id,name,category,source,status})=>({id,name,category,source,implementationStatus:status,decision:excluded.has(id)?'EXCLUDED':'UNDECIDED'}));const quote=value=>`"${String(value).replaceAll('"','""')}"`;const content=format==='json'?JSON.stringify({version:1,storage:'BROWSER_LOCAL',saved:!dirty,records},null,2):'id,name,category,source,implementationStatus,decision\r\n'+records.map(row=>Object.values(row).map(quote).join(',')).join('\r\n');const blob=new Blob([format==='csv'?'\uFEFF':'',content],{type:format==='json'?'application/json':'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`suite-feature-decisions.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  json.addEventListener('click',()=>exportRecords('json'));csv.addEventListener('click',()=>exportRecords('csv'));
  fetch('/runtime_assets/evoto-feature-inventory.json',{credentials:'same-origin'}).then(async response=>{
    if(!response.ok)throw Error('INVENTORY_UNAVAILABLE');const result=await response.json();
    if(result.kind!=='AUDIT_CANDIDATES_NOT_IMPLEMENTATION_CLAIMS'||result.rows?.length!==1100)throw Error('INVENTORY_MISMATCH');
    const catalog=missingFeatureTypes(result.rows);for(const feature of catalog.items)addChoice({...feature,missing:true});refresh();
    title.textContent=`比較の出典・監査原文1,100行（機能外補足${catalog.supplement.length}行）`;for(const row of result.rows){const item=document.createElement('li');item.textContent=`${row.id} · ${row.category} / ${row.feature} / ${row.subFeature} / ${row.option}`;raw.append(item);}
  }).catch(()=>{title.textContent='比較資料を読み込めません。未接続の機能を実装済みとは扱いません。';});
  return supplemental;
}
