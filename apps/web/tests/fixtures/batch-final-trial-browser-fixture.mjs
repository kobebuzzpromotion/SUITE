import {EditorSession,checksum} from '../../src/session.mjs';
import {TrialClient} from '../../src/trial-client.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Real local Trial HTTP/SQLite, saved Recipes and Original bytes. Only the
// decoder's pixels are synthetic NON-RAW; the product Editor, Session, Worker,
// batch authorization, filename planning and Blob links remain real code.
const verdict=document.querySelector('#probe-verdict');
const report=document.querySelector('#probe-report');
const caseName=new URL(location.href).searchParams.get('case')??'success';
const expect=(condition,label)=>{if(!condition)throw Error(`TRIAL_BROWSER_NAMING_ASSERTION: ${label}`);};
const waitFor=async(predicate,label)=>{
  const until=performance.now()+20000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`TRIAL_BROWSER_NAMING_TIMEOUT: ${label}`);
    await new Promise(done=>setTimeout(done,20));
  }
};
const started=await fetch('/__fixture/start',{method:'POST',
  headers:{'X-Suite-Browser-Probe':'1'}});
if(!started.ok)throw Error('TRIAL_BROWSER_START_FAILED');
const {records}=await started.json();
expect(Array.isArray(records)&&records.length===2,'two registered Trial Assets');
const [first,second]=records;
const api=new TrialClient({baseURL:''});
const actualSession=await api.getSession();
expect(actualSession?.principal?.id&&actualSession.principal.trialEndsAt,
  'actual browser cookie grants a Trial principal');
const existing=new Map(records.map(record=>[record.asset.id,{
  asset:structuredClone(record.asset),proxy:source(record===first?90:45),
  history:[structuredClone(record.saved.body)],cursor:0,
  revision:record.saved.revision,reference:null,dirty:false,
}]));
const storage={async get(id){return structuredClone(existing.get(id));},
  async put(){throw Error('TRIAL_BROWSER_DRAFT_WRITE_FORBIDDEN');}};
function source(value){
  const data=new Uint8ClampedArray(12*8*4);
  for(let y=0;y<8;y++)for(let x=0;x<12;x++){
    const at=(y*12+x)*4;data[at]=value+x*5;data[at+1]=value+y*7;
    data[at+2]=140;data[at+3]=255;
  }
  return {width:12,height:8,data};
}

const blobRegistry=new Map(),revoked=[],autoClicks=[];
const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobRegistry.set(url,blob);return url;};
URL.revokeObjectURL=url=>{revoked.push(url);revokeURL(url);};
const anchorClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.download&&this.href.startsWith('blob:')){
    autoClicks.push({name:this.download,href:this.href});return;
  }
  return anchorClick.apply(this,args);
};

