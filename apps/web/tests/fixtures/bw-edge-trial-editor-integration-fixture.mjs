import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Real same-origin Trial login, HTTP/SQLite, Editor UI and Worker, but its bytes
// and decoded RGBA are SYNTHETIC_NON_RAW. Never a real RAW or Cloud claim.
const verdict=document.querySelector('#probe-verdict'),report=document.querySelector('#probe-report');
const $=selector=>document.querySelector(selector);
const assert=(condition,message)=>{if(!condition)throw Error(`BW_TRIAL_EDITOR_ASSERTION: ${message}`);};
async function wait(predicate,label){const until=Date.now()+25000;while(!predicate()){
  if(Date.now()>until)throw Error(`BW_TRIAL_EDITOR_TIMEOUT: ${label}`);
  await new Promise(resolve=>setTimeout(resolve,25));}}
function frame(){const width=32,height=32,data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++)data.set([110,70,50,255],i*4);
  data.set([2,3,4,187],(9*width+16)*4);data.set([245,2,99,0],0);
  return {width,height,sourceWidth:width,sourceHeight:height,data};}
async function pixel(url,x=16,y=9){const blob=await (await fetch(url)).blob(),bitmap=await createImageBitmap(blob);
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  return [...ctx.getImageData(x,y,1,1).data];}
function paint(afterX,afterY){const img=$('#after-image'),r=img.getBoundingClientRect();
  const x=r.left+r.width*afterX,y=r.top+r.height*afterY;
  for(const [type,dx] of [['pointerdown',0],['pointermove',3],['pointerup',3]])
    img.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:42,pointerType:'mouse',button:0,isPrimary:true,clientX:x+dx,clientY:y+dx}));}
