import {projectCanvasExpansion,projectCanvasExpansionGeometry} from './processing/canvas-expand-projection.mjs';
import {checkAbort,MAX_PIXELS,MAX_SOURCE_PIXELS} from './processing/pure.mjs';

const EDGES=Object.freeze(['left','right','top','bottom']);
const KEY_BY_EDGE=Object.freeze({left:{ArrowLeft:1,ArrowRight:-1},right:{ArrowRight:1,ArrowLeft:-1},
  top:{ArrowUp:1,ArrowDown:-1},bottom:{ArrowDown:1,ArrowUp:-1}});
const MAX_UI_MARGIN=2; // Current Editor numeric control: 0..200%, in 1% steps.
const HANDLE_TOLERANCE_CSS=16;
const DRAG_THRESHOLD_CSS=4;
const gestures=new WeakMap();
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const dimension=value=>Number.isSafeInteger(value)&&value>0;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

function frameSize(upright,rotationDegrees,crop,maxPixels=MAX_PIXELS){
  if(!upright||!dimension(upright.width)||!dimension(upright.height)||
      !Number.isSafeInteger(upright.width*upright.height)||
      upright.width*upright.height>maxPixels)throw Error('CANVAS_EDGE_FRAME_INVALID');
  if(!Number.isSafeInteger(rotationDegrees)||rotationDegrees%90!==0)
    throw Error('CANVAS_EDGE_ROTATION_INVALID');
  const turns=((rotationDegrees/90)%4+4)%4;
  const width=turns%2?upright.height:upright.width;
  const height=turns%2?upright.width:upright.height;
  if(crop===undefined||crop===null)return Object.freeze({width,height});
  const rect=crop.crop_rect;
  if(crop.rotation!==rotationDegrees||!rect||
      ![rect.x,rect.y,rect.width,rect.height].every(finite)||
      rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||
      rect.x+rect.width>1+1e-12||rect.y+rect.height>1+1e-12)
    throw Error('CANVAS_EDGE_CROP_INVALID');
  const left=Math.floor(rect.x*width+1e-9),top=Math.floor(rect.y*height+1e-9);
  const croppedWidth=Math.floor(rect.width*width+1e-9);
  const croppedHeight=Math.floor(rect.height*height+1e-9);
  if(croppedWidth<1||croppedHeight<1||left<0||top<0||
      left+croppedWidth>width||top+croppedHeight>height)
    throw Error('CANVAS_EDGE_CROP_PROJECTION_INVALID');
  return Object.freeze({width:croppedWidth,height:croppedHeight});
}

function copyMargins(margins){
  if(!margins||typeof margins!=='object'||Array.isArray(margins)||
      Reflect.ownKeys(margins).length!==4||
      EDGES.some(edge=>!Object.hasOwn(margins,edge)||!finite(margins[edge])||
        margins[edge]<0||margins[edge]>MAX_UI_MARGIN))
    throw Error('CANVAS_EDGE_MARGINS_INVALID');
  return Object.freeze(Object.fromEntries(EDGES.map(edge=>[edge,margins[edge]])));
}

function rectSnapshot(rect){
  if(!rect||![rect.left,rect.top,rect.width,rect.height].every(finite)||
      rect.width<=0||rect.height<=0)throw Error('CANVAS_EDGE_RECT_INVALID');
  return Object.freeze({left:rect.left,top:rect.top,width:rect.width,height:rect.height});
}

function inputPoint(event){
  if(event&&Number.isSafeInteger(event.pointerId)&&
      ['mouse','pen','touch'].includes(event.pointerType)&&
      finite(event.clientX)&&finite(event.clientY))
    return Object.freeze({kind:'pointer',id:event.pointerId,x:event.clientX,y:event.clientY});
  const touches=event?.touches,changed=event?.changedTouches;
  if(!touches||!changed||touches.length>1||changed.length>1)
    throw Error('CANVAS_EDGE_INPUT_INVALID');
  const current=touches.length===1?touches[0]:changed.length===1?changed[0]:null;
  if(!current||!Number.isSafeInteger(current.identifier)||
      !finite(current.clientX)||!finite(current.clientY)||
      (touches.length&&changed.length&&touches[0].identifier!==changed[0].identifier))
    throw Error('CANVAS_EDGE_INPUT_INVALID');
  return Object.freeze({kind:'touch',id:current.identifier,x:current.clientX,y:current.clientY});
}

