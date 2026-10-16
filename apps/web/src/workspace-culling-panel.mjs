import {WorkspaceCullingClient, WorkspaceCullingHTTPError} from './workspace-culling-client.mjs';
import {applyWorkspaceCullingBulkTag, applyWorkspaceCullingBulkMark,
  applyWorkspaceCullingBulkSegment} from './workspace-culling-bulk-tags.mjs';
import {inspectWorkspaceCullingXMPSidecar} from './workspace-culling-xmp-import.mjs';

/** Node Workspace only. No Trial/Cloud D1, AI culling or Editor binding is implied. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max &&
  value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);

export function parseCullingTags(value) {
  if (typeof value !== 'string') throw Error('CULLING_PANEL_TAGS_INVALID');
  const tags = value.split(/\r?\n/u).filter(item => item !== '');
  if (tags.length > 32 || tags.some(item => !text(item, 120)) || new Set(tags).size !== tags.length)
    throw Error('CULLING_PANEL_TAGS_INVALID');
  return tags;
}

export function cullingPanelGate({phase, version, assetId, mark} = {}) {
  if (phase !== 'ready') return phase === 'denied' ? 'CULLING_PANEL_ACCESS_DENIED' :
    phase === 'conflict' ? 'CULLING_PANEL_REFRESH_REQUIRED' :
    phase === 'uncertain' ? 'CULLING_PANEL_RESULT_UNVERIFIED' : 'CULLING_PANEL_NOT_READY';
  if (!Number.isSafeInteger(version) || version < 0 || mark?.assetId !== assetId)
    return 'CULLING_PANEL_IDENTITY_INVALID';
  return null;
}

const style = `.suite-culling-panel{box-sizing:border-box;max-width:100%;min-width:0;padding:1.25rem;border:1px solid #d4d0c8;background:#fff;color:#262521;font:14px/1.5 system-ui,sans-serif}
.suite-culling-panel *{box-sizing:border-box}.suite-culling-panel h2{font:normal clamp(1.4rem,3vw,2rem)/1.2 Georgia,serif;margin:0 0 .5rem}
.suite-culling-panel__scope{margin:0 0 1rem;overflow-wrap:anywhere;font-size:.82rem;color:#4e4b46}
.suite-culling-panel__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem;min-width:0}
.suite-culling-panel label{display:grid;gap:.3rem;min-width:0}.suite-culling-panel input,.suite-culling-panel select,.suite-culling-panel textarea{width:100%;max-width:100%;min-width:0;min-height:44px;padding:.55rem;border:1px solid #8b8882;border-radius:0;background:#fff;color:#262521;font:inherit}
.suite-culling-panel textarea{min-height:6rem;resize:vertical}.suite-culling-panel__actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem}
.suite-culling-panel button{min-height:44px;min-width:44px;padding:.5rem .85rem;border:1px solid #554f47;border-radius:0;background:#fff;color:#262521;font:inherit;cursor:pointer}
.suite-culling-panel button:disabled{cursor:not-allowed;opacity:.55}.suite-culling-panel :focus-visible{outline:3px solid #1a5b87;outline-offset:2px}
.suite-culling-panel__status{min-height:2.3em;margin:.85rem 0 0;overflow-wrap:anywhere}
.suite-culling-panel__segment{margin-top:1.2rem;padding-top:1rem;border-top:1px solid #d4d0c8}
.suite-culling-panel__segment-controls{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:.7rem}
.suite-culling-panel__segment-controls>*{flex:1 1 9rem}
.suite-culling-panel__filter-results{display:grid;gap:.45rem;margin-top:.8rem;max-height:22rem;overflow:auto}
.suite-culling-panel__filter-results label{display:flex;align-items:center;gap:.65rem;min-height:44px;padding:.35rem;border-bottom:1px solid #e9e6e0;overflow-wrap:anywhere}
.suite-culling-panel__filter-results input{flex:0 0 22px;width:22px;min-height:22px;height:22px}
@media(max-width:600px){.suite-culling-panel{padding:.8rem}.suite-culling-panel__grid{grid-template-columns:minmax(0,1fr)}.suite-culling-panel__actions>*{flex:1 1 11rem}}`;

function element(doc, tag, value) {
  const node = doc.createElement(tag);
  if (value !== undefined) node.textContent = value;
  return node;
}
function labeled(doc, name, control) {
  const label = element(doc, 'label', name);
  label.append(control);
  return label;
}
function option(doc, value, label) {
  const item = element(doc, 'option', label);
  item.value = value;
  return item;
}

/**
 * Mount a single, explicitly scoped manual-mark panel. tokenProvider must be
 * supplied by the Node Workspace host and yield a live bearer token per call.
 * No token is retained or rendered. Returns {refresh,dispose,getState}.
 */
