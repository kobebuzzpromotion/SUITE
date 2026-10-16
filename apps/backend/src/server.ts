import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {mkdirSync, readFileSync, statSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {configuredAuthenticator, type Authenticator} from './auth.js';
import {AssetRepository} from './repository.js';
import {LocalObjectStorage, type StorageProvider} from './storage.js';
import {originalIntents, type PhotoIntent} from './photo-policy.js';
import {WorkspaceHTTP} from './workspace-server.js';
import {GenerationHTTP, type GenerationServerConfiguration} from './generation-server.js';
async function json(request: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {size += chunk.length; if (size > 512 * 1024) throw new Error('PAYLOAD_TOO_LARGE'); chunks.push(chunk);}
  const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('INVALID_BODY');
  return result as Record<string, any>;
}
function reply(res: ServerResponse, code: number, data: unknown) {
  res.writeHead(code, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  res.end(JSON.stringify(data));
}
export function suiteServer(repo: AssetRepository, storage: StorageProvider, authenticate: Authenticator, workspace?: WorkspaceHTTP, generation?: GenerationHTTP) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') {reply(res, 200, {status: 'ok', scope: 'local-backend-skeleton', productionReady: false}); return;}
      let principal;
      try {principal = await authenticate(req.headers.authorization);} catch (error) {
        reply(res, (error as Error).message === 'AUTH_NOT_CONFIGURED' ? 503 : 401, {error: (error as Error).message === 'AUTH_NOT_CONFIGURED' ? 'AUTH_NOT_CONFIGURED' : 'UNAUTHORIZED'}); return;
      }
      const {tenantId, subject} = principal;
      if (url.pathname.startsWith('/v1/generation/')) {
        if (workspace?.isManagedTenant(tenantId)) {reply(res,403,{error:'GENERATION_WORKSPACE_POLICY_REQUIRED'});return;}
        if (!generation) {reply(res,503,{error:'GENERATION_NOT_CONFIGURED'});return;}
        if (await generation.handle(req,res,url,principal)) return;
      }
      if(workspace && await workspace.handle(req,res,url,principal))return;
      // A managed Workspace must never bypass live membership/role checks through the legacy personal route.
      if(workspace?.isManagedTenant(tenantId) && /^\/v1\/assets(?:\/|$)/.test(url.pathname)){reply(res,403,{error:'WORKSPACE_ROUTE_REQUIRED'});return;}
      if (url.pathname === '/v1/assets' && req.method === 'GET') {reply(res, 200, {assets: repo.list(tenantId)}); return;}
      if (url.pathname === '/v1/assets' && req.method === 'POST') {
        const b = await json(req); reply(res, 201, repo.create(tenantId, {name: b.name, sha256: b.sha256, size: b.size})); return;
      }
      const match = /^\/v1\/assets\/([a-f0-9-]{36})\/(original|recipe\/history|recipe|trash|restore)$/.exec(url.pathname);
      if (!match) {reply(res, 404, {error: 'NOT_FOUND'}); return;}
      const id = match[1]!, action = match[2]!;
      if (action === 'restore' && req.method === 'POST') {repo.restore(tenantId, id); reply(res, 200, {restored: true}); return;}
      const asset = repo.get(tenantId, id);
      if (action === 'original' && req.method === 'PUT') {
        // Only server-observed hash/persistence can cause a DB commit; no client "synced" flag.
        const evidence = await storage.putImmutable(asset.originalKey, req, {sha256: asset.sha256, size: asset.size});
        reply(res, 200, repo.markVerified(tenantId, id, evidence)); return;
      }
      if (action === 'original' && req.method === 'GET') {
        if (!originalIntents.includes(url.searchParams.get('purpose') as PhotoIntent)) {reply(res, 409, {error: 'ORIGINAL_REQUIRES_EXPLICIT_PROCESSING_INTENT'}); return;}
        if (!asset.cloudSafe) {reply(res, 409, {error: 'WAITING_FOR_ORIGINAL', message: 'Original取得待ち'}); return;}
        try {
          const verified = await storage.inspect(asset.originalKey);
          if (!verified.persisted || verified.sha256 !== asset.sha256 || verified.size !== asset.size) throw new Error('VERIFICATION_FAILED');
        } catch {
          repo.invalidateVerification(tenantId, id);
          reply(res, 503, {error: 'WAITING_FOR_ORIGINAL', message: 'Original取得待ち'}); return;
        }
        res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': asset.size, 'Cache-Control': 'no-store'});
        await pipeline(Readable.from(storage.read(asset.originalKey)), res); return;
      }
      if (action === 'recipe/history' && req.method === 'GET') {reply(res, 200, {history: repo.listRecipeHistory(tenantId, id)}); return;}
      if (action === 'recipe' && req.method === 'GET') {reply(res, 200, {recipe: repo.latestRecipe(tenantId, id)}); return;}
      if (action === 'recipe' && req.method === 'PUT') {const b = await json(req); reply(res, 200, repo.saveRecipe(tenantId, id, subject, b.expectedRevision, b.recipe)); return;}
      if (action === 'trash' && req.method === 'POST') {repo.trash(tenantId, id); reply(res, 200, {trashed: true, physicallyDeleted: false}); return;}
      reply(res, 405, {error: 'METHOD_NOT_ALLOWED'});
    } catch (error) {
      if (res.headersSent) {res.destroy(); return;}
      const message = (error as Error).message;
      const status = message === 'NOT_FOUND' ? 404 : message === 'REVISION_CONFLICT' || message === 'IMMUTABLE_OBJECT' || message === 'RECIPE_HISTORY_LIMIT' ? 409 : /^(INVALID|CHECKSUM|SIZE|PAYLOAD)/.test(message) || error instanceof SyntaxError ? 400 : 503;
      reply(res, status, {error: status === 503 ? 'OPERATION_UNAVAILABLE' : message, ...(status === 503 ? {message: '処理を完了できません。原本と編集内容は削除しません。'} : {})});
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const data = resolve(process.env.SUITE_DATA_DIR ?? '.runtime');
  mkdirSync(data, {recursive: true});
  const repo = new AssetRepository(join(data, 'suite.sqlite'));
  const storage = new LocalObjectStorage(join(data, 'objects'));
  const workspace = new WorkspaceHTTP(data,repo,storage);
  // No shipped model, tariff or credential defaults. Installing configuration
  // enables the route; it does not grant credits or send any request on startup.
  let generation: GenerationHTTP | undefined;
  if (process.env.SUITE_GENERATION_CONFIG) {
    const path = resolve(process.env.SUITE_GENERATION_CONFIG);
    const info = statSync(path);
    if (!info.isFile() || info.size > 256 * 1024) throw new Error('INVALID_GENERATION_CONFIG');
    const configuration = JSON.parse(readFileSync(path,'utf8')) as GenerationServerConfiguration;
    generation = new GenerationHTTP(join(data,'generation.sqlite'),repo,configuration,process.env.OPENAI_API_KEY);
  }
  const server = suiteServer(repo, storage, configuredAuthenticator(process.env),workspace,generation);
  server.listen(Number(process.env.PORT ?? 8787), '127.0.0.1', () => console.log('SUITE local backend on 127.0.0.1; production deployment not configured.'));
  process.once('SIGINT', () => server.close(() => {generation?.close();workspace.close();repo.close(); process.exit(0);}));
}
