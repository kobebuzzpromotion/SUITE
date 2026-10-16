import {validateColorRangeLevels,validateColorRangeLevelsV1} from '../../../../dist/apps/backend/src/color-range-levels.js';
import {assertPixels,checkAbort} from './pure.mjs';
import {createColorRangeMask} from './lr-range-masks.mjs';
import {applyLocalLevels} from './local-levels.mjs';
import {makePortraitMask,combinePortraitMasks,applyPortraitAdjustmentStack} from './delta66-portrait-masks.mjs';
import {rasterizeLocalBrushMask} from './local-mask-brush.mjs';
import {createPortraitGradientCoverage} from './portrait-gradient-mask.mjs';
import {refineMaskForRender} from './mask-refinement-render.mjs';
export {validateColorRangeLevels,validateColorRangeLevelsV1};

function adjustTile(current,coverage,settings,signal){
  const leveled=applyLocalLevels(current,coverage,settings.levels,{signal});
  const basic=settings.basic;
  // Each stage uses the same coverage; neutral basic follows the old path.
  if(!basic||basic.exposure===0&&basic.contrast===0&&basic.saturation===0)return leveled;
  return applyPortraitAdjustmentStack(leveled,coverage.data,[{kind:'basic',values:basic}],{signal});
}

function selectionMask(tile,settings,signal,brush,start=0,gradient){
  const mask=createColorRangeMask(tile,settings.selections,{invert:settings.invert,signal});
  if(settings.luminance){
    // Existing display-RGB weighted luma (.2126 R + .7152 G + .0722 B),
    // not HSL lightness or linear-light/RAW luminance. Both use unedited input.
    const luma=makePortraitMask(tile,{kind:'luminance',...settings.luminance},{signal});
    mask.data=combinePortraitMasks(mask.data,luma,'intersect');
  }
  if(gradient)mask.data=combinePortraitMasks(mask.data,gradient.subarray(start,start+tile.width*tile.height),settings.gradient.operation);
  if(brush){
    mask.data=combinePortraitMasks(mask.data,brush.subarray(start,start+tile.width*tile.height),settings.brush.operation);
  }
  if(brush||gradient)for(let i=0;i<mask.data.length;i++){if(!(i&8191))checkAbort(signal);if(!tile.data[i*4+3])mask.data[i]=0;}
  return mask;
}
function brushCoverage(source,settings,signal,workBudget){
  // Spatial strokes MUST rasterize in full-frame coordinates, not flattened strips.
  return settings.brush?rasterizeLocalBrushMask({width:source.width,height:source.height,strokes:settings.brush.strokes,signal,workBudget}).data:null;
}
function gradientCoverage(source,settings,signal){
  if(!settings.gradient)return null;
  const mask=createPortraitGradientCoverage(source,settings.gradient,{signal});
  for(let i=0;i<mask.length;i++){if(!(i&8191))checkAbort(signal);mask[i]=source.data[i*4+3]?(settings.gradient.invert?255-mask[i]:mask[i]):0;}
  return mask;
}

// Selection is pointwise, so strips need neither overlap nor source metadata.
// Even an unusually wide one-row frame is split into bounded linear spans.
function spans(frame,visit,signal){
  const rowPixels=Math.max(1,Math.floor(262144/frame.width))*frame.width;
  const stride=Math.min(rowPixels,262144),count=frame.width*frame.height;
  for(let start=0;start<count;start+=stride){checkAbort(signal);const length=Math.min(stride,count-start);
    visit(start,{width:length,height:1,data:frame.data.subarray(start*4,(start+length)*4)});
  }checkAbort(signal);
}
export function createColorRangeLevelsMask(source,settings,{signal}={}){
  assertPixels(source);validateColorRangeLevelsV1(settings);checkAbort(signal);
  return createMask(source,settings,signal);
}
function createMask(source,settings,signal,workBudget){
  const data=new Uint8Array(source.width*source.height);
  const brush=brushCoverage(source,settings,signal,workBudget);
  const gradient=gradientCoverage(source,settings,signal);
  spans(source,(start,tile)=>{const mask=selectionMask(tile,settings,signal,brush,start,gradient);data.set(mask.data,start);},signal);
  const mask={width:source.width,height:source.height,data};
  return settings.refinement?refineMaskForRender(source,mask,settings.refinement,{signal}):mask;
}
/** Mask colors come from the unedited input, never from the corrected result.
 * Output stays straight-alpha sRGB8; Original and both input buffers unchanged. */
export function applyColorRangeLevels(pixels,source,settings,{signal}={}){
  assertPixels(pixels);assertPixels(source);validateColorRangeLevels(settings);checkAbort(signal);
  if(pixels.width!==source.width||pixels.height!==source.height)throw Error('COLOR_RANGE_LEVELS_SOURCE_DIMENSIONS');
  if(settings.schemaVersion===1)return applySingle(pixels,source,settings,signal);
  const workBudget={remaining:96_000_000};let output=pixels;
  for(const layer of settings.layers){checkAbort(signal);if(layer.enabled===false)continue;output=applySingle(output,source,layer.settings,signal,workBudget);}
  checkAbort(signal);return output===pixels?{...pixels,data:new Uint8ClampedArray(pixels.data)}:output;
}
function applySingle(pixels,source,settings,signal,workBudget){
  const data=new Uint8ClampedArray(pixels.data);
  if(settings.refinement){
    const mask=createMask(source,settings,signal,workBudget);
    spans(source,(start,tile)=>{
      const current={width:tile.width,height:1,data:pixels.data.subarray(start*4,(start+tile.width)*4)};
      const coverage={width:tile.width,height:1,data:mask.data.subarray(start,start+tile.width)};
      data.set(adjustTile(current,coverage,settings,signal).data,start*4);
    },signal);
    return {...pixels,data};
  }
  const brush=brushCoverage(source,settings,signal,workBudget);
  const gradient=gradientCoverage(source,settings,signal);
  spans(source,(start,tile)=>{
    const mask=selectionMask(tile,settings,signal,brush,start,gradient);
    const current={width:tile.width,height:1,data:pixels.data.subarray(start*4,(start+tile.width)*4)};
    data.set(adjustTile(current,mask,settings,signal).data,start*4);
  },signal);
  return {...pixels,data};
}
