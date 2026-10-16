import {validateAppleLocalEdit} from '../apple-local-edit-import.mjs';
// Native LocalRetouchRecipeRenderer Float kernel. Top-left rows throughout;
// localRepair sourceOffsetY is native y-up, so its row offset is NEGATED.
export async function renderAppleLocalRetouch(frame,recipe,{signal,workingByteLimit=256*1024*1024}={}){
  const fail=()=>{throw Error('APPLE_LOCAL_RETOUCH_INVALID_OR_CAPACITY');};
  const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  check();validateAppleLocalEdit('localRetouch',recipe,{id:frame.assetID,sha256:frame.originalSHA256});
  const r=structuredClone(recipe),w=frame.width,h=frame.height,n=w*h;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>32768||h>32768||n>8_000_000||
    !(frame.data instanceof Float32Array)||frame.data.length!==n*4||frame.colorSpace!=='linear-srgb'||
    frame.alpha!=='premultiplied'||frame.rows!=='top-left'||
    !Number.isSafeInteger(workingByteLimit)||workingByteLimit<1||workingByteLimit>512*1024*1024||n*80>workingByteLimit||
    Math.abs(w/h-r.referenceWidth/r.referenceHeight)>1/r.referenceHeight+1/h)fail();
  let output=frame.data.slice(),success=false;
  const pause=async y=>{if(y%32===0){await new Promise(resolve=>setTimeout(resolve,0));check();}};
  const coverage=async rect=>{
    const mask=new Uint8Array(n);if(!rect)return mask;
    for(let y=0;y<h;y++){
      const cy=Math.max(0,Math.min(y+1,(rect.y+rect.height)*h)-Math.max(y,rect.y*h));
      for(let x=0;x<w;x++)mask[y*w+x]=Math.round(Math.max(0,Math.min(x+1,(rect.x+rect.width)*w)-Math.max(x,rect.x*w))*cy*255);
      await pause(y);
    }return mask;
  };
  // Swift .rounded() defaults to nearest, ties away from zero.
  const round=v=>Math.sign(v)*Math.floor(Math.abs(v)+.5);
  try{
    if(!output.every(Number.isFinite))fail();
    for(const layer of r.layers){
      check();const source=output.slice();
      let selection,protection,horizontal,candidate;
      try{
        selection=await coverage(layer.selection);protection=await coverage(layer.protection);
        const e=layer.effect;
        if(e.kind==='skinSmoothing'){
          const scaled=e.radiusReferencePixels*Math.min(w/r.referenceWidth,h/r.referenceHeight);
          if(!Number.isFinite(scaled)||scaled<=0||scaled>256)fail();const radius=Math.max(1,Math.ceil(scaled));
          horizontal=new Float32Array(n*4);candidate=source.slice();
          for(let y=0;y<h;y++){
            const sum=[0,0,0,0],add=(x,sign)=>{
              if(x<0||x>=w)return;const i=y*w+x;if(source[i*4+3]!==1)return;
              const weight=selection[i]/255*(1-protection[i]/255)*sign;
              for(let c=0;c<3;c++)sum[c]+=source[i*4+c]*weight;sum[3]+=weight;
            };
            for(let x=0;x<=Math.min(radius,w-1);x++)add(x,1);
            for(let x=0;x<w;x++){for(let c=0;c<4;c++)horizontal[(y*w+x)*4+c]=sum[c];add(x-radius,-1);add(x+radius+1,1);}
            await pause(y);
          }
          for(let x=0;x<w;x++){
            const sum=[0,0,0,0],add=(y,sign)=>{if(y<0||y>=h)return;for(let c=0;c<4;c++)sum[c]+=horizontal[(y*w+x)*4+c]*sign;};
            for(let y=0;y<=Math.min(radius,h-1);y++)add(y,1);
            for(let y=0;y<h;y++){if(sum[3]>1e-8)for(let c=0;c<3;c++)candidate[(y*w+x)*4+c]=sum[c]/sum[3];add(y-radius,-1);add(y+radius+1,1);}
            await pause(x);
          }
        }
        const dx=e.kind==='localRepair'?round(e.sourceOffsetX*w):0,dy=e.kind==='localRepair'?-round(e.sourceOffsetY*h):0;
        for(let y=0;y<h;y++){
          for(let x=0;x<w;x++){
            const i=y*w+x;if(selection[i]===0)continue;const xx=x+dx,yy=y+dy;
            if(xx<0||yy<0||xx>=w||yy>=h)fail();const j=yy*w+xx;
            if(source[i*4+3]!==1||e.kind==='localRepair'&&(source[j*4+3]!==1||protection[j]>0))continue;
            const amount=selection[i]/255*e.strength*(1-protection[i]/255),donor=candidate??source;
            for(let c=0;c<3;c++){const value=source[i*4+c]*(1-amount)+donor[j*4+c]*amount;if(!Number.isFinite(value))fail();output[i*4+c]=value;}
          }await pause(y);
        }
      }finally{source.fill(0);selection?.fill(0);protection?.fill(0);horizontal?.fill(0);candidate?.fill(0);}
    }
    check();success=true;return {...frame,data:output,stage:'localRetouch',saved:false};
  }finally{if(!success)output.fill(0);}
}
