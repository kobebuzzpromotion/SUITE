import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {PERSON_MODEL_SHA256} from '../src/person-privacy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const dist = resolve(root, 'dist/web');
const photoPath = resolve(root, 'apps/web/assets/suite-editorial-hero-clean.png');
const modelPath = resolve(dist, 'runtime_assets/face_landmarker.task');
const workerPath = resolve(dist, 'processing-worker.js');
const wasmDir = resolve(dist, 'vendor/mediapipe');
const port = 61860;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixtureBundle() {
  const result = await build({entryPoints: [resolve(here, 'fixtures/face-model-photo-browser-fixture.mjs')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false,
    logLevel: 'silent'});
  assert.equal(result.outputFiles.length, 1);
  return result.outputFiles[0].contents;
}

const page = `<!doctype html><html lang="ja"><meta charset="utf-8">
<title>SUITE local photo face model probe</title>
<h1>Local photo / local FaceLandmarker / blocked person gate</h1>
<button id="run" type="button">ローカル検証を実行</button>
<pre id="verdict" aria-label="判定">NOT_RUN</pre>
<pre id="report" aria-label="詳細">NOT_RUN</pre>
<script type="module" src="/fixture.js"></script></html>`;

async function fixedAssets() {
  const [photo, model, worker, fixture] = await Promise.all([
    readFile(photoPath), readFile(modelPath), readFile(workerPath), fixtureBundle()]);
  assert.equal(sha256(model), PERSON_MODEL_SHA256, 'bundled model differs from privacy-approved SHA');
  assert.ok(photo.length > 0 && worker.length > 0 && fixture.length > 0);
  return {photo, model, worker, fixture, photoSHA256: sha256(photo)};
}

if (process.argv.includes('--serve')) {
  const assets = await fixedAssets();
  const mime = pathname => pathname.endsWith('.wasm') ? 'application/wasm' :
    pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' :
    pathname.endsWith('.task') ? 'application/octet-stream' :
    pathname.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8';
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname;
    let body;
    if (req.method !== 'GET') {
      res.writeHead(405, {'Content-Type': 'text/plain'});res.end('READ_ONLY');return;
    }
    if (path === '/') body = page;
    else if (path === '/fixture.js') body = assets.fixture;
    else if (path === '/processing-worker.js') body = assets.worker;
    else if (path === '/photo.png') body = assets.photo;
    else if (path === '/runtime_assets/face_landmarker.task') body = assets.model;
    else if (path.startsWith('/vendor/mediapipe/')) {
      const file = resolve(wasmDir, '.' + path.slice('/vendor/mediapipe'.length));
      if (!file.startsWith(wasmDir + sep) || !/\.(?:js|wasm)$/.test(file)) {
        res.writeHead(404);res.end();return;
      }
      try {body = await readFile(file);} catch {res.writeHead(404);res.end();return;}
    } else {res.writeHead(404);res.end();return;}
    res.writeHead(200, {'Content-Type': mime(path), 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:"});
    res.end(body);
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`SUITE_FACE_MODEL_PHOTO_BROWSER_PROBE http://127.0.0.1:${port}/ photoSHA256=${assets.photoSHA256}`));
} else {
  test('FACE-MODEL-PHOTO-BROWSER-BUNDLE: only local immutable photo/model are served to real Worker fixture', async () => {
    const {photo, model, worker, fixture, photoSHA256} = await fixedAssets();
    assert.equal(sha256(photo), photoSHA256);
    assert.equal(sha256(model), PERSON_MODEL_SHA256);
    assert.match(new TextDecoder().decode(worker), /FACE_MODEL_SHA_MISMATCH/);
    assert.match(new TextDecoder().decode(fixture), /FACE_MODEL_PHOTO_BROWSER_PASS/);
    assert.match(new TextDecoder().decode(fixture), /PERSON_PRIVACY_REVIEW_REQUIRED/);
    assert.ok((await stat(photoPath)).isFile());
  });
}
