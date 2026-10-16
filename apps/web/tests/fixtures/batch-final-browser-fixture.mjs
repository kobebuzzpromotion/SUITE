import {EditorSession, checksum, neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Browser-only synthetic boundary: no camera RAW decoder, Cloud account, or
// production authentication. The actual Editor UI, EditorSession Batch Final,
// and built Web Worker renderer/encoder are used below.
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const bytes=new Map([[a,new TextEncoder().encode('NON_RAW_BROWSER_BATCH_A').buffer],
  [b,new TextEncoder().encode('NON_RAW_BROWSER_BATCH_B').buffer]]);
const originalCreate=URL.createObjectURL.bind(URL);
const originalRevoke=URL.revokeObjectURL.bind(URL);
const blobRegistry=new Map(),revoked=[],autoClicks=[];
URL.createObjectURL=blob=>{const url=originalCreate(blob);blobRegistry.set(url,blob);return url;};
URL.revokeObjectURL=url=>{revoked.push(url);originalRevoke(url);};
const originalAnchorClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.download&&this.href.startsWith('blob:')){autoClicks.push({name:this.download,href:this.href});return;}
  return originalAnchorClick.apply(this,args);
};

const assets=[];
for(const [id,original] of bytes)assets.push({id,name:id===a?'first.NONRAW':'second.NONRAW',
  sha256:await checksum(original),size:original.byteLength,deletedAt:null,cloudSafe:true});
const recipes=new Map(assets.map(asset=>[asset.id,{assetId:asset.id,revision:2,body:neutralRecipe()}]));
const source=(value=90)=>{
  const data=new Uint8ClampedArray(12*8*4);
  for(let y=0;y<8;y++)for(let x=0;x<12;x++){
    const at=(y*12+x)*4;data[at]=value+x*5;data[at+1]=value+y*7;data[at+2]=140;data[at+3]=255;
  }
  return {width:12,height:8,data};
};
const caches=new Map(assets.map(asset=>[asset.id,{asset:structuredClone(asset),proxy:source(asset.id===a?90:45),
  history:[neutralRecipe()],cursor:0,revision:2,reference:null,dirty:false}]));
