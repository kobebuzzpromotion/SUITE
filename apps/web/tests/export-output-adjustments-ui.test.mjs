import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild-wasm';
import {createExportOutputAdjustmentsForm} from '../src/export-output-adjustments-ui.mjs';

if (process.argv.includes('--serve')) {
  const here = dirname(fileURLToPath(import.meta.url)), port = 61903;
  const result = await build({entryPoints: [resolve(here, '../src/export-output-adjustments-ui.mjs')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent'});
  const script = `import {createExportOutputAdjustmentsForm} from '/form.js';
    window.suiteApplied=[]; window.suiteCancelled=0;
    window.suiteForm=createExportOutputAdjustmentsForm({onApply:settings=>{
      window.suiteApplied.push(settings); document.querySelector('#result').textContent=JSON.stringify(settings);
    }, onCancel:()=>{
      window.suiteCancelled++; document.querySelector('#result').textContent='CANCELLED';
    }});
    document.querySelector('#mount').append(window.suiteForm.element);`;
  const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>SUITE export output form probe</title>
    <h1>出力時シャープ調整のフォーム確認</h1><main id="mount"></main><pre id="result">NOT_RUN</pre><script type="module" src="/mount.js"></script></html>`;
  const routes = new Map([['/', [page, 'text/html; charset=utf-8']],
    ['/mount.js', [script, 'text/javascript; charset=utf-8']],
    ['/form.js', [result.outputFiles[0].contents, 'text/javascript; charset=utf-8']]]);
  createServer((req, res) => {
    if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); res.end(); return; }
    const route = routes.get(new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname);
    if (!route) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type': route[1], 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; connect-src 'self'"});
    res.end(route[0]);
  }).listen(port, '127.0.0.1', () => console.log(`SUITE_EXPORT_OUTPUT_FORM http://127.0.0.1:${port}/`));
}

class FakeNode {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...children) { this.children.push(...children); }
  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(callback);
    this.listeners.set(type, listeners);
  }
  focus() { this.ownerDocument.activeElement = this; }
  remove() { this.removed = true; }
  async emit(type, properties = {}) {
    const event = {type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties};
    for (const callback of this.listeners.get(type) ?? []) await callback(event);
    return event;
  }
}

function fakeDocument() {
  return {
    activeElement: null,
    createElement(tag) { return new FakeNode(tag, this); },
    createTextNode(text) { const node = new FakeNode('#text', this); node.textContent = text; return node; },
  };
}
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
function input(node, name) { return descendants(node).find(child => child.getAttribute('name') === name); }
function radio(node, kind) { return descendants(node).find(child => child.tagName === 'INPUT' && child.getAttribute('value') === kind); }
function buttons(node) { return descendants(node).filter(child => child.tagName === 'BUTTON'); }
function fieldsets(node) { return descendants(node).filter(child => child.tagName === 'FIELDSET'); }
function selectMode(form, kind) {
  radio(form, 'none').checked = kind === 'none';
  radio(form, 'manual').checked = kind === 'manual';
  return radio(form, kind).emit('change');
}
function fields(form) {
  const all = descendants(form).filter(node => node.tagName === 'INPUT');
  return Object.fromEntries(['gain', 'radiusPx', 'thresholdLuma'].map(key => [key, all.find(node => node.getAttribute('name') === key)]));
}

test('OUTPUT-FORM-01 native labelled controls start at none, never imply official preset equivalence or Recipe storage', () => {
  const document = fakeDocument();
  const applied = [];
  const view = createExportOutputAdjustmentsForm({document, onApply: value => applied.push(value)});
  const form = view.element, all = descendants(form);
  assert.equal(form.tagName, 'FORM');
  assert.equal(form.getAttribute('aria-label'), '出力時のシャープ調整');
  assert.equal(form.getAttribute('aria-busy'), 'false');
  assert.equal(radio(form, 'none').checked, true);
  assert.equal(radio(form, 'manual').checked, false);
  assert.deepEqual(view.getSettings(), {kind: 'none'});
  assert.equal(fieldsets(form)[1].disabled, true, 'manual inputs are excluded until selected');
  assert.equal(all.filter(node => node.tagName === 'LEGEND').length, 2);
  assert.equal(all.filter(node => node.tagName === 'LABEL').length, 5);
  assert.ok(all.some(node => node.textContent.includes('Recipeには保存しません')));
  assert.ok(all.some(node => node.textContent.includes('公式Screen/Printプリセットの再現ではなく')));
  assert.deepEqual(all.filter(node => node.tagName === 'INPUT').map(node => node.getAttribute('value')).filter(Boolean), ['none', 'manual']);
  assert.equal(buttons(form)[0].getAttribute('type'), 'submit');
  assert.equal(buttons(form)[1].getAttribute('type'), 'button');
  assert.equal(all.find(node => node.getAttribute('role') === 'status').getAttribute('aria-live'), 'polite');
  for (const field of Object.values(fields(form))) {
    assert.equal(field.getAttribute('type'), 'number');
    assert.equal(field.getAttribute('step'), 'any');
    assert.ok(field.getAttribute('aria-describedby'));
  }
  view.focus();
  assert.equal(document.activeElement, radio(form, 'none'));
  assert.deepEqual(applied, []);
});

test('OUTPUT-FORM-02 explicit manual values alone reach the export callback; empty, out-of-range and preset names fail closed', async () => {
  const document = fakeDocument(), applied = [];
  const originalRecipe = Object.freeze({postDecodeAdjustments: Object.freeze({detail: Object.freeze({sharpness: 42})})});
  const view = createExportOutputAdjustmentsForm({document, onApply: settings => applied.push(settings)});
  const form = view.element, controls = fields(form);
  await selectMode(form, 'manual');
  assert.equal(fieldsets(form)[1].disabled, false);
  assert.deepEqual(view.getSettings(), {kind: 'manual', gain: 1, radiusPx: 1, thresholdLuma: 0});
  controls.gain.value = '1.25'; controls.radiusPx.value = '2.5'; controls.thresholdLuma.value = '8';
  const submission = await form.emit('submit');
  assert.equal(submission.defaultPrevented, true);
  assert.deepEqual(applied, [{kind: 'manual', gain: 1.25, radiusPx: 2.5, thresholdLuma: 8}]);
  assert.deepEqual(originalRecipe, {postDecodeAdjustments: {detail: {sharpness: 42}}});
  controls.gain.value = '';
  assert.throws(() => view.getSettings(), /OUTPUT_SHARPENING_FORM_VALUE_REQUIRED_GAIN/);
  await form.emit('submit');
  assert.equal(document.activeElement, controls.gain);
  assert.equal(applied.length, 1);
  controls.gain.value = '3';
  assert.throws(() => view.getSettings(), /OUTPUT_SHARPENING_RANGE_GAIN/);
  await form.emit('submit');
  assert.equal(applied.length, 1);
  controls.gain.value = '1'; controls.radiusPx.value = '0.2';
  assert.throws(() => view.getSettings(), /OUTPUT_SHARPENING_RANGE_RADIUSPX/);
  controls.radiusPx.value = '1'; controls.thresholdLuma.value = '65';
  assert.throws(() => view.getSettings(), /OUTPUT_SHARPENING_RANGE_THRESHOLDLUMA/);
  assert.throws(() => createExportOutputAdjustmentsForm({document, initial: {kind: 'screen-high'}, onApply() {}}), /OUTPUT_SHARPENING_PRESET_UNSUPPORTED/);
});

test('OUTPUT-FORM-03 cancel button and Escape discard draft, preserve initial, and never apply', async () => {
  const document = fakeDocument(), applied = [], cancelled = [];
  const view = createExportOutputAdjustmentsForm({document, initial: {kind: 'manual', gain: 0.75, radiusPx: 1.5, thresholdLuma: 3},
    onApply: value => applied.push(value), onCancel: () => cancelled.push(true)});
  const form = view.element, controls = fields(form);
  view.focus();
  assert.equal(document.activeElement, radio(form, 'manual'));
  assert.deepEqual(view.getSettings(), {kind: 'manual', gain: 0.75, radiusPx: 1.5, thresholdLuma: 3});
  controls.gain.value = '2';
  await buttons(form)[1].emit('click');
  assert.equal(cancelled.length, 1);
  assert.equal(applied.length, 0);
  assert.equal(controls.gain.value, '0.75');
  assert.equal(document.activeElement, radio(form, 'manual'));
  controls.radiusPx.value = '3';
  const escape = await form.emit('keydown', {key: 'Escape'});
  assert.equal(escape.defaultPrevented, true);
  assert.equal(controls.radiusPx.value, '1.5');
  assert.equal(cancelled.length, 2);
  await form.emit('keydown', {key: 'Enter'});
  assert.equal(cancelled.length, 2);
});

test('OUTPUT-FORM-04 external disabled and pending submission prevent duplicate exports while allowing cancellation', async () => {
  const document = fakeDocument();
  let finish, calls = 0, cancellations = 0;
  const pendingExport = new Promise(resolve => { finish = resolve; });
  const view = createExportOutputAdjustmentsForm({document, onApply: () => { calls++; return pendingExport; }, onCancel: () => cancellations++});
  const form = view.element, [apply, cancel] = buttons(form);
  view.setDisabled(true);
  assert.equal(apply.disabled, true); assert.equal(cancel.disabled, true);
  assert.equal(fieldsets(form)[0].disabled, true);
  await form.emit('submit'); await cancel.emit('click');
  assert.equal(calls, 0); assert.equal(cancellations, 0);
  view.setDisabled(false);
  const first = form.emit('submit');
  assert.equal(form.getAttribute('aria-busy'), 'true');
  assert.equal(apply.disabled, true); assert.equal(cancel.disabled, false);
  await form.emit('submit');
  assert.equal(calls, 1);
  await cancel.emit('click');
  assert.equal(cancellations, 1);
  finish(); await first;
  assert.equal(form.getAttribute('aria-busy'), 'false');
  assert.equal(apply.disabled, false);
  view.destroy();
  assert.equal(form.removed, true);
  await form.emit('submit');
  assert.equal(calls, 1);
});

test('OUTPUT-FORM-05 missing document/callback and rejected export never masquerade as success', async () => {
  const document = fakeDocument();
  assert.throws(() => createExportOutputAdjustmentsForm({document: null, onApply() {}}), /OUTPUT_SHARPENING_FORM_DOCUMENT_REQUIRED/);
  assert.throws(() => createExportOutputAdjustmentsForm({document}), /OUTPUT_SHARPENING_FORM_CALLBACK_INVALID/);
  const view = createExportOutputAdjustmentsForm({document, onApply: async () => { throw Error('server unavailable'); }});
  await view.element.emit('submit');
  const status = descendants(view.element).find(node => node.getAttribute('role') === 'status');
  assert.match(status.textContent, /開始できませんでした/);
  assert.equal(view.element.getAttribute('aria-busy'), 'false');
});
