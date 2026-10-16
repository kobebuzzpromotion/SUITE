import test from 'node:test';
import assert from 'node:assert/strict';
import {planCanvasDimensionReadout,canvasDimensionReadoutText} from '../src/editor-ui.mjs';
import {rotateCropPixels} from '../src/processing/pure.mjs';
import {projectCanvasExpansion} from '../src/processing/canvas-expand-projection.mjs';
import {expandCanvasPixels} from '../src/processing/canvas-expand.mjs';

const frame=(width,height,fullWidth,fullHeight)=>({width,height,
  data:new Uint8ClampedArray(width*height*4),
  ...(fullWidth?{sourceWidth:fullWidth,sourceHeight:fullHeight}:{})});
const margins={left:.25,right:.1,top:.2,bottom:.15};
const expansion={schemaVersion:1,margins,background:[255,255,255,255]};
const parameters=(rotationDegrees=0,crop)=>({rotationDegrees,
  extendedParameters:{...(crop?{crop}:{}),canvasExpand:expansion}});
const rendered=(pixels,params)=>{
  const composed=rotateCropPixels(pixels,params.rotationDegrees,params.extendedParameters.crop,
    {resolutionAssessment:()=>{}});
  return expandCanvasPixels(composed,projectCanvasExpansion(composed,params.extendedParameters.canvasExpand));
};

test('CANVAS-DIMENSION-01: displayed Preview and planned Final equal actual pixel pipeline',()=>{
  const proxy=frame(120,80,240,160),params=parameters();
  const before=proxy.data.slice(),projected=planCanvasDimensionReadout(proxy,params);
  const preview=rendered(proxy,params),final=rendered(frame(240,160),params);
  assert.deepEqual([projected.preview.width,projected.preview.height],[preview.width,preview.height]);
  assert.deepEqual([projected.final.width,projected.final.height],[final.width,final.height]);
  assert.deepEqual(projected.preview.postCrop,{width:120,height:80});
  assert.deepEqual(projected.final.postCrop,{width:240,height:160});
  assert.deepEqual([projected.preview.ratio,projected.final.ratio],['3:2','3:2']);
  assert.deepEqual(proxy.data,before);
  assert.deepEqual(params,parameters());
  const text=canvasDimensionReadoutText({asset:{id:'asset'},proxy,parameters:params,
    afterURL:'blob:current',imageSrc:'blob:current',imageComplete:true,
    naturalWidth:preview.width,naturalHeight:preview.height});
  assert.match(text,/Crop後 120×80px/);
  assert.match(text,/四辺余白合計 70%/);
  assert.match(text,/Preview実測 162×108px · 比率 3:2/);
  assert.match(text,/Final元サイズ予定.*324×216px · 比率 3:2/);
});

test('CANVAS-DIMENSION-02: rotation and normalized Crop precede four integer-rounded edges',()=>{
  const crop={crop_rect:{x:.1,y:.2,width:.75,height:.5}},params=parameters(90,crop);
  const proxy=frame(120,80,240,160),projected=planCanvasDimensionReadout(proxy,params);
  const preview=rendered(proxy,params),final=rendered(frame(240,160),params);
  assert.deepEqual(projected.preview.postCrop,{width:60,height:60});
  assert.deepEqual(projected.final.postCrop,{width:120,height:120});
  assert.deepEqual([preview.width,preview.height,final.width,final.height],[81,81,162,162]);
  assert.deepEqual([projected.preview.width,projected.preview.height,
    projected.final.width,projected.final.height],[81,81,162,162]);
  assert.deepEqual([projected.preview.ratio,projected.final.ratio],['1:1','1:1']);
});

test('CANVAS-DIMENSION-03: Before/Split name the After output; Undo/Reset and reload read only current Recipe',()=>{
  const proxy=frame(120,80,240,160),base={asset:{id:'asset'},proxy,
    afterURL:'blob:current',imageSrc:'blob:current',imageComplete:true};
  const expanded=canvasDimensionReadoutText({...base,parameters:parameters(),
    naturalWidth:162,naturalHeight:108,view:'before'});
  assert.match(expanded,/^Before表示中 · 以下はAfter Recipeの寸法/);
  assert.match(expanded,/Preview実測 162×108px/);
  assert.match(canvasDimensionReadoutText({...base,parameters:parameters(),
    naturalWidth:162,naturalHeight:108,view:'split'}),/^比較表示中/);
  const neutral={rotationDegrees:0,extendedParameters:{}};
  const reset=canvasDimensionReadoutText({...base,parameters:neutral,
    naturalWidth:120,naturalHeight:80});
  assert.match(reset,/四辺余白合計 0%/);
  assert.match(reset,/Preview実測 120×80px · 比率 3:2/);
  assert.match(reset,/Final元サイズ予定.*240×160px/);
  assert.equal(canvasDimensionReadoutText({...base,parameters:neutral,
    naturalWidth:162,naturalHeight:108}),
  'After画像の実寸と計算結果が一致しません。出力寸法を表示しません。');
});

test('CANVAS-DIMENSION-04: stale Asset image, in-flight render, expired access and bad dimensions reveal no numbers',()=>{
  const base={asset:{id:'asset'},proxy:frame(120,80,240,160),parameters:parameters(),
    afterURL:'blob:new',imageSrc:'blob:new',imageComplete:true,naturalWidth:162,naturalHeight:108};
  for(const change of [{imageSrc:'blob:old'},{busy:true},{asset:null},{imageComplete:false},
    {naturalWidth:0},{naturalWidth:163},{naturalHeight:NaN}]){
    assert.doesNotMatch(canvasDimensionReadoutText({...base,...change}),/\d+×\d+px/);
  }
  const revoked=canvasDimensionReadoutText({...base,blocked:true});
  assert.match(revoked,/利用権限がない/);
  assert.doesNotMatch(revoked,/\d+×\d+px/);
  const unknownFinal=canvasDimensionReadoutText({...base,proxy:frame(120,80)});
  assert.match(unknownFinal,/Final元サイズは未確認/);
  assert.doesNotMatch(unknownFinal,/Final元サイズ予定/);
});

test('CANVAS-DIMENSION-05: malformed Crop and over-limit Final projection never produce a guessed size',()=>{
  const source=frame(1,1,16000,1),badMargins={rotationDegrees:0,
    extendedParameters:{canvasExpand:{schemaVersion:1,
      margins:{left:0,right:.1,top:0,bottom:0},background:[0,0,0,0]}}};
  assert.throws(()=>planCanvasDimensionReadout(source,badMargins),/CANVAS_SIZE_LIMIT/);
  assert.equal(canvasDimensionReadoutText({asset:{id:'asset'},proxy:source,parameters:badMargins,
    afterURL:'blob:current',imageSrc:'blob:current',imageComplete:true,
    naturalWidth:1,naturalHeight:1}),'出力寸法を確認できません。');
  const badCrop=parameters(90,{crop_rect:{x:.9,y:.9,width:.5,height:.5}});
  assert.throws(()=>planCanvasDimensionReadout(frame(120,80,240,160),badCrop),/CANVAS_READOUT_CROP_INVALID/);
});
