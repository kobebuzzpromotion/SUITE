import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const entry=resolve(here,'fixtures/glow-editor-browser-fixture.mjs');
const port=61848;
const clock=()=>Date.parse('2026-10-03T08:00:00.000Z');

async function fixtureBundle(){
  const result=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}

const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE Glow Editor Browser Probe</title>
<link rel="stylesheet" href="/editorial-editor.css"><h1>SUITE Glow Editor Browser Probe · synthetic NON-RAW</h1>
<button id="probe-run">Editor UIからGlowを検証</button>
<pre id="probe-verdict" aria-label="検証判定">NOT_RUN</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script></html>`;

if(process.argv.includes('--serve')){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-glow-editor-browser-'));
  const context=await createTrialServer({dataDir,port,clock});
  const bundle=await fixtureBundle();
  const worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
  const css=await readFile(resolve(root,'apps/web/src/editorial-editor.css'));
  const server=context.server;
  const originalHandler=server.listeners('request')[0];
  server.removeListener('request',originalHandler);
  server.on('request',(req,res)=>{
    if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`){originalHandler(req,res);return;}
    const path=new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname;
    if(path==='/fixture/new'){
      const author=context.auth.createAuthor({authorName:`Glow ${Date.now()}`,
        trialEndsAt:'2026-11-03T08:00:00.000Z'});
      const invite=context.auth.issueInvite(author.id);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({inviteToken:invite.inviteToken}));return;
    }
    const item=path==='/'?[page,'text/html; charset=utf-8']:
      path==='/fixture.js'?[bundle,'text/javascript; charset=utf-8']:
      path==='/processing-worker.js'?[worker,'text/javascript; charset=utf-8']:
      path==='/editorial-editor.css'?[css,'text/css; charset=utf-8']:null;
    if(!item){originalHandler(req,res);return;}
    res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store'});res.end(item[0]);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_GLOW_EDITOR_BROWSER_PROBE http://127.0.0.1:${port}/`));
  const close=async()=>{
    await new Promise(resolve=>server.close(resolve));
    const target=resolve(dataDir),base=resolve(tmpdir())+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)?.startsWith('suite-glow-editor-browser-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});
  };
  process.once('SIGINT',()=>{void close();});
  process.once('SIGTERM',()=>{void close();});
}else{
  test('GLOW-EDITOR-BROWSER-BUNDLE: actual Trial/Editor/session/Worker fixture bundles without replacing product code',async()=>{
    const code=await fixtureBundle();
    assert.ok(code.length>100_000);
    const text=new TextDecoder().decode(code);
    assert.match(text,/GLOW-EDITOR-BROWSER-PASS/);
    assert.match(text,/glow-mask-toggle/);
    assert.match(text,/SYNTHETIC_NON_RAW_GLOW_ORIGINAL/);
    assert.match(text,/\/fixture\/new/);
  });
}
