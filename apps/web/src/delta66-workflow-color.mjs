import {srgbToLinear,linearToSrgb} from './processing/pure.mjs';

/** Standard, relative-colorimetric D65 RGB sample conversion; NOT an arbitrary ICC CMM.
 * Primary sources (reviewed 2026-10-08):
 * https://registry.color.org/rgb-registry/srgb
 * https://registry.color.org/rgb-registry/adobergb
 * https://www.adobe.com/digitalimag/pdfs/AdobeRGB1998.pdf (2005-05, section 4.3)
 * Matrices derive from xy primaries/white rather than rounded published inverses.
 * Shared normalized D65 white: no D50 PCS, absolute luminance/viewing-condition adaptation,
 * black-point compensation, perceptual gamut mapping or ICC profile bytes are implied.
 */
const WHITE=[.3127,.3290], GAMMA=563/256;
const PRIMARIES={srgb:[[.64,.33],[.30,.60],[.15,.06]],'adobe-rgb':[[.64,.33],[.21,.71],[.15,.06]]};
const MAX_WORKING_BYTES=32*1024*1024,MAX_TILE_PIXELS=2_000_000,EPSILON=1e-12;
const abort=signal=>{if(signal?.aborted)throw new DOMException('Color conversion cancelled','AbortError');};
const vector=(matrix,v)=>matrix.map(row=>row.reduce((sum,value,i)=>sum+value*v[i],0));
function inverse(matrix){
  const rows=matrix.map((row,i)=>[...row,...[0,1,2].map(j=>i===j?1:0)]);
  for(let col=0;col<3;col++){
    let pivot=col;
    for(let row=col+1;row<3;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
    if(Math.abs(rows[pivot][col])<1e-15)throw Error('STANDARD_RGB_MATRIX_SINGULAR');
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const divisor=rows[col][col];for(let j=0;j<6;j++)rows[col][j]/=divisor;
    for(let row=0;row<3;row++)if(row!==col){const factor=rows[row][col];for(let j=0;j<6;j++)rows[row][j]-=factor*rows[col][j];}
  }
  return rows.map(row=>row.slice(3));
}
function toXYZ(primaries){
  const columns=primaries.map(([x,y])=>[x/y,1,(1-x-y)/y]);
  const basis=[0,1,2].map(row=>columns.map(col=>col[row]));
  const [x,y]=WHITE,scale=vector(inverse(basis),[x/y,1,(1-x-y)/y]);
  return basis.map(row=>row.map((value,i)=>value*scale[i]));
}
const MATRICES=Object.fromEntries(Object.entries(PRIMARIES).map(([name,primaries])=>[name,toXYZ(primaries)]));
const multiply=(a,b)=>a.map(row=>[0,1,2].map(col=>row.reduce((sum,value,i)=>sum+value*b[i][col],0)));
const identity=[[1,0,0],[0,1,0],[0,0,1]];

/**
 * source: {width,height,channels:'RGB'|'RGBA',alphaMode:'straight' for RGBA,
 *   colorSpace:'srgb'|'adobe-rgb',transfer:'encoded'|'linear',
 *   bitsPerSample:8|16|32,data:Uint8Array|Uint8ClampedArray|Uint16Array|Float32Array}.
 * Float32 samples must be normalized SDR [0,1]; HDR/negative values require an upstream
 * explicit tone/gamut mapping step and are rejected even when target gamutPolicy='clip'.
 * Output is encoded 8/16-bit, with straight alpha scaled (never transfer-corrected).
 * result.strip is directly suitable as TIFF writer readStrip's result. Statistics count
 * target-gamut excursions, including hidden RGB in transparent pixels; source is immutable.
 */
export function convertStandardRGBStrip(source,{targetColorSpace,outputBits,gamutPolicy='reject',signal}={}){
  abort(signal);
  if(!source||!Object.hasOwn(PRIMARIES,source.colorSpace)||!Object.hasOwn(PRIMARIES,targetColorSpace)||
      !['encoded','linear'].includes(source.transfer)||!['RGB','RGBA'].includes(source.channels)||
      ![8,16].includes(outputBits)||!['reject','clip'].includes(gamutPolicy))throw Error('STANDARD_RGB_SETTINGS_INVALID');
  if(source.channels==='RGBA'?source.alphaMode!=='straight':source.alphaMode!==undefined)
    throw Error('STANDARD_RGB_STRAIGHT_ALPHA_REQUIRED');
  const {width,height,data,bitsPerSample}=source,channels=source.channels==='RGBA'?4:3;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
      width*height>MAX_TILE_PIXELS||!(data?.buffer instanceof ArrayBuffer)||data.length!==width*height*channels)
    throw Error('STANDARD_RGB_TILE_INVALID');
  const is8=data instanceof Uint8Array||data instanceof Uint8ClampedArray;
  if(!(bitsPerSample===8&&is8||bitsPerSample===16&&data instanceof Uint16Array||bitsPerSample===32&&data instanceof Float32Array))
    throw Error('STANDARD_RGB_SAMPLE_TYPE_MISMATCH');
  if(data.byteLength+data.length*(outputBits/8)>MAX_WORKING_BYTES)throw Error('STANDARD_RGB_TILE_MEMORY_LIMIT');
  const sourceMaximum=bitsPerSample===32?1:bitsPerSample===16?65535:255,targetMaximum=outputBits===16?65535:255;
  // Validate all channels, including alpha and fully-transparent hidden RGB, before allocating.
  if(bitsPerSample===32)for(let i=0;i<data.length;i++){
    if((i&65535)===0)abort(signal);
    if(!Number.isFinite(data[i])||data[i]<0||data[i]>1)throw Error('STANDARD_RGB_HDR_OR_NONFINITE_REQUIRES_EXPLICIT_MAPPING');
  }
  const matrix=source.colorSpace===targetColorSpace?identity:multiply(inverse(MATRICES[targetColorSpace]),MATRICES[source.colorSpace]);
  const decode=source.transfer==='linear'?value=>value:source.colorSpace==='srgb'?srgbToLinear:value=>value**GAMMA;
  const encode=targetColorSpace==='srgb'?linearToSrgb:value=>value**(1/GAMMA);
  const output=outputBits===16?new Uint16Array(data.length):new Uint8Array(data.length);
  let clippedChannels=0,clippedPixels=0,largestExcursion=0;
  for(let i=0;i<data.length;i+=channels){
    if((i/channels&4095)===0)abort(signal);
    const linear=vector(matrix,[decode(data[i]/sourceMaximum),decode(data[i+1]/sourceMaximum),decode(data[i+2]/sourceMaximum)]);
    let clipped=false;
    for(let c=0;c<3;c++){
      const value=linear[c],excursion=Math.max(0,-value,value-1);
      if(excursion>EPSILON){
        if(gamutPolicy==='reject'){
          const error=Error('STANDARD_RGB_TARGET_GAMUT_EXCEEDED');error.pixelIndex=i/channels;error.channel=c;error.linearValue=value;throw error;
        }
        clippedChannels++;clipped=true;largestExcursion=Math.max(largestExcursion,excursion);
      }
      // Only numerical epsilon excursions are silently snapped; actual clipping is opt-in/countable.
      output[i+c]=Math.round(Math.max(0,Math.min(1,encode(Math.max(0,Math.min(1,value)))))*targetMaximum);
    }
    if(clipped)clippedPixels++;
    if(channels===4)output[i+3]=Math.round(data[i+3]/sourceMaximum*targetMaximum);
  }
  abort(signal);
  return {strip:{width,height,channels:source.channels,bitsPerSample:outputBits,colorSpace:targetColorSpace,
    ...(channels===4?{alphaMode:'straight'}:{}),data:output},
    sourcePrecision:{sampleType:bitsPerSample===32?'float32':`uint${bitsPerSample}`,bitsPerSample,
      transfer:source.transfer,effectivePrecision:'not-inferred-from-container'},
    conversion:{method:'standard-relative-D65-matrix',sourceColorSpace:source.colorSpace,targetColorSpace,
      outputTransfer:'encoded',outputBits,gamutPolicy,clippedChannels,clippedPixels,largestLinearExcursion:largestExcursion,
      numericalTolerance:EPSILON,addsSourcePrecision:false,iccCMM:false}};
}
