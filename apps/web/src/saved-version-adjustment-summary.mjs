import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

// Read data descriptors only: display code must not invoke user getters. Limits
// bound malformed/cyclic input without exposing coefficients or stroke content.
function snapshot(value,budget={nodes:100000,chars:2097152},depth=0,seen=new Set()){
  if(--budget.nodes<0||depth>32)throw Error('SUMMARY_LIMIT');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw Error('SUMMARY_NUMBER');return value;}
  if(typeof value==='string'){budget.chars-=value.length;if(budget.chars<0)throw Error('SUMMARY_LIMIT');return value;}
  if(!value||typeof value!=='object'||seen.has(value))throw Error('SUMMARY_DATA');
  const array=Array.isArray(value);
  if(!array&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('SUMMARY_DATA');
  const keys=Reflect.ownKeys(value);
  if(keys.length>budget.nodes||array&&(!Number.isSafeInteger(value.length)||value.length>100000||keys.length!==value.length+1))throw Error('SUMMARY_LIMIT');
  seen.add(value);const out=array?[]:Object.create(null);
  for(const key of keys){
    if(array&&key==='length')continue;
    if(typeof key!=='string'||array&&!/^(0|[1-9][0-9]*)$/.test(key))throw Error('SUMMARY_DATA');
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error('SUMMARY_DATA');
    Object.defineProperty(out,key,{value:snapshot(d.value,budget,depth+1,seen),enumerable:true,writable:true,configurable:true});
  }
  seen.delete(value);return out;
}
const pct=n=>`${Number((n*100).toFixed(2))}%`;
const levels=m=>`入力 ${m.inputBlack??0}–${m.inputWhite??255}、γ ${m.gamma??1}、出力 ${m.outputBlack??0}–${m.outputWhite??255}`;
/** Plain-text display only. Caller owns history SHA/authorization and must use
 * textContent, never innerHTML. Presence (including zero strength) is retained.
 * This summary neither renders pixels nor asserts runtime effect support. */
