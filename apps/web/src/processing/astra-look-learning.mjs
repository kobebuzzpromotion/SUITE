import {assertPixels, checkAbort} from './pure.mjs';

export const ASTRA_LOOK_VERSION = 'suite-paired-polynomial-look-1';
const SIZE = 11;
const clamp = value => Math.max(0, Math.min(1, value));
const finite = (v, low, high) => Number.isFinite(v) && v >= low && v <= high;
function frame(value, maximum = 8_000_000) {
  assertPixels(value);
  if (value.width * value.height > maximum || !(value.data.buffer instanceof ArrayBuffer))
    throw Error('LOOK_FRAME_CAPACITY_OR_SHARED');
}
function features(r, g, b, mean) {return [r, g, b, 1, r*r, g*g, b*b, r*g, r*b, g*b, mean];}
function meanLuma(pixels) {
  let total = 0, weight = 0;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const alpha = pixels.data[i + 3] / 255;
    total += (.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2]) * alpha / 255;
    weight += alpha;
  }
  if (!weight) throw Error('LOOK_FRAME_NO_VISIBLE_PIXELS');
  return total / weight;
}
function solve(matrix, rhs) {
  const rows = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < SIZE; col++) {
    let pivot = col;
    for (let r = col + 1; r < SIZE; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    if (Math.abs(rows[pivot][col]) < 1e-12) throw Error('LOOK_TRAINING_SINGULAR');
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col]; for (let k = col; k <= SIZE; k++) rows[col][k] /= divisor;
    for (let r = 0; r < SIZE; r++) if (r !== col) {
      const factor = rows[r][col]; for (let k = col; k <= SIZE; k++) rows[r][k] -= factor * rows[col][k];
    }
  }
  const result = rows.map(row => row[SIZE]);
  if (result.some(v => !Number.isFinite(v))) throw Error('LOOK_TRAINING_NONFINITE');
  return result;
}

/** Actual ridge-regression learning from aligned decoded before/after pairs.
 * Pair pixels must have identical upright geometry; no RAW decode, camera
 * profile reconstruction or proprietary Lightroom/Evoto interpretation occurs.
 * One global polynomial color mapping + scene mean feature is learned, not
 * local retouching or a general neural style model. Consent/binding are host duties.
 */
export function trainPersonalizedLook(pairs, {mode = 'personal', formats = ['nonraw'],
  regularization = .01, samplesPerPair = 512, signal, onProgress} = {}) {
  checkAbort(signal);
  if (!['personal', 'lite'].includes(mode) || !Array.isArray(pairs) || !pairs.length || pairs.length > 10000 ||
      !Array.isArray(formats) || !formats.length || formats.length > 2 || new Set(formats).size !== formats.length ||
      formats.some(f => !['raw','nonraw'].includes(f)) || !finite(regularization, .000001, 10) ||
      !Number.isSafeInteger(samplesPerPair) || samplesPerPair < 16 || samplesPerPair > 4096 ||
      pairs.length * samplesPerPair > 2_000_000 || (onProgress !== undefined && typeof onProgress !== 'function'))
    throw Error('LOOK_TRAINING_INPUT_INVALID');
  const groups = Object.fromEntries(formats.map(f => [f, []]));
  const ids = new Set();
  for (const pair of pairs) {
    if (!pair || typeof pair.id !== 'string' || !pair.id || ids.has(pair.id) || !groups[pair.format])
      throw Error('LOOK_PAIR_ID_OR_FORMAT_INVALID');
    ids.add(pair.id); frame(pair.before); frame(pair.after);
    if (pair.before.width !== pair.after.width || pair.before.height !== pair.after.height)
      throw Error('LOOK_PAIR_ALIGNMENT_REQUIRED');
    groups[pair.format].push(pair);
  }
  for (const group of Object.values(groups)) if (group.length < (mode === 'personal' ? 200 : 1))
    throw Error('LOOK_CORPUS_COUNT_REQUIRED');
  let completed = 0;
  const models = {};
  for (const [format, group] of Object.entries(groups)) {
    const gram = Array.from({length: SIZE}, () => new Float64Array(SIZE));
    const rhs = Array.from({length: 3}, () => new Float64Array(SIZE));
    let samples = 0, totalWeight = 0;
    for (const pair of group) {
      checkAbort(signal);
      const n = pair.before.width * pair.before.height, mean = meanLuma(pair.before);
      const count = Math.min(n, samplesPerPair);
      for (let k = 0; k < count; k++) {
        const p = Math.floor((k + .5) * n / count) * 4;
        const weight = Math.min(pair.before.data[p+3], pair.after.data[p+3]) / 255;
        if (!weight) continue;
        const x = features(pair.before.data[p]/255, pair.before.data[p+1]/255, pair.before.data[p+2]/255, mean);
        for (let i = 0; i < SIZE; i++) {
          for (let j = 0; j < SIZE; j++) gram[i][j] += weight*x[i]*x[j];
          for (let c = 0; c < 3; c++) rhs[c][i] += weight*x[i]*pair.after.data[p+c]/255;
        }
        samples++; totalWeight += weight;
      }
      completed++; onProgress?.({completed, total: pairs.length, format});
    }
    if (samples < SIZE * 2 || totalWeight <= 0) throw Error('LOOK_TRAINING_SAMPLES_INSUFFICIENT');
    // Ridge toward identity rather than toward black.
    const lambda = regularization * totalWeight;
    for (let i = 0; i < SIZE; i++) gram[i][i] += lambda;
    for (let c = 0; c < 3; c++) rhs[c][c] += lambda;
    models[format] = {coefficients: rhs.map(vector => solve(gram.map(row => [...row]), [...vector])),
      pairCount: group.length, sampleCount: samples};
  }
  checkAbort(signal);
  return {version: ASTRA_LOOK_VERSION, mode, domain: 'decoded-srgb8',
    regularization, models, state: 'ready', sourceIDs: [...ids], shareable: false};
}

