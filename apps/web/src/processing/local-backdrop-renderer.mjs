import {validateAppleLocalEdit} from '../apple-local-edit-import.mjs';
import {renderAppleLocalRetouch} from './apple-local-retouch-renderer.mjs';

const fail=code=>{throw Error(`LOCAL_BACKDROP_${code}`);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
function pixels(p){
  if(!p||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||
    p.width>32768||p.height>32768||p.width*p.height>8_000_000||
    !(p.data instanceof Uint8ClampedArray)||p.data.length!==p.width*p.height*4||
    p.colorSpace!=='srgb'||p.alpha!=='straight'||p.rows!=='top-left'||p.orientation!==1)fail('PIXELS');
  return {width:p.width,height:p.height,data:p.data.slice()};
}
/** Dedicated native-backdrop stage, not a Web manual-background alias.
 * Input RGBA is upright/unmirrored, uncropped, straight sRGB8. Host authorize
 * attests that source pixels belong to the original asset and background pixels
 * were decoded from the supplied encoded bytes (never trust a selected filename).
 * Pixel SHA snapshots prevent mutation; they are NOT original-file SHA hashes.
 * Returns top-left linear premultiplied Float32 RGBA, retaining EV values > 1.
 * Placement uses pixel-centre bilinear sampling of premultiplied linear colors;
 * CoreImage's platform interpolation is not claimed bit-for-bit identical.
 * Optional localRetouch runs through its dedicated Float renderer before this
 * stage. Warp/global adjustments and Recipe persistence are separate stages.
 */
export async function renderLocalBackdrop({source,background,maskBytes,recipe,binding,
  sourcePixelSHA256,backgroundPixelSHA256,localWarp=null,localRetouch=null,maskKind='preview',
  authorize,workingByteLimit=256*1024*1024},{signal}={}){
  const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  check();
  if(localWarp!=null)fail('WARP_UNSUPPORTED');
  if(!binding||typeof binding.id!=='string'||typeof binding.sha256!=='string'||
    typeof authorize!=='function')fail('PERMISSION');
  validateAppleLocalEdit('localBackdrop',recipe,binding);
  const r=structuredClone(recipe),b=structuredClone(binding),manifest=structuredClone(background?.manifest);
  const retouch=localRetouch==null?null:structuredClone(localRetouch);
  if(retouch)validateAppleLocalEdit('localRetouch',retouch,b);
  if(!['preview','final'].includes(maskKind))fail('MASK_KIND');
  const mask=maskKind==='final'&&r.finalMask?r.finalMask:{sha256:r.maskSHA256,width:r.maskWidth,height:r.maskHeight,byteCount:r.maskByteCount};
  if(!(maskBytes instanceof Uint8Array)||maskBytes.length!==mask.byteCount||
    !(background?.bytes instanceof Uint8Array)||background.bytes.length!==r.background.byteCount)fail('BYTES');
  if(!manifest||manifest.permission!=='callerConfirmed'||
    ['assetID','version','sha256','byteCount','width','height'].some(k=>manifest[k]!==r.background[k]))fail('BACKGROUND_BINDING');
  if(!/^[a-f0-9]{64}$/i.test(sourcePixelSHA256??'')||!/^[a-f0-9]{64}$/i.test(backgroundPixelSHA256??''))fail('PIXEL_BINDING');
  const sourceHash=sourcePixelSHA256.toLowerCase(),backgroundHash=backgroundPixelSHA256.toLowerCase();
  const sx=mask.width/r.maskWidth,sy=mask.height/r.maskHeight,drop=r.shadow.kind==='addDrop';
  const sigma=drop?r.shadow.blurRadius*sx:0,radius=Math.ceil(3*sigma);
  const dx=drop?r.shadow.offsetX*sx:0,dy=drop?-r.shadow.offsetY*sy:0;
  if(drop&&(sigma>128||r.shadow.blurRadius>0&&Math.abs(sx-sy)>0.000001||Math.abs(dx)>mask.width||Math.abs(dy)>mask.height))fail('SHADOW_SCALE');
  const pw=mask.width+2*radius,ph=mask.height+2*radius;
  if(drop&&pw*ph*(2*radius+1)*2>200_000_000)fail('SHADOW_WORK_BUDGET');
  const required=source?.data?.byteLength*2+background?.pixels?.data?.byteLength*2+
    (drop?pw*ph*8:0)+
    (retouch?mask.width*mask.height*96:0)+
    maskBytes.byteLength+background.bytes.byteLength+mask.width*mask.height*16;
  if(!Number.isSafeInteger(workingByteLimit)||workingByteLimit<1||workingByteLimit>512*1024*1024||
    !Number.isSafeInteger(required)||required>workingByteLimit)fail('BUDGET');
  let foreground,backdrop,encoded,matte,output,horizontal,shadow,retouched,linearInput,success=false;
  try{
    foreground=pixels(source);backdrop=pixels(background.pixels);
    if(foreground.width!==mask.width||foreground.height!==mask.height||
      backdrop.width!==r.background.width||backdrop.height!==r.background.height)fail('DIMENSIONS');
    encoded=background.bytes.slice();matte=maskBytes.slice();
    const permission=async()=>{
      check();if(await authorize({binding:structuredClone(b),recipe:structuredClone(r),
        sourcePixelSHA256:sourceHash,backgroundPixelSHA256:backgroundHash},{signal})!==true)fail('PERMISSION');check();
    };
    await permission();
    const hashes=await Promise.all([sha(encoded),sha(matte),sha(foreground.data),sha(backdrop.data)]);check();
    if(hashes[0]!==r.background.sha256.toLowerCase()||hashes[1]!==mask.sha256.toLowerCase()||
      hashes[2]!==sourceHash||hashes[3]!==backgroundHash)fail('INTEGRITY');
    const {width:w,height:h}=foreground,p=r.placement,bw=backdrop.width,bh=backdrop.height,ev=2**r.backgroundEV;
    if(retouch){
      linearInput=new Float32Array(w*h*4);
      for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
          const i=(y*w+x)*4,a=foreground.data[i+3]/255;
          for(let c=0;c<3;c++)linearInput[i+c]=linear(foreground.data[i+c])*a;
          linearInput[i+3]=a;
        }
        if(y%32===0){await new Promise(resolve=>setTimeout(resolve,0));check();}
      }
      retouched=await renderAppleLocalRetouch({width:w,height:h,data:linearInput,
        assetID:r.assetID,originalSHA256:r.originalSHA256,colorSpace:'linear-srgb',
        alpha:'premultiplied',rows:'top-left'},retouch,{signal,workingByteLimit});check();
    }
    if(drop){
      // Web Gaussian: sigma=radius parameter, normalized 3-sigma support.
      // CoreImage may use a different internal approximation. Never box-blur alias.
      const kernel=new Float64Array(2*radius+1);let sum=0;
      for(let i=-radius;i<=radius;i++){const v=sigma===0?1:Math.exp(-i*i/(2*sigma*sigma));kernel[i+radius]=v;sum+=v;}
      for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
      horizontal=new Float32Array(pw*ph);shadow=new Float32Array(pw*ph);
      for(let y=0;y<h;y++){
        for(let x=-radius;x<w+radius;x++){
          let value=0;for(let k=-radius;k<=radius;k++){const xx=x-k;if(xx>=0&&xx<w)value+=matte[y*w+xx]/255*kernel[k+radius];}
          horizontal[(y+radius)*pw+x+radius]=value;
        }
        if(y%16===0){await new Promise(resolve=>setTimeout(resolve,0));check();}
      }
      for(let y=0;y<ph;y++){
        for(let x=0;x<pw;x++){
          let value=0;for(let k=-radius;k<=radius;k++){const yy=y-k;if(yy>=0&&yy<ph)value+=horizontal[yy*pw+x]*kernel[k+radius];}
          shadow[y*pw+x]=value;
        }
        if(y%16===0){await new Promise(resolve=>setTimeout(resolve,0));check();}
      }
    }
    output=new Float32Array(w*h*4);
    for(let y=0;y<h;y++){
      check();
      for(let x=0;x<w;x++){
        const at=(y*w+x)*4,coverage=matte[y*w+x]/255,fa=foreground.data[at+3]/255*coverage;
        const tx=((x+.5)/w-p.x)/p.width,ty=((y+.5)/h-p.y)/p.height;
        const bg=[0,0,0,0];
        if(tx>=0&&tx<1&&ty>=0&&ty<1){
          const sx=Math.max(0,Math.min(bw-1,tx*bw-.5)),sy=Math.max(0,Math.min(bh-1,ty*bh-.5));
          const ax=Math.floor(sx),ay=Math.floor(sy),bx=Math.min(bw-1,ax+1),by=Math.min(bh-1,ay+1),u=sx-ax,v=sy-ay;
          const offsets=[ay*bw+ax,ay*bw+bx,by*bw+ax,by*bw+bx],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
          for(let k=0;k<4;k++){
            const j=offsets[k]*4,a=backdrop.data[j+3]/255,weight=weights[k];bg[3]+=a*weight;
            for(let c=0;c<3;c++)bg[c]+=linear(backdrop.data[j+c])*a*weight*ev;
          }
        }
        let attenuation=1;
        if(drop){
          const xx=x-dx+radius,yy=y-dy+radius,ax=Math.floor(xx),ay=Math.floor(yy),u=xx-ax,v=yy-ay;
          const sample=(px,py)=>px>=0&&py>=0&&px<pw&&py<ph?shadow[py*pw+px]:0;
          const coverage=sample(ax,ay)*(1-u)*(1-v)+sample(ax+1,ay)*u*(1-v)+sample(ax,ay+1)*(1-u)*v+sample(ax+1,ay+1)*u*v;
          attenuation=1-r.shadow.opacity*coverage;
        }
        for(let c=0;c<3;c++)output[at+c]=(retouched?retouched.data[at+c]*coverage:linear(foreground.data[at+c])*fa)+bg[c]*attenuation*(1-fa);
        output[at+3]=fa+bg[3]*(1-fa);
      }
      if(y%32===31){await new Promise(resolve=>setTimeout(resolve,0));check();}
    }
    await permission();success=true;
    return {width:w,height:h,data:output,colorSpace:'linear-srgb',alpha:'premultiplied',rows:'top-left',
      assetID:r.assetID,originalSHA256:r.originalSHA256,stage:'localBackdrop',saved:false};
  }finally{
    foreground?.data.fill(0);backdrop?.data.fill(0);encoded?.fill(0);matte?.fill(0);
    horizontal?.fill(0);shadow?.fill(0);
    linearInput?.fill(0);retouched?.data?.fill(0);
    if(!success)output?.fill(0);
  }
}
