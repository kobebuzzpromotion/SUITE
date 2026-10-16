import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url)),port=61914;
const fixture=resolve(here,'fixtures/bw-edge-manual-chrome-worker-fixture.mjs');
const worker=resolve(here,'../src/processing/worker.mjs');
const page=`<!doctype html><html lang="en"><meta charset="utf-8"><title>SUITE B/W manual Worker probe</title>
<h1>B/W manual real Chrome Worker probe</h1><button id="run" type="button">Run B/W check</button>
<pre id="verdict" aria-label="B/W Worker result">NOT_RUN</pre><script type="module" src="/fixture.js"></script></html>`;
async function bundle(entry,format){
  const result=await build({entryPoints:[entry],bundle:true,format,platform:'browser',target:'es2022',
    external:['module'],write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}
if(process.argv.includes('--serve')){
  const fixtureBytes=await bundle(fixture,'esm'),workerBytes=await bundle(worker,'iife');
  const routes=new Map([['/fixture.js',{bytes:fixtureBytes,type:'text/javascript; charset=utf-8'}],
    ['/processing-worker.js',{bytes:workerBytes,type:'text/javascript; charset=utf-8'}],
    ['/',{bytes:page,type:'text/html; charset=utf-8'}]]);
  const server=createServer((req,res)=>{
    if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
    const route=routes.get(new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname);
    if(!route){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':route.type,'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'"});
    res.end(route.bytes);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_BW_EDGE_CHROME_WORKER_PROBE http://127.0.0.1:${port}/`));
}else{
  test('BW-EDGE-CHROME-FIXTURE bundles real Processing facade and Worker for Chrome execution',async()=>{
    const fixtureText=new TextDecoder().decode(await bundle(fixture,'esm'));
    const workerText=new TextDecoder().decode(await bundle(worker,'iife'));
    assert.match(fixtureText,/real Chrome independent B\/W manual Worker/);
    assert.match(workerText,/BW_EDGE_MANUAL_MASK_PROVENANCE_INVALID/);
  });
}
