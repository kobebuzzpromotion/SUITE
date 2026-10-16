import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const fixture=resolve(dirname(fileURLToPath(import.meta.url)),
  'fixtures/add-shadow-editor-browser-fixture.mjs');
const port=61895;
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Add Shadow Editor probe</title><button id="probe-run" type="button">EditorのAdd Shadowを検証</button><pre id="probe-verdict">NOT_RUN</pre><div id="app"></div><script type="module" src="/fixture.js"></script></html>`;
async function bundle(){const result=await build({entryPoints:[fixture],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'silent'});assert.equal(result.outputFiles.length,1);return result.outputFiles[0].contents;}
if(process.argv.includes('--serve')){
  const bytes=await bundle();const server=createServer((request,response)=>{
    if(request.method!=='GET'||request.headers.host!==`127.0.0.1:${port}`){response.writeHead(403);response.end();return;}
    const path=new URL(request.url??'/',`http://127.0.0.1:${port}`).pathname;
    const body=path==='/'?page:path==='/fixture.js'?bytes:null;
    if(body===null){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':path==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:"});response.end(body);
  });server.listen(port,'127.0.0.1',()=>console.log(`ADD_SHADOW_EDITOR_PROBE http://127.0.0.1:${port}/`));
}else test('SHADOW-EDITOR-BUNDLE / SYNTHETIC_NON_RAW: Trial-only Editor mounts verified manual controls',async()=>{
  const bytes=await bundle(),source=new TextDecoder().decode(bytes);
  assert.ok(bytes.length>10000);assert.match(source,/ADD_SHADOW_EDITOR_BROWSER_PASS/);
  assert.match(source,/setAddShadowManualDocument/);assert.match(source,/replaceBackdrop/);
});
