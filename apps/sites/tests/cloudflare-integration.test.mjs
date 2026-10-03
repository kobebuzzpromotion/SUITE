import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fetchCloudflare} from '../src/cloudflare-entry.mjs';
import {issueSession} from '../src/cloudflare-identity.mjs';

// Real entry/identity/Worker and SQL, with in-memory SQLite standing in for D1.
// Access, deployed Worker, D1, R2, browser IndexedDB and actual RAW are NOT exercised.
class D1Double {
  constructor() {this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');}
  prepare(sql) {const owner=this;return {bind(...args) {return {
    first:async()=>owner.db.prepare(sql).get(...args)??null,
    all:async()=>({results:owner.db.prepare(sql).all(...args)}),
    run:async()=>{const result=owner.db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};},
  };}};}
  async batch(statements) {this.db.exec('BEGIN IMMEDIATE');try {const result=[];for(const s of statements)result.push(await s.run());this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  close() {this.db.close();}
}

async function fixture() {
  const DB=new D1Double();
  for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort())
    DB.db.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const now=Date.parse('2026-10-03T09:00:00Z');
  const env={DB,BUCKET:{},ASSETS:{fetch:async()=>new Response('<html>Editor</html>',{headers:{'Content-Type':'text/html'}})},
    SUITE_ALLOWED_ORIGIN:'https://suite.test',CF_ACCESS_TEAM_DOMAIN:'https://team.cloudflareaccess.com',
    CF_ACCESS_AUD:'synthetic-audience',SUITE_SESSION_SECRET:'SYNTHETIC_TEST_SESSION_SECRET_LONG_ENOUGH_012345',
    SUITE_TRIAL_STORAGE_LIMIT_BYTES:'2147483648',SUITE_TRIAL_R2_WRITE_LIMIT_MONTH:'10000',
    SUITE_TRIAL_R2_READ_LIMIT_MONTH:'100000',SUITE_TRIAL_REQUEST_LIMIT_DAY:'10000',__testNow:now};
  function member(name,role='author') {
    const id=randomUUID(),user='platform-'+id,email=name.toLowerCase()+'@example.test';
    DB.db.prepare('INSERT INTO site_members(id,user_id,email,credit_name,role,active,invite_expires,created_at,trial_ends_at) VALUES(?,?,?,?,?,1,?,?,?)')
      .run(id,user,email,name,role,now+60000,new Date(now).toISOString(),now+86400000);
    return {id,user,email};
  }
  const alice=member('Alice'),bob=member('Bob'),admin=member('Admin','admin');
  env.SUITE_ADMIN_USER_ID=admin.user;
  env.SUITE_ADMIN_PASSWORD='SYNTHETIC_TEST_PASSWORD';
  env.SUITE_ADMIN_SESSION_SECRET='SYNTHETIC_ADMIN_SECRET_LONG_ENOUGH_012345';
  async function call(path,{actor=null,sessionCookie=null,method='GET',body,headers={}}={}) {
    const cookie=sessionCookie??(actor?await issueSession({userID:actor.user,email:actor.email},env):null);
    const request=new Request('https://suite.test'+path,{method,headers:{'X-Suite-Trial':'1',
      ...(!['GET','HEAD'].includes(method)?{Origin:'https://suite.test'}:{}),
      ...(cookie?{Cookie:cookie.split(';')[0]}:{}),
      ...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const response=await fetchCloudflare(request,env);let json;
    try {json=await response.clone().json();}catch{}
    return {status:response.status,json,headers:response.headers,text:await response.text()};
  }
  return {DB,env,alice,bob,admin,call,close:()=>DB.close()};
}

test('CF01: anonymous Editor and session work while private API rejects spoofed identity headers',async()=>{
  const f=await fixture();try {
    const spoof={'oai-authenticated-user-id':f.admin.user,'oai-authenticated-user-email':f.admin.email};
    const page=await f.call('/',{headers:spoof});assert.equal(page.status,200);assert.match(page.text,/Editor/);
    const session=await f.call('/trial/session',{headers:spoof});
    assert.equal(session.status,200);assert.equal(session.json.principal,null);
    assert.equal(session.json.anonymousLocal,true);
    assert.equal(session.json.signInURL,'/auth/complete?return_to=/');
    assert.equal((await f.call('/v1/assets',{headers:spoof})).status,401);
    assert.equal((await f.call('/trial/drafts',{headers:spoof})).status,401);
    assert.equal((await f.call('/auth/whoami',{headers:spoof})).status,403);
  }finally{f.close();}
});

test('CF02: each missing administrator secret closes all private APIs while anonymous Editor remains available',async()=>{
  const f=await fixture();try {
    for(const key of ['SUITE_ADMIN_USER_ID','SUITE_ADMIN_PASSWORD','SUITE_ADMIN_SESSION_SECRET']) {
      const configured=f.env[key];delete f.env[key];
      try {
        const anonymous=await f.call('/trial/session');
        assert.equal(anonymous.status,200,key);
        assert.equal(anonymous.json.principal,null,key);
        assert.equal(anonymous.json.anonymousLocal,true,key);
        assert.equal((await f.call('/',{actor:null})).status,200,key);
        for(const [path,actor] of [['/v1/assets',f.alice],['/trial/drafts',f.alice],
          ['/trial/members',f.admin],['/trial/submissions',f.admin]]) {
          const denied=await f.call(path,{actor});
          assert.equal(denied.status,503,`${key} ${path}`);
        }
        const login=await f.call('/trial/admin/login',{actor:f.admin,method:'POST',body:{password:'anything'}});
        assert.equal(login.status,503,key);
      }finally{f.env[key]=configured;}
    }
  }finally{f.close();}
});

test('CF03: signed sessions inherit asset and draft owner isolation',async()=>{
  const f=await fixture();try {
    const assetID=randomUUID(),draftID=randomUUID();
    f.DB.db.prepare('INSERT INTO assets(id,tenant_id,name,original_key,sha256,size) VALUES(?,?,?,?,?,?)')
      .run(assetID,'trial-'+f.alice.id,'PRIVATE.NON_RAW','original-'+assetID,'a'.repeat(64),10);
    f.DB.db.prepare('INSERT INTO site_drafts(id,author_id,revision,status,mutation_id) VALUES(?,?,?,?,?)')
      .run(draftID,f.alice.id,1,'DRAFT',randomUUID());
    const own=await f.call('/v1/assets',{actor:f.alice});assert.equal(own.status,200);
    assert.deepEqual(own.json.assets.map(x=>x.id),[assetID]);
    const other=await f.call('/v1/assets',{actor:f.bob});assert.equal(other.status,200);
    assert.deepEqual(other.json.assets,[]);
    assert.equal((await f.call('/v1/assets/'+assetID+'/recipe',{actor:f.bob})).status,404);
    assert.equal((await f.call('/trial/drafts/'+draftID,{actor:f.bob})).status,404);
    assert.equal((await f.call('/trial/drafts/'+draftID+'/submit',{actor:f.bob,method:'POST',body:{expectedRevision:1}})).status,404);
    assert.equal((await f.call('/trial/submissions',{actor:f.bob})).status,403);
  }finally{f.close();}
});

test('CF04: expiry and revocation remove cloud access and retain anonymous local entry',async()=>{
  const f=await fixture();try {
    f.DB.db.prepare('UPDATE site_members SET trial_ends_at=? WHERE id=?').run(f.env.__testNow,f.alice.id);
    const expired=await f.call('/trial/session',{actor:f.alice});
    assert.equal(expired.status,200);assert.equal(expired.json.principal,null);
    assert.equal(expired.json.endedReason,'TRIAL_EXPIRED');assert.equal(expired.json.anonymousLocal,true);
    assert.equal((await f.call('/v1/assets',{actor:f.alice})).status,403);
    f.DB.db.prepare('UPDATE site_members SET active=0 WHERE id=?').run(f.bob.id);
    const revoked=await f.call('/trial/session',{actor:f.bob});
    assert.equal(revoked.json.principal,null);assert.equal(revoked.json.endedReason,'TRIAL_REVOKED');
    assert.equal((await f.call('/trial/drafts',{actor:f.bob})).status,403);
  }finally{f.close();}
});

test('CF05: logout clears both cookies and arbitrary identity assertions cannot complete sign-in',async()=>{
  const f=await fixture();try {
    const sessionCookie=await issueSession({userID:f.alice.user,email:f.alice.email},f.env);
    assert.equal((await f.call('/trial/session',{sessionCookie})).json.principal.id,f.alice.id);
    const logout=await f.call('/auth/logout?return_to=/',{sessionCookie});
    assert.equal(logout.status,303);assert.equal(logout.headers.get('location'),'/');
    assert.match(logout.headers.get('set-cookie'),/__Host-suite-session=;/);
    assert.match(logout.headers.get('set-cookie'),/__Host-suite-admin=;/);
    const revokedSession=await f.call('/trial/session',{sessionCookie});
    assert.equal(revokedSession.status,401);
    assert.equal(revokedSession.json.error,'SESSION_INVALID');
    assert.equal((await f.call('/v1/assets',{sessionCookie})).status,401);
    assert.equal((await f.call('/auth/complete',{headers:{'Cf-Access-Jwt-Assertion':'not-a-jwt'}})).status,403);
    assert.equal((await f.call('/auth/complete?return_to=https://evil.test')).status,403);
  }finally{f.close();}
});
