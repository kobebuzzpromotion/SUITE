import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';

const here=dirname(fileURLToPath(import.meta.url));
const port=61998;
const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canvas Expand edge probe</title>
<link rel="stylesheet" href="/editorial.css"><style>
body{font:16px system-ui;margin:12px;color:#1a272d}main{max-width:800px;min-width:0}
#verdict{white-space:pre-wrap;overflow-wrap:anywhere}
.probe-stage{display:flex;flex-wrap:wrap;gap:10px}.photo-figure{position:relative;width:min(500px,100%);height:400px;border:1px solid #999}
.photo-figure img{display:block;width:100%;height:100%;object-fit:contain}
.photo-figure.nohost{width:100px;height:100px}
</style><main class="editorial-editor"><button id="probe-run" type="button">四辺ハンドルを検証</button>
<pre id="verdict" aria-label="四辺ハンドル検証結果">NOT_RUN</pre>
<div class="probe-stage"><figure class="photo-figure"><img id="after" alt="After"></figure>
<figure class="photo-figure nohost"><img id="nohost" alt="After hostなし"></figure></div></main>
<script type="module" src="/fixture.js"></script></html>`;

const harness=String.raw`
import {mountCanvasExpandEdgeOverlay} from './canvas-expand-edge-overlay.mjs';
const image=document.querySelector('#after'),other=document.querySelector('#nohost');
const renderSvg=(width,height)=>'data:image/svg+xml,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect width="100%" height="100%" fill="#bcb39f"/></svg>');
image.src=renderSvg(400,300);other.src=renderSvg(400,300);
let margins={left:0,right:0,top:0,bottom:0},selection='asset-A:v1',
  ready=true,view='after',rejectNext=false,delayNext=false,pendingResolve;
const calls=[];
const context=()=>({ready,busy:false,view,selectionKey:selection,margins,
  preview:{upright:{width:400,height:300},postCropWidth:400,postCropHeight:300},
  full:{upright:{width:800,height:600}},rotationDegrees:0});
const ui=mountCanvasExpandEdgeOverlay({afterImage:image,getContext:context,
  enabled:true,onCandidate:async(value,{signal})=>{
    calls.push({value,signal});
    if(rejectNext){rejectNext=false;throw Error('CONFLICT');}
    if(delayNext)await new Promise(resolve=>{pendingResolve=resolve;});
    if(signal.aborted)return;
    margins=value.margins;
    image.src=renderSvg(400+value.projected.preview.left+value.projected.preview.right,
      300+value.projected.preview.top+value.projected.preview.bottom);
    await image.decode();ui.refresh();
  }});
const nohost=mountCanvasExpandEdgeOverlay({afterImage:other,getContext:context,enabled:true});
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const handle=edge=>document.querySelector('#after').parentElement.querySelector('[data-canvas-edge="'+edge+'"]');
const nohostHandle=edge=>document.querySelector('#nohost').parentElement.querySelector('[data-canvas-edge="'+edge+'"]');
const event=(type,id,x,y,kind='mouse')=>new PointerEvent(type,{bubbles:true,cancelable:true,
  pointerId:id,pointerType:kind,isPrimary:true,button:0,clientX:x,clientY:y});
async function drag(edge,dx,dy,id=7,kind='mouse'){
  const button=handle(edge),box=button.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
  button.dispatchEvent(event('pointerdown',id,x,y,kind));
  button.dispatchEvent(event('pointermove',id,x+dx,y+dy,kind));
  button.dispatchEvent(event('pointerup',id,x+dx,y+dy,kind));
  await image.decode();await wait();await wait();
}
async function run(){
  await image.decode();await other.decode();ui.refresh();nohost.refresh();
  ensure([...Object.keys(margins)].every(edge=>!handle(edge).disabled),'FOUR_HANDLES_NOT_READY');
  ensure([...Object.keys(margins)].every(edge=>nohostHandle(edge).disabled),'NO_HOST_LOOKS_ENABLED');
  ensure([...Object.keys(margins)].every(edge=>handle(edge).getBoundingClientRect().width>=44&&
    handle(edge).getBoundingClientRect().height>=44),'TAP_TARGET_SMALL');
  ensure(getComputedStyle(handle('left')).touchAction==='none','TOUCH_ACTION_UNSAFE');
  let count=calls.length;
  await drag('left',-3,0);
  ensure(calls.length===count&&margins.left===0,'CLICK_CHANGED_MARGIN');
  await drag('left',-50,0);
  ensure(calls.length===count+1&&margins.left>0&&margins.left<=2,'MOUSE_DRAG_FAILED');
  ensure(/未確認|保存されていません/u.test(document.querySelector('.canvas-expand-edge-status').textContent),
    'HOST_CALLBACK_CLAIMED_SAVE');
  await drag('bottom',0,50,8,'touch');
  ensure(margins.bottom>0&&calls.length===count+2,'TOUCH_POINTER_FAILED');
  count=calls.length;rejectNext=true;
  const rightBefore=handle('right').getBoundingClientRect();
  await drag('right',50,0,9);
  ensure(calls.length===count+1&&margins.right===0,'FAILED_HOST_COMMITTED');
  ensure(document.querySelector('.canvas-expand-edge-status').textContent.includes('元に戻'),
    'FAILED_HOST_NOT_RESTORED');
  ensure(Math.abs(handle('right').getBoundingClientRect().left-rightBefore.left)<1,
    'FAILED_HOST_HANDLE_NOT_RESTORED');
  handle('top').focus();
  ensure(document.activeElement===handle('top'),'HANDLE_FOCUS_FAILED');
  handle('top').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
  await wait();await wait();
  ensure(margins.top===.01,'KEYBOARD_FAILED');
  handle('top').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',shiftKey:true,bubbles:true,cancelable:true}));
  await wait();await wait();
  ensure(margins.top===.11,'SHIFT_KEYBOARD_FAILED');
  view='before';ui.refresh();
  ensure(handle('left').disabled,'BEFORE_STILL_ENABLED');
  view='after';ui.refresh();
  selection='asset-B:v2';ui.refresh();
  ensure(!handle('left').disabled,'AFTER_RETRY_NOT_ENABLED');
  delayNext=true;count=calls.length;
  const button=handle('right'),box=button.getBoundingClientRect(),x=box.left+22,y=box.top+22;
  button.dispatchEvent(event('pointerdown',11,x,y));
  button.dispatchEvent(event('pointerup',11,x+50,y));
  await wait();
  ensure(calls.length===count+1,'PENDING_NOT_STARTED');
  button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  pendingResolve?.();await wait();await wait();
  ensure(margins.right===0,'CANCELLED_PENDING_COMMITTED');
  ensure(document.querySelector('.canvas-expand-edge-status').textContent.includes('中止'),
    'CANCEL_STATUS_MISSING');
  delayNext=false;
  ensure(document.documentElement.scrollWidth<=window.innerWidth+1,'HORIZONTAL_OVERFLOW');
  return {calls:calls.length,margins,viewport:window.innerWidth};
}
document.querySelector('#probe-run').addEventListener('click',async()=>{
  const verdict=document.querySelector('#verdict');
  try{verdict.textContent='CANVAS_EDGE_OVERLAY_BROWSER_PASS '+JSON.stringify(await run());}
  catch(error){verdict.textContent='CANVAS_EDGE_OVERLAY_BROWSER_FAIL '+error.message;}
});
`;

async function bundle(){
  const result=await build({stdin:{contents:harness,sourcefile:'canvas-edge-ui-probe.mjs',
    resolveDir:resolve(here,'../src')},bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}

if(process.argv.includes('--serve')){
  const script=await bundle();
  const css=await readFile(resolve(here,'../src/editorial-editor.css'));
  const server=createServer((request,response)=>{
    if(request.method!=='GET'||request.headers.host!==`127.0.0.1:${port}`){
      response.writeHead(403);response.end();return;
    }
    const path=new URL(request.url??'/',`http://127.0.0.1:${port}`).pathname;
    const data=path==='/'?page:path==='/fixture.js'?script:path==='/editorial.css'?css:null;
    if(data===null){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':path==='/'?'text/html; charset=utf-8':
      path==='/editorial.css'?'text/css; charset=utf-8':'text/javascript; charset=utf-8',
    'Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"});
    response.end(data);
  });
  server.listen(port,'127.0.0.1',()=>console.log(`CANVAS_EDGE_OVERLAY_PROBE http://127.0.0.1:${port}/`));
}else{
  test('CANVAS-EDGE-OVERLAY-01: standalone browser bundle includes pure edge conversion',async()=>{
    const bytes=await bundle(),source=new TextDecoder().decode(bytes);
    assert.ok(bytes.length>8000);
    for(const required of ['beginCanvasExpansionEdgeDrag','updateCanvasExpansionEdgeDrag',
      'nudgeCanvasExpansionEdge','CANVAS_EDGE_OVERLAY_BROWSER_PASS'])assert.ok(source.includes(required));
  });
  test('CANVAS-EDGE-OVERLAY-02: dedicated Canvas styles maintain focus, tap and reduced motion',async()=>{
    const css=await readFile(resolve(here,'../src/editorial-editor.css'),'utf8');
    assert.match(css,/\.canvas-expand-edge-handle[^\n]*width: 44px; height: 44px/);
    assert.match(css,/\.canvas-expand-edge-handle:focus-visible/);
    assert.match(css,/\.canvas-expand-edge-overlay \*::after[^\n]*animation: none/);
  });
}
