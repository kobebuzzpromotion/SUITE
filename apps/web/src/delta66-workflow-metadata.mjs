import {readExifCaptureDateEvidence} from './processing/exif-capture-date.mjs';
import {readExportResolution} from './export-resolution.mjs';

const abort=signal=>{if(signal?.aborted)throw new DOMException('Metadata cancelled','AbortError');};
/** Build a MINIMAL TIFF Exif payload, not a copy of source GPS/camera/identity metadata.
 * Capture wall time/optional offset come from the existing SHA-bound reader. It supports
 * classic TIFF/DNG source containers only; it does not certify camera-clock truth/authority.
 * Export time is explicit UTC modification time (DateTime + OffsetTime), not capture time.
 */
export async function buildDeliveryDateTIFF({sourceOriginal,sourceBinding,exportedAt,signal}={}){
  abort(signal);
  let capture=null,modified=null;
  if(sourceOriginal!==undefined)capture=await readExifCaptureDateEvidence(sourceOriginal,sourceBinding,{signal});
  else if(sourceBinding!==undefined)throw Error('DELIVERY_CAPTURE_ORIGINAL_REQUIRED');
  if(exportedAt!==undefined){
    if(!Number.isSafeInteger(exportedAt)||exportedAt<0||exportedAt>253402300799999)throw Error('DELIVERY_EXPORT_TIME_INVALID');
    const iso=new Date(exportedAt).toISOString();modified=iso.slice(0,19).replaceAll('-',':').replace('T',' ');
  }
  if(!capture&&!modified)throw Error('DELIVERY_DATE_REQUIRED');
  const root=[],exif=[];
  if(modified){root.push([0x0132,modified]);exif.push([0x9010,'+00:00']);}
  if(capture){exif.push([0x9003,capture.dateTimeOriginal]);if(capture.offsetTimeOriginal)exif.push([0x9011,capture.offsetTimeOriginal]);}
  exif.sort((a,b)=>a[0]-b[0]);
  const rootCount=root.length+1,exifOffset=8+2+rootCount*12+4;
  let cursor=exifOffset+2+exif.length*12+4;
  const bytes=new Uint8Array(cursor+root.concat(exif).reduce((n,[,value])=>n+2*Math.ceil((value.length+1)/2),0));
  const view=new DataView(bytes.buffer);bytes[0]=bytes[1]=73;view.setUint16(2,42,true);view.setUint32(4,8,true);
  const ascii=(at,tag,value)=>{
    cursor+=cursor%2;
    view.setUint16(at,tag,true);view.setUint16(at+2,2,true);view.setUint32(at+4,value.length+1,true);view.setUint32(at+8,cursor,true);
    for(const ch of value)bytes[cursor++]=ch.charCodeAt(0);bytes[cursor++]=0;
  };
  view.setUint16(8,rootCount,true);let at=10;
  for(const [tag,value] of root){ascii(at,tag,value);at+=12;}
  view.setUint16(at,0x8769,true);view.setUint16(at+2,4,true);view.setUint32(at+4,1,true);view.setUint32(at+8,exifOffset,true);
  view.setUint16(exifOffset,exif.length,true);at=exifOffset+2;
  for(const [tag,value] of exif){ascii(at,tag,value);at+=12;}
  abort(signal);return {bytes,capture,exportedAt:exportedAt??null,
    fields:{root:root.map(([tag,value])=>({tag,value})),exif:exif.map(([tag,value])=>({tag,value}))}};
}

/** Existing JPEG/PNG metadata containers are replaced only for Exif. Other segments,
 * encoded image data and existing print density stay byte-for-byte unchanged.
 * The output is a new buffer, never a mutation of the Original or input encoded image.
 */
export async function writeDeliveryDates(input,{format,...options}={}){
  if(!(input instanceof Uint8Array)||!(input.buffer instanceof ArrayBuffer)||input.length>128*1024*1024||
      !['jpeg','png'].includes(format))throw Error('DELIVERY_METADATA_INPUT_INVALID');
  const bytes=input.slice();
  try{readExportResolution(bytes,format);} // Existing bounded structural reader; no density is also valid.
  catch(error){if(error?.message!=='EXPORT_RESOLUTION_UNSPECIFIED')throw error;}
  const date=await buildDeliveryDateTIFF(options),parts=[];abort(options.signal);
  if(format==='jpeg'){
    const payload=new Uint8Array(date.bytes.length+10);payload.set([255,225]);
    new DataView(payload.buffer).setUint16(2,payload.length-2,false);payload.set([69,120,105,102,0,0],4);payload.set(date.bytes,10);
    parts.push(bytes.subarray(0,2));let at=2,inserted=false,ended=false;
    while(at<bytes.length){
      abort(options.signal);const start=at;
      if(bytes[at++]!==255)throw Error('DELIVERY_JPEG_SEGMENT_INVALID');
      while(bytes[at]===255)at++;
      const marker=bytes[at++];
      if(marker===0||marker===216||marker===1||marker>=208&&marker<=215)throw Error('DELIVERY_JPEG_SEGMENT_INVALID');
      if(marker===218||marker===217){if(!inserted)parts.push(payload);parts.push(bytes.subarray(start));ended=true;break;}
      if(at+2>bytes.length)throw Error('DELIVERY_JPEG_SEGMENT_INVALID');
      const length=bytes[at]*256+bytes[at+1],end=at+length;
      if(length<2||end>bytes.length)throw Error('DELIVERY_JPEG_SEGMENT_INVALID');
      const isExif=marker===225&&length>=8&&[69,120,105,102,0,0].every((v,i)=>bytes[at+2+i]===v);
      // Preserve leading JFIF APP0, then insert one new Exif APP1.
      if(!inserted&&marker!==224){parts.push(payload);inserted=true;}
      if(!isExif)parts.push(bytes.subarray(start,end));at=end;
    }
    if(!ended)throw Error('DELIVERY_JPEG_SCAN_MISSING');
  }else{
    const chunk=new Uint8Array(date.bytes.length+12),view=new DataView(chunk.buffer);
    view.setUint32(0,date.bytes.length,false);chunk.set([101,88,73,102],4);chunk.set(date.bytes,8);
    let crc=0xffffffff;
    for(let i=4;i<chunk.length-4;i++){crc^=chunk[i];for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    view.setUint32(chunk.length-4,(crc^0xffffffff)>>>0,false);
    parts.push(bytes.subarray(0,8));let at=8,inserted=false;
    while(at<bytes.length){
      abort(options.signal);
      if(at+12>bytes.length)throw Error('DELIVERY_PNG_CHUNK_INVALID');
      const length=new DataView(bytes.buffer,bytes.byteOffset+at,4).getUint32(0,false),end=at+12+length;
      if(end>bytes.length)throw Error('DELIVERY_PNG_CHUNK_INVALID');
      const type=String.fromCharCode(...bytes.subarray(at+4,at+8));
      if(!inserted&&type==='IDAT'){parts.push(chunk);inserted=true;}
      if(type!=='eXIf')parts.push(bytes.subarray(at,end));at=end;
    }
    if(!inserted)throw Error('DELIVERY_PNG_IMAGE_MISSING');
  }
  const size=parts.reduce((sum,part)=>sum+part.length,0);if(size>128*1024*1024)throw Error('DELIVERY_METADATA_SIZE_LIMIT');
  const output=new Uint8Array(size);let at=0;for(const part of parts){output.set(part,at);at+=part.length;}
  abort(options.signal);return {bytes:output,capture:date.capture,exportedAt:date.exportedAt,
    metadataPolicy:'minimal-dates-only-existing-exif-replaced'};
}
