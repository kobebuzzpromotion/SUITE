import {handleRequest} from './worker.mjs';
import {adminLogoutCookie} from './admin-auth.mjs';
import {verifyAccessAssertion,issueSession,readSession,revokeSession,clearSessionCookie} from './cloudflare-identity.mjs';

const json = (body,status=200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const redirect = () => new Response(null,{status:303,headers:{Location:'/', 'Cache-Control':'no-store'}});
const adminConfigured = env => typeof env.SUITE_ADMIN_USER_ID === 'string' && !!env.SUITE_ADMIN_USER_ID &&
  typeof env.SUITE_ADMIN_PASSWORD === 'string' && !!env.SUITE_ADMIN_PASSWORD &&
  typeof env.SUITE_ADMIN_SESSION_SECRET === 'string' && env.SUITE_ADMIN_SESSION_SECRET.length >= 32;
const anonymousSession = () => json({mode:'SITES',principal:null,anonymousLocal:true,adminPasswordAuthenticated:false,
  adminCandidate:false,endedReason:'ADMIN_AUTH_NOT_CONFIGURED',signInURL:null,
  personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'});

function returnPath(url) {
  if (url.hash || url.searchParams.size > 1 || [...url.searchParams.keys()].some(key => key !== 'return_to') ||
      (url.searchParams.has('return_to') && url.searchParams.get('return_to') !== '/'))
    throw Error('INVALID_RETURN_PATH');
}
function sameSiteNavigation(request,url) {
  const origin=request.headers.get('Origin');
  if (origin && origin!==url.origin) return false;
  const fetchSite=request.headers.get('Sec-Fetch-Site');
  if (fetchSite && !['same-origin','none'].includes(fetchSite)) return false;
  const referer=request.headers.get('Referer');
  if (referer) { try { if (new URL(referer).origin!==url.origin) return false; } catch { return false; } }
  return true;
}

export async function fetchCloudflare(request,env) {
  const url = new URL(request.url);
  if (url.origin !== env.SUITE_ALLOWED_ORIGIN) return json({error:'RUNTIME_NOT_CONFIGURED'},503);
  if (!adminConfigured(env)) {
    if (url.pathname === '/trial/session' && request.method === 'GET') return anonymousSession();
    if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/trial/') ||
        url.pathname === '/auth/complete' || url.pathname === '/auth/whoami')
      return json({error:'ADMIN_AUTH_NOT_CONFIGURED'},503);
  }
  if (url.pathname === '/auth/complete' || url.pathname === '/auth/whoami') {
    if (request.method !== 'GET') return json({error:'METHOD_NOT_ALLOWED'},405);
    try {
      returnPath(url);
      // Cloudflare Access must protect /auth/*; the JWT is still verified here.
      const claims = await verifyAccessAssertion(request.headers.get('Cf-Access-Jwt-Assertion'),env);
      if (url.pathname === '/auth/whoami') return json({userID:claims.userID,email:claims.email});
      const response=redirect();response.headers.append('Set-Cookie',await issueSession(claims,env));return response;
    } catch {return json({error:'ACCESS_DENIED'},403);}
  }
  if (url.pathname === '/auth/logout') {
    if (request.method !== 'GET') return json({error:'METHOD_NOT_ALLOWED'},405);
    try {returnPath(url);}catch{return json({error:'INVALID_RETURN_PATH'},400);}
    if (!sameSiteNavigation(request,url)) return json({error:'ORIGIN_REQUIRED'},403);
    try {await revokeSession(request,env);}catch{return json({error:'AUTH_NOT_CONFIGURED'},503);}
    const response=redirect();response.headers.append('Set-Cookie',clearSessionCookie());
    response.headers.append('Set-Cookie',adminLogoutCookie());return response;
  }

  // Incoming identity headers are never trusted. Only this signed application
  // session can supply an identity to the existing tenant and invitation checks.
  const headers=new Headers(request.headers);
  headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
  if (!adminConfigured(env)) return handleRequest(new Request(request,{headers}),{...env,SUITE_TRUST_SITES_DISPATCH:'1'});
  let claims;
  try {claims=await readSession(request,env);} catch {return json({error:'AUTH_NOT_CONFIGURED'},503);}
  if (!claims && url.pathname === '/trial/session' && request.headers.get('Cookie')?.split(';').some(part => part.trim().startsWith('__Host-suite-session=')))
    return json({error:'SESSION_INVALID',anonymousLocal:true},401);
  if (claims) {
    headers.set('oai-authenticated-user-id',claims.userID);
    headers.set('oai-authenticated-user-email',claims.email);
  }
  const verifiedRequest=new Request(request,{headers});
  if (url.pathname === '/trial/logout' && request.method === 'POST') {
    if (request.headers.get('Origin')!==url.origin) return json({error:'ORIGIN_REQUIRED'},403);
    if (!claims) return json({error:'UNAUTHORIZED'},401);
    return json({signOutURL:'/auth/logout?return_to=/'});
  }
  const response=await handleRequest(verifiedRequest,{...env,SUITE_TRUST_SITES_DISPATCH:'1'});
  if (url.pathname === '/trial/session' && request.method === 'GET' && response.ok) {
    const body=await response.json();body.signInURL='/auth/complete?return_to=/';
    return new Response(JSON.stringify(body),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  return response;
}

export default {fetch:fetchCloudflare};
