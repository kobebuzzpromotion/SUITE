import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {clippingOverlayURLForSides,nextClippingSides,shouldToggleClippingWithJ} from '../src/editor-ui.mjs';

const source=async name=>readFile(new URL(`../src/${name}`,import.meta.url),'utf8');

test('HIST-VIS-01: Show Histogram control remains outside hidden figure and supports focus, narrow layouts and reduced motion',async()=>{
  const [ui,css]=await Promise.all([source('editor-ui.mjs'),source('editorial-editor.css')]);
  assert.match(ui,/histogramVisibility=element\('button','quiet-button clipping-toggle','ヒストグラムを隠す'\)/);
  assert.match(ui,/histogramVisibility\.type='button';histogramVisibility\.setAttribute\('aria-controls','suite-histogram'\)/);
  assert.match(ui,/histogramFigure=element\('figure','suite-histogram'\);histogramFigure\.id='suite-histogram'/);
  assert.match(ui,/byID\('global-controls'\)\.prepend\(histogramVisibility,histogramFigure\)/);
  assert.match(ui,/histogramFigure\.hidden=!showHistogram;histogramFigure\.style\.display=showHistogram\?'':'none'/);
  assert.match(ui,/histogramVisibility\.setAttribute\('aria-expanded',String\(showHistogram\)\)/);
  assert.match(css,/\.editorial-editor \.quiet-button,[\s\S]*?min-height: 44px/);
  assert.match(css,/\.editorial-editor \.clipping-toggle \{[^}]*white-space: normal/);
  assert.match(css,/\.editorial-editor \.clipping-toggle:focus-visible \{[^}]*outline:/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\) \{[^}]*\.editorial-editor \.clipping-toggle/);
});

test('HIST-VIS-02: hiding the graph does not switch photo overlay sides or mutate adjustments',async()=>{
  const ui=await source('editor-ui.mjs');
  const toggle=ui.match(/histogramVisibility\.addEventListener\('click',\(\)=>\{([\s\S]*?)\},\{signal:lifetime\.signal\}\);/);
  assert.ok(toggle);
  assert.match(toggle[1],/showHistogram=!showHistogram/);
  assert.match(toggle[1],/indicatorContext\.hidden=true;tonePointer=null/);
  assert.match(toggle[1],/render\(state\);histogramVisibility\.focus/);
  assert.doesNotMatch(toggle[1],/showShadowClipping|showHighlightClipping|setAdjustment|commitRecipe|exportFinal/);
  const urls={clippingOverlayURL:'both',shadowClippingOverlayURL:'black',
    highlightClippingOverlayURL:'white'};
  let sides=nextClippingSides({shadow:false,highlight:false},'shadow');
  assert.equal(clippingOverlayURLForSides(urls,sides),'black');
  sides=nextClippingSides(sides,'both');
  assert.equal(clippingOverlayURLForSides(urls,sides),'both');
  assert.equal(shouldToggleClippingWithJ({key:'j',target:{closest:()=>null}}),true);
  assert.match(ui,/toneRegions\.addEventListener\('pointercancel'/);
  assert.match(ui,/run\('setAdjustment',next\.key,next\.value\)/);
});
