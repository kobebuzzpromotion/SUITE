/** Portable numeric transform only. No image, identity or local storage reference. */
export function validatePersonalLook(value: unknown): void {
  const fail = (): never => {throw new Error('INVALID_PERSONAL_LOOK');};
  const exact = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).length !== keys.length) return fail();
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d?.enumerable || !Object.hasOwn(d, 'value')) return fail();
    }
    return v as Record<string, unknown>;
  };
  const dense = (v: unknown, length: number): unknown[] => {
    if (!Array.isArray(v) || v.length !== length || Reflect.ownKeys(v).length !== length + 1) return fail();
    for (let i = 0; i < length; i++) {
      const d = Object.getOwnPropertyDescriptor(v, String(i));
      if (!d?.enumerable || !Object.hasOwn(d, 'value')) return fail();
    }
    return v;
  };
  const d = exact(value, ['schemaVersion','engineVersion','coefficients','strength','format']);
  if (d.schemaVersion !== 1 || d.engineVersion !== 'suite-paired-polynomial-look-1' ||
      !['raw','nonraw'].includes(d.format as string) || typeof d.strength !== 'number' || !Number.isFinite(d.strength) || d.strength < 0 || d.strength > 1) fail();
  for (const row of dense(d.coefficients, 3)) for (const number of dense(row, 11))
    if (typeof number !== 'number' || !Number.isFinite(number)) fail();
}
