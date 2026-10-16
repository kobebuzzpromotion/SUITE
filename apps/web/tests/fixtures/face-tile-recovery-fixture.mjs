import {createProcessing} from '../../src/processing/index.mjs';
import {PERSON_MODEL_SHA256} from '../../src/person-privacy.mjs';

const verdict = document.querySelector('#verdict');
const report = document.querySelector('#report');
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(v => v.toString(16).padStart(2, '0')).join('');

async function run() {
  const response = await fetch('/photo.png', {cache: 'no-store'});
  if (!response.ok) throw Error('LOCAL_PHOTO_UNAVAILABLE');
  const original = await response.arrayBuffer();
  const originalSHA256 = await hash(original);
  const image = await createImageBitmap(new Blob([original], {type: 'image/png'}));
  const source = document.createElement('canvas');
  source.width = image.width;source.height = image.height;
  const sourceContext = source.getContext('2d', {willReadFrequently: true});
  sourceContext.drawImage(image, 0, 0);image.close();
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  const sourcePixelSHA256 = await hash(sourcePixels);
  const processing = createProcessing({workerURL: '/processing-worker.js'});
  let detections;
  try {
    detections = await processing.detectPeople({width: source.width, height: source.height,
      data: new Uint8ClampedArray(sourcePixels)});
  } finally {processing.dispose();}
  if (!detections.length || !detections.every(d =>
    d.provenance?.modelSHA256 === PERSON_MODEL_SHA256 && d.provenance?.tileFallback === true &&
    d.provenance?.tileCount === 8 &&
    d.provenance?.completeness === 'detected-local-faces-only-not-exhaustive'))
    throw Error('LOCAL_TILE_RECOVERY_PROVENANCE_INVALID');
  if (await hash(original) !== originalSHA256 || await hash(sourcePixels) !== sourcePixelSHA256)
    throw Error('READ_ONLY_SOURCE_MUTATED');
  const result = {result: 'FACE_TILE_RECOVERY_PARTIAL_PASS', scope: 'LOCAL_CHROME_WORKER_READ_ONLY',
    originalSHA256, sourcePixelSHA256, detectedCount: detections.length,
    modelSHA256: detections[0].provenance.modelSHA256,
    tileCount: detections[0].provenance.tileCount,
    tileRejectedReasons: detections[0].provenance.tileRejectedReasons,
    inventory: 'DETECTED_FACE_OVALS_ONLY_NOT_ALL_VISIBLE_PEOPLE',
    rightProfile: 'NOT_DETECTED', personRetouch: 'NOT_RUN',
    saved: false, externalSent: false};
  report.textContent = JSON.stringify(result);verdict.textContent = result.result;
}
document.querySelector('#run').addEventListener('click', () => {
  verdict.textContent = 'RUNNING';
  void run().catch(error => {verdict.textContent = 'FACE_TILE_RECOVERY_FAIL';
    report.textContent = JSON.stringify({error: `${error.name}: ${error.message}`});});
});
