import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here = dirname(fileURLToPath(import.meta.url)), port = 61899;
const fixture = resolve(here, 'fixtures/export-output-adjustment-session-browser-fixture.mjs');
const worker = resolve(here, '../src/processing/worker.mjs');
const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE Output Session Browser Probe</title>
<h1>Output sharpening EditorSession / real Worker</h1><button id="run" type="button">Run session check</button>
<pre id="verdict" aria-label="Output Session result">NOT_RUN</pre><script type="module" src="/fixture.js"></script></html>`;
async function bundle(entry, format) {
  const result = await build({entryPoints: [entry], bundle: true, format, platform: 'browser', target: 'es2022',
    external: ['module'], write: false, logLevel: 'silent'});
  assert.equal(result.outputFiles.length, 1);
  return result.outputFiles[0].contents;
}

if (process.argv.includes('--serve')) {
  const fixtureBytes = await bundle(fixture, 'esm'), workerBytes = await bundle(worker, 'iife');
  const routes = new Map([['/fixture.js', {bytes: fixtureBytes, type: 'text/javascript; charset=utf-8'}],
    ['/processing-worker.js', {bytes: workerBytes, type: 'text/javascript; charset=utf-8'}],
    ['/', {bytes: page, type: 'text/html; charset=utf-8'}]]);
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); res.end(); return; }
    const route = routes.get(new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname);
    if (!route) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type': route.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self' blob: data:; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:"});
    res.end(route.bytes);
  });
  server.listen(port, '127.0.0.1', () => console.log(`SUITE_OUTPUT_SESSION_BROWSER_PROBE http://127.0.0.1:${port}/`));
} else {
  test('OUTPUT-SESSION-BROWSER-FIXTURE: saved synthetic non-RAW Session and actual Worker bundle', async () => {
    const fixtureBytes = await bundle(fixture, 'esm'), workerBytes = await bundle(worker, 'iife');
    const fixtureText = new TextDecoder().decode(fixtureBytes), workerText = new TextDecoder().decode(workerBytes);
    assert.ok(fixtureBytes.length > 100_000 && workerBytes.length > 100_000);
    assert.match(fixtureText, /synthetic saved non-RAW EditorSession -> real Worker Final resize -> manual output sharpen -> TIFF\/PNG Blob/);
    assert.match(workerText, /OUTPUT_SHARPENING_PRESET_UNSUPPORTED/);
  });
}
