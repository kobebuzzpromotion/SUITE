import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {makeManualMakeupHighlightDocument} from '../src/manual-makeup-highlight-ui.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const port=61997;
const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),personID:'33333333-3333-4333-8333-333333333333',
  sourceWidth:200,sourceHeight:100};
const stroke={operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.04,hardness:.7};

test('MAKEUP-UI-01: detached typed document contains only saved stroke/intensity values',()=>{
  const original=structuredClone(stroke);
  const value=makeManualMakeupHighlightDocument(binding,[stroke],{intensity:45});
  assert.deepEqual(value,{schemaVersion:1,
    engineVersion:'suite-srgb8-owner-manual-makeup-highlight-1',
    binding,highlightStrokes:[stroke],settings:{intensity:45}});
  value.highlightStrokes[0].path[0].u=.2;
  assert.deepEqual(stroke,original);
  assert.doesNotMatch(JSON.stringify(value),
    /ownerConfirmed|permissionEvidence|savedRevision|bitmap|authorization/);
});

test('MAKEUP-UI-02: incomplete, fake or over-limit UI drafts are rejected',()=>{
  const create=(b=binding,strokes=[stroke],settings={intensity:40})=>
    makeManualMakeupHighlightDocument(b,strokes,settings);
  for(const bad of [[],[{...stroke,operation:'ERASE'}],
    Array.from({length:65},()=>stroke)])
    assert.throws(()=>create(binding,bad),/MAKEUP_HIGHLIGHT_UI_/);
  for(const bad of [-1,101,.5,NaN,Infinity,'45'])
    assert.throws(()=>create(binding,[stroke],{intensity:bad}),
      /MAKEUP_HIGHLIGHT_UI_INTENSITY_INVALID/);
  for(const bad of [
    {...stroke,aiRegion:true},
    {...stroke,radiusFraction:.3},
    {...stroke,path:[{u:1.2,v:.5}]},
  ])assert.throws(()=>create(binding,[bad]),/MAKEUP_HIGHLIGHT_UI_/);
  assert.throws(()=>create({...binding,savedRevision:3}),
    /MAKEUP_HIGHLIGHT_UI_BINDING_INVALID/);
  assert.throws(()=>create({...binding,personID:'different'}),
    /MAKEUP_HIGHLIGHT_UI_BINDING_INVALID/);
});

const page=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>Manual Makeup Highlight UI probe</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{font:16px sans-serif;margin:12px;color:#17212b}main{max-width:800px;min-width:0}
.layout{display:flex;flex-wrap:wrap;gap:8px}.image-box{width:240px;height:240px;border:1px solid #888;position:relative;flex:none}
.image-box img{display:block;width:100%;height:100%;object-fit:contain}
@media(max-width:390px){.image-box{width:min(240px,100%)}}
</style><main><button id="probe-run" type="button">手動Highlight UIを検証</button>
<pre id="probe-verdict" aria-label="手動Highlight UI検証判定">NOT_RUN</pre>
<div class="layout"><div class="image-box"><img id="after" alt="After"></div>
<div class="image-box"><img id="after-nohost" alt="After（hostなし）"></div></div>
<div id="panel"></div><div id="panel-nohost"></div></main>
<script type="module" src="/fixture.js"></script></html>`;

const harness=String.raw`
import {mountManualMakeupHighlightUI} from './manual-makeup-highlight-ui.mjs';
const ASSET='11111111-1111-4111-8111-111111111111';
const PERSON='33333333-3333-4333-8333-333333333333';
const SHA='a'.repeat(64);
const image=document.querySelector('#after');
const nohostImage=document.querySelector('#after-nohost');
const source='data:image/svg+xml,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#c5ad97"/></svg>');
image.src=source;nohostImage.src=source;
let version=3,view='after',delayed=false,pendingResolve;
const calls=[];
const current=()=>({assetID:ASSET,originalSHA256:SHA,personID:PERSON,
  sourceWidth:200,sourceHeight:100,savedRevision:version,
  rotationDegrees:0,view,ready:true,dirty:false,busy:false,
  permissionExpired:false});
const ui=mountManualMakeupHighlightUI({root:document.querySelector('#panel'),
  afterImage:image,getContext:current,enabled:true,
  onSubmit:(documentValue,options)=>{
    calls.push({documentValue,options});
    if(delayed)return new Promise(resolve=>{pendingResolve=resolve;});
    return Promise.resolve({saved:true,applied:true});
  }});
const nohost=mountManualMakeupHighlightUI({
  root:document.querySelector('#panel-nohost'),afterImage:nohostImage,
  getContext:current,enabled:true});
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
const require=(ok,message)=>{if(!ok)throw Error(message);};
const button=(panel,text)=>[...panel.querySelectorAll('button')]
  .find(node=>node.textContent===text);
const pointer=(type,id,x,y,pointerType='mouse')=>image.dispatchEvent(
  new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,
    pointerType,button:0,isPrimary:true,clientX:x,clientY:y}));
