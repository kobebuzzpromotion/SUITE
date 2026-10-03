// Immutable local evidence for the dedicated Cloudflare adapter. Never claims live deployment.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';

const report=resolve(process.argv[2]||'');
const evidenceRoot=resolve('docs/evidence')+sep;
if(!report.startsWith(evidenceRoot)||!report.endsWith('.json'))throw Error('NEW_EVIDENCE_PATH_REQUIRED');
const commands=[];
function execute(args){
  const startedAt=new Date().toISOString();
  const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024});
  const item={command:['node',...args],startedAt,endedAt:new Date().toISOString(),exitCode:result.status,signal:result.signal,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error?.message??null};
  commands.push(item);return item;
}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(resolve(dir,entry.name)):[resolve(dir,entry.name)]);}
const source=[
  ...walk('apps/sites/src'),...walk('apps/sites/db'),...walk('apps/sites/drizzle'),...walk('apps/sites/cloudflare'),
  ...walk('apps/sites/tests'),...walk('apps/web/src'),...walk('contracts'),
  resolve('apps/sites/build-cloudflare.mjs'),resolve('apps/sites/package.json'),resolve('apps/web/preset-policy.mjs'),
  resolve('scripts/cloudflare-regression.mjs'),resolve('package.json'),resolve('package-lock.json')
].filter(path=>!path.includes(`${sep}dist${sep}`)).map(path=>({path:relative('.',path).replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})).sort((a,b)=>a.path.localeCompare(b.path));
const buildID=createHash('sha256').update(source.map(item=>`${item.path}\0${item.sha256}\n`).join('')).digest('hex');
const build=execute(['node_modules/typescript/bin/tsc','-p','tsconfig.json']);
const webFiles=readdirSync('apps/web/tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'apps/web/tests/'+name);
const web=build.exitCode===0?execute(['--test','--test-reporter=tap',...webFiles]):null;
const cloudflareBuild=web?.exitCode===0?execute(['apps/sites/build-cloudflare.mjs']):null;
const sitesFiles=readdirSync('apps/sites/tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'apps/sites/tests/'+name);
const sites=cloudflareBuild?.exitCode===0?execute(['--test','--test-reporter=tap',...sitesFiles]):null;
const count=(run,name)=>Number(new RegExp(`^# ${name} (\\d+)$`,'m').exec(run?.stdout??'')?.[1]??-1);
const result={generatedAt:new Date().toISOString(),environment:{platform:process.platform,node:process.version},commitSHA:'NOT_AVAILABLE: repository has no commit',buildID:`source-sha256:${buildID}`,
  status:build.exitCode===0&&web?.exitCode===0&&cloudflareBuild?.exitCode===0&&sites?.exitCode===0&&count(web,'fail')===0&&count(sites,'fail')===0?'PASS_LOCAL_ONLY':'FAIL',
  totals:{web:{total:count(web,'tests'),pass:count(web,'pass'),fail:count(web,'fail'),skip:count(web,'skipped')},cloudflare:{total:count(sites,'tests'),pass:count(sites,'pass'),fail:count(sites,'fail'),skip:count(sites,'skipped')}},
  externalGates:{cloudflareAccess:'NOT_RUN',cloudflareD1:'NOT_RUN',cloudflareR2:'NOT_RUN',productionURL:'NOT_RUN',realRAW:'NOT_RUN',realImage:'NOT_RUN',iPhone:'NOT_RUN',iPad:'NOT_RUN',mobileRelease:'BLOCK'},
  commands,sourceHashes:source};
mkdirSync(dirname(report),{recursive:true});writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,totals:result.totals,buildID:result.buildID,report},null,2));
if(result.status==='FAIL')process.exitCode=1;