export function summarizeSavedVersionAdjustments(recipe){
  if(recipe===null||recipe===undefined)return [];
  try{
    const safe=snapshot(recipe);validateRecipe(safe);
    const extra=safe.parameters.extendedParameters,rows=[];
    if(extra.manualMakeup){const d=extra.manualMakeup;rows.push(`手塗りメイク：${d.schemaVersion===2?d.layers.length:1}レイヤー`);}
    if(extra.manualSkin){const d=extra.manualSkin;rows.push(`手動肌補正：${d.schemaVersion===2?d.layers.length:1}レイヤー`);}
    if(extra.manualClone){const d=extra.manualClone;rows.push(`手動${d.heal?'修復':'クローン'}：濃さ ${pct(d.opacity)}`);}
    if(extra.manualRedEye)rows.push(`手動赤目補正：強さ ${extra.manualRedEye.amount}`);
    if(extra.webManualTeeth)rows.push(`手動歯補正：明るさ ${extra.webManualTeeth.brightness}、脱色 ${extra.webManualTeeth.desaturation}`);
    if(extra.webManualClothing)rows.push(`手動衣服補正：しわ軽減 ${pct(extra.webManualClothing.dewrinkle)}、細かいしわ ${pct(extra.webManualClothing.fineWrinkles)}、大きいしわ ${pct(extra.webManualClothing.coarseWrinkles)}`);
    if(extra.webLensShading)rows.push(`レンズ補正：周辺減光 ${pct(extra.webLensShading.shading)}、歪曲 ${pct(extra.webLensShading.distortion??0)}、色収差 ${pct(extra.webLensShading.chromatic??0)}、最大ゲイン ${extra.webLensShading.maximumGain}`);
    if(extra.webManualLiquify)rows.push(`手動ゆがみ：${extra.webManualLiquify.operations.length}操作、固定ブラシ ${extra.webManualLiquify.freezeStrokes.length}本`);
    if(extra.localLUTMask)rows.push(`LUT局所範囲：${extra.localLUTMask.strokes.length}本${extra.localLUTMask.invert?'・反転':''}`);
    if(extra.webRawDenoise)rows.push(`RAWノイズ除去（非AI）：強度${pct(extra.webRawDenoise.strength)}、半径${extra.webRawDenoise.radius}、sigma ${extra.webRawDenoise.sigma}`);
    if(extra.webDepthRange)rows.push(`手持ち深度範囲：${extra.webDepthRange.depth.width}×${extra.webDepthRange.depth.height}、${extra.webDepthRange.invert?'反転':'通常'}、露出${extra.webDepthRange.basic.exposure}`);
    if(extra.webManualSpot)rows.push(`小領域修復：修復${extra.webManualSpot.defects.length}本／参照${extra.webManualSpot.domain.length}本、強度${pct(extra.webManualSpot.strength)}、${extra.webManualSpot.iterations}反復`);
    if(extra.webManualBackground)rows.push(`単色背景補正：照明むら ${pct(extra.webManualBackground.lighting)}、バンディング ${pct(extra.webManualBackground.banding)}`);
    if(extra.manualHair){const d=extra.manualHair;rows.push(`手動髪補正：色の強さ ${d.amount}、つや ${d.shine}、なめらかさ ${d.smooth??0}、白髪補正 ${d.blacken??0}`);}
    if(extra.manualEyes){const r=extra.manualEyes.regions;
      rows.push(`手動目補正：${Object.keys(r).length}領域（${[['eye','目全体の明るさ'],['sclera','白目の明るさ'],['iris','虹彩の彩度']].filter(([key])=>Object.hasOwn(r,key)).map(([key,label])=>`${label} ${r[key].amount}`).join('、')}）`);}
    if(extra.localLevels){const d=extra.localLevels;rows.push(`ブラシ範囲Levels：${Object.keys(d.levels).map(key=>`${({master:'全体',red:'赤',green:'緑',blue:'青'})[key]??'未対応チャンネル'} ${levels(d.levels[key])}`).join('／')}`);}
    if(extra.colorRangeLevels){const rangeDocument=extra.colorRangeLevels;
      const rangeLayers=rangeDocument.schemaVersion===2?rangeDocument.layers.map(layer=>layer.settings):[rangeDocument];
      if(rangeDocument.schemaVersion===2)rows.push(`色範囲マスク：${rangeLayers.length}レイヤー（有効 ${rangeDocument.layers.filter(layer=>layer.enabled!==false).length}）`);
      for(const [index,d] of rangeLayers.entries()){
      if(rangeDocument.schemaVersion===2)rows.push(`マスクレイヤー ${index+1} の設定（${rangeDocument.layers[index].enabled===false?'無効・補正しない':'有効'}）`);
      const parts=[`色選択 ${d.selections.length}件（有効 ${d.selections.filter(s=>s.enabled).length}件）`,`色範囲反転 ${d.invert?'あり':'なし'}`];
      if(d.luminance)parts.push(`輝度範囲あり（反転 ${d.luminance.invert?'あり':'なし'}）`);
      const operation={add:'追加',subtract:'減算',intersect:'交差'};
      if(d.brush)parts.push(`ブラシ ${operation[d.brush.operation]??'読取不可'}`);
      if(d.gradient)parts.push(`${d.gradient.kind==='linear'?'線形':'放射'}グラデーション ${operation[d.gradient.operation]??'読取不可'}（反転 ${d.gradient.invert?'あり':'なし'}）`);
      rows.push(`色範囲マスク：${parts.join('、')}`);
      rows.push(`色範囲Levels：${levels(d.levels.master)}`);
      if(d.basic)rows.push(`色範囲の基本調整：露出 ${d.basic.exposure}、コントラスト ${d.basic.contrast}、彩度 ${d.basic.saturation}`);
      if(d.refinement)rows.push(`色範囲の境界：拡張 ${d.refinement.expand}、縮小 ${d.refinement.contract}、平滑 ${d.refinement.smooth}、ぼかし ${d.refinement.feather}`);
      }
    }
    if(extra.personalLook)rows.push(`個人Look：強度 ${pct(extra.personalLook.strength)}`);
    const summarized=new Set(['webDepthRange','webRawDenoise','manualMakeup','manualSkin','manualClone','manualRedEye','manualHair','manualEyes','webManualTeeth','webManualClothing','webManualBackground','webManualSpot','webLensShading','webManualLiquify','localLUTMask','localLevels','colorRangeLevels','personalLook']);
    // Do not label unrelated or special runtime settings as supported effects.
    if(Object.keys(extra).some(key=>!summarized.has(key)))rows.push('その他の設定あり（この概要では内容・描画対応を判定しません）');
    return rows;
  }catch{return ['設定読取不可（不正または未対応の形式）'];}
}
