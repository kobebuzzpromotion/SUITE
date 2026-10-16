import {validateColorRangeLevels,createColorRangeLevelsMask,applyColorRangeLevels} from './processing/color-range-levels.mjs';
import {samplePointColor,visualizePointColorRange} from './processing/lr-point-color.mjs';
import {assertPixels} from './processing/pure.mjs';

const master=()=>({inputBlack:0,inputWhite:255,gamma:1,outputBlack:0,outputWhite:255});
const selection=id=>({id,hue:null,saturation:[0,0,1,1],lightness:[0,0,1,1],adjustment:{hue:0,saturation:0,lightness:0},enabled:true});
const initial=()=>({schemaVersion:1,engineVersion:'suite-color-range-levels-1',selections:[selection('range-1')],invert:false,levels:{master:master()}});

/** Dedicated untransformed Before canvas; no current After/Final pixels are changed by previews. */
export function mountWebConnectedColorRangeLevels(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('COLOR_RANGE_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section'),title=el('h3','色範囲マスク · 局所Levels');root.append(title,el('p','AIを使わず、未編集BeforeのHSL色範囲を選びます。最大8個の名前付きマスクを上から順に補正します。各マスク内の複数色範囲は和集合です。全レイヤー合計32範囲・64ブラシ線・4096点・96Mブラシ処理量まで。Levelsは全体色調整後、既存ブラシ補正と幾何・回転・Cropより前。RAW復元ではありません。'));
  const fields=el('fieldset');fields.append(el('legend','色範囲と補正'));
  const buttons=(label,callback)=>{const b=el('button',label);b.type='button';b.addEventListener('click',callback);return b;};
  const layerChoose=el('select');layerChoose.setAttribute('aria-label','補正マスクレイヤー');
  const layerName=el('input');layerName.type='text';layerName.maxLength=40;layerName.setAttribute('aria-label','選択マスク名');
  const layerEnabled=el('input');layerEnabled.type='checkbox';layerEnabled.checked=true;
  const layerEnabledLabel=el('label','選択マスクの補正を有効にする');layerEnabledLabel.append(layerEnabled);
  const addLayer=buttons('マスクレイヤー追加',()=>edit(()=>{read();if(layers.length>=8)throw Error('マスクは最大8レイヤーです。');
    layers[layerIndex].settings=structuredClone(draft);layers.push({id:crypto.randomUUID(),name:`マスク ${layers.length+1}`,settings:initial()});layerIndex=layers.length-1;draft=structuredClone(layers[layerIndex].settings);selected=0;hydrate();}));
  const deleteLayer=buttons('選択マスクレイヤー削除',()=>edit(()=>{if(layers.length<=1)throw Error('最後のレイヤーは専用の全解除を使用してください。');
    layers.splice(layerIndex,1);layerIndex=Math.min(layerIndex,layers.length-1);draft=structuredClone(layers[layerIndex].settings);selected=0;hydrate();}));
  const duplicateLayer=buttons('選択マスクを複製',()=>edit(()=>{read();captureLayers();if(layers.length>=8)throw Error('マスクは最大8レイヤーです。');
    const copied=structuredClone(layers[layerIndex]);copied.id=crypto.randomUUID();copied.name=copied.name.slice(0,35)+' (複製)';
    layers.splice(layerIndex+1,0,copied);layerIndex++;draft=structuredClone(copied.settings);selected=0;hydrate();}));
  const upLayer=buttons('順序を前へ',()=>moveLayer(-1)),downLayer=buttons('順序を後へ',()=>moveLayer(1));
  fields.append(layerChoose,layerName,layerEnabledLabel,addLayer,duplicateLayer,deleteLayer,upLayer,downLayer,
    el('p','無効にしたマスクは補正を適用しませんが、選択・編集・マスク表示はできます。複製や有効切替は下書きで、「適用」後に通常の保存操作を行ってください。無効レイヤーも保存容量の上限に含みます。'));
  const choose=el('select');choose.setAttribute('aria-label','色範囲の選択');
  const inputs={};
  function number(key,label,min,max,step){const wrap=el('label',label),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);wrap.append(input);fields.append(wrap);inputs[key]=input;}
  const allHue=el('input');allHue.type='checkbox';const allLabel=el('label','全色相');allLabel.append(allHue);
  const enabled=el('input');enabled.type='checkbox';const enabledLabel=el('label','この範囲を有効');enabledLabel.append(enabled);
  const invert=el('input');invert.type='checkbox';const invertLabel=el('label','和集合の色範囲を反転（透明画素を除外）');invertLabel.append(invert);
  let current=null,signature=null,source=null,draft=initial(),selected=0,dirty=false,pending=false,disposed=false,validSaved=true,pick=false,brushMode=false,active=null,gradientMode=false,gradientStart=null;
  let layers=[{id:'initial-layer',name:'マスク 1',settings:initial()}],layerIndex=0;
  let keyboard={x:.5,y:.5};
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setColorRangeLevels==='function';}catch{return false;}}
  function message(error){status.textContent=error instanceof Error?error.message:String(error);}
  const add=buttons('範囲を追加',()=>edit(()=>{read();if(draft.selections.length>=16)throw Error('色範囲は最大16件です。');draft.selections.push(selection(nextID()));selected=draft.selections.length-1;hydrate();}));
  const remove=buttons('選択範囲を削除',()=>edit(()=>{read();if(draft.selections.length<=1)throw Error('少なくとも1つの範囲が必要です。');draft.selections.splice(selected,1);selected=Math.min(selected,draft.selections.length-1);hydrate();}));
  fields.append(choose,add,remove,enabledLabel,allLabel);
  number('hue','色相中心（度）',0,360,1);number('inner','色相の完全選択半径',0,180,1);number('outer','色相の外側半径',0,180,1);
  for(const [prefix,label] of [['s','彩度'],['l','HSL明度']])for(let i=0;i<4;i++)number(`${prefix}${i}`,`${label} ${['外側下限','内側下限','内側上限','外側上限'][i]}`,0,1,.01);
  fields.append(invertLabel);
  const useLuminance=el('input');useLuminance.type='checkbox';const luminanceLabel=el('label','表示RGBの輝度範囲でも絞る');luminanceLabel.append(useLuminance);
  const luminanceInvert=el('input');luminanceInvert.type='checkbox';const luminanceInvertLabel=el('label','輝度範囲を反転');luminanceInvertLabel.append(luminanceInvert);
  fields.append(luminanceLabel,el('p','輝度は未編集Beforeの表示RGBを 0.2126R + 0.7152G + 0.0722B で加重した値です。HSL明度やRAWの物理輝度とは異なります。色範囲（反転後）と輝度範囲（反転後）の重なりだけを補正します。'));
  for(let i=0;i<4;i++)number(`lum${i}`,`表示RGB輝度 ${['外側下限','内側下限','内側上限','外側上限'][i]}`,0,1,.01);
  fields.append(luminanceInvertLabel);
  for(const [key,label] of [['inputBlack','入力黒点'],['inputWhite','入力白点'],['gamma','中間調Gamma'],['outputBlack','出力黒点'],['outputWhite','出力白点']])number(key,label,key==='gamma'?.1:0,key==='gamma'?10:255,key==='gamma'?.01:1);
  const before=el('canvas'),maskCanvas=el('canvas');before.setAttribute('aria-label','未変形Before。採色中にクリックすると選択中の範囲を置換');maskCanvas.setAttribute('aria-label','色範囲マスクの表示のみ');
  for(const canvas of [before,maskCanvas]){canvas.style.maxWidth='100%';canvas.style.height='auto';canvas.hidden=true;}
  const pickButton=buttons('Beforeで採色を開始',()=>{if(!ready())return;stopStroke();gradientMode=false;gradientStart=null;brushMode=false;pick=!pick;controls();});
  function selectControl(label,options){const wrap=el('label',label),select=el('select');for(const [value,text] of options){const option=el('option',text);option.value=value;select.append(option);}wrap.append(select);fields.append(wrap);return select;}
  const useGradient=el('input');useGradient.type='checkbox';const gradientLabel=el('label','グラデーションを合成');gradientLabel.append(useGradient);fields.append(gradientLabel);
  const gradientKind=selectControl('グラデーション種類',[['linear','線形'],['radial','放射状（円形）']]);
  const gradientOperation=selectControl('グラデーション合成',[['intersect','交差'],['add','追加'],['subtract','減算']]);
  const gradientInvert=el('input');gradientInvert.type='checkbox';const gradientInvertLabel=el('label','グラデーションを反転');gradientInvertLabel.append(gradientInvert);fields.append(gradientInvertLabel);
  for(const [key,label] of [['gx0','始点X'],['gy0','始点Y'],['gx1','終点X'],['gy1','終点Y']])number(key,`グラデーション ${label}（左上基準0〜1）`,0,1,.01);
  const gradientButton=buttons('Beforeで始点・終点を指定',()=>{if(!ready())return;stopStroke();pick=false;brushMode=false;gradientMode=!gradientMode;gradientStart=null;status.textContent=gradientMode?'Beforeの始点、次に終点をクリックしてください。':'点指定を中止しました。';controls();});
  const clearGradient=buttons('グラデーションを解除',()=>edit(()=>{gradientMode=false;gradientStart=null;useGradient.checked=false;read();hydrate();}));
  fields.append(el('p','線形は始点で0、終点で1。放射状は始点が中心（1）、終点までの距離が半径（外側0）です。未変形Before基準で、色→輝度→グラデーション→ブラシの順に合成します。'),gradientButton,clearGradient);
  const brushOperation=selectControl('色・輝度マスクとブラシ範囲の合成',[['add','追加（和集合）'],['subtract','減算'],['intersect','交差']]);
  const strokeMode=selectControl('ブラシ範囲の編集',[['add','塗り足す'],['erase','ブラシ範囲を消す']]);
  function brushNumber(label,min,max,value){const wrap=el('label',label),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step='.1';input.value=String(value);wrap.append(input);fields.append(wrap);return input;}
  const brushRadius=brushNumber('ブラシ半径（画像短辺の%）',.1,50,3),brushHardness=brushNumber('ブラシ硬さ（%）',0,100,70);
  const brushButton=buttons('Beforeでブラシを開始',()=>{if(!ready())return;stopStroke();gradientMode=false;gradientStart=null;pick=false;brushMode=!brushMode;controls();});
  const undoBrush=buttons('直前のブラシ線を取消',()=>edit(()=>{stopStroke();read();draft.brush.strokes.pop();if(!draft.brush.strokes.length)delete draft.brush;hydrate();}));
  const clearBrush=buttons('ブラシ合成を解除',()=>edit(()=>{stopStroke();read();delete draft.brush;hydrate();}));
  fields.append(el('p','色・輝度の絞り込み後に合成します。追加は範囲外も含めます。「消す」はブラシ自身の範囲を消し、色マスクから直接引く操作ではありません。64線・合計4096点まで。矢印キーで位置を動かしEnterで点描、Escapeで中止できます。'),brushButton,undoBrush,clearBrush);
  const useRefinement=el('input');useRefinement.type='checkbox';const refinementLabel=el('label','合成したマスクの境界を調整');refinementLabel.append(useRefinement);fields.append(refinementLabel);
  const refinementKeys=['expand','contract','smooth','feather'];
  for(const [key,label] of [['expand','拡張'],['contract','縮小'],['smooth','平滑化'],['feather','ぼかし']])number(`refine-${key}`,`${label}（原寸px・0〜64）`,0,64,1);
  const clearRefinement=buttons('境界調整を解除',()=>edit(()=>{useRefinement.checked=false;read();hydrate();}));
  fields.append(clearRefinement,el('p','色・輝度・グラデーション・ブラシを合成した後、拡張→縮小→平滑化→ぼかしの順に処理します。原寸の短辺比でプレビューへ換算し、非ゼロ半径は最低1pxです。透明画素は選択しません。'));
  const useBasic=el('input');useBasic.type='checkbox';const basicLabel=el('label','局所Levels後に明るさ・彩度を補正');basicLabel.append(useBasic);fields.append(basicLabel);
  const basicKeys=['exposure','contrast','saturation'];
  number('basic-exposure','局所露出（現像後sRGB・EV）',-4,4,.1);
  number('basic-contrast','局所コントラスト',-100,100,1);number('basic-saturation','局所彩度',-100,100,1);
  const clearBasic=buttons('局所明るさ・彩度だけ解除',()=>edit(()=>{useBasic.checked=false;read();hydrate();}));
  fields.append(clearBasic,el('p','同じマスクで局所Levels→露出・コントラスト・彩度の順に補正します。現像後8-bit sRGBへの処理で、RAW露出や失われたハイライトの復元ではありません。全値0なら追加処理をしません。'));
  before.tabIndex=0;
  const show=buttons('マスクを表示',()=>{if(!ready())return;try{const doc=read();const mask=createColorRangeLevelsMask(source,doc);paint(maskCanvas,visualizePointColorRange(source,mask,{mode:'overlay'}));status.textContent='専用Before上のマスク表示です。After・Recipe・Finalには表示を焼き込みません。';}catch(error){message(error);}});
  const apply=buttons('適用',()=>{void commit(false);}),reset=buttons('色範囲Levelsを解除',()=>{void commit(true);});
  fields.append(el('p','採色は選択中の範囲を置換します。別の色も含める場合は、範囲を追加してから採色してください。'),pickButton,show,before,maskCanvas,apply,reset);root.append(fields,status);container.append(root);
  function ready(){return !disposed&&!pending&&permitted()&&validSaved&&Boolean(source);}
  function layerDocument(candidate=draft){return {schemaVersion:2,engineVersion:'suite-color-range-levels-2',
    layers:layers.map((layer,index)=>({...layer,settings:structuredClone(index===layerIndex?candidate:layer.settings)}))};}
  function captureLayers(){const value=layerDocument();validateColorRangeLevels(value);layers=structuredClone(value.layers);}
  function stopModes(){stopStroke();pick=false;brushMode=false;gradientMode=false;gradientStart=null;clearMask();}
  function moveLayer(delta){edit(()=>{read();captureLayers();const next=layerIndex+delta;if(next<0||next>=layers.length)return;
    [layers[layerIndex],layers[next]]=[layers[next],layers[layerIndex]];layerIndex=next;hydrate();});}
  function nextID(){let n=1;while(draft.selections.some(s=>s.id===`range-${n}`))n++;return `range-${n}`;}
  function paint(canvas,frame){const context=canvas.getContext('2d');if(!context)throw Error('COLOR_RANGE_CANVAS_UNAVAILABLE');canvas.width=frame.width;canvas.height=frame.height;const image=context.createImageData(frame.width,frame.height);image.data.set(frame.data);context.putImageData(image,0,0);canvas.hidden=false;}
  function clearMask(){maskCanvas.hidden=true;maskCanvas.width=maskCanvas.height=1;}
  function controls(){fields.disabled=disposed||pending||!permitted();apply.disabled=!validSaved||!source;show.disabled=!validSaved||!source;pickButton.disabled=!validSaved||!source;add.disabled=!validSaved||draft.selections.length>=16;remove.disabled=!validSaved||draft.selections.length<=1;
    layerChoose.disabled=layerName.disabled=layerEnabled.disabled=!validSaved;addLayer.disabled=duplicateLayer.disabled=!validSaved||layers.length>=8;
    deleteLayer.disabled=!validSaved||layers.length<=1;upLayer.disabled=!validSaved||layerIndex===0;downLayer.disabled=!validSaved||layerIndex===layers.length-1;
    useGradient.disabled=!validSaved;gradientButton.disabled=!validSaved||!source;clearGradient.disabled=!validSaved||!useGradient.checked;
    for(const input of [gradientKind,gradientOperation,gradientInvert,...['gx0','gy0','gx1','gy1'].map(key=>inputs[key])])input.disabled=!validSaved||!useGradient.checked;
    gradientButton.textContent=gradientMode?(gradientStart?'Beforeの終点を指定（押すと中止）':'Beforeの始点を指定（押すと中止）'):'Beforeで始点・終点を指定';gradientButton.setAttribute('aria-pressed',String(gradientMode));
    brushButton.disabled=!validSaved||!source;undoBrush.disabled=clearBrush.disabled=!validSaved||!draft.brush;
    for(const input of [brushOperation,strokeMode,brushRadius,brushHardness])input.disabled=!validSaved;
    brushButton.textContent=brushMode?'ブラシを終了':'Beforeでブラシを開始';brushButton.setAttribute('aria-pressed',String(brushMode));before.style.touchAction=brushMode?'none':'auto';
    for(const input of [...Object.values(inputs),choose,allHue,enabled,invert,useLuminance,luminanceInvert])input.disabled=!validSaved;
    for(let i=0;i<4;i++)inputs[`lum${i}`].disabled=!validSaved||!useLuminance.checked;
    luminanceInvert.disabled=!validSaved||!useLuminance.checked;
    for(const key of ['hue','inner','outer'])inputs[key].disabled=!validSaved||allHue.checked;
    for(const key of ['gx0','gy0','gx1','gy1'])inputs[key].disabled=!validSaved||!useGradient.checked;
    useRefinement.disabled=!validSaved;clearRefinement.disabled=!validSaved||!useRefinement.checked;
    for(const key of refinementKeys)inputs[`refine-${key}`].disabled=!validSaved||!useRefinement.checked;
    useBasic.disabled=!validSaved;clearBasic.disabled=!validSaved||!useBasic.checked;
    for(const key of basicKeys)inputs[`basic-${key}`].disabled=!validSaved||!useBasic.checked;
    pickButton.textContent=pick?'採色を終了':'Beforeで採色を開始';pickButton.setAttribute('aria-pressed',String(pick));root.setAttribute('aria-busy',String(pending));}
  function hydrate(){layerChoose.replaceChildren();layers.forEach((layer,index)=>{const o=el('option',`${index+1}. ${layer.name}（${layer.enabled===false?'無効':'有効'}）`);o.value=String(index);layerChoose.append(o);});layerChoose.value=String(layerIndex);layerName.value=layers[layerIndex].name;layerEnabled.checked=layers[layerIndex].enabled!==false;
    selected=Math.max(0,Math.min(selected,draft.selections.length-1));choose.replaceChildren();draft.selections.forEach((s,i)=>{const option=el('option',`範囲 ${i+1}`);option.value=String(i);choose.append(option);});choose.value=String(selected);
    useRefinement.checked=Boolean(draft.refinement);for(const key of refinementKeys)inputs[`refine-${key}`].value=String(draft.refinement?.[key]??0);
    useBasic.checked=Boolean(draft.basic);for(const key of basicKeys)inputs[`basic-${key}`].value=String(draft.basic?.[key]??0);
    const g=draft.gradient;useGradient.checked=Boolean(g);gradientKind.value=g?.kind??'linear';gradientOperation.value=g?.operation??'intersect';gradientInvert.checked=g?.invert??false;
    inputs.gx0.value=String(g?.from.x??.25);inputs.gy0.value=String(g?.from.y??.5);inputs.gx1.value=String(g?.to.x??.75);inputs.gy1.value=String(g?.to.y??.5);
    brushOperation.value=draft.brush?.operation??'add';
    const s=draft.selections[selected];enabled.checked=s.enabled;allHue.checked=s.hue===null;inputs.hue.value=String(s.hue?.center??0);inputs.inner.value=String(s.hue?.inner??10);inputs.outer.value=String(s.hue?.outer??20);
    for(let i=0;i<4;i++){inputs[`s${i}`].value=String(s.saturation[i]);inputs[`l${i}`].value=String(s.lightness[i]);inputs[`lum${i}`].value=String((draft.luminance?.limits??[0,0,1,1])[i]);}useLuminance.checked=Object.hasOwn(draft,'luminance');luminanceInvert.checked=draft.luminance?.invert??false;invert.checked=draft.invert;for(const [key,value] of Object.entries(draft.levels.master))inputs[key].value=String(value);controls();}
  function read(){const candidate=structuredClone(draft),s=candidate.selections[selected];const value=key=>{const text=inputs[key].value.trim();if(!text)throw Error('数値を入力してください。');return Number(text);};
    s.enabled=enabled.checked;s.hue=allHue.checked?null:{center:value('hue'),inner:value('inner'),outer:value('outer')};s.saturation=[0,1,2,3].map(i=>value(`s${i}`));s.lightness=[0,1,2,3].map(i=>value(`l${i}`));candidate.invert=invert.checked;
    if(useLuminance.checked)candidate.luminance={limits:[0,1,2,3].map(i=>value(`lum${i}`)),invert:luminanceInvert.checked};
    else delete candidate.luminance;
    if(useGradient.checked)candidate.gradient={kind:gradientKind.value,from:{x:value('gx0'),y:value('gy0')},to:{x:value('gx1'),y:value('gy1')},invert:gradientInvert.checked,operation:gradientOperation.value};
    else delete candidate.gradient;
    if(useRefinement.checked)candidate.refinement=Object.fromEntries(refinementKeys.map(key=>[key,value(`refine-${key}`)]));
    else delete candidate.refinement;
    if(useBasic.checked)candidate.basic=Object.fromEntries(basicKeys.map(key=>[key,value(`basic-${key}`)]));
    else delete candidate.basic;
    if(candidate.brush)candidate.brush.operation=brushOperation.value;
    for(const key of Object.keys(candidate.levels.master))candidate.levels.master[key]=value(key);validateColorRangeLevels(candidate);validateColorRangeLevels(layerDocument(candidate));draft=candidate;layers[layerIndex].settings=structuredClone(candidate);return structuredClone(candidate);}
  function edit(task){if(!ready())return;const prior={layers:structuredClone(layers),layerIndex,draft:structuredClone(draft),selected};
    try{stopModes();task();captureLayers();dirty=true;clearMask();status.textContent='未適用です。適用後、既存の保存操作でRecipeを保存してください。';controls();}
    catch(error){layers=prior.layers;layerIndex=prior.layerIndex;draft=prior.draft;selected=prior.selected;hydrate();message(error);}}
  layerChoose.addEventListener('change',()=>{if(!ready())return;const next=Number(layerChoose.value);
    try{stopModes();read();captureLayers();if(!Number.isInteger(next)||!layers[next])throw Error('選択マスクが不正です。');layerIndex=next;draft=structuredClone(layers[next].settings);selected=0;hydrate();status.textContent='選択マスクを切り替えました。マスク表示は選択レイヤーだけです。';}
    catch(error){layerChoose.value=String(layerIndex);message(error);}});
  layerName.addEventListener('change',()=>edit(()=>{read();layers[layerIndex].name=layerName.value.trim();captureLayers();hydrate();}));
  layerEnabled.addEventListener('change',()=>edit(()=>{read();layers[layerIndex].enabled=layerEnabled.checked;captureLayers();hydrate();}));
  for(const input of [...Object.values(inputs),allHue,enabled,invert,useLuminance,luminanceInvert,brushOperation,strokeMode,brushRadius,brushHardness,useGradient,gradientKind,gradientOperation,gradientInvert,useRefinement,useBasic])input.addEventListener('input',()=>{if(!ready())return;stopStroke();gradientMode=false;gradientStart=null;dirty=true;clearMask();status.textContent='未適用の変更があります。';controls();});
  function stopStroke(){const prior=active;active=null;if(prior&&before.hasPointerCapture?.(prior.id))before.releasePointerCapture(prior.id);if(source&&!disposed&&permitted())paint(before,source);}
  function brushPoint(event){const rect=before.getBoundingClientRect();const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;if(!Number.isFinite(x)||!Number.isFinite(y)||rect.width<=0||rect.height<=0||x<0||y<0||x>1||y>1)throw Error('ブラシはBefore画像の内側で操作してください。');return {x,y};}
  function newStroke(point){const radius=Number(brushRadius.value),hardness=Number(brushHardness.value);if(!brushRadius.value.trim()||!brushHardness.value.trim()||!Number.isFinite(radius)||radius<.1||radius>50||!Number.isFinite(hardness)||hardness<0||hardness>100)throw Error('ブラシ半径・硬さを確認してください。');return {points:[point],radius:radius/100,hardness:hardness/100,mode:strokeMode.value};}
  function appendStroke(stroke){const candidate=read();candidate.brush={brushVersion:'suite-normalized-coverage-brush-1',operation:brushOperation.value,strokes:[...(candidate.brush?.strokes??[]),stroke]};validateColorRangeLevels(candidate);validateColorRangeLevels(layerDocument(candidate));
    // Preflight the real Proxy brush workload before accepting the draft.
    const mask=createColorRangeLevelsMask(source,candidate);draft=candidate;dirty=true;paint(maskCanvas,visualizePointColorRange(source,mask,{mode:'overlay'}));status.textContent='ブラシ線を下書きへ追加しました。適用・保存は別操作です。';controls();}
  function pushPoint(event){const p=brushPoint(event),last=active.stroke.points.at(-1);if(Math.hypot((p.x-last.x)*source.width,(p.y-last.y)*source.height)<2)return;
    const count=layers.reduce((total,layer,index)=>total+((index===layerIndex?draft:layer.settings).brush?.strokes??[]).reduce((sum,s)=>sum+s.points.length,0),0)+active.stroke.points.length;if(count>=4096)throw Error('全マスクのブラシ合計4096点を超えます。');active.stroke.points.push(p);
    const c=before.getContext('2d');c.strokeStyle='rgba(255,0,160,.7)';c.lineCap='round';c.lineWidth=Math.max(1,active.stroke.radius*Math.min(source.width,source.height)*2);c.beginPath();c.moveTo(last.x*source.width,last.y*source.height);c.lineTo(p.x*source.width,p.y*source.height);c.stroke();}
  before.addEventListener('pointerdown',event=>{if(!ready()||!brushMode||active||event.button!==0||event.isPrimary===false)return;try{event.preventDefault();read();if((draft.brush?.strokes.length??0)>=64)throw Error('ブラシは64線までです。');active={id:event.pointerId,stroke:newStroke(brushPoint(event))};before.setPointerCapture(event.pointerId);}catch(error){stopStroke();message(error);}});
  before.addEventListener('pointermove',event=>{if(!active||event.pointerId!==active.id)return;try{if(!ready()||!brushMode)throw Error('ブラシ操作が無効になりました。');event.preventDefault();pushPoint(event);}catch(error){stopStroke();message(error);}});
  before.addEventListener('pointerup',event=>{if(!active||event.pointerId!==active.id)return;try{if(!ready()||!brushMode)throw Error('ブラシ操作が無効になりました。');pushPoint(event);const stroke=active.stroke;stopStroke();appendStroke(stroke);}catch(error){stopStroke();message(error);}});
  for(const name of ['pointercancel','lostpointercapture'])before.addEventListener(name,()=>{if(active)stopStroke();});
  before.addEventListener('keydown',event=>{if(!ready()||!brushMode)return;try{if(event.key==='Escape'){event.preventDefault();stopStroke();brushMode=false;controls();return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();keyboard={x:Math.max(0,Math.min(1,keyboard.x+(event.key==='ArrowRight'?.01:event.key==='ArrowLeft'?-.01:0))),y:Math.max(0,Math.min(1,keyboard.y+(event.key==='ArrowDown'?.01:event.key==='ArrowUp'?-.01:0)))};status.textContent=`ブラシ位置 ${Math.round(keyboard.x*100)}%, ${Math.round(keyboard.y*100)}%。Enterで点描。`;}else if(event.key==='Enter'||event.key===' '){event.preventDefault();stopStroke();appendStroke(newStroke({...keyboard}));}}catch(error){message(error);}});
  choose.addEventListener('change',()=>{if(!ready())return;const next=Number(choose.value);try{read();selected=next;hydrate();}catch(error){choose.value=String(selected);message(error);}});
  before.addEventListener('click',event=>{if(!ready()||!gradientMode)return;event.preventDefault();event.stopPropagation();try{const point=brushPoint(event);if(!gradientStart){gradientStart=point;status.textContent='始点を指定しました。次に終点をクリックしてください。';controls();return;}
    const previous=structuredClone(draft);inputs.gx0.value=String(gradientStart.x);inputs.gy0.value=String(gradientStart.y);inputs.gx1.value=String(point.x);inputs.gy1.value=String(point.y);useGradient.checked=true;
    try{const doc=read(),mask=createColorRangeLevelsMask(source,doc);paint(maskCanvas,visualizePointColorRange(source,mask,{mode:'overlay'}));dirty=true;status.textContent='グラデーションを下書きへ設定しました。適用・保存は別操作です。';}
    catch(error){draft=previous;hydrate();throw error;}finally{gradientMode=false;gradientStart=null;controls();}
  }catch(error){message(error);}});
  before.addEventListener('click',event=>{if(!ready()||!pick)return;event.preventDefault();event.stopPropagation();edit(()=>{read();const rect=before.getBoundingClientRect();if(rect.width<=0||rect.height<=0)throw Error('COLOR_RANGE_CANVAS_HIDDEN');const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;if(x<0||y<0||x>1||y>1)return;const sample=samplePointColor(source,{x,y,radius:2,id:draft.selections[selected].id});draft.selections[selected]=sample.selection;hydrate();});});
  function synchronize(value){if(disposed)return;current=value;const incoming=session.proxy;const next=JSON.stringify([value?.asset?.id,value?.asset?.sha256,value?.revision,value?.recipe,value?.busy,value?.exporting,value?.beforeURL,value?.afterURL,permitted()]);
    if(next!==signature||incoming!==source){const lost=dirty||Boolean(active)||Boolean(gradientStart);stopStroke();signature=next;dirty=false;pick=false;brushMode=false;gradientMode=false;gradientStart=null;keyboard={x:.5,y:.5};clearMask();source=null;before.hidden=true;before.width=before.height=1;validSaved=true;const saved=value?.recipe?.parameters?.extendedParameters?.colorRangeLevels;
      try{if(saved!==undefined)validateColorRangeLevels(saved);
        layers=saved?.schemaVersion===2?structuredClone(saved.layers):[{id:'legacy-layer',name:saved?'既存マスク':'マスク 1',settings:saved===undefined?initial():structuredClone(saved)}];
      }catch{validSaved=false;layers=[{id:'invalid-layer',name:'読込不可',settings:initial()}];}layerIndex=0;draft=structuredClone(layers[0].settings);selected=0;
      if(permitted()&&incoming){try{assertPixels(incoming);if(incoming.width*incoming.height>8_000_000)throw Error('COLOR_RANGE_PREVIEW_CAPACITY');source=incoming;paint(before,source);}catch(error){message(error);}}
      hydrate();status.textContent=!validSaved?'保存済み設定が不正です。自動置換せず、解除だけ可能です。':lost?'写真・Recipe・操作状態が変わり、未適用の入力を破棄しました。':'';
    }controls();}
  async function commit(clear){if(disposed||pending||!permitted()||!clear&&!ready())return;stopStroke();gradientMode=false;gradientStart=null;let doc;try{if(clear)doc=null;else{read();captureLayers();doc=layerDocument();validateColorRangeLevels(doc);applyColorRangeLevels(source,source,doc);}}catch(error){message(error);return;}const assetID=current.asset.id;pending=true;pick=false;brushMode=false;controls();
    try{await session.setColorRangeLevels(doc);if(!disposed&&current?.asset?.id===assetID){signature=null;synchronize(session.state??current);status.textContent=clear?'色範囲Levelsを解除しました。保存してください。':'適用しました。Recipeを保存してください。';}}
    catch(error){if(!disposed)message(error);}finally{pending=false;if(!disposed)controls();}}
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;stopStroke();source=null;draft=null;layers=[];if(typeof unsubscribe==='function')unsubscribe();before.width=before.height=maskCanvas.width=maskCanvas.height=1;root.remove();}});
}
