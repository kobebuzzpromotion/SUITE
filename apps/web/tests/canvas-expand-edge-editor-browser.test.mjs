import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const entry=resolve(here,'fixtures/canvas-expand-edge-editor-browser-fixture.mjs');
const switchEntry=resolve(here,'fixtures/canvas-expand-edge-switch-browser-fixture.mjs');
const port=61874;
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SUITE Canvas Edge Editor browser probe</title><link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/editorial-editor.css"><button id="probe-run" hidden>unused</button>
<pre id="probe-verdict" hidden>NOT_RUN</pre><button id="edge-run" type="button">四辺ハンドルを検証</button>
<pre id="edge-verdict" role="status">NOT_RUN</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script>`;
const switchPage=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SUITE Canvas Edge Asset switch probe</title><link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/editorial-editor.css"><button id="probe-success" hidden>unused</button>
<button id="probe-fail" hidden>unused</button><button id="probe-cancel" hidden>unused</button>
<button id="probe-inspect" hidden>unused</button><button id="probe-dispose" hidden>unused</button>
<button id="probe-run-all" hidden>unused</button><pre id="probe-verdict" hidden>NOT_RUN</pre>
<pre id="probe-report" hidden>NOT_RUN</pre><button id="edge-switch-run" type="button">写真切替を検証</button>
<pre id="edge-switch-verdict" role="status">NOT_RUN</pre><main id="app"></main>
<script type="module" src="/switch-fixture.js"></script>`;
async function bundle(entryPoint=entry){
  const result=await build({entryPoints:[entryPoint],bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);return result.outputFiles[0].contents;
}
if(process.argv.includes('--serve')){
  const code=await bundle(),switchCode=await bundle(switchEntry),worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
  const css=await readFile(resolve(root,'apps/web/src/editorial-editor.css'));
  const base=await readFile(resolve(root,'apps/web/src/styles.css'));
  const server=createServer((req,res)=>{
    if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
    const path=new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname;
    const item=path==='/'?[page,'text/html; charset=utf-8']:
      path==='/switch'?[switchPage,'text/html; charset=utf-8']:
      path==='/fixture.js'?[code,'text/javascript; charset=utf-8']:
      path==='/switch-fixture.js'?[switchCode,'text/javascript; charset=utf-8']:
      path==='/processing-worker.js'?[worker,'text/javascript; charset=utf-8']:
      path==='/editorial-editor.css'?[css,'text/css; charset=utf-8']:
      path==='/styles.css'?[base,'text/css; charset=utf-8']:null;
    if(!item){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store'});res.end(item[0]);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_CANVAS_EDGE_EDITOR_BROWSER_PROBE http://127.0.0.1:${port}/`));
}else{
  test('CANVAS-EDGE-EDITOR-BUNDLE: actual Editor handle fixture bundles',async()=>{
    const code=new TextDecoder().decode(await bundle());
    assert.match(code,/CANVAS-EDGE-EDITOR-BROWSER-PASS/);
    assert.match(code,/mountCanvasExpandEdgeOverlay/);
    assert.match(code,/setCanvasExpansion/);
    assert.match(code,/processing-worker\.js/);
  });
  test('CANVAS-EDGE-SWITCH-BUNDLE: two-Asset Editor fixture bundles',async()=>{
    const code=new TextDecoder().decode(await bundle(switchEntry));
    assert.match(code,/CANVAS-EDGE-SWITCH-BROWSER-PASS/);
    assert.match(code,/mountCanvasExpandEdgeOverlay/);
    assert.match(code,/openAsset/);
  });
}
