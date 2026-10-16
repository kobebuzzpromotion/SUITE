export interface ManualMakeupBrush {
  schemaVersion: 1;
  engineVersion: 'suite-manual-makeup-brush-1';
  brushVersion: 'suite-normalized-coverage-brush-1';
  strokes: {points: {x: number; y: number}[]; radius: number; hardness: number; mode: 'add' | 'erase'}[];
  color: {r: number; g: number; b: number};
  opacity: number;
}
function fail(): never {throw new Error('INVALID_MANUAL_MAKEUP');}
export interface ManualMakeupLayers {
  schemaVersion: 2;
  engineVersion: 'suite-manual-makeup-brush-2';
  brushVersion: 'suite-normalized-coverage-brush-1';
  layers: {id: string; name: string; strokes: ManualMakeupBrush['strokes']; color: ManualMakeupBrush['color']; opacity: number}[];
}
function record(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length) fail();
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
  }
}
function dense(value: unknown, min: number, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max ||
    Reflect.ownKeys(value).length !== value.length + 1) fail();
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
  }
}
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
/** Nonsemantic local brush: no face identity, SDK approval, or AI mask claim. */
export function validateManualMakeup(value: unknown): asserts value is ManualMakeupBrush | ManualMakeupLayers {
  const version = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'schemaVersion') : undefined;
  if (version && Object.hasOwn(version, 'value') && version.value === 2) {
    record(value, ['schemaVersion','engineVersion','brushVersion','layers']);
    if (value.engineVersion !== 'suite-manual-makeup-brush-2' || value.brushVersion !== 'suite-normalized-coverage-brush-1') fail();
    dense(value.layers, 1, 8);
    const ids = new Set<string>();let strokes = 0, points = 0;
    for (const layer of value.layers) {
      record(layer, ['id','name','strokes','color','opacity']);
      if (typeof layer.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(layer.id) || ids.has(layer.id) ||
          typeof layer.name !== 'string' || !layer.name.trim() || layer.name.length > 40 || /[\u0000-\u001f\u007f]/.test(layer.name)) fail();
      ids.add(layer.id);
      const legacy = {schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:value.brushVersion,
        strokes:layer.strokes,color:layer.color,opacity:layer.opacity};
      validateManualMakeup(legacy);
      const checked = legacy as ManualMakeupBrush;
      strokes += checked.strokes.length;
      points += checked.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
      if (strokes > 64 || points > 4096) fail();
    }
    return;
  }
  record(value, ['schemaVersion', 'engineVersion', 'brushVersion', 'strokes', 'color', 'opacity']);
  if (value.schemaVersion !== 1 || value.engineVersion !== 'suite-manual-makeup-brush-1' ||
    value.brushVersion !== 'suite-normalized-coverage-brush-1' || !unit(value.opacity)) fail();
  record(value.color, ['r', 'g', 'b']);
  for (const key of ['r', 'g', 'b']) {
    const channel = value.color[key];
    if (typeof channel !== 'number' || !Number.isInteger(channel) || channel < 0 || channel > 255) fail();
  }
  dense(value.strokes, 1, 64);
  let points = 0;
  for (const stroke of value.strokes) {
    record(stroke, ['points', 'radius', 'hardness', 'mode']);
    if (!unit(stroke.radius) || stroke.radius <= 0 || stroke.radius > .5 ||
      !unit(stroke.hardness) || !['add', 'erase'].includes(stroke.mode as string)) fail();
    dense(stroke.points, 1, 4096);
    points += stroke.points.length;
    if (points > 4096) fail();
    for (const point of stroke.points) {
      record(point, ['x', 'y']);
      if (!unit(point.x) || !unit(point.y)) fail();
    }
  }
}
