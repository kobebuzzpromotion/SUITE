import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {handleRequest} from '../src/worker.mjs';

// Executable Worker + SQL contract. D1, R2, identity dispatch, and streaming digest are test doubles.
const hash = b => createHash('sha256').update(b).digest('hex');
const bytes = text => new TextEncoder().encode(text);

class D1 {
  constructor() {this.db = new DatabaseSync(':memory:'); this.db.exec('PRAGMA foreign_keys=ON'); this.failMetrics = false;}
  prepare(sql) {
    const db = this;
    function bind(args = []) {return {sql, args, bind(...next) {return bind(next);},
      async all() {return {results: db.db.prepare(sql).all(...args), meta:{rows_read:0,rows_written:0}};},
      async first() {return db.db.prepare(sql).get(...args) ?? null;},
      async run() {if (db.failMetrics && sql.startsWith('INSERT INTO site_metrics')) throw Error('METERING_DOWN');
        const result = db.db.prepare(sql).run(...args); return {meta:{changes:Number(result.changes),rows_read:0,rows_written:Number(result.changes)}};}};}
    return bind();
  }
  async batch(statements) {this.db.exec('BEGIN IMMEDIATE'); try {const result=[];
    for (const statement of statements) result.push(await statement.run());
    this.db.exec('COMMIT'); return result;
  } catch (error) {this.db.exec('ROLLBACK'); throw error;}}
  close() {this.db.close();}
}

class R2 {
  objects = new Map(); writes = 0; failWrite = false;
  async get(key) {const stored=this.objects.get(key); if (!stored) return null;
    const b=stored.slice(); return {size:b.length,body:new ReadableStream({start(c) {c.enqueue(b);c.close();}}),async arrayBuffer() {return b.slice().buffer;}};}
  async put(key, input, options) {if (options?.onlyIf?.etagDoesNotMatch==='*' && this.objects.has(key)) return null;
    if (this.failWrite) throw Object.assign(Error('SYNTHETIC_R2_WRITE_FAILURE'),{code:'ENOSPC'});
    this.writes++; this.objects.set(key,new Uint8Array(input).slice()); return this.get(key);}
  async createMultipartUpload(key) {const bucket=this,parts=new Map();
    return {async uploadPart(n,body) {parts.set(n,new Uint8Array(await new Response(body).arrayBuffer()));return {partNumber:n,etag:String(n)};},
      async complete(list) {assert.equal(bucket.objects.has(key),false,'Original must be create-only');
        const all=list.map(p=>parts.get(p.partNumber)); const merged=new Uint8Array(all.reduce((sum,b)=>sum+b.length,0));
        let offset=0;for(const b of all){merged.set(b,offset);offset+=b.length;}bucket.objects.set(key,merged);return bucket.get(key);}};
  }
}

async function setup({limit=100_000_000}={}) {
  const DB=new D1(),BUCKET=new R2();
  for(const file of ['0000_suite_sites.sql','0001_suite_sites.sql','0002_suite_sites.sql'])
    DB.db.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const now=Date.parse('2026-10-03T09:00:00Z');
  const env={DB,BUCKET,SUITE_TRUST_SITES_DISPATCH:'1',SUITE_ALLOWED_ORIGIN:'https://suite.test',__testNow:now,
    SUITE_TRIAL_STORAGE_LIMIT_BYTES:String(limit),SUITE_TRIAL_R2_WRITE_LIMIT_MONTH:'10000',
    SUITE_TRIAL_R2_READ_LIMIT_MONTH:'10000',SUITE_TRIAL_REQUEST_LIMIT_DAY:'10000',
    __testDigest:async object=>{const b=await object.arrayBuffer();return {sha256:hash(new Uint8Array(b)),size:b.byteLength};}};
  function member(name) {const id=randomUUID(),email=name+'@example.test',user='user-'+id;
    DB.db.prepare('INSERT INTO site_members(id,email,credit_name,role,active,invite_expires,created_at,trial_ends_at) VALUES(?,?,?,?,1,?,?,?)')
      .run(id,email,name,'author',now+10_000,new Date(now).toISOString(),now+1_000_000);return {id,email,user};}
  const alice=member('alice'),bob=member('bob');
  async function call(path,{actor=alice,method='GET',body,headers={}}={}) {
    const binary=body instanceof Uint8Array;
    const request=new Request('https://suite.test'+path,{method,headers:{'X-Suite-Trial':'1',
      'oai-authenticated-user-id':actor.user,'oai-authenticated-user-email':actor.email,
      ...(['GET','HEAD'].includes(method)?{}:{Origin:'https://suite.test'}),
      ...(body===undefined?{}:{'Content-Type':binary?'application/octet-stream':'application/json'}),...headers},
      ...(body===undefined?{}:{body:binary?body:JSON.stringify(body)})});
    const response=await handleRequest(request,env);const raw=new Uint8Array(await response.arrayBuffer());
    let json;try{json=JSON.parse(new TextDecoder().decode(raw));}catch{}
    return {status:response.status,json,raw};
  }
  async function asset(input,actor=alice) {const result=await call('/v1/assets',{actor,method:'POST',body:{name:'synthetic.bin',sha256:hash(input),size:input.length}});
    assert.equal(result.status,201,JSON.stringify(result.json));return result.json;}
  return {DB,BUCKET,env,alice,bob,call,asset,close:()=>DB.close()};
}

