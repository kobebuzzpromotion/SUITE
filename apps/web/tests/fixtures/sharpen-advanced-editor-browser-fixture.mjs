const byID=selector=>document.querySelector(selector);
const expect=(condition,label)=>{if(!condition)throw Error(`SHARPEN_BROWSER_ASSERTION: ${label}`);};
const createdBlobs=new Map(),createURL=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);createdBlobs.set(url,blob);return url;};
let phase='initial';
await import('./detail-controls-editor-browser-fixture.mjs');
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`SHARPEN_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
async function rgba(url){
  const response=createdBlobs.has(url)?null:await fetch(url),blob=createdBlobs.get(url)??await response.blob();
  expect(blob.type.startsWith('image/'),`image blob at ${phase}: ${blob.type} ${blob.size}`);
  const bitmap=await createImageBitmap(blob);
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(bitmap,0,0);const output=new Uint8ClampedArray(context.getImageData(0,0,bitmap.width,bitmap.height).data);
  bitmap.close();return output;
}
const different=(left,right)=>left.some((value,index)=>value!==right[index]);
async function change(field,value){
  phase=`change ${field}`;
  const input=byID(`#detail-${field}`);expect(input&&!input.disabled,`${field} is a working accessible slider`);
  const before=byID('#after-image').src;
  input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>byID('#after-image').src.startsWith('blob:')&&byID('#after-image').src!==before&&
    Number(input.value)===value,`${field} Worker Preview`);
  await waitFor(()=>byID('[data-action="save"]')&&!byID('[data-action="save"]').disabled,`${field} dirty Recipe`);
}
async function saveReload(){
  phase='save/reload';
  byID('[data-action="save"]').click();
  await waitFor(()=>byID('[data-action="reload"]')&&!byID('[data-action="reload"]').disabled,'saved Recipe');
  const prior=byID('#after-image').src;
  byID('[data-action="reload"]').click();
  await waitFor(()=>byID('#after-image').src.startsWith('blob:')&&byID('#after-image').src!==prior&&
    !byID('[data-action="export-png"]').disabled,'reloaded Recipe');
}
async function final(){
  phase='Final';
  const previous=byID('#download-link').href;
  byID('[data-action="export-png"]').click();
  await waitFor(()=>!byID('#download-link').hidden&&byID('#download-link').href.startsWith('blob:')&&
    byID('#download-link').href!==previous,'Final Worker Blob');
  return rgba(byID('#download-link').href);
}
async function probe(){
  phase='initial before';
  const advanced=['sharpenRadius','sharpenDetail','sharpenMasking'];
  const before=await rgba(byID('#before-image').src);
  expect(advanced.every(field=>byID(`#detail-${field}`)?.disabled),'advanced controls disabled until Sharpness > 0');
  await change('sharpness',85);await saveReload();
  let priorPreview=await rgba(byID('#after-image').src),priorFinal=await final();
  const results=[];
  for(const [field,value] of [['sharpenRadius',100],['sharpenDetail',100],['sharpenMasking',100]]){
    await change(field,value);
    const nextPreview=await rgba(byID('#after-image').src);
    expect(different(priorPreview,nextPreview),`${field} actually changes Worker Preview pixels`);
    if(field==='sharpenMasking'){
      const priorUndo=byID('#after-image').src;
      byID('[data-action="undo"]').click();
      await waitFor(()=>Number(byID(`#detail-${field}`).value)===0&&
        byID('#after-image').src.startsWith('blob:')&&byID('#after-image').src!==priorUndo,'Masking Undo');
      expect(!different(await rgba(byID('#after-image').src),priorPreview),'Undo restores prior Preview pixels');
      const priorRedo=byID('#after-image').src;
      byID('[data-action="redo"]').click();
      await waitFor(()=>Number(byID(`#detail-${field}`).value)===value&&
        byID('#after-image').src.startsWith('blob:')&&byID('#after-image').src!==priorRedo,'Masking Redo');
      expect(!different(await rgba(byID('#after-image').src),nextPreview),'Redo restores adjusted Preview pixels');
    }
    await saveReload();
    expect(Number(byID(`#detail-${field}`).value)===value,`${field} survives Save/Reload`);
    const nextFinal=await final();expect(different(priorFinal,nextFinal),`${field} actually changes Worker Final pixels`);
    results.push({field,value,previewChanged:true,finalChanged:true,savedReloaded:true});
    priorPreview=nextPreview;priorFinal=nextFinal;
  }
  expect(!different(before,await rgba(byID('#before-image').src)),'Original/Before pixels stay unchanged');
  byID('#sharpen-verdict').textContent=JSON.stringify({result:'SHARPEN-BROWSER-PASS',
    boundary:'synthetic authenticated non-RAW Editor to actual Worker Preview/Final',results,
    undoRedo:true,beforeUnchanged:true,adobePixelParity:'NOT_CLAIMED',realRAW:'NOT_RUN',cloud:'NOT_RUN'});
}
byID('#sharpen-run').addEventListener('click',()=>void probe().catch(error=>{
  byID('#sharpen-verdict').textContent=JSON.stringify({result:'SHARPEN-BROWSER-FAIL',phase,error:error.message,stack:error.stack});
}));
