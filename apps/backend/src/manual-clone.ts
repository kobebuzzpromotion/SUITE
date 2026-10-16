import {validateManualMakeup, type ManualMakeupBrush} from './manual-makeup-brush.js';
export interface ManualClone {
  schemaVersion: 1;
  engineVersion: 'suite-manual-clone-1';
  brushVersion: 'suite-normalized-coverage-brush-1';
  strokes: ManualMakeupBrush['strokes'];
  offset: {dx: number; dy: number};
  heal: boolean;
  opacity: number;
}
function fail(): never {throw new Error('INVALID_MANUAL_CLONE');}
function record(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length) fail();
  for (const key of keys) {const d = Object.getOwnPropertyDescriptor(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();}
}
export function validateManualClone(value: unknown): asserts value is ManualClone {
  record(value, ['schemaVersion', 'engineVersion', 'brushVersion', 'strokes', 'offset', 'heal', 'opacity']);
  if (value.schemaVersion !== 1 || value.engineVersion !== 'suite-manual-clone-1' || typeof value.heal !== 'boolean') fail();
  record(value.offset, ['dx', 'dy']);
  for (const key of ['dx', 'dy']) {const n = value.offset[key]; if (typeof n !== 'number' || !Number.isFinite(n) || n < -1 || n > 1) fail();}
  // Reuse the strict normalized brush parser; never copy/filter unvalidated keys.
  try {validateManualMakeup({schemaVersion: value.schemaVersion, engineVersion: 'suite-manual-makeup-brush-1',
    brushVersion: value.brushVersion, strokes: value.strokes, color: {r: 0, g: 0, b: 0}, opacity: value.opacity});}
  catch {fail();}
}
