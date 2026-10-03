import {build} from 'esbuild-wasm';
import {mkdirSync,cpSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const here=resolve(import.meta.dirname),out=resolve(here,'dist');mkdirSync(out+'/server',{recursive:true});
// Reuse the exact Web build; no second editor or image engine.
cpSync(resolve(here,'../../dist/web'),out+'/client',{recursive:true});
await build({entryPoints:[here+'/src/worker.mjs'],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:out+'/server/index.js'});
const hosting=JSON.parse(readFileSync(here+'/.openai/hosting.json','utf8'));
mkdirSync(out+'/.openai',{recursive:true});cpSync(here+'/.openai/hosting.json',out+'/.openai/hosting.json');cpSync(here+'/drizzle',out+'/.openai/drizzle',{recursive:true});
writeFileSync(out+'/server/wrangler.json',JSON.stringify({name:'suite-sites-trial',main:'index.js',compatibility_date:'2026-10-03',assets:{directory:'../client',binding:'ASSETS',run_worker_first:true},d1_databases:[{binding:'DB',database_name:'suite-sites-trial',database_id:'local-not-production',migrations_dir:'../../drizzle'}],r2_buckets:[{binding:'BUCKET',bucket_name:'suite-sites-trial'}]},null,2));
console.log(JSON.stringify({status:'BUILT_NOT_DEPLOYED',worker:out+'/server/index.js',bindings:{d1:hosting.d1,r2:hosting.r2},realRAW:'NOT_RUN',chatGPT:'NOT_RUN'}));
