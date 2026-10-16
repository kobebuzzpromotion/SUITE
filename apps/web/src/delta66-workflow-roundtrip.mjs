/** External editor roundtrip bookkeeping. No Lightroom catalog interpretation, executable
 * launch, private codec, identity guess by filename, or Original overwrite is performed.
 * Prepared rendered input and returned bytes remain separate derivative Assets.
 */
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=255;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');

export async function prepareExternalEdit({roundtripId,assetId,originalSHA256,recipeVersion,renderedBlob,format},{signal}={}){
  if(!id(roundtripId)||!id(assetId)||!sha(originalSHA256)||!Number.isSafeInteger(recipeVersion)||recipeVersion<1||
      !(renderedBlob instanceof Blob)||!renderedBlob.size||renderedBlob.size>256*1024*1024||
      !['jpeg','png','tiff'].includes(format)||renderedBlob.type!=={jpeg:'image/jpeg',png:'image/png',tiff:'image/tiff'}[format])
    throw Error('ROUNDTRIP_INPUT_INVALID');
  if(signal?.aborted)throw new DOMException('Roundtrip cancelled','AbortError');
  const inputSHA256=await digest(await renderedBlob.arrayBuffer());
  if(signal?.aborted)throw new DOMException('Roundtrip cancelled','AbortError');
  return {schemaVersion:1,roundtripId,assetId,originalSHA256:originalSHA256.toLowerCase(),recipeVersion,
    inputSHA256,inputBytes:renderedBlob.size,format,status:'prepared-not-launched'};
}

export async function acceptExternalEditReturn(ticket,{roundtripId,currentAsset,returnedBlob,confirmed=false,signal}={}){
  if(!ticket||ticket.schemaVersion!==1||ticket.status!=='prepared-not-launched'||!id(ticket.roundtripId)||
      !sha(ticket.originalSHA256)||!sha(ticket.inputSHA256)||!Number.isSafeInteger(ticket.recipeVersion)||ticket.recipeVersion<1||
      roundtripId!==ticket.roundtripId||
      confirmed!==true||!currentAsset||currentAsset.id!==ticket.assetId||currentAsset.sha256?.toLowerCase()!==ticket.originalSHA256||
      currentAsset.deletedAt!==undefined&&currentAsset.deletedAt!==null||!(returnedBlob instanceof Blob)||!returnedBlob.size||
      returnedBlob.size>256*1024*1024)throw Error('ROUNDTRIP_RETURN_INVALID_OR_UNCONFIRMED');
  if(signal?.aborted)throw new DOMException('Roundtrip cancelled','AbortError');
  const bytes=await returnedBlob.arrayBuffer(),header=new Uint8Array(bytes,0,Math.min(bytes.byteLength,12));
  const format=header[0]===255&&header[1]===216&&header[2]===255?'jpeg':
    [137,80,78,71,13,10,26,10].every((v,i)=>header[i]===v)?'png':
    header[0]===73&&header[1]===73&&header[2]===42&&header[3]===0||
    header[0]===77&&header[1]===77&&header[2]===0&&header[3]===42?'tiff':null;
  if(!format)throw Error('ROUNDTRIP_RETURN_FORMAT_UNSUPPORTED');
  const sha256=await digest(bytes);
  if(signal?.aborted)throw new DOMException('Roundtrip cancelled','AbortError');
  return {roundtripId,sourceAssetId:ticket.assetId,sourceOriginalSHA256:ticket.originalSHA256,
    sourceRecipeVersion:ticket.recipeVersion,format,sha256,bytes:returnedBlob.size,blob:returnedBlob,
    unchanged:sha256===ticket.inputSHA256,disposition:'new-derivative-only',status:'requires-authorized-asset-registration'};
}
