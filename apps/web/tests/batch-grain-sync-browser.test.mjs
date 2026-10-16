import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const runtime=resolve(root,'.runtime');
const entry=resolve(here,'fixtures/batch-grain-sync-browser-fixture.mjs');
const port=61879,clock=()=>Date.parse('2026-10-03T08:00:00.000Z');
async function bundle(){const result=await build({entryPoints:[entry],bundle:true,
  format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);return result.outputFiles[0].contents;}
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SUITE Grain Sync Probe</title><link rel="stylesheet" href="/editorial-editor.css">
<button id="probe-run" type="button">Grainの選択同期を確認</button>
<pre id="probe-verdict">NOT_RUN</pre><pre id="probe-report">STARTING</pre>
<main id="app"></main><script type="module" src="/fixture.js"></script></html>`;

if(process.argv.includes('--serve')){
  await mkdir(runtime,{recursive:true});
  const dataDir=await mkdtemp(join(runtime,'grain-sync-browser-'));
  const context=await createTrialServer({dataDir,port,clock});
  const browserBundle=await bundle();
  const worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
  const css=await readFile(resolve(root,'apps/web/src/editorial-editor.css'));
  const server=context.server,originalHandler=server.listeners('request')[0];
  server.removeListener('request',originalHandler);
  const send=(res,status,body,mime='application/json')=>{res.writeHead(status,
    {'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
  server.on('request',(req,res)=>{
    if(req.headers.host!==`127.0.0.1:${port}`||req.method!=='GET'){
      originalHandler(req,res);return;}
    const pathname=new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname;
    if(pathname==='/')return send(res,200,page,'text/html; charset=utf-8');
    if(pathname==='/fixture.js')return send(res,200,browserBundle,'text/javascript; charset=utf-8');
    if(pathname==='/processing-worker.js')return send(res,200,worker,'text/javascript; charset=utf-8');
    if(pathname==='/editorial-editor.css')return send(res,200,css,'text/css; charset=utf-8');
    if(pathname==='/fixture/new'){
      const author=context.auth.createAuthor({authorName:`Grain sync ${Date.now()}`,
        trialEndsAt:'2026-11-03T08:00:00.000Z'});
      const invite=context.auth.issueInvite(author.id);
      return send(res,200,JSON.stringify({inviteToken:invite.inviteToken}));
    }
    originalHandler(req,res);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_GRAIN_SYNC_BROWSER_PROBE http://127.0.0.1:${port}/`));
  const close=async()=>{
    await new Promise(done=>server.close(done));
    const target=resolve(dataDir),base=runtime+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)?.startsWith('grain-sync-browser-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});
  };
  process.once('SIGINT',()=>{void close();});process.once('SIGTERM',()=>{void close();});
}else{
  test('GRAIN-SYNC-BROWSER-BUNDLE / Editor, Session, Trial, Worker synthetic NON-RAW fixture bundles',async()=>{
    const code=new TextDecoder().decode(await bundle());
    assert.match(code,/GRAIN-SYNC-BROWSER-PASS/);
    assert.match(code,/batchSyncGrain/);
    assert.match(code,/NON_RAW_GRAIN_SYNC_BROWSER/);
    assert.ok(code.length>100_000);
  });
}