let scenario='success',finalEncodes=0,finalDecodeStarted=0;
const originalReads=[];
const api={
  async listAssets(){return structuredClone(assets);},
  async getRecipe(id){return structuredClone(recipes.get(id)??null);},
  async assertPermission(id,action){if(!bytes.has(id)||action!=='export')throw Error('TEST_PERMISSION_DENIED');return {authorized:true};},
  async getOriginal(id){originalReads.push({id,scenario,finalDecodeStarted,finalEncodes});
    if(scenario==='fail-second'&&id===a&&finalDecodeStarted>=1)return new Uint8Array([1,2,3]).buffer;
    return bytes.get(id)?.slice(0);},
  async saveRecipe(){throw Error('TEST_WRITE_FORBIDDEN');},
};
const storage={async get(id){return structuredClone(caches.get(id));},async put(){throw Error('TEST_WRITE_FORBIDDEN');}};
const worker=createProcessing({workerURL:'/processing-worker.js'});
const processing={...worker,syntheticTestOnly:true,
  async decodeRaw(_original,{mode,signal}={}){
    if(mode!=='final')throw Error('TEST_FINAL_ONLY');
    finalDecodeStarted++;
    if(scenario==='hold-cancel')await new Promise((resolve,reject)=>{
      if(signal?.aborted)reject(new DOMException('cancelled','AbortError'));
      else signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});
    });
    return {pixels:source(finalDecodeStarted%2?45:90),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
  },
  async encode(frame,options){if(window.__finalExportStarted)finalEncodes++;
    return worker.encode(frame,options);
  },
};
const session=new EditorSession({api,storage,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(a);
const dispose=mountEditor(session,{trialSession:{mode:'INVITED_LOCAL_TRIAL',principal:{
  id:'synthetic-local-owner',authorName:'Browser Fixture Owner',role:'author',trialEndsAt:'2099-01-01T00:00:00.000Z'}},
  authorAPI:{listPresets:async()=>[],getSession:async()=>({principal:{id:'synthetic-local-owner'}})}});

const report=document.querySelector('#probe-report');
const links=()=>[...document.querySelectorAll('#batch-final-downloads a')].map(link=>({
  name:link.download,href:link.href,text:link.textContent,
  blob:blobRegistry.get(link.href),revoked:revoked.includes(link.href),
}));
async function inspect(){
  const entries=[];
  for(const link of links()){
    let dimensions=null;
    if(link.blob){const bitmap=await createImageBitmap(link.blob);dimensions={width:bitmap.width,height:bitmap.height};bitmap.close();}
    entries.push({name:link.name,text:link.text,mime:link.blob?.type,size:link.blob?.size,
      dimensions,hasBlob:Boolean(link.blob),revoked:link.revoked,href:link.href});
  }
  report.textContent=JSON.stringify({scenario,links:entries,linkCount:entries.length,
    finalEncodes,finalDecodeStarted,originalReads,sessionError:session.state.error,
    revokedCount:revoked.length,revoked,
    autoClicks,selection:document.querySelector('#batch-final-selection')?.textContent,
    uiStatus:document.querySelector('#batch-final-status')?.textContent,
    currentAsset:session.state.asset?.id,dirty:session.state.dirty});
}
document.querySelector('#probe-success').addEventListener('click',()=>{scenario='success';finalEncodes=0;finalDecodeStarted=0;window.__finalExportStarted=true;void inspect();});
document.querySelector('#probe-fail').addEventListener('click',()=>{scenario='fail-second';finalEncodes=0;finalDecodeStarted=0;window.__finalExportStarted=true;void inspect();});
document.querySelector('#probe-cancel').addEventListener('click',()=>{scenario='hold-cancel';finalEncodes=0;finalDecodeStarted=0;window.__finalExportStarted=true;void inspect();});
document.querySelector('#probe-inspect').addEventListener('click',()=>{void inspect();});
document.querySelector('#probe-dispose').addEventListener('click',()=>{dispose();worker.dispose();void inspect();});
const expect=(condition,label)=>{if(!condition)throw Error(`BATCH_FINAL_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`BATCH_FINAL_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const setSelect=(id,value)=>{const control=document.querySelector(id);control.value=value;
  control.dispatchEvent(new Event('change',{bubbles:true}));};
const choose=id=>document.querySelector(`#batch-final-assets input[value="${id}"]`).click();
const downloadLinks=()=>[...document.querySelectorAll('#batch-final-downloads a')];
const start=()=>document.querySelector('#batch-final-start').click();
const status=()=>document.querySelector('#batch-final-status').textContent;
const runScenario=id=>document.querySelector(id).click();
async function runAllBrowserChecks(){
  const passed=[];
  choose(b);choose(a);
  expect(document.querySelector('#batch-final-selection').textContent.includes('second.NONRAW → 2. first.NONRAW'),
    'explicit b-then-a selection order');
  setSelect('#batch-final-format','png');setSelect('#batch-final-naming','custom-sequence');
  const custom=document.querySelector('#batch-final-custom');custom.value='../Selection';
  custom.dispatchEvent(new Event('input',{bubbles:true}));
  runScenario('#probe-success');start();
  await waitFor(()=>status().includes('2件すべてのFinal'),'successful Batch Final');
  let links=downloadLinks();
  expect(links.length===2,'two manual links only after whole batch');
  expect(links[0].download==='_Selection_001.png'&&links[1].download==='_Selection_002.png',
    'safe ordered sequence names');
  for(const link of links){
    const blob=blobRegistry.get(link.href);
    expect(blob?.type==='image/png'&&blob.size>0,'actual PNG Blob linked');
    const bitmap=await createImageBitmap(blob);
    expect(bitmap.width===12&&bitmap.height===8,'PNG Blob dimensions');bitmap.close();
  }
  expect(finalEncodes===2&&autoClicks.length===0,'two Final encodes with no automatic download');
  expect(session.state.asset.id===a&&!session.state.dirty,'selected Asset and clean state preserved');
  passed.push('custom-sequence: ordered Worker PNG links / safe filenames / no auto-click');

  const firstURLs=links.map(link=>link.href);
  setSelect('#batch-final-naming','custom-count');
  expect(downloadLinks().length===0&&firstURLs.every(url=>revoked.includes(url)),
    'switching sequence to count clears and revokes old links');
  runScenario('#probe-success');start();
  await waitFor(()=>status().includes('2件すべてのFinal'),'custom-count Batch Final');
  links=downloadLinks();
  expect(links.length===2&&links[0].download==='_Selection (1 of 2).png'&&
    links[1].download==='_Selection (2 of 2).png',
  'custom-count names follow explicit photo order and sanitize user text');
  for(const link of links){
    const blob=blobRegistry.get(link.href);
    expect(blob?.type==='image/png'&&blob.size>0,'custom-count links hold Worker PNG Blobs');
    const bitmap=await createImageBitmap(blob);
    expect(bitmap.width===12&&bitmap.height===8,'custom-count PNG dimensions');bitmap.close();
  }
  expect(finalEncodes===2&&autoClicks.length===0,'custom-count two Final encodes without auto-click');
  passed.push('custom-count: explicit order / 2 Worker PNG links / sanitized count names');

  const countURLs=links.map(link=>link.href);
  setSelect('#batch-final-naming','original');
  expect(downloadLinks().length===0&&countURLs.every(url=>revoked.includes(url)),
    'switching count to original clears and revokes old links');
  runScenario('#probe-success');start();
  await waitFor(()=>status().includes('2件すべてのFinal'),'original Batch Final');
  links=downloadLinks();
  expect(links.length===2&&links[0].download==='second.png'&&links[1].download==='first.png',
    'original names preserve explicit photo order');
  for(const link of links){
    const blob=blobRegistry.get(link.href);
    expect(blob?.type==='image/png'&&blob.size>0,'original links hold Worker PNG Blobs');
  }
  expect(finalEncodes===2&&autoClicks.length===0,'original two Final encodes without auto-click');
  passed.push('original: explicit order / 2 Worker PNG links / no auto-click');

  const originalURLs=links.map(link=>link.href);
  setSelect('#batch-final-naming','original-custom');
  expect(downloadLinks().length===0&&originalURLs.every(url=>revoked.includes(url)),
    'switching original to original-custom clears and revokes old links');
  custom.value='Studio';custom.dispatchEvent(new Event('input',{bubbles:true}));
  runScenario('#probe-success');start();
  await waitFor(()=>status().includes('2件すべてのFinal'),'original plus custom Batch Final');
  links=downloadLinks();
  expect(links.length===2&&links[0].download==='second_Studio.png'&&links[1].download==='first_Studio.png',
    'original plus custom names preserve explicit photo order');
  for(const link of links){
    const blob=blobRegistry.get(link.href);
    expect(blob?.type==='image/png'&&blob.size>0,'original plus custom actual PNG Blob');
  }
  expect(autoClicks.length===0,'original plus custom never auto-clicks downloads');
  passed.push('original plus custom ordered Final Blob links / no auto-click');

  const customURLs=links.map(link=>link.href);
  choose(b);
  expect(downloadLinks().length===0&&customURLs.every(url=>revoked.includes(url)),
    'selection change clears links and revokes each URL');
  passed.push('selection-change URL revocation');

  choose(a);choose(b);choose(a);
  expect(document.querySelector('#batch-final-selection').textContent.includes('second.NONRAW → 2. first.NONRAW'),
    'selection order restored');
  runScenario('#probe-fail');start();
  await waitFor(()=>status().includes('完了していません'),'second-Asset Original failure');
  expect(finalEncodes===1&&session.state.error==='RAW_CHECKSUM_MISMATCH'&&downloadLinks().length===0,
    'first Final encoded, second Original fails, zero partial links');
  passed.push('second-item failure: no partial links');

  runScenario('#probe-cancel');start();
  await waitFor(()=>finalDecodeStarted===1,'Final decode blocked for cancellation');
  document.querySelector('#batch-final-cancel').click();
  await waitFor(()=>status().includes('完了していません'),'Batch Final cancelled');
  expect(finalEncodes===0&&downloadLinks().length===0,'cancel yields no links');
  passed.push('cancellation: no partial links');

  runScenario('#probe-success');start();
  await waitFor(()=>status().includes('2件すべてのFinal'),'repeat Batch Final');
  links=downloadLinks();expect(links.length===2,'repeat success links');
  const finalURLs=links.map(link=>link.href);
  dispose();worker.dispose();
  expect(downloadLinks().length===0&&finalURLs.every(url=>revoked.includes(url)),
    'Editor disposal clears links and revokes each URL');
  expect(autoClicks.length===0,'never auto-clicks Blob downloads');
  passed.push('Editor disposal URL revocation');
  await inspect();
  document.querySelector('#probe-verdict').textContent=JSON.stringify({result:'BATCH-FINAL-BROWSER-PASS',passed});
}
document.querySelector('#probe-run-all').addEventListener('click',()=>{
  void runAllBrowserChecks().catch(error=>{
    document.querySelector('#probe-verdict').textContent=JSON.stringify({result:'BATCH-FINAL-BROWSER-FAIL',
      error:error.message,stack:error.stack});
    void inspect();
  });
});
await inspect();
