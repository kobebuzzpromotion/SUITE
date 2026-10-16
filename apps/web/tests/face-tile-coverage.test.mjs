import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {PERSON_MODEL_SHA256} from '../src/person-privacy.mjs';
import {faceCoveragePasses, projectCoveragePoint, projectCoverageDetection,
  probeFaceCoverage, reconcileFaceCoverage} from '../src/processing/face-tile-coverage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const dist = resolve(root, 'dist/web');
const port = 61862;
const photoPath = resolve(root, 'apps/web/assets/suite-editorial-hero-clean.png');
const modelPath = resolve(dist, 'runtime_assets/face_landmarker.task');
const wasmDir = resolve(dist, 'vendor/mediapipe');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const face = (x, top, w = .1, h = .1) => ({anchor: {x, y: 1 - top - h, width: w, height: h},
  mask: [{x, y: top}, {x: x + w, y: top}, {x: x + w, y: top + h}, {x, y: top + h}], complete: true});

test('FACE-COVERAGE01: 8 source tiles and 4 distinct bounded analysis transforms', () => {
  assert.deepEqual(faceCoveragePasses(128, 128), []);
  const passes = faceCoveragePasses(1672, 941);
  assert.equal(passes.length, 32);
  assert.equal(new Set(passes.map(p => `${p.tile.x},${p.tile.y},${p.transform}`)).size, 32);
  assert.ok(passes.every(p => p.tile.x >= 0 && p.tile.y >= 0 &&
    p.tile.x + p.tile.width <= 1672 && p.tile.y + p.tile.height <= 941));
  assert.throws(() => faceCoveragePasses(1672, 941, ['normal', 'normal']), /INVALID_FACE_COVERAGE_PASS/);
  assert.throws(() => faceCoveragePasses(1_000_000, 1_000_000), /INVALID_FACE_COVERAGE_PASS/);
});

test('FACE-COVERAGE02: mirror and both rotations invert into upright original coordinates', () => {
  const tile = {x: 100, y: 200, width: 300, height: 400};
  const point = {x: .2, y: .3};
  const map = transform => projectCoveragePoint(point, {tile, transform}, 1000, 1000);
  assert.deepEqual(map('normal'), {x: .16, y: .32});
  assert.deepEqual(map('mirror'), {x: .34, y: .32});
  assert.deepEqual(map('cw90'), {x: .19, y: .52});
  assert.deepEqual(map('ccw90'), {x: .31, y: .28});
  assert.throws(() => projectCoveragePoint({x: 1, y: .5}, {tile, transform: 'mirror'}, 1000, 1000), /INVALID_FACE_COVERAGE_PASS/);
});

test('FACE-COVERAGE03: polygon and lower-left anchor project together, then strict overlap and ID-free candidate handling', () => {
  const tile = {x: 100, y: 100, width: 400, height: 400};
  const projected = projectCoverageDetection(face(.2, .2, .1, .1), {tile, transform: 'mirror'}, 1000, 1000);
  assert.ok(Math.abs(projected.anchor.x - .38) < 1e-9);
  assert.ok(Math.abs(projected.anchor.y - .78) < 1e-9);
  const baseline = face(.1, .2);
  const fresh = face(.7, .2);
  const result = reconcileFaceCoverage([baseline], [{detection: face(.102, .202)}, {detection: fresh, pass: {transform: 'mirror'}}]);
  assert.equal(result.detections.length, 2);
  assert.strictEqual(result.detections[0], baseline);
  assert.equal(result.added[0].status, 'MODEL_CANDIDATE_MANUAL_REVIEW_REQUIRED');
  assert.equal(Object.hasOwn(result.added[0], 'id'), false);
  assert.throws(() => reconcileFaceCoverage([baseline], [{detection: face(.15, .2)}]), /AMBIGUOUS_FACE_COVERAGE_OVERLAP/);
  assert.throws(() => reconcileFaceCoverage([baseline], [{detection: face(.103, .203, .2, .1)}]), /AMBIGUOUS_FACE_COVERAGE_OVERLAP/);
});

