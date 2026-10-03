const encoder=new TextEncoder();
const COOKIE='__Host-suite-admin';
const TTL_MS=15*60*1000;
const now=env=>env.__testNow??Date.now();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=value=>{const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
function configured(env){
  if(typeof env.SUITE_ADMIN_USER_ID!=='string'||!env.SUITE_ADMIN_USER_ID||
     typeof env.SUITE_ADMIN_PASSWORD!=='string'||!env.SUITE_ADMIN_PASSWORD||
     typeof env.SUITE_ADMIN_SESSION_SECRET!=='string'||env.SUITE_ADMIN_SESSION_SECRET.length<32)
    throw Error('ADMIN_AUTH_NOT_CONFIGURED');
}
function owner(env,actor){configured(env);if(actor?.role!=='admin'||actor.platformUserID!==env.SUITE_ADMIN_USER_ID)throw Error('FORBIDDEN');}
async function signingKey(env){return crypto.subtle.importKey('raw',encoder.encode(env.SUITE_ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function cookieValue(request){const header=request.headers.get('Cookie')||'';const item=header.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));return item?.slice(COOKIE.length+1)||null;}
const cookie=(value,maxAge)=>`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
async function equalsSecret(actual,expected){
  if(typeof actual!=='string'||actual.length>1024)return false;
  const [a,b]=await Promise.all([actual,expected].map(v=>crypto.subtle.digest('SHA-256',encoder.encode(v))));
  const x=new Uint8Array(a),y=new Uint8Array(b);let mismatch=0;for(let i=0;i<x.length;i++)mismatch|=x[i]^y[i];return mismatch===0;
}
async function admitAttempt(env,user){
  const period='admin-login-'+Math.floor(now(env)/(15*60*1000));
  const result=await env.DB.prepare('INSERT INTO site_operation_budget(period,kind,count) VALUES(?,?,1) ON CONFLICT(period,kind) DO UPDATE SET count=count+1 WHERE count<5').bind(period,'ADMIN_LOGIN:'+user).run();
  if(Number(result.meta?.changes)!==1)throw Error('ADMIN_LOGIN_RATE_LIMIT');
}
export async function adminLogin(request,env,actor,password){
  owner(env,actor);await admitAttempt(env,actor.platformUserID);
  if(!await equalsSecret(password,env.SUITE_ADMIN_PASSWORD))throw Error('ADMIN_PASSWORD_INVALID');
  const expires=now(env)+TTL_MS,nonce=crypto.randomUUID(),payload=b64(encoder.encode(JSON.stringify({user:actor.platformUserID,expires,nonce})));
  const signature=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),encoder.encode(payload))));
  return {expiresAt:new Date(expires).toISOString(),setCookie:cookie(payload+'.'+signature,Math.floor(TTL_MS/1000))};
}
export async function adminAuthenticated(request,env,actor){
  owner(env,actor);const value=cookieValue(request);if(!value||value.length>2048)return false;
  const parts=value.split('.');if(parts.length!==2||parts.some(v=>!/^[A-Za-z0-9_-]+$/.test(v)))return false;
  try{
    const valid=await crypto.subtle.verify('HMAC',await signingKey(env),unb64(parts[1]),encoder.encode(parts[0]));
    if(!valid)return false;const payload=JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    return payload.user===actor.platformUserID&&Number.isSafeInteger(payload.expires)&&payload.expires>now(env)&&payload.expires<=now(env)+TTL_MS&&typeof payload.nonce==='string';
  }catch{return false;}
}
export async function requireAdmin(request,env,actor){if(!await adminAuthenticated(request,env,actor))throw Error('ADMIN_PASSWORD_REQUIRED');}
export const adminLogoutCookie=()=>cookie('',0);
