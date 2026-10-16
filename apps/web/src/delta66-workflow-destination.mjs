const mime={jpeg:'image/jpeg',png:'image/png',tiff:'image/tiff'};

/** Explicit capability description, not an inferred OS permission or an opened destination. */
export function deliveryDestinationOptions({platform,canShareFiles=false,nativePhotos=false,nativeFiles=false,connectedProviders=[]}={}){
  if(!['desktop','ipad','iphone'].includes(platform)||typeof canShareFiles!=='boolean'||typeof nativePhotos!=='boolean'||
      typeof nativeFiles!=='boolean'||!Array.isArray(connectedProviders)||connectedProviders.some(id=>typeof id!=='string'||!id))
    throw Error('DELIVERY_DESTINATION_CAPABILITIES_INVALID');
  return [
    {id:'files',available:nativeFiles,requires:'native-files-permission'},
    ...(platform!=='desktop'?[{id:'photos',available:nativePhotos,requires:'native-photo-library-add-permission'}]:[]),
    {id:'share',available:canShareFiles,requires:'user-activation-and-file-share-support'},
    ...[...new Set(connectedProviders)].map(id=>({id:`provider:${id}`,available:true,requires:'fresh-provider-authorization'}))
  ];
}

/** A real Web Share handoff. Browser success means the share UI accepted the files,
 * not that Photos/iCloud/external storage durably saved them. Never emit a saved receipt.
 * The authorized Final host must call this during explicit user activation; no auto-share.
 */
export async function shareDeliveryFiles(outputs,{navigatorImpl=globalThis.navigator,title='SUITE',exportedAt}={}){
  if(!Array.isArray(outputs)||!outputs.length||outputs.length>20||typeof title!=='string'||title.length>255||
      !Number.isSafeInteger(exportedAt)||exportedAt<0)throw Error('DELIVERY_SHARE_INPUT_INVALID');
  let total=0;const names=new Set();
  const files=outputs.map(output=>{
    if(!output||output.status!=='staged'||!(output.blob instanceof Blob)||!output.blob.size||
        output.blob.type!==mime[output.format]||typeof output.name!=='string'||!output.name||
        /[\/\\\u0000-\u001f]/u.test(output.name)||output.name==='.'||output.name==='..'||names.has(output.name))
      throw Error('DELIVERY_SHARE_OUTPUT_INVALID');
    names.add(output.name);total+=output.blob.size;if(total>256*1024*1024)throw Error('DELIVERY_SHARE_SIZE_LIMIT');
    return new File([output.blob],output.name,{type:output.blob.type,lastModified:exportedAt});
  });
  if(typeof navigatorImpl?.canShare!=='function'||typeof navigatorImpl.share!=='function'||!navigatorImpl.canShare({files}))
    throw Error('DELIVERY_FILE_SHARING_UNAVAILABLE');
  await navigatorImpl.share({files,title});
  return {status:'share-ui-handoff',count:files.length,durableSaveConfirmed:false};
}
