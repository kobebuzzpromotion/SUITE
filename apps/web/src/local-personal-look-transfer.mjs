import {validatePersonalLook} from './local-personal-look-contract.mjs';
export const PERSONAL_LOOK_BACKUP_MAX_BYTES=64*1024;
const FORMAT='suite-personal-look-coefficients';
function checked(value){
  const keys=['format','version','name','document'];
  if(!value||typeof value!=='object'||Array.isArray(value)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length)
    throw Error('LOOK_BACKUP_FORMAT_INVALID');
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error('LOOK_BACKUP_FORMAT_INVALID');}
  if(value.format!==FORMAT||value.version!==1||typeof value.name!=='string'||!value.name.trim()||
      value.name.length>80||/[\u0000-\u001f\u007f]/.test(value.name))throw Error('LOOK_BACKUP_FORMAT_INVALID');
  return {format:FORMAT,version:1,name:value.name,document:validatePersonalLook(value.document)};
}
export function encodePersonalLookBackup({name,document}){
  const bytes=new TextEncoder().encode(JSON.stringify(checked({format:FORMAT,version:1,name,document}),null,2));
  if(bytes.byteLength>PERSONAL_LOOK_BACKUP_MAX_BYTES)throw Error('LOOK_BACKUP_SIZE_LIMIT');return bytes;
}
export function decodePersonalLookBackup(bytes){
  if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>PERSONAL_LOOK_BACKUP_MAX_BYTES)
    throw Error('LOOK_BACKUP_SIZE_LIMIT');
  return checked(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
