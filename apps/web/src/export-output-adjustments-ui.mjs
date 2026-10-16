import {validateOutputSharpening} from './export-output-adjustments.mjs';

// This is an export-only draft form. It does not read or write a photo Recipe.
// Manual and named modes are SUITE-specific. Screen/Print strengths use the
// kernel's provisional values, not another product's undocumented pixel output.
const DEFAULT_MANUAL = Object.freeze({kind: 'manual', gain: 1, radiusPx: 1, thresholdLuma: 0});
let nextFormId = 0;

function element(document, tag, {className, text, attributes = {}} = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function numericField(document, {id, name, label, min, max, value, describedBy}) {
  const wrapper = element(document, 'label', {className: 'suite-export-output-field', text: label, attributes: {for: id}});
  const input = element(document, 'input', {attributes: {
    id, name, type: 'number', min, max, step: 'any', inputmode: 'decimal', required: '',
    'aria-describedby': describedBy,
  }});
  input.value = String(value);
  wrapper.append(input);
  return {wrapper, input};
}

/**
 * Build a native, keyboard-operable form whose only committed value is the
 * validated `outputSharpening` option passed to `onApply(settings)`.
 * `onCancel` may abort an external export; this component never creates one.
 */
export function createExportOutputAdjustmentsForm({
  document = globalThis.document,
  initial = {kind: 'none'},
  onApply,
  onCancel = () => {},
  disabled = false,
} = {}) {
  if (!document || typeof document.createElement !== 'function') throw Error('OUTPUT_SHARPENING_FORM_DOCUMENT_REQUIRED');
  if (typeof onApply !== 'function' || typeof onCancel !== 'function') throw Error('OUTPUT_SHARPENING_FORM_CALLBACK_INVALID');
  const starting = validateOutputSharpening(initial);
  const manualStart = starting.kind === 'manual' ? starting : DEFAULT_MANUAL;
  const id = `suite-export-output-${++nextFormId}`;
  const helpId = `${id}-help`;
  const form = element(document, 'form', {className: 'suite-export-output-form', attributes: {
    'aria-label': '出力時のシャープ調整', 'aria-describedby': helpId, novalidate: '',
  }});
  const modeFieldset = element(document, 'fieldset');
  modeFieldset.append(element(document, 'legend', {text: '出力時のシャープ調整'}));
  const radios = {};
  for (const [kind, label] of [['none', '追加しない'], ['screen', '画面用（Screen）'], ['print', '印刷用（Print）'], ['manual', '手動で調整']]) {
    const option = element(document, 'label', {className: 'suite-export-output-mode'});
    const radio = element(document, 'input', {attributes: {type: 'radio', name: `${id}-mode`, value: kind}});
    radio.value = kind;
    radio.checked = starting.kind === kind;
    option.append(radio, document.createTextNode(label));
    modeFieldset.append(option);
    radios[kind] = radio;
  }
  const help = element(document, 'p', {text:
    '画面用・印刷用はSUITE独自の暫定値、手動値もSUITE独自の出力専用設定です。他社公式Screen/Printの画素再現ではなく、写真のRecipeには保存しません。印刷用はプリンター・用紙・PPIの自動補正ではありません。',
    attributes: {id: helpId}});
  const strengthFieldset = element(document, 'fieldset');
  strengthFieldset.append(element(document, 'legend', {text: '画面用・印刷用の強さ'}));
  const strengthLabel = element(document, 'label', {text: '強さ', attributes: {for: `${id}-strength`}});
  const strengthInput = element(document, 'select', {attributes: {
    id: `${id}-strength`, name: 'strength', 'aria-describedby': helpId,
  }});
  for (const [value, label] of [['low', '低（Low）'], ['standard', '標準（Standard）'], ['high', '高（High）']]) {
    strengthInput.append(element(document, 'option', {text: label, attributes: {value}}));
  }
  strengthInput.value = starting.strength ?? 'standard';
  strengthLabel.append(strengthInput);
  strengthFieldset.append(strengthLabel);
  const manualFieldset = element(document, 'fieldset');
  manualFieldset.append(element(document, 'legend', {text: '手動の出力シャープ設定'}));
  const specs = [
    {name: 'gain', label: '強さ', min: 0, max: 2},
    {name: 'radiusPx', label: '半径（出力画素）', min: 0.5, max: 3},
    {name: 'thresholdLuma', label: 'しきい値（輝度）', min: 0, max: 64},
  ];
  const inputs = {};
  for (const spec of specs) {
    const {wrapper, input} = numericField(document, {
      ...spec, id: `${id}-${spec.name}`, value: manualStart[spec.name], describedBy: helpId,
    });
    inputs[spec.name] = input;
    manualFieldset.append(wrapper);
  }
  const actions = element(document, 'div', {className: 'suite-export-output-actions'});
  const applyButton = element(document, 'button', {text: 'この設定で書き出す', attributes: {type: 'submit'}});
  const cancelButton = element(document, 'button', {text: '取消', attributes: {type: 'button'}});
  actions.append(applyButton, cancelButton);
  const status = element(document, 'p', {attributes: {role: 'status', 'aria-live': 'polite'}});
  form.append(modeFieldset, strengthFieldset, manualFieldset, help, actions, status);

  let baseline = starting;
  let externallyDisabled = Boolean(disabled);
  let pending = false;
  let destroyed = false;
  function updateState() {
    modeFieldset.disabled = externallyDisabled || pending;
    strengthFieldset.disabled = externallyDisabled || pending || !(radios.screen.checked || radios.print.checked);
    manualFieldset.disabled = externallyDisabled || pending || !radios.manual.checked;
    applyButton.disabled = externallyDisabled || pending;
    // Cancellation remains available while an asynchronous export is pending.
    cancelButton.disabled = externallyDisabled;
    form.setAttribute('aria-busy', pending ? 'true' : 'false');
  }
  function getSettings() {
    if (radios.none.checked) return validateOutputSharpening({kind: 'none'});
    if (radios.screen.checked || radios.print.checked)
      return validateOutputSharpening({kind: radios.screen.checked ? 'screen' : 'print', strength: strengthInput.value});
    if (!radios.manual.checked) throw Error('OUTPUT_SHARPENING_FORM_MODE_INVALID');
    const values = {kind: 'manual'};
    for (const {name} of specs) {
      const raw = inputs[name].value.trim();
      if (raw === '') throw Error('OUTPUT_SHARPENING_FORM_VALUE_REQUIRED_' + name.toUpperCase());
      values[name] = Number(raw);
    }
    return validateOutputSharpening(values);
  }
  function setSettings(value) {
    if (externallyDisabled || pending || destroyed)
      throw Error('OUTPUT_SHARPENING_FORM_NOT_SETTABLE');
    // Validate the entire object before touching the visible draft. In
    // particular, no external preset name or unknown key is accepted.
    const settings = validateOutputSharpening(value);
    baseline = settings;
    for (const [kind, radio] of Object.entries(radios)) radio.checked = settings.kind === kind;
    strengthInput.value = settings.strength ?? 'standard';
    const values = settings.kind === 'manual' ? settings : DEFAULT_MANUAL;
    for (const {name} of specs) inputs[name].value = String(values[name]);
    status.textContent = '';
    updateState();
    return getSettings();
  }
  function restoreDraft() {
    for (const [kind, radio] of Object.entries(radios)) radio.checked = baseline.kind === kind;
    strengthInput.value = baseline.strength ?? 'standard';
    const values = baseline.kind === 'manual' ? baseline : DEFAULT_MANUAL;
    for (const {name} of specs) inputs[name].value = String(values[name]);
    status.textContent = '';
    updateState();
  }
  function cancel() {
    if (externallyDisabled || destroyed) return;
    restoreDraft();
    onCancel();
    radios[baseline.kind].focus();
  }
  for (const radio of Object.values(radios)) radio.addEventListener('change', () => {
    status.textContent = '';
    updateState();
  });
  strengthInput.addEventListener('change', () => { status.textContent = ''; });
  cancelButton.addEventListener('click', cancel);
  form.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || externallyDisabled) return;
    event.preventDefault();
    cancel();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (externallyDisabled || pending || destroyed) return;
    let settings;
    try { settings = getSettings(); }
    catch {
      status.textContent = '入力値を確認してください。';
      const firstInvalid = radios.manual.checked && specs.find(({name, min, max}) => {
        const raw = inputs[name].value.trim(), value = Number(raw);
        return raw === '' || !Number.isFinite(value) || value < min || value > max;
      });
      (radios.screen.checked || radios.print.checked ? strengthInput : firstInvalid ? inputs[firstInvalid.name] : radios.manual).focus();
      return;
    }
    pending = true;
    status.textContent = '';
    updateState();
    try { await onApply(settings); }
    catch { status.textContent = '書き出しを開始できませんでした。'; }
    finally { pending = false; updateState(); }
  });
  updateState();
  return Object.freeze({
    element: form,
    getSettings,
    setSettings,
    setDisabled(value) { externallyDisabled = Boolean(value); updateState(); },
    focus() { radios[baseline.kind].focus(); },
    destroy() { destroyed = true; form.remove(); },
  });
}
