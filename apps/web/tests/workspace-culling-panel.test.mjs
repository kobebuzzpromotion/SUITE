import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild-wasm';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {cullingPanelGate, parseCullingTags} from '../src/workspace-culling-panel.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');

async function browserBundle() {
  const script = `import {mountWorkspaceCullingPanel} from './apps/web/src/workspace-culling-panel.mjs';
const context=await (await fetch('/fixture/context')).json();
const mode=new URLSearchParams(location.search).get('mode')??'owner';
window.delayCullingWrites=mode==='slowwrite';
const tokenProvider=async ({signal}={})=>{
  const response=await fetch('/fixture/token?mode='+encodeURIComponent(mode),{signal});
  if(!response.ok)throw Error('TEST_TOKEN_UNAVAILABLE');
  return response.text();
};
const fetchImpl=(url,init)=>{
  if(window.delayCullingWrites&&init.method==='PUT')return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>fetch(url,init).then(resolve,reject),500);
    init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));},{once:true});
  });
  return fetch(url,init);
};
window.cullingPanel=mountWorkspaceCullingPanel({container:document.querySelector('#app'),
  baseURL:location.origin,tokenProvider,fetchImpl,...context});
document.querySelector('#force-conflict').addEventListener('click',async()=>{
  const response=await fetch('/fixture/conflict');
  document.querySelector('#force-result').textContent=String(response.status);
});`;
  const built = await build({stdin: {contents: script, resolveDir: repo, sourcefile: 'workspace-culling-panel-probe.mjs'},
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent'});
  return built.outputFiles[0].contents;
}

if (!process.argv.includes('--serve')) {
test('CULLING-PANEL01: strict line-separated tags and Project/Asset gate reject unsafe or unverified state', () => {
  assert.deepEqual(parseCullingTags('portrait\nselected'), ['portrait', 'selected']);
  assert.deepEqual(parseCullingTags(''), []);
  for (const value of ['same\nsame', ' leading', 'a\ntrailing ', 'bad\rword', Array(33).fill('tag').join('\n')])
    assert.throws(() => parseCullingTags(value), /CULLING_PANEL_TAGS_INVALID/);
  const assetId = '11111111-1111-4111-8111-111111111111';
  const ready = {phase: 'ready', version: 2, assetId, mark: {assetId}};
  assert.equal(cullingPanelGate(ready), null);
  assert.equal(cullingPanelGate({...ready, mark: {assetId: '22222222-2222-4222-8222-222222222222'}}),
    'CULLING_PANEL_IDENTITY_INVALID');
  assert.equal(cullingPanelGate({...ready, phase: 'conflict'}), 'CULLING_PANEL_REFRESH_REQUIRED');
  assert.equal(cullingPanelGate({...ready, phase: 'denied'}), 'CULLING_PANEL_ACCESS_DENIED');
  assert.equal(cullingPanelGate({...ready, phase: 'uncertain'}), 'CULLING_PANEL_RESULT_UNVERIFIED');
});

test('CULLING-PANEL02: real Workspace client and accessible responsive panel bundle without Trial/Cloud fallback', async () => {
  const code = new TextDecoder().decode(await browserBundle());
  assert.match(code, /WorkspaceCullingClient/);
  assert.match(code, /Project version/);
  assert.match(code, /max-width:600px/);
  assert.match(code, /focus-visible/);
  assert.match(code, /tokenProvider/);
  assert.match(code, /CULLING_PANEL_RESULT_UNVERIFIED/);
});
}

if (process.argv.includes('--serve')) {
  const root = await mkdtemp(join(tmpdir(), 'suite-culling-panel-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);jwk.kid = 'culling-panel';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const workspaceHTTP = new WorkspaceHTTP(root, assets, storage);
  const owner = {userId: 'owner'};
  const workspace = workspaceHTTP.workspaces.createWorkspace(owner, 'Culling Panel Studio');
  const project = workspaceHTTP.workspaces.createProject(owner, workspace.id, 'Culling Panel Project');
  const original = Buffer.from('culling-panel-synthetic-non-RAW');
  const asset = assets.create(workspace.id, {name: 'image.bin', sha256: createHash('sha256').update(original).digest('hex'), size: original.length});
  workspaceHTTP.workspaces.registerAsset(owner, workspace.id, project.id, asset.id);
  const server = suiteServer(assets, storage, authenticate, workspaceHTTP);
  const apiHandler = server.listeners('request')[0];server.removeListener('request', apiHandler);
  const bundle = await browserBundle();
  const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SUITE Culling Panel NON-RAW Probe</title><button id="force-conflict">別操作でProject版を進める</button><span id="force-result"></span><main id="app"></main><script type="module" src="/fixture.js"></script></html>`;
  const send = (res, status, body, mime = 'application/json') => {
    res.writeHead(status, {'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    res.end(body);
  };
  server.on('request', (req, res) => {
    const host = req.headers.host;
    if (!host || !/^127\.0\.0\.1:\d+$/u.test(host)) {apiHandler(req, res);return;}
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page, 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/fixture.js') return send(res, 200, bundle, 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/fixture/context')
      return send(res, 200, JSON.stringify({workspaceId: workspace.id, projectId: project.id, assetId: asset.id}));
    if (req.method === 'GET' && url.pathname === '/fixture/conflict') {
      const baseVersion = workspaceHTTP.workspaces.getCullingVersion(owner, workspace.id, project.id);
      workspaceHTTP.workspaces.createCullingSegment(owner, workspace.id, project.id,
        {baseVersion, id: `other-${baseVersion}`, name: 'Other writer'});
      return send(res, 200, JSON.stringify({version: baseVersion + 1}));
    }
    if (req.method === 'GET' && url.pathname === '/fixture/token') {
      const mode = url.searchParams.get('mode');
      if (mode === 'bad') return send(res, 200, 'bad.jwt.token', 'text/plain');
      const user = mode === 'intruder' ? 'intruder' : 'owner';
      void new SignJWT({tenant_id: 'personal', email: `${user}@example.test`, email_verified: true})
        .setProtectedHeader({alg: 'RS256', kid: 'culling-panel'}).setIssuer('https://issuer.example')
        .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey)
        .then(token => send(res, 200, token, 'text/plain'));
      return;
    }
    apiHandler(req, res);
  });
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    console.log(`SUITE_CULLING_PANEL_PROBE http://127.0.0.1:${address.port}/`);
  });
  const close = async () => {
    await new Promise(resolve => server.close(resolve));
    workspaceHTTP.close();assets.close();await rm(root, {recursive: true, force: true});
  };
  process.once('SIGINT', () => {void close();});
  process.once('SIGTERM', () => {void close();});
}
