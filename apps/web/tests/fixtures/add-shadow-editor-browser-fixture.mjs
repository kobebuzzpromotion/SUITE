import {mountEditor,validatedSignOutURL} from '../../src/editor-ui.mjs';
import {neutralRecipe} from '../../src/session.mjs';

// Browser-only synthetic non-RAW UI wiring. This is NOT a Trial authority,
// save, Worker Final, actual RAW decode, or Cloud verification.
const source={id:'11111111-1111-4111-8111-111111111111',name:'fixture.NONRAW',sha256:'a'.repeat(64),cloudSafe:true,deletedAt:null};
const background={id:'22222222-2222-4222-8222-222222222222',name:'background.NONRAW',sha256:'b'.repeat(64),cloudSafe:true,deletedAt:null};
const replacement={id:'33333333-3333-4333-8333-333333333333',name:'replacement.NONRAW',sha256:'c'.repeat(64),cloudSafe:true,deletedAt:null};
const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;
const ctx=canvas.getContext('2d');ctx.fillStyle='#888';ctx.fillRect(0,0,80,60);
const image=URL.createObjectURL(await new Promise(resolve=>canvas.toBlob(resolve,'image/png')));
let current={assets:[source,background,replacement],asset:source,recipe:neutralRecipe(),revision:2,dirty:false,busy:null,error:null,
  beforeURL:image,afterURL:image,shadowVerification:null,canUndo:false,canRedo:false,
  people:[],selectedPersonID:null,status:'SYNTHETIC_NON_RAW_BROWSER_ONLY',personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'};
const listeners=new Set(),calls=[];
const session={proxy:{width:80,height:60,data:new Uint8ClampedArray(80*60*4)},
  get state(){return structuredClone(current);},get addShadowManualAvailable(){return true;},
  subscribe(fn){listeners.add(fn);fn(session.state);return()=>listeners.delete(fn);},
  async setAddShadowManualDocument(value,{replaceBackdrop,signal}={}){
    if(signal?.aborted)throw Error('ABORTED');
    calls.push({binding:structuredClone(value.binding),replaceBackdrop});
    current.recipe.parameters.extendedParameters.addShadowManual=structuredClone(value);
    current.dirty=true;current.shadowVerification='draft';emit();
  }};
function emit(){for(const fn of listeners)fn(session.state);}
const trialSession={mode:'INVITED_LOCAL_TRIAL',principal:{id:'fixture-owner',authorName:'Fixture Owner',role:'author',trialEndsAt:'2099-01-01T00:00:00.000Z'}};
const dispose=mountEditor(session,{trialSession,authorAPI:{listPresets:async()=>[]}});
const $=selector=>document.querySelector(selector);
const assert=(condition,message)=>{if(!condition)throw Error(`SHADOW_EDITOR_BROWSER_ASSERTION: ${message}`);};
const wait=async predicate=>{const until=performance.now()+10000;while(!predicate()){if(performance.now()>until)throw Error('SHADOW_EDITOR_BROWSER_WAIT_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,20));}};
function stroke(){const img=$('#after-image'),r=img.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  for(const [type,dx] of [['pointerdown',0],['pointermove',3],['pointerup',3]])img.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:52,pointerType:'mouse',button:0,isPrimary:true,clientX:x+dx,clientY:y+dx}));}
document.querySelector('#probe-run').addEventListener('click',async()=>{
  const verdict=$('#probe-verdict');try{
    await Promise.all([$('#before-image').decode(),$('#after-image').decode()]);emit();
    assert(!$('#add-shadow-mode').disabled,'saved Trial After enables mode');
    $('#add-shadow-mode').click();assert($('#add-shadow-mode').getAttribute('aria-pressed')==='true','mode started');
    const backdrop=$('#add-shadow-manual-root select[aria-label="背景Asset"]');backdrop.value=background.id;backdrop.dispatchEvent(new Event('change',{bubbles:true}));
    const mode=$('#add-shadow-manual-root select[aria-label="影モード"]');mode.value='soft';mode.dispatchEvent(new Event('change',{bubbles:true}));
    stroke();$('#add-shadow-manual-root button:nth-last-of-type(2)').click();
    await wait(()=>calls.length===1&&current.dirty);
    assert(current.recipe.parameters.extendedParameters.addShadowManual.binding.backdropID===background.id,'background bound to Recipe');
    assert(current.recipe.parameters.extendedParameters.addShadowManual.subjectStrokes.length===1,'stroke saved in Recipe draft');
    assert(source.sha256==='a'.repeat(64),'Original SHA unchanged');
    current.dirty=false;current.revision=3;current.shadowVerification='verified';emit();
    await wait(()=>!$('#add-shadow-mode').disabled&&$('#add-shadow-mode').getAttribute('aria-pressed')==='false');
    $('#add-shadow-mode').click();
    const replacementSelect=$('#add-shadow-manual-root select[aria-label="背景Asset"]');replacementSelect.value=replacement.id;replacementSelect.dispatchEvent(new Event('change',{bubbles:true}));
    $('#add-shadow-manual-root button:nth-last-of-type(2)').click();
    await new Promise(resolve=>setTimeout(resolve,30));
    assert(calls.length===1,'without explicit Replace no callback');
    const confirm=$('#add-shadow-manual-root input[aria-label="保存済み背景を明示的に置換"]');
    assert(!confirm.disabled,`Replace confirmation offered; hidden=${confirm.parentElement.hidden}, selected=${replacementSelect.value}, mode=${$('#add-shadow-mode').getAttribute('aria-pressed')}, status=${$('#add-shadow-manual-root [role="status"]')?.textContent}`);confirm.click();
    $('#add-shadow-manual-root button:nth-last-of-type(2)').click();
    await wait(()=>calls.length===2&&current.dirty);
    assert(calls[1].replaceBackdrop===true,'explicit Replace reached host');
    assert(current.recipe.parameters.extendedParameters.addShadowManual.binding.backdropID===replacement.id,'old background replaced');
    current.dirty=false;current.revision=4;current.shadowVerification='verified';emit();
    await wait(()=>!$('#add-shadow-mode').disabled&&$('#add-shadow-mode').getAttribute('aria-pressed')==='false');
    $('[data-view="before"]').click();assert($('#add-shadow-mode').disabled,'Before disables mode');
    assert(validatedSignOutURL('/auth/logout?return_to=/').includes('/auth/logout'),'unrelated logout route remains');
    verdict.textContent=`ADD_SHADOW_EDITOR_BROWSER_PASS ${JSON.stringify({calls:calls.length,strokes:1,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth})}`;
  }catch(error){verdict.textContent=`FAIL ${error.stack??error}`;}finally{dispose();URL.revokeObjectURL(image);}
});
