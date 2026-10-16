import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

const verdict=document.querySelector('#probe-verdict'),report=document.querySelector('#probe-report');
const expect=(value,message)=>{if(!value)throw Error(message);};
const waitFor=async(predicate,message)=>{const end=Date.now()+20000;
  while(Date.now()<end){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}
  throw Error(`TIMED_OUT: ${message}`);};
const calibration={red:{hue:80,saturation:-40},green:{hue:-70,saturation:35},
  blue:{hue:50,saturation:60}};
function recipe(value,exposure,temperature,sharpness){
  const body=neutralRecipe();body.parameters.exposure=exposure;
  body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',color:{temperature,
      ...(value?{calibration:structuredClone(value)}:{})},detail:{sharpness}};
  body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  return body;
}
function pixels(value){const width=18,height=12,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;data.set([(value+x*7)%256,Math.min(255,value+y*5),
      Math.max(0,value-45),255],at);
  }return {width,height,data};}
async function pixelOf(blob){expect(blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,'Final PNG Blob');
  const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
  const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
  const result=[...context.getImageData(0,0,bitmap.width,bitmap.height).data];bitmap.close();return result;}
function choose(id){const checkbox=[...document.querySelectorAll('input[name="batch-target"]')]
  .find(input=>input.value===id);expect(checkbox&&!checkbox.disabled,'explicit target selectable');
  checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));}

document.querySelector('#probe-run').addEventListener('click',()=>{void(async()=>{
  let dispose=null,worker=null;
  try{
    const invitation=await(await fetch('/fixture/new')).json();
    const client=new TrialClient();await client.login(invitation.inviteToken);
    const make=async name=>{const original=new TextEncoder().encode(`NON_RAW_CALIBRATION_SYNC_BROWSER_${name}`);
      const sha256=await checksum(original.buffer);
      const asset=await client.createAsset({name:`${name}.nonraw`,sha256,size:original.length});
      await client.putOriginal(asset.id,original.buffer.slice(0));return {asset,sha256};};
    const source=await make('source'),first=await make('first'),second=await make('second');
    const sourceRecipe=recipe(calibration,0.6,18,15);
    const firstRecipe=recipe({red:{hue:-20}},-0.4,-22,30);
    const secondRecipe=recipe(null,0.8,9,42);
    for(const [item,body] of [[source,sourceRecipe],[first,firstRecipe],[second,secondRecipe]])
      expect((await client.saveRecipe(item.asset.id,0,body)).revision===1,'saved initial Recipe');
    worker=createProcessing({workerURL:'/processing-worker.js'});
    const processing={...worker,syntheticTestOnly:true,async decodeRaw(original,{mode}={}){
      if(!['proxy','final'].includes(mode))throw Error('SYNTHETIC_MODE_INVALID');
      const text=new TextDecoder().decode(original);
      if(!text.startsWith('NON_RAW_CALIBRATION_SYNC_BROWSER_'))throw Error('REAL_RAW_NOT_SUPPORTED');
      return {pixels:pixels(text.includes('_second')?110:text.includes('_first')?90:70),
        provenance:{fixture:'SYNTHETIC_NON_RAW'},metadata:{fixture:true}};}};
    const session=new EditorSession({api:client,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
    await session.initialize();await session.openAsset(first.asset.id);
    const before=await pixelOf(await session.exportFinal({format:'png'}));
    await session.openAsset(source.asset.id);
    const sourceState={recipe:JSON.stringify(session.state.recipe),revision:session.state.revision,
      undo:session.state.canUndo,redo:session.state.canRedo};
    dispose=mountEditor(session,{trialSession:await client.getSession(),authorAPI:client});
    for(const primary of ['red','green','blue'])for(const field of ['hue','saturation'])
      expect(Number(document.querySelector(`#calibration-${primary}-${field}`)?.value)===
        calibration[primary][field],`source ${primary} ${field} loaded`);
    choose(first.asset.id);choose(second.asset.id);
    const button=document.querySelector('#calibration-sync-apply');
    expect(button&&!button.disabled,'separate Calibration sync action');button.click();
    await waitFor(()=>document.querySelector('#calibration-sync-outcome').textContent.includes('2/2 件'),
      'Calibration result in Editor');
    const rows=[...document.querySelectorAll('#calibration-sync-results li')];
    expect(rows.length===2&&rows.every(row=>row.classList.contains('batch-result-saved')),
      'two target rows verified saved');
    expect(JSON.stringify(session.state.recipe)===sourceState.recipe&&
      session.state.revision===sourceState.revision&&session.state.canUndo===sourceState.undo&&
      session.state.canRedo===sourceState.redo,'source Recipe and Undo/Redo unchanged');
    for(const [item,prior] of [[first,firstRecipe],[second,secondRecipe]]){
      const stored=await client.getRecipe(item.asset.id);expect(stored.revision===2,'target CAS revision');
      const effects=stored.body.parameters.extendedParameters.postDecodeAdjustments;
      expect(JSON.stringify(effects.color.calibration)===JSON.stringify(calibration),
        'six Calibration values persisted');
      expect(stored.body.parameters.exposure===prior.parameters.exposure,'target exposure retained');
      expect(effects.color.temperature===
        prior.parameters.extendedParameters.postDecodeAdjustments.color.temperature,
        'target temperature retained');
      expect(effects.detail.sharpness===
        prior.parameters.extendedParameters.postDecodeAdjustments.detail.sharpness,
        'target Detail retained');
      expect(await checksum(await client.getOriginal(item.asset.id))===item.sha256,'Original SHA unchanged');
    }
    await session.openAsset(first.asset.id);
    expect(JSON.stringify(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.calibration)===
      JSON.stringify(calibration),'reloaded Calibration');
    const after=await pixelOf(await session.exportFinal({format:'png'}));
    expect(JSON.stringify(after)!==JSON.stringify(before),'actual Worker Final pixels changed');
    report.textContent=JSON.stringify({status:'CALIBRATION-SYNC-BROWSER-PASS',
      mode:'AUTHENTICATED_LOCAL_TRIAL_SYNTHETIC_NON_RAW',targets:2,casRevisions:[2,2],
      changedPixels:before.reduce((n,value,i)=>n+(value!==after[i]),0)});
    verdict.textContent='CALIBRATION-SYNC-BROWSER-PASS';
  }catch(error){verdict.textContent='CALIBRATION-SYNC-BROWSER-FAIL';report.textContent=error?.stack??String(error);}
  finally{dispose?.();worker?.dispose?.();}
})()});