test('FACE-COVERAGE04: a detector run uses only analysis canvas, rejects bad model or cancellation', () => {
  const original = globalThis.OffscreenCanvas;
  const operations = [];
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {this.width = width;this.height = height;}
    getContext() {return {translate: (...args) => operations.push(['translate', ...args]),
      scale: (...args) => operations.push(['scale', ...args]),
      rotate: (...args) => operations.push(['rotate', ...args]),
      drawImage: (...args) => operations.push(['drawImage', ...args])};}
  };
  try {
    const source = Object.freeze({width: 1000, height: 1000});
    const pass = {tile: {x: 100, y: 200, width: 400, height: 400}, transform: 'mirror'};
    const points = Array.from({length: 468}, () => ({x: .5, y: .5, z: 0}));
    points[0] = {x: .2, y: .2, z: 0};points[1] = {x: .3, y: .2, z: 0};
    points[2] = {x: .3, y: .3, z: 0};points[3] = {x: .2, y: .3, z: 0};
    const out = probeFaceCoverage({detect: () => ({faceLandmarks: [points]})}, source, [pass], [0, 1, 2, 3]);
    assert.equal(out.candidates.length, 1);
    assert.ok(operations.some(op => op[0] === 'scale' && op[1] === -1));
    assert.equal(operations.filter(op => op[0] === 'drawImage').length, 1);
    assert.deepEqual(source, {width: 1000, height: 1000});
    assert.throws(() => probeFaceCoverage({detect: () => ({faceLandmarks: null})}, source, [pass], [0, 1, 2]), /FACE_COVERAGE_MODEL_RESULT_INVALID/);
    const abort = new AbortController();abort.abort();
    assert.throws(() => probeFaceCoverage({detect: () => ({faceLandmarks: []})}, source, [pass], [0, 1, 2], {signal: abort.signal}),
      error => error.name === 'AbortError');
  } finally { globalThis.OffscreenCanvas = original; }
});

