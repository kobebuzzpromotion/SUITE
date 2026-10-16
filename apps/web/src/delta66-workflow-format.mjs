import {assertPixels, checkAbort} from './processing/pure.mjs';
import {encode} from './processing/encode.mjs';
import {encodeTIFF} from './export-tiff.mjs';
import {resizeExportPixels} from './export-size.mjs';
import {applyExportOutputSharpening} from './export-output-adjustments.mjs';

/** An already-rendered RGBA8 Final only. Never decodes/replaces an Original.
 * Original-format means a delivery codec choice, not returning RAW bytes as edited output.
 * Large-format/tiled high-precision Final is NOT implemented by this bounded browser path.
 */
export async function encodeDeliveryFrame(frame, {format = 'jpeg', sourceFormat,
  size = {kind:'original'}, sharpening = {kind:'none'}, resolution, quality = .95,
  maximumBytes, minimumQuality = .1, qualityStep = .05, bitDepth = 8,
  allowExpanded8BitTIFF = false, preserveAlpha = true, signal} = {}) {
  assertPixels(frame); checkAbort(signal);
  if (typeof preserveAlpha !== 'boolean' || ![8,16].includes(bitDepth)) throw Error('DELIVERY_SETTINGS_INVALID');
  let selected = format;
  if (selected === 'original') {
    if (!['raw','jpeg','png','tiff'].includes(sourceFormat)) throw Error('DELIVERY_SOURCE_FORMAT_REQUIRED');
    selected = sourceFormat === 'raw' ? 'jpeg' : sourceFormat;
    if (preserveAlpha && frame.data.some((value, index) => index % 4 === 3 && value < 255)) selected = 'png';
  }
  if (!['jpeg','png','tiff'].includes(selected)) throw Error('DELIVERY_CODEC_UNSUPPORTED');
  if (bitDepth === 16 && (selected !== 'tiff' || allowExpanded8BitTIFF !== true))
    throw Error('DELIVERY_TRUE_16BIT_PIPELINE_REQUIRED');
  if (typeof quality !== 'number' || !Number.isFinite(quality) || quality < .01 || quality > 1)
    throw Error('DELIVERY_QUALITY_INVALID');
  if (maximumBytes !== undefined && (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || selected !== 'jpeg'))
    throw Error('DELIVERY_BYTE_TARGET_INVALID');
  if (!Number.isFinite(minimumQuality) || minimumQuality < .01 || minimumQuality > quality ||
      !Number.isFinite(qualityStep) || qualityStep < .01 || qualityStep > .5) throw Error('DELIVERY_QUALITY_GRID_INVALID');
  // Ordering is deliberate: saved Editor detail -> Final resize -> delivery-only sharpening.
  let pixels = applyExportOutputSharpening(resizeExportPixels(frame, size, {signal}), sharpening, {signal});
  if (!preserveAlpha) {
    const data = pixels.data.slice();
    for (let i=0;i<data.length;i+=4) {
      if ((i & 65535) === 0) checkAbort(signal);
      const a=data[i+3]/255;
      for(let c=0;c<3;c++) data[i+c]=Math.round(data[i+c]*a+255*(1-a));
      data[i+3]=255;
    }
    pixels={...pixels,data};
  }
  if (bitDepth === 16) {
    if (resolution !== undefined && (!['ppi','ppc'].includes(resolution?.unit) ||
        !Number.isSafeInteger(resolution.value) || resolution.value < 1 || resolution.value > 65535))
      throw Error('DELIVERY_RESOLUTION_INVALID');
    const encoded=encodeTIFF({width:pixels.width,height:pixels.height,data:pixels.data,bitsPerSample:16,
      channels:preserveAlpha?'RGBA':'RGB',signal,...(resolution ? {resolution:{x:resolution.value,y:resolution.value,
        unit:resolution.unit==='ppi'?'INCH':'CENTIMETER'}} : {})});
    return {blob:new Blob([encoded.bytes],{type:'image/tiff'}),format:selected,width:pixels.width,height:pixels.height,
      precision:'expanded-8-bit-lattice',quality:null};
  }
  const options = {format:selected,resolution,signal};
  if (maximumBytes === undefined) return {blob:await encode(pixels,{...options,quality:selected==='tiff'?.95:quality}),
    format:selected,width:pixels.width,height:pixels.height,precision:'srgb8',quality:selected==='jpeg'?quality:null};
  // Descending finite grid: no assumption that codec size is monotonic, no silent dimension loss.
  const grid=[];
  for(let q=quality;q>minimumQuality;q-=qualityStep) grid.push(Math.max(minimumQuality,Math.round(q*1e6)/1e6));
  grid.push(minimumQuality);
  for (const q of [...new Set(grid)]) {
    checkAbort(signal); const blob=await encode(pixels,{...options,quality:q});
    if(blob.size<=maximumBytes) return {blob,format:selected,width:pixels.width,height:pixels.height,
      precision:'srgb8',quality:q,byteTargetMet:true};
  }
  throw Error('DELIVERY_BYTE_TARGET_UNREACHABLE_WITHOUT_RESIZE');
}
