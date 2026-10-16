/** TIFF 6.0, uncompressed or lossless PackBits, bounded strip memory.
 * Unlike export-tiff.mjs this accepts actual Uint16 samples and does not expand
 * an 8-bit buffer. RAW decoding, color conversion and rendering belong upstream.
 * The sink owns a temporary destination: close commits it, abort discards it.
 * No file is opened, original modified or cloud destination selected here.
 */
import {buildDeliveryDateTIFF} from './delta66-workflow-metadata.mjs';

const preparedDates = new WeakMap();
/** Optional async preparation; existing synchronous planning and writer signatures stay valid.
 * Pass the returned opaque value as options.dates to BOTH plan and write. Reuses the same
 * SHA-bound capture reader/UTC formatting as JPEG/PNG, without another datetime parser.
 * A prepared value is local structural metadata, not proof of Asset authorization or clock truth.
 */
export async function prepareStreamingTIFFDates(options) {
  const prepared = await buildDeliveryDateTIFF(options);
  const token = Object.freeze({kind:'suite-tiff-minimal-dates-1'});
  preparedDates.set(token, structuredClone(prepared.fields));
  return token;
}

const UINT32_MAX = 0xffffffff;
const MAX_METADATA = 8 * 1024 * 1024;
const MAX_STRIP = 32 * 1024 * 1024;
const MAX_ICC = 4 * 1024 * 1024;
const SHORT = 3, LONG = 4, RATIONAL = 5, UNDEFINED = 7;
const align2 = n => n + n % 2;
const fail = message => { throw new Error(message); };
function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('TIFF_STREAM_ABORTED', 'AbortError');
}
function integer(n, min, max, name) {
  if (!Number.isSafeInteger(n) || n < min || n > max) fail(`TIFF_STREAM_${name}`);
  return n;
}
function privateBuffer(data) {
  return data?.buffer instanceof ArrayBuffer;
}
function profileCopy(profile, colorSpace) {
  if (colorSpace === 'untagged') {
    if (profile !== undefined) fail('TIFF_STREAM_UNTAGGED_PROFILE');
    return null;
  }
  if (!['srgb', 'adobe-rgb'].includes(colorSpace) || profile?.colorSpace !== colorSpace ||
      !(profile.bytes instanceof Uint8Array) || !privateBuffer(profile.bytes) ||
      profile.bytes.length < 132 || profile.bytes.length > MAX_ICC)
    fail('TIFF_STREAM_RGB_ICC_REQUIRED');
  const bytes = profile.bytes.slice(), view = new DataView(bytes.buffer);
  const ascii = at => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (view.getUint32(0, false) !== bytes.length || ascii(36) !== 'acsp' ||
      ascii(16) !== 'RGB ' || !['XYZ ', 'Lab '].includes(ascii(20)))
    fail('TIFF_STREAM_ICC_HEADER');
  const count = view.getUint32(128, false);
  if (count > Math.floor((bytes.length - 132) / 12)) fail('TIFF_STREAM_ICC_TAG_TABLE');
  for (let i = 0; i < count; i++) {
    const at = 132 + i * 12, offset = view.getUint32(at + 4, false), length = view.getUint32(at + 8, false);
    if (offset < 132 + count * 12 || length < 8 || offset + length > bytes.length)
      fail('TIFF_STREAM_ICC_TAG_RANGE');
  }
  // This checks the container, not the truth of its label or its colorimetric
  // transform. Upstream must supply matching already-converted pixel samples.
  return bytes;
}
function layout(options) {
  const {width, height, channels = 'RGB', bitsPerSample = 16, byteOrder = 'II',
    dpi = 300, colorSpace = 'untagged', iccProfile, alphaMode, compression = 'none',
    maxStripBytes = 4 * 1024 * 1024, rowsPerStrip: requestedRows} = options;
  integer(width, 1, UINT32_MAX, 'WIDTH'); integer(height, 1, UINT32_MAX, 'HEIGHT');
  integer(dpi, 1, 1_000_000, 'DPI'); integer(maxStripBytes, 1024, MAX_STRIP, 'STRIP_BUDGET');
  if (!['RGB', 'RGBA'].includes(channels) || ![8, 16].includes(bitsPerSample) ||
      !['II', 'MM'].includes(byteOrder) || !['none','packbits'].includes(compression)) fail('TIFF_STREAM_ENCODING');
  if (channels === 'RGBA' ? alphaMode !== 'straight' : alphaMode !== undefined)
    fail('TIFF_STREAM_ALPHA_MODE');
  const samples = channels === 'RGB' ? 3 : 4, sampleBytes = bitsPerSample / 8;
  const rowBytes = width * samples * sampleBytes, imageBytes = rowBytes * height;
  if (!Number.isSafeInteger(imageBytes) || imageBytes > UINT32_MAX)
    fail('TIFF_STREAM_BIGTIFF_REQUIRED');
  if (rowBytes > maxStripBytes) fail('TIFF_STREAM_ROW_EXCEEDS_BUDGET');
  const rowsPerStrip = requestedRows === undefined ?
    Math.min(height, Math.max(1, Math.floor(maxStripBytes / rowBytes))) :
    integer(requestedRows, 1, height, 'ROWS_PER_STRIP');
  if (rowsPerStrip * rowBytes > maxStripBytes) fail('TIFF_STREAM_STRIP_EXCEEDS_BUDGET');
  const strips = Math.ceil(height / rowsPerStrip), icc = profileCopy(iccProfile, colorSpace);
  let dates = null;
  if (options.dates !== undefined) {
    const prepared = preparedDates.get(options.dates);
    if (!prepared) fail('TIFF_STREAM_PREPARED_DATES_REQUIRED');
    dates = structuredClone(prepared);
  }
  const entryCount = 14 + (channels === 'RGBA' ? 1 : 0) + (icc ? 1 : 0) +
    (dates ? dates.root.length + 1 : 0);
  let cursor = 8 + 2 + entryCount * 12 + 4;
  const reserve = bytes => { const at = align2(cursor); cursor = at + bytes; return at; };
  const bitsOffset = reserve(samples * 2);
  const offsetsOffset = strips > 1 ? reserve(strips * 4) : 0;
  const countsOffset = strips > 1 ? reserve(strips * 4) : 0;
  const xResolutionOffset = reserve(8), yResolutionOffset = reserve(8);
  const iccOffset = icc ? reserve(icc.length) : 0;
  // All TIFF offsets, including Exif IFD pointers and strings, are absolute from file start.
  const exifOffset = dates ? reserve(2 + dates.exif.length * 12 + 4) : 0;
  if (dates) for (const field of [...dates.root, ...dates.exif]) field.offset = reserve(field.value.length + 1);
  const stripStride = align2(rowsPerStrip * rowBytes);
  const paddingBytes = (strips - 1) * (stripStride - rowsPerStrip * rowBytes);
  const pixelOffset = align2(cursor);
  // PackBits can add one literal prefix per 128 bytes per row; strip padding
  // needs at most one byte per non-final strip. This is a conservative bound.
  const totalBytes = pixelOffset + (compression === 'none' ? imageBytes + paddingBytes :
    imageBytes + height * Math.ceil(rowBytes / 128) + strips - 1);
  if (pixelOffset > MAX_METADATA) fail('TIFF_STREAM_METADATA_BUDGET');
  if (!Number.isSafeInteger(totalBytes) || totalBytes > UINT32_MAX)
    fail('TIFF_STREAM_BIGTIFF_REQUIRED');
  return {width, height, channels, samples, bitsPerSample, byteOrder, dpi, colorSpace,
    alphaMode, compression, rowBytes, rowsPerStrip, strips, stripStride, imageBytes, totalBytes, pixelOffset,
    entryCount, bitsOffset, offsetsOffset, countsOffset, xResolutionOffset,
    yResolutionOffset, iccOffset, icc, dates, exifOffset};
}
function description(p) {
  return Object.freeze({width:p.width, height:p.height, channels:p.channels,
    bitsPerSample:p.bitsPerSample, byteOrder:p.byteOrder, dpi:p.dpi,
    colorSpace:p.colorSpace, alphaMode:p.alphaMode, compression:p.compression,
    rowsPerStrip:p.rowsPerStrip, stripCount:p.strips,
    totalBytes:p.compression==='none'?p.totalBytes:null, maximumBytes:p.totalBytes,
    maxStripBufferBytes:p.rowsPerStrip*p.rowBytes,
    metadataBytes:p.pixelOffset, samplePrecision:p.bitsPerSample === 16 ? 'uint16-input' : 'uint8-input',
    ...(p.dates ? {dateMetadata:'minimal-capture-and-or-export-dates'} : {})});
}
/** Planning allocates only an optional bounded ICC copy, never output pixels. */
export function planStreamingTIFF(options) { return description(layout(options)); }

