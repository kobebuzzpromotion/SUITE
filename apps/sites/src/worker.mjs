import {validateRecipe,originalIntents} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding,validatePortraitContinuity} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {portableParameters,checkParameters,checkVersion,adoptionTransition} from '../../web/preset-policy.mjs';
import {reserveAssetStatement,reserveObject,persistedObject,measureRequest} from './usage.mjs';
import {adminLogin,adminAuthenticated,requireAdmin,adminLogoutCookie} from './admin-auth.mjs';
const PART=8*1024*1024,MAX=128*1024*1024,ID=/^[a-f0-9-]{36}$/i;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const sha=async b=>hex(await crypto.subtle.digest('SHA-256',typeof b==='string'?new TextEncoder().encode(b):b));
const time=env=>env.__testNow??Date.now();
const iso=env=>new Date(time(env)).toISOString();
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const first=(env,sql,...args)=>stmt(env,sql,...args).first();
const rows=async(env,sql,...args)=>(await stmt(env,sql,...args).all()).results;
const changes=r=>Number(r.meta?.changes||0);
const exact=(v,keys)=>{if(!v||Array.isArray(v)||Object.keys(v).sort().join(',')!==keys.slice().sort().join(','))throw Error('INVALID_FIELDS');};
async function body(request,maximum=256*1024){
  if(Number(request.headers.get('Content-Length'))>maximum)throw Error('PAYLOAD_TOO_LARGE');
  const reader=request.body?.getReader(),chunks=[];let size=0;if(!reader)throw Error('INVALID_BODY');
  try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum)throw Error('PAYLOAD_TOO_LARGE');chunks.push(value);}}finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
