import {readLookXMPSubset} from './processing/astra-look-corpus.mjs';
import {validateColorAdjustments} from './processing/color-adjustments.mjs';

const GLOBAL_FIELDS=Object.freeze({Exposure2012:'exposure',Contrast2012:'contrast',Saturation:'saturation'});
const COLOR_FIELDS=Object.freeze({Highlights2012:'highlights',Shadows2012:'shadows',Whites2012:'whites',Blacks2012:'blacks',Vibrance:'vibrance'});
export const CAMERA_RAW_SETTINGS_INTERPRETATION='suite-processing-settings-approximation';

/** Translate the existing PUBLIC EIGHT-CONTROL XMP subset into explicit SUITE
 * processing patches. Not a second XML parser or an Adobe rendering engine.
 * readLookXMPSubset owns UTF-8/1MiB/DTD/entity rejection, CRS namespace lookup,
 * duplicate numeric fields, finite/range validation and unknown CRS rejection.
 * Adobe Exposure2012's +/-5 range exceeds the current SUITE global +/-4 gate:
 * reject rather than silently clipping or changing the common renderer.
 *
 * Contrast/Saturation map to SUITE multipliers. SUITE globals use linear RGB;
 * the older renderLookXMPSubset approximation uses display-referred contrast.
 * These are distinct interpretations: this converter promises neither Adobe
 * parity nor pixel equality with that older training-reference renderer.
 * WB/Kelvin, profiles, curves, local masks, private settings and arbitrary
 * process-version algorithms are NOT converted by this module.
 */
export function convertCameraRawXMPToSuiteSettings(bytes,{interpretation}={}){
  if(interpretation!==CAMERA_RAW_SETTINGS_INTERPRETATION)throw Error('XMP_SUITE_SETTINGS_EXPLICIT_INTERPRETATION_REQUIRED');
  const parsed=readLookXMPSubset(bytes),globalPatch={},postDecodePatch={},converted=[];
  for(const [source,value] of Object.entries(parsed.values)){
    if(Object.hasOwn(GLOBAL_FIELDS,source)){
      if(source==='Exposure2012'&&Math.abs(value)>4){const error=Error('XMP_EXPOSURE_EXCEEDS_SUITE_RANGE');error.property=source;error.value=value;error.supportedRange=[-4,4];throw error;}
      const target=GLOBAL_FIELDS[source],convertedValue=source==='Exposure2012'?value:1+value/100;
      globalPatch[target]=convertedValue;converted.push({source,target:`globals.${target}`,sourceValue:value,value:convertedValue});
    }else if(Object.hasOwn(COLOR_FIELDS,source)){
      const target=COLOR_FIELDS[source];postDecodePatch[target]=value;converted.push({source,target:`postDecodeAdjustments.${target}`,sourceValue:value,value});
    }else throw Error('XMP_SUITE_SETTING_UNSUPPORTED');
  }
  // Reuse the actual SUITE post-decode contract, but return only supplied fields.
  // Filling defaults here would unexpectedly erase the user's unrelated edits.
  validateColorAdjustments(postDecodePatch);
  return {kind:'suite-xmp-settings-patch',version:1,globalPatch,postDecodePatch,converted,
    interpretation:CAMERA_RAW_SETTINGS_INTERPRETATION,sourceSubset:parsed.kind,
    application:'explicit-host-confirmation-and-shared-recipe-validation-required',
    processingOrder:['exposure','contrast','saturation','postDecodeAdjustments'],
    status:'converted-not-applied',adobeRenderEquivalent:false,originalUnchanged:true};
}