const nativeAnchorClick=HTMLAnchorElement.prototype.click;let downloadObserved=null;
HTMLAnchorElement.prototype.click=function(){if(this.id==='download-link'){downloadObserved={href:this.href,name:this.download};return;}return nativeAnchorClick.call(this);};
let fixture=null;
async function setup(){
  const invitation=await (await fetch('/fixture/new',{method:'POST'})).json();
  const client=new TrialClient();await client.login(invitation.inviteToken);
  async function make(label){const bytes=new TextEncoder().encode(`SYNTHETIC_NON_RAW_BW_TRIAL_${label}`);
    const sha256=await checksum(bytes.buffer),asset=await client.createAsset({name:`${label}.nonraw`,sha256,size:bytes.length});
    await client.putOriginal(asset.id,bytes.buffer.slice(0));
    const saved=await client.saveRecipe(asset.id,0,neutralRecipe());assert(saved.revision===1,'initial saved Recipe');
    return {asset,sha256};}
  const first=await make('first'),second=await make('second');
  const worker=createProcessing({workerURL:'/processing-worker.js'});
  const processing={...worker,syntheticTestOnly:true,
    async decodeRaw(bytes,{mode}={}){assert(['proxy','final'].includes(mode),'synthetic decode mode');
      assert(new TextDecoder().decode(bytes).startsWith('SYNTHETIC_NON_RAW_BW_TRIAL_'),'synthetic bytes only');
      return {pixels:frame(),provenance:{fixture:'SYNTHETIC_NON_RAW'},metadata:{fixture:true}};},
    async makeProxy(pixels){return structuredClone(pixels);}};
  const session=new EditorSession({api:client,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset(first.asset.id);
  const dispose=mountEditor(session,{trialSession:await client.getSession(),authorAPI:client});
  fixture={client,first,second,worker,session,dispose};return fixture;
}
async function unchanged(item){assert(await checksum(await fixture.client.getOriginal(item.asset.id))===item.sha256,
  `Original ${item.asset.id} SHA unchanged`);}
document.querySelector('#probe-run').addEventListener('click',async()=>{
  if(fixture)throw Error('RELOAD_FIXTURE_FOR_NEW_RUN');
  try{
    const f=await setup();
    await wait(()=>!$('#bw-edge-mode').disabled&&$('#after-image').naturalWidth===32,'saved Trial After geometry');
    $('#bw-edge-editor-section summary').click();
    const before=await pixel(f.session.state.beforeURL),unadjusted=await pixel(f.session.state.afterURL);
    assert(JSON.stringify(before)===JSON.stringify(unadjusted),'neutral Proxy matches Before');
    $('[data-view="before"]').click();assert($('#bw-edge-mode').disabled,'Before refuses manual brush');
    $('[data-view="after"]').click();await wait(()=>!$('#bw-edge-mode').disabled,'After re-enables brush');
    $('#bw-edge-mode').click();
    const radius=$('#bw-edge-manual-root input[aria-label="ブラシ半径"]'),hardness=$('#bw-edge-manual-root input[aria-label="ブラシ硬さ"]');
    radius.value='25';hardness.value='100';paint(.5,.5);
    assert($('#bw-edge-apply').disabled,'one layer remains unapplied');
    const layer=$('#bw-edge-manual-root select[aria-label="範囲の層"]');
    layer.value='correction';layer.dispatchEvent(new Event('change',{bubbles:true}));radius.value='10';paint(.5,.28);
    assert($('#bw-edge-apply').disabled,'two layers require owner confirmation');
    $('#bw-edge-confirm').click();assert(!$('#bw-edge-apply').disabled,'explicit owner confirmation enables apply');
    $('#bw-edge-apply').click();await wait(()=>f.session.state.dirty&&
      $('#bw-edge-editor-status').textContent.includes('未保存')&&Boolean(f.session.state.afterURL),'Recipe apply and Proxy');
    const draft=f.session.state.recipe.parameters.extendedParameters.bwEdgeManual;
    assert(draft.binding.assetID===f.first.asset.id&&draft.binding.originalSHA256===f.first.sha256,
      'fresh Trial-bound Asset and SHA');
    const adjusted=await pixel(f.session.state.afterURL);
    assert(JSON.stringify(adjusted)!==JSON.stringify(unadjusted),`actual Proxy pixel changed ${JSON.stringify({before,unadjusted,adjusted})}`);
    assert(adjusted[3]===187,'Proxy fringe alpha unchanged');
    assert((await f.client.getRecipe(f.first.asset.id)).revision===1,'draft not falsely saved');
    $('[data-action="save"]').click();await wait(()=>f.session.state.revision===2&&!f.session.state.dirty,'UI Save to SQLite');
    assert((await f.client.getRecipe(f.first.asset.id)).body.parameters.extendedParameters.bwEdgeManual.binding.assetID===f.first.asset.id,
      'stored Recipe contains bound mask');
    $('[data-action="reload"]').click();await wait(()=>f.session.state.revision===2&&!f.session.state.dirty&&Boolean(f.session.state.afterURL),'UI Reload');
    assert(f.session.state.recipe.parameters.extendedParameters.bwEdgeManual.subjectStrokes.length===1,'reloaded subject stroke');
    assert(f.session.state.recipe.parameters.extendedParameters.bwEdgeManual.correctionStrokes.length===1,'reloaded correction stroke');
    $('[data-action="export-png"]').click();await wait(()=>Boolean(downloadObserved)&&!f.session.state.exporting,'UI Final Blob');
    const final=await pixel(downloadObserved.href);
    assert(JSON.stringify(final)!==JSON.stringify(before),'actual Final pixel changed');
    assert(final[3]===187,'Final fringe alpha unchanged');
    assert(downloadObserved.name.endsWith('.png'),'download link names Final PNG');
    await unchanged(f.first);await unchanged(f.second);
    const secondButton=$(`[data-asset-id="${f.second.asset.id}"]`);assert(secondButton&&!secondButton.disabled,'second Asset available');
    secondButton.click();await wait(()=>f.session.state.asset?.id===f.second.asset.id&&Boolean(f.session.state.afterURL),'switch to second Asset');
    assert(!f.session.state.recipe.parameters.extendedParameters.bwEdgeManual,'bound mask does not cross Assets');
    assert((await f.client.getRecipe(f.second.asset.id)).revision===1,'second Recipe unchanged');
    await unchanged(f.second);
    const firstButton=$(`[data-asset-id="${f.first.asset.id}"]`);firstButton.click();
    await wait(()=>f.session.state.asset?.id===f.first.asset.id&&!$('#bw-edge-mode').disabled,'return to first Asset');
    await fetch('/fixture/revoke',{method:'POST'});
    $('#bw-edge-mode').click();paint(.5,.5);$('#bw-edge-confirm').click();
    assert(!$('#bw-edge-apply').disabled,'revoked stale UI still shows attempted apply until fresh Gate');
    $('#bw-edge-apply').click();await wait(()=>$('#bw-edge-editor-status').textContent.includes('未適用'),'revoked Trial rejects apply');
    assert($('#bw-edge-mode').disabled&&$('#bw-edge-apply').disabled,'UI blocks after revocation');
    const remote=await (await fetch(`/fixture/inspect?assetID=${encodeURIComponent(f.first.asset.id)}`)).json();
    assert(remote.revision===2,'revoked attempt cannot save');
    report.textContent='SYNTHETIC_NON_RAW · Login, Asset, two-layer owner apply, Proxy, SQLite Save/Reload, Final PNG, Original SHA, Before, cross-Asset, revoke PASS. Real RAW/Cloud NOT_RUN.';
    verdict.textContent='BW_EDGE_TRIAL_EDITOR_BROWSER_PASS';
  }catch(error){verdict.textContent=`FAIL ${error.stack??error}`;}
  finally{fixture?.dispose();fixture?.worker.dispose();HTMLAnchorElement.prototype.click=nativeAnchorClick;}
});
