/** Identity safety only. No retouch control, detector, mask, price or rendering implementation. */
export interface PersonGeometry {x:number; y:number; width:number; height:number}
export interface PersonGeometryTarget {id:string; anchor:PersonGeometry}
export interface PersonGeometryInventory {assetID:string; originalSHA256:string; targets:PersonGeometryTarget[]}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('PERSON_INVALID_INVENTORY');
  return value as Record<string,unknown>;
}
export function validatePersonGeometryInventory(input:unknown):asserts input is PersonGeometryInventory {
  const p=record(input);
  if(typeof p.assetID!=='string'||!uuid.test(p.assetID)||typeof p.originalSHA256!=='string'||!/^[a-f0-9]{64}$/i.test(p.originalSHA256)||!Array.isArray(p.targets)||p.targets.length===0||p.targets.length>64)throw Error('PERSON_INVALID_INVENTORY');
  const ids=new Set<string>();
  for(const item of p.targets){
    const t=record(item),a=record(t.anchor);
    if(typeof t.id!=='string'||!uuid.test(t.id)||ids.has(t.id.toLowerCase()))throw Error('PERSON_INVALID_ID');
    ids.add(t.id.toLowerCase());
    for(const k of ['x','y','width','height'])if(typeof a[k]!=='number'||!Number.isFinite(a[k]))throw Error('PERSON_INVALID_GEOMETRY');
    const g=a as unknown as PersonGeometry;
    if(g.x<0||g.y<0||g.width<=0||g.height<=0||g.x+g.width>1||g.y+g.height>1)throw Error('PERSON_INVALID_GEOMETRY');
  }
  const targets=p.targets as PersonGeometryTarget[];
  for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){
    const a=targets[i]!.anchor,b=targets[j]!.anchor;
    if(Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y))throw Error('PERSON_OVERLAPPING_FACES');
  }
}
export function validatePersonGeometryBinding(input:unknown,assetID:string,originalSHA256:string):void {
  validatePersonGeometryInventory(input);
  if(input.assetID.toLowerCase()!==assetID.toLowerCase()||input.originalSHA256.toLowerCase()!==originalSHA256.toLowerCase())throw Error('PERSON_ASSET_BINDING');
}
export function validatePersonGeometryContinuity(reference:unknown,incoming:unknown):void {
  validatePersonGeometryInventory(reference);validatePersonGeometryInventory(incoming);
  validatePersonGeometryBinding(incoming,reference.assetID,reference.originalSHA256);
  if(reference.targets.length!==incoming.targets.length)throw Error('PERSON_INVENTORY');
  for(const target of incoming.targets){
    const known=reference.targets.find(t=>t.id.toLowerCase()===target.id.toLowerCase());
    if(!known||(['x','y','width','height'] as const).some(k=>known.anchor[k]!==target.anchor[k]))throw Error('PERSON_BINDING');
  }
}
