// Display-only conversion. Not a Final/export renderer and not HDR tone mapping.
// Values above SDR white are explicitly clipped for this non-saved preview.
export async function localBackdropDisplayPixels(result,{signal}={}){
  const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  check();
  if(!result||!['localBackdrop','localWarp','native-global-tail'].includes(result.stage)||result.colorSpace!=='linear-srgb'||
    result.alpha!=='premultiplied'||result.rows!=='top-left'||
    !Number.isInteger(result.width)||!Number.isInteger(result.height)||
    result.width<1||result.height<1||result.width>32768||result.height>32768||
    result.width*result.height>8_000_000||!(result.data instanceof Float32Array)||
    result.data.length!==result.width*result.height*4)throw Error('LOCAL_BACKDROP_DISPLAY_INPUT');
  const width=result.width,height=result.height;
  const source=new Float32Array(result.data),output=new Uint8ClampedArray(source.length);
  let succeeded=false,clippedPixels=0;
  const encode=v=>255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055);
  try{
    for(let start=0;start<source.length;start+=65536){
      check();
      for(let i=start,end=Math.min(source.length,start+65536);i<end;i+=4){
        const alpha=source[i+3];
        if(!Number.isFinite(alpha)||alpha<0||alpha>1)throw Error('LOCAL_BACKDROP_DISPLAY_ALPHA');
        let clipped=false;
        for(let c=0;c<3;c++){
          const value=source[i+c];
          if(!Number.isFinite(value))throw Error('LOCAL_BACKDROP_DISPLAY_COLOR');
          if(alpha===0){
            if(value!==0)throw Error('LOCAL_BACKDROP_DISPLAY_PREMULTIPLICATION');
            output[i+c]=0;
          }else{
            const straight=value/alpha;
            if(straight>1||straight<0)clipped=true;
            output[i+c]=encode(Math.max(0,Math.min(1,straight)));
          }
        }
        output[i+3]=alpha*255;
        if(clipped)clippedPixels++;
      }
      await new Promise(resolve=>setTimeout(resolve,0));check();
    }
    succeeded=true;
    return {width,height,data:output,colorSpace:'srgb',alpha:'straight',rows:'top-left',
      previewOnly:true,saved:false,clippedPixels,toneMapped:false};
  }finally{source.fill(0);if(!succeeded)output.fill(0);}
}
