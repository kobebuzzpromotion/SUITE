import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const entry=resolve(here,'fixtures/batch-final-browser-fixture.mjs');
const port=61844;

async function fixtureBundle(){
  const result=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}

const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE Batch Final Browser Probe</title>
<link rel="stylesheet" href="/editorial-editor.css"><h1>SUITE Batch Final Browser Probe · synthetic NON-RAW</h1>
<div role="group" aria-label="検証シナリオ"><button id="probe-success">成功シナリオ</button>
<button id="probe-fail">2件目失敗シナリオ</button><button id="probe-cancel">取消シナリオ</button>
<button id="probe-inspect">結果を確認</button><button id="probe-dispose">Editorを破棄</button>
<button id="probe-run-all">ブラウザ全ケース検証</button></div>
<pre id="probe-verdict" aria-label="検証判定">NOT_RUN</pre>
<pre id="probe-report" aria-label="検証結果">STARTING</pre><main id="app"></main>
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
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_BATCH_FINAL_BROWSER_PROBE http://127.0.0.1:${port}/`));
}else{
  test('BATCH-FINAL-BROWSER-BUNDLE: actual Editor/session fixture bundles without replacing product code',async()=>{
    const code=await fixtureBundle();
    assert.ok(code.length>100_000);
    const text=new TextDecoder().decode(code);
    assert.match(text,/EXPORT_BATCH_RESULT_INCOMPLETE/);
    assert.match(text,/BATCH_FINAL_AUTHENTICATED_STORAGE_REQUIRED/);
    assert.match(text,/NON_RAW_BROWSER_BATCH_A/);
    assert.match(text,/BATCH-FINAL-BROWSER-PASS/);
    assert.match(text,/custom-count: explicit order/);
    assert.match(text,/custom-sequence: ordered Worker PNG links/);
    assert.match(text,/original: explicit order/);
    assert.match(text,/second_Studio\.png/);
  });
}
