export interface WebRawDenoise {
  schemaVersion:1;
  engineVersion:'suite-web-raw-denoise-1';
  strength:number;
  radius:number;
  sigma:number;
}
function fail():never{throw Error('INVALID_WEB_RAW_DENOISE');}
export function validateWebRawDenoise(value:unknown):asserts value is WebRawDenoise{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
  const keys=['schemaVersion','engineVersion','strength','radius','sigma'];
  if(Reflect.ownKeys(value).length!==keys.length)fail();
  for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))fail();}
  const doc=value as Record<string,unknown>;
  if(doc.schemaVersion!==1||doc.engineVersion!=='suite-web-raw-denoise-1'||
    typeof doc.strength!=='number'||!Number.isFinite(doc.strength)||doc.strength<0||doc.strength>1||
    typeof doc.radius!=='number'||!Number.isInteger(doc.radius)||doc.radius<1||doc.radius>4||
    typeof doc.sigma!=='number'||!Number.isFinite(doc.sigma)||doc.sigma<1/65535||doc.sigma>.25)fail();
}