function geometry(config,signal){
  checkAbort(signal);
  const {edge,preview,full,rotationDegrees=0,crop,view='after',selectionKey}=config??{};
  if(!EDGES.includes(edge))throw Error('CANVAS_EDGE_INVALID');
  if(view!=='after')throw Error('CANVAS_EDGE_AFTER_REQUIRED');
  // This key only catches a changed selection during a gesture. It is not an
  // authentication, permission or saved-Recipe assertion.
  if(typeof selectionKey!=='string'||!selectionKey||selectionKey.length>256)
    throw Error('CANVAS_EDGE_SELECTION_INVALID');
  const margins=copyMargins(config.margins);
  const previewFrame=frameSize(preview?.upright,rotationDegrees,crop);
  const fullFrame=frameSize(full?.upright,rotationDegrees,crop,MAX_SOURCE_PIXELS);
  const projected=projectCanvasExpansion(previewFrame,{schemaVersion:1,margins},{signal});
  projectCanvasExpansionGeometry(fullFrame,{schemaVersion:1,margins},{signal});
  if(!dimension(preview?.naturalWidth)||!dimension(preview?.naturalHeight)||
      preview.naturalWidth!==previewFrame.width+projected.margins.left+projected.margins.right||
      preview.naturalHeight!==previewFrame.height+projected.margins.top+projected.margins.bottom)
    throw Error('CANVAS_EDGE_PREVIEW_STALE');
  const rect=rectSnapshot(preview.afterRect);
  const scale=Math.min(rect.width/preview.naturalWidth,rect.height/preview.naturalHeight);
  if(!finite(scale)||scale<=0)throw Error('CANVAS_EDGE_SCALE_INVALID');
  const imageLeft=rect.left+(rect.width-preview.naturalWidth*scale)/2;
  const imageTop=rect.top+(rect.height-preview.naturalHeight*scale)/2;
  const contentLeft=imageLeft+projected.margins.left*scale;
  const contentTop=imageTop+projected.margins.top*scale;
  const contentRight=contentLeft+previewFrame.width*scale;
  const contentBottom=contentTop+previewFrame.height*scale;
  const handle=edge==='left'?{x1:contentLeft,y1:contentTop,x2:contentLeft,y2:contentBottom}:
    edge==='right'?{x1:contentRight,y1:contentTop,x2:contentRight,y2:contentBottom}:
      edge==='top'?{x1:contentLeft,y1:contentTop,x2:contentRight,y2:contentTop}:
        {x1:contentLeft,y1:contentBottom,x2:contentRight,y2:contentBottom};
  checkAbort(signal);
  return Object.freeze({edge,selectionKey,margins,previewFrame,fullFrame,rect,
    scale,handle:Object.freeze(handle)});
}

function result(geo,nextMargin,signal){
  checkAbort(signal);
  const margins=Object.freeze({...geo.margins,[geo.edge]:nextMargin});
  // Actual pixel/memory limits apply to the visible Proxy. Canonical full
  // dimensions use integer geometry only, never a Final capability check.
  const preview=projectCanvasExpansion(geo.previewFrame,{schemaVersion:1,margins},{signal});
  const full=projectCanvasExpansionGeometry(geo.fullFrame,{schemaVersion:1,margins},{signal});
  checkAbort(signal);
  return Object.freeze({edge:geo.edge,changed:nextMargin!==geo.margins[geo.edge],
    marginPercent:nextMargin*100,margins,
    projected:Object.freeze({preview:Object.freeze({...preview.margins}),
      full:Object.freeze({...full.margins})})});
}

