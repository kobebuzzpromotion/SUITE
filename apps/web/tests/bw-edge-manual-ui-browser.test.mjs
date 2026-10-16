import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, 'fixtures/bw-edge-manual-ui-browser-fixture.mjs');
const port = 61893;
const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>B/W Edge manual brush probe</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{font:16px sans-serif;margin:12px;color:#17212b}main{max-width:800px}.layout{display:flex;gap:8px}
#before-box,#after-box{width:240px;height:240px;border:1px solid #888;position:relative}
#before,#after{display:block;width:100%;height:100%;object-fit:contain}
button,select,input{min-height:44px;font-size:16px}.bw-edge-manual{display:grid;gap:8px;padding:10px;max-width:340px}
.bw-edge-manual label{display:grid;gap:4px}.bw-edge-manual input{width:100%;box-sizing:border-box}
@media(max-width:600px){.layout{display:block}#before-box,#after-box{width:min(240px,100%)}}
</style><main><button id="probe-run" type="button">手動範囲を検証</button>
<pre id="probe-verdict" aria-label="手動範囲検証判定">NOT_RUN</pre>
<pre id="live-strokes">NO_STROKES</pre><div class="layout"><div id="before-box"><img id="before" alt="Before"></div>
<div id="after-box"><img id="after" alt="After"></div></div><div id="brush-root"></div></main>
<script type="module" src="/fixture.js"></script></html>`;
async function bundle() {
  const result = await build({entryPoints: [fixture], bundle: true, format: 'esm', platform: 'browser',
    target: 'es2022', write: false, logLevel: 'silent'});
  assert.equal(result.outputFiles.length, 1);
  return result.outputFiles[0].contents;
}
if (process.argv.includes('--serve')) {
  const bytes = await bundle();
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${port}`) {
      res.writeHead(403); res.end(); return;
    }
    const path = new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname;
    const data = path === '/' ? page : path === '/fixture.js' ? bytes : null;
    if (data === null) {res.writeHead(404); res.end(); return;}
    res.writeHead(200, {'Content-Type': path === '/' ? 'text/html; charset=utf-8' :
      'text/javascript; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"});
    res.end(data);
  });
  server.listen(port, '127.0.0.1', () => console.log(`BW_EDGE_MANUAL_PROBE http://127.0.0.1:${port}/`));
} else {
  test('BW-EDGE-MANUAL-BROWSER-FIXTURE: real Chrome fixture bundles After two-layer controls', async () => {
    const bytes = await bundle(), source = new TextDecoder().decode(bytes);
    assert.ok(bytes.length > 10000);
    assert.match(source, /BW_EDGE_MANUAL_BROWSER_PASS/);
    assert.match(source, /mapAfterToLocalBrushPoint/);
    assert.match(source, /subjectStrokes/);
    assert.match(source, /correctionStrokes/);
  });
}
