import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Deferred real-browser probe. This deliberately uses authenticated Trial
// HTTP/SQLite and synthetic NON-RAW bytes; it is never a RAW/Cloud claim.
const $=selector=>document.querySelector(selector);
const assert=(condition,message)=>{if(!condition)throw Error(`SHADOW_EDITOR: ${message}`);};
async function wait(predicate,label){const until=Date.now()+25000;
  while(!predicate()){if(Date.now()>until)throw Error(`TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,25));}}
function frame(level){const width=40,height=20,data=new Uint8ClampedArray(width*height*4);
  for(let index=0;index<width*height;index++)data.set([level,level,level,255],index*4);
  return {width,height,sourceWidth:width,sourceHeight:height,data};}
let active=null;
async function setup(){
  const invitation=await (await fetch('/fixture/new',{method:'POST'})).json();
  const api=new TrialClient();await api.login(invitation.inviteToken);
  async function make(label){const bytes=new TextEncoder().encode(`SYNTHETIC_NONRAW_ORIGINAL_SHADOW_EDITOR_${label}`);
    const sha256=await checksum(bytes.buffer);
    const asset=await api.createAsset({name:`${label}.nonraw`,sha256,size:bytes.length});
    await api.putOriginal(asset.id,bytes.buffer.slice(0));
    await api.saveRecipe(asset.id,0,neutralRecipe());
    return {asset,sha256};}
  const target=await make('target'),backdrop=await make('backdrop');
  const worker=createProcessing({workerURL:'/processing-worker.js'});
  const processing={...worker,syntheticTestOnly:true,
    async decodeRaw(bytes,{mode,signal}={}){
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      const sourceSHA256=await checksum(bytes);
      const level=sourceSHA256===target.sha256?50:
        sourceSHA256===backdrop.sha256?180:null;
      if(level===null)throw Error('UNKNOWN_SYNTHETIC_BYTES');
      return {pixels:frame(level),provenance:{sourceSHA256,
        sourceRepresentation:'synthetic-nonraw-test',mode}};
    }};
  const session=new EditorSession({api,processing,
    personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset(target.asset.id);
  const dispose=mountEditor(session,{trialSession:await api.getSession(),authorAPI:api});
  return {api,target,backdrop,worker,session,dispose};
}
$('#probe-run').addEventListener('click',async()=>{
  if(active)throw Error('RELOAD_FIXTURE_FOR_NEW_RUN');
  try{
    const f=active=await setup();
    await wait(()=>$('#after-image').naturalWidth===40&&
      $('#original-shadow-backdrop option').length>=2,'Editor After and background choice');
    const select=$('#original-shadow-backdrop');select.value=f.backdrop.asset.id;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    assert(!$('#original-shadow-mode').disabled,'saved After enables explicit check');
    $('[data-view="before"]').click();
    assert($('#original-shadow-mode').disabled,'Before cannot start');
    $('[data-view="after"]').click();
    await wait(()=>!$('#original-shadow-mode').disabled,'After returns');
    $('#original-shadow-mode').click();
    await wait(()=>$('#original-shadow-manual-root .suite-original-shadow-manual')&&
      !$('#original-shadow-manual-root [data-original-shadow-action="add"]').disabled,
    'fresh Trial double-Original bridge mount');
    assert($('#original-shadow-editor-status').textContent.includes('確認'),
      'product Editor reports verified scope');
    $('[data-view="before"]').click();
    assert($('#original-shadow-manual-root [data-original-shadow-action="submit"]').disabled,
      'Before disables mounted brush');
    $('[data-view="after"]').click();
    $('#original-shadow-mode').click();
    assert(!$('#original-shadow-manual-root .suite-original-shadow-manual'),
      'explicit exit disposes brush');
    assert(await checksum(await f.api.getOriginal(f.target.asset.id))===f.target.sha256,
      'target Original unchanged');
    assert(await checksum(await f.api.getOriginal(f.backdrop.asset.id))===f.backdrop.sha256,
      'background Original unchanged');
    $('#probe-report').textContent='Trial SQLite synthetic nonRAW mount, Before, exit, Original SHA verified. Two-layer pointer Save/Final and real Chrome execution remain separately reported.';
    $('#probe-verdict').textContent='ORIGINAL_SHADOW_EDITOR_PRODUCT_BROWSER_PASS';
  }catch(error){$('#probe-verdict').textContent=`FAIL ${error.stack??error}`;}
  finally{active?.dispose();active?.worker.dispose();}
});