async function browserBundle() {
  const contents = `
import {FaceLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
import {createProcessing} from './apps/web/src/processing/index.mjs';
import {faceCoveragePasses,probeFaceCoverage,reconcileFaceCoverage} from './apps/web/src/processing/face-tile-coverage.mjs';
import {PERSON_MODEL_SHA256} from './apps/web/src/person-privacy.mjs';
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
function ovalIndices(){const edges=FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,graph=new Map();for(const {start,end} of edges){graph.set(start,[...(graph.get(start)||[]),end]);graph.set(end,[...(graph.get(end)||[]),start]);}const first=Math.min(...graph.keys()),out=[first];let prev=-1,current=first;do{const next=graph.get(current).find(v=>v!==prev);if(next===first)break;out.push(next);prev=current;current=next;}while(out.length<=graph.size);return out;}
async function run(){
 const photo=await(await fetch('/photo.png',{cache:'no-store'})).arrayBuffer();const photoSHA256=await hash(photo);
 const bitmap=await createImageBitmap(new Blob([photo],{type:'image/png'}));
 const source=new OffscreenCanvas(bitmap.width,bitmap.height),context=source.getContext('2d',{colorSpace:'srgb'});
 context.drawImage(bitmap,0,0);bitmap.close();const data=context.getImageData(0,0,source.width,source.height).data;
 const pixelsBefore=await hash(data);
 const processing=createProcessing({workerURL:'/processing-worker.js'});
 let baseline;try{baseline=await processing.detectPeople({width:source.width,height:source.height,data:new Uint8ClampedArray(data)});}finally{processing.dispose();}
 const bytes=await(await fetch('/runtime_assets/face_landmarker.task',{cache:'no-store'})).arrayBuffer();
 if(await hash(bytes)!==PERSON_MODEL_SHA256)throw Error('MODEL_SHA_MISMATCH');
 const files=await FilesetResolver.forVisionTasks('/vendor/mediapipe/');
 const detector=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:new Uint8Array(bytes),delegate:'CPU'},runningMode:'IMAGE',numFaces:8,minFaceDetectionConfidence:.7,minFacePresenceConfidence:.7,minTrackingConfidence:.7,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
 const reports=[];
 for(const transform of ['normal','mirror','cw90','ccw90']){
  const passes=[...faceCoveragePasses(source.width,source.height,[transform]),
   {tile:{x:0,y:0,width:source.width,height:source.height},transform}];
  const {candidates,rejected}=probeFaceCoverage(detector,source,passes,ovalIndices());
  let accepted,mergeError;
  try{const merged=reconcileFaceCoverage(baseline,candidates);accepted=merged.added.map(item=>item.detection.anchor);}
  catch(error){mergeError=error.message;}
  reports.push({transform,candidateCount:candidates.length,candidates:candidates.map(c=>c.detection.anchor),accepted,mergeError,rejected});
 }
 detector.close();
 if(await hash(photo)!==photoSHA256||await hash(data)!==pixelsBefore)throw Error('SOURCE_MUTATED');
 const result={result:'FACE_COVERAGE_MODEL_DIAGNOSTIC_ONLY',photoSHA256,modelSHA256:PERSON_MODEL_SHA256,
  baseline:baseline.map(d=>d.anchor),reports,personIdentity:'NOT_VERIFIED',saved:false,externalSent:false};
 document.getElementById('report').textContent=JSON.stringify(result);
 document.getElementById('verdict').textContent=result.result;
}
document.getElementById('run').addEventListener('click',()=>{document.getElementById('verdict').textContent='RUNNING';
 void run().catch(e=>{document.getElementById('verdict').textContent='FACE_COVERAGE_MODEL_DIAGNOSTIC_FAIL';document.getElementById('report').textContent=JSON.stringify({error:e.message});});});`;
  const result = await build({stdin: {contents, resolveDir: root, sourcefile: 'face-coverage-browser-entry.mjs'},
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent'});
  return result.outputFiles[0].contents;
}

if (process.argv.includes('--serve')) {
  const [photo, model, worker, fixture] = await Promise.all([readFile(photoPath), readFile(modelPath),
    readFile(resolve(dist, 'processing-worker.js')), browserBundle()]);
  assert.equal(digest(model), PERSON_MODEL_SHA256);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    if (req.method !== 'GET') {res.writeHead(405);res.end('READ_ONLY');return;}
    let body, type = 'text/html; charset=utf-8';
    if (path === '/') body = '<!doctype html><meta charset="utf-8"><title>Face coverage diagnostic</title><button id="run">Run</button><pre id="verdict">NOT_RUN</pre><pre id="report">NOT_RUN</pre><script type="module" src="/fixture.js"></script>';
    else if (path === '/fixture.js') {body = fixture;type = 'text/javascript; charset=utf-8';}
    else if (path === '/processing-worker.js') {body = worker;type = 'text/javascript; charset=utf-8';}
    else if (path === '/photo.png') {body = photo;type = 'image/png';}
    else if (path === '/runtime_assets/face_landmarker.task') {body = model;type = 'application/octet-stream';}
    else if (path.startsWith('/vendor/mediapipe/')) {
      const file = resolve(wasmDir, '.' + path.slice('/vendor/mediapipe'.length));
      if (!file.startsWith(wasmDir + sep) || !/\.(?:js|wasm)$/.test(file)) {res.writeHead(404);res.end();return;}
      try {body = await readFile(file);type = file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';}
      catch {res.writeHead(404);res.end();return;}
    } else {res.writeHead(404);res.end();return;}
    res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:"});
    res.end(body);
  });
  server.listen(port, '127.0.0.1', () => console.log(`FACE_COVERAGE_DIAGNOSTIC http://127.0.0.1:${port}/`));
} else {
  test('FACE-COVERAGE05: only bundled SHA-verified model/photo and read-only browser diagnostic are served', async () => {
    const [photo, model, fixture] = await Promise.all([readFile(photoPath), readFile(modelPath), browserBundle()]);
    assert.ok(photo.length > 0 && fixture.length > 0);
    assert.equal(digest(model), PERSON_MODEL_SHA256);
    assert.match(new TextDecoder().decode(fixture), /FACE_COVERAGE_MODEL_DIAGNOSTIC_ONLY/);
  });
}
