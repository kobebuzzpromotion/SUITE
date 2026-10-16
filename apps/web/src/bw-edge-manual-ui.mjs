import {appendProjectedBrushOverlay} from './local-brush-projected-overlay.mjs';
import {mapAfterToLocalBrushPoint, mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';

// This is an owner-operated draft surface, not a subject detector, authorization
// check, Recipe writer, or B/W Edge processor. Its output is source-normalized.
const MAX_STROKES = 64, MAX_POINTS = 4096;
const clone = value => structuredClone(value);
const exact = (value, keys) => value && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const by = (tag, attributes = {}, text = '') => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.textContent = text;
  return node;
};
const validStroke = stroke => exact(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) &&
  ['ADD', 'ERASE'].includes(stroke.operation) &&
  Array.isArray(stroke.path) && stroke.path.length >= 1 && stroke.path.length <= MAX_POINTS &&
  stroke.path.every(point => exact(point, ['u', 'v']) &&
    Number.isFinite(point.u) && point.u >= 0 && point.u <= 1 &&
    Number.isFinite(point?.v) && point.v >= 0 && point.v <= 1) &&
  Number.isFinite(stroke.radiusFraction) && stroke.radiusFraction >= .001 &&
  stroke.radiusFraction <= .25 && Number.isFinite(stroke.hardness) &&
  stroke.hardness >= 0 && stroke.hardness <= 1;
function validateInitial(initial) {
  if (initial !== undefined && !exact(initial, ['subjectStrokes', 'correctionStrokes']))
    throw Error('BW_EDGE_UI_INITIAL_INVALID');
  const subjectStrokes = initial?.subjectStrokes ?? [];
  const correctionStrokes = initial?.correctionStrokes ?? [];
  if (!Array.isArray(subjectStrokes) || !Array.isArray(correctionStrokes) ||
      [...subjectStrokes, ...correctionStrokes].length > MAX_STROKES ||
      [...subjectStrokes, ...correctionStrokes].reduce((n, stroke) => n + (stroke?.path?.length ?? 0), 0) > MAX_POINTS ||
      ![...subjectStrokes, ...correctionStrokes].every(validStroke))
    throw Error('BW_EDGE_UI_INITIAL_INVALID');
  return {subjectStrokes: clone(subjectStrokes), correctionStrokes: clone(correctionStrokes)};
}

/**
 * Attach an independent two-layer After brush to a decoded image. getGeometry
 * must return current, verified preview dimensions/rotation/Crop/Canvas Expand
 * and view; stale dimensions or Before/letterbox/padding are rejected by the
 * shared coordinate mapper. The caller must separately authenticate and save.
 */
