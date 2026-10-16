/** Bounded Adobe-style standalone and Resolve-style 1D/3D CUBE reader.
 * Resolve combined tables store 1D rows first, then red-fastest 3D rows.
 * DOMAIN and INPUT_RANGE dialects cannot be mixed; combined DOMAIN is rejected
 * rather than guessing which stage it modifies. No input color space is inferred.
 * Reference: OpenColorIO FileFormatResolveCube.cpp (Blackmagic format description).
 * Existing standalone 3D result shape is preserved. */
export function parseCubeLUT(text) {
  if (typeof text !== 'string' || !text.length || text.length > 32 * 1024 * 1024 || text.includes('\0'))
    throw Error('CUBE_TEXT_INVALID');
  let size1D, size3D, range1D, range3D, title = null, domainMin = [0, 0, 0], domainMax = [1, 1, 1], data, offset = 0;
  const seen = new Set();
  const number = value => {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw Error('CUBE_NUMBER_INVALID');
    const result = Number(value);
    if (!Number.isFinite(result) || !Number.isFinite(Math.fround(result))) throw Error('CUBE_NUMBER_INVALID');
    return result;
  };
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    let quoted = false, cut = raw.length;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '"') quoted = !quoted;
      if (raw[i] === '#' && !quoted) { cut = i; break; }
    }
    const line = raw.slice(0, cut).trim();
    if (!line) continue;
    const words = line.split(/\s+/), key = words[0];
    if (/^[A-Za-z_]/.test(key)) {
      if (offset || seen.has(key)) throw Error('CUBE_HEADER_ORDER_OR_DUPLICATE');
      seen.add(key);
      if (key === 'TITLE') {
        const match = /^TITLE\s+"([^"\r\n]{0,512})"$/.exec(line);
        if (!match) throw Error('CUBE_TITLE_INVALID');
        title = match[1];
      } else if (key === 'LUT_3D_SIZE' || key === 'LUT_1D_SIZE') {
        if (words.length !== 2 || !/^\d+$/.test(words[1])) throw Error('CUBE_SIZE_INVALID');
        const size = Number(words[1]);
        if (!Number.isSafeInteger(size) || size < 2 || size > (key === 'LUT_1D_SIZE' ? 65536 : 65)) throw Error('CUBE_SIZE_INVALID');
        if (key === 'LUT_1D_SIZE') size1D = size; else size3D = size;
      } else if (key === 'LUT_1D_INPUT_RANGE' || key === 'LUT_3D_INPUT_RANGE') {
        if (words.length !== 3) throw Error('CUBE_RANGE_INVALID');
        const range = words.slice(1).map(number);
        if (!(range[0] < range[1]) || !Number.isFinite(range[1] - range[0])) throw Error('CUBE_RANGE_INVALID');
        if (key === 'LUT_1D_INPUT_RANGE') range1D = range; else range3D = range;
      } else if (key === 'DOMAIN_MIN' || key === 'DOMAIN_MAX') {
        if (words.length !== 4) throw Error('CUBE_DOMAIN_INVALID');
        const values = words.slice(1).map(number);
        if (key === 'DOMAIN_MIN') domainMin = values; else domainMax = values;
      } else throw Error('CUBE_HEADER_UNSUPPORTED');
    } else {
      if (!data) {
        const count = (size1D || 0) + (size3D ? size3D ** 3 : 0);
        if (!count) throw Error('CUBE_ENTRY_COUNT_INVALID');
        data = new Float32Array(count * 3);
      }
      if (words.length !== 3 || offset + 3 > data.length) throw Error('CUBE_ENTRY_COUNT_INVALID');
      for (const word of words) data[offset++] = number(word);
    }
  }
  if (!data || offset !== data.length) throw Error('CUBE_ENTRY_COUNT_INVALID');
  if (domainMin.some((v, i) => !(v < domainMax[i]) || !Number.isFinite(domainMax[i] - v)))
    throw Error('CUBE_DOMAIN_INVALID');
  const hasDomain = seen.has('DOMAIN_MIN') || seen.has('DOMAIN_MAX');
  if (range1D && !size1D || range3D && !size3D) throw Error('CUBE_RANGE_WITHOUT_STAGE');
  if (hasDomain && (range1D || range3D || size1D && size3D)) throw Error('CUBE_AMBIGUOUS_DOMAIN_DIALECT');
  const stage = (kind, size, range, values) => ({kind, size, title,
    domainMin: range ? [range[0], range[0], range[0]] : [...domainMin],
    domainMax: range ? [range[1], range[1], range[1]] : [...domainMax], data: values});
  if (size1D && size3D) return {kind: '1D+3D', title,
    shaper: stage('1D', size1D, range1D, data.slice(0, size1D * 3)),
    lut3D: stage('3D', size3D, range3D, data.slice(size1D * 3))};
  return size1D ? stage('1D', size1D, range1D, data) : stage('3D', size3D, range3D, data);
}
