/** Read-only caller evidence resolver. Never downloads, runs inference, uploads,
 * or grants permission. Missing browser RAM/thermal evidence stays unknown.
 * Fields mirror LocalAICapability and LocalFaceModelStatus where applicable. */
const permission = value => ['confirmed','denied'].includes(value) ? value : 'unreviewed';
const tri = value => typeof value === 'boolean' ? value : null;
const bytes = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export function resolveLocalAIRuntimeStatus(input = {}) {
  const device = input.device ?? {}, runtime = input.runtime ?? {};
  const blockers = [];
  const add = (code, description, modelID) => blockers.push({code,description,...(modelID ? {modelID} : {})});
  const operatingSystemSupported = tri(device.operatingSystemSupported);
  const availableWorkingBytes = bytes(device.availableWorkingBytes);
  const requiredWorkingBytes = bytes(runtime.requiredWorkingBytes);
  const thermal = ['nominal','fair','serious','critical'].includes(device.thermal) ? device.thermal : 'unknown';
  const included = tri(runtime.included), connected = tri(runtime.connected);
  if (operatingSystemSupported !== true) add(operatingSystemSupported === false ? 'operatingSystemUnsupported' : 'operatingSystemUnknown','端末の対応条件が未確認または非対応です。');
  if (included !== true) add('runtimeUnavailable','ローカル推論runtimeが未組込または未確認です。');
  if (connected !== true) add('runtimeNotConnected','ローカル推論の呼び出し接続が未完了または未確認です。');
  if (availableWorkingBytes === null || requiredWorkingBytes === null) add('memoryBudgetUnknown','作業メモリ予算が未確認です。');
  else if (availableWorkingBytes < requiredWorkingBytes) add('insufficientMemory','作業メモリ予算が不足しています。');
  if (thermal === 'unknown') add('thermalUnknown','端末の温度状態が未確認です。');
  else if (['serious','critical'].includes(thermal)) add('thermalPressure','温度が回復するまで処理を停止します。');

  // An empty requirement list cannot accidentally declare an asset-free runtime.
  const ids = input.requiredAssetIDs;
  const validIDs = Array.isArray(ids) && ids.length > 0 && ids.length <= 64 &&
    ids.every(id => typeof id === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(id)) && new Set(ids).size === ids.length;
  if (!validIDs) add('requiredAssetsUnknown','必要な固定版モデル一覧が未確定です。');
  const models = (validIDs ? ids : []).map(modelID => {
    const value = Object.hasOwn(input.models ?? {}, modelID) ? input.models[modelID] : {};
    const installed = tri(value?.installed), hashVerified = tri(value?.hashVerified);
    const commercialUse = permission(value?.commercialUse), redistribution = permission(value?.redistribution);
    const storage = installed === null ? 'unknown' : installed === false ? 'notInstalled' : hashVerified === true ? 'bytesVerified' : hashVerified === false ? 'inconsistent' : 'unverified';
    if (storage !== 'bytesVerified') add('assetNotVerified','モデル未導入、または固定版SHA-256照合が未完了・不一致です。',modelID);
    if (commercialUse !== 'confirmed') add('commercialUseNotConfirmed','商用利用条件の確認記録が必要です。',modelID);
    // Redistribution is shown separately: local execution is not permission to bundle.
    return {modelID,installed,hashVerified,storage,commercialUse,redistribution};
  });
  const cost = ['noPerUseCharge','paidGeneration'].includes(input.cost) ? input.cost : 'unknown';
  if (cost !== 'noPerUseCharge') add(cost === 'paidGeneration' ? 'paidGenerationRequiresSeparateFlow' : 'costUnknown','生成料金は別の明示操作で扱います。自動実行しません。');
  const codePresent = tri(input.codePresent), manualAvailable = input.manualAvailable === true;
  if (codePresent !== true) add('codeNotConfirmed','必要コードの存在が未確認です。');
  return freeze({schemaVersion:1,codePresent,
    device:{operatingSystemSupported,availableWorkingBytes,thermal},
    runtime:{included,connected,requiredWorkingBytes},models,cost,blockers,
    status:blockers.length ? 'blocked' : 'prerequisitesReportedReady',
    canRunLocally:blockers.length === 0,
    manualFallback:{available:manualAvailable,suggested:blockers.length > 0 && manualAvailable},
    automaticCloudFallback:false,inferenceCompleted:false,operationAllowed:false,
    redistributionReady:models.length > 0 && models.every(model => model.redistribution === 'confirmed'),
    evidence:'callerProvided',description:'前提状態の報告です。モデル読込・推論成功・配布承認を意味しません。'});
}
