import {createServer} from 'node:http';
import {mkdirSync,createReadStream,statSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {InviteAuth} from './invite-auth.mjs';
import {AuthorStore,portableParameters} from './author-store.mjs';
import {AssetRepository} from '../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../dist/apps/backend/src/storage.js';
import {suiteServer} from '../../dist/apps/backend/src/server.js';
const reply=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body));};
async function json(req){let length=0;const chunks=[];for await(const c of req){length+=c.length;if(length>256*1024)throw Error('PAYLOAD_TOO_LARGE');chunks.push(c);}const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_BODY');return value;}
const cookieToken=req=>req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('suite_trial='))?.slice(12);
/** Loopback invited-trial integration, not production authentication or Cloud deployment. */
export async function createTrialServer({dataDir=resolve('.runtime/web-trial'),port=8791,clock=Date.now}={}){
  mkdirSync(dataDir,{recursive:true});const auth=new InviteAuth(join(dataDir,'auth.sqlite'),{clock}),repo=new AssetRepository(join(dataDir,'suite.sqlite')),storage=new LocalObjectStorage(join(dataDir,'objects'));
  const authors=new AuthorStore(join(dataDir,'author.sqlite'),{clock:()=>new Date(clock()).toISOString(),verifySource:(actor,source)=>{
    const asset=repo.get(actor.tenantId,source.assetID),saved=repo.latestRecipe(actor.tenantId,asset.id);
    if(!asset.cloudSafe||!saved||saved.revision!==source.recipeRevision||JSON.stringify(portableParameters(saved.body))!==JSON.stringify(source.parameters))throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  const backend=suiteServer(repo,storage,async header=>{const p=auth.resolveSession(header?.replace(/^Bearer /,''));return {subject:p.id,tenantId:p.tenantId};}),delegate=backend.listeners('request')[0],webroot=resolve('dist/web');
  const server=createServer(async(req,res)=>{
    const activePort=server.address()?.port||port,allowed=['http://127.0.0.1:'+activePort,'http://localhost:'+activePort];
    if(!allowed.map(o=>new URL(o).host).includes(req.headers.host)||req.headers.origin&&!allowed.includes(req.headers.origin)){reply(res,403,{error:'LOOPBACK_ORIGIN_REQUIRED'});return;}
    const url=new URL(req.url||'/','http://127.0.0.1');
    try{
      if(url.pathname.startsWith('/trial/')||url.pathname.startsWith('/v1/')){
        if(req.headers['x-suite-trial']!=='1')return reply(res,403,{error:'TRIAL_REQUEST_REQUIRED'});
        if(url.pathname==='/trial/session'&&req.method==='GET'){let principal=null,endedReason=null;try{principal=auth.resolveSession(cookieToken(req));}catch(e){if(['TRIAL_EXPIRED','TRIAL_REVOKED','TRIAL_END_NOT_CONFIGURED'].includes(e.message))endedReason=e.message;}return reply(res,200,{mode:'INVITED_LOCAL_TRIAL',principal,endedReason,personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'});}
        if(url.pathname==='/trial/login'&&req.method==='POST'){const b=await json(req);if(Object.keys(b).join(',')!=='inviteToken')throw Error('INVALID_LOGIN');const signed=auth.redeem(b.inviteToken);return reply(res,200,{principal:signed.principal},{'Set-Cookie':'suite_trial='+signed.sessionToken+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800'});}
        let actor;try{actor=auth.resolveSession(cookieToken(req));}catch(e){return reply(res,['TRIAL_EXPIRED','TRIAL_REVOKED','TRIAL_END_NOT_CONFIGURED'].includes(e.message)?403:401,{error:e.message});}
        if(url.pathname==='/trial/authorize'&&req.method==='POST'){const b=await json(req);if(Object.keys(b).sort().join(',')!=='action,assetID'||!['edit','export','submit'].includes(b.action))throw Error('INVALID_PERMISSION_REQUEST');repo.get(actor.tenantId,b.assetID);return reply(res,200,{authorized:true,trialEndsAt:actor.trialEndsAt});}
        if(url.pathname==='/trial/members'&&req.method==='GET'){authors.admin(actor);return reply(res,200,{members:auth.listInvitations()});}
        const member=/^\/trial\/members\/([a-f0-9-]{36})(\/revoke)?$/.exec(url.pathname);
        if(member&&req.method==='POST'){authors.admin(actor);const b=await json(req);if(member[2]){if(Object.keys(b).length)throw Error('INVALID_FIELDS');auth.revokeInvite(member[1]);}else{if(Object.keys(b).join(',')!=='trialEndsAt')throw Error('INVALID_FIELDS');auth.setInviteTrialEnd(member[1],b.trialEndsAt);}return reply(res,200,{member:auth.listInvitations().find(m=>m.id===member[1])});}
        if(url.pathname==='/trial/logout'&&req.method==='POST'){auth.logout(cookieToken(req));return reply(res,200,{loggedOut:true},{'Set-Cookie':'suite_trial=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});}
        if(url.pathname.startsWith('/v1/')){req.headers.authorization='Bearer '+cookieToken(req);return delegate(req,res);}
        if(url.pathname==='/trial/drafts'&&req.method==='GET')return reply(res,200,{drafts:authors.listDrafts(actor)});
        if(url.pathname==='/trial/presets'&&req.method==='GET')return reply(res,200,{presets:authors.listPresets(actor)});
        if(url.pathname==='/trial/submissions'&&req.method==='GET')return reply(res,200,{submissions:authors.listSubmitted(actor).filter(s=>s.status==='SUBMITTED')});
        const m=/^\/trial\/drafts\/([a-f0-9-]{36})(?:\/(submit|review))?$/.exec(url.pathname);
        if(url.pathname==='/trial/drafts'&&req.method==='POST'||m&&req.method==='PUT'&&!m[2]){
          const b=await json(req),asset=repo.get(actor.tenantId,b.assetID),verified=await storage.inspect(asset.originalKey);
          if(!verified.persisted||verified.sha256!==asset.sha256||verified.size!==asset.size){repo.invalidateVerification(actor.tenantId,asset.id);throw Error('SOURCE_ORIGINAL_UNAVAILABLE');}
          return reply(res,req.method==='POST'?201:200,req.method==='POST'?authors.createDraft(actor,b):authors.saveDraft(actor,m[1],b));
        }
        if(m&&m[2]==='submit'&&req.method==='POST'){
          const b=await json(req);if(Object.keys(b).join(',')!=='expectedRevision')throw Error('INVALID_SUBMIT');const draft=authors.getDraft(actor,m[1]),asset=repo.get(actor.tenantId,draft.source.assetID),verified=await storage.inspect(asset.originalKey);
          if(!verified.persisted||verified.sha256!==asset.sha256||verified.size!==asset.size){repo.invalidateVerification(actor.tenantId,asset.id);throw Error('SOURCE_ORIGINAL_UNAVAILABLE');}
          return reply(res,200,authors.submitDraft(actor,m[1],b.expectedRevision));
        }
        if(m&&m[2]==='review'&&req.method==='POST'){const b=await json(req);if(Object.keys(b).sort().join(',')!=='decision,expectedRevision')throw Error('INVALID_REVIEW');return reply(res,200,authors.reviewDraft(actor,m[1],b.expectedRevision,b.decision));}
        if(m&&!m[2]&&req.method==='GET')return reply(res,200,authors.getDraft(actor,m[1]));
        return reply(res,404,{error:'NOT_FOUND'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return reply(res,405,{error:'METHOD_NOT_ALLOWED'});
      // Static UI has no automatic QA login. Session and ownership remain server decisions.
      const file=resolve(webroot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!file.startsWith(webroot+'\\')&&!file.startsWith(webroot+'/')||!statSync(file).isFile())return reply(res,404,{error:'NOT_FOUND'});
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.task':'application/octet-stream'};
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
    }catch(error){if(res.headersSent)return res.destroy();const e=error.message,status=e==='NOT_FOUND'?404:['FORBIDDEN','SELF_APPROVAL_FORBIDDEN','TRIAL_EXPIRED','TRIAL_REVOKED','TRIAL_END_NOT_CONFIGURED'].includes(e)?403:/CONFLICT|ALREADY/.test(e)?409:/UNAUTHORIZED|INVITE/.test(e)?401:/INVALID|CORRUPT|NON_PORTABLE|PHOTO_LOCAL|UNSUPPORTED|SOURCE_/.test(e)?400:503;reply(res,status,{error:status===503?'OPERATION_UNAVAILABLE':e});}
  });
  server.once('close',()=>{authors.close();auth.close();repo.close();backend.close();});return {server,auth,repo,storage,authors};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const port=Number(process.env.SUITE_TRIAL_PORT||8791),{server}=await createTrialServer({port});server.listen(port,'127.0.0.1',()=>console.log('SUITE LOCAL INVITED TRIAL http://127.0.0.1:'+port+' — Sites/realRAW NOT_RUN; face disabled'));process.once('SIGINT',()=>server.close());}
