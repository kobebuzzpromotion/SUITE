import {validateRecipe} from '../../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding} from '../../../../dist/apps/backend/src/portrait-recipe.js';
import {assertPixels,sourceDimensions,checkAbort} from './pure.mjs';
import {applyManualFaceDecorationFreckles} from './manual-face-decoration-freckles.mjs';

function exact(value,keys){
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length)return false;
  return keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor?.enumerable&&Object.hasOwn(descriptor,'value');});
}
/** Source-only replay kernel. Runtime is structural binding, NOT authentication
 * or consent: the caller must verify actual local history, Original and current
 * explicit consent before and after this isolated Worker operation.
 */
export function renderManualFrecklesPixels(pixels,savedRecipe,runtime,{target,signal}={}){
  checkAbort(signal);
  if(target!=='source'||!exact(savedRecipe,['revision','body'])||!Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
      !exact(runtime,['assetID','originalSHA256','personID','sourceWidth','sourceHeight','savedRevision'])||runtime.savedRevision!==savedRecipe.revision)
    throw Error('MANUAL_FRECKLES_RUNTIME_INVALID');
  validateRecipe(savedRecipe.body);
  const extra=savedRecipe.body.parameters.extendedParameters,document=extra.faceDecorationsManual;
  if(!exact(document,['schemaVersion','engineVersion','binding','points'])||document.schemaVersion!==1||document.engineVersion!=='suite-srgb8-owner-manual-freckles-1')
    throw Error('MANUAL_FRECKLES_DOCUMENT_REQUIRED');
  const binding=document.binding;
  if(!exact(binding,['assetID','originalSHA256','personID','sourceWidth','sourceHeight'])||
      runtime.assetID!==binding.assetID||typeof runtime.originalSHA256!=='string'||runtime.originalSHA256.toLowerCase()!==binding.originalSHA256.toLowerCase()||
      runtime.personID!==binding.personID||runtime.sourceWidth!==binding.sourceWidth||runtime.sourceHeight!==binding.sourceHeight)
    throw Error('MANUAL_FRECKLES_RUNTIME_BINDING_MISMATCH');
  const portrait=extra.portrait;
  if(!portrait||portrait.targets.some(person=>person.value!==0))throw Error('MANUAL_FRECKLES_NEUTRAL_PORTRAIT_REQUIRED');
  validatePortraitBinding(portrait,binding.assetID,binding.originalSHA256);
  if(!portrait.targets.some(person=>person.id===binding.personID))throw Error('MANUAL_FRECKLES_PERSON_NOT_SAVED');
  const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
  if(!exact(pixels,hasSource?['width','height','sourceWidth','sourceHeight','data']:['width','height','data']))throw Error('MANUAL_FRECKLES_PIXELS_INVALID');
  assertPixels(pixels);
  if(!(pixels.data.buffer instanceof ArrayBuffer)||pixels.width*pixels.height>8_000_000)throw Error('MANUAL_FRECKLES_SOURCE_CAPACITY');
  const dimensions=sourceDimensions(pixels);
  if(pixels.width!==binding.sourceWidth||pixels.height!==binding.sourceHeight||dimensions.width!==binding.sourceWidth||dimensions.height!==binding.sourceHeight)
    throw Error('MANUAL_FRECKLES_SOURCE_DIMENSIONS');
  // Detach values before rendering. The historical revision stays the actual
  // row's revision, never the current editor HEAD or a fabricated draft version.
  const context={assetID:binding.assetID,originalSHA256:binding.originalSHA256,personID:binding.personID,
    sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight,savedRevision:savedRecipe.revision,target:'source'};
  const selection={binding:{...context},points:structuredClone(document.points)};
  const source={width:pixels.width,height:pixels.height,data:new Uint8ClampedArray(pixels.data),
    ...(hasSource?{sourceWidth:pixels.sourceWidth,sourceHeight:pixels.sourceHeight}:{})};
  checkAbort(signal);
  return applyManualFaceDecorationFreckles(source,selection,context,{signal});
}
