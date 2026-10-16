import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const entry=resolve(here,'fixtures/grain-trial-browser-fixture.mjs');
const port=61850,origin=`http://127.0.0.1:${port}`;
const clock=()=>Date.parse('2026-10-03T08:00:00.000Z');

async function bundleFixture(){
  const output=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(output.outputFiles.length,1);
  return output.outputFiles[0].contents;
}
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE Grain Trial Browser Probe</title>
<link rel="stylesheet" href="/editorial-editor.css"><h1>Grain · Trial HTTP/SQLite · synthetic NON-RAW</h1>
<button id="probe-run">Grain実Trial経路を検証</button>
<pre id="probe-verdict" aria-label="検証判定">NOT_RUN</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script></html>`;

if(process.argv.includes('--serve')){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-grain-trial-browser-'));
  const context=await createTrialServer({dataDir,port,clock});
  const bundle=await bundleFixture();
  const worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
  const css=await readFile(resolve(root,'apps/web/src/editorial-editor.css'));
  const member=context.auth.createAuthor({authorName:'Grain Trial Fixture',
    trialEndsAt:'2026-11-03T08:00:00.000Z'});
  const invite=context.auth.issueInvite(member.id);
  const server=context.server,upstream=server.listeners('request')[0];
  server.removeListener('request',upstream);
  server.on('request',(req,res)=>{
    if(req.headers.host!==`127.0.0.1:${port}`){upstream(req,res);return;}
    const path=new URL(req.url??'/',origin).pathname;
    if(req.method==='POST'&&path==='/fixture/revoke'){
      context.auth.revokeInvite(invite.invitationID);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({revoked:true}));return;
    }
    if(req.method!=='GET'){upstream(req,res);return;}
    if(path==='/fixture/invite'){
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({inviteToken:invite.inviteToken}));return;
    }
    const item=path==='/'?[page,'text/html; charset=utf-8']:
      path==='/fixture.js'?[bundle,'text/javascript; charset=utf-8']:
      path==='/processing-worker.js'?[worker,'text/javascript; charset=utf-8']:
      path==='/editorial-editor.css'?[css,'text/css; charset=utf-8']:null;
    if(!item){upstream(req,res);return;}
    res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store'});res.end(item[0]);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_GRAIN_TRIAL_BROWSER_PROBE ${origin}/`));
  const close=async()=>{
    await new Promise(resolve=>server.close(resolve));
    const target=resolve(dataDir),base=resolve(tmpdir())+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)?.startsWith('suite-grain-trial-browser-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});
  };
  process.once('SIGINT',()=>{void close();});process.once('SIGTERM',()=>{void close();});
}else{
  test('GRAIN-TRIAL-BROWSER-BUNDLE: product Editor, Trial client and Worker fixture bundles',async()=>{
    const code=await bundleFixture();assert.ok(code.length>100_000);
    const source=new TextDecoder().decode(code);
    assert.match(source,/GRAIN-TRIAL-BROWSER-PASS/);
    assert.match(source,/SYNTHETIC_NON_RAW_GRAIN_TRIAL_ORIGINAL/);
    assert.match(source,/fixture\/revoke/);
  });
}
