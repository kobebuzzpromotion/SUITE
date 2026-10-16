import {createProcessing} from '../../src/processing/index.mjs';
import {BW_EDGE_REMOVAL_VERSION} from '../../src/processing/bw-edge-removal.mjs';

const verdict=document.querySelector('#verdict');
const assert=(condition,label)=>{if(!condition)throw Error('BW_EDGE_BROWSER_ASSERTION: '+label);};
const same=(left,right)=>left.length===right.length&&left.every((value,index)=>value===right[index]);
const binding={assetID:'11111111-1111-4111-8111-111111111111',
  originalSHA256:'a'.repeat(64),sourceWidth:32,sourceHeight:32};
const stroke=(u,v,radiusFraction)=>({operation:'ADD',path:[{u,v}],radiusFraction,hardness:1});
const documentFor=(correctionU=.5)=>({schemaVersion:1,engineVersion:BW_EDGE_REMOVAL_VERSION,
  binding:{...binding},subjectStrokes:[stroke(.5,.5,.25)],
  correctionStrokes:[stroke(correctionU,.28,.1)]});
const runtime=()=>({...binding,draftBaseRevision:4,savedRevision:4,
  confirmedSelections:{subject:true,correction:true},
  permissionEvidence:{...binding,savedRevision:4,action:'edit',allowed:true}});
function frame(){
  const width=32,height=32,data=new Uint8ClampedArray(width*height*4);
  for(let index=0;index<width*height;index++)data.set([110,70,50,255],index*4);
  data.set([2,3,4,187],(9*width+16)*4);
  data.set([245,2,99,0],0);
  return {width,height,data};
}
const pixel=(data,x,y)=>Array.from(data.slice((y*32+x)*4,(y*32+x)*4+4));

async function run(){
  const processing=createProcessing({workerURL:'/processing-worker.js'});
  try{
    const source=frame(),before=source.data.slice();
    const output=await processing.renderBWEdgeManual(source,documentFor(),runtime(),
      {target:'source'});
    assert(output.width===32&&output.height===32,'full source dimensions');
    assert(!same(pixel(output.data,16,9),pixel(before,16,9)),'real Worker changed painted fringe');
    assert(pixel(output.data,16,9)[3]===187,'fringe alpha unchanged');
    assert(same(pixel(output.data,0,0),pixel(before,0,0)),'transparent hidden RGB unchanged');
    assert(same(pixel(output.data,28,28),pixel(before,28,28)),'unpainted area unchanged');
    assert(same(source.data,before),'Original frame unmodified');
    const unpainted=await processing.renderBWEdgeManual(source,documentFor(.9),runtime(),
      {target:'source'});
    assert(same(pixel(unpainted.data,16,9),pixel(before,16,9)),'correction layer is an explicit gate');
    let stale=false;
    try{await processing.renderBWEdgeManual(source,documentFor(),
      {...runtime(),savedRevision:5},{target:'source'});}catch(error){
      stale=String(error?.message).includes('BW_EDGE_MANUAL_REVISION_MISMATCH');
    }
    assert(stale,'stale revision refused by real Worker');
    const controller=new AbortController();
    const pending=processing.renderBWEdgeManual(source,documentFor(),runtime(),
      {target:'source',signal:controller.signal});
    controller.abort();
    let cancelled=false;
    try{await pending;}catch(error){cancelled=error?.name==='AbortError';}
    assert(cancelled,'in-flight Worker abort returned no pixels');
    assert(same(source.data,before),'source unchanged after rejection and cancellation');
    verdict.textContent=JSON.stringify({status:'PASS',boundary:'real Chrome independent B/W manual Worker',
      userAgent:navigator.userAgent,dimensions:[output.width,output.height],
      fringeBefore:pixel(before,16,9),fringeAfter:pixel(output.data,16,9),
      subjectAndCorrection:'distinct',unpainted:'unchanged',alpha:'unchanged',
      hiddenRGB:'unchanged',stale:'rejected',abort:'rejected',source:'unchanged',
      authentication:'NOT_PROVEN_BY_WORKER'});
  }finally{processing.dispose();}
}
document.querySelector('#run').addEventListener('click',()=>{
  verdict.textContent='RUNNING';
  void run().catch(error=>{verdict.textContent=JSON.stringify({status:'FAIL',error:String(error?.stack??error)});});
});