const strokeAt=(id,x,y,kind='mouse')=>{
  pointer('pointerdown',id,x,y,kind);pointer('pointerup',id,x,y,kind);
};
async function run(){
  await image.decode();await nohostImage.decode();ui.refresh();nohost.refresh();
  const panel=document.querySelector('#panel');
  const nohostPanel=document.querySelector('#panel-nohost');
  require(button(nohostPanel,'hostへ下書きを渡す').disabled,
    'MISSING_HOST_CALLBACK_LOOKS_ENABLED');
  const box=image.getBoundingClientRect(),x=box.left+box.width/2,
    y=box.top+box.height/2;
  strokeAt(1,x,y);
  require(ui.getDraft().highlightStrokes.length===1,'POINTER_STROKE_MISSING');
  strokeAt(2,x+20,y,'touch');
  require(ui.getDraft().highlightStrokes.length===2,'TOUCH_STROKE_MISSING');
  image.focus();require(document.activeElement===image,'IMAGE_FOCUS_MISSING');
  image.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'}));
  image.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter'}));
  require(ui.getDraft().highlightStrokes.length===3,'KEYBOARD_STROKE_MISSING');
  button(panel,'1筆戻す').click();
  require(ui.getDraft().highlightStrokes.length===2,'UNDO_MISSING');
  button(panel,'やり直す').click();
  require(ui.getDraft().highlightStrokes.length===3,'REDO_MISSING');
  button(panel,'範囲を消去').click();strokeAt(3,x+40,y);
  require(ui.getDraft().highlightStrokes.at(-1).operation==='ERASE',
    'ERASE_STROKE_MISSING');
  strokeAt(4,x,box.top+5);
  require(ui.getDraft().highlightStrokes.length===4,'LETTERBOX_ACCEPTED');
  const strength=panel.querySelector('[aria-label="手動Highlight強度"]');
  strength.value='45';strength.dispatchEvent(new Event('change',{bubbles:true}));
  button(panel,'hostへ下書きを渡す').click();await wait();
  require(calls.length===1,'HOST_CALLBACK_MISSING');
  require(calls[0].documentValue.highlightStrokes.length===4&&
    calls[0].documentValue.settings.intensity===45&&
    calls[0].documentValue.binding.personID===PERSON,'TYPED_DOCUMENT_WRONG');
  require(!panel.textContent.includes('保存しました'),
    'CALLBACK_RESPONSE_CLAIMED_SAVED');
  delayed=true;button(panel,'hostへ下書きを渡す').click();await wait();
  button(panel,'依頼を中止').click();
  require(calls.length===2&&calls[1].options.signal.aborted,
    'CANCEL_DID_NOT_ABORT');
  pendingResolve({saved:true});await wait();
  require(panel.textContent.includes('依頼を中止'),
    'CANCEL_MISREPORTED_AS_SUCCESS');
  delayed=false;button(panel,'hostへ下書きを渡す').click();await wait();
  require(calls.length===3,'RETRY_NOT_CALLED');
  view='before';ui.refresh();strokeAt(5,x,y);
  require(ui.getDraft().highlightStrokes.length===4,'BEFORE_ACCEPTED');
  view='after';version=4;ui.refresh();
  require(button(panel,'hostへ下書きを渡す').disabled,
    'STALE_REVISION_SUBMIT_ENABLED');
  strokeAt(6,x,y);
  require(ui.getDraft().highlightStrokes.length===4,'STALE_REVISION_STROKE_ACCEPTED');
  require(document.documentElement.scrollWidth<=window.innerWidth+1,
    'MOBILE_HORIZONTAL_OVERFLOW');
  for(const control of panel.querySelectorAll('button,input'))
    require(control.getBoundingClientRect().height>=44,'TAP_TARGET_TOO_SMALL');
  ui.dispose();nohost.dispose();
  return {calls:calls.length,strokes:4,viewport:window.innerWidth};
}
document.querySelector('#probe-run').addEventListener('click',async()=>{
  const verdict=document.querySelector('#probe-verdict');
  try{verdict.textContent='MAKEUP_HIGHLIGHT_UI_BROWSER_PASS '+JSON.stringify(await run());}
  catch(error){verdict.textContent='MAKEUP_HIGHLIGHT_UI_BROWSER_FAIL '+error.message;}
});
window.__makeupHighlightProbe={ui,nohost,run};
`;

async function bundle(){
  const result=await build({stdin:{contents:harness,sourcefile:'makeup-highlight-ui-probe.mjs',
    resolveDir:resolve(here,'../src')},bundle:true,format:'esm',platform:'browser',
    target:'es2022',write:false,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  return result.outputFiles[0].contents;
}

if(process.argv.includes('--serve')){
  const bytes=await bundle();
  const server=createServer((request,response)=>{
    if(request.method!=='GET'||request.headers.host!==`127.0.0.1:${port}`){
      response.writeHead(403);response.end();return;
    }
    const path=new URL(request.url??'/',`http://127.0.0.1:${port}`).pathname;
    const data=path==='/'?page:path==='/fixture.js'?bytes:null;
    if(data===null){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':path==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8',
    'Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"});
    response.end(data);
  });
  server.listen(port,'127.0.0.1',()=>
    console.log(`MAKEUP_HIGHLIGHT_UI_PROBE http://127.0.0.1:${port}/`));
}else{
  test('MAKEUP-UI-BUNDLE: After-only Pointer/Touch/Keyboard and host-only delivery bundle',async()=>{
    const bytes=await bundle(),source=new TextDecoder().decode(bytes);
    assert.ok(bytes.length>10000);
    assert.match(source,/MAKEUP_HIGHLIGHT_UI_BROWSER_PASS/);
    assert.match(source,/mapAfterToLocalBrushPoint/);
    assert.match(source,/mapAfterImagePointToLocalBrushPoint/);
    assert.match(source,/highlightStrokes/);
    assert.match(source,/MISSING_HOST_CALLBACK_LOOKS_ENABLED/);
  });
}
