import {mountEditor} from '../../src/editor-ui.mjs';
import {neutralRecipe} from '../../src/session.mjs';

// Synthetic non-RAW browser wiring only. Authentication, Trial HTTP, Worker,
// persistence and Cloud are intentionally not simulated as product PASS.
const asset={id:'11111111-1111-4111-8111-111111111111',name:'fixture.NONRAW',sha256:'a'.repeat(64),size:100};
const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;
const context=canvas.getContext('2d');context.fillStyle='#888';context.fillRect(0,0,80,60);
const image=URL.createObjectURL(await new Promise(resolve=>canvas.toBlob(resolve,'image/png')));
let current={assets:[asset],asset,recipe:neutralRecipe(),revision:2,dirty:false,busy:null,error:null,
  beforeURL:image,afterURL:image,canUndo:false,canRedo:false,people:[],selectedPersonID:null,
  status:'SYNTHETIC_NON_RAW_BROWSER_ONLY',personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'};
const listeners=new Set();let rejectNext=false,applyCalls=0;
const session={get state(){return structuredClone(current);},get bwEdgeManualAvailable(){return true;},
  subscribe(fn){listeners.add(fn);fn(session.state);return()=>listeners.delete(fn);},
  async setBWEdgeManualStrokes(value){applyCalls++;if(rejectNext){rejectNext=false;throw Error('FIXTURE_AUTH_REVOKED');}
    current.recipe.parameters.extendedParameters.bwEdgeManual={schemaVersion:1,engineVersion:'suite-srgb8-explicit-mask-bw-edge-1',
      binding:{assetID:asset.id,originalSHA256:asset.sha256,sourceWidth:80,sourceHeight:60},
      ...structuredClone(value)};
    current.dirty=true;emit();},
};
function emit(){for(const fn of listeners)fn(session.state);}
const trialSession={mode:'INVITED_LOCAL_TRIAL',principal:{id:'fixture-owner',authorName:'Fixture Owner',role:'author',trialEndsAt:'2099-01-01T00:00:00.000Z'}};
const dispose=mountEditor(session,{trialSession,authorAPI:{listPresets:async()=>[]}});
const $=selector=>document.querySelector(selector);
const assert=(condition,message)=>{if(!condition)throw Error(`BW_EDGE_EDITOR_ASSERTION: ${message}`);};
const wait=async predicate=>{const until=performance.now()+10000;while(!predicate()){if(performance.now()>until)throw Error('BW_EDGE_EDITOR_WAIT_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,20));}};
function stroke(){const img=$('#after-image'),r=img.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  for(const [type,dx] of [['pointerdown',0],['pointermove',3],['pointerup',3]])img.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:51,pointerType:'mouse',button:0,isPrimary:true,clientX:x+dx,clientY:y+dx}));}
document.querySelector('#probe-run').addEventListener('click',async()=>{
  const verdict=$('#probe-verdict');try{
    await Promise.all([$('#before-image').decode(),$('#after-image').decode()]);emit();
    assert(!$('#bw-edge-mode').disabled,'authorized saved After enables mode');
    $('#bw-edge-mode').click();assert($('#bw-edge-mode').getAttribute('aria-pressed')==='true','mode started');
    stroke();assert($('#bw-edge-apply').disabled,'one layer cannot apply');
    const layer=$('#bw-edge-manual-root select[aria-label="範囲の層"]');layer.value='correction';layer.dispatchEvent(new Event('change',{bubbles:true}));
    stroke();assert($('#bw-edge-apply').disabled,'two layers still require explicit owner confirmation');
    $('#bw-edge-confirm').click();assert(!$('#bw-edge-apply').disabled,'confirmed two layers can apply');
    $('#bw-edge-apply').click();assert($('#bw-edge-apply').disabled,'pending apply prevents double submission');
    await wait(()=>applyCalls===1&&current.dirty&&$('#bw-edge-editor-status').textContent.includes('未保存'));
    assert(current.recipe.parameters.extendedParameters.bwEdgeManual.subjectStrokes.length===1,'subject bound to Recipe');
    assert(current.recipe.parameters.extendedParameters.bwEdgeManual.correctionStrokes.length===1,'correction bound to Recipe');
    assert(asset.sha256==='a'.repeat(64),'Original SHA unchanged');
    current.dirty=false;current.revision=3;emit();
    $('#bw-edge-mode').click();stroke();rejectNext=true;$('#bw-edge-confirm').click();$('#bw-edge-apply').click();
    await wait(()=>applyCalls===2&&$('#bw-edge-editor-status').textContent.includes('未適用'));
    assert(current.recipe.parameters.extendedParameters.bwEdgeManual.subjectStrokes.length===1,'rejected draft not in Recipe');
    assert($('#bw-edge-editor-status').textContent.includes('下書きは保持'),'rejection retains draft');
    assert($('#bw-edge-mode').disabled&&$('#bw-edge-apply').disabled,'permission failure blocks brush and retry');
    $('[data-view="before"]').click();assert($('#bw-edge-mode').disabled,'Before disables mode');
    verdict.textContent='BW_EDGE_EDITOR_BROWSER_PASS';
  }catch(error){verdict.textContent=`FAIL ${error.stack??error}`;}finally{dispose();URL.revokeObjectURL(image);}
});
