import {createServer} from 'node:http';
import {createReadStream,mkdirSync,statSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {AssetRepository} from '../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../dist/apps/backend/src/storage.js';
import {suiteServer} from '../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../dist/apps/backend/src/auth.js';

/** Loopback QA only. Never expose this automatic QA session as invited-user authentication. */
export async function createLocalWebServer({dataDir=resolve('.runtime/web-local'),port=8790}={}){
  mkdirSync(dataDir,{recursive:true});const repo=new AssetRepository(join(dataDir,'suite.sqlite')),storage=new LocalObjectStorage(join(dataDir,'objects'));
  const {privateKey,publicKey}=await generateKeyPair('ES256'),jwk=await exportJWK(publicKey);jwk.kid='local-qa-only';
  const auth=jwtAuthenticator({issuer:'https://suite.invalid/local-qa',audience:'suite-loopback-qa',jwks:createLocalJWKSet({keys:[jwk]})});
  const token=await new SignJWT({tenant_id:'local-qa',scope:'QA_ONLY'}).setProtectedHeader({alg:'ES256',kid:jwk.kid}).setSubject('local-qa-operator').setIssuer('https://suite.invalid/local-qa').setAudience('suite-loopback-qa').setIssuedAt().setExpirationTime('8h').sign(privateKey);
  const cookie=randomBytes(32).toString('hex'),backend=suiteServer(repo,storage,auth);
  const delegate=backend.listeners('request')[0];const webroot=resolve('dist/web');
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.txt':'text/plain','.task':'application/octet-stream','.map':'application/json'};
  const server=createServer(async(req,res)=>{
    const address=server.address(),activePort=address?.port||port;
    const hosts=new Set(['127.0.0.1:'+activePort,'localhost:'+activePort]);
    const origin=req.headers.origin;
    if(!hosts.has(req.headers.host||'')||(origin&&!['http://127.0.0.1:'+activePort,'http://localhost:'+activePort].includes(origin))){res.writeHead(403);res.end('LOOPBACK_ORIGIN_REQUIRED');return;}
    const url=new URL(req.url||'/','http://127.0.0.1');
    if(url.pathname==='/trial/session'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({mode:'LOCAL_QA',principal:null}));return;}
    if(url.pathname.startsWith('/v1/')){
      if(req.headers['x-suite-qa']!=='1'||!req.headers.cookie?.split(';').some(v=>v.trim()==='suite_qa='+cookie)){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'LOCAL_QA_SESSION_REQUIRED'}));return;}
      req.headers.authorization='Bearer '+token;return delegate(req,res);
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    try {
      const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=resolve(webroot,'.'+pathname);
      if(!file.startsWith(webroot+'\\')&&!file.startsWith(webroot+'/'))throw Error('INVALID_PATH');
      if(!statSync(file).isFile())throw Error('NOT_FILE');
      const headers={'Content-Type':mime[extname(file)]||'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
      if(pathname==='/index.html')headers['Set-Cookie']='suite_qa='+cookie+'; Path=/; HttpOnly; SameSite=Strict';
      res.writeHead(200,headers);if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
    }catch{res.writeHead(404);res.end('NOT_FOUND');}
  });
  server.once('close',()=>{repo.close();backend.close();});return {server,repo,storage};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=Number(process.env.SUITE_WEB_PORT||8790),{server}=await createLocalWebServer({port});
  server.listen(port,'127.0.0.1',()=>console.log('SUITE Web LOCAL QA http://127.0.0.1:'+port+' — Auth/Cloud/invite/public NOT_CONNECTED'));
  process.once('SIGINT',()=>server.close());
}
