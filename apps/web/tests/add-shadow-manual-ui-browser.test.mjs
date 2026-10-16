import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, 'fixtures/add-shadow-manual-ui-browser-fixture.mjs');
const port = 61894;
const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Add Shadow manual UI probe</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{font:16px sans-serif;margin:12px;color:#17212b}main{max-width:800px;min-width:0}
.layout{display:flex;flex-wrap:wrap;gap:8px}#before-box,#after-box{width:240px;height:240px;border:1px solid #888;position:relative;flex:none}
#before,#after{display:block;width:100%;height:100%;object-fit:contain}
@media(max-width:390px){#before-box,#after-box{width:min(240px,100%)}}
</style><main><button id="probe-run" type="button">手動Add Shadowを検証</button>
<pre id="probe-verdict" aria-label="Add Shadow手動UI検証判定">NOT_RUN</pre>
<div class="layout"><div id="before-box"><img id="before" alt="Before"></div>
<div id="after-box"><img id="after" alt="After"></div></div><div id="panel"></div></main>
<script type="module" src="/fixture.js"></script></html>`;
async function bundle() {
  const result = await build({entryPoints: [fixture], bundle: true, format: 'esm',
    platform: 'browser', target: 'es2022', write: false, logLevel: 'silent'});
  assert.equal(result.outputFiles.length, 1);
  return result.outputFiles[0].contents;
}
if (process.argv.includes('--serve')) {
  const bytes = await bundle();
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.headers.host !== `127.0.0.1:${port}`) {
      response.writeHead(403); response.end(); return;
    }
    const path = new URL(request.url ?? '/', `http://127.0.0.1:${port}`).pathname;
    const data = path === '/' ? page : path === '/fixture.js' ? bytes : null;
    if (data === null) {response.writeHead(404); response.end(); return;}
    response.writeHead(200, {'Content-Type': path === '/' ?
      'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"});
    response.end(data);
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`ADD_SHADOW_UI_PROBE http://127.0.0.1:${port}/`));
} else {
  test('SHADOW-UI-BUNDLE: After-only manual controls, geometry and host-only callback bundle', async () => {
    const bytes = await bundle(), source = new TextDecoder().decode(bytes);
    assert.ok(bytes.length > 10000);
    assert.match(source, /ADD_SHADOW_UI_BROWSER_PASS/);
    assert.match(source, /mapAfterToLocalBrushPoint/);
    assert.match(source, /mapAfterImagePointToLocalBrushPoint/);
    assert.match(source, /subjectStrokes/);
    assert.match(source, /selectedBackdropID/);
  });
}
