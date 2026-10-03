#!/usr/bin/env node
/** Local, non-deploying preparation for an official Sites source checkout. */
import {createHash} from 'node:crypto';
import {cpSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const defaultRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourceEntries=[
  'package.json','package-lock.json','tsconfig.json','contracts',
  'apps/backend/src','apps/backend/tests',
  'apps/web/src','apps/web/index.html','apps/web/build.mjs','apps/web/preset-policy.mjs',
  'apps/sites/src','apps/sites/db','apps/sites/drizzle','apps/sites/.openai/hosting.json',
  'apps/sites/build.mjs','apps/sites/package.json','apps/sites/drizzle.config.ts','apps/sites/generate-migration.mjs',
  '.runtime/web-assets/mediapipe-LICENSE.txt','.runtime/web-assets/face_landmarker.task',
  'dist/apps/backend/src','dist/web'
];
const requiredBuildFiles=[
  'apps/sites/dist/server/index.js','apps/sites/dist/server/wrangler.json',
  'apps/sites/dist/.openai/hosting.json','apps/sites/dist/client/index.html',
  'apps/sites/dist/client/app.js','apps/sites/dist/client/styles.css',
  'apps/sites/dist/client/processing-worker.js','apps/sites/dist/client/vendor/libraw/libraw.wasm',
  'apps/sites/dist/client/runtime_assets/face_landmarker.task',
  'dist/web/index.html','dist/web/app.js','dist/web/styles.css',
  'dist/web/processing-worker.js','dist/web/vendor/libraw/libraw.wasm',
  'dist/web/runtime_assets/face_landmarker.task'
];
const from=(root,path)=>resolve(root,...path.split('/'));
function requirePath(root,path){
  let current=root;
  for(const component of path.split('/')){
    current=join(current,component);
    if(!existsSync(current))throw Error(`PREP_MISSING:${path}`);
    if(lstatSync(current).isSymbolicLink())throw Error(`PREP_SYMLINK:${path}`);
  }
  return current;
}
function filesUnder(directory){
  const files=[];
  function visit(folder){for(const item of readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const path=join(folder,item.name);if(item.isSymbolicLink())throw Error(`PREP_SYMLINK:${path}`);
    if(item.isDirectory())visit(path);else if(item.isFile())files.push(path);else throw Error(`PREP_NON_FILE:${path}`);
  }}visit(directory);return files;
}
function inventory(root){const files=filesUnder(root).map(path=>({path:relative(root,path).split(sep).join('/'),sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
  files.sort((a,b)=>a.path.localeCompare(b.path));const digest=createHash('sha256');for(const item of files)digest.update(`${item.path}\0${item.sha256}\n`);return {fileCount:files.length,sha256:digest.digest('hex'),files};}
function sameTree(a,b){const x=inventory(a),y=inventory(b);return x.sha256===y.sha256;}
function parseJSON(root,path){try{return JSON.parse(readFileSync(requirePath(root,path),'utf8'));}catch(error){throw Error(`PREP_INVALID_JSON:${path}:${error.message}`);}}

/** Verify only local build outputs and logical names; this never probes a Site. */
export function inspectLocalBuild(root=defaultRoot){
  const base=resolve(root);
  for(const path of [...sourceEntries,...requiredBuildFiles]){
    const full=requirePath(base,path);
    if(sourceEntries.includes(path)&&lstatSync(full).isDirectory())filesUnder(full);
  }
  const hosting=parseJSON(base,'apps/sites/.openai/hosting.json');
  const builtHosting=parseJSON(base,'apps/sites/dist/.openai/hosting.json');
  const worker=parseJSON(base,'apps/sites/dist/server/wrangler.json');
  if(Object.hasOwn(hosting,'project_id')||Object.hasOwn(builtHosting,'project_id'))throw Error('PREP_PRODUCTION_PROJECT_ID_REFUSED');
  if(hosting.d1?.binding!=='DB'||hosting.r2?.binding!=='BUCKET'||JSON.stringify(hosting)!==JSON.stringify(builtHosting))throw Error('PREP_LOGICAL_BINDING_MISMATCH');
  if(worker.main!=='index.js'||worker.assets?.binding!=='ASSETS'||worker.d1_databases?.[0]?.binding!=='DB'||worker.r2_buckets?.[0]?.binding!=='BUCKET')throw Error('PREP_WORKER_BINDING_MISMATCH');
  if(worker.d1_databases[0].database_id!=='local-not-production')throw Error('PREP_PRODUCTION_DATABASE_ID_REFUSED');
  const server=from(base,'apps/sites/dist/server');
  if(resolve(server,worker.assets.directory)!==from(base,'apps/sites/dist/client'))throw Error('PREP_CLIENT_PATH_MISMATCH');
  if(resolve(server,worker.d1_databases[0].migrations_dir)!==from(base,'apps/sites/drizzle'))throw Error('PREP_MIGRATION_PATH_MISMATCH');
  if(!sameTree(from(base,'dist/web'),from(base,'apps/sites/dist/client')))throw Error('PREP_WEB_CLIENT_BUILD_MISMATCH');
  const migrations=filesUnder(from(base,'apps/sites/drizzle')).filter(path=>/\d{4}_suite_sites\.sql$/.test(path));
  if(!migrations.length)throw Error('PREP_MIGRATIONS_MISSING');
  return {root:base,logicalBindings:{d1:'DB',r2:'BUCKET',assets:'ASSETS'},
    localDatabaseId:worker.d1_databases[0].database_id,
    migrationFiles:migrations.map(path=>relative(from(base,'apps/sites/drizzle'),path).split(sep).join('/')).sort()};
}

/** Copy an allowlisted source tree and a non-deployable artifact candidate. */
export function prepareSitesCheckout({root=defaultRoot,output}){
  if(typeof output!=='string'||!output.trim())throw Error('PREP_OUTPUT_REQUIRED');
  const base=resolve(root),target=resolve(output),inside=relative(base,target);
  if(!inside||inside!=='..'&&!inside.startsWith('..'+sep)&&!isAbsolute(inside))throw Error('PREP_OUTPUT_UNSAFE');
  if(existsSync(target))throw Error('PREP_OUTPUT_EXISTS');
  const info=inspectLocalBuild(base);
  mkdirSync(target,{recursive:true});
  const source=join(target,'source'),candidate=join(target,'NON_DEPLOYABLE_CANDIDATE');
  for(const path of sourceEntries){const destination=from(source,path);mkdirSync(dirname(destination),{recursive:true});cpSync(from(base,path),destination,{recursive:true,errorOnExist:true,force:false});}
  const artifactCopies=[
    ['apps/sites/dist/server', 'dist/server'],
    ['apps/sites/dist/client', 'dist/client'],
    ['apps/sites/dist/.openai/hosting.json', '.openai/hosting.json'],
    ['apps/sites/drizzle', 'drizzle']
  ];
  for(const [input,path] of artifactCopies){const destination=from(candidate,path);mkdirSync(dirname(destination),{recursive:true});cpSync(from(base,input),destination,{recursive:true,errorOnExist:true,force:false});}
  const sourceHash=inventory(source),artifactHash=inventory(candidate);
  const evidence={schemaVersion:1,status:'LOCAL_PACKAGE_PREPARED_NOT_DEPLOYABLE',
    source:{directory:'source',fileCount:sourceHash.fileCount,sha256:sourceHash.sha256,files:sourceHash.files},
    artifact:{directory:'NON_DEPLOYABLE_CANDIDATE',fileCount:artifactHash.fileCount,sha256:artifactHash.sha256,files:artifactHash.files},
    localChecks:{workerExists:true,clientMatchesWebBuild:true,migrations:info.migrationFiles,logicalBindings:info.logicalBindings,
      databaseId:info.localDatabaseId==='local-not-production'?'LOCAL_PLACEHOLDER_NOT_PRODUCTION':'UNVERIFIED_LOCAL_VALUE'},
    gates:{officialSourceCheckout:'NOT_RUN',selectedSiteProjectId:'MISSING_NOT_WRITTEN',sourceArtifactSameBuild:'NOT_PROVEN',
      actualD1Binding:'NOT_RUN',actualR2Binding:'NOT_RUN',runtimeSettings:'NOT_RUN',dispatchAuthentication:'NOT_RUN',
      inviteAuthorization:'NOT_RUN',deployment:'NOT_RUN'},
    notes:['This directory is not a Sites checkout or deployable archive.','No credential or selected production Site ID was requested or recorded.','Existing local build artifacts are copied without a fresh build; compare source and artifact SHA within the official checkout.']};
  writeFileSync(join(target,'PREP_EVIDENCE.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  return evidence;
}

function cli(argv){let root=defaultRoot,output;
  for(let i=0;i<argv.length;i++){if(argv[i]==='--root'&&argv[i+1])root=argv[++i];else if(argv[i]==='--output'&&argv[i+1])output=argv[++i];else throw Error(`PREP_UNKNOWN_ARGUMENT:${argv[i]}`);}
  const evidence=prepareSitesCheckout({root,output});process.stdout.write(JSON.stringify({status:evidence.status,output:resolve(output),sourceSHA256:evidence.source.sha256,artifactSHA256:evidence.artifact.sha256,gates:evidence.gates})+'\n');
  process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{cli(process.argv.slice(2));}catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}