/** Bounded, format-specific decoded-pixel streaming trainer. RAW decoding is a
 * host responsibility; the format label does not prove RAW provenance.
 * Only sufficient statistics and IDs survive
 * add(); decoded pair buffers are never retained. Same full-image mean, feature
 * basis, deterministic sampling and identity-ridge solution as batch training. */
export function createPersonalLookAccumulator({expectedPairs,mode,format='nonraw',regularization=.01,samplesPerPair=512}={}){
  if(!['raw','nonraw'].includes(format)||!Number.isInteger(expectedPairs)||expectedPairs<1||expectedPairs>200||!['lite','personal'].includes(mode)||
    mode==='personal'&&expectedPairs<200||!finite(regularization,.000001,10)||
    !Number.isInteger(samplesPerPair)||samplesPerPair<16||samplesPerPair>4096)throw Error('LOOK_TRAINING_INPUT_INVALID');
  const gram=Array.from({length:SIZE},()=>new Float64Array(SIZE)),rhs=Array.from({length:3},()=>new Float64Array(SIZE)),ids=new Set();
  let samples=0,totalWeight=0,closed=false;
  return Object.freeze({
    add(pair){
      if(closed)throw Error('LOOK_JOB_NOT_WAITING');
      try{
        if(ids.size>=expectedPairs||!pair||typeof pair.id!=='string'||!pair.id||pair.id.length>256||ids.has(pair.id)||pair.format!==format)throw Error('LOOK_PAIR_ID_OR_FORMAT_INVALID');
        frame(pair.before);frame(pair.after);
        if(pair.before.width!==pair.after.width||pair.before.height!==pair.after.height)throw Error('LOOK_PAIR_ALIGNMENT_REQUIRED');
        const n=pair.before.width*pair.before.height,mean=meanLuma(pair.before),count=Math.min(n,samplesPerPair);
        for(let k=0;k<count;k++){
          const p=Math.floor((k+.5)*n/count)*4,weight=Math.min(pair.before.data[p+3],pair.after.data[p+3])/255;if(!weight)continue;
          const x=features(pair.before.data[p]/255,pair.before.data[p+1]/255,pair.before.data[p+2]/255,mean);
          for(let i=0;i<SIZE;i++){
            for(let j=0;j<SIZE;j++)gram[i][j]+=weight*x[i]*x[j];
            for(let c=0;c<3;c++)rhs[c][i]+=weight*x[i]*pair.after.data[p+c]/255;
          }
          samples++;totalWeight+=weight;
        }
        ids.add(pair.id);return {completed:ids.size,total:expectedPairs};
      }catch(error){closed=true;throw error;}
    },
    finish(){
      if(closed)throw Error('LOOK_JOB_NOT_WAITING');closed=true;
      if(ids.size!==expectedPairs||mode==='personal'&&ids.size<200)throw Error('LOOK_CORPUS_COUNT_REQUIRED');
      if(samples<SIZE*2||totalWeight<=0)throw Error('LOOK_TRAINING_SAMPLES_INSUFFICIENT');
      const lambda=regularization*totalWeight;
      for(let i=0;i<SIZE;i++)gram[i][i]+=lambda;
      for(let c=0;c<3;c++)rhs[c][c]+=lambda;
      return {version:ASTRA_LOOK_VERSION,mode,domain:'decoded-srgb8',regularization,
        models:{[format]:{coefficients:rhs.map(vector=>solve(gram.map(row=>[...row]),[...vector])),pairCount:ids.size,sampleCount:samples}},
        state:'ready',sourceIDs:[...ids],shareable:false};
    }
  });
}