export function mountBWEdgeManualUI({root, afterImage, getGeometry, onChange,
  initial, enabled = false} = {}) {
  if (!(root instanceof HTMLElement) || !(afterImage instanceof HTMLImageElement) ||
      typeof getGeometry !== 'function' || typeof onChange !== 'function')
    throw Error('BW_EDGE_UI_MOUNT_INVALID');
  const host = afterImage.parentElement;
  if (!host) throw Error('BW_EDGE_UI_IMAGE_HOST_REQUIRED');
  const initialState = validateInitial(initial);
  let state = initialState, history = [clone(initialState)], cursor = 0;
  let layer = 'subject', operation = 'ADD', drawing = null;
  let keyboard = {x: .5, y: .5};
  let changing = false, generation = 0, disposed = false, ownsImage = false, savedImage = null;
  const abort = new AbortController();
  const controls = by('section', {class: 'bw-edge-manual', 'aria-label': '白黒境界の手動範囲'});
  const title = by('h3', {}, '白黒境界 · 手動範囲');
  const warning = by('p', {}, '写真のAfterだけを手動指定します。自動人物選択や保存ではありません。');
  const layerLabel = by('label', {}, '範囲の層');
  const layerSelect = by('select', {'aria-label': '範囲の層'});
  layerSelect.append(by('option', {value: 'subject'}, '被写体'),
    by('option', {value: 'correction'}, '境界補正'));
  layerLabel.append(layerSelect);
  const operationGroup = by('div', {role: 'group', 'aria-label': 'ブラシ操作'});
  const add = by('button', {type: 'button', 'data-bw-operation': 'ADD'}, '追加');
  const erase = by('button', {type: 'button', 'data-bw-operation': 'ERASE'}, '消去');
  operationGroup.append(add, erase);
  const radiusLabel = by('label', {}, '半径');
  const radius = by('input', {type: 'range', min: '1', max: '25', step: '1', value: '4',
    'aria-label': 'ブラシ半径'});
  radiusLabel.append(radius);
  const hardnessLabel = by('label', {}, '硬さ');
  const hardness = by('input', {type: 'range', min: '0', max: '100', step: '1', value: '70',
    'aria-label': 'ブラシ硬さ'});
  hardnessLabel.append(hardness);
  const undo = by('button', {type: 'button', 'data-bw-action': 'undo'}, '戻す');
  const redo = by('button', {type: 'button', 'data-bw-action': 'redo'}, 'やり直す');
  const status = by('p', {role: 'status', 'aria-live': 'polite'});
  controls.append(title, warning, layerLabel, operationGroup, radiusLabel,
    hardnessLabel, undo, redo, status);
  root.append(controls);
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('class', 'bw-edge-manual-overlay');
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.overflow = 'visible';
  const originalHostPosition = host.style.position;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.append(overlay);
  function imageClaim() {
    if (ownsImage) return;
    savedImage = {tabindex: afterImage.getAttribute('tabindex'), role: afterImage.getAttribute('role'),
      label: afterImage.getAttribute('aria-label'), shortcuts: afterImage.getAttribute('aria-keyshortcuts'),
      touch: afterImage.style.touchAction, outline: afterImage.style.outline,
      outlineOffset: afterImage.style.outlineOffset};
    afterImage.tabIndex = 0;
    afterImage.setAttribute('role', 'button');
    afterImage.setAttribute('aria-label', 'After写真の手動ブラシ。矢印キーで移動、Enterで描画、Escapeで取消');
    afterImage.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape Control+Z Control+Y');
    afterImage.style.touchAction = 'none';
    afterImage.style.outlineOffset = '3px';
    ownsImage = true;
  }
  function imageRelease() {
    if (!ownsImage) return;
    for (const [name, value] of [['tabindex', savedImage.tabindex], ['role', savedImage.role],
      ['aria-label', savedImage.label], ['aria-keyshortcuts', savedImage.shortcuts]]) {
      if (value === null) afterImage.removeAttribute(name); else afterImage.setAttribute(name, value);
    }
    afterImage.style.touchAction = savedImage.touch;
    afterImage.style.outline = savedImage.outline;
    afterImage.style.outlineOffset = savedImage.outlineOffset;
    ownsImage = false; savedImage = null;
  }
  const svg = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  function geometry() {
    if (!enabled || !afterImage.complete || !afterImage.naturalWidth || !afterImage.naturalHeight)
      throw Error('BW_EDGE_UI_AFTER_NOT_READY');
    const supplied = getGeometry();
    if (!supplied || supplied.view === 'before') throw Error('PREVIEW_AFTER_REQUIRED');
    if(supplied.expectedAfterURL&&afterImage.getAttribute('src')!==supplied.expectedAfterURL)throw Error('BRUSH_AFTER_STALE');
    return {...supplied, afterRect: afterImage.getBoundingClientRect(),
      naturalWidth: afterImage.naturalWidth, naturalHeight: afterImage.naturalHeight};
  }
  const typed = () => clone(state);
  const count = value => value.subjectStrokes.length + value.correctionStrokes.length;
  const points = value => [...value.subjectStrokes, ...value.correctionStrokes]
    .reduce((n, stroke) => n + stroke.path.length, 0);
  function render() {
    if (enabled) imageClaim(); else imageRelease();
    add.setAttribute('aria-pressed', String(operation === 'ADD'));
    erase.setAttribute('aria-pressed', String(operation === 'ERASE'));
    undo.disabled = !enabled || changing || cursor === 0;
    redo.disabled = !enabled || changing || cursor === history.length - 1;
    for (const input of [layerSelect, add, erase, radius, hardness]) input.disabled = !enabled || changing;
    overlay.replaceChildren();
    try {
      const g = geometry(), box = afterImage.getBoundingClientRect(), parent = host.getBoundingClientRect();
      overlay.style.left = `${box.left - parent.left}px`;
      overlay.style.top = `${box.top - parent.top}px`;
      overlay.style.width = `${box.width}px`;
      overlay.style.height = `${box.height}px`;
      overlay.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      for(const [role,strokes] of [['subject',state.subjectStrokes],['correction',state.correctionStrokes]])appendProjectedBrushOverlay(overlay,g,strokes,{color:role==='subject'?[34,121,190]:[226,115,50]});
    } catch { /* Stale or Before geometry: never project onto an unverified image. */ }
  }
  function accept(next, notice, nextCursor = null) {
    state = clone(next);
    if (nextCursor === null) {
      history = history.slice(0, cursor + 1);
      history.push(clone(state)); cursor++;
    } else cursor = nextCursor;
    status.textContent = notice;
    render();
  }
  function change(next, notice, nextCursor = null) {
    if (!enabled || changing || disposed) return;
    if (count(next) > MAX_STROKES || points(next) > MAX_POINTS)
      throw Error('BW_EDGE_UI_CAPACITY');
    let result;
    try {result = onChange(clone(next));}
    catch (error) {status.dataset.error = String(error?.message ?? error);
      status.textContent = '下書きへ反映できませんでした。';return;}
    if (!result || typeof result.then !== 'function') {accept(next, notice, nextCursor); return;}
    changing = true;
    const token = ++generation;
    status.textContent = '下書きを確認しています…'; render();
    Promise.resolve(result).then(() => {
      if (disposed || token !== generation || !enabled) return;
      accept(next, notice, nextCursor);
    }, error => {
      if (disposed || token !== generation) return;
      status.dataset.error = String(error?.message ?? error);
      status.textContent = '下書きへ反映できませんでした。';
    }).finally(() => {if (!disposed && token === generation) {changing = false; render();}});
  }
  function commit(next, notice) {change(next, notice);}
  function travel(nextCursor) {
    if (!enabled || changing || nextCursor < 0 || nextCursor >= history.length) return;
    const next = clone(history[nextCursor]);
    change(next, `${nextCursor + 1}/${history.length} 履歴`, nextCursor);
  }
  function addStroke(path) {
    if (!path.length) throw Error('BW_EDGE_UI_EMPTY_STROKE');
    const stroke = {operation, path, radiusFraction: Number(radius.value) / 100,
      hardness: Number(hardness.value) / 100};
    if (!validStroke(stroke)) throw Error('BW_EDGE_UI_STROKE_INVALID');
    const next = typed();
    next[layer === 'subject' ? 'subjectStrokes' : 'correctionStrokes'].push(stroke);
    commit(next, `${layer === 'subject' ? '被写体' : '境界補正'}の${operation === 'ADD' ? '追加' : '消去'}を記録しました。未保存です。`);
  }
  function point(event) {
    const p = mapAfterToLocalBrushPoint({...geometry(), clientX: event.clientX,
      clientY: event.clientY});
    return {u: p.x, v: p.y};
  }
  function stop(event, cancelled) {
    if (!drawing || event.pointerId !== drawing.id) return;
    const draft = drawing; drawing = null;
    try { if (afterImage.hasPointerCapture?.(event.pointerId)) afterImage.releasePointerCapture(event.pointerId); } catch {}
    if (cancelled || draft.invalid) {status.textContent = 'strokeを取消しました。'; return;}
    try {
      const p = point(event);
      if (draft.path.at(-1)?.u !== p.u || draft.path.at(-1)?.v !== p.v) draft.path.push(p);
      addStroke(draft.path);
    } catch (error) {status.dataset.error = String(error?.message ?? error);
      status.textContent = /^PREVIEW_|^LOCAL_BRUSH_/.test(String(error?.message)) ?
        'Afterの実画像外ではstrokeを確定しません。' : 'strokeを反映できませんでした。';}
  }
  afterImage.addEventListener('pointerdown', event => {
    if (changing || drawing || event.isPrimary === false || event.pointerType !== 'touch' && event.button !== 0) return;
    try {
      const p = point(event);
      drawing = {id: event.pointerId, path: [p], invalid: false};
      try {afterImage.setPointerCapture?.(event.pointerId);} catch { /* Synthetic fixture pointers have no native capture. */ }
      event.preventDefault();
    } catch (error) {status.dataset.error = String(error?.message ?? error);
      status.textContent = 'Afterの実画像上のみ描画できます。';}
  }, {signal: abort.signal});
  afterImage.addEventListener('pointermove', event => {
    if (!drawing || event.pointerId !== drawing.id) return;
    try {
      const p = point(event);
      if (drawing.path.length >= MAX_POINTS) {drawing.invalid = true; return;}
      if (Math.abs(p.u - drawing.path.at(-1).u) + Math.abs(p.v - drawing.path.at(-1).v) > .0001)
        drawing.path.push(p);
    } catch {drawing.invalid = true;}
  }, {signal: abort.signal});
  afterImage.addEventListener('pointerup', event => stop(event, false), {signal: abort.signal});
  afterImage.addEventListener('pointercancel', event => stop(event, true), {signal: abort.signal});
  afterImage.addEventListener('focus', () => {if (ownsImage) afterImage.style.outline = '2px solid #174e78';},
    {signal: abort.signal});
  afterImage.addEventListener('blur', () => {if (ownsImage) afterImage.style.outline = savedImage.outline;},
    {signal: abort.signal});
  afterImage.addEventListener('keydown', event => {
    if (!enabled || changing) return;
    if (event.ctrlKey && event.key.toLowerCase() === 'z') {event.preventDefault(); travel(cursor - 1); return;}
    if (event.ctrlKey && event.key.toLowerCase() === 'y') {event.preventDefault(); travel(cursor + 1); return;}
    if (event.key === 'Escape') {drawing = null; status.textContent = 'strokeを取消しました。'; return;}
    const dx = event.key === 'ArrowRight' ? .01 : event.key === 'ArrowLeft' ? -.01 : 0;
    const dy = event.key === 'ArrowDown' ? .01 : event.key === 'ArrowUp' ? -.01 : 0;
    if (dx || dy) {
      event.preventDefault();
      const candidate = {x: Math.max(0, Math.min(1, keyboard.x + dx)),
        y: Math.max(0, Math.min(1, keyboard.y + dy))};
      try {mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX: candidate.x, afterY: candidate.y}); keyboard = candidate;
        status.textContent = `位置 ${Math.round(keyboard.x * 100)}%, ${Math.round(keyboard.y * 100)}%`;}
      catch {status.textContent = '余白・Crop外には移動できません。';}
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      try {const p = mapAfterImagePointToLocalBrushPoint({...geometry(),
        afterX: keyboard.x, afterY: keyboard.y}); addStroke([{u: p.x, v: p.y}]);}
      catch {status.textContent = 'Afterの実画像上のみ描画できます。';}
    }
  }, {signal: abort.signal});
  layerSelect.addEventListener('change', () => {layer = layerSelect.value; render();}, {signal: abort.signal});
  add.addEventListener('click', () => {operation = 'ADD'; render();}, {signal: abort.signal});
  erase.addEventListener('click', () => {operation = 'ERASE'; render();}, {signal: abort.signal});
  undo.addEventListener('click', () => travel(cursor - 1), {signal: abort.signal});
  redo.addEventListener('click', () => travel(cursor + 1), {signal: abort.signal});
  const resize = new ResizeObserver(render);
  resize.observe(afterImage);
  status.textContent = enabled ? 'After上で描画できます。未保存です。' : '権限と写真の確認待ちです。';
  render();
  return Object.freeze({getStrokes: typed, refresh: render,
    setEnabled(value) {enabled = value === true; if (!enabled) {drawing = null; generation++; changing = false;} render();},
    reset(value) {generation++; changing = false; drawing = null;
      state = validateInitial(value); history = [clone(state)]; cursor = 0;
      status.textContent = count(state) ? 'Recipeの二層範囲を読み込みました。' : '未描画です。二層とも下書きから始めてください。'; render();},
    setNotice(value) {status.textContent = String(value);},
    dispose() {
      disposed = true; generation++; abort.abort(); resize.disconnect(); overlay.remove(); controls.remove();
      imageRelease();
      host.style.position = originalHostPosition;
    }});
}
