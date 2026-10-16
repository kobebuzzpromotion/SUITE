import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const entry=resolve(here,'fixtures/sharpen-advanced-editor-browser-fixture.mjs');
const port=61876;
async function fixtureBundle(){
  const result=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);return result.outputFiles[0].contents;
}
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SUITE advanced sharpening browser probe</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/editorial-editor.css">
<h1>Sharpen Radius / Detail / Masking · synthetic non-RAW browser probe</h1>
<button id="sharpen-run" type="button">Sharpenの実画素と保存を検証</button><pre id="sharpen-verdict">NOT_RUN</pre>
<button id="probe-run" hidden type="button">Legacy probe</button><pre id="probe-verdict" hidden>NOT_RUN</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script></html>`;

if(process.argv.includes('--serve')){
  const bundle=await fixtureBundle(),worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
  const css=await readFile(resolve(root,'apps/web/src/editorial-editor.css'));
  const baseCSS=await readFile(resolve(root,'apps/web/src/styles.css'));
  const server=createServer((req,res)=>{
    if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
    const path=new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname;
    const item=path==='/'?[page,'text/html; charset=utf-8']:
      path==='/fixture.js'?[bundle,'text/javascript; charset=utf-8']:
      path==='/processing-worker.js'?[worker,'text/javascript; charset=utf-8']:
      path==='/editorial-editor.css'?[css,'text/css; charset=utf-8']:
      path==='/styles.css'?[baseCSS,'text/css; charset=utf-8']:null;
    if(!item){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store'});res.end(item[0]);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_SHARPEN_EDITOR_BROWSER_PROBE http://127.0.0.1:${port}/`));
}else{
  test('SHARP-BROWSER-BUNDLE: real Editor/Session/Worker fixture bundles advanced sliders',async()=>{
    const code=await fixtureBundle(),text=new TextDecoder().decode(code);
    assert.ok(code.length>100_000);assert.match(text,/SHARPEN-BROWSER-PASS/);
    for(const field of ['sharpenRadius','sharpenDetail','sharpenMasking'])assert.match(text,new RegExp(field));
    assert.match(text,/processing-worker\.js/);
  });
}
