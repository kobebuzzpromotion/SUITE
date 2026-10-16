import {createAfterToLocalBrushMapper} from './local-levels-brush-coordinate.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';

const cache=new WeakMap();
/** Coverage, not a straight SVG centreline: radius, hardness, erase and curved
 * paths travel through the actual rendered field and all downstream geometry.
 * This is a visual authoring overlay, not semantic/alpha mask evidence. */
export function appendProjectedBrushOverlay(svg,geometry,strokes,{color=[32,130,210],opacity=.55,region,vectors}={}){
  if(!strokes?.length&&!vectors?.length)return;
  const g=geometry,width=g.uprightWidth,height=g.uprightHeight;
  const normalized=strokes.map(s=>s.points?{points:s.points,radius:s.radius,hardness:s.hardness,mode:s.mode}:
    {points:s.path.map(p=>({x:p.u,y:p.v})),radius:s.radiusFraction,hardness:s.hardness,mode:s.operation==='ERASE'?'erase':'add'});
  const key=JSON.stringify([width,height,g.sourceWidth,g.sourceHeight,g.naturalWidth,g.naturalHeight,g.rotationDegrees,g.crop,g.canvasExpand,g.sceneGeometry,g.lensGeometry,normalized,color,opacity,region,vectors]);
  let record=cache.get(svg);
  if(!record||record.field!==g.liquifyField){record={field:g.liquifyField,entries:new Map()};cache.set(svg,record);}
  let href=record.entries.get(key);
  if(!href){
    const rw=region?Math.max(1,Math.round(region.width*width)):width,rh=region?Math.max(1,Math.round(region.height*height)):height;
    let mask;
    if(vectors){
      // Rasterize source-space guides before projection: curves/rectangles must
      // bend as shapes, not have only their sparse control points transformed.
      if(!Number.isSafeInteger(rw*rh)||rw*rh>24_000_000)throw Error('BRUSH_OVERLAY_CAPACITY');
      const source=svg.ownerDocument.createElement('canvas');source.width=rw;source.height=rh;
      const ctx=source.getContext('2d');if(!ctx)throw Error('BRUSH_OVERLAY_CANVAS');ctx.strokeStyle='#fff';ctx.lineCap='round';ctx.lineJoin='round';
      for(const vector of vectors){
        ctx.lineWidth=Math.max(1,2*(vector.radius??0)*Math.min(rw,rh));ctx.beginPath();
        if(vector.rect){const r=vector.rect;ctx.rect(r.x*rw,r.y*rh,r.width*rw,r.height*rh);}
        else if(vector.quadratic){const q=vector.quadratic;ctx.moveTo(q.root.u*rw,q.root.v*rh);ctx.quadraticCurveTo(q.control.u*rw,q.control.v*rh,q.tip.u*rw,q.tip.v*rh);}
        else for(let i=0;i<vector.points.length;i++){const p=vector.points[i];ctx[i?'lineTo':'moveTo'](p.u*rw,p.v*rh);}
        ctx.stroke();
      }
      const rgba=ctx.getImageData(0,0,rw,rh).data,data=new Uint8Array(rw*rh);for(let i=0;i<data.length;i++)data[i]=rgba[i*4+3];mask={width:rw,height:rh,data};
    }else mask=rasterizeLocalBrushMask({width:rw,height:rh,strokes:normalized,workBudget:{remaining:96_000_000}});
    if(!Number.isSafeInteger(g.naturalWidth*g.naturalHeight)||g.naturalWidth*g.naturalHeight>24_000_000)throw Error('BRUSH_OVERLAY_CAPACITY');
    const canvas=svg.ownerDocument.createElement('canvas');canvas.width=g.naturalWidth;canvas.height=g.naturalHeight;
    const context=canvas.getContext('2d');if(!context)throw Error('BRUSH_OVERLAY_CANVAS');
    const output=context.createImageData(canvas.width,canvas.height),map=createAfterToLocalBrushMapper(g);
    const sample=(x,y)=>{
      x=Math.max(0,Math.min(rw-1,x));y=Math.max(0,Math.min(rh-1,y));
      const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(rw-1,ix+1),jy=Math.min(rh-1,iy+1),fx=x-ix,fy=y-iy;
      return (mask.data[iy*rw+ix]*(1-fx)+mask.data[iy*rw+jx]*fx)*(1-fy)+(mask.data[jy*rw+ix]*(1-fx)+mask.data[jy*rw+jx]*fx)*fy;
    };
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      let p;try{p=map((x+.5)/canvas.width,(y+.5)/canvas.height);}catch{continue;}
      if(region){p={x:(p.x-region.x)/region.width,y:(p.y-region.y)/region.height};if(p.x<0||p.y<0||p.x>1||p.y>1)continue;}
      const alpha=sample(p.x*rw-.5,p.y*rh-.5)*opacity;if(alpha<=0)continue;
      const at=(y*canvas.width+x)*4;output.data[at]=color[0];output.data[at+1]=color[1];output.data[at+2]=color[2];output.data[at+3]=alpha;
    }
    context.putImageData(output,0,0);href=canvas.toDataURL('image/png');
    if(record.entries.size>=4)record.entries.clear();record.entries.set(key,href);
  }
  const box=g.afterRect,scale=Math.min(box.width/g.naturalWidth,box.height/g.naturalHeight);
  const image=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','image');
  image.setAttribute('x',String((box.width-g.naturalWidth*scale)/2));image.setAttribute('y',String((box.height-g.naturalHeight*scale)/2));
  image.setAttribute('width',String(g.naturalWidth*scale));image.setAttribute('height',String(g.naturalHeight*scale));image.setAttribute('href',href);svg.append(image);
}

/** Snapshot only the actual current Preview field; never derive requested warps. */
export function currentBrushDisplayGeometry(session){
  const state=session.state,p=state?.recipe?.parameters,preview=session.previewPixels;
  if(!state?.afterURL||!preview||state.busy||state.exporting)throw Error('BRUSH_PREVIEW_NOT_READY');
  if(p?.extendedParameters?.webManualLiquify&&!preview.liquifyField)throw Error('BRUSH_LIQUIFY_FIELD_REQUIRED');
  return {liquifyField:preview.liquifyField,uprightWidth:session.proxy?.width,uprightHeight:session.proxy?.height,
    rotationDegrees:p?.rotationDegrees??0,crop:p?.extendedParameters?.crop,canvasExpand:p?.extendedParameters?.canvasExpand,
    sceneGeometry:p?.extendedParameters?.sceneGeometry,lensGeometry:p?.extendedParameters?.webLensShading,
    expectedAfterURL:state.afterURL};
}
