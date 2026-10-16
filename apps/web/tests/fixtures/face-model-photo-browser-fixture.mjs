import {createProcessing} from '../../src/processing/index.mjs';
import {EditorSession, neutralRecipe} from '../../src/session.mjs';
import {PERSON_MODEL_SHA256, PERSON_PRIVACY_BLOCKED,
  personProcessingStatus} from '../../src/person-privacy.mjs';

const verdict = document.querySelector('#verdict');
const report = document.querySelector('#report');
const expect = (value, message) => {if (!value) throw Error(message);};
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
const refusal = async (operation, message) => {
  try {await operation();} catch (error) {
    expect(error.message === message, `UNEXPECTED_GATE_ERROR: ${error.message}`);
    return error.message;
  }
  throw Error(`EXPECTED_REFUSAL_MISSING: ${message}`);
};

async function run() {
  const [modelResponse, photoResponse] = await Promise.all([
    fetch('/runtime_assets/face_landmarker.task', {cache: 'no-store'}),
    fetch('/photo.png', {cache: 'no-store'})]);
  expect(modelResponse.ok && photoResponse.ok, 'LOCAL_ASSET_FETCH_FAILED');
  const modelBytes = await modelResponse.arrayBuffer();
  const modelSHA256 = await hash(modelBytes);
  expect(modelSHA256 === PERSON_MODEL_SHA256, 'LOCAL_MODEL_SHA_MISMATCH');
  const photoBytes = await photoResponse.arrayBuffer();
  const photoSHA256 = await hash(photoBytes);
  const bitmap = await createImageBitmap(new Blob([photoBytes], {type: 'image/png'}));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;canvas.height = bitmap.height;
  const context = canvas.getContext('2d', {willReadFrequently: true, colorSpace: 'srgb'});
  expect(context, 'LOCAL_CANVAS_UNAVAILABLE');
  context.drawImage(bitmap, 0, 0);bitmap.close();
  const pixels = {width: canvas.width, height: canvas.height,
    data: new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data)};
  const pixelSHA256 = await hash(pixels.data);
  // This checks the real session gate without importing, persisting, or modifying the photo.
  const worker = createProcessing({workerURL: '/processing-worker.js'});
  let inferenceCalls = 0, writes = 0, apiCalls = 0;
  const processing = {...worker, detectPeople: async (...args) => {
    inferenceCalls++;return worker.detectPeople(...args);
  }};
  const session = new EditorSession({processing,
    api: new Proxy({}, {get: () => () => {apiCalls++;throw Error('UNEXPECTED_API_CALL');}}),
    storage: {get: async () => undefined, put: async () => {writes++;throw Error('UNEXPECTED_PHOTO_SAVE');}}});
  expect(personProcessingStatus() === PERSON_PRIVACY_BLOCKED &&
    session.state.personProcessingStatus === PERSON_PRIVACY_BLOCKED,
  'UNAPPROVED_PERSON_GATE_NOT_BLOCKED');
  session.proxy = pixels;
  session.data.asset = {id: '11111111-1111-4111-8111-111111111111',
    sha256: photoSHA256, name: 'read-only-repo-photo.png'};
  session.data.recipe = neutralRecipe();
  const originalRecipe = JSON.stringify(session.state.recipe);
  const detectGate = await refusal(() => session.detectPeople(), 'PERSON_PRIVACY_REVIEW_REQUIRED');
  const adjustmentGate = await refusal(() => session.setAdjustment('faceBrightness', 1),
    'PERSON_PRIVACY_REVIEW_REQUIRED');
  expect(inferenceCalls === 0 && writes === 0 && apiCalls === 0,
    'UNAPPROVED_PERSON_GATE_CAUSED_PROCESSING_OR_STORAGE');
  expect(JSON.stringify(session.state.recipe) === originalRecipe && !session.state.dirty &&
    session.state.selectedPersonID === null && session.state.people.length === 0,
  'UNAPPROVED_PERSON_GATE_MUTATED_RECIPE');
  let detectedCount = 0, detectionError = null, modelProvenance = null;
  try {
    const found = await processing.detectPeople(pixels);
    detectedCount = found.length;
    modelProvenance = found[0]?.provenance?.modelSHA256 ?? null;
    expect(detectedCount > 0, 'FACE_INVENTORY_EMPTY');
    expect(found.every(item => item.provenance?.modelSHA256 === PERSON_MODEL_SHA256),
      'WORKER_MODEL_PROVENANCE_SHA_MISMATCH');
  } catch (error) {detectionError = `${error.name}: ${error.message}`;}
  // Read-only analysis windows distinguish small/full-frame faces from a
  // broken model. getImageData returns new memory; the source file is untouched.
  const analysisWindows = [];
  if (detectionError) for (const [label, fractions] of [
    ['left', [.02, 0, .29, .55]],
    ['center', [.18, .18, .57, .75]],
    ['right', [.70, 0, 1, .56]]]) {
    const [x0, y0, x1, y1] = fractions;
    const x = Math.floor(x0 * pixels.width), y = Math.floor(y0 * pixels.height);
    const width = Math.floor(x1 * pixels.width) - x;
    const height = Math.floor(y1 * pixels.height) - y;
    const region = context.getImageData(x, y, width, height);
    try {
      const found = await processing.detectPeople({width, height,
        data: new Uint8ClampedArray(region.data)});
      analysisWindows.push({label, detectedCount: found.length,
        modelSHA256: found[0]?.provenance?.modelSHA256 ?? null});
    } catch (error) {analysisWindows.push({label, detectedCount: 0,
      error: `${error.name}: ${error.message}`});}
  }
  expect(await hash(photoBytes) === photoSHA256 && await hash(pixels.data) === pixelSHA256,
    'READ_ONLY_PHOTO_BYTES_CHANGED');
  expect(writes === 0 && apiCalls === 0, 'PHOTO_OR_RECIPE_WAS_SAVED');
  worker.dispose();
  const result = {scope: 'LOCAL_REPO_PHOTO_REAL_CHROME_WORKER_NON_RAW',
    result: detectedCount > 0 && !detectionError ? 'FACE_MODEL_PHOTO_BROWSER_PASS' :
      'FACE_MODEL_PHOTO_BROWSER_DETECTION_FAIL',
    photoSHA256, dimensions: {width: pixels.width, height: pixels.height},
    pixelSHA256, modelSHA256, modelProvenance, detectedCount, detectionError,
    analysisWindows,
    gate: {status: 'BLOCKED_WITHOUT_OWNER_APPROVAL', detectGate, adjustmentGate,
      inferenceCallsBeforeExplicitProbe: 0, storageWrites: writes, apiCalls},
    localOnly: true, photoChanged: false, photoSaved: false,
    realRAW: 'NOT_RUN', fullPersonRetouch: 'NOT_RUN', identityRecognition: 'NOT_RUN'};
  report.textContent = JSON.stringify(result);
  verdict.textContent = result.result;
}

document.querySelector('#run').addEventListener('click', () => {
  verdict.textContent = 'RUNNING';
  void run().catch(error => {
    verdict.textContent = 'FACE_MODEL_PHOTO_BROWSER_SETUP_FAIL';
    report.textContent = JSON.stringify({error: `${error.name}: ${error.message}`,
      realRAW: 'NOT_RUN', fullPersonRetouch: 'NOT_RUN'});
  });
});
