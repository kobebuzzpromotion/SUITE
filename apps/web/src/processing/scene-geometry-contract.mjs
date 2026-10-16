import {sceneTransformMatrix,guidedSceneTransform,validateSceneGeometryMatrix} from './delta66-scene-geometry.mjs';

const CONTROL_KEYS=['angle','flipX','flipY','aspect','scale','x','y','vertical','horizontal'];
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
      Reflect.ownKeys(value).length!==keys.length)throw Error('SCENE_GEOMETRY_CONTRACT');
  for(const key of keys){
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error('SCENE_GEOMETRY_CONTRACT');
  }
}
function points(value){
  if(!Array.isArray(value)||value.length!==4||Reflect.ownKeys(value).length!==5)
    throw Error('SCENE_GUIDES_INVALID');
  const result=[];
  for(let i=0;i<4;i++){
    const d=Object.getOwnPropertyDescriptor(value,String(i));
    if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error('SCENE_GUIDES_INVALID');
    exact(d.value,['x','y']);
    const {x,y}=d.value;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('SCENE_GUIDES_INVALID');
    result.push({x,y});
  }
  return result;
}
/** Saved controls or four explicit point correspondences only; matrices,
 * dimensions, detections and UI state are not trusted Recipe inputs. */
export function validateSceneGeometry(value){
  const mode=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,'mode'):undefined;
  if(!mode?.enumerable||!Object.hasOwn(mode,'value')||!['manual','guided'].includes(mode.value))
    throw Error('SCENE_GEOMETRY_CONTRACT');
  exact(value,mode.value==='manual'?['schemaVersion','engineVersion','mode','controls']:
    ['schemaVersion','engineVersion','mode','sourcePoints','destinationPoints']);
  if(value.schemaVersion!==1||value.engineVersion!=='suite-scene-geometry-1')throw Error('SCENE_GEOMETRY_CONTRACT');
  if(mode.value==='guided')return {schemaVersion:1,engineVersion:'suite-scene-geometry-1',mode:'guided',
    sourcePoints:points(value.sourcePoints),destinationPoints:points(value.destinationPoints)};
  exact(value.controls,CONTROL_KEYS);
  const controls=Object.fromEntries(CONTROL_KEYS.map(key=>[key,value.controls[key]]));
  const ranges={angle:[-180,180],aspect:[.2,5],scale:[.2,5],x:[-2,2],y:[-2,2],vertical:[-.8,.8],horizontal:[-.8,.8]};
  for(const [key,[min,max]] of Object.entries(ranges))
    if(!Number.isFinite(controls[key])||controls[key]<min||controls[key]>max)throw Error('SCENE_TRANSFORM_RANGE');
  if(typeof controls.flipX!=='boolean'||typeof controls.flipY!=='boolean')throw Error('SCENE_TRANSFORM_RANGE');
  return {schemaVersion:1,engineVersion:'suite-scene-geometry-1',mode:'manual',controls};
}
/** Use the canonical upright original's width/height ratio for both Preview
 * and Final, not a separately rounded Proxy ratio. Returned matrix maps
 * destination-normalized coordinates to original source-normalized ones. */
export function sceneGeometryInverse(settings,frameAspect){
  const fixed=validateSceneGeometry(settings);
  if(!Number.isFinite(frameAspect)||frameAspect<=0||frameAspect>100)throw Error('SCENE_TRANSFORM_RANGE');
  return validateSceneGeometryMatrix(fixed.mode==='guided'?
    guidedSceneTransform(fixed.sourcePoints,fixed.destinationPoints):
    sceneTransformMatrix({...fixed.controls,frameAspect}));
}
