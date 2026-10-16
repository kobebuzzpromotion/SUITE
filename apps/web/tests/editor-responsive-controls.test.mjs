import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pointCurveGraphCoordinate,pointCurveGraphPlotRect} from '../src/editor-ui.mjs';

test('Curve plot mapping keeps endpoint targets inside 280px mobile and 768px tablet panels',()=>{
  for(const size of [233,218]){
    const svg={left:16,top:24,width:size,height:size};
    const plot=pointCurveGraphPlotRect(svg);
    const targetDiameter=68*(size-2)/323;
    assert.ok(targetDiameter>=44,`Curve point target ${targetDiameter}px is too small at ${size}px`);
    assert.ok(plot.left-targetDiameter/2>=svg.left);
    assert.ok(plot.left+plot.width+targetDiameter/2<=svg.left+svg.width);
    assert.deepEqual(pointCurveGraphCoordinate({rect:plot,clientX:plot.left,clientY:plot.top+plot.height}),{x:0,y:0});
    assert.deepEqual(pointCurveGraphCoordinate({rect:plot,clientX:plot.left+plot.width,clientY:plot.top}),{x:255,y:255});
    const middle=pointCurveGraphCoordinate({rect:plot,clientX:plot.left+plot.width/2,clientY:plot.top+plot.height/2});
    assert.ok(Math.abs(middle.x-127.5)<=0.5&&Math.abs(middle.y-127.5)<=0.5);
    assert.equal(pointCurveGraphCoordinate({rect:plot,clientX:svg.left+2,clientY:plot.top+plot.height/2}),null);
  }
  assert.throws(()=>pointCurveGraphPlotRect({left:0,top:0,width:2,height:100}),/POINT_CURVE_GRAPH_RECT_INVALID/);
});

test('responsive control CSS retains 44px targets and narrow-grid shrinkability',()=>{
  const css=readFileSync(new URL('../src/editorial-editor.css',import.meta.url),'utf8');
  assert.match(css,/\.levels-sampling button\.button\.compact\s*\{[^}]*min-height:\s*44px/);
  assert.match(css,/\.point-curve-editor input\s*\{[^}]*min-width:\s*0;[^}]*min-height:\s*44px/);
  assert.match(css,/\.point-curve-row label\s*\{[^}]*min-width:\s*0/);
  assert.match(css,/\.point-curve-actions button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css,/\.point-curve-preset-buttons button\s*\{[^}]*min-height:\s*44px/);
});
