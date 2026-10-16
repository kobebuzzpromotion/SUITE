import {checkAbort} from './pure.mjs';
import {astraFrame,resizeAstraFrame} from './astra-image-model.mjs';
import {requireGenerationModel,generationBinding,generationSeeds,generationCandidate} from './astra-generation-core.mjs';

export function planGenerativeExpansion(pixels,{margins,ratio='free',linked=false}={}){
  const source=astraFrame(pixels);
  if(!margins||Object.keys(margins).length!==4||['left','right','top','bottom'].some(k=>
    !Number.isSafeInteger(margins[k])||margins[k]<0)||typeof linked!=='boolean')throw Error('OUTPAINT_MARGINS_INVALID');
  if(linked&&(margins.left!==margins.right||margins.top!==margins.bottom))throw Error('OUTPAINT_LINKED_MARGINS_MISMATCH');
  const width=source.width+margins.left+margins.right,height=source.height+margins.top+margins.bottom;
  if(width*height>8_000_000||width>13000||height>13000||(width===source.width&&height===source.height))
    throw Error('OUTPAINT_DIMENSIONS_INVALID');
  const ratios={'original':source.width/source.height,'1:1':1,'4:5':4/5,'5:7':5/7,'2:3':2/3,'16:9':16/9};
  if(ratio!=='free'&&(!Object.hasOwn(ratios,ratio)||Math.abs(width/height-ratios[ratio])>1/height))
    throw Error('OUTPAINT_RATIO_MISMATCH');
  return {width,height,margins:{...margins},ratio,linked};
}
/** Three noise-conditioned generations; original rectangle is restored exactly. */
export async function generateExpansion(pixels,{model,binding,settings,seeds=[1,2,3],signal}={}){
  requireGenerationModel(model,'outpaint',{masked:true,stochastic:true});
  const source=astraFrame(pixels),sourceBinding=generationBinding(binding),plan=planGenerativeExpansion(source,settings);
  const seedList=generationSeeds(seeds,3),data=new Uint8ClampedArray(plan.width*plan.height*4),mask=new Uint8Array(plan.width*plan.height);
  // Border-extension is inference conditioning only; generated exterior replaces it.
  for(let y=0;y<plan.height;y++){checkAbort(signal);for(let x=0;x<plan.width;x++){
    const sx=Math.max(0,Math.min(source.width-1,x-plan.margins.left)),sy=Math.max(0,Math.min(source.height-1,y-plan.margins.top));
    const i=y*plan.width+x,o=(sy*source.width+sx)*4;
    data.set(source.data.subarray(o,o+4),i*4);
    const outside=x<plan.margins.left||x>=plan.margins.left+source.width||y<plan.margins.top||y>=plan.margins.top+source.height;
    if(outside){mask[i]=255;data[i*4+3]=255;}
  }}
  const frame={width:plan.width,height:plan.height,data},results=[];
  for(const seed of seedList){
    const inferred=await model.run(frame,{mask,seed,signal});checkAbort(signal);
    const result=resizeAstraFrame(inferred,plan.width,plan.height,{signal});
    for(let y=0;y<source.height;y++){checkAbort(signal);const start=((y+plan.margins.top)*plan.width+plan.margins.left)*4;
      result.data.set(source.data.subarray(y*source.width*4,(y+1)*source.width*4),start);}
    results.push(await generationCandidate(result,{task:'outpaint',seed,modelSHA256:model.modelSHA256,
      binding:sourceBinding,parameters:plan},{signal}));
  }
  return results;
}