/**
 * Begin on the explicitly selected physical edge of the After content. Use
 * getBoundingClientRect() and client coordinates: CSS RTL and page scroll do
 * not reverse left/right or alter the conversion. The full frame is required
 * for geometry planning only. Actual Final limits remain separately enforced.
 */
export function beginCanvasExpansionEdgeDrag(config,startEvent,{signal}={}){
  const geo=geometry(config,signal),start=inputPoint(startEvent);
  const horizontal=geo.edge==='left'||geo.edge==='right';
  const handleAxis=horizontal?geo.handle.x1:geo.handle.y1;
  const axis=horizontal?start.x:start.y;
  const cross=horizontal?start.y:start.x;
  const low=horizontal?geo.handle.y1:geo.handle.x1;
  const high=horizontal?geo.handle.y2:geo.handle.x2;
  if(Math.abs(axis-handleAxis)>HANDLE_TOLERANCE_CSS||
      cross<low-HANDLE_TOLERANCE_CSS||cross>high+HANDLE_TOLERANCE_CSS)
    throw Error('CANVAS_EDGE_HANDLE_MISS');
  const gesture=Object.freeze({edge:geo.edge,handle:geo.handle,
    initialPercent:geo.margins[geo.edge]*100});
  gestures.set(gesture,Object.freeze({geo,start}));
  checkAbort(signal);
  return gesture;
}

/** End/cancel below four CSS pixels is a click, never an edit. */
export function updateCanvasExpansionEdgeDrag(gesture,currentEvent,
  {afterRect,selectionKey,signal}={}){
  checkAbort(signal);
  const state=gestures.get(gesture);
  if(!state)throw Error('CANVAS_EDGE_GESTURE_INVALID');
  const {geo,start}=state,current=inputPoint(currentEvent);
  if(current.kind!==start.kind||current.id!==start.id)
    throw Error('CANVAS_EDGE_POINTER_CHANGED');
  if(selectionKey!==geo.selectionKey)throw Error('CANVAS_EDGE_SELECTION_CHANGED');
  const rect=rectSnapshot(afterRect);
  if(['left','top','width','height'].some(key=>Math.abs(rect[key]-geo.rect[key])>1e-3))
    throw Error('CANVAS_EDGE_LAYOUT_CHANGED');
  const horizontal=geo.edge==='left'||geo.edge==='right';
  const deltaCss=(horizontal?current.x-start.x:current.y-start.y);
  if(Math.abs(deltaCss)<DRAG_THRESHOLD_CSS)return result(geo,geo.margins[geo.edge],signal);
  const outward=geo.edge==='left'||geo.edge==='top'?-deltaCss:deltaCss;
  const base=horizontal?geo.previewFrame.width:geo.previewFrame.height;
  const fraction=geo.margins[geo.edge]+outward/(base*geo.scale);
  const next=Math.round(clamp(fraction,0,MAX_UI_MARGIN)*100)/100;
  return result(geo,next,signal);
}

/** Accessible, discrete equivalent of dragging the named physical edge. */
export function nudgeCanvasExpansionEdge(config,{key,shiftKey=false,signal}={}){
  const geo=geometry(config,signal);
  if(typeof key!=='string'||typeof shiftKey!=='boolean')
    throw Error('CANVAS_EDGE_KEY_INVALID');
  const direction=KEY_BY_EDGE[geo.edge][key];
  if(direction===undefined&&key!=='Home'&&key!=='End')
    return result(geo,geo.margins[geo.edge],signal);
  const next=key==='Home'?0:key==='End'?MAX_UI_MARGIN:
    Math.round(clamp(geo.margins[geo.edge]+direction*(shiftKey?0.1:0.01),
      0,MAX_UI_MARGIN)*100)/100;
  return result(geo,next,signal);
}
