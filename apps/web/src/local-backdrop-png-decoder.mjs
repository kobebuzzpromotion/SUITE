const fail=reason=>{throw Error(`LOCAL_BACKDROP_PNG_${reason}`);};
const crcTable=Uint32Array.from({length:256},(_,n)=>{
  for(let bit=0;bit<8;bit++)n=n&1?0xedb88320^(n>>>1):n>>>1;
  return n>>>0;
});
async function crc(bytes,start,end,check){
  let n=0xffffffff;
  for(let offset=start;offset<end;offset+=65536){
    check();
    for(let i=offset,limit=Math.min(end,offset+65536);i<limit;i++)n=crcTable[(n^bytes[i])&255]^(n>>>8);
    if(offset+65536<end){await new Promise(resolve=>setTimeout(resolve,0));check();}
  }
  return (n^0xffffffff)>>>0;
}
/** Narrow local backdrop decoder, not a general photo importer.
 * Only nonanimated 8-bit truecolor PNG is supported. Untagged images are
 * explicitly interpreted as sRGB. EXIF, ICC, cICP and any unrecognized ancillary
 * chunks are rejected, rather than guessing orientation or color management.
 * The browser returns straight-alpha sRGB8 bytes; original bytes stay unchanged.
 */
export async function decodeLocalBackdropPNG(encoded,{signal}={}){
  const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  check();
  if(!(encoded instanceof Uint8Array)||encoded.length<45||encoded.length>32*1024*1024)fail('BYTES');
  const bytes=encoded.slice();let bitmap,canvas,output;
  try{
    const signature=[137,80,78,71,13,10,26,10];
    if(signature.some((v,i)=>bytes[i]!==v))fail('FORMAT_UNSUPPORTED');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let offset=8,width=0,height=0,sawHeader=false,sawData=false,ended=false,dataEnded=false,chunks=0;
    const unique=new Set();let gamma=null,chroma=null,srgb=false;
    while(offset<bytes.length){
      check();if(++chunks>4096)fail('CHUNK_LIMIT');
      if(bytes.length-offset<12)fail('CHUNK_BOUNDS');
      const length=view.getUint32(offset),end=offset+12+length;
      if(end>bytes.length)fail('CHUNK_BOUNDS');
      const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8)),data=offset+8;
      if(!/^[A-Za-z]{4}$/.test(type)||await crc(bytes,offset+4,end-4,check)!==view.getUint32(end-4))fail('CHUNK_CRC');
      if(!sawHeader&&type!=='IHDR')fail('HEADER');
      if(type==='IHDR'){
        if(sawHeader||length!==13)fail('HEADER');sawHeader=true;
        width=view.getUint32(data);height=view.getUint32(data+4);
        if(width<1||height<1||width>32768||height>32768||width*height>8_000_000||
          bytes[data+8]!==8||![2,6].includes(bytes[data+9])||bytes[data+10]!==0||bytes[data+11]!==0||bytes[data+12]!==0)fail('HEADER_UNSUPPORTED');
      }else if(type==='IDAT'){
        if(dataEnded)fail('DATA_ORDER');sawData=true;
      }else if(type==='IEND'){
        if(!sawData||length!==0||end!==bytes.length)fail('END');ended=true;
      }else{
        if(sawData)dataEnded=true;
        // Color chunks must precede IDAT. Restrictive allowlist also rejects
        // palette transparency, animation, EXIF orientation and embedded ICC.
        if(!['sRGB','gAMA','cHRM'].includes(type)||sawData||unique.has(type))fail('CHUNK_UNSUPPORTED');
        unique.add(type);
        if(type==='sRGB'){if(length!==1||bytes[data]>3)fail('SRGB');srgb=true;}
        if(type==='gAMA'){if(length!==4)fail('GAMMA');gamma=view.getUint32(data);}
        if(type==='cHRM'){
          if(length!==32)fail('CHROMATICITY');
          chroma=Array.from({length:8},(_,i)=>view.getUint32(data+i*4));
        }
      }
      offset=end;
      if(chunks%32===0){await new Promise(resolve=>setTimeout(resolve,0));check();}
    }
    if(!ended)fail('END');
    const standard=[31270,32900,64000,33000,30000,60000,15000,6000];
    if(gamma!==null&&gamma!==45455||chroma!==null&&chroma.some((v,i)=>v!==standard[i]))fail('COLOR_PROFILE_UNSUPPORTED');
    if(!srgb&&(gamma!==null||chroma!==null))fail('EXPLICIT_SRGB_REQUIRED');
    check();
    if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')fail('RUNTIME_UNSUPPORTED');
    bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}),
      {imageOrientation:'none',premultiplyAlpha:'none',colorSpaceConversion:'default'});check();
    if(bitmap.width!==width||bitmap.height!==height)fail('DECODE_DIMENSIONS');
    canvas=new OffscreenCanvas(width,height);
    const context=canvas.getContext('2d',{alpha:true,colorSpace:'srgb',willReadFrequently:true});
    if(!context||context.getContextAttributes?.().colorSpace!=='srgb')fail('CANVAS_COLORSPACE');
    context.drawImage(bitmap,0,0);
    const image=context.getImageData(0,0,width,height,{colorSpace:'srgb'});output=image.data;check();
    if(image.colorSpace!=='srgb'||!(image.data instanceof Uint8ClampedArray)||image.data.length!==width*height*4)fail('PIXELS');
    output=image.data;
    return {width,height,data:output,colorSpace:'srgb',alpha:'straight',rows:'top-left',orientation:1};
  }catch(error){output?.fill(0);throw error;}
  finally{bitmap?.close();if(canvas){canvas.width=1;canvas.height=1;}bytes.fill(0);}
}
