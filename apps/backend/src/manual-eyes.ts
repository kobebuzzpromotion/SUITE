import {validateManualMakeup, type ManualMakeupBrush} from './manual-makeup-brush.js';

export interface ManualEyes {
  schemaVersion: 1;
  engineVersion: 'suite-manual-eyes-1';
  brushVersion: ManualMakeupBrush['brushVersion'];
  regions: Partial<Record<'eye' | 'sclera' | 'iris', {strokes: ManualMakeupBrush['strokes']; amount: number}>>;
}
function fail(): never {throw Error('INVALID_MANUAL_EYES');}
function record(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length!==keys.length) fail();
  for (const key of keys) {const d=Object.getOwnPropertyDescriptor(value,key);if (!d?.enumerable || !Object.hasOwn(d,'value')) fail();}
}
/** Nonsemantic hand-painted regions. No detected iris, face identity, or consent claim. */
export function validateManualEyes(value: unknown): asserts value is ManualEyes {
  record(value,['schemaVersion','engineVersion','brushVersion','regions']);
  if (value.schemaVersion!==1 || value.engineVersion!=='suite-manual-eyes-1' || value.brushVersion!=='suite-normalized-coverage-brush-1') fail();
  const regions=value.regions;
  if (!regions || typeof regions!=='object' || Array.isArray(regions)) fail();
  const keys=Reflect.ownKeys(regions);
  if (!keys.length || keys.length>3 || keys.some(key=>typeof key!=='string' || !['eye','sclera','iris'].includes(key))) fail();
  record(regions,keys as string[]);
  let strokes=0,points=0;
  for (const key of keys as string[]) {
    const region=regions[key];record(region,['strokes','amount']);
    if (typeof region.amount!=='number' || !Number.isFinite(region.amount) || region.amount<0 || region.amount>100) fail();
    const brush={schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:value.brushVersion,
      strokes:region.strokes,color:{r:0,g:0,b:0},opacity:0};
    try {validateManualMakeup(brush);} catch {fail();}
    const checked=brush as ManualMakeupBrush;
    strokes+=checked.strokes.length;
    points+=checked.strokes.reduce((sum,stroke)=>sum+stroke.points.length,0);
    if (strokes>64 || points>4096) fail();
  }
}
