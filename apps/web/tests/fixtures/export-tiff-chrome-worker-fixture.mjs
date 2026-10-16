import {createProcessing} from '../../src/processing/index.mjs';

const verdict=document.querySelector('#verdict');
const require=(condition,label)=>{if(!condition)throw Error(`TIFF_BROWSER_ASSERTION: ${label}`);};
const same=(actual,expected,label)=>require(actual.length===expected.length&&actual.every((v,i)=>v===expected[i]),label);
const settings=(overrides={})=>({format:'tiff',jpeg_quality:95,bit_depth:8,color_space:'sRGB',
  tiff_compression:'none',preserve_alpha:true,metadata:'remove',file_name_template:'{original}',requested_dpi:96,...overrides});
const source=()=>({width:2,height:1,data:new Uint8ClampedArray([200,80,10,0,20,40,60,255])});

function inspectTIFF(blobBytes){
  const bytes=new Uint8Array(blobBytes),view=new DataView(bytes.buffer);
  require(bytes.length>=8&&bytes[0]===73&&bytes[1]===73&&view.getUint16(2,true)===42,'TIFF 6.0 little-endian header');
  const u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true);
  const ifd=u32(4),count=u16(ifd),tags=new Map();
  require(count>=13&&ifd+2+count*12+4<=bytes.length,'IFD bounds');
  for(let i=0;i<count;i++){
    const at=ifd+2+i*12,tag=u16(at),type=u16(at+2),n=u32(at+4);
    require(!tags.has(tag),'no duplicate tag');
    const length=n*(type===3?2:type===5?8:4);
    const valueAt=length>4?u32(at+8):at+8;
    require(valueAt+Math.min(length,4)<=bytes.length,'tag value bounds');
    tags.set(tag,{type,n,valueAt,value:type===3?u16(valueAt):u32(valueAt)});
  }
  const stripOffset=tags.get(273)?.value,stripBytes=tags.get(279)?.value;
  require(Number.isSafeInteger(stripOffset)&&Number.isSafeInteger(stripBytes)&&stripOffset+stripBytes<=bytes.length,'pixel strip bounds');
  const density=tag=>{const at=tags.get(tag)?.valueAt;require(at+8<=bytes.length,'density bounds');
    return {numerator:u32(at),denominator:u32(at+4)};};
  return {bytes,tags,pixels:bytes.slice(stripOffset,stripOffset+stripBytes),density};
}

async function run(){
  const processing=createProcessing({workerURL:'/processing-worker.js'}),results=[];
  try{
    for(const [unit,value,alpha] of [['ppi',300,true],['ppc',118,false]]){
      const frame=source(),original=frame.data.slice();
      const blob=await processing.encode(frame,{format:'tiff',settings:settings({preserve_alpha:alpha}),
        resolution:{unit,value}});
      require(blob instanceof Blob&&blob.type==='image/tiff'&&blob.size>0,`${unit} real Worker Blob MIME and size`);
      const parsed=inspectTIFF(await blob.arrayBuffer()),tag=id=>parsed.tags.get(id)?.value;
      require(tag(256)===2&&tag(257)===1&&tag(259)===1&&tag(262)===2&&tag(284)===1,
        `${unit} dimensions, uncompressed RGB photometric and chunky planar layout`);
      require(tag(277)===(alpha?4:3)&&tag(258)===8&&tag(296)===(unit==='ppi'?2:3),
        `${unit} sample count, 8-bit depth and density unit`);
      require(parsed.tags.has(338)===alpha,`${unit} alpha ExtraSamples only on RGBA`);
      same([...parsed.pixels],alpha?[...original]:[255,255,255,20,40,60],`${unit} exact encoded samples`);
      for(const id of [282,283]){
        const density=parsed.density(id);
        require(density.numerator===value&&density.denominator===1,`${unit} exact X/Y density`);
      }
      same([...frame.data],[...original],`${unit} source pixel buffer unchanged and not detached`);
      results.push({unit,value,channels:tag(277),width:tag(256),height:tag(257),
        bytes:blob.size,mime:blob.type,pixelSamples:[...parsed.pixels]});
    }
    const cancelled=source(),original=cancelled.data.slice(),controller=new AbortController();
    const pending=processing.encode(cancelled,{format:'tiff',signal:controller.signal});
    controller.abort();
    let aborted=false;
    try{await pending;}catch(error){aborted=error?.name==='AbortError';}
    require(aborted,'in-flight browser Worker cancellation rejects without a Blob');
    same([...cancelled.data],[...original],'abort keeps original pixels unchanged');
    const already=new AbortController();already.abort();
    try{await processing.encode(cancelled,{format:'tiff',signal:already.signal});throw Error('PREABORT_ACCEPTED');}
    catch(error){require(error.name==='AbortError','pre-aborted Worker request rejects');}
    verdict.textContent=JSON.stringify({status:'PASS',boundary:'real Chrome Worker -> image/tiff Blob',
      userAgent:navigator.userAgent,results,abort:'in-flight and pre-aborted rejected',source:'unchanged'});
  }finally{processing.dispose();}
}

document.querySelector('#run').addEventListener('click',()=>{
  verdict.textContent='RUNNING';
  void run().catch(error=>{verdict.textContent=JSON.stringify({status:'FAIL',error:String(error?.stack??error)});});
});