function header(p, actualOffsets, actualCounts) {
  const bytes = new Uint8Array(p.pixelOffset), view = new DataView(bytes.buffer), little = p.byteOrder === 'II';
  const s = (at, v) => view.setUint16(at, v, little), l = (at, v) => view.setUint32(at, v, little);
  bytes[0] = bytes[1] = little ? 0x49 : 0x4d;
  s(2, 42); l(4, 8); s(8, p.entryCount);
  const fields = [
    [256,LONG,1,p.width], [257,LONG,1,p.height], [258,SHORT,p.samples,p.bitsOffset],
    [259,SHORT,1,p.compression==='none'?1:32773], [262,SHORT,1,2],
    [273,LONG,p.strips,p.strips===1?(actualOffsets?.[0]??p.pixelOffset):p.offsetsOffset],
    [274,SHORT,1,1], [277,SHORT,1,p.samples], [278,LONG,1,p.rowsPerStrip],
    [279,LONG,p.strips,p.strips===1?(actualCounts?.[0]??p.imageBytes):p.countsOffset],
    [282,RATIONAL,1,p.xResolutionOffset], [283,RATIONAL,1,p.yResolutionOffset],
    [284,SHORT,1,1], [296,SHORT,1,2]
  ];
  if (p.channels === 'RGBA') fields.push([338,SHORT,1,2]);
  if (p.icc) fields.push([34675,UNDEFINED,p.icc.length,p.iccOffset]);
  if (p.dates) {
    for (const field of p.dates.root) fields.push([field.tag,2,field.value.length+1,field.offset]);
    fields.push([0x8769,LONG,1,p.exifOffset]);
  }
  fields.sort((a,b)=>a[0]-b[0]);
  for (let i=0;i<fields.length;i++) {
    const [tag,type,count,value]=fields[i], at=10+i*12;
    s(at,tag); s(at+2,type); l(at+4,count);
    if (type===SHORT && count===1) s(at+8,value); else l(at+8,value);
  }
  l(10+fields.length*12,0);
  for (let c=0;c<p.samples;c++) s(p.bitsOffset+c*2,p.bitsPerSample);
  l(p.xResolutionOffset,p.dpi); l(p.xResolutionOffset+4,1);
  l(p.yResolutionOffset,p.dpi); l(p.yResolutionOffset+4,1);
  if (p.strips>1) for (let i=0;i<p.strips;i++) {
    const y=i*p.rowsPerStrip, rows=Math.min(p.rowsPerStrip,p.height-y);
    l(p.offsetsOffset+i*4,actualOffsets?.[i]??(p.pixelOffset+i*p.stripStride));
    l(p.countsOffset+i*4,actualCounts?.[i]??(rows*p.rowBytes));
  }
  if (p.icc) bytes.set(p.icc,p.iccOffset);
  if (p.dates) {
    s(p.exifOffset,p.dates.exif.length);
    for (let i=0;i<p.dates.exif.length;i++) {
      const field=p.dates.exif[i],at=p.exifOffset+2+i*12;
      s(at,field.tag);s(at+2,2);l(at+4,field.value.length+1);l(at+8,field.offset);
    }
    l(p.exifOffset+2+p.dates.exif.length*12,0);
    for (const field of [...p.dates.root,...p.dates.exif]) {
      for (let i=0;i<field.value.length;i++) bytes[field.offset+i]=field.value.charCodeAt(i);
      bytes[field.offset+field.value.length]=0;
    }
  }
  return bytes;
}
function encodeStrip(frame, p, rows, signal) {
  if (frame?.width!==p.width || frame?.height!==rows || frame?.channels!==p.channels ||
      frame?.bitsPerSample!==p.bitsPerSample || frame?.colorSpace!==p.colorSpace ||
      frame?.alphaMode!==p.alphaMode) fail('TIFF_STREAM_SOURCE_CONTRACT');
  const data=frame.data, length=p.width*rows*p.samples;
  if (!privateBuffer(data) || data.length!==length ||
      (p.bitsPerSample===16 ? !(data instanceof Uint16Array) :
        !(data instanceof Uint8Array || data instanceof Uint8ClampedArray)))
    fail('TIFF_STREAM_SAMPLE_TYPE_OR_LENGTH');
  const bytes=new Uint8Array(rows*p.rowBytes);
  if (p.bitsPerSample===8) bytes.set(data);
  else {
    const view=new DataView(bytes.buffer), little=p.byteOrder==='II';
    for (let i=0;i<data.length;i++) {
      if ((i&16383)===0) abortIfNeeded(signal);
      view.setUint16(i*2,data[i],little);
    }
  }
  abortIfNeeded(signal); return bytes;
}
function packBitsRows(bytes, rowBytes, rows, signal) {
  const out=new Uint8Array(bytes.length+rows*Math.ceil(rowBytes/128));
  let target=0;
  for (let row=0;row<rows;row++) {
    abortIfNeeded(signal);
    let at=row*rowBytes; const end=at+rowBytes;
    while (at<end) {
      let run=1;
      while (run<128 && at+run<end && bytes[at+run]===bytes[at]) run++;
      if (run>=3) { out[target++]=257-run; out[target++]=bytes[at]; at+=run; continue; }
      const start=at;
      while (at<end && at-start<128) {
        if (at+2<end && bytes[at]===bytes[at+1] && bytes[at]===bytes[at+2]) break;
        at++;
      }
      const length=at-start;
      out[target++]=length-1; out.set(bytes.subarray(start,at),target); target+=length;
    }
  }
  return out.subarray(0,target);
}
/** readStrip receives ordered, non-overlapping FULL-WIDTH row ranges and must
 * return owned chunky samples in output color space, orientation already applied.
 * It may render tiles into one strip. It must not upscale a proxy as original.
 * sink.write must finish consuming each buffer before its promise resolves.
 * Only sink.close may publish the completed temporary destination. No retries
 * or resume without a separately validated immutable rendering job are implied.
 * PackBits requires sink.seek(byteOffset) for the final strip-table patch, and
 * the destination must stay private until close. Non-seekable sinks may use none.
 */
