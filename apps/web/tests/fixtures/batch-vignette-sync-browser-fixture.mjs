import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession, checksum, neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Authenticated local Trial + actual Editor/Worker; synthetic NON-RAW decoder seam.
const verdict=document.querySelector('#probe-verdict');
const report=document.querySelector('#probe-report');
const expect=(value,message)=>{if(!value)throw Error(message);};
const waitFor=async(predicate,message)=>{
  const end=Date.now()+20000;
  while(Date.now()<end){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}
  throw Error(`TIMED_OUT: ${message}`);
};
const controls={amount:-80,midpoint:70,roundness:-35,feather:75,highlights:60};
function recipe({vignette,exposure=0}={}){
  const body=neutralRecipe();body.parameters.exposure=exposure;
  if(vignette)body.parameters.extendedParameters.postCropAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-manual-vignette-1',vignette:structuredClone(vignette)};
  return body;
}
function pixels(value){
  const width=18,height=12,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,channel=(x+y)%3===0?Math.min(255,value+90):value;
    data.set([channel,channel,channel,255],at);
  }
  return {width,height,data};
}
async function pixelOf(blob){
  expect(blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,'actual Final PNG Blob');
  const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
  const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
  const result=[...context.getImageData(0,0,1,1).data];bitmap.close();return result;
}
function choose(id){
  const checkbox=[...document.querySelectorAll('input[name="batch-target"]')].find(input=>input.value===id);
  expect(checkbox&&!checkbox.disabled,'target is explicitly selectable');
  checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));
}

document.querySelector('#probe-run').addEventListener('click',()=>{void(async()=>{
  let dispose=null,worker=null;
  try{
    const invitation=await(await fetch('/fixture/new')).json();
    const client=new TrialClient();await client.login(invitation.inviteToken);
    const make=async name=>{
      const original=new TextEncoder().encode(`NON_RAW_VIGNETTE_SYNC_BROWSER_${name}`);
      const sha256=await checksum(original.buffer);
      const asset=await client.createAsset({name:`${name}.nonraw`,sha256,size:original.length});
      await client.putOriginal(asset.id,original.buffer.slice(0));
      return {asset,sha256};
    };
    const source=await make('source'),first=await make('first'),second=await make('second');
    const sourceRecipe=recipe({vignette:controls,exposure:0.4});
    const firstRecipe=recipe({vignette:{amount:25},exposure:-0.5});
    const secondRecipe=recipe({exposure:0.7});
    for(const [item,body] of [[source,sourceRecipe],[first,firstRecipe],[second,secondRecipe]])
      expect((await client.saveRecipe(item.asset.id,0,body)).revision===1,'saved initial Recipe');
    worker=createProcessing({workerURL:'/processing-worker.js'});
    const processing={...worker,syntheticTestOnly:true,
      async decodeRaw(original,{mode}={}){
        if(!['proxy','final'].includes(mode))throw Error('SYNTHETIC_MODE_INVALID');
        const text=new TextDecoder().decode(original);
        if(!text.startsWith('NON_RAW_VIGNETTE_SYNC_BROWSER_'))throw Error('REAL_RAW_NOT_SUPPORTED');
        return {pixels:pixels(text.includes('_second')?110:text.includes('_first')?90:70),
          provenance:{fixture:'SYNTHETIC_NON_RAW'},metadata:{fixture:true}};
      }};
    const session=new EditorSession({api:client,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
    await session.initialize();await session.openAsset(first.asset.id);
    const before=await pixelOf(await session.exportFinal({format:'png'}));
    await session.openAsset(source.asset.id);
    const sourceState={recipe:JSON.stringify(session.state.recipe),revision:session.state.revision,
      undo:session.state.canUndo,redo:session.state.canRedo};
    dispose=mountEditor(session,{trialSession:await client.getSession(),authorAPI:client});
    const values=['amount','midpoint','roundness','feather','highlights'].map(field=>
      Number(document.querySelector(`#vignette-${field}`)?.value));
    expect(JSON.stringify(values)===JSON.stringify(Object.values(controls)),'five source UI controls loaded');
    choose(first.asset.id);choose(second.asset.id);
    const button=document.querySelector('#vignette-sync-apply');
    expect(button&&!button.disabled&&document.querySelector('#batch-selection').textContent.includes('2 件'),
      'two explicit targets and separate Vignette Sync action');
    button.click();
    await waitFor(()=>document.querySelector('#vignette-sync-outcome').textContent.includes('2/2 件'),
      'Vignette Sync outcome in actual Editor');
    const rows=[...document.querySelectorAll('#vignette-sync-results li')];
    expect(rows.length===2&&rows.every(row=>row.classList.contains('batch-result-saved')),
      'both target rows verified saved');
    expect(JSON.stringify(session.state.recipe)===sourceState.recipe&&
      session.state.revision===sourceState.revision&&
      session.state.canUndo===sourceState.undo&&session.state.canRedo===sourceState.redo,
      'source current history and Undo/Redo unchanged');
    for(const [item,prior] of [[first,firstRecipe],[second,secondRecipe]]){
      const stored=await client.getRecipe(item.asset.id);
      expect(stored.revision===2,'target CAS revision advanced');
      expect(JSON.stringify(stored.body.parameters.extendedParameters.postCropAdjustments.vignette)===
        JSON.stringify(controls),'all five controls persisted');
      expect(stored.body.parameters.exposure===prior.parameters.exposure,'unrelated exposure preserved');
      expect(await checksum(await client.getOriginal(item.asset.id))===item.sha256,'Original SHA unchanged');
    }
    await session.openAsset(first.asset.id);
    expect(JSON.stringify(session.state.recipe.parameters.extendedParameters.postCropAdjustments.vignette)===
      JSON.stringify(controls),'reload returns saved five controls');
    const after=await pixelOf(await session.exportFinal({format:'png'}));
    expect(JSON.stringify(after)!==JSON.stringify(before),'actual Worker Final corner pixel changed');
    report.textContent=JSON.stringify({status:'VIGNETTE-SYNC-BROWSER-PASS',
      mode:'AUTHENTICATED_LOCAL_TRIAL_SYNTHETIC_NON_RAW',targets:2,casRevisions:[2,2],
      before,after,sourceUndoRedoUnchanged:true});
    verdict.textContent='VIGNETTE-SYNC-BROWSER-PASS';
  }catch(error){verdict.textContent='VIGNETTE-SYNC-BROWSER-FAIL';report.textContent=error?.stack??String(error);}
  finally{dispose?.();worker?.dispose?.();}
})()});
