import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

const verdict=document.querySelector('#probe-verdict'),report=document.querySelector('#probe-report');
const expect=(value,message)=>{if(!value)throw Error(message);};
const waitFor=async(predicate,message)=>{const end=Date.now()+20000;
  while(Date.now()<end){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}
  throw Error(`TIMED_OUT: ${message}`);};
const grain={amount:72,seed:0x12345678,shadows:75,midtones:85,highlights:65,
  size:35,roughness:25,colorVariation:45};
function recipe(grainValue,exposure){
  const body=neutralRecipe();body.parameters.exposure=exposure;
  if(grainValue){body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',detail:{grain:structuredClone(grainValue)}};
    body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');}
  return body;
}
function pixels(value){const width=18,height=12,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;data.set([(value+x*5)%256,Math.min(255,value+y*4),
      Math.max(0,value-35),255],at);
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
    const make=async name=>{const original=new TextEncoder().encode(`NON_RAW_GRAIN_SYNC_BROWSER_${name}`);
      const sha256=await checksum(original.buffer);
      const asset=await client.createAsset({name:`${name}.nonraw`,sha256,size:original.length});
      await client.putOriginal(asset.id,original.buffer.slice(0));return {asset,sha256};};
    const source=await make('source'),first=await make('first'),second=await make('second');
    const sourceRecipe=recipe(grain,0.6),firstRecipe=recipe({amount:12,seed:9},-0.4),
      secondRecipe=recipe(null,0.8);
    for(const [item,body] of [[source,sourceRecipe],[first,firstRecipe],[second,secondRecipe]])
      expect((await client.saveRecipe(item.asset.id,0,body)).revision===1,'saved initial Recipe');
    worker=createProcessing({workerURL:'/processing-worker.js'});
    const processing={...worker,syntheticTestOnly:true,async decodeRaw(original,{mode}={}){
      if(!['proxy','final'].includes(mode))throw Error('SYNTHETIC_MODE_INVALID');
      const text=new TextDecoder().decode(original);
      if(!text.startsWith('NON_RAW_GRAIN_SYNC_BROWSER_'))throw Error('REAL_RAW_NOT_SUPPORTED');
      return {pixels:pixels(text.includes('_second')?110:text.includes('_first')?90:70),
        provenance:{fixture:'SYNTHETIC_NON_RAW'},metadata:{fixture:true}};}};
    const session=new EditorSession({api:client,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
    await session.initialize();await session.openAsset(first.asset.id);
    const before=await pixelOf(await session.exportFinal({format:'png'}));
    await session.openAsset(source.asset.id);
    const sourceState={recipe:JSON.stringify(session.state.recipe),revision:session.state.revision,
      undo:session.state.canUndo,redo:session.state.canRedo};
    dispose=mountEditor(session,{trialSession:await client.getSession(),authorAPI:client});
    expect(document.querySelector('#detail-grain')?.value==='72','Grain amount in source UI');
    for(const field of ['shadows','midtones','highlights','size','roughness','colorVariation'])
      expect(Number(document.querySelector(`#grain-${field}`)?.value)===grain[field],
        `Grain ${field} in source UI`);
    choose(first.asset.id);choose(second.asset.id);
    const button=document.querySelector('#grain-sync-apply');
    expect(button&&!button.disabled,'separate Grain sync action');button.click();
    await waitFor(()=>document.querySelector('#grain-sync-outcome').textContent.includes('2/2 件'),
      'Grain result in Editor');
    const rows=[...document.querySelectorAll('#grain-sync-results li')];
    expect(rows.length===2&&rows.every(row=>row.classList.contains('batch-result-saved')),
      'two target rows verified saved');
    expect(JSON.stringify(session.state.recipe)===sourceState.recipe&&
      session.state.revision===sourceState.revision&&session.state.canUndo===sourceState.undo&&
      session.state.canRedo===sourceState.redo,'source Recipe and Undo/Redo unchanged');
    for(const [item,prior] of [[first,firstRecipe],[second,secondRecipe]]){
      const stored=await client.getRecipe(item.asset.id);expect(stored.revision===2,'target CAS revision');
      expect(JSON.stringify(stored.body.parameters.extendedParameters.postDecodeAdjustments.detail.grain)===
        JSON.stringify(grain),'seven Grain controls and seed persisted');
      expect(stored.body.parameters.exposure===prior.parameters.exposure,'target exposure retained');
      expect(await checksum(await client.getOriginal(item.asset.id))===item.sha256,'Original SHA unchanged');
    }
    await session.openAsset(first.asset.id);
    expect(JSON.stringify(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.detail.grain)===
      JSON.stringify(grain),'reloaded Grain');
    const after=await pixelOf(await session.exportFinal({format:'png'}));
    expect(JSON.stringify(after)!==JSON.stringify(before),'actual Worker Final pixels changed');
    report.textContent=JSON.stringify({status:'GRAIN-SYNC-BROWSER-PASS',
      mode:'AUTHENTICATED_LOCAL_TRIAL_SYNTHETIC_NON_RAW',targets:2,casRevisions:[2,2],
      changedPixels:before.reduce((n,value,i)=>n+(value!==after[i]),0)});
    verdict.textContent='GRAIN-SYNC-BROWSER-PASS';
  }catch(error){verdict.textContent='GRAIN-SYNC-BROWSER-FAIL';report.textContent=error?.stack??String(error);}
  finally{dispose?.();worker?.dispose?.();}
})()});