export function validatePersonalizedLook(look) {
  if (!look || look.version !== ASTRA_LOOK_VERSION || look.domain !== 'decoded-srgb8' ||
      !['ready','locked'].includes(look.state) || !look.models ||
      !Object.keys(look.models).length || Object.keys(look.models).some(key => !['raw','nonraw'].includes(key)))
    throw Error('LOOK_ARTIFACT_INVALID');
  for (const model of Object.values(look.models)) if (!Array.isArray(model.coefficients) || model.coefficients.length !== 3 ||
      model.coefficients.some(row => !Array.isArray(row) || row.length !== SIZE || row.some(v => !Number.isFinite(v))))
    throw Error('LOOK_COEFFICIENTS_INVALID');
  return look;
}

/** Correction offsets the learned baseline; fixed applies explicit matrix
 * instead of the learned baseline. Neither mode mutates the learned artifact. */
export function applyPersonalizedLook(pixels, look, {format, strength = 1,
  adjustment = 'correction', exposure = 0, saturation = 1, fixedMatrix, signal} = {}) {
  // Application keeps one full-frame mean for both Proxy and Final; do not
  // split into tiles with independent scene means. Training stays capped at 8MP.
  checkAbort(signal); frame(pixels, 24_000_000); validatePersonalizedLook(look);
  if (look.state !== 'ready') throw Error('LOOK_LOCKED');
  if (!look.models[format]) throw Error('LOOK_FORMAT_MISMATCH');
  if (!finite(strength, 0, 1) || !finite(exposure, -4, 4) || !finite(saturation, 0, 2) ||
      !['correction','fixed'].includes(adjustment)) throw Error('LOOK_APPLY_SETTINGS_INVALID');
  if (adjustment === 'fixed' && (!Array.isArray(fixedMatrix) || fixedMatrix.length !== 3 ||
      fixedMatrix.some(row => !Array.isArray(row) || row.length !== 4 || row.some(v => !finite(v, -16, 16)))))
    throw Error('LOOK_FIXED_MATRIX_REQUIRED');
  const out = {...pixels, data: new Uint8ClampedArray(pixels.data)}, mean = meanLuma(pixels);
  const coefficients = look.models[format].coefficients;
  for (let p = 0; p < pixels.data.length; p += 4) {
    if ((p & 65535) === 0) checkAbort(signal);
    if (!pixels.data[p+3]) continue;
    const x = features(pixels.data[p]/255, pixels.data[p+1]/255, pixels.data[p+2]/255, mean);
    const rgb = adjustment === 'fixed' ? fixedMatrix.map(row => row.reduce((sum, value, i) => sum+value*x[i], 0)) :
      coefficients.map(row => row.reduce((sum, value, i) => sum+value*x[i], 0));
    if (rgb.some(value => !Number.isFinite(value))) throw Error('LOOK_APPLY_NONFINITE');
    const y = .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    for (let c = 0; c < 3; c++) {
      const adjusted = (y+(rgb[c]-y)*saturation)*2**exposure;
      if (!Number.isFinite(adjusted)) throw Error('LOOK_APPLY_NONFINITE');
      const value = clamp(adjusted);
      out.data[p+c] = Math.round(pixels.data[p+c]*(1-strength)+255*value*strength);
    }
  }
  return out;
}

export function previewPersonalizedLook(images, look, options = {}) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 5) throw Error('LOOK_PREVIEW_LIMIT');
  return images.map(image => ({id: image.id, pixels: applyPersonalizedLook(image.pixels, look,
    {...options, format: image.format})}));
}
export function duplicatePersonalizedLook(look) {validatePersonalizedLook(look); return structuredClone(look);}

/** Local synchronous training lifecycle; cancellation is honest, allowed only
 * before training starts. No cloud upload/training service is implied. */
export function createPersonalizedLookJob(pairs, options = {}) {
  const dataset = structuredClone(pairs); let state = 'waiting', artifact = null, failure = null;
  return Object.freeze({
    status: () => ({state, failure}),
    cancel() {if (state !== 'waiting') throw Error('LOOK_JOB_CANCEL_NOT_ALLOWED'); state = 'cancelled';},
    run() {
      if (state !== 'waiting') throw Error('LOOK_JOB_NOT_WAITING'); state = 'training';
      try {artifact = trainPersonalizedLook(dataset, options); state = 'ready'; return structuredClone(artifact);}
      catch (error) {state = 'failed'; failure = error.message; throw error;}
    },
    artifact() {if (!artifact) throw Error('LOOK_JOB_NOT_READY'); return structuredClone(artifact);}
  });
}
