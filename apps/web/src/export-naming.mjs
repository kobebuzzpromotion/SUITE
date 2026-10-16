/**
 * Pure filename planning for a completed export Blob. This never writes a file,
 * changes the Recipe, or chooses a destination. The caller must still obtain
 * an authorized, verified Final before offering a download.
 */
export const EXPORT_NAMING_METHODS=Object.freeze([
  'original',
  'custom-count',
  'capture-date-original',
  'custom-sequence',
  'original-custom',
  'original-effect-preset',
  'original-export-preset',
  'original-effect-export-preset',
  'original-effect-custom'
]);

const EXTENSIONS=Object.freeze({jpeg:'.jpg',png:'.png',tiff:'.tif'});
const WINDOWS_RESERVED=/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const encoder=new TextEncoder();

function bytes(value){return encoder.encode(value).byteLength;}

function trimToBytes(value,maximum){
  let result='';
  for(const character of value){if(bytes(result+character)>maximum)break;result+=character;}
  return result.replace(/[. ]+$/g,'');
}

/** Normalize one user-supplied component into a single cross-platform safe name part. */
export function sanitizeExportNamePart(value){
  if(typeof value!=='string')throw Error('EXPORT_NAME_REQUIRED');
  if(value.length>4096)throw Error('EXPORT_NAME_TOO_LONG');
  let part=value.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')
    .replace(/[<>:"/\\|?*]/g,'_')
    .replace(/\s+/g,' ').trim()
    .replace(/^[. ]+|[. ]+$/g,'')
    .replace(/_+/g,'_');
  if(!part||/^_+$/.test(part))throw Error('EXPORT_NAME_REQUIRED');
  if(WINDOWS_RESERVED.test(part))part=`_${part}`;
  return part;
}

function originalStem(filename){
  if(typeof filename!=='string'||!filename.trim())throw Error('EXPORT_ORIGINAL_NAME_REQUIRED');
  const dot=filename.lastIndexOf('.');
  return sanitizeExportNamePart(dot>0?filename.slice(0,dot):filename);
}

function requiredPart(value,label){
  try{return sanitizeExportNamePart(value);}
  catch(error){if(error?.message==='EXPORT_NAME_REQUIRED')throw Error(`EXPORT_${label}_REQUIRED`);throw error;}
}

function datePrefix(value){
  if(typeof value!=='string')throw Error('EXPORT_CAPTURE_DATE_REQUIRED');
  const match=/^(?:([0-9]{4})([0-9]{2})([0-9]{2})|([0-9]{4})-([0-9]{2})-([0-9]{2}))$/.exec(value);
  if(!match)throw Error('EXPORT_CAPTURE_DATE_INVALID');
  const parts=match[1]?[match[1],match[2],match[3]]:[match[4],match[5],match[6]];
  const year=Number(parts[0]),month=Number(parts[1]),day=Number(parts[2]);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw Error('EXPORT_CAPTURE_DATE_INVALID');
  return parts.join('');
}

function queuePosition(sequence,total){
  if(!Number.isSafeInteger(sequence)||!Number.isSafeInteger(total)||sequence<1||total<1||sequence>total)throw Error('EXPORT_SEQUENCE_INVALID');
  return {sequence,total};
}

function safeStem(stem,suffix,extension){
  // Keep every final filename under the 255-byte component limit, even when a
  // collision suffix is appended. Do not truncate the sequence/collision tag.
  const limit=255-bytes(suffix)-bytes(extension);
  if(limit<1)throw Error('EXPORT_NAME_TOO_LONG');
  const clipped=trimToBytes(stem,limit);
  if(!clipped)throw Error('EXPORT_NAME_TOO_LONG');
  const result=clipped+suffix;
  return WINDOWS_RESERVED.test(result)?`_${trimToBytes(clipped,limit-1)}${suffix}`:result;
}

/**
 * Return a safe basename (never a path) for JPEG/PNG/TIFF Web exports.
 * Existing names are compared case-insensitively for Windows/macOS portability;
 * no existing file is overwritten. Caller should include earlier batch outputs.
 */
export function buildExportFilename({
  originalFilename,format,method='original',customName,customText,
  sequence=1,total=1,captureDate,effectPresetName,exportPresetName,existingNames=[]
}={}){
  const extension=EXTENSIONS[format];
  if(!extension)throw Error('EXPORT_FORMAT_UNSUPPORTED');
  if(!EXPORT_NAMING_METHODS.includes(method))throw Error('EXPORT_NAMING_METHOD_UNSUPPORTED');
  const original=originalStem(originalFilename);
  let stem;
  switch(method){
    case 'original':stem=original;break;
    case 'custom-count':{
      const position=queuePosition(sequence,total);
      stem=`${requiredPart(customName,'CUSTOM_NAME')} (${position.sequence} of ${position.total})`;break;
    }
    case 'capture-date-original':stem=`${datePrefix(captureDate)}_${original}`;break;
    case 'custom-sequence':{
      const position=queuePosition(sequence,total);
      stem=`${requiredPart(customName,'CUSTOM_NAME')}_${String(position.sequence).padStart(Math.max(3,String(position.total).length),'0')}`;break;
    }
    case 'original-custom':stem=`${original}_${requiredPart(customText,'CUSTOM_TEXT')}`;break;
    case 'original-effect-preset':stem=`${original}_${requiredPart(effectPresetName,'EFFECT_PRESET_NAME')}`;break;
    case 'original-export-preset':stem=`${original}_${requiredPart(exportPresetName,'EXPORT_PRESET_NAME')}`;break;
    case 'original-effect-export-preset':stem=`${original}_${requiredPart(effectPresetName,'EFFECT_PRESET_NAME')}_${requiredPart(exportPresetName,'EXPORT_PRESET_NAME')}`;break;
    case 'original-effect-custom':stem=`${original}_${requiredPart(effectPresetName,'EFFECT_PRESET_NAME')}_${requiredPart(customText,'CUSTOM_TEXT')}`;break;
  }
  const occupied=new Set();
  if(existingNames==null||typeof existingNames==='string'||typeof existingNames[Symbol.iterator]!=='function')throw Error('EXPORT_EXISTING_NAMES_INVALID');
  for(const name of existingNames){
    if(typeof name!=='string')throw Error('EXPORT_EXISTING_NAMES_INVALID');
    occupied.add(name.normalize('NFC').toLocaleLowerCase('en-US'));
  }
  for(let collision=0;collision<=9999;collision++){
    const suffix=collision?`_${String(collision).padStart(2,'0')}`:'';
    const filename=safeStem(stem,suffix,extension)+extension;
    if(!occupied.has(filename.normalize('NFC').toLocaleLowerCase('en-US')))return filename;
  }
  throw Error('EXPORT_NAME_COLLISION_LIMIT');
}
