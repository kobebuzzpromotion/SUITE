import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planExportDimensions, resizeExportPixels} from '../src/export-size.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const port = 61843;
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><title>SUITE Export Blob Browser Probe</title>
<h1>SUITE Export Blob Browser Probe</h1><pre id="result" aria-label="Export check result">RUNNING</pre>
<script type="module">
import {planExportDimensions,resizeExportPixels} from '/src/export-size.mjs';
import {createProcessing} from '/src/processing/index.mjs';
import {readExportResolution} from '/src/export-resolution.mjs';
const output=document.getElementById('result');
try {
  const processing=createProcessing({workerURL:'/processing-worker.js'});
  const source={width:120,height:80,data:new Uint8ClampedArray(120*80*4)};
  for(let y=0;y<80;y++)for(let x=0;x<120;x++){
    const at=(y*120+x)*4;
    source.data[at]=x*2;source.data[at+1]=y*3;source.data[at+2]=100;
    source.data[at+3]=x<8?0:255;
  }
  const before=source.data.slice(),results=[];
  const modes=[{kind:'long-edge',value:60},{kind:'short-edge',value:40},
    {kind:'dimensions',width:58,height:33}];
  for(const size of modes){
    const planned=planExportDimensions(source,size);
    const frame=await processing.resizeForExport(source,size);
    if(frame.width!==planned.width||frame.height!==planned.height)throw Error('SIZE_PLAN_MISMATCH');
    for(const format of ['jpeg','png'])for(const resolution of [{unit:'ppi',value:300},{unit:'ppc',value:120}]){
      const blob=await processing.encode(frame,{format,resolution});
      const bytes=new Uint8Array(await blob.arrayBuffer());
      const density=readExportResolution(bytes,format);
      const bitmap=await createImageBitmap(blob);
      const actual={width:bitmap.width,height:bitmap.height};bitmap.close();
      const densityTarget=format==='png'?Math.round(resolution.value*(resolution.unit==='ppi'?10000/254:100)):resolution.value;
      if(actual.width!==planned.width||actual.height!==planned.height||
          density.width!==actual.width||density.height!==actual.height||
          density.x!==densityTarget||density.y!==densityTarget||
          (format==='jpeg'&&density.unit!==resolution.unit))throw Error('BLOB_OUTPUT_MISMATCH');
      results.push({mode:size.kind,format,resolution,planned:{width:planned.width,height:planned.height},
        actual,density,mime:blob.type,bytes:blob.size});
    }
  }
  if(!source.data.every((value,index)=>value===before[index]))throw Error('SOURCE_MUTATED');
  processing.dispose();
  output.textContent=JSON.stringify({status:'PASS',path:'Browser Worker resizeForExport -> encode',userAgent:navigator.userAgent,results});
}catch(error){output.textContent=JSON.stringify({status:'FAIL',error:String(error?.stack??error)});}
</script></html>`;

if (process.argv.includes('--serve')) {
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url??'/',`http://127.0.0.1:${port}`);
    if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
    if(url.pathname==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      res.end(page);return;
    }
    if(url.pathname==='/processing-worker.js'){
      try{const content=await readFile(resolve(sourceRoot,'../../../dist/web/processing-worker.js'));
        res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(content);}
      catch{res.writeHead(404);res.end();}
      return;
    }
    const relative=url.pathname.replace(/^\/src\//,'');
    const file=resolve(sourceRoot,relative);
    if(!url.pathname.startsWith('/src/')||!file.startsWith(sourceRoot+sep)||extname(file)!=='.mjs'){
      res.writeHead(404);res.end();return;
    }
    try{const content=await readFile(file);res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(content);}
    catch{res.writeHead(404);res.end();}
  });
  server.listen(port,'127.0.0.1',()=>console.log(`SUITE_EXPORT_BROWSER_PROBE http://127.0.0.1:${port}/`));
} else {
  test('EXPORT-SIZE-BROWSER-PLAN: the browser probe uses shrink-only plans before encoding',()=>{
    const source={width:120,height:80,data:new Uint8ClampedArray(120*80*4)};
    for(const [size,width,height] of [
      [{kind:'long-edge',value:60},60,40],
      [{kind:'short-edge',value:40},60,40],
      [{kind:'dimensions',width:58,height:33},50,33],
    ]){
      assert.deepEqual([planExportDimensions(source,size).width,planExportDimensions(source,size).height],[width,height]);
      const frame=resizeExportPixels(source,size);
      assert.deepEqual([frame.width,frame.height],[width,height]);
    }
  });
}
