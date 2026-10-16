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
const entry=resolve(here,'fixtures/glow-author-trial-browser-fixture.mjs');
const port=61850;
const origin=`http://127.0.0.1:${port}`;
const clock=()=>Date.parse('2026-10-03T08:00:00.000Z');

async function fixtureBundle(){
  const result=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}

const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE Glow Author Trial Probe</title>
<link rel="stylesheet" href="/editorial-editor.css"><h1>Glow Author portable Preset · synthetic NON-RAW</h1>
<button id="probe-run">Author画面からGlow Presetを検証</button>
<pre id="probe-verdict" aria-label="検証判定">NOT_RUN</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script></html>`;

if(process.argv.includes('--serve')){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-glow-author-browser-'));
  const context=await createTrialServer({dataDir,port,clock});
  const bundle=await fixtureBundle();
  const worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
  const css=await readFile(resolve(root,'apps/web/src/editorial-editor.css'));
  const admin=context.auth.createAuthor({authorName:'Distinct Glow Reviewer',role:'admin',
    trialEndsAt:'2026-11-03T08:00:00.000Z'});
  const adminInvite=context.auth.issueInvite(admin.id);
  const other=context.auth.createAuthor({authorName:'Other Glow Author',
    trialEndsAt:'2026-11-03T08:00:00.000Z'});
  const otherInvite=context.auth.issueInvite(other.id);
  let adminCookie='',otherCookie='';
  const server=context.server;
  const originalHandler=server.listeners('request')[0];
  server.removeListener('request',originalHandler);
  server.on('request',(req,res)=>{
    if(req.headers.host!==`127.0.0.1:${port}`){originalHandler(req,res);return;}
    const path=new URL(req.url??'/',origin).pathname;
    if(req.method==='POST'&&path==='/fixture/admin-review'){
      void (async()=>{
        let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)throw Error('TEST_BODY_TOO_LARGE');}
        const {draftID,revision}=JSON.parse(body);
        if(!/^[0-9a-f-]{36}$/i.test(draftID)||!Number.isSafeInteger(revision)||revision<1||!adminCookie)
          throw Error('INVALID_TEST_REVIEW_REQUEST');
        const upstream=await fetch(`${origin}/trial/drafts/${draftID}/review`,{
          method:'POST',headers:{'X-Suite-Trial':'1','Content-Type':'application/json',Cookie:adminCookie},
          body:JSON.stringify({expectedRevision:revision,decision:'ACCEPTED'})});
        const result=await upstream.text();
        res.writeHead(upstream.status,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(result);
      })().catch(error=>{
        res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(JSON.stringify({error:error.message}));
      });return;
    }
    if(req.method==='POST'&&path==='/fixture/other-owner'){
      void (async()=>{
        let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)throw Error('TEST_BODY_TOO_LARGE');}
        const {draftID,assetID}=JSON.parse(body);
        if(!/^[0-9a-f-]{36}$/i.test(draftID)||!/^[0-9a-f-]{36}$/i.test(assetID)||!otherCookie)
          throw Error('INVALID_TEST_OWNER_REQUEST');
        const headers={'X-Suite-Trial':'1',Cookie:otherCookie};
        const [draft,recipe,original]=await Promise.all([
          fetch(`${origin}/trial/drafts/${draftID}`,{headers}),
          fetch(`${origin}/v1/assets/${assetID}/recipe`,{headers}),
          fetch(`${origin}/v1/assets/${assetID}/original?purpose=high-precision`,{headers})]);
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(JSON.stringify({draftStatus:draft.status,recipeStatus:recipe.status,
          originalStatus:original.status}));
      })().catch(error=>{
        res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(JSON.stringify({error:error.message}));
      });return;
    }
    if(req.method==='POST'&&path==='/fixture/revoke-author'){
      void (async()=>{
        let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)throw Error('TEST_BODY_TOO_LARGE');}
        const {invitationID}=JSON.parse(body);
        if(!/^[0-9a-f-]{36}$/i.test(invitationID)||!adminCookie)throw Error('INVALID_TEST_REVOKE_REQUEST');
        const upstream=await fetch(`${origin}/trial/members/${invitationID}/revoke`,{
          method:'POST',headers:{'X-Suite-Trial':'1','Content-Type':'application/json',Cookie:adminCookie},
          body:'{}'});
        const result=await upstream.text();
        res.writeHead(upstream.status,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(result);
      })().catch(error=>{
        res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(JSON.stringify({error:error.message}));
      });return;
    }
    if(req.method!=='GET'){originalHandler(req,res);return;}
    if(path==='/fixture/new'){
      const author=context.auth.createAuthor({authorName:`Glow Author ${Date.now()}`,
        trialEndsAt:'2026-11-03T08:00:00.000Z'});
      const invite=context.auth.issueInvite(author.id);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({inviteToken:invite.inviteToken,invitationID:invite.invitationID}));return;
    }
    const item=path==='/'?[page,'text/html; charset=utf-8']:
      path==='/fixture.js'?[bundle,'text/javascript; charset=utf-8']:
      path==='/processing-worker.js'?[worker,'text/javascript; charset=utf-8']:
      path==='/editorial-editor.css'?[css,'text/css; charset=utf-8']:null;
    if(!item){originalHandler(req,res);return;}
    res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store'});res.end(item[0]);
  });
  server.listen(port,'127.0.0.1',()=>{void (async()=>{
    const login=await fetch(`${origin}/trial/login`,{method:'POST',headers:{
      'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:adminInvite.inviteToken})});
    assert.equal(login.status,200,'separate admin signs in through real Trial route');
    adminCookie=login.headers.get('set-cookie')?.split(';')[0]??'';
    assert.ok(adminCookie,'separate admin receives a Trial cookie');
    const otherLogin=await fetch(`${origin}/trial/login`,{method:'POST',headers:{
      'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:otherInvite.inviteToken})});
    assert.equal(otherLogin.status,200,'other author signs in through real Trial route');
    otherCookie=otherLogin.headers.get('set-cookie')?.split(';')[0]??'';
    assert.ok(otherCookie,'other author receives a separate Trial cookie');
    console.log(`SUITE_GLOW_AUTHOR_TRIAL_BROWSER_PROBE ${origin}/?view=author`);
  })().catch(error=>{console.error(error);process.exitCode=1;void close();});});
  const close=async()=>{
    await new Promise(resolve=>server.close(resolve));
    const target=resolve(dataDir),base=resolve(tmpdir())+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)?.startsWith('suite-glow-author-browser-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});
  };
  process.once('SIGINT',()=>{void close();});
  process.once('SIGTERM',()=>{void close();});
}else{
  test('GLOW-AUTHOR-TRIAL-BROWSER-BUNDLE: real Author UI/Trial HTTP/Worker fixture builds',async()=>{
    const code=await fixtureBundle();
    assert.ok(code.length>100_000);
    const source=new TextDecoder().decode(code);
    assert.match(source,/GLOW-AUTHOR-TRIAL-BROWSER-PASS/);
    assert.match(source,/trial-capture-global/);
    assert.match(source,/SYNTHETIC_NON_RAW_GLOW_AUTHOR_ORIGINAL/);
    assert.match(source,/fixture\/admin-review/);
  });
}
