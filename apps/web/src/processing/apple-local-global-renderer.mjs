import {validateCropSettings} from '../../../../dist/apps/backend/src/crop-export.js';
// Narrow native global tail. CIColorControls and CropSettings are not aliased
// to Web controls: unsupported non-neutral stages reject the entire preview.
export async function renderAppleGlobalTail(frame,parameters,{signal}={}){
  const fail=()=>{throw Error('APPLE_GLOBAL_STAGE_UNSUPPORTED');};
  const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  const p=structuredClone(parameters);
  if(!p||Object.keys(p).some(k=>!['exposure','contrast','saturation','rotationDegrees','extendedParameters','processingOrder'].includes(k))||
    !Number.isFinite(p.exposure)||Math.abs(p.exposure)>20||!Number.isFinite(p.contrast)||p.contrast<0||p.saturation!==1||
    !Number.isSafeInteger(p.rotationDegrees)||p.rotationDegrees%90!==0||!Array.isArray(p.processingOrder)||
    new Set(p.processingOrder).size!==p.processingOrder.length||
    p.processingOrder.some(s=>!['exposure','contrast','saturation','rotation','crop'].includes(s))||
    p.exposure!==0&&!p.processingOrder.includes('exposure')||p.contrast!==1&&!p.processingOrder.includes('contrast')||p.rotationDegrees%360!==0&&!p.processingOrder.includes('rotation')||
    !p.extendedParameters||Object.keys(p.extendedParameters).some(k=>!['localRetouch','localBackdrop','localWarp','export','crop'].includes(k)))fail();
  const crop=p.extendedParameters.crop;
  if(crop){validateCropSettings(crop);if(crop.rotation!==p.rotationDegrees||p.processingOrder.at(-1)!=='crop')fail();}
  else if(p.processingOrder.includes('crop'))fail();
  if(!(frame.data instanceof Float32Array)||!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||
    frame.width<1||frame.height<1||frame.width*frame.height>8_000_000||frame.data.length!==frame.width*frame.height*4||
    frame.colorSpace!=='linear-srgb'||frame.alpha!=='premultiplied'||frame.rows!=='top-left')fail();
  let pixels=frame.data.slice(),width=frame.width,height=frame.height,success=false;
  try{
    for(const stage of p.processingOrder){
      check();
      if(stage==='exposure'){
        const multiplier=2**p.exposure;
        for(let y=0;y<height;y++){
          for(let x=0;x<width;x++)for(let c=0;c<3;c++){const i=(y*width+x)*4+c;pixels[i]*=multiplier;if(!Number.isFinite(pixels[i]))fail();}
          if(y%32===0){await new Promise(resolve=>setTimeout(resolve,0));check();}
        }
      }else if(stage==='contrast'){
        // Apple Core Image Filter Reference: (straight.rgb - 0.5)*contrast+0.5.
        // Color filters use unpremultiplied components; CIContext default is
        // extended linear sRGB (workingColorSpace docs). Preserve signed/overwhite
        // values until explicit SDR display; do not insert an intermediate clamp.
        // https://developer.apple.com/library/archive/documentation/GraphicsImaging/Reference/CoreImageFilterReference/index.html
        // https://developer.apple.com/documentation/coreimage/cicontextoption/workingcolorspace
        for(let y=0;y<height;y++){
          for(let x=0;x<width;x++){
            const i=(y*width+x)*4,a=pixels[i+3];if(!Number.isFinite(a)||a<0||a>1)fail();
            for(let c=0;c<3;c++){pixels[i+c]=a===0?0:(pixels[i+c]/a-.5)*p.contrast*a+.5*a;if(!Number.isFinite(pixels[i+c]))fail();}
          }
          if(y%32===0){await new Promise(resolve=>setTimeout(resolve,0));check();}
        }
      }else if(stage==='crop'){
        // PhotoPipeline crops the rotated extent using top-left normalized
        // coordinates, then moves its origin to zero. Integer boundaries need
        // no assumption about CoreImage subpixel sampling or extent rounding.
        const r=crop.crop_rect,values=[r.x*width,r.y*height,r.width*width,r.height*height];
        if(values.some(v=>Math.abs(v-Math.round(v))>1e-7))throw Error('APPLE_CROP_SUBPIXEL_UNSUPPORTED');
        const [left,top,cw,ch]=values.map(Math.round);
        if(cw<1||ch<1||left<0||top<0||left+cw>width||top+ch>height)fail();
        if(crop.crop_ratio&&Math.abs(cw/ch-crop.crop_ratio.width/crop.crop_ratio.height)>.003)fail();
        const next=new Float32Array(cw*ch*4);let accepted=false;
        try{
          for(let y=0;y<ch;y++){
            next.set(pixels.subarray(((top+y)*width+left)*4,((top+y)*width+left+cw)*4),y*cw*4);
            if(y%32===0){await new Promise(resolve=>setTimeout(resolve,0));check();}
          }
          pixels.fill(0);pixels=next;width=cw;height=ch;accepted=true;
        }finally{if(!accepted)next.fill(0);}
      }else if(stage==='rotation'){
        const turns=((p.rotationDegrees/90)%4+4)%4;
        for(let turn=0;turn<turns;turn++){
          const next=new Float32Array(pixels.length);let accepted=false;
          try{
            for(let y=0;y<height;y++){
              for(let x=0;x<width;x++){
                // Positive CoreImage rotation is CCW in bottom-left space.
                const target=((width-1-x)*height+y)*4,source=(y*width+x)*4;
                for(let c=0;c<4;c++)next[target+c]=pixels[source+c];
              }
              if(y%32===0){await new Promise(resolve=>setTimeout(resolve,0));check();}
            }
            pixels.fill(0);pixels=next;[width,height]=[height,width];accepted=true;
          }finally{if(!accepted)next.fill(0);}
        }
      }
    }
    check();success=true;return {...frame,width,height,data:pixels,stage:'native-global-tail',saved:false};
  }finally{if(!success)pixels.fill(0);}
}
