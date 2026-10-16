import {createProcessing} from '../../src/processing/index.mjs';
import {recipe as neutralRecipe} from '../fixtures.mjs';
import {BW_EDGE_REMOVAL_VERSION} from '../../src/processing/bw-edge-removal.mjs';

const verdict=document.querySelector('#verdict');
const assert=(condition,label)=>{if(!condition)throw Error('BW_NORMAL_BROWSER_ASSERTION: '+label);};
const same=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
const assetID='11111111-1111-4111-8111-111111111111',sha='a'.repeat(64);
const stroke=(u,v,radiusFraction)=>({operation:'ADD',path:[{u,v}],radiusFraction,hardness:1});
function bound(sourceWidth,sourceHeight){
  const body=neutralRecipe();
  body.parameters.extendedParameters.bwEdgeManual={schemaVersion:1,
    engineVersion:BW_EDGE_REMOVAL_VERSION,
    binding:{assetID,originalSHA256:sha,sourceWidth,sourceHeight},
    subjectStrokes:[stroke(.5,.5,.25)],correctionStrokes:[stroke(.5,.28,.1)]};
  return body;
}
function runtime(sourceWidth,sourceHeight){
  const binding={assetID,originalSHA256:sha,sourceWidth,sourceHeight};
  return {...binding,draftBaseRevision:4,savedRevision:4,
    confirmedSelections:{subject:true,correction:true},
    permissionEvidence:{...binding,savedRevision:4,action:'export',allowed:true}};
}
function frame(width,height,sourceWidth=width,sourceHeight=height){
  const data=new Uint8ClampedArray(width*height*4);
  for(let index=0;index<width*height;index++)data.set([110,70,50,255],index*4);
  data.set([2,3,4,187],(9*width+Math.floor(width/2))*4);
  data.set([245,2,99,0],0);
  return {width,height,sourceWidth,sourceHeight,data};
}
const pixel=(pixels,x,y)=>Array.from(pixels.data.slice((y*pixels.width+x)*4,
  (y*pixels.width+x)*4+4));

async function run(){
  const processing=createProcessing({workerURL:'/processing-worker.js'});
  try{
    const original=frame(32,32),originalBytes=original.data.slice();
    const old=await processing.render(original,neutralRecipe());
    assert(same(old.data,originalBytes),'old Recipe keeps exact pixels');
    assert(!old.provenance.processingOrder.includes('bwEdgeManual'),'old order unchanged');
    const current=await processing.render(original,bound(32,32),
      {bwEdgeRuntime:runtime(32,32),bwEdgeTarget:'source'});
    assert(!same(pixel(current,16,9),pixel(original,16,9)),
      'real Chrome normal Render changes manual fringe');
    assert(same(pixel(current,16,9),[110,70,50,187]),'normal Render pixel and alpha');
    assert(current.provenance.processingOrder.indexOf('bwEdgeManual')<
      current.provenance.processingOrder.indexOf('rotation'),'manual stage before rotation');
    assert(same(pixel(current,0,0),pixel(original,0,0)),'hidden RGB unchanged');
    assert(same(original.data,originalBytes),'Original unchanged');
    const proxy=frame(1600,32,1601,32),final=frame(1601,32);
    const body=bound(1601,32),proof=runtime(1601,32);
    const preview=await processing.render(proxy,body,
      {bwEdgeRuntime:proof,bwEdgeTarget:'proxy'});
    const exportFrame=await processing.render(final,body,
      {bwEdgeRuntime:proof,bwEdgeTarget:'source'});
    assert(preview.width===1600&&exportFrame.width===1601,'explicit Preview/Final target dimensions');
    assert(!same(pixel(preview,800,9),pixel(proxy,800,9)),'proxy fringe changed');
    assert(!same(pixel(exportFrame,800,9),pixel(final,800,9)),'final fringe changed');
    let missing=false,swapped=false;
    try{await processing.render(original,bound(32,32));}catch(error){
      missing=String(error?.message).includes('BW_EDGE_MANUAL_RUNTIME_REQUIRED');
    }
    try{await processing.render(proxy,body,
      {bwEdgeRuntime:proof,bwEdgeTarget:'source'});}catch(error){
      swapped=String(error?.message).includes('BW_EDGE_MANUAL_TARGET_DIMENSIONS_MISMATCH');
    }
    assert(missing&&swapped,'missing runtime and wrong target fail closed');
    const controller=new AbortController();
    const pending=processing.render(final,body,
      {bwEdgeRuntime:proof,bwEdgeTarget:'source',signal:controller.signal});
    controller.abort();
    let cancelled=false;
    try{await pending;}catch(error){cancelled=error?.name==='AbortError';}
    assert(cancelled,'in-flight normal Render abort has no output');
    verdict.textContent=JSON.stringify({status:'PASS',boundary:'real Chrome normal Render B/W manual stage',
      userAgent:navigator.userAgent,old:'byte-identical',sourceFringeBefore:pixel(original,16,9),
      sourceFringeAfter:pixel(current,16,9),proxyWidth:preview.width,finalWidth:exportFrame.width,
      missingRuntime:'rejected',wrongTarget:'rejected',abort:'rejected',
      original:'unchanged',authentication:'NOT_PROVEN_BY_WORKER'});
  }finally{processing.dispose();}
}
document.querySelector('#run').addEventListener('click',()=>{
  verdict.textContent='RUNNING';
  void run().catch(error=>{verdict.textContent=JSON.stringify({status:'FAIL',error:String(error?.stack??error)});});
});
