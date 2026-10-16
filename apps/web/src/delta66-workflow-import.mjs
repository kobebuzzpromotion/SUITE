const abort=signal=>{if(signal?.aborted)throw new DOMException('Import cancelled','AbortError');};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const rawExtensions=new Set(['dng','cr2','cr3','nef','nrw','arw','sr2','srf','raf','orf','rw2','pef','3fr','iiq','raw']);
function pathOf(file){
  const path=file.webkitRelativePath||file.name;
  if(typeof path!=='string'||!path||path.length>4096||/[\u0000-\u001f\\]/u.test(path)||
      path.startsWith('/')||path.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('IMPORT_PATH_INVALID');
  return path.normalize('NFC');
}
function classify(bytes,path){
  const ext=path.split('.').at(-1).toLowerCase();
  if(ext==='lrcat')throw Error('IMPORT_LIGHTROOM_CATALOG_CODEC_REQUIRED');
  if(ext==='xmp')return 'xmp';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpeg';
  if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'png';
  // TIFF containers may be RAW (DNG/NEF/etc.). LibRaw, not this extension check,
  // must decide whether a raw candidate can actually decode.
  if(rawExtensions.has(ext))return 'raw-candidate';
  if(bytes[0]===73&&bytes[1]===73&&bytes[2]===42&&bytes[3]===0||
      bytes[0]===77&&bytes[1]===77&&bytes[2]===0&&bytes[3]===42)return 'tiff';
  throw Error('IMPORT_FILE_FORMAT_UNSUPPORTED');
}

/** Reads explicitly selected files/folders only. No Asset registration, no Original write.
 * Returns content-addressed staging entries; duplicates and ambiguous sidecars are explicit.
 * A caller-supplied known-digest inventory is only a dedupe hint, never proof of Cloud Safe.
 */
export async function prepareImportBatch(files,{knownSHA256=[],signal}={}){
  if(!Array.isArray(files)||!files.length||files.length>1000||!Array.isArray(knownSHA256)||
      knownSHA256.some(value=>typeof value!=='string'||! /^[a-f0-9]{64}$/i.test(value)))throw Error('IMPORT_SELECTION_INVALID');
  const known=new Set(knownSHA256.map(value=>value.toLowerCase())),paths=new Set(),seen=new Map(),entries=[];
  let total=0;
  // Preflight the whole selected batch before reading any large bytes.
  const selected=files.map(file=>{
    if(!(file instanceof Blob)||!file.size||file.size>512*1024*1024)throw Error('IMPORT_FILE_SIZE_LIMIT');
    total+=file.size;if(total>2*1024*1024*1024)throw Error('IMPORT_BATCH_SIZE_LIMIT');
    const path=pathOf(file),normalized=path.toLocaleLowerCase('en-US');
    if(paths.has(normalized))throw Error('IMPORT_DUPLICATE_PATH');paths.add(normalized);
    return {file,path};
  });
  for(const {file,path} of selected){
    abort(signal);const header=new Uint8Array(await file.slice(0,32).arrayBuffer());abort(signal);
    const kind=classify(header,path);
    if(kind==='xmp'&&file.size>1024*1024)throw Error('IMPORT_XMP_SIZE_LIMIT');
    const bytes=await file.arrayBuffer();abort(signal);const sha256=await hash(bytes);abort(signal);
    const duplicateOf=seen.get(sha256)??null;
    entries.push({path,kind,byteLength:file.size,sha256,file,status:known.has(sha256)?'already-known':duplicateOf?'duplicate':'staged',duplicateOf});
    if(!seen.has(sha256))seen.set(sha256,path);
  }
  const base=path=>path.replace(/\.[^./]+$/,'').toLocaleLowerCase('en-US');
  const sidecars=entries.filter(row=>row.kind==='xmp').map(row=>{
    const candidates=entries.filter(image=>image.kind!=='xmp'&&base(image.path)===base(row.path));
    return {path:row.path,candidates:candidates.map(image=>image.path),
      matchedImage:candidates.length===1?candidates[0].path:null,needsManual:candidates.length!==1};
  });
  return {status:'staged-not-registered',entries,sidecars,totalBytes:total};
}

/** Actual decode of a staged file. Existing LibRaw is reused; browser codecs may reject TIFF.
 * Rehash before decode so swapping the Blob after staging cannot change the imported source.
 */
export async function decodeStagedImport(entry,{signal}={}){
  if(!entry||!(entry.file instanceof Blob)||entry.file.size!==entry.byteLength||entry.file.size>512*1024*1024||
      typeof entry.sha256!=='string'||! /^[a-f0-9]{64}$/.test(entry.sha256))throw Error('IMPORT_STAGED_ENTRY_INVALID');
  abort(signal);const bytes=await entry.file.arrayBuffer();abort(signal);
  if(await hash(bytes)!==entry.sha256)throw Error('IMPORT_DIGEST_MISMATCH');abort(signal);
  const kind=classify(new Uint8Array(bytes,0,Math.min(32,bytes.byteLength)),entry.path);
  if(kind!==entry.kind||kind==='xmp')throw Error('IMPORT_DECODE_KIND_INVALID');
  if(kind==='raw-candidate'){
    const {decodeRaw}=await import('./processing/raw.mjs');
    return decodeRaw(bytes,{signal,mode:'final'});
  }
  if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas==='undefined')throw Error('IMPORT_IMAGE_CODEC_UNAVAILABLE');
  const bitmap=await createImageBitmap(entry.file,{imageOrientation:'from-image',premultiplyAlpha:'none',colorSpaceConversion:'default'});
  try{
    abort(signal);
    if(bitmap.width<1||bitmap.height<1||bitmap.width*bitmap.height>16_000_000)throw Error('IMPORT_DECODE_PIXEL_LIMIT');
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});
    if(!ctx)throw Error('IMPORT_CANVAS_UNAVAILABLE');ctx.drawImage(bitmap,0,0);
    const pixels=ctx.getImageData(0,0,bitmap.width,bitmap.height);abort(signal);
    return {pixels:{width:bitmap.width,height:bitmap.height,data:pixels.data},
      provenance:{sourceSHA256:entry.sha256,decoder:'browser-image-codec',bitDepth:8,colorSpace:'sRGB',orientation:'browser-from-image'}};
  }finally{bitmap.close();}
}
