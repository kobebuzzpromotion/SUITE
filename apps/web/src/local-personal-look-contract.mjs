export const PERSONAL_LOOK_ENGINE='suite-paired-polynomial-look-1';
export function validatePersonalLook(value){
  const fail=()=>{throw Error('INVALID_PERSONAL_LOOK');};
  const keys=['schemaVersion','engineVersion','coefficients','strength','format'];
  if(!value||typeof value!=='object'||Array.isArray(value)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length)fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
  const dense=(v,n)=>{if(!Array.isArray(v)||v.length!==n||Reflect.ownKeys(v).length!==n+1)fail();
    for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}return v;};
  if(value.schemaVersion!==1||value.engineVersion!==PERSONAL_LOOK_ENGINE||!['raw','nonraw'].includes(value.format)||
      typeof value.strength!=='number'||!Number.isFinite(value.strength)||value.strength<0||value.strength>1)fail();
  const coefficients=dense(value.coefficients,3).map(row=>dense(row,11).map(v=>{if(typeof v!=='number'||!Number.isFinite(v))fail();return v;}));
  return {schemaVersion:1,engineVersion:PERSONAL_LOOK_ENGINE,coefficients,strength:value.strength,format:value.format};
}
