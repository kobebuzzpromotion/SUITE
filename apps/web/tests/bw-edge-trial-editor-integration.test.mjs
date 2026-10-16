import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const fixture=resolve(here,'fixtures/bw-edge-trial-editor-integration-fixture.mjs');
const worker=resolve(root,'apps/web/src/processing/worker.mjs');
const css=resolve(root,'apps/web/src/editorial-editor.css');
const port=61895,clock=()=>Date.parse('2026-10-03T08:00:00.000Z');
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>B/W Trial Editor integration</title>
<link rel="stylesheet" href="/editorial-editor.css"><h1>B/W Trial Editor · SYNTHETIC NON-RAW</h1>
<button id="probe-run" type="button">実Trial・Editor統合を検証</button><pre id="probe-verdict" aria-label="実Trial・Editor統合判定">NOT_RUN</pre><pre id="probe-report"></pre>
<main id="app"></main><script type="module" src="/fixture.js"></script></html>`;
async function bundle(entry,format='esm'){
  const result=await build({entryPoints:[entry],bundle:true,format,platform:'browser',target:'es2022',external:['module'],write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);return result.outputFiles[0].contents;
}
if(process.argv.includes('--serve')){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-bw-trial-editor-'));
  const context=await createTrialServer({dataDir,port,clock});
  const js=await bundle(fixture),workerBytes=await bundle(worker,'iife'),style=await readFile(css);
  const server=context.server,original=server.listeners('request')[0];server.removeListener('request',original);
  let author=null;
  const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
  server.on('request',(req,res)=>{
    if(req.headers.host!==`127.0.0.1:${port}`){original(req,res);return;}
    const path=new URL(req.url??'/',`http://127.0.0.1:${port}`).pathname;
    if(req.method==='GET'&&path==='/')return send(res,200,page,'text/html; charset=utf-8');
    if(req.method==='GET'&&path==='/fixture.js')return send(res,200,js,'text/javascript; charset=utf-8');
    if(req.method==='GET'&&path==='/processing-worker.js')return send(res,200,workerBytes,'text/javascript; charset=utf-8');
    if(req.method==='GET'&&path==='/editorial-editor.css')return send(res,200,style,'text/css; charset=utf-8');
    if(req.method==='POST'&&path==='/fixture/new'){
      author=context.auth.createAuthor({authorName:'BW Trial Browser Owner',trialEndsAt:'2026-11-03T08:00:00.000Z'});
      return send(res,200,JSON.stringify({inviteToken:context.auth.issueInvite(author.id).inviteToken}));
    }
    if(req.method==='POST'&&path==='/fixture/revoke'){
      if(!author)return send(res,409,JSON.stringify({error:'NO_FIXTURE_AUTHOR'}));
      context.auth.revokeAuthor(author.id);return send(res,200,JSON.stringify({revoked:true}));
    }
    if(req.method==='GET'&&path==='/fixture/inspect'){
      if(!author)return send(res,409,JSON.stringify({error:'NO_FIXTURE_AUTHOR'}));
      const id=new URL(req.url,`http://127.0.0.1:${port}`).searchParams.get('assetID');
      if(!id||!/^[0-9a-f-]{36}$/i.test(id))return send(res,400,JSON.stringify({error:'INVALID_ASSET'}));
      try{const row=context.repo.latestRecipe(`trial-${author.id}`,id);
        return send(res,200,JSON.stringify({revision:row?.revision??null}));}
      catch{return send(res,500,JSON.stringify({error:'INSPECT_FAILED'}));}
    }
    original(req,res);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`BW_EDGE_TRIAL_EDITOR_PROBE http://127.0.0.1:${port}/`));
  const cleanup=async()=>{await new Promise(done=>server.close(done));
    const target=resolve(dataDir),base=resolve(tmpdir())+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)?.startsWith('suite-bw-trial-editor-'))throw Error('UNSAFE_FIXTURE_CLEANUP');
    await rm(target,{recursive:true,force:true});};
  process.once('SIGINT',()=>{void cleanup();});process.once('SIGTERM',()=>{void cleanup();});
}else test('BW-TRIAL-EDITOR: real Trial HTTP/SQLite and browser fixture bundles; actual browser probe is separate',async()=>{
  const js=new TextDecoder().decode(await bundle(fixture));
  assert.match(js,/BW_EDGE_TRIAL_EDITOR_BROWSER_PASS/);
  assert.match(js,/SYNTHETIC_NON_RAW/);
  assert.match(js,/setBWEdgeManualStrokes/);
  assert.match(js,/getOriginal/);
  assert.ok(js.length>100_000);
});