test('tenant ownership rejects another member at asset, upload, part and original boundaries',async()=>{
  const f=await setup();try {const b=bytes('SYNTHETIC-NON-RAW'),a=await f.asset(b);
    const upload=(await f.call(`/v1/assets/${a.id}/uploads`,{method:'POST'})).json;
    for(const path of [`/v1/assets/${a.id}/uploads`,`/v1/assets/${a.id}/recipe`,`/v1/assets/${a.id}/original?purpose=final-jpeg`])
      assert.equal((await f.call(path,{actor:f.bob})).status,404,path);
    assert.equal((await f.call(`/v1/uploads/${upload.id}/parts/1`,{actor:f.bob,method:'PUT',body:b,
      headers:{'X-Suite-Part-SHA256':hash(b)}})).status,404);
    assert.equal(f.BUCKET.objects.size,0);
  }finally{f.close();}
});

test('part retry is immutable; Cloud Safe requires verified final and fails closed after object loss',async()=>{
  const f=await setup();try {const b=bytes('SYNTHETIC-NON-RAW'),a=await f.asset(b),path=`/v1/assets/${a.id}`;
    const upload=(await f.call(path+'/uploads',{method:'POST'})).json;
    const part=`/v1/uploads/${upload.id}/parts/1`,send=()=>f.call(part,{method:'PUT',body:b,headers:{'X-Suite-Part-SHA256':hash(b)}});
    assert.equal((await f.call(path+'/original?purpose=final-jpeg')).status,409);
    assert.equal((await send()).status,200);const firstKey=[...f.BUCKET.objects.keys()][0],original=f.BUCKET.objects.get(firstKey);
    assert.equal((await send()).status,200);assert.strictEqual(f.BUCKET.objects.get(firstKey),original);
    assert.equal(f.BUCKET.writes,1);
    const complete=await f.call(`/v1/uploads/${upload.id}/complete`,{method:'POST'});
    assert.equal(complete.status,200,JSON.stringify(complete.json));assert.equal(complete.json.cloudSafe,true);
    const finalKey=f.DB.db.prepare('SELECT object_key FROM site_uploads WHERE id=?').get(upload.id).object_key;
    assert.equal((await f.call(path+'/original?purpose=final-jpeg')).status,200);
    f.BUCKET.objects.delete(finalKey);
    assert.equal((await f.call(path+'/original?purpose=final-jpeg')).status,409);
    assert.equal(f.DB.db.prepare('SELECT cloud_safe FROM assets WHERE id=?').get(a.id).cloud_safe,0);
    assert.strictEqual(f.BUCKET.objects.get(firstKey),original);
  }finally{f.close();}
});

test('quota admission and metering failure retain previously committed data',async()=>{
  const f=await setup({limit:40});try {const b=bytes('12345678901234567890'),a=await f.asset(b);
    assert.equal(f.DB.db.prepare('SELECT bytes FROM site_storage_reservations WHERE asset_id=?').get(a.id).bytes,40);
    const second=await f.call('/v1/assets',{method:'POST',body:{name:'overflow',sha256:hash(b),size:1}});
    assert.equal(second.status,429);assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM assets').get().n,1);
    f.DB.failMetrics=true;const response=await f.call('/v1/assets');assert.equal(response.status,503);
    assert.equal(response.json.error,'USAGE_ACCOUNTING_UNAVAILABLE');
    assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM assets').get().n,1);
  }finally{f.close();}
});

test('R2 write failure keeps the reservation and upload resumable without claiming Cloud Safe',async()=>{
  const f=await setup();try {const b=bytes('SYNTHETIC-NON-RAW'),a=await f.asset(b);
    const upload=(await f.call(`/v1/assets/${a.id}/uploads`,{method:'POST'})).json;
    f.BUCKET.failWrite=true;
    const failed=await f.call(`/v1/uploads/${upload.id}/parts/1`,{method:'PUT',body:b,
      headers:{'X-Suite-Part-SHA256':hash(b)}});
    assert.equal(failed.status,503);
    assert.equal(f.DB.db.prepare('SELECT cloud_safe FROM assets WHERE id=?').get(a.id).cloud_safe,0);
    assert.equal(f.DB.db.prepare('SELECT status FROM site_uploads WHERE id=?').get(upload.id).status,'UPLOADING');
    assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM site_parts WHERE upload_id=?').get(upload.id).n,0);
    assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM site_storage_objects WHERE asset_id=?').get(a.id).n,1,
      'conservative reservation is retained until reconciliation');
    f.BUCKET.failWrite=false;
    assert.equal((await f.call(`/v1/uploads/${upload.id}/parts/1`,{method:'PUT',body:b,
      headers:{'X-Suite-Part-SHA256':hash(b)}})).status,200);
    assert.equal((await f.call(`/v1/uploads/${upload.id}/complete`,{method:'POST'})).json.cloudSafe,true);
  }finally{f.close();}
});
