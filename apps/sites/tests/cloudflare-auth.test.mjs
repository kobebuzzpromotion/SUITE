import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,exportJWK} from 'jose';
import {fetchCloudflare} from '../src/cloudflare-entry.mjs';
import {readSession} from '../src/cloudflare-identity.mjs';
import {adminAuthenticated} from '../src/admin-auth.mjs';

const SITE='https://suite.example.test';
const TEAM='https://team.cloudflareaccess.com';
const AUD='suite-access-audience';
const fixedTime=Date.now();
const pair=await generateKeyPair('RS256');

function fakeDB() {
  const sessions=new Map();
  let fail=false;
  return {
    sessions,
    setFail(value){fail=value;},
    prepare(sql) { return {bind(...args) { return {
      async run() {
        if(fail) throw Error('DB_UNAVAILABLE');
        if(sql.startsWith('INSERT INTO site_auth_sessions')) {
          if(sessions.has(args[0])) return {meta:{changes:0}};
          sessions.set(args[0],{user_id:args[1],expires_at:args[2],revoked_at:null});
          return {meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE site_auth_sessions')) {
          const row=sessions.get(args[1]);if(!row||row.revoked_at!==null)return {meta:{changes:0}};
          row.revoked_at=args[0];return {meta:{changes:1}};
        }
        throw Error('UNEXPECTED_QUERY');
      },
      async first() {
        if(fail) throw Error('DB_UNAVAILABLE');
        if(!sql.startsWith('SELECT user_id,expires_at,revoked_at FROM site_auth_sessions')) throw Error('UNEXPECTED_QUERY');
        return sessions.get(args[0])??null;
      }
    };}};}
  };
}

function environment(db=fakeDB()) {return {CF_ACCESS_TEAM_DOMAIN:TEAM,CF_ACCESS_AUD:AUD,SUITE_ALLOWED_ORIGIN:SITE,SUITE_SESSION_SECRET:'unit-test-secret-of-at-least-thirty-two-bytes',SUITE_ADMIN_USER_ID:'admin-1',SUITE_ADMIN_PASSWORD:'unit-test-password',SUITE_ADMIN_SESSION_SECRET:'separate-admin-key-at-least-thirty-two-bytes',DB:db,__testNow:fixedTime};}
async function assertion(key,overrides={}) {
  const {alg='RS256',iss=TEAM,aud=AUD,sub='person-1',email='Person@Example.Test',exp=Math.floor(fixedTime/1000)+300}=overrides;
  return new SignJWT({email}).setProtectedHeader({alg,typ:'JWT',kid:'test-key'}).setIssuer(iss).setAudience(aud).setSubject(sub).setIssuedAt(Math.floor(fixedTime/1000)).setExpirationTime(exp).sign(key);
}
const cookieHeader=response => response.headers.get('Set-Cookie')?.split(';')[0];
const request=(path,options={})=>new Request(SITE+path,options);

test('Access assertion requires Cloudflare JWKS signature, issuer, audience and unexpired claims',async()=>{
  const wrong=await generateKeyPair('RS256');
  const jwk=await exportJWK(pair.publicKey);jwk.kid='test-key';jwk.alg='RS256';
  const env=environment();
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.equal(String(url),TEAM+'/cdn-cgi/access/certs');
    return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
  };
  try {
    for(const [token,accepted] of [
      [await assertion(pair.privateKey),true],
      [await assertion(wrong.privateKey),false],
      [await assertion(pair.privateKey,{iss:'https://evil.example.test'}),false],
      [await assertion(pair.privateKey,{aud:'other'}),false],
      [await assertion(pair.privateKey,{exp:Math.floor(fixedTime/1000)-60}),false]
    ]) {
      const response=await fetchCloudflare(request('/auth/complete?return_to=/',{headers:{'Cf-Access-Jwt-Assertion':token}}),env);
      assert.equal(response.status,accepted?303:403);
    }
    assert.equal(env.DB.sessions.size,1);
  } finally {globalThis.fetch=originalFetch;}
});

