import {validateAppleLocalEdit} from '../apple-local-edit-import.mjs';
// Port of SuiteCore LocalWarpFieldBuilder and LocalWarpCoordinateMap, not the
// persisted Web liquify engine. Float32 field rounding and certification match.
export async function renderAppleLocalWarp(frame,recipe,{signal,mask=null,bodyMask=null,workingByteLimit=256*1024*1024}={}){
  const fail=()=>{throw Error('APPLE_LOCAL_WARP_INVALID_OR_CAPACITY');};
  const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  check();validateAppleLocalEdit('localWarp',recipe,{id:frame.assetID,sha256:frame.originalSHA256});
  const r=structuredClone(recipe),w=frame.width,h=frame.height,n=w*h;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>32768||h>32768||n>8_000_000||
    !(frame.data instanceof Float32Array)||frame.data.length!==n*4||frame.colorSpace!=='linear-srgb'||
    frame.alpha!=='premultiplied'||frame.rows!=='top-left'||frame.space==='warped'||
    !Number.isSafeInteger(workingByteLimit)||workingByteLimit<1||workingByteLimit>512*1024*1024||n*80>workingByteLimit||
    Math.abs(w/h-r.referenceWidth/r.referenceHeight)>1/r.referenceHeight+1/h||
    mask!==null&&(!(mask instanceof Uint8Array)||mask.length!==n))fail();
  if(r.bodyMask&&(r.bodyMask.width!==w||r.bodyMask.height!==h||!(bodyMask instanceof Uint8Array)||bodyMask.length!==n)||!r.bodyMask&&bodyMask!==null)fail();
  const body=bodyMask?.slice();
  if(body){
    try{
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body)),b=>b.toString(16).padStart(2,'0')).join('');
      check();if(digest!==r.bodyMask.sha256.toLowerCase())fail();
    }catch(error){body.fill(0);throw error;}
  }
  const input=frame.data.slice(),l8=mask?.slice(),fx=new Float32Array(n),fy=new Float32Array(n),protection=new Uint8Array(n);
  let output,warpedMask,success=false;
  const pause=async y=>{if(y%32===0){await new Promise(resolve=>setTimeout(resolve,0));check();}};
  try{
    for(let i=0;i<n;i++){fx[i]=i%w;fy[i]=Math.floor(i/w);}
    const p=r.protectionRectangle;
    if(p)for(let y=0;y<h;y++){
      for(let x=0;x<w;x++)if(Math.min(y+1,(p.y+p.height)*h)>Math.max(y,p.y*h)&&Math.min(x+1,(p.x+p.width)*w)>Math.max(x,p.x*w))protection[y*w+x]=255;
      await pause(y);
    }
    let work=0;
    for(const op of r.operations){
      check();const rx=op.rx*w,ry=op.ry*h,cx=op.center.x*w,cy=op.center.y*h;if(rx<1||ry<1)fail();
      const x0=Math.max(0,Math.floor(cx-rx)),x1=Math.min(w-1,Math.ceil(cx+rx)),y0=Math.max(0,Math.floor(cy-ry)),y1=Math.min(h-1,Math.ceil(cy+ry));
      work+=(x1-x0+1)*(y1-y0+1);if(work>128_000_000)fail();
      const px=op.kind==='smooth'?fx.slice():null,py=op.kind==='smooth'?fy.slice():null;
      for(let y=y0;y<=y1;y++){
        for(let x=x0;x<=x1;x++){
          const i=y*w+x;if(protection[i])continue;
          const u=(x-cx)/rx,v=(y-cy)/ry,r2=u*u+v*v;if(r2>=1)continue;
          const weight=(1-r2)**2*Math.max(0,Math.min(1,Math.min(x,y,w-1-x,h-1-y)/Math.max(1,Math.min(rx,ry)*.2)));
          let nx=fx[i],ny=fy[i],sx=x,sy=y;
          if(op.kind==='restore'){nx+=(x-nx)*Math.abs(op.amount)*weight;ny+=(y-ny)*Math.abs(op.amount)*weight;}
          else if(op.kind==='smooth'){
            const near=[x>0?i-1:i,x<w-1?i+1:i,y>0?i-w:i,y<h-1?i+w:i];
            nx+=(x+near.reduce((a,j)=>a+px[j]-j%w,0)/4-nx)*Math.abs(op.amount)*weight;
            ny+=(y+near.reduce((a,j)=>a+py[j]-Math.floor(j/w),0)/4-ny)*Math.abs(op.amount)*weight;
          }else{
            switch(op.kind){
              case 'translate':sx-=op.dx*rx*.18*weight;sy-=op.dy*ry*.18*weight;break;
              case 'scaleX':sx=cx+(x-cx)/(1+op.amount*.18*weight);break;
              case 'scaleY':sy=cy+(y-cy)/(1+op.amount*.18*weight);break;
              case 'scale':sx=cx+(x-cx)/(1+op.amount*.18*weight);sy=cy+(y-cy)/(1+op.amount*.18*weight);break;
              case 'rotate':{const a=op.angle*Math.PI/6*weight,c=Math.cos(a),s=Math.sin(a);sx=cx+(x-cx)*c+(y-cy)*s;sy=cy-(x-cx)*s+(y-cy)*c;break;}
              case 'mShape':sy-=op.amount*ry*.12*weight*Math.cos(u*Math.PI*2);break;
              case 'pushLeft':sx-=op.amount*rx*.15*weight*(v<0?-1:1);break;
              default:fail();
            }nx+=sx-x;ny+=sy-y;
          }
          fx[i]=nx;fy[i]=ny;if(!Number.isFinite(fx[i])||!Number.isFinite(fy[i]))fail();
        }await pause(y);
      }
    }
    const taps=(x,y)=>{const ax=Math.floor(x),ay=Math.floor(y),bx=Math.min(w-1,ax+1),by=Math.min(h-1,ay+1),u=x-ax,v=y-ay;return [[ay*w+ax,ay*w+bx,by*w+ax,by*w+bx],[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v]];};
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i=y*w+x;let freeze=x===0||y===0||x===w-1||y===h-1||protection[i]||fx[i]<0||fy[i]<0||fx[i]>w-1||fy[i]>h-1;
        if(!freeze){const [ids,weights]=taps(fx[i],fy[i]);freeze=ids.some((j,k)=>weights[k]>0&&protection[j]);}
        if(freeze){fx[i]=x;fy[i]=y;}
      }await pause(y);
    }
    for(let y=0;y<h-1;y++){
      for(let x=0;x<w-1;x++)for(const f of [fx,fy]){
        const i=y*w+x,coordinate=j=>f[j]-(f===fx?j%w:Math.floor(j/w));
        const a=coordinate(i),b=coordinate(i+1),c=coordinate(i+w),d=coordinate(i+w+1);
        if(Math.max(Math.abs(b-a),Math.abs(d-c))+Math.max(Math.abs(c-a),Math.abs(d-b))>.65)fail();
      }await pause(y);
    }
    output=new Float32Array(n*4);if(l8)warpedMask=new Uint8Array(n);
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i=y*w+x,[ids,weights]=taps(fx[i],fy[i]);
        // Match LocalWarpBodyMaskGuard: reject the requested certified map,
        // never silently freeze out-of-person pixels and alter the edit.
        if(body&&(fx[i]!==x||fy[i]!==y)&&(body[i]!==255||ids.some((j,k)=>weights[k]>0&&body[j]!==255)))
          throw Error('APPLE_LOCAL_WARP_OUTSIDE_PERSON');
        for(let c=0;c<4;c++){let v=0;for(let k=0;k<4;k++)v+=input[ids[k]*4+c]*weights[k];if(!Number.isFinite(v))fail();output[i*4+c]=v;}
        if(l8)warpedMask[i]=Math.round(ids.reduce((v,j,k)=>v+l8[j]*weights[k],0));
      }await pause(y);
    }
    check();success=true;return {...frame,data:output,mask:warpedMask??null,space:'warped',stage:'localWarp',saved:false};
  }finally{input.fill(0);l8?.fill(0);body?.fill(0);fx.fill(0);fy.fill(0);protection.fill(0);if(!success){output?.fill(0);warpedMask?.fill(0);}}
}
