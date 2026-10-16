import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),port=61884;
const fixture=resolve(here,'fixtures/export-output-adjustments-editor-browser-fixture.mjs');
const worker=resolve(root,'apps/web/src/processing/worker.mjs');
const css=resolve(root,'apps/web/src/editorial-editor.css');
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE Output Sharpening Editor Probe</title>
<link rel="stylesheet" href="/editorial-editor.css"><button id="probe-run" type="button">出力時調整を検証</button>
<pre id="probe-verdict" aria-label="出力時調整検証判定">NOT_RUN</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script></html>`;
async function bundle(entry,format){
  const result=await build({entryPoints:[entry],bundle:true,format,platform:'browser',target:'es2022',
    external:['module'],write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);return result.outputFiles[0].contents;
}
if(process.argv.includes('--serve')){
  const fixtureBytes=await bundle(fixture,'esm'),workerBytes=await bundle(worker,'iife'),cssBytes=await readFile(css);
  const routes=new Map([['/',{body:page,type:'text/html; charset=utf-8'}],
    ['/fixture.js',{body:fixtureBytes,type:'text/javascript; charset=utf-8'}],
    ['/processing-worker.js',{body:workerBytes,type:'text/javascript; charset=utf-8'}],
    ['/editorial-editor.css',{body:cssBytes,type:'text/css; charset=utf-8'}]]);
  const server=createServer((req,res)=>{
    if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
    const route=routes.get(new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname);
    if(!route){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':route.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self' blob: data:; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:"});
    res.end(route.body);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_OUTPUT_SHARPENING_EDITOR_PROBE http://127.0.0.1:${port}/`));
}else{
  test('OUTPUT-EDITOR-BROWSER-FIXTURE: actual Editor, Session and Worker mounted for single and Batch Final',async()=>{
    const fixtureBytes=await bundle(fixture,'esm'),workerBytes=await bundle(worker,'iife');
    const fixtureText=new TextDecoder().decode(fixtureBytes),workerText=new TextDecoder().decode(workerBytes);
    assert.ok(fixtureBytes.length>100_000&&workerBytes.length>100_000);
    assert.match(fixtureText,/synthetic saved non-RAW Editor -> real Worker JPEG\/PNG\/TIFF/);
    assert.match(fixtureText,/FIXTURE_FIRST_DECODE_FAILED/);
    assert.match(fixtureText,/OUTPUT_SHARPENING_BROWSER_PASS/);
    assert.match(workerText,/OUTPUT_SHARPENING/);
  });
}
