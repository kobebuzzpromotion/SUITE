import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),port=61894;
const fixture=resolve(here,'fixtures/bw-edge-editor-browser-fixture.mjs');
const css=resolve(root,'apps/web/src/editorial-editor.css');
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>B/W Edge Editor integration probe</title>
<link rel="stylesheet" href="/editorial-editor.css"><button id="probe-run" type="button">二層Editorを検証</button>
<pre id="probe-verdict" aria-label="二層Editor検証判定">NOT_RUN</pre><main id="app"></main><script type="module" src="/fixture.js"></script></html>`;
async function bundle(){const result=await build({entryPoints:[fixture],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'silent'});assert.equal(result.outputFiles.length,1);return result.outputFiles[0].contents;}
if(process.argv.includes('--serve')){
  const js=await bundle(),style=await readFile(css);const server=createServer((req,res)=>{
    if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
    const path=new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname;
    const route=path==='/'?[page,'text/html; charset=utf-8']:path==='/fixture.js'?[js,'text/javascript; charset=utf-8']:path==='/editorial-editor.css'?[style,'text/css; charset=utf-8']:null;
    if(!route){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':route[1],'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' blob: data:; script-src 'self'; style-src 'self'; img-src 'self' data: blob:"});res.end(route[0]);
  });server.listen(port,'127.0.0.1',()=>console.log(`BW_EDGE_EDITOR_PROBE http://127.0.0.1:${port}/`));
}else test('BW-EDGE-EDITOR-BROWSER-FIXTURE: synthetic UI two-layer explicit apply and failure isolation',async()=>{
  const js=new TextDecoder().decode(await bundle());assert.match(js,/BW_EDGE_EDITOR_BROWSER_PASS/);assert.match(js,/setBWEdgeManualStrokes/);assert.match(js,/FIXTURE_AUTH_REVOKED/);
});
