import {mountBWEdgeManualUI} from '../../src/bw-edge-manual-ui.mjs';

const before = document.querySelector('#before'), after = document.querySelector('#after');
const root = document.querySelector('#brush-root'), verdict = document.querySelector('#probe-verdict');
const live = document.querySelector('#live-strokes');
const sourceWidth = 120, sourceHeight = 80, rotationDegrees = 90;
const crop = {rotation: 90, crop_rect: {x: .25, y: .25, width: .5, height: .5}};
const canvasExpand = {schemaVersion: 1, margins: {left: .25, right: .5, top: .5, bottom: .25},
  background: [255, 255, 255, 255]};
let view = 'split', changes = [], component, rejectChange = false;
const expect = (truth, label) => {if (!truth) throw Error(`BW_EDGE_MANUAL_BROWSER_ASSERTION: ${label}`);};
function pixelImage(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); context.fillStyle = '#a3a9a9';
  context.fillRect(0, 0, width, height); return canvas.toDataURL('image/png');
}
before.src = pixelImage(sourceWidth, sourceHeight);
// Rotation(90) -> 80x120; center Crop -> 40x60; margins -> 70x105.
after.src = pixelImage(70, 105);
await Promise.all([before.decode(), after.decode()]);
function mount() {
  component = mountBWEdgeManualUI({root, afterImage: after, enabled: true,
    getGeometry: () => ({view, beforeRect: before.getBoundingClientRect(),
      uprightWidth: sourceWidth, uprightHeight: sourceHeight, rotationDegrees, crop, canvasExpand}),
    onChange: value => {if (rejectChange) throw Error('FIXTURE_ON_CHANGE_REJECTED');
      changes.push(structuredClone(value)); live.textContent = JSON.stringify(value);}});
}
mount();
function coordinate(afterX, afterY) {
  const box = after.getBoundingClientRect(), scale = Math.min(box.width / 70, box.height / 105);
  return {clientX: box.left + (box.width - 70 * scale) / 2 + afterX * scale,
    clientY: box.top + (box.height - 105 * scale) / 2 + afterY * scale};
}
function syntheticStroke(afterX, afterY, pointerType = 'mouse') {
  const p = coordinate(afterX, afterY), id = 11 + changes.length;
  after.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerId: id,
    pointerType, button: 0, isPrimary: true, ...p}));
  after.dispatchEvent(new PointerEvent('pointermove', {bubbles: true, pointerId: id,
    pointerType, button: 0, isPrimary: true, clientX: p.clientX + 4, clientY: p.clientY + 4}));
  after.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerId: id,
    pointerType, button: 0, isPrimary: true, clientX: p.clientX + 4, clientY: p.clientY + 4}));
}
function changeSelect(selector, value) {
  const input = root.querySelector(selector); input.value = value;
  input.dispatchEvent(new Event('change', {bubbles: true}));
}
document.querySelector('#probe-run').addEventListener('click', () => {
  try {
    component.dispose(); root.replaceChildren(); changes = []; rejectChange = false;
    view = 'split'; mount();
    const midpoint = coordinate(30, 60);
    syntheticStroke(30, 60);
    let state = component.getStrokes();
    expect(state.subjectStrokes.length === 1 && state.correctionStrokes.length === 0,
      'subject ADD pointer stroke');
    expect(Math.abs(state.subjectStrokes[0].path[0].u - .5) < .01 &&
      Math.abs(state.subjectStrokes[0].path[0].v - .5) < .01,
    'rotation/Crop/Expand inverse source-normalized coordinates');
    expect(Object.keys(state.subjectStrokes[0]).sort().join(',') ===
      'hardness,operation,path,radiusFraction', 'typed schema exact stroke keys');
    expect(state.subjectStrokes[0].path[0].u >= 0 && midpoint.clientX > 0,
      'valid source point');
    const count = changes.length;
    syntheticStroke(2, 60); // Canvas Expand padding, inside contain.
    syntheticStroke(-8, 60); // contain letterbox.
    expect(changes.length === count, 'padding and contain letterbox reject without mutation');
    const cancelPoint = coordinate(30, 60);
    after.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerId: 78,
      pointerType: 'touch', button: 0, isPrimary: true, ...cancelPoint}));
    after.dispatchEvent(new PointerEvent('pointercancel', {bubbles: true, pointerId: 78,
      pointerType: 'touch', button: 0, isPrimary: true, ...cancelPoint}));
    expect(changes.length === count, 'touch cancel adds no stroke');
    changeSelect('select[aria-label="範囲の層"]', 'correction');
    syntheticStroke(30, 60, 'touch');
    root.querySelector('[data-bw-operation="ERASE"]').click();
    syntheticStroke(31, 60);
    state = component.getStrokes();
    expect(state.subjectStrokes.length === 1 && state.correctionStrokes.length === 2 &&
      state.correctionStrokes[0].operation === 'ADD' &&
      state.correctionStrokes[1].operation === 'ERASE', 'touch ADD and correction ERASE remain distinct');
    root.querySelector('[data-bw-action="undo"]').click();
    expect(component.getStrokes().correctionStrokes.length === 1, 'Undo correction stroke');
    root.querySelector('[data-bw-action="redo"]').click();
    expect(component.getStrokes().correctionStrokes.length === 2, 'Redo correction stroke');
    after.focus();
    after.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    after.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    expect(component.getStrokes().correctionStrokes.length === 3, 'keyboard paint after focus');
    after.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true, bubbles: true}));
    expect(component.getStrokes().correctionStrokes.length === 2, 'keyboard Undo');
    after.dispatchEvent(new KeyboardEvent('keydown', {key: 'y', ctrlKey: true, bubbles: true}));
    expect(component.getStrokes().correctionStrokes.length === 3, 'keyboard Redo');
    expect(getComputedStyle(after).outlineStyle !== 'none', 'visible focus');
    const frozen = JSON.stringify(component.getStrokes()), beforeCount = changes.length;
    view = 'before'; syntheticStroke(30, 60);
    after.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    expect(changes.length === beforeCount && JSON.stringify(component.getStrokes()) === frozen,
      'Before refuses pointer and keyboard without mutation');
    view = 'split';
    const beforeBox = before.getBoundingClientRect();
    const originalPointer = {clientX: beforeBox.left + beforeBox.width / 2,
      clientY: beforeBox.top + beforeBox.height / 2};
    after.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerId: 83,
      pointerType: 'mouse', button: 0, isPrimary: true, ...originalPointer}));
    after.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerId: 83,
      pointerType: 'mouse', button: 0, isPrimary: true, ...originalPointer}));
    expect(changes.length === beforeCount, 'split Before region refuses');
    rejectChange = true;
    syntheticStroke(30, 60);
    rejectChange = false;
    expect(changes.length === beforeCount && JSON.stringify(component.getStrokes()) === frozen &&
      root.querySelector('[data-bw-action="redo"]').disabled,
    'rejected callback rolls back history and emits no saved-looking state');
    expect(root.querySelector('select').getBoundingClientRect().right <= innerWidth + 1 &&
      root.querySelector('input').getBoundingClientRect().right <= innerWidth + 1,
    '390px controls stay inside viewport');
    expect(changes.every(change => JSON.stringify(change).includes('Strokes')),
      'onChange typed snapshots');
    component.setEnabled(false);
    after.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true, bubbles: true}));
    syntheticStroke(30, 60);
    expect(changes.length === beforeCount && JSON.stringify(component.getStrokes()) === frozen &&
      root.querySelector('[data-bw-action="undo"]').disabled,
    'authorization-off state refuses pointer, keyboard and Undo');
    verdict.textContent = 'BW_EDGE_MANUAL_BROWSER_PASS';
  } catch (error) {verdict.textContent = `FAIL: ${error?.stack ?? error}`;}
});
