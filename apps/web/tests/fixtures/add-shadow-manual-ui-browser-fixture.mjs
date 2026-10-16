import {mountAddShadowManualUI} from '../../src/add-shadow-manual-ui.mjs';

const sourceID = 'bc410d09-6a70-4225-97ad-82aee7a690a8';
const backdropID = 'e51be62f-7d98-493b-943e-d0b3146b74fb';
const sourceSHA = 'a'.repeat(64), backdropSHA = 'b'.repeat(64);
const image = document.querySelector('#after');
image.src = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#beae9b"/></svg>');
const before = document.querySelector('#before');
before.src = image.src;
let version = 1, view = 'after', delayed = false, pendingResolve;
const calls = [];
const current = () => ({assetID: sourceID, originalSHA256: sourceSHA,
  sourceWidth: 200, sourceHeight: 100, savedRevision: version,
  uprightWidth: 200, uprightHeight: 100, rotationDegrees: 0,
  view, beforeRect: before.getBoundingClientRect(),
  ready: true, dirty: false, busy: false, permissionExpired: false});
const ui = mountAddShadowManualUI({root: document.querySelector('#panel'),
  afterImage: image, getContext: current,
  listBackdrops: () => [{id: backdropID, sha256: backdropSHA, name: '本人が選ぶ背景'}],
  onSubmit: (documentValue, options) => {
    calls.push({documentValue, options});
    if (delayed) return new Promise(resolve => {pendingResolve = resolve;});
    return Promise.resolve();
  }, enabled: true});
const wait = () => new Promise(resolve => setTimeout(resolve, 0));
const require = (condition, message) => {if (!condition) throw Error(message);};
const pointer = (type, id, x, y, pointerType = 'mouse') => image.dispatchEvent(
  new PointerEvent(type, {bubbles: true, cancelable: true, pointerId: id,
    pointerType, button: 0, isPrimary: true, clientX: x, clientY: y}));
const strokeAt = (id, x, y, kind = 'mouse') => {
  pointer('pointerdown', id, x, y, kind);
  pointer('pointerup', id, x, y, kind);
};
async function run() {
  await image.decode(); await before.decode(); ui.refresh();
  const box = image.getBoundingClientRect();
  const centerX = box.left + box.width / 2, centerY = box.top + box.height / 2;
  const background = document.querySelector('[aria-label="背景Asset"]');
  const mode = document.querySelector('[aria-label="影モード"]');
  require(background.value === '', 'BACKDROP_AUTO_SELECTED');
  background.value = backdropID; background.dispatchEvent(new Event('change', {bubbles: true}));
  mode.value = 'soft'; mode.dispatchEvent(new Event('change', {bubbles: true}));
  strokeAt(1, centerX, centerY);
  require(ui.getDraft().subjectStrokes.length === 1, 'POINTER_STROKE_MISSING');
  strokeAt(2, centerX + 20, centerY, 'touch');
  require(ui.getDraft().subjectStrokes.length === 2, 'TOUCH_STROKE_MISSING');
  image.focus();
  image.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'ArrowRight'}));
  image.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'Enter'}));
  require(ui.getDraft().subjectStrokes.length === 3, 'KEYBOARD_STROKE_MISSING');
  strokeAt(3, centerX, box.top + 5);
  require(ui.getDraft().subjectStrokes.length === 3, 'LETTERBOX_ACCEPTED');
  view = 'split'; ui.refresh();
  const b = before.getBoundingClientRect();
  strokeAt(4, b.left + b.width / 2, b.top + b.height / 2);
  require(ui.getDraft().subjectStrokes.length === 3, 'BEFORE_ACCEPTED');
  view = 'after'; ui.refresh();
  document.querySelector('.suite-add-shadow-manual button:nth-last-child(2)').click();
  await wait();
  require(calls.length === 1, 'HOST_CALLBACK_NOT_CALLED');
  require(calls[0].documentValue.subjectStrokes.length === 3 &&
    calls[0].documentValue.binding.backdropID === backdropID &&
    calls[0].documentValue.settings.mode === 'soft', 'HOST_PAYLOAD_WRONG');
  delayed = true;
  document.querySelector('.suite-add-shadow-manual button:nth-last-child(2)').click();
  await wait();
  document.querySelector('.suite-add-shadow-manual button:last-child').click();
  require(calls.length === 2 && calls[1].options.signal.aborted,
    'CANCEL_DID_NOT_ABORT');
  pendingResolve?.(); await wait();
  require(!document.querySelector('.suite-add-shadow-manual__status').textContent.includes('応答'),
    'CANCEL_MISREPORTED_SUCCESS');
  version = 2; ui.refresh();
  require(document.querySelector('.suite-add-shadow-manual button:nth-last-child(2)').disabled,
    'STALE_REVISION_SUBMIT_ENABLED');
  strokeAt(5, centerX, centerY);
  require(ui.getDraft().subjectStrokes.length === 3, 'STALE_REVISION_STROKE_ACCEPTED');
  require(document.documentElement.scrollWidth <= window.innerWidth + 1,
    'MOBILE_HORIZONTAL_OVERFLOW');
  for (const control of document.querySelectorAll('.suite-add-shadow-manual button, .suite-add-shadow-manual input, .suite-add-shadow-manual select'))
    require(control.getBoundingClientRect().height >= 44, 'TAP_TARGET_TOO_SMALL');
  return {calls: calls.length, strokes: ui.getDraft().subjectStrokes.length,
    viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth};
}
document.querySelector('#probe-run').addEventListener('click', async () => {
  const verdict = document.querySelector('#probe-verdict');
  try {verdict.textContent = 'ADD_SHADOW_UI_BROWSER_PASS ' + JSON.stringify(await run());}
  catch (error) {verdict.textContent = 'ADD_SHADOW_UI_BROWSER_FAIL ' + error.message;}
});
window.__shadowProbe = {ui, run};
