import {build} from 'esbuild-wasm';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';

const here=resolve(import.meta.dirname);
const root=resolve(here,'../..');
const web=resolve(root,'dist/web');
const out=resolve(here,'dist-cloudflare');
const client=resolve(out,'client');
const server=resolve(out,'server/index.js');
const files=['index.html','app.js','styles.css','editorial-landing.css','editorial-editor.css','processing-worker.js','local-personal-look-training-worker.mjs'];
const dirs=['assets','vendor','runtime_assets','licenses'];
function list(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?list(resolve(dir,entry.name)):[resolve(dir,entry.name)]);}
const expected=new Set([
  ...files,
  ...dirs.flatMap(dir=>existsSync(resolve(web,dir))?list(resolve(web,dir)).map(file=>relative(web,file).replaceAll('\\','/')):[])
]);

if(!files.every(file=>existsSync(resolve(web,file))))throw Error('WEB_BUILD_REQUIRED');
// A stale public file could survive a later build. Fail rather than silently publish it.
if(existsSync(client)&&list(client).some(file=>!expected.has(relative(client,file).replaceAll('\\','/'))))throw Error('STALE_PUBLIC_ASSET');
mkdirSync(client,{recursive:true});
mkdirSync(resolve(out,'server'),{recursive:true});
for(const file of files)cpSync(resolve(web,file),resolve(client,file));
for(const dir of dirs)if(existsSync(resolve(web,dir)))cpSync(resolve(web,dir),resolve(client,dir),{recursive:true});
await build({entryPoints:[resolve(here,'src/cloudflare-entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:server});

// Never publish source maps, QA pages, or local evidence with static assets.
const inventory=list(client).map(file=>({path:relative(client,file).replaceAll('\\','/'),bytes:statSync(file).size}));
if(inventory.some(item=>item.path.endsWith('.map')||item.path==='qa.js'||item.path==='processing-qa.html'))throw Error('PUBLIC_ASSET_ALLOWLIST_FAILED');
const digest=createHash('sha256').update(readFileSync(server)).digest('hex');
console.log(JSON.stringify({status:'BUILT_NOT_DEPLOYED',entry:'cloudflare-entry.mjs',worker:server,workerSHA256:digest,staticAssets:inventory.length,bindingsRequired:['ASSETS','DB','BUCKET'],secretsRequired:['SUITE_SESSION_SECRET','SUITE_ADMIN_PASSWORD','SUITE_ADMIN_SESSION_SECRET'],realCloudflare:'NOT_RUN'}));
