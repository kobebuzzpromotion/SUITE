import { COSPLAY_PRESETS, renderCosplayPreset, exportCosplayPreset } from './cosplay-preset-library.mjs';

const byID = (id) => document.getElementById(id);
const controls = Object.fromEntries(['preset', 'seed', 'color', 'opacity', 'width', 'height'].map((id) => [id, byID(id)]));
const canvas = byID('preview');
const exportButton = byID('export');
const status = byID('status');
const downloadBox = byID('downloads');
let revision = 0;
let settings = null;
let urls = [];

function invalidateDownloads() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls = [];
  downloadBox.hidden = true;
  for (const id of ['png-download', 'manifest-download']) {
    byID(id).removeAttribute('href');
    byID(id).removeAttribute('download');
  }
}

function readSettings() {
  for (const control of Object.values(controls)) {
    if (!control.checkValidity() || control.value === '') throw new Error('設定値を入力範囲内で指定してください。');
  }
  const next = {
    presetID: controls.preset.value,
    width: Number(controls.width.value), height: Number(controls.height.value),
    seed: Number(controls.seed.value), color: controls.color.value,
    opacity: Number(controls.opacity.value),
  };
  if (!Number.isInteger(next.width) || !Number.isInteger(next.height) || !Number.isInteger(next.seed)) throw new Error('幅・高さ・バリエーション番号は整数にしてください。');
  if (next.width * next.height > 8_000_000) throw new Error('幅×高さを8,000,000画素以内にしてください。');
  return next;
}

function refresh() {
  revision += 1;
  invalidateDownloads();
  settings = null;
  exportButton.disabled = true;
  exportButton.textContent = 'PNGと素材情報を準備';
  const preset = COSPLAY_PRESETS.find((item) => item.id === controls.preset.value);
  byID('description').textContent = preset?.description ?? '';
  byID('contract').textContent = preset?.kind === 'background'
    ? '背景素材：PNGと素材情報をセットで保存できます。既存Apple版への取り込みは手動です。取り込み時の利用許可確認は別途必要です。写真には自動反映しません。'
    : '演出素材：透過PNGです。背景とは別の素材契約で、既存Apple版の背景取り込み対象ではありません。人物の前後配置・合成への接続は別工程です。';
  try {
    const next = readSettings();
    renderCosplayPreset(canvas, next);
    settings = next;
    canvas.setAttribute('aria-label', `${preset.label}のプレビュー、${next.width}×${next.height}px`);
    exportButton.disabled = false;
    status.textContent = `${preset.label}を作成しました。設定を変えると保存用ファイルを再作成します。`;
  } catch (error) {
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.setAttribute('aria-label', '設定エラーのためプレビューなし');
    status.textContent = `作成できません：${error.message}`;
  }
}

for (const kind of ['background', 'overlay']) {
  const group = document.createElement('optgroup');
  group.label = kind === 'background' ? '背景' : '演出（透過素材）';
  for (const preset of COSPLAY_PRESETS.filter((item) => item.kind === kind)) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    group.append(option);
  }
  controls.preset.append(group);
}
for (const control of Object.values(controls)) control.addEventListener('input', refresh);

exportButton.addEventListener('click', async () => {
  if (!settings || exportButton.disabled) return;
  const requestedRevision = revision;
  const snapshot = { ...settings };
  invalidateDownloads();
  exportButton.disabled = true;
  exportButton.textContent = '保存用ファイルを準備中…';
  status.textContent = 'PNGと素材情報を端末内で作成しています。';
  // Use a dedicated pixel snapshot: changing the preview during toBlob must not
  // pair old metadata with new pixels, even before the stale result is discarded.
  const source = document.createElement('canvas');
  source.width = canvas.width;
  source.height = canvas.height;
  try {
    source.getContext('2d').drawImage(canvas, 0, 0);
    const result = await exportCosplayPreset(source, snapshot);
    if (revision !== requestedRevision) return;
    const pngURL = URL.createObjectURL(result.png);
    urls.push(pngURL);
    const manifestURL = URL.createObjectURL(new Blob([JSON.stringify(result.manifest, null, 2)], { type: 'application/json' }));
    urls.push(manifestURL);
    const pngLink = byID('png-download');
    const manifestLink = byID('manifest-download');
    pngLink.href = pngURL;
    pngLink.download = result.fileName;
    manifestLink.href = manifestURL;
    manifestLink.download = result.fileName.replace(/\.png$/i, '') + '.json';
    downloadBox.hidden = false;
    status.textContent = '準備できました。PNGと素材情報JSONをそれぞれ保存してください。自動アップロードはありません。';
  } catch (error) {
    if (revision !== requestedRevision) return;
    invalidateDownloads();
    status.textContent = `保存用ファイルを作成できません：${error.message}`;
  } finally {
    source.width = 1;
    source.height = 1;
    if (revision === requestedRevision) {
      exportButton.disabled = !settings;
      exportButton.textContent = 'PNGと素材情報を準備';
    }
  }
});
window.addEventListener('pagehide', () => { revision += 1; invalidateDownloads(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) refresh(); });
refresh();
