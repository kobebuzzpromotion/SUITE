export interface ManualSkin {
  schemaVersion: 1;
  engineVersion: 'suite-manual-skin-1';
  brushVersion: 'suite-normalized-coverage-brush-1';
  strokes: {points: {x: number; y: number}[]; radius: number; hardness: number; mode: 'add' | 'erase'}[];
  smoothness: number;
  texture: number;
  rosy: number;
  radius: number;
  temperature?: number;
  tint?: number;
  radiance?: number;
  finish?: 'natural' | 'matte' | 'satin' | 'dewy';
}
function fail(): never {throw new Error('INVALID_MANUAL_SKIN');}
export interface ManualSkinLayers {
  schemaVersion: 2;
  engineVersion: 'suite-manual-skin-2';
  brushVersion: ManualSkin['brushVersion'];
  layers: (Omit<ManualSkin, 'schemaVersion' | 'engineVersion' | 'brushVersion'> & {id: string; name: string})[];
}
function record(value: unknown, keys: string[], optional: string[] = []): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(key => typeof key !== 'string' || ![...keys, ...optional].includes(key))) fail();
  for (const key of keys) {const d = Object.getOwnPropertyDescriptor(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();}
  for (const key of optional) if (Object.hasOwn(value, key)) {const d = Object.getOwnPropertyDescriptor(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();}
}
function dense(value: unknown, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail();
  for (let i = 0; i < value.length; i++) {const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();}
}
function range(value: unknown, min: number, max: number): value is number {return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;}
export function validateManualSkin(value: unknown): asserts value is ManualSkin | ManualSkinLayers {
  const version = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'schemaVersion') : undefined;
  if (version && Object.hasOwn(version, 'value') && version.value === 2) {
    record(value, ['schemaVersion', 'engineVersion', 'brushVersion', 'layers']);
    if (value.engineVersion !== 'suite-manual-skin-2' || value.brushVersion !== 'suite-normalized-coverage-brush-1') fail();
    dense(value.layers, 8);
    const ids = new Set<string>();let strokes = 0, points = 0;
    for (const layer of value.layers) {
      record(layer, ['id', 'name', 'strokes', 'smoothness', 'texture', 'rosy', 'radius'], ['temperature', 'tint', 'radiance', 'finish']);
      if (typeof layer.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(layer.id) || ids.has(layer.id) ||
        typeof layer.name !== 'string' || !layer.name.trim() || layer.name.length > 40 || /[\u0000-\u001f\u007f]/.test(layer.name)) fail();
      ids.add(layer.id);
      const {id, name, ...settings} = layer;
      const legacy = {...settings, schemaVersion: 1, engineVersion: 'suite-manual-skin-1', brushVersion: value.brushVersion};
      validateManualSkin(legacy);
      const checked = legacy as ManualSkin;
      strokes += checked.strokes.length;
      points += checked.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
      if (strokes > 64 || points > 4096) fail();
    }
    return;
  }
  record(value, ['schemaVersion', 'engineVersion', 'brushVersion', 'strokes', 'smoothness', 'texture', 'rosy', 'radius'], ['temperature', 'tint', 'radiance', 'finish']);
  if (value.schemaVersion !== 1 || value.engineVersion !== 'suite-manual-skin-1' || value.brushVersion !== 'suite-normalized-coverage-brush-1' ||
    !range(value.smoothness, 0, 100) || !range(value.texture, -100, 100) || !range(value.rosy, -100, 100) ||
    !range(value.radius, 1, 32) || !Number.isInteger(value.radius)) fail();
  for (const key of ['temperature', 'tint', 'radiance']) if (Object.hasOwn(value, key) && !range(value[key], -100, 100)) fail();
  if (Object.hasOwn(value, 'finish') && !['natural', 'matte', 'satin', 'dewy'].includes(value.finish as string)) fail();
  dense(value.strokes, 64);let points = 0;
  for (const stroke of value.strokes) {
    record(stroke, ['points', 'radius', 'hardness', 'mode']);
    if (!range(stroke.radius, 0, .5) || stroke.radius <= 0 || !range(stroke.hardness, 0, 1) ||
      !['add', 'erase'].includes(stroke.mode as string)) fail();
    dense(stroke.points, 4096);points += stroke.points.length;if (points > 4096) fail();
    for (const point of stroke.points) {record(point, ['x', 'y']);if (!range(point.x, 0, 1) || !range(point.y, 0, 1)) fail();}
  }
}
