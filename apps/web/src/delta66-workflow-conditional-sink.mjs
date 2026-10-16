const abort=signal=>{if(signal?.aborted)throw new DOMException('Delivery cancelled','AbortError');};
const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');

/** Trusted sink contract: begin creates a temporary object; commit must atomically check
 * expectedVersion (or absence for create) AND protected Original identities at publication.
 * Capability flags are requirements, not cryptographic proof. A provider that cannot enforce
 * both conditions must not advertise them. No fallback to check-then-unconditional-overwrite.
 */
export async function commitDeliveryBlob({blob,destination,expectedVersion,mode='reject',confirmedReplace=false,
  protectedOriginalIds,sink,signal}={}){
  if(!(blob instanceof Blob)||!blob.size||blob.size>256*1024*1024||typeof destination!=='string'||!destination||
      !['reject','replace'].includes(mode)||!Array.isArray(protectedOriginalIds)||!protectedOriginalIds.length||
      protectedOriginalIds.some(id=>typeof id!=='string'||!id))throw Error('DELIVERY_COMMIT_INPUT_INVALID');
  if(mode==='replace'&&(confirmedReplace!==true||typeof expectedVersion!=='string'||!expectedVersion))
    throw Error('DELIVERY_REPLACE_CONFIRMATION_AND_VERSION_REQUIRED');
  if(mode==='reject'&&expectedVersion!==undefined)throw Error('DELIVERY_CREATE_EXPECTATION_INVALID');
  if(sink?.capabilities?.atomicConditionalCommit!==true||sink.capabilities.protectOriginalIdentities!==true||
      typeof sink.begin!=='function'||typeof sink.readVersion!=='function')throw Error('DELIVERY_ATOMIC_SINK_REQUIRED');
  abort(signal);const sha256=await hash(blob);abort(signal);
  const condition=mode==='replace'?{kind:'version-equals',version:expectedVersion}:{kind:'absent'};
  const transaction=await sink.begin({destination,condition,protectedOriginalIds:[...new Set(protectedOriginalIds)],signal});
  let commitStarted=false;
  try{
    if(typeof transaction?.write!=='function'||typeof transaction.commit!=='function'||typeof transaction.abort!=='function')
      throw Error('DELIVERY_SINK_TRANSACTION_INVALID');
    const reader=blob.stream().getReader();
    try{while(true){abort(signal);const part=await reader.read();if(part.done)break;await transaction.write(part.value,{signal});}}
    finally{try{await reader.cancel();}finally{reader.releaseLock();}}
    abort(signal);commitStarted=true;
    const receipt=await transaction.commit({condition,sha256,bytes:blob.size,signal});
    if(!receipt||receipt.destination!==destination||receipt.sha256!==sha256||receipt.bytes!==blob.size||
        typeof receipt.version!=='string'||!receipt.version||receipt.conditionApplied!==true)
      throw Error('DELIVERY_COMMIT_RECEIPT_INVALID');
    // Verify committed immutable version, not a moving path that another writer can replace.
    const stored=await sink.readVersion({destination,version:receipt.version,signal});
    if(stored?.version!==receipt.version||!(stored.blob instanceof Blob)||stored.blob.size!==blob.size||
        await hash(stored.blob)!==sha256)throw Error('DELIVERY_COMMIT_READBACK_MISMATCH');
    abort(signal);
    return {destination,version:receipt.version,sha256,bytes:blob.size,status:'conditional-commit-readback-verified'};
  }catch(error){
    if(!commitStarted){try{await transaction?.abort?.();}catch{}}
    else if(error&&typeof error==='object')error.commitMayHaveSucceeded=true;
    throw error;
  }
}
