import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,relative,sep} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const ts=require('typescript');
const server=new URL('../dist-cloudflare/server/index.js',import.meta.url);
const config=new URL('../cloudflare/wrangler.example.jsonc',import.meta.url);
const read=async url=>readFile(url,'utf8');

async function files(directory) {
  const output=[];
  async function walk(path) {for(const name of await readdir(path)) {
    const full=join(path,name),info=await stat(full);
    if(info.isDirectory()) await walk(full);else output.push(relative(directory,full).split(sep).join('/'));
  }}
  await walk(directory);return output.sort();
}

test('dedicated Cloudflare build uses its signed-session entry and emits one self-contained Worker',async()=>{
  const source=await read(new URL('../build-cloudflare.mjs',import.meta.url));
  assert.match(source,/cloudflare-entry\.mjs/);
  const bundle=await read(server);
  assert.ok(bundle.length>1_000,'bundle exists, rather than an empty stub');
  assert.doesNotMatch(bundle,/\bfrom\s*["']\.\.?\//,'runtime source imports must be bundled');
  const entry=await import(server.href+'?artifact-test='+Date.now());
  assert.equal(typeof entry.default?.fetch,'function');
  const origin='https://suite-artifact.test';
  const missingSecrets=await entry.default.fetch(new Request(origin+'/auth/whoami'),{SUITE_ALLOWED_ORIGIN:origin});
  assert.equal(missingSecrets.status,503,'missing administrator configuration must fail closed');
  const env={SUITE_ALLOWED_ORIGIN:origin,SUITE_ADMIN_USER_ID:'test-admin',
    SUITE_ADMIN_PASSWORD:crypto.randomUUID(),SUITE_ADMIN_SESSION_SECRET:crypto.randomUUID()+crypto.randomUUID()};
  const auth=await entry.default.fetch(new Request(origin+'/auth/whoami'),env);
  assert.equal(auth.status,403,'Cloudflare Access assertion gate must be present in the emitted entry');
  const spoof=await entry.default.fetch(new Request(origin+'/v1/assets',{headers:{
    'X-Suite-Trial':'1','oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'spoof@example.test'}}),
  env);
  assert.equal(spoof.status,401,'caller-controlled identity headers must not grant storage access');
});

test('public ASSETS contain only browser assets and no private data, deployment material or credential literals',async()=>{
  const client=new URL('../dist-cloudflare/client/',import.meta.url);
  const names=await files(fileURLToPath(client));
  assert.ok(names.includes('index.html')&&names.includes('app.js')&&names.includes('styles.css'));
  const allowed=name=>/^(index\.html|app\.js|styles\.css|editorial-landing\.css|editorial-editor\.css|processing-worker\.js)$/.test(name)||
    /^assets\/[A-Za-z0-9/_.,-]+\.png$/.test(name)||
    /^vendor\/[A-Za-z0-9/_.,-]+$/.test(name)||
    /^licenses\/[A-Za-z0-9/_.,-]+$/.test(name)||
    /^runtime_assets\/[A-Za-z0-9/_.,-]+$/.test(name);
  for(const name of names) assert.ok(allowed(name),`unexpected public asset: ${name}`);
  for(const name of names.filter(x=>/\.(?:js|html|css|json|txt|md)$/i.test(x))) {
    const content=await readFile(new URL('../dist-cloudflare/client/'+name,import.meta.url),'utf8');
    assert.doesNotMatch(content,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk_(?:live|test)_[A-Za-z0-9]{12,}|\b(?:SUITE_ADMIN_PASSWORD|SUITE_SESSION_SECRET|SUITE_ADMIN_SESSION_SECRET|CF_ACCESS_AUD|CF_ACCESS_TEAM_DOMAIN)\b|\bCREATE TABLE\s+(?:site_members|assets)\b/i,`sensitive material in ${name}`);
  }
});

test('anonymous preview serves every editorial UI asset needed by the landing and editor',async()=>{
  const entry=await import(server.href+'?editorial-assets-test='+Date.now());
  const origin='https://suite-artifact.test',seen=[];
  const env={SUITE_ALLOWED_ORIGIN:origin,ASSETS:{fetch:async request=>{seen.push(new URL(request.url).pathname);return new Response('asset',{status:200});}}};
  for(const path of ['/editorial-landing.css','/editorial-editor.css','/assets/suite-editorial-hero-clean.png']){
    const response=await entry.default.fetch(new Request(origin+path),env);
    assert.equal(response.status,200,path);
  }
  assert.deepEqual(seen,['/editorial-landing.css','/editorial-editor.css','/assets/suite-editorial-hero-clean.png']);
  const denied=await entry.default.fetch(new Request(origin+'/assets/private-secret.png'),env);
  assert.equal(denied.status,404);
});

test('template has exact ASSETS/DB/BUCKET bindings and cannot be mistaken for connected production resources',async()=>{
  const parsed=ts.parseConfigFileTextToJson(fileURLToPath(config),await read(config));
  assert.equal(parsed.error,undefined,parsed.error?.messageText);
  const value=parsed.config;
  assert.equal(value?.main,'../dist-cloudflare/server/index.js');
  assert.equal(value?.assets?.binding,'ASSETS');
  assert.equal(value?.assets?.run_worker_first,true);
  assert.equal(value?.d1_databases?.length,1);
  assert.equal(value?.d1_databases?.[0]?.binding,'DB');
  assert.equal(value?.r2_buckets?.length,1);
  assert.equal(value?.r2_buckets?.[0]?.binding,'BUCKET');
  assert.equal(value?.assets?.directory,'../dist-cloudflare/client');
  const id=String(value.d1_databases[0].database_id??'');
  assert.ok(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id),'real D1 UUID is not allowed in the template');
  assert.match(id,/placeholder|replace|not[-_ ]?configured|example|TODO/i,'D1 ID must visibly require replacement');
  for(const name of [value.d1_databases[0].database_name,value.r2_buckets[0].bucket_name])
    assert.match(String(name??''),/placeholder|replace|not[-_ ]?configured|example|TODO/i,
      'resource name must visibly require replacement');
  const text=await read(config);
  assert.doesNotMatch(text,/\b(?:SUITE_SESSION_SECRET|SUITE_ADMIN_PASSWORD|SUITE_ADMIN_SESSION_SECRET)\s*[=:]\s*["'][^"']+["']/,
    'secret values cannot be stored in the template');
});
