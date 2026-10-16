import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const entry = resolve(here, 'fixtures/point-curves-editor-browser-fixture.mjs');
const port = 61849;
const clock = () => Date.parse('2026-10-03T08:00:00.000Z');

async function bundle() {
  const result = await build({entryPoints: [entry], bundle: true, format: 'esm',
    platform: 'browser', target: 'es2022', write: false, logLevel: 'silent'});
  assert.equal(result.outputFiles.length, 1);
  return result.outputFiles[0].contents;
}

const page = `<!doctype html><html lang="ja"><meta charset="utf-8">
<title>SUITE Point Curves Editor Browser Probe</title>
<link rel="stylesheet" href="/editorial-editor.css">
<h1>SUITE Point Curves · authenticated synthetic NON-RAW</h1>
<button id="probe-run" type="button">Graph / Worker / Save を検証</button>
<pre id="probe-verdict" aria-label="検証判定">NOT_RUN</pre>
<pre id="probe-report" aria-label="検証結果">STARTING</pre>
<pre id="native-events" aria-label="ネイティブ操作イベント">NOT_READY</pre>
<pre id="native-verdict" aria-label="ネイティブダブルクリック判定">NOT_RUN</pre>
<main id="app"></main><script type="module" src="/fixture.js"></script></html>`;

if (process.argv.includes('--serve')) {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-point-curves-browser-'));
  const context = await createTrialServer({dataDir, port, clock});
  const browserBundle = await bundle();
  const worker = await readFile(resolve(root, 'dist/web/processing-worker.js'));
  const css = await readFile(resolve(root, 'apps/web/src/editorial-editor.css'));
  const server = context.server;
  const originalHandler = server.listeners('request')[0];
  server.removeListener('request', originalHandler);
  const send = (res, status, body, mime = 'application/json') => {
    res.writeHead(status, {'Content-Type': mime, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'});res.end(body);
  };
  server.on('request', (req, res) => {
    if (req.headers.host !== `127.0.0.1:${port}` || req.method !== 'GET') {
      originalHandler(req, res);return;
    }
    const pathname = new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname;
    if (pathname === '/') return send(res, 200, page, 'text/html; charset=utf-8');
    if (pathname === '/fixture.js') return send(res, 200, browserBundle, 'text/javascript; charset=utf-8');
    if (pathname === '/processing-worker.js') return send(res, 200, worker, 'text/javascript; charset=utf-8');
    if (pathname === '/editorial-editor.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/fixture/new') {
      const author = context.auth.createAuthor({authorName: `Point Curves ${Date.now()}`,
        trialEndsAt: '2026-11-03T08:00:00.000Z'});
      const invite = context.auth.issueInvite(author.id);
      return send(res, 200, JSON.stringify({inviteToken: invite.inviteToken}));
    }
    originalHandler(req, res);
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`SUITE_POINT_CURVES_BROWSER_PROBE http://127.0.0.1:${port}/`));
  const close = async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dataDir, {recursive: true, force: true});
  };
  process.once('SIGINT', () => {void close();});
  process.once('SIGTERM', () => {void close();});
} else {
  test('POINT-CURVES-EDITOR-BROWSER-BUNDLE: actual Trial/Editor/Worker fixture bundles without source substitution', async () => {
    const code = new TextDecoder().decode(await bundle());
    assert.match(code, /POINT-CURVES-EDITOR-BROWSER-PASS/);
    assert.match(code, /NON_RAW_POINT_CURVES_/);
    assert.match(code, /point-curve-preview/);
    assert.match(code, /NATIVE_POINT_CURVE_DBLCLICK_FAIL/);
    assert.match(code, /TRUSTED_DBLCLICK_DID_NOT_REMOVE_INTERIOR_POINT/);
    assert.ok(code.length > 100_000);
  });
}