async function payload(request){const b=JSON.parse(new TextDecoder().decode(await body(request)));if(!b||typeof b!=='object'||Array.isArray(b))throw Error('INVALID_BODY');return b;}
async function identity(request,env){
  // Headers are trusted ONLY behind Sites dispatch. No public workers.dev origin is authorized.
  if(env.SUITE_TRUST_SITES_DISPATCH!=='1')throw Error('DISPATCH_NOT_CONFIGURED');
  const user=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
  if(!user||!email)return null;
  const row=await first(env,'SELECT * FROM site_members WHERE email=?',email.toLowerCase());
  if(!row||!['author','admin'].includes(row.role)||row.user_id&&row.user_id!==user)throw Error('INVITATION_REQUIRED');
  const configuredOwner=row.role==='admin'&&user===env.SUITE_ADMIN_USER_ID;
  if(row.active!==1)throw Error('TRIAL_REVOKED');if(!configuredOwner&&!row.trial_ends_at)throw Error('TRIAL_END_NOT_CONFIGURED');if(!configuredOwner&&row.trial_ends_at<=time(env))throw Error('TRIAL_EXPIRED');if(!configuredOwner&&!row.user_id&&row.invite_expires<=time(env))throw Error('INVITATION_REQUIRED');
  if(!row.user_id){await stmt(env,'UPDATE site_members SET user_id=? WHERE id=? AND user_id IS NULL AND active=1 AND invite_expires>?',user,row.id,time(env)).run();}
  const current=await first(env,'SELECT * FROM site_members WHERE id=? AND user_id=? AND active=1',row.id,user);if(!current)throw Error('INVITATION_REQUIRED');
  return {id:current.id,authorName:current.credit_name,role:current.role,platformUserID:user,tenantId:'trial-'+current.id,trialEndsAt:configuredOwner?null:new Date(current.trial_ends_at).toISOString()};
}
async function ensureOwnerMember(env,user,email){
  if(!user||user!==env.SUITE_ADMIN_USER_ID||typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('FORBIDDEN');
  const normalized=email.toLowerCase(),existing=await first(env,'SELECT * FROM site_members WHERE email=?',normalized);
  if(existing){
    if(existing.role!=='admin'||existing.active!==1||existing.user_id&&existing.user_id!==user)throw Error('FORBIDDEN');
    if(!existing.user_id)await stmt(env,'UPDATE site_members SET user_id=? WHERE id=? AND user_id IS NULL AND role=? AND active=1',user,existing.id,'admin').run();
  }else{
    await stmt(env,'INSERT OR IGNORE INTO site_members(id,user_id,email,credit_name,role,active,invite_expires,created_at,trial_ends_at) VALUES(?,?,?,?,?,1,?,?,0)',crypto.randomUUID(),user,normalized,'SUITE 管理者','admin',0,iso(env)).run();
  }
  const bound=await first(env,'SELECT * FROM site_members WHERE email=?',normalized);
  if(!bound||bound.role!=='admin'||bound.active!==1||bound.user_id!==user)throw Error('FORBIDDEN');
}
async function asset(env,actor,id){const r=await first(env,'SELECT * FROM assets WHERE id=? AND tenant_id=? AND deleted_at IS NULL',id,actor.tenantId);if(!r)throw Error('NOT_FOUND');return {id:r.id,tenantId:r.tenant_id,name:r.name,originalKey:r.original_key,sha256:r.sha256,size:r.size,cloudSafe:r.cloud_safe===1,deletedAt:null};}
async function bound(recipe,a){validateRecipe(recipe);const p=recipe.parameters.extendedParameters.portrait;if(p)validatePortraitBinding(p,a.id,a.sha256);}
async function latest(env,actor,id){
  const a=await asset(env,actor,id),history=await rows(env,'SELECT * FROM recipes WHERE asset_id=? ORDER BY revision',id);let reference;
  for(const row of history){const recipe=JSON.parse(row.body);await bound(recipe,a);const p=recipe.parameters.extendedParameters.portrait;if(p){if(reference)validatePortraitContinuity(reference,p);else reference=p;}}
  const last=history.at(-1);return last?{revision:last.revision,editor:last.editor,updatedAt:last.updated_at,body:JSON.parse(last.body)}:null;
}
async function upload(env,actor,id){const u=await first(env,'SELECT * FROM site_uploads WHERE id=? AND author_id=?',id,actor.id);if(!u)throw Error('NOT_FOUND');const a=await asset(env,actor,u.asset_id);return {u,a};}
const uploadJSON=(u,a)=>({id:u.id,assetID:a.id,size:a.size,sha256:a.sha256,partSize:u.part_size,partCount:u.part_count,status:u.status});
async function verifiedPart(env,row){
  const object=await env.BUCKET.get(row.object_key);if(!object||object.size!==row.size)return false;return await sha(await object.arrayBuffer())===row.sha256;
}
async function currentParts(env,u){
  const all=await rows(env,'SELECT * FROM site_parts WHERE upload_id=? ORDER BY rowid DESC',u.id),parts=[];
  for(let n=1;n<=u.part_count;n++){const p=all.find(p=>p.part_number===n);if(p)parts.push({...p,verified:await verifiedPart(env,p)});}
  return parts;
}
async function objectDigest(env,key){
  const object=await env.BUCKET.get(key);if(!object)throw Error('ORIGINAL_MISSING');
  // Workers' streaming SHA-256 avoids buffering the 128MiB Original in a 128MB isolate.
  if(typeof crypto.DigestStream!=='function'){
    if(env.__testDigest)return env.__testDigest(object);throw Error('STREAMING_DIGEST_UNAVAILABLE');
  }
  let size=0;const digest=new crypto.DigestStream('SHA-256');
  await object.body.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.byteLength;controller.enqueue(chunk);}})).pipeTo(digest);
  return {sha256:hex(await digest.digest),size};
}
async function verifyOriginal(env,a){
  const u=await first(env,'SELECT * FROM site_uploads WHERE asset_id=? AND status=?',a.id,'READY');
  try{if(!u?.object_key)throw Error('ORIGINAL_MISSING');const actual=await objectDigest(env,u.object_key);if(actual.sha256!==a.sha256||actual.size!==a.size)throw Error('CHECKSUM_MISMATCH');return u.object_key;}
  catch(error){if(!['ORIGINAL_MISSING','CHECKSUM_MISMATCH'].includes(error.message))throw error;await stmt(env,'UPDATE assets SET cloud_safe=0 WHERE id=?',a.id).run();throw Error('WAITING_FOR_ORIGINAL');}
}
async function source(env,actor,input){const a=await asset(env,actor,input.assetID),saved=await latest(env,actor,a.id);if(!a.cloudSafe||!saved||saved.revision!==input.recipeRevision||JSON.stringify(portableParameters(saved.body))!==JSON.stringify(input.parameters))throw Error('SOURCE_RECIPE_MISMATCH');await verifyOriginal(env,a);}
const actorAdmin=(request,env,actor)=>requireAdmin(request,env,actor);
async function head(env,actor,id,admin=false){const h=await first(env,'SELECT * FROM site_drafts WHERE id=?',id);if(!h||!admin&&h.author_id!==actor.id)throw Error('NOT_FOUND');return h;}
async function version(env,id,revision,author){const r=await first(env,'SELECT * FROM site_draft_versions WHERE draft_id=? AND revision=?',id,revision);if(!r||await sha(r.body)!==r.sha256)throw Error('CORRUPT_PRESET_VERSION');return checkVersion(JSON.parse(r.body),id,revision,author);}
async function draft(env,actor,id){const h=await head(env,actor,id);return {...await version(env,id,h.revision,h.author_id),status:h.status};}
async function submission(env,r){const h=await first(env,'SELECT * FROM site_drafts WHERE id=?',r.draft_id);if(!h||await sha(r.body)!==r.sha256)throw Error('CORRUPT_SUBMISSION');const b=checkVersion(JSON.parse(r.body),r.draft_id,r.revision,h.author_id),v=await version(env,r.draft_id,r.revision,h.author_id);if(JSON.stringify(b)!==JSON.stringify(v))throw Error('CORRUPT_SUBMISSION');return b;}
async function authorRoutes(request,env,actor,url){
  const path=url.pathname,method=request.method;
  if(path==='/trial/drafts'&&method==='GET')return json({drafts:await Promise.all((await rows(env,'SELECT id FROM site_drafts WHERE author_id=?',actor.id)).map(r=>draft(env,actor,r.id)))});
  if(path==='/trial/submissions'&&method==='GET'){await actorAdmin(request,env,actor);const list=await rows(env,'SELECT * FROM site_submissions WHERE status=?','SUBMITTED');return json({submissions:await Promise.all(list.map(async r=>({...await submission(env,r),status:r.status})))});}
  if(path==='/trial/presets'&&method==='GET'){
    const list=await rows(env,'SELECT * FROM site_presets ORDER BY rowid DESC'),presets=[];
    for(const r of list){if(await sha(r.body)!==r.sha256)throw Error('CORRUPT_PRESET');const p=JSON.parse(r.body);exact(p,['formatVersion','id','name','authorID','authorName','version','parameters']);checkParameters(p.parameters);const s=await first(env,'SELECT * FROM site_submissions WHERE draft_id=? AND revision=?',r.draft_id,r.revision);if(!s||s.status!=='ACCEPTED')throw Error('CORRUPT_PRESET');const original=await submission(env,s);if(p.formatVersion!==1||p.id!==r.id||p.version!==r.revision||p.authorID!==original.authorID||p.authorName!==original.authorName||p.name!==original.name||JSON.stringify(p.parameters)!==JSON.stringify(original.parameters))throw Error('CORRUPT_PRESET');presets.push({...p,sha256:r.sha256,acceptedAt:r.created_at});}return json({presets});
  }
  const m=/^\/trial\/drafts\/([a-f0-9-]{36})(?:\/(submit|review))?$/.exec(path);
  if(m&&method==='GET'&&!m[2])return json(await draft(env,actor,m[1]));
  if(path==='/trial/drafts'&&method==='POST'||m&&method==='PUT'&&!m[2]){
    const b=await payload(request),creating=method==='POST';exact(b,creating?['name','recipe','assetID','recipeRevision']:['name','recipe','assetID','recipeRevision','expectedRevision']);
    if(typeof b.name!=='string'||!b.name.trim()||b.name.length>120||/[\x00-\x1f]/.test(b.name)||!Number.isSafeInteger(b.recipeRevision)||b.recipeRevision<1)throw Error('INVALID_DRAFT');
    const parameters=portableParameters(b.recipe);await source(env,actor,{...b,parameters});const id=creating?crypto.randomUUID():m[1],old=creating?null:await draft(env,actor,id);
    if(!creating&&b.expectedRevision!==old.revision)throw Error('REVISION_CONFLICT');
    const revision=creating?1:old.revision+1,mutation=crypto.randomUUID(),now=iso(env),record={id,authorID:actor.id,authorName:actor.authorName,name:b.name.trim(),parameters,source:{assetID:b.assetID,recipeRevision:b.recipeRevision},revision,createdAt:old?.createdAt||now,updatedAt:now},serialized=JSON.stringify(record),checksum=await sha(serialized);
    const statements=creating?[stmt(env,'INSERT INTO site_drafts VALUES(?,?,?,?,?)',id,actor.id,1,'DRAFT',mutation)]:[stmt(env,'UPDATE site_drafts SET revision=?,status=?,mutation_id=? WHERE id=? AND author_id=? AND revision=?',revision,'DRAFT',mutation,id,actor.id,b.expectedRevision)];
    statements.push(stmt(env,'INSERT INTO site_draft_versions SELECT id,revision,?,? FROM site_drafts WHERE id=? AND mutation_id=?',serialized,checksum,id,mutation));const results=await env.DB.batch(statements);if(changes(results[0])!==1||changes(results[1])!==1)throw Error('REVISION_CONFLICT');return json({...record,status:'DRAFT'},creating?201:200);
  }
  if(m&&m[2]==='submit'&&method==='POST'){
    const b=await payload(request);exact(b,['expectedRevision']);const old=await draft(env,actor,m[1]);if(b.expectedRevision!==old.revision)throw Error('REVISION_CONFLICT');if(old.status!=='DRAFT')throw Error('VERSION_ALREADY_SUBMITTED');await source(env,actor,{...old.source,parameters:old.parameters});const mutation=crypto.randomUUID();
    const result=await env.DB.batch([stmt(env,'UPDATE site_drafts SET status=?,mutation_id=? WHERE id=? AND author_id=? AND revision=? AND status=?','SUBMITTED',mutation,m[1],actor.id,b.expectedRevision,'DRAFT'),stmt(env,'INSERT INTO site_submissions(draft_id,revision,body,sha256,status) SELECT v.draft_id,v.revision,v.body,v.sha256,? FROM site_draft_versions v JOIN site_drafts d ON d.id=v.draft_id AND d.revision=v.revision WHERE d.id=? AND d.mutation_id=?','SUBMITTED',m[1],mutation)]);if(changes(result[0])!==1||changes(result[1])!==1)throw Error('REVISION_CONFLICT');return json({...old,status:'SUBMITTED'});
  }
  if(m&&m[2]==='review'&&method==='POST'){
    await actorAdmin(request,env,actor);const b=await payload(request);exact(b,['expectedRevision','decision']);if(!Number.isSafeInteger(b.expectedRevision)||!['ACCEPTED','REJECTED'].includes(b.decision))throw Error('INVALID_REVIEW');const r=await first(env,'SELECT * FROM site_submissions WHERE draft_id=? AND revision=?',m[1],b.expectedRevision);if(!r)throw Error('NOT_FOUND');if(r.status!=='SUBMITTED')throw Error('ALREADY_REVIEWED');const old=await submission(env,r);if(old.authorID===actor.id)throw Error('SELF_APPROVAL_FORBIDDEN');adoptionTransition(old,actor,b.decision);
    const mutation=crypto.randomUUID(),now=iso(env),p={formatVersion:1,id:crypto.randomUUID(),name:old.name,authorID:old.authorID,authorName:old.authorName,version:old.revision,parameters:old.parameters},serialized=JSON.stringify(p),checksum=await sha(serialized);
    const statements=[stmt(env,'UPDATE site_submissions SET status=?,reviewer=?,reviewed_at=?,mutation_id=? WHERE draft_id=? AND revision=? AND status=?',b.decision,actor.id,now,mutation,m[1],old.revision,'SUBMITTED'),stmt(env,'UPDATE site_drafts SET status=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM site_submissions WHERE draft_id=? AND revision=? AND mutation_id=?)',b.decision,m[1],old.revision,m[1],old.revision,mutation)];
    if(b.decision==='ACCEPTED')statements.push(stmt(env,'INSERT INTO site_presets SELECT ?,draft_id,revision,?,?,? FROM site_submissions WHERE draft_id=? AND revision=? AND mutation_id=?',p.id,serialized,checksum,now,m[1],old.revision,mutation));const results=await env.DB.batch(statements);if(changes(results[0])!==1)throw Error('REVISION_CONFLICT');return json({draft:{...old,status:b.decision},preset:b.decision==='ACCEPTED'?{...p,sha256:checksum,acceptedAt:now}:null});
  }
  return null;
}
async function routeRequest(request,env){
  try{
    const url=new URL(request.url);if(!env.DB||!env.BUCKET||!env.SUITE_ALLOWED_ORIGIN||url.origin!==env.SUITE_ALLOWED_ORIGIN)throw Error('RUNTIME_NOT_CONFIGURED');
    if(['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(url.pathname))return json({error:'DISPATCH_AUTH_ROUTE_REQUIRED'},503);
    const api=url.pathname.startsWith('/v1/')||url.pathname.startsWith('/trial/');
    if(api&&request.headers.get('X-Suite-Trial')!=='1')throw Error('TRIAL_REQUEST_REQUIRED');
    if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('Origin')!==url.origin))throw Error('ORIGIN_REQUIRED');
    let actor,endedReason=null;
    if(url.pathname==='/trial/session'&&request.method==='GET'){
      try{actor=await identity(request,env);}catch(error){
        if(!['INVITATION_REQUIRED','TRIAL_REVOKED','TRIAL_EXPIRED','TRIAL_END_NOT_CONFIGURED'].includes(error.message))throw error;
        endedReason=error.message;actor=null;
      }
      const adminPasswordAuthenticated=actor?.role==='admin'?await adminAuthenticated(request,env,actor).catch(()=>false):false;
      const principal=actor?{id:actor.id,authorName:actor.authorName,role:actor.role,tenantId:actor.tenantId,trialEndsAt:actor.trialEndsAt}:null;
      return json({mode:'SITES',principal,adminPasswordAuthenticated,adminCandidate:request.headers.get('oai-authenticated-user-id')===env.SUITE_ADMIN_USER_ID,anonymousLocal:true,endedReason,signInURL:'/signin-with-chatgpt?return_to=/',personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'});
    }
    if(url.pathname==='/trial/admin/login'&&request.method==='POST'){
      if(env.SUITE_TRUST_SITES_DISPATCH!=='1')throw Error('DISPATCH_NOT_CONFIGURED');
      const input=await payload(request);exact(input,['password']);
      const user=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
      const session=await adminLogin(request,env,{role:'admin',platformUserID:user},input.password);
      await ensureOwnerMember(env,user,email);
      actor=await identity(request,env);if(actor?.role!=='admin')throw Error('FORBIDDEN');
      return new Response(JSON.stringify({authenticated:true,expiresAt:session.expiresAt}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':session.setCookie}});
    }
    actor=await identity(request,env);
    if(!api){
      if(!actor&&url.pathname==='/'||actor){if(!env.ASSETS)throw Error('ASSETS_NOT_CONFIGURED');const served=await env.ASSETS.fetch(request),response=new Response(served.body,served);response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','no-referrer');response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");return response;}
      // Anonymous login UI needs its self-hosted static assets; no private blobs are served here.
      if(/^\/(app\.js|styles\.css|vendor\/|licenses\/|runtime_assets\/|processing-worker\.js)/.test(url.pathname))return env.ASSETS.fetch(request);
      return json({error:'UNAUTHORIZED'},401);
    }
    if(!actor)throw Error('UNAUTHORIZED');
    if(url.pathname==='/trial/admin/logout'&&request.method==='POST'){
      return new Response(JSON.stringify({authenticated:false}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':adminLogoutCookie()}});
    }
    if(url.pathname==='/trial/authorize'&&request.method==='POST'){const b=await payload(request);exact(b,['assetID','action']);if(!['edit','export','submit'].includes(b.action))throw Error('INVALID_PERMISSION_REQUEST');await asset(env,actor,b.assetID);return json({authorized:true,trialEndsAt:actor.trialEndsAt});}
    if(url.pathname.startsWith('/trial/members')){
      await actorAdmin(request,env,actor);const view=r=>({id:r.id,email:r.email,authorName:r.credit_name,role:r.role,trialEndsAt:r.trial_ends_at?new Date(r.trial_ends_at).toISOString():null,revoked:r.active!==1});
      if(url.pathname==='/trial/members'&&request.method==='GET')return json({members:(await rows(env,'SELECT * FROM site_members')).map(view)});
      const b=await payload(request),end=v=>{const date=typeof v==='string'?Date.parse(v):NaN;if(!Number.isSafeInteger(date)||date<=time(env))throw Error('INVALID_TRIAL_END');return date;};
      if(url.pathname==='/trial/members'&&request.method==='POST'){exact(b,['email','authorName','role','trialEndsAt','inviteExpiresAt']);if(typeof b.email!=='string'||b.email.length>254||!/^\S+@\S+\.\S+$/.test(b.email)||typeof b.authorName!=='string'||!b.authorName.trim()||b.authorName.length>80||b.role!=='author')throw Error('INVALID_MEMBER');const id=crypto.randomUUID();await stmt(env,'INSERT INTO site_members(id,email,credit_name,role,invite_expires,created_at,trial_ends_at) VALUES(?,?,?,?,?,?,?)',id,b.email.toLowerCase(),b.authorName.trim(),b.role,end(b.inviteExpiresAt),iso(env),end(b.trialEndsAt)).run();return json({member:view(await first(env,'SELECT * FROM site_members WHERE id=?',id))},201);}
      const m=/^\/trial\/members\/([a-f0-9-]{36})(\/revoke)?$/.exec(url.pathname);if(!m||request.method!=='POST')throw Error('INVALID_MEMBER_ACTION');const target=await first(env,'SELECT * FROM site_members WHERE id=?',m[1]);if(!target)throw Error('NOT_FOUND');if(target.role==='admin')throw Error('FORBIDDEN');if(m[2]){exact(b,[]);await stmt(env,'UPDATE site_members SET active=0 WHERE id=?',m[1]).run();}else{exact(b,['trialEndsAt']);await stmt(env,'UPDATE site_members SET trial_ends_at=? WHERE id=? AND active=1',end(b.trialEndsAt),m[1]).run();}const r=await first(env,'SELECT * FROM site_members WHERE id=?',m[1]);return json({member:view(r)});
    }
    if(url.pathname==='/trial/usage'&&request.method==='GET'){await actorAdmin(request,env,actor);return json({scope:'THIS_SUITE_SITE_ONLY_NOT_ACCOUNT_FREE_BALANCE',measurementLimitations:['D1_ROWS_EXCLUDE_METRICS_WRITE_AND_ARE_LOWER_BOUND','MISSING_D1_META_IS_UNKNOWN_NOT_ZERO','WALL_MS_EXCLUDES_FINAL_METRICS_WRITE','OBJECT_BYTES_REQUESTED_IS_NOT_NETWORK_TRANSFER'],storage:await first(env,'SELECT COALESCE(SUM(bytes),0) AS reservedBytes FROM site_storage_reservations'),objects:await rows(env,'SELECT state,COUNT(*) AS objects,SUM(bytes) AS bytes FROM site_storage_objects GROUP BY state'),operations:await rows(env,'SELECT * FROM site_operation_budget'),metrics:await rows(env,'SELECT * FROM site_metrics'),cpuTime:'NOT_AVAILABLE_WALL_TIME_IS_NOT_CPU',storageLimitBytes:Number(env.SUITE_TRIAL_STORAGE_LIMIT_BYTES)});}
    if(url.pathname==='/trial/logout')return json({error:'USE_CHATGPT_SIGNOUT',signOutURL:'/signout-with-chatgpt?return_to=/'},409);
    if(url.pathname==='/v1/assets'&&request.method==='GET'){const list=await rows(env,'SELECT id FROM assets WHERE tenant_id=? AND deleted_at IS NULL',actor.tenantId);return json({assets:await Promise.all(list.map(r=>asset(env,actor,r.id)))});}
    if(url.pathname==='/v1/assets'&&request.method==='POST'){
      const b=await payload(request);exact(b,['name','sha256','size']);if(typeof b.name!=='string'||!b.name||b.name.length>255||!Number.isSafeInteger(b.size)||b.size<=0||b.size>MAX||typeof b.sha256!=='string'||!/^[a-f0-9]{64}$/.test(b.sha256))throw Error('INVALID_ASSET');
      const id=crypto.randomUUID();const reserved=await env.DB.batch([reserveAssetStatement(env,id,b.size),stmt(env,'INSERT INTO assets(id,tenant_id,name,original_key,sha256,size) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM site_storage_reservations WHERE asset_id=?)',id,actor.tenantId,b.name,'original-'+crypto.randomUUID(),b.sha256,b.size,id)]);if(changes(reserved[0])!==1||changes(reserved[1])!==1)throw Error('TRIAL_STORAGE_LIMIT');return json(await asset(env,actor,id),201);
    }
    const am=/^\/v1\/assets\/([a-f0-9-]{36})\/(recipe|original|uploads)$/.exec(url.pathname);
    if(am){const a=await asset(env,actor,am[1]);
      if(am[2]==='recipe'&&request.method==='GET')return json({recipe:await latest(env,actor,a.id)});
      if(am[2]==='recipe'&&request.method==='PUT'){
        const b=await payload(request);exact(b,['expectedRevision','recipe']);await bound(b.recipe,a);if(!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0)throw Error('INVALID_REVISION');
        if(b.recipe.parameters.extendedParameters.portrait)throw Error('PERSON_PROCESSING_DISABLED');
        const prior=await latest(env,actor,a.id);if((prior?.revision||0)!==b.expectedRevision)throw Error('REVISION_CONFLICT');const revision=b.expectedRevision+1,now=iso(env),serialized=JSON.stringify(b.recipe);
        const result=await env.DB.batch([stmt(env,'INSERT INTO recipes SELECT ?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM recipes WHERE asset_id=?),0)=?',a.id,revision,actor.id,now,serialized,a.id,b.expectedRevision),stmt(env,'INSERT INTO audit(tenant_id,asset_id,action,created_at) SELECT ?,?,?,? WHERE changes()=1',actor.tenantId,a.id,'recipe-committed',now)]);if(changes(result[0])!==1)throw Error('REVISION_CONFLICT');return json({revision,editor:actor.id,updatedAt:now,body:b.recipe});
      }
      if(am[2]==='original'&&request.method==='GET'){
        if(!originalIntents.includes(url.searchParams.get('purpose')))throw Error('ORIGINAL_REQUIRES_EXPLICIT_PROCESSING_INTENT');if(!a.cloudSafe)throw Error('WAITING_FOR_ORIGINAL');const key=await verifyOriginal(env,a),object=await env.BUCKET.get(key);if(!object)throw Error('WAITING_FOR_ORIGINAL');return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(a.size),'Cache-Control':'no-store'}});
      }
      if(am[2]==='uploads'){
        let u=await first(env,'SELECT * FROM site_uploads WHERE asset_id=? AND author_id=?',a.id,actor.id);
        if(request.method==='POST'){if(!u){const id=crypto.randomUUID();await stmt(env,'INSERT OR IGNORE INTO site_uploads(id,asset_id,author_id,part_size,part_count,status,created_at) VALUES(?,?,?,?,?,?,?)',id,a.id,actor.id,PART,Math.ceil(a.size/PART),'UPLOADING',iso(env)).run();u=await first(env,'SELECT * FROM site_uploads WHERE asset_id=? AND author_id=?',a.id,actor.id);}return json(uploadJSON(u,a));}
        if(request.method==='GET')return json({upload:u?uploadJSON(u,a):null,parts:u?(await currentParts(env,u)).map(p=>({partNumber:p.part_number,sha256:p.sha256,size:p.size,etag:p.id,verified:p.verified})):[]});
      }
    }
    const pm=/^\/v1\/uploads\/([a-f0-9-]{36})\/parts\/(\d+)$/.exec(url.pathname);
    if(pm&&request.method==='PUT'){
      const {u,a}=await upload(env,actor,pm[1]),n=Number(pm[2]);if(u.status!=='UPLOADING'||!Number.isInteger(n)||n<1||n>u.part_count)throw Error('INVALID_UPLOAD_STATE');if(request.headers.get('Content-Type')!=='application/octet-stream')throw Error('INVALID_PART_TYPE');
      const expected=n===u.part_count?a.size-PART*(n-1):PART,bytes=await body(request,PART),checksum=await sha(bytes);if(bytes.length!==expected||request.headers.get('X-Suite-Part-SHA256')!==checksum)throw Error('CHECKSUM_PART_MISMATCH');
      const previous=(await currentParts(env,u)).find(p=>p.part_number===n);if(previous?.verified&&previous.sha256===checksum&&previous.size===expected)return json({partNumber:n,sha256:checksum,size:expected,etag:previous.id,verified:true});
      const id=crypto.randomUUID(),key=actor.tenantId+'/'+a.originalKey+'/parts/'+n+'/'+id;
      // Unique create-only key. Broken and healthy earlier part bytes are NEVER overwritten/deleted.
      await reserveObject(env,a.id,key,expected);await env.BUCKET.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:checksum,assetID:a.id}});
      const row={id,upload_id:u.id,part_number:n,object_key:key,sha256:checksum,size:expected,created_at:iso(env)};if(!await verifiedPart(env,row))throw Error('PART_PERSISTENCE_FAILED');
      await persistedObject(env,key);await stmt(env,'INSERT INTO site_parts VALUES(?,?,?,?,?,?,?)',id,u.id,n,key,checksum,expected,iso(env)).run();return json({partNumber:n,sha256:checksum,size:expected,etag:id,verified:true});
    }
    const cm=/^\/v1\/uploads\/([a-f0-9-]{36})\/complete$/.exec(url.pathname);
    if(cm&&request.method==='POST'){
      const {u,a}=await upload(env,actor,cm[1]);if(u.status==='READY'){await verifyOriginal(env,a);if(!a.cloudSafe)await stmt(env,'UPDATE assets SET cloud_safe=1 WHERE id=? AND tenant_id=?',a.id,actor.tenantId).run();return json(await asset(env,actor,a.id));}
      const parts=await currentParts(env,u);if(parts.length!==u.part_count||parts.some(p=>!p.verified))throw Error('UPLOAD_PARTS_INCOMPLETE');
      const token=crypto.randomUUID(),lease=time(env)+300000,key=actor.tenantId+'/'+a.originalKey+'/final/'+token;
      const claim=await stmt(env,'UPDATE site_uploads SET status=?,assembly_token=?,lease_until=? WHERE id=? AND (status=? OR lease_until<?)','ASSEMBLING',token,lease,u.id,'UPLOADING',time(env)).run();if(changes(claim)!==1)throw Error('UPLOAD_IN_PROGRESS');
      try{
        await reserveObject(env,a.id,key,a.size);const multipart=await env.BUCKET.createMultipartUpload(key,{customMetadata:{assetID:a.id}}),completed=[];
        for(const p of parts){const object=await env.BUCKET.get(p.object_key);if(!object)throw Error('UPLOAD_PARTS_INCOMPLETE');completed.push(await multipart.uploadPart(p.part_number,object.body));}
        await multipart.complete(completed);const actual=await objectDigest(env,key);if(actual.sha256!==a.sha256||actual.size!==a.size)throw Error('CHECKSUM_MISMATCH');await persistedObject(env,key);
        const result=await env.DB.batch([stmt(env,'UPDATE site_uploads SET status=?,object_key=?,lease_until=NULL WHERE id=? AND assembly_token=?','READY',key,u.id,token),stmt(env,'UPDATE assets SET cloud_safe=1 WHERE id=? AND tenant_id=? AND EXISTS(SELECT 1 FROM site_uploads WHERE id=? AND assembly_token=? AND status=?)',a.id,actor.tenantId,u.id,token,'READY'),stmt(env,'INSERT INTO audit(tenant_id,asset_id,action,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM site_uploads WHERE id=? AND assembly_token=? AND status=?)',actor.tenantId,a.id,'server-object-verified-and-committed',iso(env),u.id,token,'READY')]);if(changes(result[0])!==1||changes(result[1])!==1)throw Error('UPLOAD_LEASE_LOST');return json(await asset(env,actor,a.id));
      }catch(e){await stmt(env,'UPDATE site_uploads SET status=?,lease_until=NULL WHERE id=? AND assembly_token=? AND status=?','UPLOADING',u.id,token,'ASSEMBLING').run();throw e;}
    }
    const author=await authorRoutes(request,env,actor,url);return author||json({error:'NOT_FOUND'},404);
  }catch(e){const message=e.message,status=message==='TRIAL_LIMITS_NOT_CONFIGURED'?503:/TRIAL_.*LIMIT|ADMIN_LOGIN_RATE_LIMIT/.test(message)?429:message==='UNAUTHORIZED'?401:['INVITATION_REQUIRED','TRIAL_EXPIRED','TRIAL_REVOKED','TRIAL_END_NOT_CONFIGURED','FORBIDDEN','SELF_APPROVAL_FORBIDDEN','ORIGIN_REQUIRED','TRIAL_REQUEST_REQUIRED','ADMIN_PASSWORD_REQUIRED','ADMIN_PASSWORD_INVALID'].includes(message)?403:message==='NOT_FOUND'?404:/CONFLICT|ALREADY|WAITING|IN_PROGRESS|IMMUTABLE/.test(message)?409:/INVALID|CORRUPT|CHECKSUM|PAYLOAD|SOURCE_|NON_PORTABLE|PHOTO_LOCAL|PERSON_PROCESSING|PARTS_INCOMPLETE|UNSUPPORTED/.test(message)?400:503;return json({error:status===503?'OPERATION_UNAVAILABLE':message,...(status===503?{message:'原本・編集・提出版は保持しています。'}:{})},status);}
}
const publicAssetPath=path=>path==='/'||path==='/index.html'||path==='/app.js'||path==='/styles.css'||path==='/processing-worker.js'||/^\/(vendor|licenses|runtime_assets)\/[A-Za-z0-9/_.,-]+$/.test(path);
async function publicAsset(request,env,url){
  if(!env.SUITE_ALLOWED_ORIGIN||url.origin!==env.SUITE_ALLOWED_ORIGIN||!env.ASSETS)return json({error:'RUNTIME_NOT_CONFIGURED'},503);
  if(!publicAssetPath(url.pathname))return json({error:'NOT_FOUND'},404);
  const served=await env.ASSETS.fetch(request),response=new Response(served.body,served);
  response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','no-referrer');
  response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  return response;
}
export function handleRequest(request,env){
  const url=new URL(request.url),api=url.pathname.startsWith('/v1/')||url.pathname.startsWith('/trial/');
  if(!api&&['GET','HEAD'].includes(request.method))return publicAsset(request,env,url);
  if(url.pathname==='/trial/session'&&request.method==='GET'&&!request.headers.get('oai-authenticated-user-id')){
    if(!env.SUITE_ALLOWED_ORIGIN||url.origin!==env.SUITE_ALLOWED_ORIGIN)return json({error:'RUNTIME_NOT_CONFIGURED'},503);
    return json({mode:'SITES',principal:null,anonymousLocal:true,adminPasswordAuthenticated:false,signInURL:'/signin-with-chatgpt?return_to=/',personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'});
  }
  if(api&&!request.headers.get('oai-authenticated-user-id'))return json({error:'UNAUTHORIZED'},401);
  return measureRequest(request,env,routeRequest);
}
export default {fetch:handleRequest};
