import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {PERSON_MODEL_SHA256} from '../src/person-privacy.mjs';
import {faceTilePlan, mergeTiledDetections} from '../src/processing/faces.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const dist = resolve(root, 'dist/web');
const photoPath = resolve(root, 'apps/web/assets/suite-editorial-hero-clean.png');
const modelPath = resolve(dist, 'runtime_assets/face_landmarker.task');
const wasmDir = resolve(dist, 'vendor/mediapipe');
const port = 61861;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixtureBundle() {
  const out = await build({entryPoints: [resolve(here, 'fixtures/face-tile-recovery-fixture.mjs')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false,
    logLevel: 'silent'});
  assert.equal(out.outputFiles.length, 1);
  return out.outputFiles[0].contents;
}
async function assets() {
  const [photo, model, worker, fixture] = await Promise.all([readFile(photoPath),
    readFile(modelPath), readFile(resolve(dist, 'processing-worker.js')), fixtureBundle()]);
  assert.equal(digest(model), PERSON_MODEL_SHA256);
  return {photo, model, worker, fixture};
}
if (process.argv.includes('--serve')) {
  const a = await assets();
  const html = `<!doctype html><html><meta charset="utf-8"><title>Face tile recovery</title>
  <h1>Local photo / bounded tile diagnostic</h1><button id="run">Run</button>
  <pre id="verdict" aria-label="verdict">NOT_RUN</pre>
  <pre id="report" aria-label="report">NOT_RUN</pre>
  <script type="module" src="/fixture.js"></script></html>`;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname;
    if (req.method !== 'GET') {res.writeHead(405);res.end('READ_ONLY');return;}
    let body, type = 'text/html; charset=utf-8';
    if (path === '/') body = html;
    else if (path === '/fixture.js') {body = a.fixture;type = 'text/javascript; charset=utf-8';}
    else if (path === '/processing-worker.js') {body = a.worker;type = 'text/javascript; charset=utf-8';}
    else if (path === '/photo.png') {body = a.photo;type = 'image/png';}
    else if (path === '/runtime_assets/face_landmarker.task') {body = a.model;type = 'application/octet-stream';}
    else if (path.startsWith('/vendor/mediapipe/')) {
      const file = resolve(wasmDir, '.' + path.slice('/vendor/mediapipe'.length));
      if (!file.startsWith(wasmDir + sep) || !/\.(?:js|wasm)$/.test(file)) {
        res.writeHead(404);res.end();return;
      }
      try {body = await readFile(file);type = file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';}
      catch {res.writeHead(404);res.end();return;}
    } else {res.writeHead(404);res.end();return;}
    res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:"});
    res.end(body);
  });
  server.listen(port, '127.0.0.1', () => console.log(`FACE_TILE_DIAGNOSTIC http://127.0.0.1:${port}/`));
} else test('FACE-TILE-01: local model SHA and real Worker fixture bundle', async () => {
  const a = await assets();
  assert.equal(digest(a.model), PERSON_MODEL_SHA256);
  assert.match(new TextDecoder().decode(a.fixture), /FACE_TILE_RECOVERY_PARTIAL_PASS/);
});

if (!process.argv.includes('--serve')) {
  test('FACE-TILE-02: deterministic bounded overlapping tiles remain inside the source', () => {
    assert.deepEqual(faceTilePlan(128, 128), []);
    const tiles = faceTilePlan(1672, 941);
    assert.equal(tiles.length, 8);
    assert.equal(new Set(tiles.map(t => `${t.x},${t.y}`)).size, 8);
    assert.ok(tiles.every(t => t.x >= 0 && t.y >= 0 && t.width > 0 && t.height > 0 &&
      t.x + t.width <= 1672 && t.y + t.height <= 941));
    assert.ok(tiles[0].x === 0 && tiles[0].y === 0 && tiles.at(-1).x + tiles.at(-1).width === 1672);
  });
  const detection = (x, top, width = .1, height = .1) => ({
    anchor: {x, y: 1 - top - height, width, height},
    mask: [{x, y: top}, {x: x + width, y: top},
      {x: x + width, y: top + height}, {x, y: top + height}], complete: true});
  test('FACE-TILE-03: same face is merged once; separate face remains; ambiguous overlap fails closed', () => {
    const first = detection(.1, .2), same = detection(.103, .203), other = detection(.5, .2);
    const merged = mergeTiledDetections([{detection: first, clearance: .05},
      {detection: same, clearance: .1}, {detection: other, clearance: .07}]);
    assert.equal(merged.length, 2);
    assert.deepEqual(merged[0], same);
    assert.deepEqual(merged[1], other);
    assert.throws(() => mergeTiledDetections([{detection: first, clearance: .05},
      {detection: detection(.15, .2), clearance: .1}]), /AMBIGUOUS_TILE_FACE_OVERLAP/);
  });
}
