import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer,request as httpRequest} from 'node:http';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {neutralRecipe} from '../src/session.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const entry=resolve(here,'fixtures/batch-final-trial-browser-fixture.mjs');
const port=61846;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const page=`<!doctype html><html lang="ja"><meta charset="utf-8">
<title>SUITE Trial Batch Naming Browser Probe</title>
<link rel="stylesheet" href="/editorial-editor.css">
<h1>SUITE Trial Batch Naming · real local Trial HTTP/SQLite · synthetic NON-RAW</h1>
<button id="probe-run" type="button">このケースを検証</button>
<pre id="probe-verdict" aria-label="検証判定">STARTING</pre>
<pre id="probe-report" aria-label="検証結果">STARTING</pre><main id="app"></main>
<script type="module" src="/fixture.js"></script></html>`;

async function fixtureBundle(){
  const built=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(built.outputFiles.length,1);
  return built.outputFiles[0].contents;
}
const json=(res,status,body,headers={})=>{
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});
  res.end(JSON.stringify(body));
};
const cookieValue=req=>req.headers.cookie?.split(';').map(part=>part.trim())
  .find(part=>part.startsWith('suite_trial='));

async function serve(){
  const runtimeRoot=resolve(root,'.runtime');
  await mkdir(runtimeRoot,{recursive:true});
  const dataDir=await mkdtemp(join(runtimeRoot,'suite-naming-trial-browser-'));
  const trial=await createTrialServer({dataDir,port:0,clock:Date.now});
  await new Promise((done,reject)=>{
    trial.server.once('error',reject);
    trial.server.listen(0,'127.0.0.1',done);
  });
  const trialPort=trial.server.address().port;
  const trialBase=`http://127.0.0.1:${trialPort}`;
  const bundle=await fixtureBundle();
  const worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
  const css=await readFile(resolve(root,'apps/web/src/editorial-editor.css'));
  const live=new Map();
  async function start(req,res){
    const deadline=new Date(Date.now()+7*86400000).toISOString();
    const author=trial.auth.createAuthor({authorName:'Synthetic Trial Browser Owner',
      trialEndsAt:deadline});
    const invite=trial.auth.issueInvite(author.id);
    const response=await fetch(trialBase+'/trial/login',{method:'POST',
      headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:invite.inviteToken})});
    if(!response.ok)throw Error('TRIAL_BROWSER_LOGIN_FAILED');
    const cookie=response.headers.get('set-cookie')?.split(';')[0];
    if(!cookie?.startsWith('suite_trial='))throw Error('TRIAL_BROWSER_COOKIE_MISSING');
    const client=new TrialClient({baseURL:trialBase,fetcher:(url,init)=>fetch(url,
      {...init,headers:{...init.headers,Cookie:cookie}})});
    const records=[];
    for(const label of ['first','second']){
      const original=new TextEncoder().encode(`SYNTHETIC_NON_RAW_TRIAL_${label}`);
      const created=await client.createAsset({name:`${label}.NONRAW`,
        sha256:hash(original),size:original.byteLength});
      const asset=await client.putOriginal(created.id,original.buffer.slice(0));
      const saved=await client.saveRecipe(asset.id,0,neutralRecipe());
      assert.equal(saved.revision,1);
      records.push({asset,saved});
    }
    live.set(cookie,{inviteID:invite.invitationID,records});
    json(res,200,{records,principal:(await response.json()).principal},
      {'Set-Cookie':response.headers.get('set-cookie')});
  }
  async function mutate(req,res,kind){
    if(req.headers['x-suite-browser-probe']!=='1')return json(res,403,{error:'PROBE_REQUIRED'});
    const current=live.get(cookieValue(req));
    if(!current)return json(res,403,{error:'PROBE_SESSION_REQUIRED'});
    if(kind==='revoke'){
      trial.auth.revokeInvite(current.inviteID);
    }else{
      const asset=current.records[0].asset;
      const base=resolve(dataDir,'objects')+sep;
      const path=resolve(dataDir,'objects',asset.originalKey);
      if(!path.startsWith(base))throw Error('PROBE_OBJECT_PATH_INVALID');
      await writeFile(path,new Uint8Array(asset.size).fill(0x58));
    }
    json(res,200,{changed:true});
  }
  const server=createServer((req,res)=>{
    void(async()=>{
      const allowed=`127.0.0.1:${port}`,origin=`http://${allowed}`;
      if(req.headers.host!==allowed||
          (req.headers.origin&&req.headers.origin!==origin))
        return json(res,403,{error:'PROBE_ORIGIN_REQUIRED'});
      const pathname=new URL(req.url??'/',origin).pathname;
      if(pathname==='/__fixture/start'&&req.method==='POST')return start(req,res);
      if(pathname==='/__fixture/tamper'&&req.method==='POST')return mutate(req,res,'tamper');
      if(pathname==='/__fixture/revoke'&&req.method==='POST')return mutate(req,res,'revoke');
      if(pathname.startsWith('/trial/')||pathname.startsWith('/v1/')){
        const headers={...req.headers,host:`127.0.0.1:${trialPort}`};
        if(headers.origin)headers.origin=trialBase;
        const upstream=httpRequest({hostname:'127.0.0.1',port:trialPort,
          path:req.url,method:req.method,headers},from=>{
          res.writeHead(from.statusCode??502,from.headers);from.pipe(res);
        });
        upstream.on('error',()=>{if(!res.headersSent)json(res,502,{error:'PROBE_UPSTREAM_FAILED'});});
        req.pipe(upstream);return;
      }
      if(req.method!=='GET')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
      const item=pathname==='/'?[page,'text/html; charset=utf-8']:
        pathname==='/fixture.js'?[bundle,'text/javascript; charset=utf-8']:
        pathname==='/processing-worker.js'?[worker,'text/javascript; charset=utf-8']:
        pathname==='/editorial-editor.css'?[css,'text/css; charset=utf-8']:null;
      if(!item)return json(res,404,{error:'NOT_FOUND'});
      res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store'});
      res.end(item[0]);
    })().catch(()=>{if(!res.headersSent)json(res,500,{error:'PROBE_FAILED'});});
  });
  await new Promise((done,reject)=>{
    server.once('error',reject);server.listen(port,'127.0.0.1',done);
  });
  console.log(`SUITE_TRIAL_BATCH_NAMING_BROWSER_PROBE http://127.0.0.1:${port}/`);
  let closing=false;
  async function close(){
    if(closing)return;closing=true;
    await new Promise(done=>server.close(done));
    await new Promise(done=>trial.server.close(done));
    const target=resolve(dataDir),base=runtimeRoot+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)
        .startsWith('suite-naming-trial-browser-'))
      throw Error('PROBE_CLEANUP_TARGET_INVALID');
    await rm(target,{recursive:true,force:true});
  }
  process.once('SIGINT',()=>{void close().finally(()=>process.exit(0));});
  process.once('SIGTERM',()=>{void close().finally(()=>process.exit(0));});
}

if(process.argv.includes('--serve'))await serve();
else test('BATCH-NAMING-TRIAL-BROWSER-BUNDLE: real Trial routes and product Editor/Session/Worker are bundled without substitution',async()=>{
  const code=await fixtureBundle(),text=new TextDecoder().decode(code);
  assert.ok(code.length>100_000);
  assert.match(text,/TRIAL_BROWSER_NAMING_PASS/);
  assert.match(text,/TrialClient/);
  assert.match(text,/EXPORT_BATCH_RESULT_INCOMPLETE/);
  assert.match(text,/custom-count/);
  assert.match(text,/custom-sequence/);
});