let finalMode=false,finalEncodes=0,mutated=false;
let failureArmed=caseName!=='revoke';
const worker=createProcessing({workerURL:'/processing-worker.js'});
const processing={...worker,syntheticTestOnly:true,
  async decodeRaw(original,{mode,signal}={}){
    if(mode!=='final'||signal?.aborted)throw Error('TRIAL_BROWSER_FINAL_ONLY');
    const content=new TextDecoder().decode(original);
    if(!/^SYNTHETIC_NON_RAW_TRIAL_(first|second)$/.test(content))
      throw Error('TRIAL_BROWSER_NON_RAW_BYTES_INVALID');
    return {pixels:source(content.endsWith('first')?90:45),
      provenance:{fixture:'SYNTHETIC_NON_RAW_DECODE'}};
  },
  async encode(frame,options){
    const blob=await worker.encode(frame,options);
    if(finalMode&&options.format==='png'){
      finalEncodes++;
      if(failureArmed&&!mutated&&finalEncodes===1&&caseName!=='success'){
        mutated=true;
        if(caseName==='revision'){
          const changed=await api.saveRecipe(first.asset.id,1,
            structuredClone(first.saved.body));
          expect(changed.revision===2,'actual Trial Recipe version changed');
        }
        else if(caseName==='sha'||caseName==='revoke'){
          const response=await fetch(`/__fixture/${caseName==='sha'?'tamper':'revoke'}`,
            {method:'POST',headers:{'X-Suite-Browser-Probe':'1'}});
          if(!response.ok||(await response.json()).changed!==true)
            throw Error('TRIAL_BROWSER_MUTATION_FAILED');
        }else throw Error('TRIAL_BROWSER_CASE_UNKNOWN');
      }
    }
    return blob;
  },
};
const session=new EditorSession({api,storage,processing,
  personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(first.asset.id);
const dispose=mountEditor(session,{trialSession:actualSession,authorAPI:api});
const links=()=>[...document.querySelectorAll('#batch-final-downloads a')];
const select=(id,value)=>{
  const control=document.querySelector(id);control.value=value;
  control.dispatchEvent(new Event('change',{bubbles:true}));
};
const choose=id=>document.querySelector(`#batch-final-assets input[value="${id}"]`).click();
const status=()=>document.querySelector('#batch-final-status').textContent;
const names=()=>links().map(link=>link.download);
const startBatch=()=>{
  finalMode=true;finalEncodes=0;mutated=false;
  document.querySelector('#batch-final-start').click();
};
async function verifyLinks(expectedNames){
  await waitFor(()=>links().length===2&&status().includes('2件すべてのFinal'),
    `successful ${expectedNames.join(',')}`);
  expect(JSON.stringify(names())===JSON.stringify(expectedNames),'safe names and explicit order');
  const colors=[];
  for(const link of links()){
    const blob=blobRegistry.get(link.href);
    expect(blob?.type==='image/png'&&blob.size>0,'link holds real Worker PNG Blob');
    const bitmap=await createImageBitmap(blob);
    expect(bitmap.width===12&&bitmap.height===8,'real Worker PNG decodes at 12x8');
    const canvas=new OffscreenCanvas(12,8),context=canvas.getContext('2d');
    context.drawImage(bitmap,0,0);colors.push(context.getImageData(0,0,1,1).data[0]);
    bitmap.close();
  }
  expect(colors[0]<colors[1],'Blob pixels follow second then first Asset');
  expect(finalEncodes===2&&autoClicks.length===0,'two Final encodes; no automatic download');
  expect(session.state.asset.id===first.asset.id&&!session.state.dirty,
    'selected Asset and clean Recipe preserved');
  for(const record of records){
    expect(await checksum(await api.getOriginal(record.asset.id))===record.asset.sha256,
      'actual Original SHA unchanged');
    const saved=await api.getRecipe(record.asset.id);
    expect(saved?.revision===1&&JSON.stringify(saved.body)===JSON.stringify(record.saved.body),
      'actual saved Recipe unchanged');
  }
}
async function runSuccess(){
  const passed=[];
  choose(second.asset.id);choose(first.asset.id);
  expect(document.querySelector('#batch-final-selection').textContent
    .includes('second.NONRAW → 2. first.NONRAW'),'explicit reversed selection');
  select('#batch-final-format','png');
  const custom=document.querySelector('#batch-final-custom');
  for(const [method,value,expected] of [
    ['original','',['second.png','first.png']],
    ['custom-count','../Selection',['_Selection (1 of 2).png','_Selection (2 of 2).png']],
    ['custom-sequence','../Selection',['_Selection_001.png','_Selection_002.png']],
    ['original-custom','Studio',['second_Studio.png','first_Studio.png']],
  ]){
    const oldURLs=links().map(link=>link.href);
    select('#batch-final-naming',method);
    custom.value=value;custom.dispatchEvent(new Event('input',{bubbles:true}));
    expect(links().length===0&&oldURLs.every(url=>revoked.includes(url)),
      `${method}: naming change revokes old links`);
    startBatch();await verifyLinks(expected);
    passed.push(`${method}: actual Trial saved pair → Worker PNG → safe manual links`);
  }
  const oldURLs=links().map(link=>link.href);
  choose(second.asset.id);
  expect(links().length===0&&oldURLs.every(url=>revoked.includes(url)),
    'selection change removes links and revokes URLs');
  passed.push('selection-change URL revoke / no auto-click');
  dispose();worker.dispose();
  return passed;
}
async function runFailure(){
  const passed=[];
  choose(second.asset.id);choose(first.asset.id);
  select('#batch-final-format','png');
  select('#batch-final-naming','original');
  if(caseName==='revoke'){
    startBatch();await verifyLinks(['second.png','first.png']);
    const oldURLs=links().map(link=>link.href);
    select('#batch-final-naming','original-custom');
    const custom=document.querySelector('#batch-final-custom');
    custom.value='Revoked';custom.dispatchEvent(new Event('input',{bubbles:true}));
    expect(links().length===0&&oldURLs.every(url=>revoked.includes(url)),
      'auth-loss setup revokes previous Blob URLs');
    failureArmed=true;
  }
  startBatch();
  await waitFor(()=>status().includes('完了していません'),`${caseName} failed Final`);
  const error=document.querySelector('#error-banner').textContent;
  const expected=caseName==='revision'?'EXPORT_BATCH_FIXED_RECIPE_MISMATCH':
    caseName==='sha'?'WAITING_FOR_ORIGINAL':'TRIAL_REVOKED';
  expect(error.includes(expected),`${caseName}: actual failure reason ${expected}; got ${error}`);
  expect(mutated&&finalEncodes===1&&links().length===0,
    `${caseName}: first Blob internal only, zero partial links`);
  if(caseName==='revision')
    expect((await api.getRecipe(first.asset.id)).revision===2,
      'actual Trial saved Recipe version remains changed');
  if(caseName==='sha'){
    let unavailable=false;
    try{await api.getOriginal(first.asset.id);}
    catch(error){unavailable=error.message.includes('WAITING_FOR_ORIGINAL');}
    expect(unavailable,'actual Trial invalidates tampered Original');
  }
  if(caseName==='revoke'){
    let denied=false;
    try{await api.assertPermission(first.asset.id,'export');}
    catch(error){denied=error.message.includes('TRIAL_REVOKED');}
    expect(denied,'actual Trial permission rejects revoked invitation');
  }
  expect(autoClicks.length===0,'failure never auto-downloads');
  passed.push(`${caseName}: real Trial change after first Worker Blob, zero partial links`);
  dispose();worker.dispose();
  return passed;
}
async function run(){
  expect(['success','revision','sha','revoke'].includes(caseName),'known case');
  const passed=caseName==='success'?await runSuccess():await runFailure();
  report.textContent=JSON.stringify({caseName,passed,finalEncodes,
    linkCount:links().length,revokedCount:revoked.length,autoClicks,
    owner:actualSession.principal.id,selectedAsset:session.state.asset?.id});
  verdict.textContent=JSON.stringify({result:'TRIAL_BROWSER_NAMING_PASS',caseName,passed});
}
document.querySelector('#probe-run').addEventListener('click',()=>{
  void run().catch(error=>{
    verdict.textContent=JSON.stringify({result:'TRIAL_BROWSER_NAMING_FAIL',
      caseName,error:error.message,stack:error.stack});
    report.textContent=JSON.stringify({caseName,finalEncodes,
      linkCount:links().length,revokedCount:revoked.length,autoClicks,
      uiStatus:status(),sessionError:session.state.error});
  });
});
report.textContent=JSON.stringify({caseName,ready:true,
  first:first.asset.id,second:second.asset.id,owner:actualSession.principal.id});
verdict.textContent='READY';
