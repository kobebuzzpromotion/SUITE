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
import {mountVerifiedWorkspaceCulling} from '../src/workspace-culling-verified-mount.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const fixtureScript = `import {mountVerifiedWorkspaceCulling} from './apps/web/src/workspace-culling-verified-mount.mjs';
const context=await (await fetch('/fixture/context')).json();
window.selected={workspaceId:context.workspaceId,projectId:context.projectId,assetId:context.assetId};
window.fixtureContext=context;
window.testMode='admin';
window.slowWrite=false;
window.requests=[];
const tokenProvider=async ({signal}={})=>{
  const response=await fetch('/fixture/token?mode='+encodeURIComponent(window.testMode),{signal});
  if(!response.ok)throw Error('FIXTURE_TOKEN_UNAVAILABLE');
  return response.text();
};
const fetchImpl=(url,init)=>{
  window.requests.push({url,method:init.method});
  if(window.slowWrite&&init.method==='PUT')return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>fetch(url,init).then(resolve,reject),5000);
    init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('cancelled','AbortError'));},{once:true});
  });
  return fetch(url,init);
};
window.mountVerified=async()=>{
  window.mountError=null;
  try{window.verifiedPanel=await mountVerifiedWorkspaceCulling({container:document.querySelector('#app'),
    baseURL:location.origin,tokenProvider,selectionProvider:()=>window.selected,
    workspaceId:context.workspaceId,projectId:context.projectId,assetId:context.assetId,
    expectedSubject:'admin',expectedTenantId:'personal-admin',fetchImpl});}
  catch(error){window.mountError={name:error.name,message:error.message,status:error.status??null};}
  document.querySelector('#mount-state').textContent=window.mountError?.message??window.verifiedPanel?.getState().phase??'none';
};
await window.mountVerified();
document.querySelector('#switch-asset').addEventListener('click',async()=>{
  window.selected={...window.selected,assetId:context.otherAssetId};
  document.querySelector('#scope-state').textContent=String(await window.verifiedPanel?.checkSelection());
});
document.querySelector('#viewer-role').addEventListener('click',async()=>{
  const r=await fetch('/fixture/viewer-role');document.querySelector('#role-state').textContent=String(r.status);
});
document.querySelector('#admin-role').addEventListener('click',async()=>{
  const r=await fetch('/fixture/admin-role');document.querySelector('#role-state').textContent=String(r.status);
});
document.querySelector('#slow-write').addEventListener('click',()=>{
  window.slowWrite=true;document.querySelector('#role-state').textContent='slow-write-ready';
});
document.querySelector('#revoke').addEventListener('click',async()=>{
  const r=await fetch('/fixture/revoke');document.querySelector('#role-state').textContent=String(r.status);
});`;

async function browserBundle() {
  const built = await build({stdin: {contents: fixtureScript, resolveDir: repo,
    sourcefile: 'workspace-culling-verified-mount-probe.mjs'}, bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent'});
  return built.outputFiles[0].contents;
}

if (!process.argv.includes('--serve')) {
  test('CULLING-VERIFIED01: bad scope fails before host token or DOM mount', async () => {
    let calls=0;
    await assert.rejects(mountVerifiedWorkspaceCulling({container: {replaceChildren() {}},
      baseURL: 'http://127.0.0.1:8787', tokenProvider: () => {calls++; return 'x';},
      selectionProvider: () => ({}), workspaceId: 'bad', projectId: 'bad', assetId: 'bad',
      expectedSubject: 'owner', expectedTenantId: 'personal'}), /CULLING_VERIFIED_MOUNT_CONFIG_INVALID/u);
    assert.equal(calls, 0);
  });
  test('CULLING-VERIFIED02: a changed host Asset blocks before any bearer is requested', async () => {
    const workspaceId='11111111-1111-4111-8111-111111111111';
    const projectId='22222222-2222-4222-8222-222222222222';
    const assetId='33333333-3333-4333-8333-333333333333';
    let calls=0;
    await assert.rejects(mountVerifiedWorkspaceCulling({container: {replaceChildren() {}},
      baseURL: 'http://127.0.0.1:8787', tokenProvider: () => {calls++; return 'secret';},
      selectionProvider: () => ({workspaceId, projectId, assetId: '44444444-4444-4444-8444-444444444444'}),
      workspaceId, projectId, assetId, expectedSubject: 'owner', expectedTenantId: 'personal'}),
    error => error.status === 403 && error.message === 'CULLING_HOST_SCOPE_OR_ROLE_CHANGED');
    assert.equal(calls, 0);
  });
  test('CULLING-VERIFIED03: browser bundle contains fresh Node gate and existing manual panel, never Trial/Cloud fallback', async () => {
    const code = new TextDecoder().decode(await browserBundle());
    assert.match(code, /WorkspaceSessionClient/u);
    assert.match(code, /WorkspaceCullingClient/u);
    assert.match(code, /mountWorkspaceCullingPanel/u);
    assert.match(code, /CULLING_HOST_SCOPE_OR_ROLE_CHANGED/u);
    assert.doesNotMatch(code, /TrialClient|SitesClient/u);
  });
}

if (process.argv.includes('--serve')) {
  const root = await mkdtemp(join(tmpdir(), 'suite-culling-verified-mount-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'verified-culling-probe';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const workspaceHTTP = new WorkspaceHTTP(root, assets, storage);
  const owner = {userId: 'owner'}, admin = {userId: 'admin'};
  const workspace = workspaceHTTP.workspaces.createWorkspace(owner, 'Verified Culling Studio');
  const project = workspaceHTTP.workspaces.createProject(owner, workspace.id, 'One Project');
  const original = Buffer.from('verified-culling-synthetic-non-RAW');
  const sha256 = createHash('sha256').update(original).digest('hex');
  const asset = assets.create(workspace.id, {name: 'one.bin', sha256, size: original.length});
  const other = assets.create(workspace.id, {name: 'two.bin', sha256, size: original.length});
  workspaceHTTP.workspaces.registerAsset(owner, workspace.id, project.id, asset.id);
  workspaceHTTP.workspaces.registerAsset(owner, workspace.id, project.id, other.id);
  const invitation = workspaceHTTP.workspaces.inviteMember(owner, workspace.id,
    {email: 'admin@example.test', role: 'ADMIN', expiresAt: '2099-01-01T00:00:00.000Z'});
  workspaceHTTP.workspaces.acceptInvitation(admin, workspace.id, invitation.token, 'admin@example.test');
  const server = suiteServer(assets, storage, authenticate, workspaceHTTP);
  const apiHandler = server.listeners('request')[0]; server.removeListener('request', apiHandler);
  const bundle = await browserBundle();
  const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SUITE Verified Culling NON-RAW Probe</title><button id="switch-asset">Switch Asset</button><button id="viewer-role">Downgrade Viewer</button><button id="admin-role">Restore Admin</button><button id="slow-write">Delay next write</button><button id="revoke">Revoke</button><span id="mount-state"></span><span id="scope-state"></span><span id="role-state"></span><main id="app"></main><script type="module" src="/fixture.js"></script></html>`;
  const send = (res, status, body, mime = 'application/json') => {
    res.writeHead(status, {'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    res.end(body);
  };
  server.on('request', (req, res) => {
    const host = req.headers.host;
    if (!host || !/^127\.0\.0\.1:\d+$/u.test(host)) {apiHandler(req, res); return;}
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page, 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/fixture.js') return send(res, 200, bundle, 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/fixture/context') return send(res, 200,
      JSON.stringify({workspaceId: workspace.id, projectId: project.id, assetId: asset.id, otherAssetId: other.id}));
    if (req.method === 'GET' && url.pathname === '/fixture/token') {
      const mode = url.searchParams.get('mode');
      const user = mode === 'intruder' ? 'intruder' : 'admin';
      void new SignJWT({tenant_id: `personal-${user}`, email: `${user}@example.test`, email_verified: true})
        .setProtectedHeader({alg: 'RS256', kid: 'verified-culling-probe'})
        .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
        .setIssuedAt().setExpirationTime('5m').sign(privateKey)
        .then(token => send(res, 200, token, 'text/plain'));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/fixture/viewer-role') {
      workspaceHTTP.workspaces.setMemberRole(owner, workspace.id, 'admin', 'VIEWER');
      return send(res, 200, JSON.stringify({role: 'VIEWER'}));
    }
    if (req.method === 'GET' && url.pathname === '/fixture/admin-role') {
      workspaceHTTP.workspaces.setMemberRole(owner, workspace.id, 'admin', 'ADMIN');
      return send(res, 200, JSON.stringify({role: 'ADMIN'}));
    }
    if (req.method === 'GET' && url.pathname === '/fixture/revoke') {
      workspaceHTTP.workspaces.removeMember(owner, workspace.id, 'admin');
      return send(res, 200, JSON.stringify({removed: true}));
    }
    apiHandler(req, res);
  });
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    console.log(`SUITE_VERIFIED_CULLING_PROBE http://127.0.0.1:${address.port}/`);
  });
  const close = async () => {
    await new Promise(resolve => server.close(resolve));
    workspaceHTTP.close(); assets.close(); await rm(root, {recursive: true, force: true});
  };
  process.once('SIGINT', () => {void close().finally(() => process.exit(0));});
}
