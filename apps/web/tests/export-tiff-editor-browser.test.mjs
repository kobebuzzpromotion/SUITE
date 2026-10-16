import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),port=61869;
const fixture=resolve(here,'fixtures/export-tiff-editor-browser-fixture.mjs');
const worker=resolve(root,'apps/web/src/processing/worker.mjs');
const css=resolve(root,'apps/web/src/editorial-editor.css');
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE TIFF Editor Browser Probe</title>
<link rel="stylesheet" href="/editorial-editor.css"><h1>TIFF Editor · synthetic saved NON-RAW</h1>
<button id="probe-run" type="button">TIFF UI経路を検証</button>
<pre id="probe-verdict" aria-label="TIFF Editor検証判定">NOT_RUN</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script></html>`;
async function bundle(entry,format){
  const result=await build({entryPoints:[entry],bundle:true,format,platform:'browser',target:'es2022',
    external:['module'],write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}

if(process.argv.includes('--serve')){
  const fixtureBytes=await bundle(fixture,'esm'),workerBytes=await bundle(worker,'iife'),cssBytes=await readFile(css);
  const routes=new Map([
    ['/',{body:page,type:'text/html; charset=utf-8'}],
    ['/fixture.js',{body:fixtureBytes,type:'text/javascript; charset=utf-8'}],
    ['/processing-worker.js',{body:workerBytes,type:'text/javascript; charset=utf-8'}],
    ['/editorial-editor.css',{body:cssBytes,type:'text/css; charset=utf-8'}]
  ]);
  const server=createServer((req,res)=>{
    if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
    const route=routes.get(new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname);
    if(!route){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':route.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self' blob: data:; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:"});
    res.end(route.body);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_TIFF_EDITOR_BROWSER_PROBE http://127.0.0.1:${port}/`));
}else{
  test('TIFF-EDITOR-BROWSER-FIXTURE: saved Editor, Session and real Worker bundle without source substitution',async()=>{
    const fixtureBytes=await bundle(fixture,'esm'),workerBytes=await bundle(worker,'iife');
    const fixtureText=new TextDecoder().decode(fixtureBytes),workerText=new TextDecoder().decode(workerBytes);
    assert.ok(fixtureBytes.length>100_000&&workerBytes.length>100_000);
    assert.match(fixtureText,/synthetic saved non-RAW Editor UI -> Session -> real Worker -> TIFF Blob/);
    assert.match(fixtureText,/export-tiff/);
    assert.match(fixtureText,/SYNTHETIC_NON_RAW_TIFF_EDITOR_ORIGINAL/);
    assert.match(workerText,/image\/tiff/);
  });
}
