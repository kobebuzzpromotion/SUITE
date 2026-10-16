import {encodeDeliveryBatch, transitionDeliveryJob} from './delta66-workflow-export.mjs';

const stopped = signal => {
  if (signal?.aborted) throw new DOMException('Delivery cancelled', 'AbortError');
};

/** Sequential execution for an existing planDeliveryVariants plan. The host supplies its
 * authorized Final renderer and actual destination transport, not an untrusted saved URL.
 * No UI registration, implicit retry, model download or cloud dispatch occurs here.
 * Each file is committed independently: a later failure cannot undo an earlier receipt.
 * Restored running/failed jobs require an explicit transition to queued before execution.
 */
export async function runDeliveryQueue({plan, states, renderFinal, deliver, persist,
  existingNames = [], conflict = 'rename', signal} = {}) {
  if (!plan || !Array.isArray(plan.jobs) || !Array.isArray(states) ||
      states.length !== plan.jobs.length || typeof renderFinal !== 'function' ||
      typeof deliver !== 'function' || typeof persist !== 'function' ||
      !Array.isArray(existingNames) || existingNames.some(name => typeof name !== 'string') ||
      !['rename', 'skip', 'reject'].includes(conflict)) throw Error('DELIVERY_RUNNER_INPUT_INVALID');
  const current = structuredClone(states), ids = new Set();
  for (let index = 0; index < current.length; index++) {
    const state = current[index];
    if (!state || state.id !== plan.jobs[index].id || ids.has(state.id) ||
        !['queued', 'delivered', 'cancelled', 'failed'].includes(state.status) ||
        !Number.isSafeInteger(state.attempt) || state.attempt < 0)
      throw Error('DELIVERY_RUNNER_STATE_INVALID');
    ids.add(state.id);
  }
  const occupied = [...existingNames], receipts = [];
  // Batch encoder owns plan authenticity checks and collision naming. Supplying a
  // partially fabricated plan is not allowed, so render the pinned batch before encode.
  // The established browser encoder is intentionally bounded to twenty frames.
  if (plan.jobs.length > 20) throw Error('DELIVERY_RUNNER_BATCH_LIMIT');
  if (current.some(state => state.status !== 'queued'))
    throw Error('DELIVERY_RUNNER_FRESH_BATCH_REQUIRED');
  async function save() {
    await persist({schemaVersion: 1, plan, states: structuredClone(current)});
  }
  let active = -1, committedReceipt = null;
  try {
    const frames = []; let residentBytes = 0;
    for (let index = 0; index < plan.jobs.length; index++) {
      stopped(signal); active = index;
      current[index] = transitionDeliveryJob(current[index], {type: 'start'});
      await save();
      const job = plan.jobs[index];
      const rendered = await renderFinal(job, {signal});
      stopped(signal);
      if (!rendered || rendered.originalSHA256 !== job.asset.sha256 ||
          rendered.recipeVersion !== job.recipeVersion)
        throw Error('DELIVERY_RUNNER_FINAL_PIN_MISMATCH');
      const bytes = rendered.pixels?.data?.byteLength;
      if (!Number.isSafeInteger(bytes) || bytes < 1 || residentBytes + bytes > 128 * 1024 * 1024)
        throw Error('DELIVERY_RUNNER_RESIDENT_FRAME_LIMIT');
      residentBytes += bytes;
      frames.push({...rendered, jobId: job.id});
    }
    const batch = await encodeDeliveryBatch(plan, frames,
      {existingNames: occupied, conflict, signal});
    frames.length = 0;
    for (let index = 0; index < batch.outputs.length; index++) {
      stopped(signal); active = index; committedReceipt = null;
      const output = batch.outputs[index];
      if (output.status === 'skipped') {
        current[index] = transitionDeliveryJob(current[index], {type: 'cancel'});
        current[index].skipReason = 'destination-name-exists';
      } else {
        const digest = await crypto.subtle.digest('SHA-256', await output.blob.arrayBuffer());
        const expectedSHA256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        stopped(signal);
        // A transport which committed before observing cancellation must return its
        // receipt. Do not check AbortSignal between that receipt and recording it.
        const receipt = await deliver(output, {job: plan.jobs[index], signal});
        committedReceipt = structuredClone(receipt);
        if (receipt?.bytes !== output.blob.size || receipt?.sha256?.toLowerCase() !== expectedSHA256) {
          const mismatch = Error('DELIVERY_RUNNER_RECEIPT_MISMATCH');
          mismatch.commitMayHaveSucceeded = true;
          throw mismatch;
        }
        current[index] = transitionDeliveryJob(current[index], {type: 'delivered', receipt});
        receipts.push({jobId: output.jobId, receipt: structuredClone(receipt)});
      }
      await save(); committedReceipt = null;
    }
    return {status: 'batch-processed', states: current, receipts};
  } catch (error) {
    // An uncertain transport commit is not safe to retry automatically.
    const uncertain = committedReceipt !== null || error?.commitMayHaveSucceeded === true;
    for (let index = 0; index < current.length; index++) {
      if (current[index].status !== 'running') continue;
      current[index] = transitionDeliveryJob(current[index], signal?.aborted && !uncertain
        ? {type: 'cancel'} : {type: 'fail', code: uncertain && index === active
          ? 'DELIVERY_COMMIT_STATUS_UNKNOWN' : 'DELIVERY_BATCH_INTERRUPTED'});
    }
    let statePersistenceFailed = false;
    try { await save(); } catch { statePersistenceFailed = true; }
    const failure = new Error(uncertain ? 'DELIVERY_RECONCILIATION_REQUIRED' : 'DELIVERY_BATCH_INTERRUPTED', {cause: error});
    failure.states = current;
    failure.receipts = receipts;
    failure.committedReceipt = committedReceipt;
    failure.commitMayHaveSucceeded = uncertain;
    failure.statePersistenceFailed = statePersistenceFailed;
    throw failure;
  }
}
