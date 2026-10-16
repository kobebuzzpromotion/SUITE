import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint, mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {ADD_SHADOW_VERSION} from './processing/add-shadow.mjs';
import {validateAddShadowManualDocument} from './processing/add-shadow-manual-contract.mjs';
import {MAX_SOURCE_PIXELS} from './processing/pure.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const MAX_STROKES = 64, MAX_POINTS = 4096;
const DEFAULT_SETTINGS = Object.freeze({mode: 'none', opacity: 70, blur: 8,
  gradient: 0, blend: 'normal', offsetX: 8, offsetY: 8,
  shadowColor: Object.freeze([0, 0, 0])});
const style = `.suite-add-shadow-manual{box-sizing:border-box;max-width:100%;min-width:0;padding:1rem;border:1px solid #cecac2;background:#fff;color:#242321;font:14px/1.5 system-ui,sans-serif}
.suite-add-shadow-manual *{box-sizing:border-box}.suite-add-shadow-manual h3{font:normal clamp(1.3rem,3vw,1.8rem)/1.25 Georgia,serif;margin:0 0 .4rem}
.suite-add-shadow-manual p{margin:.4rem 0 .8rem}.suite-add-shadow-manual__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;min-width:0}
.suite-add-shadow-manual label{display:grid;gap:.2rem;min-width:0}.suite-add-shadow-manual input,.suite-add-shadow-manual select{width:100%;max-width:100%;min-width:0;min-height:44px;padding:.4rem;border:1px solid #77736b;border-radius:0;background:#fff;color:#242321;font:inherit}
.suite-add-shadow-manual__actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:.8rem 0}.suite-add-shadow-manual button{min-height:44px;min-width:44px;padding:.5rem .8rem;border:1px solid #494640;border-radius:0;background:#fff;color:#242321;font:inherit;cursor:pointer}
.suite-add-shadow-manual button:disabled{cursor:not-allowed;opacity:.5}.suite-add-shadow-manual :focus-visible{outline:3px solid #145b84;outline-offset:2px}
.suite-add-shadow-manual__status{min-height:2.5em;overflow-wrap:anywhere}.suite-add-shadow-manual__scope{overflow-wrap:anywhere;font-size:.8rem;color:#4c4843}
@media(max-width:600px){.suite-add-shadow-manual{padding:.7rem}.suite-add-shadow-manual__grid{grid-template-columns:minmax(0,1fr)}.suite-add-shadow-manual__actions>*{flex:1 1 8rem}}
@media(prefers-reduced-motion:reduce){.suite-add-shadow-manual *, .suite-add-shadow-manual *::before, .suite-add-shadow-manual *::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;
const clone = value => structuredClone(value);
const by = (doc, tag, text = '') => {const node = doc.createElement(tag); node.textContent = text; return node;};
const label = (doc, name, input) => {const node = by(doc, 'label', name); node.append(input); return node;};
function baseContext(value) {
  if (!value || !UUID.test(value.assetID) || !SHA.test(value.originalSHA256) ||
      !Number.isSafeInteger(value.sourceWidth) || value.sourceWidth < 1 ||
      !Number.isSafeInteger(value.sourceHeight) || value.sourceHeight < 1 ||
      value.sourceWidth * value.sourceHeight > MAX_SOURCE_PIXELS ||
      !Number.isSafeInteger(value.savedRevision) || value.savedRevision < 1)
    throw Error('ADD_SHADOW_UI_CONTEXT_INVALID');
  return [value.assetID, value.originalSHA256, value.sourceWidth,
    value.sourceHeight, value.savedRevision].join(':');
}
function available(value) {
  return value?.ready === true && value?.dirty === false &&
    value?.busy === false && value?.permissionExpired === false &&
    ['after', 'split'].includes(value.view);
}
function backdropList(value, sourceID) {
  if (!Array.isArray(value) || value.length > 500) throw Error('ADD_SHADOW_UI_BACKDROPS_INVALID');
  const seen = new Set();
  return value.map(item => {
    if (!item || !UUID.test(item.id) || !SHA.test(item.sha256) ||
        item.id === sourceID || seen.has(item.id) ||
        typeof item.name !== 'string' || item.name.length < 1 || item.name.length > 240)
      throw Error('ADD_SHADOW_UI_BACKDROPS_INVALID');
    seen.add(item.id);
    return Object.freeze({id: item.id, sha256: item.sha256, name: item.name});
  });
}
function integer(input) {
  if (input.value.trim() === '' || !/^-?\d+$/u.test(input.value.trim()))
    throw Error('ADD_SHADOW_UI_SETTING_INVALID');
  const number = Number(input.value);
  if (!Number.isSafeInteger(number)) throw Error('ADD_SHADOW_UI_SETTING_INVALID');
  return number;
}

/**
 * Independent draft UI, not an authenticated Editor mount. The host must
 * supply live image geometry, an explicit backdrop list, and an onSubmit
 * callback that performs real Trial gates/save CAS/processing. UI state and
 * callback response are never themselves authorization or Final evidence.
 */
export function mountAddShadowManualUI({root, afterImage, getContext,
  listBackdrops, onSubmit, initial, enabled = false} = {}) {
  if (!(root instanceof HTMLElement) || !(afterImage instanceof HTMLImageElement) ||
      typeof getContext !== 'function' || typeof listBackdrops !== 'function' ||
      typeof onSubmit !== 'function' || !afterImage.parentElement)
    throw Error('ADD_SHADOW_UI_MOUNT_INVALID');
  const doc = root.ownerDocument, host = afterImage.parentElement;
  const mountedContext = getContext(), mountedKey = baseContext(mountedContext);
  let choices = backdropList(listBackdrops(), mountedContext.assetID);
  let strokes = [], settings = clone(DEFAULT_SETTINGS), selected = '';
  let originalBackdropID = null;
  if (initial !== undefined) {
    const checked = validateAddShadowManualDocument(initial, initial?.binding);
    if (checked.binding.assetID !== mountedContext.assetID ||
        checked.binding.originalSHA256 !== mountedContext.originalSHA256 ||
        checked.binding.sourceWidth !== mountedContext.sourceWidth ||
        checked.binding.sourceHeight !== mountedContext.sourceHeight ||
        !choices.some(item => item.id === checked.binding.backdropID &&
          item.sha256 === checked.binding.backdropSHA256))
      throw Error('ADD_SHADOW_UI_INITIAL_MISMATCH');
    strokes = clone(checked.subjectStrokes); settings = clone(checked.settings);
    selected = checked.binding.backdropID;
    originalBackdropID = selected;
  }
  let operation = 'ADD', drawing = null, keyboard = {x: .5, y: .5};
  let busy = false, disposed = false, generation = 0, inFlight = null;
  let ownsImage = false, savedImage = null;
  const events = new AbortController();
  const panel = by(doc, 'section'); panel.className = 'suite-add-shadow-manual';
  panel.setAttribute('aria-label', 'Add Shadow 手動操作');
  panel.append(by(doc, 'style', style));
  panel.append(by(doc, 'h3', 'Add Shadow · 手動範囲'));
  panel.append(by(doc, 'p', 'After上で被写体を手動指定します。自動認識や保存・書出しではありません。'));
  const scope = by(doc, 'p', `対象 Asset ${mountedContext.assetID}`);
  scope.className = 'suite-add-shadow-manual__scope'; panel.append(scope);
  const grid = by(doc, 'div'); grid.className = 'suite-add-shadow-manual__grid';
  const background = by(doc, 'select'); background.setAttribute('aria-label', '背景Asset');
  const mode = by(doc, 'select'); mode.setAttribute('aria-label', '影モード');
  for (const value of ['none', 'soft', 'hard', 'drop']) {
    const option = by(doc, 'option', value === 'none' ? 'None' :
      value[0].toUpperCase() + value.slice(1)); option.value = value; mode.append(option);
  }
  mode.value = settings.mode;
  const blend = by(doc, 'select'); blend.setAttribute('aria-label', '合成方式');
  for (const value of ['normal', 'multiply']) {
    const option = by(doc, 'option', value); option.value = value; blend.append(option);
  }
  blend.value = settings.blend;
  function control(name, value, min, max) {
    const input = by(doc, 'input'); input.type = 'number'; input.min = String(min);
    input.max = String(max); input.step = '1'; input.value = String(value);
    input.setAttribute('aria-label', name); return input;
  }
  const opacity = control('影の不透明度', settings.opacity, 0, 100);
  const blur = control('ぼかし', settings.blur, 0, 64);
  const gradient = control('影のグラデーション', settings.gradient, 0, 100);
  const offsetX = control('影の水平位置', settings.offsetX, -256, 256);
  const offsetY = control('影の垂直位置', settings.offsetY, -256, 256);
  const red = control('影色 赤', settings.shadowColor[0], 0, 255);
  const green = control('影色 緑', settings.shadowColor[1], 0, 255);
  const blue = control('影色 青', settings.shadowColor[2], 0, 255);
  const radius = control('ブラシ半径 %', 4, 1, 25);
  const hardness = control('ブラシ硬さ %', 70, 0, 100);
  grid.append(label(doc, '背景Asset（本人が選択）', background),
    label(doc, '影モード', mode), label(doc, '不透明度', opacity),
    label(doc, 'ぼかし', blur), label(doc, 'グラデーション', gradient),
    label(doc, '合成方式', blend), label(doc, '水平位置', offsetX),
    label(doc, '垂直位置', offsetY), label(doc, '影色 赤', red),
    label(doc, '影色 緑', green), label(doc, '影色 青', blue),
    label(doc, 'ブラシ半径', radius), label(doc, 'ブラシ硬さ', hardness));
  panel.append(grid);
  const replaceConfirmation = by(doc, 'input'); replaceConfirmation.type = 'checkbox';
  replaceConfirmation.setAttribute('aria-label', '保存済み背景を明示的に置換');
  const replaceLabel = label(doc, '保存済み背景を置換（旧背景のmaskと生成Blobは破棄）', replaceConfirmation);
  replaceLabel.hidden = true; panel.append(replaceLabel);
  const actions = by(doc, 'div'); actions.className = 'suite-add-shadow-manual__actions';
  const add = by(doc, 'button', '範囲を追加'); add.type = 'button';
  add.dataset.shadowOperation = 'ADD';
  const erase = by(doc, 'button', '範囲を消去'); erase.type = 'button';
  erase.dataset.shadowOperation = 'ERASE';
  const refresh = by(doc, 'button', '背景候補を更新'); refresh.type = 'button';
  const submit = by(doc, 'button', '処理を依頼'); submit.type = 'button';
  const cancel = by(doc, 'button', '操作を取消'); cancel.type = 'button';
  actions.append(add, erase, refresh, submit, cancel); panel.append(actions);
  const status = by(doc, 'p', '未保存。本人の操作後、hostで実処理を確認してください。');
  status.className = 'suite-add-shadow-manual__status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  panel.append(status); root.append(panel);
  const overlay = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('aria-hidden', 'true'); overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none'; overlay.style.overflow = 'visible';
  const hostPosition = host.style.position;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.append(overlay);
  function claimImage() {
    if (ownsImage) return;
    savedImage = {tabindex: afterImage.getAttribute('tabindex'), role: afterImage.getAttribute('role'),
      label: afterImage.getAttribute('aria-label'), shortcuts: afterImage.getAttribute('aria-keyshortcuts'),
      touch: afterImage.style.touchAction, outline: afterImage.style.outline,
      outlineOffset: afterImage.style.outlineOffset};
    afterImage.tabIndex = 0; afterImage.setAttribute('role', 'button');
    afterImage.setAttribute('aria-label', 'After写真の手動影ブラシ。矢印キーで移動、Enterで描画、Escapeで取消');
    afterImage.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape');
    afterImage.style.touchAction = 'none'; afterImage.style.outlineOffset = '3px';
    ownsImage = true;
  }
  function releaseImage() {
    if (!ownsImage) return;
    for (const [attribute, value] of [['tabindex', savedImage.tabindex], ['role', savedImage.role],
      ['aria-label', savedImage.label], ['aria-keyshortcuts', savedImage.shortcuts]]) {
      if (value === null) afterImage.removeAttribute(attribute);
      else afterImage.setAttribute(attribute, value);
    }
    afterImage.style.touchAction = savedImage.touch;
    afterImage.style.outline = savedImage.outline;
    afterImage.style.outlineOffset = savedImage.outlineOffset;
    ownsImage = false; savedImage = null;
  }
  function freshContext() {
    if (!enabled || disposed || !afterImage.complete ||
        !afterImage.naturalWidth || !afterImage.naturalHeight)
      throw Error('ADD_SHADOW_UI_AFTER_NOT_READY');
    const context = getContext();
    if (baseContext(context) !== mountedKey) throw Error('ADD_SHADOW_UI_STALE_ASSET_OR_REVISION');
    if (!available(context)) throw Error('ADD_SHADOW_UI_CONTEXT_NOT_READY');
    return context;
  }
  function current() {
    if (busy) throw Error('ADD_SHADOW_UI_BUSY');
    return freshContext();
  }
  function geometry() {
    const context = current();
    if(context.expectedAfterURL&&afterImage.getAttribute('src')!==context.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {...context, afterRect: afterImage.getBoundingClientRect(),
      naturalWidth: afterImage.naturalWidth, naturalHeight: afterImage.naturalHeight};
  }
  function list() {
    const context = getContext();
    if (baseContext(context) !== mountedKey)
      throw Error('ADD_SHADOW_UI_STALE_ASSET_OR_REVISION');
    return backdropList(listBackdrops(), context.assetID);
  }
  function settingsValue() {
    return {mode: mode.value, opacity: integer(opacity), blur: integer(blur),
      gradient: integer(gradient), blend: blend.value,
      offsetX: integer(offsetX), offsetY: integer(offsetY),
      shadowColor: [integer(red), integer(green), integer(blue)]};
  }
  function candidate() {
    const context = current(), asset = list().find(item => item.id === selected);
    if (!asset || !choices.some(item => item.id === asset.id && item.sha256 === asset.sha256))
      throw Error('ADD_SHADOW_UI_BACKDROP_SELECTION_REQUIRED');
    if (originalBackdropID && selected !== originalBackdropID && !replaceConfirmation.checked)
      throw Error('ADD_SHADOW_UI_EXPLICIT_REPLACE_REQUIRED');
    const binding = {assetID: context.assetID, originalSHA256: context.originalSHA256,
      sourceWidth: context.sourceWidth, sourceHeight: context.sourceHeight,
      backdropID: asset.id, backdropSHA256: asset.sha256};
    return validateAddShadowManualDocument({schemaVersion: 1,
      engineVersion: ADD_SHADOW_VERSION, binding,
      subjectStrokes: clone(strokes), settings: settingsValue()}, binding);
  }
  function refreshOptions() {
    const previous = choices.find(item => item.id === selected);
    choices = list();
    background.replaceChildren();
    const placeholder = by(doc, 'option', '背景Assetを選択');
    placeholder.value = ''; background.append(placeholder);
    for (const item of choices) {
      const option = by(doc, 'option', item.name); option.value = item.id;
      background.append(option);
    }
    selected = previous && choices.some(item => item.id === previous.id &&
      item.sha256 === previous.sha256) ? previous.id : '';
    background.value = selected;
  }
  function render() {
    const ready = (() => {try {geometry(); return true;} catch {return false;}})();
    if (ready) claimImage(); else releaseImage();
    replaceLabel.hidden = !originalBackdropID || selected === originalBackdropID;
    replaceConfirmation.disabled = !ready || replaceLabel.hidden;
    for (const element of [background, mode, blend, opacity, blur, gradient,
      offsetX, offsetY, red, green, blue, radius, hardness, add, erase, refresh, submit])
      element.disabled = !ready;
    cancel.disabled = disposed || (!busy && !drawing);
    add.setAttribute('aria-pressed', String(operation === 'ADD'));
    erase.setAttribute('aria-pressed', String(operation === 'ERASE'));
    overlay.replaceChildren();
    if (!ready) return;
    try {
      const g = geometry(), box = afterImage.getBoundingClientRect();
      const parent = host.getBoundingClientRect();
      overlay.style.left = `${box.left - parent.left}px`;
      overlay.style.top = `${box.top - parent.top}px`;
      overlay.style.width = `${box.width}px`;
      overlay.style.height = `${box.height}px`;
      overlay.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      appendProjectedBrushOverlay(overlay,g,strokes);
    } catch {overlay.replaceChildren();}
  }
  function addStroke(path) {
    if (!path.length || strokes.length >= MAX_STROKES ||
        strokes.reduce((count, stroke) => count + stroke.path.length, path.length) > MAX_POINTS)
      throw Error('ADD_SHADOW_UI_STROKE_CAPACITY');
    const radiusFraction = integer(radius) / 100;
    const hard = integer(hardness) / 100;
    if (radiusFraction < .001 || radiusFraction > .25 || hard < 0 || hard > 1)
      throw Error('ADD_SHADOW_UI_BRUSH_INVALID');
    strokes.push({operation, path, radiusFraction, hardness: hard});
    status.textContent = '手動範囲を下書きに追加しました。未保存・未処理です。';
    render();
  }
  function point(event) {
    const mapped = mapAfterToLocalBrushPoint({...geometry(),
      clientX: event.clientX, clientY: event.clientY});
    return {u: mapped.x, v: mapped.y};
  }
  function end(event, cancelled) {
    if (!drawing || event.pointerId !== drawing.id) return;
    const draft = drawing; drawing = null;
    try {if (afterImage.hasPointerCapture?.(event.pointerId))
      afterImage.releasePointerCapture(event.pointerId);} catch {}
    if (cancelled || draft.invalid) {status.textContent = 'strokeを取消しました。'; render(); return;}
    try {
      const last = point(event);
      if (draft.path.at(-1)?.u !== last.u || draft.path.at(-1)?.v !== last.v)
        draft.path.push(last);
      addStroke(draft.path);
    } catch (error) {status.textContent = 'Afterの実画像外または古い版では確定しません。';
      status.dataset.error = String(error?.message ?? error); render();}
  }
  afterImage.addEventListener('pointerdown', event => {
    if (drawing || event.isPrimary === false || event.pointerType !== 'touch' && event.button !== 0)
      return;
    try {const p = point(event); drawing = {id: event.pointerId, path: [p], invalid: false};
      try {afterImage.setPointerCapture?.(event.pointerId);} catch {}
      event.preventDefault(); render();}
    catch (error) {status.dataset.error = String(error?.message ?? error);
      status.textContent = 'Afterの実画像上だけ描画できます。';}
  }, {signal: events.signal});
  afterImage.addEventListener('pointermove', event => {
    if (!drawing || event.pointerId !== drawing.id) return;
    try {const p = point(event);
      if (drawing.path.length >= MAX_POINTS) {drawing.invalid = true; return;}
      if (Math.abs(p.u - drawing.path.at(-1).u) + Math.abs(p.v - drawing.path.at(-1).v) > .0001)
        drawing.path.push(p);
    } catch {drawing.invalid = true;}
  }, {signal: events.signal});
  afterImage.addEventListener('pointerup', event => end(event, false), {signal: events.signal});
  afterImage.addEventListener('pointercancel', event => end(event, true), {signal: events.signal});
  afterImage.addEventListener('focus', () => {if (ownsImage)
    afterImage.style.outline = '3px solid #145b84';}, {signal: events.signal});
  afterImage.addEventListener('blur', () => {if (ownsImage)
    afterImage.style.outline = savedImage.outline;}, {signal: events.signal});
  afterImage.addEventListener('keydown', event => {
    try {geometry();} catch {return;}
    if (event.key === 'Escape') {drawing = null; status.textContent = 'strokeを取消しました。';
      render(); return;}
    const dx = event.key === 'ArrowRight' ? .01 : event.key === 'ArrowLeft' ? -.01 : 0;
    const dy = event.key === 'ArrowDown' ? .01 : event.key === 'ArrowUp' ? -.01 : 0;
    if (dx || dy) {
      event.preventDefault();
      const next = {x: Math.max(0, Math.min(1, keyboard.x + dx)),
        y: Math.max(0, Math.min(1, keyboard.y + dy))};
      try {mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX: next.x, afterY: next.y}); keyboard = next;
        status.textContent = `位置 ${Math.round(next.x * 100)}%, ${Math.round(next.y * 100)}%`;}
      catch {status.textContent = '余白・Before・Crop外には移動できません。';}
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      try {const mapped = mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX: keyboard.x, afterY: keyboard.y});
        addStroke([{u: mapped.x, v: mapped.y}]);}
      catch {status.textContent = 'Afterの実画像上だけ描画できます。';}
    }
  }, {signal: events.signal});
  add.addEventListener('click', () => {operation = 'ADD'; render();}, {signal: events.signal});
  erase.addEventListener('click', () => {operation = 'ERASE'; render();}, {signal: events.signal});
  background.addEventListener('change', () => {selected = background.value;
    replaceConfirmation.checked = false;
    status.textContent = '背景Assetを下書きに選択しました。未認可・未保存です。';render();},
  {signal: events.signal});
  for (const controlInput of [mode, blend, opacity, blur, gradient, offsetX,
    offsetY, red, green, blue, radius, hardness])
    controlInput.addEventListener('change', () => {
      status.textContent = '設定を下書きへ変更しました。未保存・未処理です。';
    }, {signal: events.signal});
  refresh.addEventListener('click', () => {try {refreshOptions(); render();}
    catch (error) {status.dataset.error = String(error?.message ?? error);
      status.textContent = '背景候補を確認できません。';}}, {signal: events.signal});
  submit.addEventListener('click', async () => {
    if (busy || disposed) return;
    let candidateDocument;
    try {candidateDocument = candidate();}
    catch (error) {status.dataset.error = String(error?.message ?? error);
      status.textContent = '未完成・期限切れ・別写真の下書きは処理しません。'; return;}
    busy = true; const token = ++generation, abort = new AbortController();
    inFlight = abort;
    status.textContent = 'hostへ処理を依頼しています。保存・Finalは未確認です。';
    render();
    try {
      const result = await onSubmit(candidateDocument, {selectedBackdropID: selected,
        savedRevision: mountedContext.savedRevision, target: 'proxy',
        ownerConfirmed: true, replaceBackdrop: Boolean(originalBackdropID &&
          selected !== originalBackdropID && replaceConfirmation.checked), signal: abort.signal});
      if (disposed || token !== generation || abort.signal.aborted) return;
      if(baseContext(getContext())!==mountedKey)throw Error('ADD_SHADOW_UI_STALE_ASSET_OR_REVISION');
      if(result?.applied!==true)throw Error('ADD_SHADOW_UI_APPLY_NOT_CONFIRMED');
      status.textContent = 'Recipeへ適用しました。未保存です。保存後にFinalを別途確認してください。';
    } catch (error) {if (disposed || token !== generation) return;
      status.dataset.error = String(error?.message ?? error);
      status.textContent = '処理を確認できませんでした。未保存です。';}
    finally {if (!disposed && token === generation) {busy = false;
      inFlight = null; render();}}
  }, {signal: events.signal});
  cancel.addEventListener('click', () => {drawing = null;
    if (inFlight) {inFlight.abort(); generation++; inFlight = null; busy = false;}
    status.textContent = '操作を取消しました。処理完了とはしていません。'; render();},
  {signal: events.signal});
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(render) : null;
  resize?.observe(afterImage);
  afterImage.addEventListener('load', render, {signal: events.signal});
  function reset(next) {
    if (inFlight) inFlight.abort(); generation++; busy = false; inFlight = null;
    drawing = null; strokes = []; settings = clone(DEFAULT_SETTINGS); selected = '';
    if (next !== undefined) {
      const checked = validateAddShadowManualDocument(next, next?.binding);
      if (checked.binding.assetID !== mountedContext.assetID ||
          checked.binding.originalSHA256 !== mountedContext.originalSHA256 ||
          checked.binding.sourceWidth !== mountedContext.sourceWidth ||
          checked.binding.sourceHeight !== mountedContext.sourceHeight)
        throw Error('ADD_SHADOW_UI_INITIAL_MISMATCH');
      strokes = clone(checked.subjectStrokes); settings = clone(checked.settings);
      selected = checked.binding.backdropID;
    }
    mode.value = settings.mode; blend.value = settings.blend;
    for (const [input, value] of [[opacity, settings.opacity], [blur, settings.blur],
      [gradient, settings.gradient], [offsetX, settings.offsetX], [offsetY, settings.offsetY],
      [red, settings.shadowColor[0]], [green, settings.shadowColor[1]],
      [blue, settings.shadowColor[2]]]) input.value = String(value);
    refreshOptions(); status.textContent = '下書きを再読込しました。保存・Finalは未確認です。'; render();
  }
  refreshOptions(); render();
  return Object.freeze({refresh: render, reset,
    getDraft() {return clone({subjectStrokes: strokes, settings: settingsValue(),
      selectedBackdropID: selected});},
    setEnabled(value) {enabled = value === true;
      if (!enabled) {drawing = null; if (inFlight) inFlight.abort();
        generation++; busy = false; inFlight = null;} render();},
    dispose() {disposed = true; generation++; if (inFlight) inFlight.abort();
      events.abort(); resize?.disconnect(); overlay.remove(); panel.remove();
      releaseImage(); host.style.position = hostPosition;}});
}
