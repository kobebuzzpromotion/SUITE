import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const entry=resolve(here,'fixtures/export-size-editor-browser-fixture.mjs');
const port=61846;

async function fixtureBundle(){
  const result=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}

const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE Editor Export UI Browser Probe</title>
<link rel="stylesheet" href="/editorial-editor.css"><h1>SUITE Editor Export UI Browser Probe · synthetic NON-RAW</h1>
<button id="probe-run">Editor UIから36出力を検証</button>
<pre id="probe-verdict" aria-label="検証判定">NOT_RUN</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script></html>`;

if(process.argv.includes('--serve')){
  const bundle=await fixtureBundle();
  const worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
  const css=await readFile(resolve(root,'apps/web/src/editorial-editor.css'));
  const server=createServer((req,res)=>{
    if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
    const path=new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname;
    const item=path==='/'?[page,'text/html; charset=utf-8']:
      path==='/fixture.js'?[bundle,'text/javascript; charset=utf-8']:
      path==='/processing-worker.js'?[worker,'text/javascript; charset=utf-8']:
      path==='/editorial-editor.css'?[css,'text/css; charset=utf-8']:null;
    if(!item){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store'});res.end(item[0]);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_EDITOR_EXPORT_UI_BROWSER_PROBE http://127.0.0.1:${port}/`));
}else{
  test('EXPORT-SIZE-EDITOR-BROWSER-BUNDLE: real Editor and Session fixture bundles with UI controls',async()=>{
    const code=await fixtureBundle();
    assert.ok(code.length>100_000);
    const text=new TextDecoder().decode(code);
    assert.match(text,/EXPORT-SIZE-EDITOR-BROWSER-PASS/);
    assert.match(text,/export-size-method/);
    assert.match(text,/SYNTHETIC_NON_RAW_EXPORT_ORIGINAL/);
    assert.match(text,/36 actual Editor UI deliveries/);
    assert.match(text,/EXPORT_SIZE_WIDTH_INVALID/);
    assert.match(text,/EXPORT_SIZE_HEIGHT_INVALID/);
  });
}
