const validID=value=>typeof value==='string'&&value.length>0&&value.length<=255;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);

/** Merge lazy-loaded pages from ONE authenticated server snapshot. No provider or ACL logic
 * is replaced here. A new snapshot must restart from an empty state; never splice two views.
 * This is listing state only: returned rows are not Cloud Safe/authorization evidence.
 */
export function mergeCloudSpacePage(state,page){
  if(!page||!validID(page.spaceId)||!validID(page.snapshotId)||!Array.isArray(page.items)||page.items.length>1000||
      !(page.nextCursor===null||validID(page.nextCursor))||!(page.requestCursor===null||validID(page.requestCursor)))
    throw Error('CLOUD_PAGE_INVALID');
  const current=state??{spaceId:page.spaceId,snapshotId:page.snapshotId,items:[],nextCursor:null,started:false};
  if(current.spaceId!==page.spaceId||current.snapshotId!==page.snapshotId||!Array.isArray(current.items)||
      page.requestCursor!==current.nextCursor||current.started&&current.nextCursor===null)
    throw Error('CLOUD_PAGE_STALE_OR_OUT_OF_ORDER');
  if(page.nextCursor!==null&&page.nextCursor===page.requestCursor)throw Error('CLOUD_CURSOR_NOT_ADVANCING');
  const rows=new Map(current.items.map(row=>[row.id,row]));
  for(const item of page.items){
    if(!item||!validID(item.id)||typeof item.name!=='string'||item.name.length>1024||
        !Number.isSafeInteger(item.version)||item.version<1||!Number.isSafeInteger(item.updatedAt)||item.updatedAt<0||
        !Number.isSafeInteger(item.bytes)||item.bytes<0||rows.has(item.id))throw Error('CLOUD_PAGE_ITEM_INVALID');
    rows.set(item.id,structuredClone(item));
  }
  if(rows.size>100000)throw Error('CLOUD_LISTING_LIMIT');
  return {spaceId:current.spaceId,snapshotId:current.snapshotId,items:[...rows.values()],
    nextCursor:page.nextCursor,started:true,complete:page.nextCursor===null};
}

/** Capacity comes from authoritative counters, not the sum of currently lazy-loaded rows. */
export function cloudCapacityView({quotaBytes,usedBytes,reservedBytes=0}){
  for(const n of [quotaBytes,usedBytes,reservedBytes])if(!Number.isSafeInteger(n)||n<0)throw Error('CLOUD_CAPACITY_INVALID');
  const committed=usedBytes+reservedBytes;if(!Number.isSafeInteger(committed))throw Error('CLOUD_CAPACITY_OVERFLOW');
  return {quotaBytes,usedBytes,reservedBytes,remainingBytes:Math.max(0,quotaBytes-committed),
    overQuotaBytes:Math.max(0,committed-quotaBytes),fill:quotaBytes?Math.min(1,committed/quotaBytes):committed?1:0};
}

/** Pure selected-Final dependency calculation. The host still invokes existing Cloud Safe,
 * network-policy, permission and actual hash gates before retrieval/render. Never fetch a
 * whole Space, delete local copies, mark Cloud Safe or change background sync policy here.
 */
export function selectedFinalDependencies({selectedAssetIds,inventory,localDigests=[]}){
  if(!Array.isArray(selectedAssetIds)||!selectedAssetIds.length||selectedAssetIds.length>1000||
      new Set(selectedAssetIds).size!==selectedAssetIds.length||!Array.isArray(inventory)||inventory.length>100000||
      !Array.isArray(localDigests))throw Error('CLOUD_FINAL_SELECTION_INVALID');
  const local=new Set();for(const item of localDigests){if(!hash(item))throw Error('CLOUD_LOCAL_DIGEST_INVALID');local.add(item.toLowerCase());}
  const assets=new Map();
  for(const item of inventory){
    if(!item||!validID(item.id)||assets.has(item.id))throw Error('CLOUD_INVENTORY_INVALID');assets.set(item.id,item);
  }
  const ready=[],needsDownload=[],blocked=[];let bytes=0;
  for(const id of selectedAssetIds){
    if(!validID(id))throw Error('CLOUD_FINAL_SELECTION_INVALID');const asset=assets.get(id);
    if(!asset||asset.deletedAt!==undefined&&asset.deletedAt!==null){blocked.push({assetId:id,reason:'missing-or-deleted'});continue;}
    if(!hash(asset.originalSHA256)||!Number.isSafeInteger(asset.originalBytes)||asset.originalBytes<1)
      throw Error('CLOUD_ORIGINAL_DESCRIPTOR_INVALID');
    const entry={assetId:id,sha256:asset.originalSHA256.toLowerCase(),bytes:asset.originalBytes};
    if(local.has(entry.sha256))ready.push({...entry,requiresLocalRehash:true});
    else if(asset.cloudSafe!==true)blocked.push({assetId:id,reason:'original-not-confirmed-cloud-safe'});
    else{needsDownload.push({...entry,priority:'explicit-final',requiresFreshAuthority:true});bytes+=entry.bytes;}
    if(!Number.isSafeInteger(bytes))throw Error('CLOUD_TRANSFER_SIZE_OVERFLOW');
  }
  return {ready,needsDownload,blocked,downloadBytes:bytes,canPlan:blocked.length===0,authorized:false};
}

/** Pin a selected historical version as a proposed restore, never rewrite the current revision.
 * The existing save API must perform CAS and create a new revision with this recipe body.
 */
export function proposeRecipeRestore({assetId,currentVersion,historicalVersion,recipe}){
  if(!validID(assetId)||!Number.isSafeInteger(currentVersion)||currentVersion<1||!Number.isSafeInteger(historicalVersion)||
      historicalVersion<1||historicalVersion>=currentVersion||!recipe||typeof recipe!=='object'||Array.isArray(recipe))
    throw Error('CLOUD_RESTORE_PROPOSAL_INVALID');
  return {assetId,baseVersion:currentVersion,restoredFromVersion:historicalVersion,recipe:structuredClone(recipe),
    status:'requires-existing-save-cas',authorized:false};
}
