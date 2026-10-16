import {validateWorkspaceExportPresetSettings} from './workspace-export-preset-client.mjs';

let nextId=0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const abort=signal=>{if(signal?.aborted)throw new DOMException('Export Preset panel cancelled','AbortError');};
const element=(document,tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
function field(document,id,label,tag='input',attributes={}){
  const wrapper=element(document,'label',label);wrapper.setAttribute('for',id);
  const input=element(document,tag);input.setAttribute('id',id);
  for(const [key,value] of Object.entries(attributes))input.setAttribute(key,String(value));
  wrapper.append(input);return {wrapper,input};
}
function option(document,value,label){const node=element(document,'option',label);node.value=value;return node;}

/**
 * Node Workspace Export Preset management only. Selection and Save do not
 * constitute Final application or trustworthy file-naming evidence.
 * A host may expose applySettings/readCurrentSettings backed by the *actual*
 * Final controls; the panel checks readback, but cannot authenticate a host.
 */
export function createWorkspaceExportPresetPanel({document=globalThis.document,client,host}={}){
  if(!document||typeof document.createElement!=='function'||
      !client||['listExportPresets','getExportPreset','createExportPreset','updateExportPreset']
        .some(name=>typeof client[name]!=='function')||
      (host!==undefined&&(!host||typeof host.applySettings!=='function'||typeof host.readCurrentSettings!=='function')))
    throw Error('WORKSPACE_EXPORT_PRESET_UI_CONFIG_INVALID');
  const prefix=`suite-export-preset-${++nextId}`;
  const root=element(document,'section');root.className='suite-export-preset-panel';
  root.setAttribute('aria-label','Workspace Export Preset');
  root.append(element(document,'h3','Export Preset'));
  const help=element(document,'p','保存や選択だけではFinalに適用されません。写真Recipeには保存しません。');
  root.append(help);
  const listField=field(document,`${prefix}-list`,'保存済みPreset','select');
  listField.input.append(option(document,'','選択してください'));
  const reloadButton=element(document,'button','一覧を再読込');reloadButton.setAttribute('type','button');
  root.append(listField.wrapper,reloadButton);
  const scope=field(document,`${prefix}-scope`,'保存範囲','select');
  scope.input.append(option(document,'PERSONAL','Personal'),option(document,'WORKSPACE','Workspace'));
  scope.input.value='PERSONAL';
  const presetName=field(document,`${prefix}-name`,'Preset名','input',{type:'text',maxlength:120,required:''});
  const format=field(document,`${prefix}-format`,'出力形式','select');
  for(const [value,label] of [['jpeg','JPEG'],['png','PNG'],['tiff','TIFF 8-bit']])format.input.append(option(document,value,label));
  format.input.value='jpeg';
  const sizeKind=field(document,`${prefix}-size-kind`,'出力サイズ方式','select');
  for(const [value,label] of [['original','元のサイズ'],['percentage','縮小率'],['width','幅'],['height','高さ'],
    ['long-edge','長辺'],['short-edge','短辺'],['fit','枠内'],['dimensions','幅×高さの枠'],['exact-dimensions','厳密な幅×高さ']])
    sizeKind.input.append(option(document,value,label));
  sizeKind.input.value='original';
  const sizeValue=field(document,`${prefix}-size-value`,'指定値','input',{type:'number',min:1,max:16384,step:1,inputmode:'numeric'});
  sizeValue.input.value='100';
  const sizeWidth=field(document,`${prefix}-size-width`,'最大幅','input',{type:'number',min:1,max:16384,step:1,inputmode:'numeric'});
  const sizeHeight=field(document,`${prefix}-size-height`,'最大高さ','input',{type:'number',min:1,max:16384,step:1,inputmode:'numeric'});
  const sizeStrategy=field(document,`${prefix}-size-strategy`,'縦横比が異なる場合','select');
  for(const [value,label] of [['pad','余白'],['crop','中央切抜き'],['stretch','引伸ばし']])sizeStrategy.input.append(option(document,value,label));
  sizeStrategy.input.value='pad';
  const sizeBackground=field(document,`${prefix}-size-background`,'余白色','select');
  for(const [value,label] of [['white','白'],['gray','グレー'],['black','黒']])sizeBackground.input.append(option(document,value,label));
  sizeBackground.input.value='white';
  const resolutionUnit=field(document,`${prefix}-resolution-unit`,'印刷密度','select');
  for(const [value,label] of [['none','指定しない'],['ppi','PPI'],['ppc','PPC']])resolutionUnit.input.append(option(document,value,label));
  resolutionUnit.input.value='none';
  const resolutionValue=field(document,`${prefix}-resolution-value`,'密度値','input',{type:'number',min:1,max:65535,step:1,inputmode:'numeric'});
  const sharpenKind=field(document,`${prefix}-sharpen-kind`,'出力シャープ','select');
  sharpenKind.input.append(option(document,'none','追加しない'),option(document,'manual','SUITE手動値'),option(document,'screen','SUITE画面向け'),option(document,'print','SUITE印刷向け'));
  sharpenKind.input.value='none';
  const sharpenStrength=field(document,`${prefix}-strength`,'出力シャープ強度','select');
  for(const [value,label] of [['low','弱'],['standard','標準'],['high','強']])sharpenStrength.input.append(option(document,value,label));
  sharpenStrength.input.value='standard';
  const sharpenGain=field(document,`${prefix}-gain`,'強さ','input',{type:'number',min:0,max:2,step:'any',inputmode:'decimal'});
  const sharpenRadius=field(document,`${prefix}-radius`,'半径','input',{type:'number',min:0.5,max:3,step:'any',inputmode:'decimal'});
  const sharpenThreshold=field(document,`${prefix}-threshold`,'しきい値','input',{type:'number',min:0,max:64,step:'any',inputmode:'decimal'});
  sharpenGain.input.value='1';sharpenRadius.input.value='1';sharpenThreshold.input.value='0';
  for(const item of [scope,presetName,format,sizeKind,sizeValue,sizeWidth,sizeHeight,resolutionUnit,
    resolutionValue,sizeStrategy,sizeBackground,sharpenKind,sharpenStrength,sharpenGain,sharpenRadius,sharpenThreshold])root.append(item.wrapper);
  const actions=element(document,'div');
  const create=element(document,'button','新規保存');create.setAttribute('type','button');
  const update=element(document,'button','選択中を更新');update.setAttribute('type','button');
  const apply=element(document,'button','現在の書き出し設定へ反映');apply.setAttribute('type','button');
  const cancel=element(document,'button','中断');cancel.setAttribute('type','button');
  actions.append(create,update,apply,cancel);root.append(actions);
  const status=element(document,'p','未読込・未適用');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
  let selected=null,busy=false,destroyed=false,active=null,operation=0;
  const controls=[listField.input,reloadButton,scope.input,presetName.input,format.input,sizeKind.input,
    sizeValue.input,sizeWidth.input,sizeHeight.input,resolutionUnit.input,resolutionValue.input,
    sizeStrategy.input,sizeBackground.input,sharpenKind.input,sharpenStrength.input,sharpenGain.input,sharpenRadius.input,sharpenThreshold.input,create,update,apply];
  function reflectFields(){
    const scalar=['percentage','width','height','long-edge','short-edge'].includes(sizeKind.input.value);
    const bounds=['fit','dimensions','exact-dimensions'].includes(sizeKind.input.value);
    sizeValue.wrapper.hidden=!scalar;sizeWidth.wrapper.hidden=!bounds;sizeHeight.wrapper.hidden=!bounds;
    sizeStrategy.wrapper.hidden=sizeKind.input.value!=='exact-dimensions';
    sizeBackground.wrapper.hidden=sizeKind.input.value!=='exact-dimensions'||sizeStrategy.input.value!=='pad';
    resolutionValue.wrapper.hidden=resolutionUnit.input.value==='none';
    const manual=sharpenKind.input.value==='manual';
    sharpenStrength.wrapper.hidden=!['screen','print'].includes(sharpenKind.input.value);
    for(const item of [sharpenGain,sharpenRadius,sharpenThreshold])item.wrapper.hidden=!manual;
  }
  function refreshState(){
    reflectFields();
    for(const control of controls)control.disabled=busy||destroyed;
    scope.input.disabled=busy||destroyed||Boolean(selected);
    update.disabled=busy||destroyed||!selected;
    let matches=false;
    if(selected)try{matches=same(draftSettings(),selected.settings);}catch{matches=false;}
    apply.disabled=busy||destroyed||!selected||!host||!matches;
    cancel.disabled=destroyed||!busy;
    root.setAttribute('aria-busy',busy?'true':'false');
  }
  function integer(input){
    const raw=String(input.value).trim();if(!/^\d+$/u.test(raw))throw Error('WORKSPACE_EXPORT_PRESET_UI_VALUE_INVALID');
    return Number(raw);
  }
  function decimal(input){
    const raw=String(input.value).trim();if(!raw)throw Error('WORKSPACE_EXPORT_PRESET_UI_VALUE_INVALID');
    return Number(raw);
  }
  function draftSettings(){
    let size={kind:sizeKind.input.value};
    if(['percentage','width','height','long-edge','short-edge'].includes(size.kind))size={kind:size.kind,value:integer(sizeValue.input)};
    else if(['fit','dimensions'].includes(size.kind))size={kind:size.kind,width:integer(sizeWidth.input),height:integer(sizeHeight.input)};
    else if(size.kind==='exact-dimensions'){
      const colors={white:[255,255,255],gray:[128,128,128],black:[0,0,0]};
      size={kind:size.kind,width:integer(sizeWidth.input),height:integer(sizeHeight.input),strategy:sizeStrategy.input.value,
        ...(sizeStrategy.input.value==='pad'?{background:colors[sizeBackground.input.value]}:{})};
    }
    const resolution=resolutionUnit.input.value==='none'?null:{unit:resolutionUnit.input.value,value:integer(resolutionValue.input)};
    const outputSharpening=sharpenKind.input.value==='none'?{kind:'none'}:
      ['screen','print'].includes(sharpenKind.input.value)?{kind:sharpenKind.input.value,strength:sharpenStrength.input.value}:
      {kind:sharpenKind.input.value,gain:decimal(sharpenGain.input),radiusPx:decimal(sharpenRadius.input),thresholdLuma:decimal(sharpenThreshold.input)};
    return validateWorkspaceExportPresetSettings({format:format.input.value,size,resolution,outputSharpening});
  }
  function showPreset(preset){
    selected=preset;
    listField.input.value=preset.id;scope.input.value=preset.scope;presetName.input.value=preset.name;
    const settings=preset.settings;format.input.value=settings.format;sizeKind.input.value=settings.size.kind;
    if(Object.hasOwn(settings.size,'value'))sizeValue.input.value=String(settings.size.value);
    if(Object.hasOwn(settings.size,'width'))sizeWidth.input.value=String(settings.size.width);
    if(Object.hasOwn(settings.size,'height'))sizeHeight.input.value=String(settings.size.height);
    sizeStrategy.input.value=settings.size.strategy??'pad';
    sizeBackground.input.value=settings.size.background?.[0]===0?'black':settings.size.background?.[0]===128?'gray':'white';
    resolutionUnit.input.value=settings.resolution?.unit??'none';
    if(settings.resolution)resolutionValue.input.value=String(settings.resolution.value);
    sharpenKind.input.value=settings.outputSharpening.kind;
    sharpenStrength.input.value=settings.outputSharpening.strength??'standard';
    if(settings.outputSharpening.kind==='manual'){
      sharpenGain.input.value=String(settings.outputSharpening.gain);
      sharpenRadius.input.value=String(settings.outputSharpening.radiusPx);
      sharpenThreshold.input.value=String(settings.outputSharpening.thresholdLuma);
    }
    refreshState();
  }
  async function execute(action,{mutation=false}={}){
    if(destroyed||busy)return null;
    const ownOperation=++operation,controller=new AbortController();active=controller;busy=true;refreshState();
    try{return await action(controller.signal);}
    catch(error){
      if(destroyed||ownOperation!==operation)return null;
      if(error?.status===409){selected=null;status.textContent='版が変わりました。再読込してから操作してください。';}
      else if(error?.status===403||error?.status===401){selected=null;status.textContent='本人権限を確認できません。再認証後に再読込してください。';}
      else status.textContent=mutation?'結果が不確定です。再読込で保存状態を確認してください。':'取得できませんでした。再読込してください。';
      return null;
    }finally{if(ownOperation===operation){busy=false;active=null;refreshState();}}
  }
  async function reload(){return execute(async signal=>{
    const result=await client.listExportPresets({signal});
    abort(signal);if(destroyed)return null;
    selected=null;
    const options=[option(document,'','選択してください'),...result.presets.map(p=>option(document,p.id,`${p.name} · ${p.scope} · v${p.version}`))];
    listField.input.replaceChildren(...options);listField.input.value='';
    status.textContent='一覧を更新しました。Presetを選んでもFinalには未適用です。';
    return result;
  });}
  async function select(presetId){return execute(async signal=>{
    if(!presetId){selected=null;status.textContent='未選択・未適用';return null;}
    const {preset}=await client.getExportPreset(presetId,{signal});
    abort(signal);if(destroyed)return null;
    showPreset(preset);status.textContent='保存済み設定を再読込しました。Finalには未適用です。';
    return preset;
  });}
  async function saveNew(){
    let name,settings;try{name=presetName.input.value;settings=draftSettings();}catch{status.textContent='入力値を確認してください。';presetName.input.focus();return null;}
    return execute(async signal=>{
      const created=(await client.createExportPreset({scope:scope.input.value,name,settings,signal})).preset;
      abort(signal);
      const {preset}=await client.getExportPreset(created.id,{signal});
      abort(signal);
      if(preset.version!==created.version||preset.name!==name||!same(preset.settings,settings))throw Error('EXPORT_PRESET_READBACK_MISMATCH');
      if(destroyed)return null;
      listField.input.append(option(document,preset.id,`${preset.name} · ${preset.scope} · v${preset.version}`));
      showPreset(preset);status.textContent='保存・再読込を確認しました。Finalには未適用です。';return preset;
    },{mutation:true});
  }
  async function updateSelected(){
    if(!selected)return null;
    let name,settings;try{name=presetName.input.value;settings=draftSettings();}catch{status.textContent='入力値を確認してください。';presetName.input.focus();return null;}
    const before=selected;
    return execute(async signal=>{
      const fresh=(await client.getExportPreset(before.id,{signal})).preset;
      abort(signal);
      if(fresh.version!==before.version||!same(fresh.settings,before.settings))throw Object.assign(Error('EXPORT_PRESET_VERSION_CONFLICT'),{status:409});
      const changed=(await client.updateExportPreset(before.id,{baseVersion:before.version,name,settings,signal})).preset;
      abort(signal);
      const {preset}=await client.getExportPreset(before.id,{signal});
      abort(signal);
      if(preset.version!==changed.version||preset.name!==name||!same(preset.settings,settings))throw Error('EXPORT_PRESET_READBACK_MISMATCH');
      if(destroyed)return null;
      for(const choice of listField.input.children)if(choice.value===preset.id)choice.textContent=`${preset.name} · ${preset.scope} · v${preset.version}`;
      showPreset(preset);status.textContent='更新・再読込を確認しました。Finalには未適用です。';return preset;
    },{mutation:true});
  }
  async function applySelected(){
    if(!selected||!host)return null;
    let draft;try{draft=draftSettings();}catch{status.textContent='入力値を確認してください。';return null;}
    if(!same(draft,selected.settings)){
      status.textContent='未保存の変更があります。保存・再読込してから反映してください。';return null;
    }
    const before=selected;
    return execute(async signal=>{
      const fresh=(await client.getExportPreset(before.id,{signal})).preset;
      abort(signal);
      if(fresh.version!==before.version||!same(fresh.settings,before.settings))throw Object.assign(Error('EXPORT_PRESET_VERSION_CONFLICT'),{status:409});
      await host.applySettings({settings:fresh.settings,preset:{id:fresh.id,version:fresh.version},signal});
      abort(signal);
      const readback=validateWorkspaceExportPresetSettings(await host.readCurrentSettings({signal}));
      abort(signal);
      if(!same(readback,fresh.settings))throw Error('EXPORT_PRESET_APPLY_READBACK_MISMATCH');
      if(destroyed)return null;
      status.textContent='現在の書き出し設定への反映を確認しました。Final出力・命名証拠は未確認です。';
      return Object.freeze({settings:readback,presetId:fresh.id,presetVersion:fresh.version,finalVerified:false});
    },{mutation:true});
  }
  reloadButton.addEventListener('click',()=>reload());
  listField.input.addEventListener('change',()=>select(listField.input.value));
  create.addEventListener('click',()=>saveNew());
  update.addEventListener('click',()=>updateSelected());
  apply.addEventListener('click',()=>applySelected());
  function cancelPending(){
    if(!busy)return;active?.abort();operation++;busy=false;active=null;selected=null;
    status.textContent='中断しました。保存・反映結果は不確定です。再読込してください。';refreshState();
  }
  cancel.addEventListener('click',cancelPending);
  for(const input of [format.input,sizeKind.input,sizeValue.input,sizeWidth.input,sizeHeight.input,
    resolutionUnit.input,resolutionValue.input,sizeStrategy.input,sizeBackground.input,sharpenKind.input,sharpenStrength.input,sharpenGain.input,sharpenRadius.input,sharpenThreshold.input]){
    input.addEventListener('change',refreshState);input.addEventListener('input',refreshState);
  }
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&busy){event.preventDefault();cancelPending();}});
  refreshState();
  return Object.freeze({element:root,reload,select,saveNew,updateSelected,applySelected,draftSettings,
    getSelected:()=>selected,destroy(){destroyed=true;operation++;active?.abort();selected=null;root.remove();refreshState();}});
}
