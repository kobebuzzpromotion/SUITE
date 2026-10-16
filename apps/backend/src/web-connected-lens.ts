export interface WebLensProfile {
  schemaVersion:1;coordinateSpace:'upright-uncropped';mapping:'output-to-input';
  id:string;camera:string;lens:string;focalLength:number;aperture:number;aspectRatio:number;
  center:number[];radial:number[];tangential:number[];vignette:number[];channelScale:number[];
}
export interface WebLensShading {schemaVersion:1;engineVersion:'suite-lens-shading-1';profile:WebLensProfile;shading:number;maximumGain:number;distortion?:number;chromatic?:number;}
function fail():never{throw Error('INVALID_WEB_LENS_SHADING');}
function exact(v:unknown,keys:string[]):asserts v is Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
}
function number(v:unknown,min:number,max:number){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail();}
function array(v:unknown,length:number,min:number,max:number){
  if(!Array.isArray(v)||v.length!==length||Reflect.ownKeys(v).length!==length+1)fail();
  for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();number(d.value,min,max);}
}
/** Structural validation is not proof of calibration, ownership or a camera match. */
export function validateWebLensShading(value:unknown):asserts value is WebLensShading{
  const optional=['distortion','chromatic'].filter(key=>value&&typeof value==='object'&&Object.hasOwn(value,key));
  exact(value,['schemaVersion','engineVersion','profile','shading','maximumGain',...optional]);
  if(value.schemaVersion!==1||value.engineVersion!=='suite-lens-shading-1')fail();
  number(value.shading,0,1);number(value.maximumGain,1,16);
  for(const key of optional)number(value[key],0,1);
  const p=value.profile;
  exact(p,['schemaVersion','coordinateSpace','mapping','id','camera','lens','focalLength','aperture','aspectRatio','center','radial','tangential','vignette','channelScale']);
  if(p.schemaVersion!==1||p.coordinateSpace!=='upright-uncropped'||p.mapping!=='output-to-input')fail();
  for(const key of ['id','camera','lens']){const text=p[key];if(typeof text!=='string'||!text.trim()||text.length>256||/[\p{Cc}\p{Cf}]/u.test(text))fail();}
  number(p.focalLength,1,3000);number(p.aperture,.5,128);number(p.aspectRatio,.1,10);
  array(p.center,2,0,1);array(p.radial,3,-4,4);array(p.tangential,2,-1,1);array(p.vignette,3,-8,8);array(p.channelScale,3,.8,1.2);
}
