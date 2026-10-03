import {createRemoteJWKSet, jwtVerify, SignJWT} from 'jose';

const encoder = new TextEncoder();
const COOKIE = '__Host-suite-session';
const AUDIENCE = 'suite-cloudflare-session';
const SESSION_SECONDS = 12 * 60 * 60;
const keySets = new Map();
const now = env => Math.floor((env.__testNow ?? Date.now()) / 1000);
const digestID = async id => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(id)))].map(byte => byte.toString(16).padStart(2, '0')).join('');

function origin(value) {
  if (typeof value !== 'string') throw Error('AUTH_NOT_CONFIGURED');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
    throw Error('AUTH_NOT_CONFIGURED');
  return url.origin;
}

function config(env) {
  const team = origin(env.CF_ACCESS_TEAM_DOMAIN);
  const site = origin(env.SUITE_ALLOWED_ORIGIN);
  if (typeof env.CF_ACCESS_AUD !== 'string' || !env.CF_ACCESS_AUD ||
      typeof env.SUITE_SESSION_SECRET !== 'string' || encoder.encode(env.SUITE_SESSION_SECRET).length < 32)
    throw Error('AUTH_NOT_CONFIGURED');
  return {team, site, audience:env.CF_ACCESS_AUD, secret:encoder.encode(env.SUITE_SESSION_SECRET)};
}

export async function verifyAccessAssertion(token, env, keySet) {
  const settings = config(env);
  if (typeof token !== 'string' || !token || token.length > 16_384) throw Error('ACCESS_ASSERTION_REQUIRED');
  if (!keySet) {
    if (!keySets.has(settings.team)) keySets.set(settings.team, createRemoteJWKSet(new URL('/cdn-cgi/access/certs', settings.team)));
    keySet = keySets.get(settings.team);
  }
  const {payload} = await jwtVerify(token, keySet, {
    issuer:settings.team, audience:settings.audience, algorithms:['RS256']
  });
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256 ||
      typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 320)
    throw Error('ACCESS_IDENTITY_INVALID');
  return {userID:payload.sub, email:payload.email.toLowerCase()};
}

function sessionKey(env) { return config(env).secret; }
function database(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') throw Error('AUTH_NOT_CONFIGURED');
  return env.DB;
}
function cookieValue(request) {
  const header = request.headers.get('Cookie') || '';
  const item = header.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='));
  return item?.slice(COOKIE.length + 1) || null;
}
export async function issueSession(claims, env) {
  const {site} = config(env);
  if (typeof claims?.userID !== 'string' || !claims.userID || claims.userID.length > 256 ||
      typeof claims.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) || claims.email.length > 320)
    throw Error('ACCESS_IDENTITY_INVALID');
  const issued = now(env), expires = issued + SESSION_SECONDS, id = crypto.randomUUID();
  const token = await new SignJWT({email:claims.email.toLowerCase()})
    .setProtectedHeader({alg:'HS256',typ:'JWT'})
    .setIssuer(site).setAudience(AUDIENCE).setSubject(claims.userID)
    .setJti(id).setIssuedAt(issued).setExpirationTime(expires)
    .sign(sessionKey(env));
  const result = await database(env).prepare('INSERT INTO site_auth_sessions(session_id,user_id,expires_at,revoked_at) VALUES(?,?,?,NULL)')
    .bind(await digestID(id),claims.userID,expires).run();
  if (Number(result?.meta?.changes) !== 1) throw Error('SESSION_CREATE_FAILED');
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}
async function verifiedSession(request, env) {
  const token = cookieValue(request);
  if (!token || token.length > 16_384) return null;
  let payload;
  try {
    const {site} = config(env);
    ({payload} = await jwtVerify(token, sessionKey(env), {
      issuer:site, audience:AUDIENCE, algorithms:['HS256'], currentDate:new Date(now(env) * 1000)
    }));
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256 ||
        typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
        typeof payload.jti !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.jti) ||
        !Number.isSafeInteger(payload.exp) || payload.exp > now(env) + SESSION_SECONDS ||
        !Number.isSafeInteger(payload.iat) || payload.iat > now(env)) return null;
  } catch { return null; }
  const row = await database(env).prepare('SELECT user_id,expires_at,revoked_at FROM site_auth_sessions WHERE session_id=?')
    .bind(await digestID(payload.jti)).first();
  if (!row || row.user_id !== payload.sub || row.expires_at !== payload.exp || row.revoked_at !== null || payload.exp <= now(env)) return null;
  return {userID:payload.sub,email:payload.email.toLowerCase(),sessionID:payload.jti};
}
export async function readSession(request, env) {
  const session = await verifiedSession(request,env);
  return session && {userID:session.userID,email:session.email};
}
export async function revokeSession(request, env) {
  const session = await verifiedSession(request,env);
  if (!session) return;
  const result = await database(env).prepare('UPDATE site_auth_sessions SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL')
    .bind(now(env),await digestID(session.sessionID)).run();
  if (Number(result?.meta?.changes) !== 1) throw Error('SESSION_REVOKE_FAILED');
}
export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
