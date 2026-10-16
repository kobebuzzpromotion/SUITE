import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const entry=resolve(here,'fixtures/glow-workspace-preset-browser-fixture.mjs');
const port=61849;
const user='glow-owner',tenant='glow-tenant';
async function bundle(){const result=await build({entryPoints:[entry],bundle:true,
  format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);return result.outputFiles[0].contents;}
const recipe=glow=>({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,
  rotationDegrees:0,extendedParameters:glow?{postDecodeAdjustments:{schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',color:{glow}}}:{},
  processingOrder:glow?['exposure','contrast','saturation','postDecodeAdjustments','rotation']:
    ['exposure','contrast','saturation','rotation']}});
const glow={mode:'halation',intensity:72,radius:9,threshold:118,exposure:34,diffusion:63,tint:-27};
const page='<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE Glow Workspace Preset Probe</title><h1>Glow Workspace Preset · JWT HTTP/SQLite · synthetic NON-RAW</h1><button id="probe-run">実ブラウザ検証</button><pre id="probe-verdict">NOT_RUN</pre><main id="app"></main><script type="module" src="/fixture.js"></script></html>';

if(process.argv.includes('--serve')){
  const directory=await mkdtemp(join(tmpdir(),'suite-glow-workspace-browser-'));
  const assets=new AssetRepository(join(directory,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(directory,'objects'));
  const workspace=new WorkspaceHTTP(directory,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='glow-workspace-browser-test';
  const authenticate=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',
    jwks:createLocalJWKSet({keys:[jwk]})});
  const server=suiteServer(assets,storage,authenticate,workspace);
  const token=(who,{expired=false}={})=>new SignJWT({tenant_id:who===user?tenant:'other-tenant',
    email:`${who}@example.test`,email_verified:true})
    .setProtectedHeader({alg:'RS256',kid:'glow-workspace-browser-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(who)
    .setIssuedAt().setExpirationTime(expired?'-1s':'5m').sign(privateKey);
  await new Promise(done=>server.listen(port,'127.0.0.1',done));
  const baseURL=`http://127.0.0.1:${port}`;
  async function request(path,method='GET',body){
    const response=await fetch(baseURL+path,{method,headers:{Authorization:`Bearer ${await token(user)}`,
      ...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    assert.ok(response.ok,`${method} ${path}: ${response.status}`);
    return response.json();
  }
  const workspaceId=(await request('/v1/workspaces','POST',{name:'Glow Studio'})).workspace.id;
  const path=`/v1/workspaces/${workspaceId}`;
  const projectId=(await request(`${path}/projects`,'POST',{name:'Synthetic'})).project.id;
  async function asset(label,body){
    const bytes=Buffer.from(`SYNTHETIC_NON_RAW_GLOW_WORKSPACE_${label}`);
    const created=(await request(`${path}/projects/${projectId}/assets`,'POST',{
      name:`${label}.nonraw`,sha256:createHash('sha256').update(bytes).digest('hex'),
      size:bytes.length})).asset;
    const saved=await request(`${path}/projects/${projectId}/assets/${created.id}/recipe`,
      'PUT',{baseVersion:0,recipe:body});
    assert.equal(saved.outcome,'saved');
    return created;
  }
  const source=await asset('source',recipe(glow));
  const personalTarget=await asset('personal-target',recipe());
  const workspaceTarget=await asset('workspace-target',recipe());
  const protectedTarget=await asset('protected-target',{...recipe(),parameters:{...recipe().parameters,exposure:1}});
  const config={workspaceId,projectId,sourceId:source.id,personalTargetId:personalTarget.id,
    workspaceTargetId:workspaceTarget.id,protectedTargetId:protectedTarget.id,
    expectedSubject:user,expectedTenantId:tenant,glow};
  const browserBundle=await bundle();
  const worker=await readFile(resolve(root,'dist/web/processing-worker.js'));
  const originalHandler=server.listeners('request')[0];server.removeListener('request',originalHandler);
  server.on('request',(req,res)=>{
    if(req.headers.host!==`127.0.0.1:${port}`||req.method!=='GET'){
      originalHandler(req,res);return;
    }
    const path=new URL(req.url??'/',baseURL).pathname;
    const send=(data,type)=>{res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data);};
    if(path==='/')return send(page,'text/html; charset=utf-8');
    if(path==='/fixture.js')return send(browserBundle,'text/javascript; charset=utf-8');
    if(path==='/processing-worker.js')return send(worker,'text/javascript; charset=utf-8');
    if(path==='/fixture/config')return send(JSON.stringify(config),'application/json');
    if(path==='/fixture/token'){
      const query=new URL(req.url??'/',baseURL).searchParams;
      const who=query.get('user')||user;
      return void token(who,{expired:query.get('expired')==='1'})
        .then(value=>send(JSON.stringify({token:value}),'application/json'));
    }
    originalHandler(req,res);
  });
  console.log(`SUITE_GLOW_WORKSPACE_PRESET_BROWSER_PROBE ${baseURL}/`);
  const close=async()=>{
    await new Promise(done=>server.close(done));workspace.close();assets.close();
    const target=resolve(directory),base=resolve(tmpdir())+sep;
    if(!target.startsWith(base)||!target.split(sep).at(-1)?.startsWith('suite-glow-workspace-browser-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target,{recursive:true,force:true});
  };
  process.once('SIGINT',()=>{void close();});process.once('SIGTERM',()=>{void close();});
}else{
  test('GLOW-WS-PRESET-BROWSER-BUNDLE: host-injected JWT/SQLite browser fixture bundles',async()=>{
    const source=new TextDecoder().decode(await bundle());
    assert.ok(source.length>50000);assert.match(source,/GLOW-WS-PRESET-BROWSER-PASS/);
    assert.match(source,/fixture\/token/);
  });
}
