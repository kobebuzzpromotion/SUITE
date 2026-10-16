import {assertPixels,sourceDimensions} from './processing/pure.mjs';
import {PERSON_PRIVACY_APPROVED} from './person-privacy.mjs';

/** Existing Session.proxy is upright, unedited, unmirrored sRGB8 RGBA.
 * Do not pass After pixels or apply EXIF again. No original hydration occurs.
 * Host canUse must enforce current workspace/photo authorization. */
export function createLocalFaceAnalysisInputProvider({session,canUse}={}){
  if(typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('LOCAL_FACE_INPUT_HOST');
  let latest=null,epoch=0,closed=false;
  const unsubscribe=session.subscribe(state=>{latest=state;epoch++;});
  const allowed=state=>state?.personProcessingStatus===PERSON_PRIVACY_APPROVED&&!state.busy&&!state.exporting&&!state.blocked&&canUse(state)===true;
  const provider=async({signal}={})=>{
    const state=latest,frame=session.proxy,generation=epoch;
    if(closed||!allowed(state))throw Error('LOCAL_FACE_INPUT_PERMISSION');
    const check=()=>{if(closed||signal?.aborted||generation!==epoch||session.proxy!==frame||!allowed(latest))throw new DOMException('Stale or cancelled','AbortError');};
    check();assertPixels(frame);const source=sourceDimensions(frame);
    const inputWidth=frame.width,inputHeight=frame.height,revision=state.revision;
    if(inputWidth>32768||inputHeight>32768||inputWidth*inputHeight>8_000_000)throw Error('LOCAL_FACE_INPUT_CAPACITY');
    const assetID=state.asset?.id,originalSHA256=state.asset?.sha256;
    if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(assetID??'')||!/^[0-9a-f]{64}$/i.test(originalSHA256??'')||!Number.isSafeInteger(state.revision)||state.revision<0)throw Error('LOCAL_FACE_INPUT_BINDING');
    const scale=Math.min(1,1600/Math.max(inputWidth,inputHeight));
    const width=Math.max(1,Math.round(inputWidth*scale)),height=Math.max(1,Math.round(inputHeight*scale));
    const rgba=frame.data.slice(),bgr=new Uint8Array(width*height*3);
    try{
      for(let y=0;y<height;y++){
        check();
        const sy=Math.max(0,Math.min(inputHeight-1,(y+.5)*inputHeight/height-.5)),ay=Math.floor(sy),by=Math.min(inputHeight-1,ay+1),v=sy-ay;
        for(let x=0;x<width;x++){
          const sx=Math.max(0,Math.min(inputWidth-1,(x+.5)*inputWidth/width-.5)),ax=Math.floor(sx),bx=Math.min(inputWidth-1,ax+1),u=sx-ax;
          const indices=[ay*inputWidth+ax,ay*inputWidth+bx,by*inputWidth+ax,by*inputWidth+bx],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
          for(let channel=0;channel<3;channel++){
            let value=0;
            for(let k=0;k<4;k++){const at=indices[k]*4,a=rgba[at+3]/255;value+=(rgba[at+2-channel]*a+255*(1-a))*weights[k];}
            bgr[(y*width+x)*3+channel]=Math.round(value);
          }
        }
        // Let cancellation/photo changes arrive without doing inference on UI.
        if(y%32===31){await new Promise(resolve=>setTimeout(resolve,0));check();}
      }
      const hash=await crypto.subtle.digest('SHA-256',bgr);check();
      const analysisSHA256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      return {input:{bgr,width,height,stride:width*3},binding:{assetID,originalSHA256:originalSHA256.toLowerCase(),analysisSHA256,
        revision,preprocessingVersion:'suite-web-bgr8-srgb-white-bilinear-v1',
        inputWidth,inputHeight,sourceWidth:source.width,sourceHeight:source.height,
        scaleToInputX:inputWidth/width,scaleToInputY:inputHeight/height,
        scaleToSourceX:source.width/width,scaleToSourceY:source.height/height}};
    }catch(error){bgr.fill(0);throw error;}finally{rgba.fill(0);}
  };
  provider.dispose=()=>{closed=true;epoch++;unsubscribe();};
  return provider;
}