export async function writeStreamingTIFF(options, {readStrip, sink, signal}={}) {
  if (typeof readStrip!=='function' || typeof sink?.write!=='function' ||
      typeof sink?.close!=='function' || typeof sink?.abort!=='function')
    fail('TIFF_STREAM_PROVIDER_REQUIRED');
  const p=layout(options), result=description(p);
  if (p.compression==='packbits' && typeof sink.seek!=='function') fail('TIFF_STREAM_SEEK_REQUIRED');
  try {
    abortIfNeeded(signal);
    await sink.write(header(p));
    let bytesWritten=p.pixelOffset;
    const offsets=p.compression==='packbits'?new Uint32Array(p.strips):null;
    const counts=p.compression==='packbits'?new Uint32Array(p.strips):null;
    for (let index=0;index<p.strips;index++) {
      abortIfNeeded(signal);
      const y=index*p.rowsPerStrip, height=Math.min(p.rowsPerStrip,p.height-y);
      const frame=await readStrip(Object.freeze({x:0,y,width:p.width,height,index,
        channels:p.channels,bitsPerSample:p.bitsPerSample,colorSpace:p.colorSpace,
        alphaMode:p.alphaMode,signal}));
      abortIfNeeded(signal);
      const raw=encodeStrip(frame,p,height,signal);
      const bytes=p.compression==='packbits'?packBitsRows(raw,p.rowBytes,height,signal):raw;
      if (offsets) { offsets[index]=bytesWritten; counts[index]=bytes.length; }
      await sink.write(bytes); bytesWritten+=bytes.length;
      if (index < p.strips - 1 && bytes.length % 2) {
        await sink.write(new Uint8Array(1)); bytesWritten++;
      }
    }
    abortIfNeeded(signal);
    if (p.compression==='none' ? bytesWritten!==p.totalBytes : bytesWritten>p.totalBytes)
      fail('TIFF_STREAM_LENGTH_MISMATCH');
    if (offsets) {
      await sink.seek(0); abortIfNeeded(signal);
      await sink.write(header(p,offsets,counts));
      await sink.seek(bytesWritten); abortIfNeeded(signal);
    }
    await sink.close();
    return Object.freeze({...result,totalBytes:bytesWritten,mimeType:'image/tiff',bytesWritten,encoded:true});
  } catch (error) {
    try { await sink.abort(error); } catch { /* preserve rendering/write failure */ }
    throw error;
  }
}