export function mountWorkspaceCullingPanel({container, baseURL, tokenProvider, workspaceId, projectId,
  assetId, fetchImpl, preflightEnabled = false, xmpProvider, xmpImportProvider, bulkTagHost} = {}) {
  if (!container || typeof container.replaceChildren !== 'function' ||
      typeof tokenProvider !== 'function' || [workspaceId, projectId, assetId].some(id =>
        typeof id !== 'string' || !UUID.test(id)) ||
      xmpProvider !== undefined && typeof xmpProvider !== 'function' ||
      xmpImportProvider !== undefined && typeof xmpImportProvider !== 'function')
    throw Error('CULLING_PANEL_CONFIG_INVALID');
  if (bulkTagHost !== undefined && (!bulkTagHost ||
      typeof bulkTagHost.expectedSubject !== 'string' ||
      typeof bulkTagHost.expectedTenantId !== 'string' ||
      typeof bulkTagHost.assertHostSelection !== 'function')) throw Error('CULLING_PANEL_CONFIG_INVALID');
  const client = new WorkspaceCullingClient({baseURL, tokenProvider, ...(fetchImpl ? {fetchImpl} : {})});
  const doc = container.ownerDocument ?? globalThis.document;
  if (!doc || typeof doc.createElement !== 'function') throw Error('CULLING_PANEL_DOCUMENT_REQUIRED');
  const root = element(doc, 'section');root.className = 'suite-culling-panel';
  root.setAttribute('aria-label', 'Node Workspace 手動写真選別');
  const css = element(doc, 'style', style);
  const title = element(doc, 'h2', '手動写真選別');
  const note = element(doc, 'p', 'Node Workspace の認証済み保存先のみ。AI自動選別、Trial Editor、Cloud D1には未接続です。');
  const scope = element(doc, 'p', `Workspace ${workspaceId} · Project ${projectId} · Asset ${assetId}`);
  scope.className = 'suite-culling-panel__scope';
  const form = element(doc, 'form');
  const grid = element(doc, 'div');grid.className = 'suite-culling-panel__grid';
  const rating = element(doc, 'select');rating.setAttribute('aria-label', '星の数');
  for (let i = 0; i <= 5; i++) rating.append(option(doc, String(i), `${i} 星`));
  const flag = element(doc, 'select');flag.setAttribute('aria-label', 'Flag');
  for (const [value, label] of [['none', 'なし'], ['pick', '採用'], ['reject', '除外']])
    flag.append(option(doc, value, label));
  const colorLabel = element(doc, 'input');colorLabel.setAttribute('aria-label', '手動カラーラベル');
  colorLabel.setAttribute('placeholder', '例：赤、確認待ち');colorLabel.maxLength = 120;
  const tags = element(doc, 'textarea');tags.setAttribute('aria-label', 'タグ（1行に1件）');
  tags.setAttribute('placeholder', 'タグを1行に1件');
  const segment = element(doc, 'select');segment.setAttribute('aria-label', 'Story Segment');
  grid.append(labeled(doc, 'Stars', rating), labeled(doc, 'Flag', flag),
    labeled(doc, 'カラーラベル（空欄で解除）', colorLabel),
    labeled(doc, 'Tags · 1行に1件', tags), labeled(doc, 'Story Segment', segment));
  const actions = element(doc, 'div');actions.className = 'suite-culling-panel__actions';
  const save = element(doc, 'button', 'この写真のマークを保存');save.type = 'submit';
  const refreshButton = element(doc, 'button', 'サーバーから再取得');refreshButton.type = 'button';
  const cancel = element(doc, 'button', '通信を取消');cancel.type = 'button';
  const xmpButton = xmpProvider ? element(doc, 'button', 'この写真のXMPを取得') : null;
  if (xmpButton) {xmpButton.type = 'button';xmpButton.setAttribute('aria-label', 'この写真のXMP sidecarを取得');}
  actions.append(save, refreshButton, cancel, ...(xmpButton ? [xmpButton] : []));form.append(grid, actions);
  const xmpImportSection=xmpImportProvider?element(doc,'section'):null;
  const xmpImportFile=xmpImportProvider?element(doc,'input'):null;
  const xmpInspectButton=xmpImportProvider?element(doc,'button','XMP内容を確認'):null;
  const xmpApplyButton=xmpImportProvider?element(doc,'button','確認したXMPをこの写真へ適用'):null;
  const xmpImportPreview=xmpImportProvider?element(doc,'p','XMPは未確認です。'):null;
  if(xmpImportSection){
    xmpImportSection.className='suite-culling-panel__segment';
    xmpImportFile.type='file';xmpImportFile.accept='.xmp,application/rdf+xml,application/xml,text/xml';
    xmpImportFile.setAttribute('aria-label','この写真へ取り込むXMP sidecar');
    xmpInspectButton.type='button';xmpApplyButton.type='button';
    xmpImportPreview.setAttribute('aria-live','polite');
    xmpImportSection.append(element(doc,'h3','この写真のXMP sidecarを取り込む'),
      element(doc,'p',`対象Asset ${assetId}。Rating 0〜5・非空Labelのみ。Reject・Pick等は取り込まず、Flag/Tags/Segmentを保持します。`),
      labeled(doc,'XMP sidecar',xmpImportFile),xmpInspectButton,xmpImportPreview,xmpApplyButton);
  }
  const segmentForm = element(doc, 'form');segmentForm.className = 'suite-culling-panel__segment';
  const segmentHeading = element(doc, 'h3', 'Story Segment を追加');
  const segmentGrid = element(doc, 'div');segmentGrid.className = 'suite-culling-panel__grid';
  const segmentId = element(doc, 'input');segmentId.setAttribute('aria-label', '新規Segment ID');segmentId.maxLength = 128;
  const segmentName = element(doc, 'input');segmentName.setAttribute('aria-label', '新規Segment名');segmentName.maxLength = 120;
  segmentGrid.append(labeled(doc, 'ID', segmentId), labeled(doc, '名前', segmentName));
  const create = element(doc, 'button', 'Segment を保存');create.type = 'submit';
  segmentForm.append(segmentHeading, segmentGrid, create);
  const manage = element(doc, 'section');manage.className = 'suite-culling-panel__segment';
  const manageHeading = element(doc, 'h3', 'Story Segment の名前と順序');
  const manageGrid = element(doc, 'div');manageGrid.className = 'suite-culling-panel__grid';
  const manageSelect = element(doc, 'select');manageSelect.setAttribute('aria-label', '管理するSegment');
  const renameInput = element(doc, 'input');renameInput.setAttribute('aria-label', '変更後のSegment名');
  renameInput.maxLength = 120;
  manageGrid.append(labeled(doc, 'Segment', manageSelect), labeled(doc, '新しい名前', renameInput));
  const manageActions = element(doc, 'div');manageActions.className = 'suite-culling-panel__segment-controls';
  const rename = element(doc, 'button', '名前を変更');rename.type = 'button';
  const moveUp = element(doc, 'button', '前へ移動');moveUp.type = 'button';
  const moveDown = element(doc, 'button', '後へ移動');moveDown.type = 'button';
  manageActions.append(rename, moveUp, moveDown);manage.append(manageHeading, manageGrid, manageActions);
  const filterSection = element(doc, 'section');filterSection.className = 'suite-culling-panel__segment';
  const filterHeading = element(doc, 'h3', '保存済み写真を手動で絞り込む');
  const filterNote = element(doc, 'p', 'Project全件を同じ版で確認します。選択は手動のみで、Final出力には未接続です。');
  const filterGrid = element(doc, 'div');filterGrid.className = 'suite-culling-panel__grid';
  const starsFilter = element(doc, 'select');starsFilter.setAttribute('aria-label', 'Starsで絞り込む');
  starsFilter.append(option(doc, '', 'すべてのStars'), ...Array.from({length: 6}, (_, i) => option(doc, String(i), `${i} 星のみ`)));
  const flagFilter = element(doc, 'select');flagFilter.setAttribute('aria-label', 'Flagで絞り込む');
  flagFilter.append(option(doc, '', 'すべてのFlag'), option(doc, 'none', 'なし'), option(doc, 'pick', '採用'), option(doc, 'reject', '除外'));
  const colorFilter = element(doc, 'select');colorFilter.setAttribute('aria-label', 'カラーラベルで絞り込む');
  const segmentFilter = element(doc, 'select');segmentFilter.setAttribute('aria-label', 'Segmentで絞り込む');
  const tagFilter = element(doc, 'select');tagFilter.setAttribute('aria-label', '保存済みTagで絞り込む');
  tagFilter.append(option(doc, '', 'すべてのTag'));
  const filterMode = element(doc, 'select');filterMode.setAttribute('aria-label', '絞り込み条件の組合せ');
  filterMode.append(option(doc, 'and', 'すべて一致（AND）'), option(doc, 'or', 'いずれか一致（OR）'));
  filterGrid.append(labeled(doc, 'Stars', starsFilter), labeled(doc, 'Flag', flagFilter),
    labeled(doc, 'カラーラベル', colorFilter), labeled(doc, 'Story Segment', segmentFilter),
    labeled(doc, '保存済みTag', tagFilter), labeled(doc, '条件の組合せ', filterMode));
  const filterActions = element(doc, 'div');filterActions.className = 'suite-culling-panel__actions';
  const loadAll = element(doc, 'button', 'Project全件を取得');loadAll.type = 'button';
  const confirmSelection = element(doc, 'button', '選択を再確認');confirmSelection.type = 'button';
  const preflight = element(doc, 'button', '出力前の参考照合（最大20枚）');preflight.type = 'button';
  filterActions.append(loadAll, confirmSelection, preflight);
  const filterCount = element(doc, 'p', '全件未確認。');filterCount.setAttribute('aria-live', 'polite');
  const filterResults = element(doc, 'div');filterResults.className = 'suite-culling-panel__filter-results';
  filterResults.setAttribute('role', 'group');filterResults.setAttribute('aria-label', '絞り込み結果から写真を明示選択');
  filterSection.append(filterHeading, filterNote, filterGrid, filterActions, filterCount, filterResults);
  const bulkTagSection = bulkTagHost ? element(doc, 'section') : null;
  const bulkTagInput = bulkTagHost ? element(doc, 'input') : null;
  const bulkTagAction = bulkTagHost ? element(doc, 'select') : null;
  const bulkTagButton = bulkTagHost ? element(doc, 'button', '選択写真にTagを適用') : null;
  const bulkTagResults = bulkTagHost ? element(doc, 'ol') : null;
  const bulkMarkSection = bulkTagHost ? element(doc, 'section') : null;
  const bulkMarkField = bulkTagHost ? element(doc, 'select') : null;
  const bulkRating = bulkTagHost ? element(doc, 'select') : null;
  const bulkFlag = bulkTagHost ? element(doc, 'select') : null;
  const bulkColor = bulkTagHost ? element(doc, 'input') : null;
  const bulkMarkButton = bulkTagHost ? element(doc, 'button', '選択写真にRating・Flag・Colorを適用') : null;
  const bulkMarkResults = bulkTagHost ? element(doc, 'ol') : null;
  const bulkSegmentSection = bulkTagHost ? element(doc, 'section') : null;
  const bulkSegmentSelect = bulkTagHost ? element(doc, 'select') : null;
  const bulkSegmentButton = bulkTagHost ? element(doc, 'button', '選択写真にSegmentを適用') : null;
  const bulkSegmentResults = bulkTagHost ? element(doc, 'ol') : null;
  if (bulkTagSection) {
    bulkTagSection.className = 'suite-culling-panel__segment';
    bulkTagInput.setAttribute('aria-label', '一括適用するTag');bulkTagInput.maxLength = 120;
    bulkTagAction.setAttribute('aria-label', 'Tagの一括操作');
    bulkTagAction.append(option(doc, 'add', '追加'), option(doc, 'remove', '除去'));
    bulkTagAction.value = 'add';
    bulkTagButton.type = 'button';
    bulkTagResults.setAttribute('aria-label', '一括Tagの写真別結果');
    bulkTagResults.setAttribute('aria-live', 'polite');
    bulkTagSection.append(element(doc, 'h3', '明示選択した2〜20枚のTag'),
      element(doc, 'p', '写真ごとに保存します。途中失敗はロールバックされず、再取得が必要です。'),
      labeled(doc, 'Tag', bulkTagInput),labeled(doc, '操作', bulkTagAction),
      bulkTagButton,bulkTagResults);
  }
  if (bulkMarkSection) {
    bulkMarkSection.className = 'suite-culling-panel__segment';
    bulkMarkField.setAttribute('aria-label', '一括変更する項目');
    bulkMarkField.append(option(doc,'rating','Rating'),option(doc,'flag','Flag'),
      option(doc,'colorLabel','Color Label'));
    bulkMarkField.value='rating';
    bulkRating.setAttribute('aria-label', '一括Rating');
    for(let value=0;value<=5;value++)bulkRating.append(option(doc,String(value),`${value} 星`));
    bulkRating.value='0';
    bulkFlag.setAttribute('aria-label', '一括Flag');
    for(const [value,label] of [['none','なし'],['pick','採用'],['reject','除外']])
      bulkFlag.append(option(doc,value,label));
    bulkFlag.value='none';
    bulkColor.setAttribute('aria-label', '一括Color Label');bulkColor.maxLength=120;
    bulkColor.setAttribute('placeholder','空欄で解除');
    bulkMarkButton.type='button';
    bulkMarkResults.setAttribute('aria-label','一括Rating・Flag・Colorの写真別結果');
    bulkMarkResults.setAttribute('aria-live','polite');
    const markGrid=element(doc,'div');markGrid.className='suite-culling-panel__grid';
    markGrid.append(labeled(doc,'変更項目',bulkMarkField),labeled(doc,'Rating',bulkRating),
      labeled(doc,'Flag',bulkFlag),labeled(doc,'Color Label',bulkColor));
    bulkMarkSection.append(element(doc,'h3','明示選択した2〜20枚のRating・Flag・Color'),
      element(doc,'p','1回に変更する項目は1種類だけです。その他のマークとTagは保持します。'),
      markGrid,bulkMarkButton,bulkMarkResults);
  }
  if (bulkSegmentSection) {
    bulkSegmentSection.className='suite-culling-panel__segment';
    bulkSegmentSelect.setAttribute('aria-label','一括割当するSegment');
    bulkSegmentSelect.append(option(doc,'','割当先を選択してください'));
    bulkSegmentSelect.value='';
    bulkSegmentButton.type='button';
    bulkSegmentResults.setAttribute('aria-label','一括Segmentの写真別結果');
    bulkSegmentResults.setAttribute('aria-live','polite');
    bulkSegmentSection.append(element(doc,'h3','明示選択した2〜20枚のStory Segment'),
      element(doc,'p','保存済みSegmentか「未割当」を明示選択してください。途中失敗はロールバックされません。'),
      labeled(doc,'割当先',bulkSegmentSelect),bulkSegmentButton,bulkSegmentResults);
  }
  const status = element(doc, 'p', 'サーバーから取得中。');status.className = 'suite-culling-panel__status';
  status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');status.tabIndex = -1;
  root.append(css, title, note, scope, form, ...(xmpImportSection?[xmpImportSection]:[]),
    segmentForm, manage, filterSection,
    ...(bulkTagSection ? [bulkTagSection,bulkMarkSection,bulkSegmentSection] : []),status);
  container.replaceChildren(root);

  let phase = 'loading', version = null, mark = null, segments = [], managedSegmentId = '';
  let allMarks = [], listVersion = null, listReady = false, preflightReference = null;
  const selectedAssetIds = new Set();
  let disposed = false, active = null, requestSerial = 0;
  let xmpURL = null, xmpTimer = null;
  let chosenXMPFile=null,pendingXMP=null;
  const identity = {workspaceId, projectId, assetId};
  function clearXMPURL() {
    if (xmpTimer !== null) {clearTimeout(xmpTimer);xmpTimer = null;}
    if (xmpURL !== null) {
      (doc.defaultView?.URL ?? globalThis.URL).revokeObjectURL(xmpURL);xmpURL = null;
    }
  }
  function clearXMPImport(){
    chosenXMPFile=null;pendingXMP=null;
    if(xmpImportFile)xmpImportFile.value='';
    if(xmpImportPreview)xmpImportPreview.textContent='XMPは未確認です。';
  }
  function invalidateList() {
    clearXMPImport();
    allMarks = [];listVersion = null;listReady = false;selectedAssetIds.clear();preflightReference = null;
    tagFilter.replaceChildren(option(doc, '', 'すべてのTag'));tagFilter.value = '';filterMode.value = 'and';
    bulkTagResults?.replaceChildren();
    bulkMarkResults?.replaceChildren();
    bulkSegmentResults?.replaceChildren();
    if (bulkSegmentSelect) bulkSegmentSelect.value='';
    filterResults.replaceChildren();filterCount.textContent = '全件未確認。';
  }
  function matchesFilter(item) {
    const predicates = [];
    // Keep the existing exact-Star UI contract. The pure helper's minRating
    // predicate is a different filter and must not silently change this one.
    if (starsFilter.value !== '') predicates.push(item.rating === Number(starsFilter.value));
    if (flagFilter.value !== '') predicates.push(item.flag === flagFilter.value);
    if (colorFilter.value !== '') predicates.push(colorFilter.value === 'none' ? item.colorLabel === null :
      item.colorLabel !== null && colorFilter.value === `value:${encodeURIComponent(item.colorLabel)}`);
    if (segmentFilter.value !== '') predicates.push(segmentFilter.value === 'none' ? item.segmentId === null :
      item.segmentId !== null && segmentFilter.value === `value:${encodeURIComponent(item.segmentId)}`);
    if (tagFilter.value !== '') predicates.push(item.tags.some(tag =>
      tagFilter.value === `value:${encodeURIComponent(tag)}`));
    return predicates.length === 0 || (filterMode.value === 'or' ? predicates.some(Boolean) : predicates.every(Boolean));
  }
  function updateFilterCount() {
    const matching = allMarks.filter(matchesFilter).length;
    filterCount.textContent = listReady ? `${matching}件が一致 · ${selectedAssetIds.size}件を明示選択 · Project version ${listVersion}` : '全件未確認。';
    confirmSelection.disabled = !listReady || selectedAssetIds.size === 0 || phase !== 'ready' || active !== null;
    preflight.disabled = !preflightEnabled || !listReady || listVersion !== version ||
      selectedAssetIds.size < 1 || selectedAssetIds.size > 20 || phase !== 'ready' || active !== null;
    if (bulkTagButton) bulkTagButton.disabled = !listReady || listVersion !== version ||
      selectedAssetIds.size < 2 || selectedAssetIds.size > 20 || phase !== 'ready' || active !== null;
    if (bulkMarkButton) bulkMarkButton.disabled = !listReady || listVersion !== version ||
      selectedAssetIds.size < 2 || selectedAssetIds.size > 20 || phase !== 'ready' || active !== null;
    if (bulkSegmentButton) bulkSegmentButton.disabled = !listReady || listVersion !== version ||
      selectedAssetIds.size < 2 || selectedAssetIds.size > 20 || phase !== 'ready' || active !== null ||
      bulkSegmentSelect.value==='';
  }
  function renderResults() {
    const entries = allMarks.filter(matchesFilter).map(item => {
      const checkbox = element(doc, 'input');checkbox.type = 'checkbox';checkbox.checked = selectedAssetIds.has(item.assetId);
      checkbox.setAttribute('aria-label', `写真 ${item.assetId} を選択`);
      checkbox.disabled = phase !== 'ready' || active !== null;
      checkbox.addEventListener('change', () => {
        if (!listReady || phase !== 'ready' || active || listVersion !== version) {checkbox.checked = false;return;}
        clearXMPURL();
        bulkTagResults?.replaceChildren();
        bulkMarkResults?.replaceChildren();
        bulkSegmentResults?.replaceChildren();
        if (checkbox.checked) selectedAssetIds.add(item.assetId); else selectedAssetIds.delete(item.assetId);
        preflightReference = null;
        updateFilterCount();
      });
      const label = element(doc, 'label', `${item.assetId} · ${item.rating}星 · ${item.flag} · ${item.colorLabel ?? 'ラベルなし'}`);
      label.append(checkbox);return label;
    });
    filterResults.replaceChildren(...entries);updateFilterCount();
  }
  function render() {
    if (disposed) return;
    const enabled = cullingPanelGate({phase, version, assetId, mark}) === null;
    for (const control of [rating, flag, colorLabel, tags, segment, save, segmentId,
      segmentName, create, manageSelect, renameInput, rename, moveUp, moveDown])
      control.disabled = !enabled;
    refreshButton.disabled = phase === 'loading' || phase === 'busy' || phase === 'denied';
    cancel.disabled = active === null && xmpURL === null && chosenXMPFile===null && pendingXMP===null;
    if (xmpButton) xmpButton.disabled = !enabled || active !== null;
    if(xmpImportFile){
      xmpImportFile.disabled=!enabled||active!==null;
      xmpInspectButton.disabled=!enabled||active!==null||chosenXMPFile===null;
      xmpApplyButton.disabled=!enabled||active!==null||pendingXMP===null||pendingXMP.version!==version;
    }
    segment.replaceChildren(option(doc, '', '未割当'), ...segments.map(item => option(doc, item.id, `${item.name} · ${item.id}`)));
    if (mark) segment.value = mark.segmentId ?? '';
    manageSelect.replaceChildren(option(doc, '', 'Segmentを選択'),
      ...segments.map(item => option(doc, item.id, `${item.name} · ${item.id}`)));
    manageSelect.value = managedSegmentId;
    const managedIndex = segments.findIndex(item => item.id === managedSegmentId);
    rename.disabled = !enabled || managedIndex < 0;
    moveUp.disabled = !enabled || managedIndex < 1;
    moveDown.disabled = !enabled || managedIndex < 0 || managedIndex === segments.length - 1;
    loadAll.disabled = !enabled || active !== null;
    for (const control of [starsFilter, flagFilter, colorFilter, segmentFilter, tagFilter, filterMode])
      control.disabled = !enabled || !listReady || active !== null;
    if (bulkTagInput) bulkTagInput.disabled = !enabled || !listReady || active !== null;
    if (bulkTagAction) bulkTagAction.disabled = !enabled || !listReady || active !== null;
    if (bulkMarkField) {
      bulkMarkField.disabled = !enabled || !listReady || active !== null;
      bulkRating.disabled = bulkMarkField.disabled || bulkMarkField.value !== 'rating';
      bulkFlag.disabled = bulkMarkField.disabled || bulkMarkField.value !== 'flag';
      bulkColor.disabled = bulkMarkField.disabled || bulkMarkField.value !== 'colorLabel';
    }
    if (bulkSegmentSelect) {
      const chosen=bulkSegmentSelect.value;
      const options=[option(doc,'','割当先を選択してください'),option(doc,'unassigned','未割当へ変更'),
        ...segments.map(item=>option(doc,`value:${encodeURIComponent(item.id)}`,`${item.name} · ${item.id}`))];
      bulkSegmentSelect.replaceChildren(...options);
      bulkSegmentSelect.value=options.some(item=>item.value===chosen)?chosen:'';
      bulkSegmentSelect.disabled=!enabled || !listReady || active!==null;
    }
    for (const label of filterResults.children) label.children[0].disabled = !enabled || !listReady || active !== null;
    updateFilterCount();
  }
  function adopt(versionValue, markValue, segmentsValue) {
    if (markValue?.assetId !== assetId || !Number.isSafeInteger(versionValue) || versionValue < 0 ||
        !Array.isArray(segmentsValue) || (markValue.segmentId !== null &&
          !segmentsValue.some(item => item.id === markValue.segmentId)))
      throw Error('CULLING_PANEL_RESPONSE_MISMATCH');
    version = versionValue;mark = markValue;segments = segmentsValue;invalidateList();
    if (!segments.some(item => item.id === managedSegmentId)) managedSegmentId = '';
    renameInput.value = segments.find(item => item.id === managedSegmentId)?.name ?? '';
    rating.value = String(mark.rating);flag.value = mark.flag;
    colorLabel.value = mark.colorLabel ?? '';tags.value = mark.tags.join('\n');
    phase = 'ready';render();
  }
  function failure(error, wasWrite) {
    invalidateList();
    if (error instanceof WorkspaceCullingHTTPError && [401, 403].includes(error.status)) {
      phase = 'denied';status.textContent = `${error.status} — 認証またはWorkspace権限がありません。${wasWrite ? '保存結果は未確認です。' : '保存操作はできません。'}`;
    } else if (error instanceof WorkspaceCullingHTTPError && error.status === 409 ||
        error?.message === 'CULLING_PANEL_VERSION_CONFLICT') {
      phase = 'conflict';status.textContent = wasWrite ?
        '409 — 版競合。保存されていません。再取得して入力し直してください。' :
        'Project・Asset・Recipeの版または原本識別が変わりました。明示選択を破棄し、再取得するまで操作を停止します。';
    } else if (error?.message === 'CULLING_PANEL_PROJECT_TOO_LARGE') {
      phase = 'error';status.textContent = 'Projectが1万件を超えました。全件確認できないため、手動選択を停止します。';
    } else if (['CULLING_XMP_MARK_UNREPRESENTABLE','CULLING_XMP_FLAG_MAPPING_UNVERIFIED'].includes(error?.message)) {
      phase = 'error';status.textContent = 'この写真のFlag・Tags・Segmentは確認済みXMP項目へ安全に変換できません。取得していません。';
    } else if (error?.name === 'AbortError' && !wasWrite) {
      phase = 'error';status.textContent = '取得を取り消しました。再取得するまで操作を停止します。';
    } else if (error?.name === 'AbortError' || wasWrite) {
      phase = 'uncertain';status.textContent = '保存結果は未確認です。再取得するまで追加操作を停止します。';
    } else {
      phase = 'error';status.textContent = '取得できませんでした。接続・権限を確認し、再取得してください。';
    }
    render();status.focus();
  }
  async function operation(work, {write = false, preserveList = false, acceptAbortedResult = false} = {}) {
    if (disposed || active) return;
    const controller = new AbortController(), serial = ++requestSerial;
    clearXMPURL();
    active = controller;phase = 'busy';if (write && !preserveList) invalidateList();
    status.textContent = write ? '保存とサーバー再確認の実行中。' : 'サーバーから取得中。';render();
    try {
      await work(controller.signal);
      if (controller.signal.aborted && !acceptAbortedResult)
        throw new DOMException('Culling request cancelled', 'AbortError');
    } catch (error) {
      if (!disposed && serial === requestSerial) failure(error, write);
    } finally {
      if (active === controller) active = null;
      if (!disposed) render();
    }
  }
  async function readSnapshot(signal) {
    const page = await client.getProjectPage({workspaceId, projectId, limit: 1, signal});
    const asset = await client.getAssetMark({...identity, signal});
    if (page.workspaceId !== workspaceId || page.projectId !== projectId ||
        page.version !== asset.version) throw Error('CULLING_PANEL_SNAPSHOT_CONFLICT');
    return {page, asset};
  }
  async function readAllPages(signal) {
    const scan = async () => {
      const marks = [], seen = new Set();
      let after = null, first = null, pages = 0;
      do {
        if (++pages > 50) throw Error('CULLING_PANEL_PROJECT_TOO_LARGE');
        const page = await client.getProjectPage({workspaceId, projectId, limit: 200, after, signal});
        if (!first) first = page;
        if (page.version !== first.version || JSON.stringify(page.segments) !== JSON.stringify(first.segments))
          throw Error('CULLING_PANEL_VERSION_CONFLICT');
        for (const item of page.marks) {
          if (seen.has(item.assetId) || marks.length && marks.at(-1).assetId >= item.assetId)
            throw Error('CULLING_PANEL_PAGE_IDENTITY_INVALID');
          seen.add(item.assetId);marks.push(item);
        }
        after = page.nextAfter;
      } while (after !== null);
      return {version: first.version, segments: first.segments, marks};
    };
    // Compare two complete traversals in addition to the Asset-set CAS version.
    // Neither scan nor the later preflight is Final authority.
    const first = await scan(), second = await scan();
    const current = await client.getAssetMark({...identity, signal});
    if (second.version !== first.version || current.version !== first.version ||
        JSON.stringify(second.segments) !== JSON.stringify(first.segments) ||
        JSON.stringify(second.marks) !== JSON.stringify(first.marks) || current.mark.assetId !== assetId)
      throw Error('CULLING_PANEL_VERSION_CONFLICT');
    return first;
  }
  async function refresh() {
    if (disposed || active || phase === 'denied') return;
    return operation(async signal => {
      const {page, asset} = await readSnapshot(signal);
      if (signal.aborted) throw new DOMException('Culling request cancelled', 'AbortError');
      adopt(asset.version, asset.mark, page.segments);
      status.textContent = `サーバーから取得済み · Project version ${version}`;
    });
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (cullingPanelGate({phase, version, assetId, mark}) !== null || active) return;
    let nextTags;
    try {nextTags = parseCullingTags(tags.value);} catch {
      status.textContent = 'タグ入力が不正です。1行に1件、最大32件、重複なしで入力してください。';status.focus();return;
    }
    const selectedColor = colorLabel.value === '' ? null : colorLabel.value;
    if (selectedColor !== null && !text(selectedColor, 120)) {
      status.textContent = 'カラーラベルは前後の空白や制御文字を含めず、120文字以内にしてください。';status.focus();return;
    }
    const fields = {rating: Number(rating.value), flag: flag.value, colorLabel: selectedColor,
      tags: nextTags, segmentId: segment.value || null};
    void operation(async signal => {
      const result = await client.saveAssetMark({...identity, baseVersion: version, ...fields, signal});
      if (signal.aborted) throw new DOMException('Culling request cancelled', 'AbortError');
      const {page, asset} = await readSnapshot(signal);
      if (page.version !== result.version ||
          JSON.stringify(asset.mark) !== JSON.stringify(result.mark))
        throw Error('CULLING_PANEL_SAVE_UNVERIFIED');
      adopt(asset.version, asset.mark, page.segments);
      status.textContent = `サーバーへ保存済み · Project version ${version}`;status.focus();
    }, {write: true});
  });
  segmentForm.addEventListener('submit', event => {
    event.preventDefault();
    if (cullingPanelGate({phase, version, assetId, mark}) !== null || active) return;
    const newId = segmentId.value, newName = segmentName.value;
    if (!text(newId, 128) || !text(newName, 120) || segments.some(item => item.id === newId)) {
      status.textContent = 'Segment IDまたは名前が不正・重複しています。';status.focus();return;
    }
    void operation(async signal => {
      const result = await client.createSegment({workspaceId, projectId, baseVersion: version,
        id: newId, name: newName, signal});
      if (signal.aborted) throw new DOMException('Culling request cancelled', 'AbortError');
      const {page, asset} = await readSnapshot(signal);
      if (page.version !== result.version ||
          !page.segments.some(item => item.id === result.segment.id && item.name === result.segment.name))
        throw Error('CULLING_PANEL_SEGMENT_UNVERIFIED');
      managedSegmentId = result.segment.id;
      adopt(asset.version, asset.mark, page.segments);
      segmentId.value = '';segmentName.value = '';
      status.textContent = `Segmentをサーバーへ保存済み · Project version ${version}`;status.focus();
    }, {write: true});
  });
  manageSelect.addEventListener('change', () => {
    managedSegmentId = manageSelect.value;
    renameInput.value = segments.find(item => item.id === managedSegmentId)?.name ?? '';
    render();
  });
  rename.addEventListener('click', () => {
    if (cullingPanelGate({phase, version, assetId, mark}) !== null || active) return;
    const selected = segments.find(item => item.id === managedSegmentId), name = renameInput.value;
    if (!selected || !text(name, 120)) {
      status.textContent = '変更するSegmentと有効な名前を選択してください。';status.focus();return;
    }
    void operation(async signal => {
      const result = await client.renameSegment({workspaceId, projectId,
        segmentId: selected.id, baseVersion: version, name, signal});
      const {page, asset} = await readSnapshot(signal);
      if (page.version !== result.version ||
          page.segments.find(item => item.id === selected.id)?.name !== name)
        throw Error('CULLING_PANEL_SEGMENT_UNVERIFIED');
      adopt(asset.version, asset.mark, page.segments);
      status.textContent = `Segment名をサーバーへ保存済み · Project version ${version}`;status.focus();
    }, {write: true});
  });
  function moveSegment(direction) {
    if (cullingPanelGate({phase, version, assetId, mark}) !== null || active) return;
    const index = segments.findIndex(item => item.id === managedSegmentId), next = index + direction;
    if (index < 0 || next < 0 || next >= segments.length) return;
    const orderedIds = segments.map(item => item.id);
    [orderedIds[index], orderedIds[next]] = [orderedIds[next], orderedIds[index]];
    void operation(async signal => {
      const result = await client.reorderSegments({workspaceId, projectId,
        baseVersion: version, orderedIds, signal});
      const {page, asset} = await readSnapshot(signal);
      if (page.version !== result.version ||
          JSON.stringify(page.segments.map(item => item.id)) !== JSON.stringify(orderedIds))
        throw Error('CULLING_PANEL_SEGMENT_UNVERIFIED');
      adopt(asset.version, asset.mark, page.segments);
      status.textContent = `Segment順序をサーバーへ保存済み · Project version ${version}`;status.focus();
    }, {write: true});
  }
  moveUp.addEventListener('click', () => moveSegment(-1));
  moveDown.addEventListener('click', () => moveSegment(1));
  loadAll.addEventListener('click', () => {
    if (cullingPanelGate({phase, version, assetId, mark}) !== null || active) return;
    invalidateList();
    void operation(async signal => {
      const snapshot = await readAllPages(signal);
      if (snapshot.version !== version || JSON.stringify(snapshot.segments) !== JSON.stringify(segments))
        throw Error('CULLING_PANEL_VERSION_CONFLICT');
      allMarks = snapshot.marks;listVersion = snapshot.version;listReady = true;
      starsFilter.value = '';flagFilter.value = '';
      colorFilter.replaceChildren(option(doc, '', 'すべてのカラーラベル'), option(doc, 'none', 'ラベルなし'),
        ...[...new Set(allMarks.map(item => item.colorLabel).filter(value => value !== null))]
          .sort((a, b) => a.localeCompare(b)).map(value => option(doc, `value:${encodeURIComponent(value)}`, value)));
      segmentFilter.replaceChildren(option(doc, '', 'すべてのSegment'), option(doc, 'none', '未割当'),
        ...segments.map(item => option(doc, `value:${encodeURIComponent(item.id)}`, `${item.name} · ${item.id}`)));
      tagFilter.replaceChildren(option(doc, '', 'すべてのTag'),
        ...[...new Set(allMarks.flatMap(item => item.tags))].sort((a, b) => a.localeCompare(b))
          .map(value => option(doc, `value:${encodeURIComponent(value)}`, value)));
      colorFilter.value = '';segmentFilter.value = '';tagFilter.value = '';filterMode.value = 'and';
      phase = 'ready';render();renderResults();
      status.textContent = `Project全${allMarks.length}件をサーバーで確認済み · version ${listVersion}。Final出力には未接続です。`;
    });
  });
  for (const control of [starsFilter, flagFilter, colorFilter, segmentFilter, tagFilter, filterMode])
    control.addEventListener('change', () => {
      if (!listReady || phase !== 'ready' || active) return;
      clearXMPURL();
      bulkTagResults?.replaceChildren();
      bulkMarkResults?.replaceChildren();
      bulkSegmentResults?.replaceChildren();
      selectedAssetIds.clear();renderResults();
      preflightReference = null;
      status.textContent = '絞込を変更したため、明示選択を解除しました。';
    });
  confirmSelection.addEventListener('click', () => {
    if (!listReady || listVersion !== version || selectedAssetIds.size === 0 ||
        cullingPanelGate({phase, version, assetId, mark}) !== null || active) return;
    const chosen = [...selectedAssetIds];
    preflightReference = null;
    void operation(async signal => {
      const snapshot = await readAllPages(signal);
      if (snapshot.version !== listVersion || snapshot.version !== version ||
          JSON.stringify(snapshot.segments) !== JSON.stringify(segments) ||
          JSON.stringify(snapshot.marks) !== JSON.stringify(allMarks) ||
          chosen.some(id => !snapshot.marks.some(item => item.assetId === id && matchesFilter(item))))
        throw Error('CULLING_PANEL_VERSION_CONFLICT');
      phase = 'ready';render();
      status.textContent = `${chosen.length}件の明示選択をProject version ${version}で再確認しました。Final出力には未接続です。`;
      status.focus();
    });
  });
  preflight.addEventListener('click', () => {
    if (!preflightEnabled || !listReady || listVersion !== version || selectedAssetIds.size < 1 ||
        selectedAssetIds.size > 20 || cullingPanelGate({phase, version, assetId, mark}) !== null || active) return;
    const chosen = [...selectedAssetIds], expectedVersion = listVersion;
    preflightReference = null;
    void operation(async signal => {
      // This re-scan is only a freshness check for the UI. The server performs
      // the actual same-transaction SHA, Recipe-head and export-role preflight.
      const snapshot = await readAllPages(signal);
      if (snapshot.version !== expectedVersion || JSON.stringify(snapshot.marks) !== JSON.stringify(allMarks) ||
          chosen.some(id => !snapshot.marks.some(item => item.assetId === id && matchesFilter(item))) ||
          JSON.stringify(chosen) !== JSON.stringify([...selectedAssetIds]))
        throw Error('CULLING_PANEL_VERSION_CONFLICT');
      const reference = await client.preflightExportSelection({workspaceId, projectId,
        expectedCullingVersion: expectedVersion, orderedAssetIds: chosen, signal});
      if (signal.aborted || reference.authoritativeForFinal !== false ||
          JSON.stringify(reference.orderedAssets.map(item => item.assetId)) !== JSON.stringify(chosen) ||
          JSON.stringify(chosen) !== JSON.stringify([...selectedAssetIds]))
        throw Error('CULLING_PANEL_VERSION_CONFLICT');
      preflightReference = {version: expectedVersion, count: chosen.length};
      phase = 'ready';render();
      status.textContent = `${chosen.length}件を出力前に参考照合しました。Final出力の許可ではなく、直前の再確認が必要です。`;
      status.focus();
    });
  });
  function startBulkChange(apply, change, results, label) {
    if (!listReady || listVersion !== version || selectedAssetIds.size < 2 ||
        selectedAssetIds.size > 20 || cullingPanelGate({phase,version,assetId,mark}) !== null || active) return;
    const chosen = [...selectedAssetIds], expectedVersion = listVersion;
    void operation(async signal => {
      const result = await apply({baseURL,tokenProvider,
        selectionProvider:async()=>{
          await bulkTagHost.assertHostSelection({signal});
          return {workspaceId,projectId,orderedAssetIds:[...selectedAssetIds]};
        },workspaceId,projectId,orderedAssetIds:chosen,
        expectedSubject:bulkTagHost.expectedSubject,expectedTenantId:bulkTagHost.expectedTenantId,
        expectedCullingVersion:expectedVersion,...change,signal,...(fetchImpl?{fetchImpl}:{})});
      if (disposed || result.authoritativeForFinal !== false ||
          result.orderedResults?.length !== chosen.length ||
          result.orderedResults.some((item,index)=>item.assetId!==chosen[index]))
        throw Error('CULLING_PANEL_BULK_RESULT_INVALID');
      const lines = result.orderedResults.map(item=>{
        const label={saved:'保存確認',unchanged:'変更なし',conflict:'版競合',denied:'権限拒否',
          unverified:'結果未確認',not_attempted:'未着手'}[item.status];
        if (!label) throw Error('CULLING_PANEL_BULK_RESULT_INVALID');
        return element(doc,'li',`${item.assetId} · ${label}`);
      });
      invalidateList();results.replaceChildren(...lines);
      phase = result.status === 'COMPLETE_AT_READ_TIME' ? 'reload' :
        result.stoppedReason === 'ACCESS_DENIED' ? 'denied' :
        result.stoppedReason === 'VERSION_CONFLICT' ? 'conflict' : 'uncertain';
      const confirmed=result.orderedResults.filter(item=>item.status==='saved').length;
      status.textContent = result.status === 'COMPLETE_AT_READ_TIME' ?
        `${confirmed}件の${label}保存を読取時点で確認しました。Projectを再取得するまで追加操作を停止します。` :
        `${confirmed}件のみ${label}保存を確認。残りは競合・失効・取消・通信不確定のため、写真別結果を確認してProjectを再取得してください。`;
      render();status.focus();
    },{write:true,preserveList:true,acceptAbortedResult:true});
  }
  bulkTagButton?.addEventListener('click', () => {
    const tag = bulkTagInput.value, action = bulkTagAction.value;
    if (!text(tag,120) || !['add','remove'].includes(action)) {
      status.textContent = 'Tagは前後の空白や制御文字を含めず、120文字以内で入力してください。';
      status.focus();return;
    }
    startBulkChange(applyWorkspaceCullingBulkTag,{tag,action},bulkTagResults,'Tag');
  });
  bulkMarkField?.addEventListener('change',render);
  bulkMarkButton?.addEventListener('click', () => {
    const field=bulkMarkField.value;
    const value=field==='rating'&&['0','1','2','3','4','5'].includes(bulkRating.value)?
      Number(bulkRating.value):field==='flag'&&['none','pick','reject'].includes(bulkFlag.value)?
        bulkFlag.value:field==='colorLabel'&&(bulkColor.value===''||text(bulkColor.value,120))?
          (bulkColor.value===''?null:bulkColor.value):undefined;
    if (value===undefined) {
      status.textContent='Rating・Flag・Color Labelのうち1項目の有効な値を指定してください。';
      status.focus();return;
    }
    const label={rating:'Rating',flag:'Flag',colorLabel:'Color Label'}[field];
    startBulkChange(applyWorkspaceCullingBulkMark,{field,value},bulkMarkResults,label);
  });
  bulkSegmentSelect?.addEventListener('change',updateFilterCount);
  bulkSegmentButton?.addEventListener('click', () => {
    const chosen=bulkSegmentSelect.value;
    const segmentId=chosen==='unassigned'?null:
      segments.find(item=>chosen===`value:${encodeURIComponent(item.id)}`)?.id;
    if (segmentId===undefined) {
      status.textContent='保存済みSegmentまたは「未割当」を明示選択してください。';
      status.focus();return;
    }
    startBulkChange(applyWorkspaceCullingBulkSegment,{segmentId},bulkSegmentResults,'Segment');
  });
  xmpButton?.addEventListener('click', () => {
    if (cullingPanelGate({phase, version, assetId, mark}) !== null || active) return;
    const expectedVersion = version, expectedMark = JSON.stringify(mark);
    void operation(async signal => {
      const result = await xmpProvider({expectedCullingVersion: expectedVersion, signal});
      if (signal.aborted || disposed) throw new DOMException('XMP request cancelled', 'AbortError');
      if (version !== expectedVersion || JSON.stringify(mark) !== expectedMark ||
          result?.assetId !== assetId || result.cullingVersion !== expectedVersion ||
          result.status !== 'VERIFIED_AT_READ_TIME_ONLY' || result.authoritativeForFinal !== false ||
          result.mimeType !== 'application/rdf+xml' || result.extension !== '.xmp' ||
          !(result.bytes instanceof Uint8Array) || result.bytes.length < 1 || result.bytes.length > 4096)
        throw Error('CULLING_PANEL_XMP_RESULT_INVALID');
      const urlAPI = doc.defaultView?.URL ?? globalThis.URL;
      if (typeof urlAPI?.createObjectURL !== 'function' || typeof urlAPI?.revokeObjectURL !== 'function')
        throw Error('CULLING_PANEL_XMP_DOWNLOAD_UNAVAILABLE');
      const blob = new (doc.defaultView?.Blob ?? globalThis.Blob)([result.bytes], {type: result.mimeType});
      xmpURL = urlAPI.createObjectURL(blob);
      if (signal.aborted || disposed) {
        clearXMPURL();throw new DOMException('XMP request cancelled', 'AbortError');
      }
      const link = element(doc, 'a', 'XMP sidecar');
      link.href = xmpURL;link.download = `SUITE-culling-${assetId}.xmp`;
      root.append(link);
      try {link.click();} catch (error) {clearXMPURL();throw error;} finally {link.remove();}
      xmpTimer = setTimeout(() => {clearXMPURL();render();}, 30_000);xmpTimer.unref?.();
      phase = 'ready';render();
      status.textContent = 'XMP sidecarの取得を開始しました。Node Workspaceの読取時点のみの確認です。';
      status.focus();
    });
  });
  xmpImportFile?.addEventListener('change',()=>{
    pendingXMP=null;xmpImportPreview.textContent='XMPは未確認です。';
    chosenXMPFile=xmpImportFile.files?.length===1?xmpImportFile.files[0]:null;
    render();
  });
  xmpInspectButton?.addEventListener('click',()=>{
    if(cullingPanelGate({phase,version,assetId,mark})!==null||active||!chosenXMPFile)return;
    const file=chosenXMPFile,expectedVersion=version;
    clearXMPImport();
    void operation(async signal=>{
      if(!Number.isSafeInteger(file.size)||file.size<1||file.size>4096){
        phase='ready';render();status.textContent='XMPは4KiB以内の単一sidecarに限ります。';status.focus();return;
      }
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(signal.aborted||disposed)throw new DOMException('XMP preview cancelled','AbortError');
      let preview;
      try{preview=inspectWorkspaceCullingXMPSidecar(bytes);}catch(error){
        if(!error?.message?.startsWith('CULLING_XMP_IMPORT_'))throw error;
        phase='ready';render();
        status.textContent='XMPの形式・値が未対応です。Rating 0〜5と非空Labelだけを確認してください。保存していません。';
        status.focus();return;
      }
      if(version!==expectedVersion||cullingPanelGate({phase:'ready',version,assetId,mark})!==null)
        throw Error('CULLING_PANEL_VERSION_CONFLICT');
      pendingXMP={preview,version:expectedVersion,markJSON:JSON.stringify(mark)};
      xmpImportPreview.textContent=`確認内容: ${preview.fields.includes('rating')?`Rating ${preview.rating}`:'Ratingは変更なし'} · `+
        `${preview.fields.includes('colorLabel')?`Label ${preview.label}`:'Labelは変更なし'} · Flag/Tags/Segmentは変更なし。`;
      phase='ready';render();
      status.textContent='XMP内容を確認しました。保存はまだ行っていません。適用するには別のボタンを押してください。';
      status.focus();
    });
  });
  xmpApplyButton?.addEventListener('click',()=>{
    if(cullingPanelGate({phase,version,assetId,mark})!==null||active||!pendingXMP||
        pendingXMP.version!==version||pendingXMP.markJSON!==JSON.stringify(mark))return;
    const chosen=pendingXMP,expectedMark=mark;
    void operation(async signal=>{
      const result=await xmpImportProvider({preview:chosen.preview,
        expectedCullingVersion:chosen.version,signal,
        // This callback exists only within the distinct, explicit Apply click.
        // The verified Node host still supplies all identity and permission evidence.
        confirmImport:async({preview})=>!signal.aborted&&!disposed&&preview===chosen.preview?preview:null});
      if(disposed||result?.assetId!==assetId||result.expectedCullingVersion!==chosen.version||
          result.authoritativeForFinal!==false)throw Error('CULLING_PANEL_XMP_IMPORT_RESULT_INVALID');
      invalidateList();
      if(result.status==='CONFLICT_RELOAD_REQUIRED'||result.status==='UNVERIFIED_RELOAD_REQUIRED'){
        phase=result.status==='CONFLICT_RELOAD_REQUIRED'?'conflict':'uncertain';
        status.textContent=phase==='conflict'?
          'XMP適用は版競合です。保存されていません。再取得して確認し直してください。':
          'XMP適用の保存結果は未確認です。再取得するまで追加操作を停止します。';
        render();status.focus();return;
      }
      if(!['VERIFIED_SAVED_AT_READ_TIME','UNCHANGED_AT_READ_TIME'].includes(result.status)||
          result.confirmedVersion!==(result.status==='VERIFIED_SAVED_AT_READ_TIME'?chosen.version+1:chosen.version))
        throw Error('CULLING_PANEL_XMP_IMPORT_RESULT_INVALID');
      const {page,asset}=await readSnapshot(signal);
      const expected={...expectedMark};
      if(chosen.preview.fields.includes('rating'))expected.rating=chosen.preview.rating;
      if(chosen.preview.fields.includes('colorLabel'))expected.colorLabel=chosen.preview.label;
      if(page.version!==result.confirmedVersion||asset.version!==result.confirmedVersion||
          JSON.stringify(asset.mark)!==JSON.stringify(expected))
        throw Error('CULLING_PANEL_XMP_IMPORT_READBACK_CHANGED');
      adopt(asset.version,asset.mark,page.segments);
      status.textContent=result.status==='VERIFIED_SAVED_AT_READ_TIME'?
        'XMPのRating/Labelだけを保存し、再読込で確認しました。Flag/Tags/Segmentは保持しています。':
        'XMPのRating/Labelは既に同じ値です。保存変更はありません。';
      status.focus();
    },{write:true,preserveList:true,acceptAbortedResult:true});
  });
  refreshButton.addEventListener('click', () => {void refresh();});
  cancel.addEventListener('click', () => {clearXMPURL();clearXMPImport();if (active) active.abort();render();});
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (active||chosenXMPFile||pendingXMP)) {
      event.preventDefault();clearXMPURL();clearXMPImport();active?.abort();render();
    }
  });
  render();void refresh();
  return Object.freeze({refresh, getState: () => Object.freeze({phase, version, workspaceId, projectId, assetId,
    mark, segments: Object.freeze([...segments]), loadedMarkCount: listReady ? allMarks.length : null,
    selectedCount: listReady ? selectedAssetIds.size : 0,
    preflightStatus: preflightReference ? 'reference-checked' : 'unchecked',
    preflightCount: preflightReference?.count ?? 0}), dispose: () => {
    if (disposed) return;disposed = true;active?.abort();clearXMPURL();invalidateList();container.replaceChildren();
  }});
}
