import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {clippingOverlayURLForSides,nextClippingSides,clippingSidesForAsset,
  clippingControlsDisabled} from '../src/editor-ui.mjs';

test('HIST-INDICATOR-01: photo warning selection, J and Asset reset keep their established contracts',()=>{
  const urls={clippingOverlayURL:'combined',shadowClippingOverlayURL:'shadow',
    highlightClippingOverlayURL:'highlight'};
  let sides=nextClippingSides(undefined,'shadow');
  assert.equal(clippingOverlayURLForSides(urls,sides),'shadow');
  assert.equal(clippingOverlayURLForSides(urls,sides),'shadow');
  sides=nextClippingSides(sides,'both');
  assert.deepEqual(sides,{shadow:true,highlight:true});
  assert.equal(clippingOverlayURLForSides(urls,sides),'combined');
  assert.deepEqual(clippingSidesForAsset('one','two',sides),{shadow:false,highlight:false});
  assert.equal(clippingControlsDisabled({overlayReady:true,view:'before'}),true);
});

test('HIST-INDICATOR-02: product UI offers context-menu and keyboard-focusable setting without changing overlay/Recipe actions',async()=>{
  const ui=await readFile(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
  assert.match(ui,/indicatorSetting=element\('button','quiet-button'/);
  assert.match(ui,/indicatorSetting\.setAttribute\('aria-pressed'/);
  assert.match(ui,/indicatorContextButton=element\('button','quiet-button','Show Clipping in Histogram'\)/);
  assert.match(ui,/histogramFigure\.addEventListener\('contextmenu'/);
  assert.match(ui,/indicatorContext\.addEventListener\('keydown',event=>\{if\(event\.key==='Escape'/);
  assert.match(ui,/clippingIndicators\.style\.display=showHistogramClippingIndicators\?'':'none'/);
  assert.match(ui,/const toggleHistogramIndicators=\(\)=>\{showHistogramClippingIndicators=!showHistogramClippingIndicators;indicatorContext\.hidden=true;render\(state\);\}/);
  assert.match(ui,/const toggleClipping=\(side='both'\)/);
  assert.match(ui,/shouldToggleClippingWithJ\(event/);
  assert.match(ui,/toneRegions\.addEventListener\('pointercancel'/);
  assert.match(ui,/run\('setAdjustment',next\.key,next\.value\)/);
});
