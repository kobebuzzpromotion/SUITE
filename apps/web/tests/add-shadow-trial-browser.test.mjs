import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as requestHTTP} from 'node:http';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const fixture=resolve(here,'fixtures/add-shadow-trial-browser-fixture.mjs');
const worker=resolve(here,'../src/processing/worker.mjs');
const port=61906;
async function bundle(entryPoint,format){
  const result=await build({entryPoints:[entryPoint],bundle:true,format,
    platform:'browser',target:'es2022',external:['module'],write:false,
    logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}
const send=(response,status,body,type='text/plain; charset=utf-8')=>{
  response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'self' blob:; script-src 'self'; worker-src 'self' blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:",
    'X-Content-Type-Options':'nosniff'});
  response.end(body);
};
function proxy(request,response,upstreamPort){
  const headers={...request.headers,host:`127.0.0.1:${upstreamPort}`};
  if(headers.origin)headers.origin=`http://127.0.0.1:${upstreamPort}`;
  const upstream=requestHTTP({hostname:'127.0.0.1',port:upstreamPort,
    method:request.method,path:request.url,headers},from=>{
    response.writeHead(from.statusCode||502,from.headers);from.pipe(response);
  });
  upstream.on('error',()=>{if(!response.headersSent)send(response,502,'PROXY_FAILED');
    else response.destroy();});
  request.pipe(upstream);
}
async function serve(){
  const base=resolve('.runtime');
  await mkdir(base,{recursive:true});
  const temp=await mkdtemp(join(base,'suite-shadow-trial-chrome-'));
  const trial=await createTrialServer({dataDir:temp,port:0,
    clock:()=>Date.parse('2026-10-03T08:00:00.000Z')});
  await new Promise((done,reject)=>{trial.server.once('error',reject);
    trial.server.listen(0,'127.0.0.1',done);});
  const trialPort=trial.server.address().port;
  const author=trial.auth.createAuthor({authorName:'Browser Shadow Owner',
    trialEndsAt:'2026-11-03T08:00:00.000Z'});
  const invite=trial.auth.issueInvite(author.id).inviteToken;
  const fixtureJS=await bundle(fixture,'iife');
  const workerJS=await bundle(worker,'iife');
  const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>Add Shadow Trial browser probe</title><button id="probe-run" type="button">実TrialとBrowser Workerを検証</button><pre id="probe-verdict">NOT_RUN</pre><script id="probe-config" type="application/json">${JSON.stringify({invite})}</script><script src="/fixture.js" defer></script></html>`;
  const server=createServer((request,response)=>{
    if(request.headers.host!==`127.0.0.1:${port}`){send(response,403,'HOST_REJECTED');return;}
    const path=new URL(request.url||'/',`http://127.0.0.1:${port}`).pathname;
    if(path.startsWith('/trial/')||path.startsWith('/v1/')){
      proxy(request,response,trialPort);return;
    }
    if(path==='/__revoke'&&request.method==='POST'){
      trial.auth.revokeAuthor(author.id);send(response,200,'REVOKED');return;
    }
    if(request.method!=='GET'){send(response,405,'METHOD_NOT_ALLOWED');return;}
    if(path==='/')send(response,200,page,'text/html; charset=utf-8');
    else if(path==='/fixture.js')send(response,200,fixtureJS,'text/javascript; charset=utf-8');
    else if(path==='/processing-worker.js')send(response,200,workerJS,'text/javascript; charset=utf-8');
    else send(response,404,'NOT_FOUND');
  });
  await new Promise((done,reject)=>{server.once('error',reject);
    server.listen(port,'127.0.0.1',done);});
  console.log(`ADD_SHADOW_TRIAL_CHROME_PROBE http://127.0.0.1:${port}/`);
  let closing=false;
  async function close(){
    if(closing)return;closing=true;
    await new Promise(done=>server.close(done));
    await new Promise(done=>trial.server.close(done));
    const target=resolve(temp),prefix=resolve(base)+sep;
    if(!target.startsWith(prefix)||!target.split(sep).at(-1).startsWith('suite-shadow-trial-chrome-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});
  }
  process.once('SIGINT',()=>{void close().then(()=>process.exit(0));});
  process.once('SIGTERM',()=>{void close().then(()=>process.exit(0));});
}
if(process.argv.includes('--serve'))await serve();
else test('SHADOW-TRIAL-CHROME-BUNDLE: real Trial/Session/Worker probe bundles without a fake decoder',async()=>{
  const fixtureJS=await bundle(fixture,'iife');
  const workerJS=await bundle(worker,'iife');
  const fixtureText=new TextDecoder().decode(fixtureJS);
  assert.ok(fixtureJS.length>10_000&&workerJS.length>10_000);
  assert.match(fixtureText,/ADD_SHADOW_TRIAL_CHROME_PASS/);
  assert.match(fixtureText,/readTrialAddShadowTarget/);
  assert.match(fixtureText,/NOT_CAMERA_RAW/);
});
