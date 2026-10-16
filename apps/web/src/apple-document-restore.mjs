import {readAppleLocalEditJSON} from './apple-local-edit-import.mjs';
import {preflightCrossDeviceCapabilities} from './cross-device-capabilities.mjs';

/** Only exact, shared neutral/quarter-turn operations may enter the canonical
 * Web renderer. Native local edits remain in the dedicated preview; do not
 * flatten their pixels or discard them to make an import appear successful. */
export function prepareAppleDocumentRestore(originalJSON) {
  const imported=readAppleLocalEditJSON(originalJSON,{preflight:preflightCrossDeviceCapabilities});
  const doc=imported.document;
  if(!doc.asset||!doc.history)throw Error('APPLE_RESTORE_PHOTO_BINDING_REQUIRED');
  const parameters=structuredClone(doc.history.entries[doc.history.cursor].parameters);
  if(parameters.exposure!==0||parameters.contrast!==1||parameters.saturation!==1||
      parameters.rotationDegrees%90!==0||
      !parameters.extendedParameters||Array.isArray(parameters.extendedParameters)||
      Object.keys(parameters.extendedParameters).length||
      !Array.isArray(parameters.processingOrder)||
      new Set(parameters.processingOrder).size!==parameters.processingOrder.length||
      parameters.processingOrder.some(stage=>!['exposure','contrast','saturation','rotation'].includes(stage))||
      parameters.rotationDegrees%360!==0&&!parameters.processingOrder.includes('rotation'))
    throw Error('APPLE_RESTORE_CANONICAL_RENDERER_UNSUPPORTED');
  // Shared Web renderer enforces this order. Neutral stages carry no effect;
  // retaining their native ordering would fail its strict order validator.
  parameters.processingOrder=['exposure','contrast','saturation','rotation'];
  return {
    recipe:{schemaVersion:1,parameters},
    binding:{assetID:doc.asset.id,originalSHA256:doc.asset.sha256.toLowerCase()},
    preservedOriginalJSON:imported.originalJSON,
    preservedHistoryCount:imported.historyCount,
    sourceCursor:doc.history.cursor,
    sourceRevision:doc.revision,
    interpretation:'exact-neutral-quarter-turn',
  };
}

/** Host commit must atomically recheck currentBinding/photo/rights and append
 * to existing Undo history (never replace it); persistence uses its usual CAS.
 * The original Apple text is returned intact, including unselected branches.
 * No rendered proxy is saved as an original and no native extension is aliased. */
export function createAppleDocumentRestoreSession({authorize,commit,subscribeContext}={}) {
  if([authorize,commit,subscribeContext].some(fn=>typeof fn!=='function'))
    throw Error('APPLE_RESTORE_HOST_REQUIRED');
  let generation=0,disposed=false,active=null;
  const cancel=()=>{generation++;active?.abort();};
  const unsubscribe=subscribeContext(cancel);
  if(typeof unsubscribe!=='function')throw Error('APPLE_RESTORE_CONTEXT_REQUIRED');
  return Object.freeze({
    async restore(originalJSON,{signal}={}) {
      if(disposed)throw Error('APPLE_RESTORE_CLOSED');
      if(active)throw Error('APPLE_RESTORE_BUSY');
      const prepared=prepareAppleDocumentRestore(originalJSON);
      const controller=new AbortController(),epoch=generation;active=controller;
      const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();
      const check=()=>{if(disposed||epoch!==generation||controller.signal.aborted)
        throw new DOMException('Cancelled','AbortError');};
      try {
        check();
        const authorization=await authorize({stage:'before-restore',...structuredClone(prepared),signal:controller.signal});
        check();
        if(authorization?.authorized!==true||!authorization.currentBinding)
          throw Error('APPLE_RESTORE_NOT_AUTHORIZED');
        const currentBinding=structuredClone(authorization.currentBinding);
        const result=await commit({...structuredClone(prepared),currentBinding,signal:controller.signal});
        // Commit owns its transaction: it may publish context changes upon
        // success. Do not reinterpret that successful commit as cancellation.
        if(result?.applied!==true)throw Error('APPLE_RESTORE_NOT_APPLIED');
        return {...prepared,applied:true,persisted:result.persisted===true};
      } finally {
        signal?.removeEventListener('abort',abort);
        if(active===controller)active=null;
      }
    },
    cancel,
    dispose(){if(disposed)return;disposed=true;cancel();unsubscribe();},
  });
}
