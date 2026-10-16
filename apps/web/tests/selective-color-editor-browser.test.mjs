import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const entry=resolve(here,'fixtures/selective-color-editor-browser-fixture.mjs');
const port=61871;

async function fixtureBundle(){
  const result=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}

const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SUITE Selective Color browser probe</title>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/editorial-editor.css">
<h1>Selective Color · synthetic non-RAW browser probe</h1>
<button id="probe-run" type="button">UIから全色域と方式を検証</button>
<pre id="probe-verdict" aria-label="検証判定">NOT_RUN</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script></html>`;

if(process.argv.includes('--serve')){
  const bundle=await fixtureBundle();
  const worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
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
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_SELECTIVE_COLOR_BROWSER_PROBE http://127.0.0.1:${port}/`));
}else{
  test('SELECTIVE-EDITOR-BROWSER-BUNDLE: real Editor/Session/Worker browser fixture bundles',async()=>{
    const code=await fixtureBundle();
    assert.ok(code.length>100_000);
    const text=new TextDecoder().decode(code);
    assert.match(text,/SELECTIVE-EDITOR-BROWSER-PASS/);
    assert.match(text,/setSelectiveColorMethod/);
    assert.match(text,/processing-worker\.js/);
    assert.match(text,/SYNTHETIC_NON_RAW_SELECTIVE_ORIGINAL/);
  });
}
