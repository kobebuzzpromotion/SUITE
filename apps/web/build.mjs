import {build} from 'esbuild-wasm';
import {cpSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'dist/web');mkdirSync(out,{recursive:true});
await build({entryPoints:[path.join(root,'apps/web/src/bootstrap.mjs')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:path.join(out,'app.js'),sourcemap:true});
await build({entryPoints:[path.join(root,'apps/web/src/processing/qa-page.mjs')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:path.join(out,'qa.js'),sourcemap:true});
cpSync(path.join(root,'apps/web/src/processing/qa.html'),path.join(out,'processing-qa.html'));
await build({entryPoints:[path.join(root,'apps/web/src/processing/worker.mjs')],bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],outfile:path.join(out,'processing-worker.js'),sourcemap:true});
cpSync(path.join(root,'apps/web/index.html'),path.join(out,'index.html'));cpSync(path.join(root,'apps/web/src/styles.css'),path.join(out,'styles.css'));
mkdirSync(path.join(out,'vendor/libraw'),{recursive:true});cpSync(path.join(root,'node_modules/@colorhythm/libraw-wasm/dist/libraw.wasm'),path.join(out,'vendor/libraw/libraw.wasm'));
cpSync(path.join(root,'node_modules/@mediapipe/tasks-vision/wasm'),path.join(out,'vendor/mediapipe'),{recursive:true});
cpSync(path.join(root,'node_modules/@colorhythm/libraw-wasm/LibRaw'),path.join(out,'licenses/LibRaw'),{recursive:true});
cpSync(path.join(root,'node_modules/@colorhythm/libraw-wasm/LICENSE'),path.join(out,'licenses/LibRaw-wrapper-MIT.txt'));
mkdirSync(path.join(out,'licenses/MediaPipe'),{recursive:true});
for(const file of ['README.md','package.json'])cpSync(path.join(root,'node_modules/@mediapipe/tasks-vision',file),path.join(out,'licenses/MediaPipe',file));
const assetDir=path.join(root,'.runtime/web-assets');mkdirSync(assetDir,{recursive:true});
const mediaPipeLicense=path.join(assetDir,'mediapipe-LICENSE.txt');
if(!existsSync(mediaPipeLicense)){
  const response=await fetch('https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE');
  if(!response.ok)throw Error('MEDIAPIPE_LICENSE_DOWNLOAD_FAILED_'+response.status);
  const license=await response.text();if(!license.includes('Apache License')||!license.includes('Version 2.0'))throw Error('INVALID_MEDIAPIPE_LICENSE');
  writeFileSync(mediaPipeLicense,license,{flag:'wx'});
}
cpSync(mediaPipeLicense,path.join(out,'licenses/MediaPipe/Apache-2.0.txt'));
const model=path.join(assetDir,'face_landmarker.task');
if(!existsSync(model)){
  const response=await fetch('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task');
  if(!response.ok)throw Error('MODEL_DOWNLOAD_FAILED_'+response.status);
  writeFileSync(model,new Uint8Array(await response.arrayBuffer()),{flag:'wx'});
}
mkdirSync(path.join(out,'runtime_assets'),{recursive:true});cpSync(model,path.join(out,'runtime_assets/face_landmarker.task'));
const manifest={builtAt:new Date().toISOString(),platform:'browser-worker',librawWrapper:'1.1.1',mediaPipe:'1.0.1',modelURL:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',modelSHA256:createHash('sha256').update(readFileSync(model)).digest('hex'),licenses:'/licenses/LibRaw/COPYRIGHT'};
writeFileSync(path.join(out,'runtime_assets/manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({status:'BUILT_NOT_REAL_RAW_VERIFIED',output:out,...manifest}));