test('session is bound to D1, expires, revokes on logout and fails closed on D1 outage',async()=>{
  const env=environment();
  const jwk=await exportJWK(pair.publicKey);jwk.kid='test-key';jwk.alg='RS256';
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
  try {
    const login=await fetchCloudflare(request('/auth/complete',{headers:{'Cf-Access-Jwt-Assertion':await assertion(pair.privateKey)}}),env);
    assert.equal(login.status,303);
    assert.match(login.headers.get('Set-Cookie'),/__Host-suite-session=.*HttpOnly; Secure; SameSite=Strict/);
    const cookie=cookieHeader(login),authenticated=request('/trial/session',{headers:{Cookie:cookie}});
    assert.deepEqual(await readSession(authenticated,env),{userID:'person-1',email:'person@example.test'});
    assert.equal(await adminAuthenticated(authenticated,{...env,SUITE_ADMIN_USER_ID:'person-1',SUITE_ADMIN_PASSWORD:'test-password',SUITE_ADMIN_SESSION_SECRET:'separate-admin-key-at-least-thirty-two-bytes'},{role:'admin',platformUserID:'person-1'}),false);
    assert.equal((await fetchCloudflare(request('/trial/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.example.test'}}),env)).status,403);
    const expired={...env,__testNow:fixedTime+12*60*60*1000+1000};
    assert.equal(await readSession(authenticated,expired),null);
    const forged=request('/trial/session',{headers:{Cookie:cookie+'tampered'}});
    assert.equal((await fetchCloudflare(forged,env)).status,401);
    assert.equal(env.DB.sessions.size,1);
    assert.match([...env.DB.sessions.keys()][0],/^[a-f0-9]{64}$/);
    env.DB.setFail(true);
    await assert.rejects(readSession(authenticated,env),/DB_UNAVAILABLE/);
    assert.equal((await fetchCloudflare(authenticated,env)).status,503);
    assert.equal((await fetchCloudflare(request('/auth/logout',{headers:{Cookie:cookie}}),env)).status,503);
    env.DB.setFail(false);
    const logout=await fetchCloudflare(request('/auth/logout',{headers:{Cookie:cookie,'Sec-Fetch-Site':'same-origin'}}),env);
    assert.equal(logout.status,303);
    assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
    assert.equal(await readSession(authenticated,env),null);
    assert.equal((await fetchCloudflare(authenticated,env)).status,401);
    assert.equal(env.DB.sessions.values().next().value.revoked_at,Math.floor(fixedTime/1000));
  } finally {globalThis.fetch=oldFetch;}
});

test('anonymous editor remains public; forged identity headers and cross-origin logout are denied',async()=>{
  const env=environment();
  const anonymous=await fetchCloudflare(request('/trial/session'),env);
  assert.equal(anonymous.status,200);
  assert.equal((await anonymous.json()).principal,null);
  const forged=await fetchCloudflare(request('/trial/session',{headers:{'oai-authenticated-user-id':'admin','oai-authenticated-user-email':'admin@example.test'}}),env);
  assert.equal((await forged.json()).principal,null);
  assert.equal((await fetchCloudflare(request('/v1/assets',{method:'POST',headers:{Origin:SITE,'oai-authenticated-user-id':'admin'}}),env)).status,401);
  assert.equal((await fetchCloudflare(request('/trial/logout',{method:'POST',headers:{Origin:'https://evil.example.test'}}),env)).status,403);
  assert.equal((await fetchCloudflare(request('/auth/logout',{headers:{'Sec-Fetch-Site':'cross-site'}}),env)).status,403);
  assert.equal((await fetchCloudflare(request('/auth/logout',{headers:{Origin:'https://evil.example.test'}}),env)).status,403);
  assert.equal((await fetchCloudflare(request('/auth/logout?return_to=/&return_to=/'),env)).status,400);
  assert.equal((await fetchCloudflare(request('/auth/complete',{headers:{'oai-authenticated-user-id':'admin'}}),env)).status,403);
  const staticOnly={SUITE_ALLOWED_ORIGIN:SITE,ASSETS:{fetch:async()=>new Response('editor',{status:200})}};
  assert.equal((await fetchCloudflare(request('/'),staticOnly)).status,200);
});

test('missing admin secrets keep browser editor anonymous and deny every private API',async()=>{
  const env=environment();
  const jwk=await exportJWK(pair.publicKey);jwk.kid='test-key';jwk.alg='RS256';
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
  try {
    const login=await fetchCloudflare(request('/auth/complete',{headers:{'Cf-Access-Jwt-Assertion':await assertion(pair.privateKey)}}),env);
    assert.equal(login.status,303);
    const cookie=cookieHeader(login);
    const disabled={...env,SUITE_ADMIN_PASSWORD:undefined,ASSETS:{fetch:async()=>new Response('editor',{status:200})}};
    const session=await fetchCloudflare(request('/trial/session',{headers:{Cookie:cookie,'oai-authenticated-user-id':'admin-1'}}),disabled);
    assert.equal(session.status,200);
    assert.deepEqual((({principal,anonymousLocal,adminPasswordAuthenticated,signInURL})=>({principal,anonymousLocal,adminPasswordAuthenticated,signInURL}))(await session.json()),
      {principal:null,anonymousLocal:true,adminPasswordAuthenticated:false,signInURL:null});
    for(const path of ['/v1/assets','/trial/drafts','/trial/admin/login','/trial/logout','/auth/complete','/auth/whoami']) {
      const result=await fetchCloudflare(request(path,{headers:{Cookie:cookie,'oai-authenticated-user-id':'admin-1'}}),disabled);
      assert.equal(result.status,503,path);
    }
    disabled.DB.setFail(true);
    assert.equal((await fetchCloudflare(request('/',{headers:{Cookie:cookie}}),disabled)).status,200);
    disabled.DB.setFail(false);
    const logout=await fetchCloudflare(request('/auth/logout',{headers:{Cookie:cookie}}),disabled);
    assert.equal(logout.status,303);
    assert.equal(await readSession(request('/trial/session',{headers:{Cookie:cookie}}),env),null);
    for(const missing of ['SUITE_ADMIN_USER_ID','SUITE_ADMIN_SESSION_SECRET']) {
      const variant={...env,[missing]:undefined};
      assert.equal((await fetchCloudflare(request('/v1/assets'),variant)).status,503,missing);
    }
  } finally {globalThis.fetch=oldFetch;}
});
