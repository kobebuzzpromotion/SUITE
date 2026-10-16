import {WorkspaceSessionClient, WorkspaceSessionHTTPError} from './workspace-session-client.mjs';
import {WorkspaceCullingClient, WorkspaceCullingHTTPError} from './workspace-culling-client.mjs';

/**
 * Node Workspace manual marks only. This is a sequential CAS operation, not a
 * transaction spanning assets. Its result is never a Final/AI/Cloud grant.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw Error(`CULLING_BULK_TAG_${code}`);};
const abort=signal=>{if(signal?.aborted)throw new DOMException('Bulk tag cancelled','AbortError');};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
  keys.every(key=>Object.hasOwn(value,key));
function selection(value,workspaceId,projectId,orderedAssetIds){
  if(!exact(value,['workspaceId','projectId','orderedAssetIds'])||value.workspaceId!==workspaceId||
      value.projectId!==projectId||!Array.isArray(value.orderedAssetIds)||
      value.orderedAssetIds.length!==orderedAssetIds.length||
      value.orderedAssetIds.some((id,index)=>id!==orderedAssetIds[index]))fail('SELECTION_CHANGED');
}
function reason(error){
  if(error?.name==='AbortError')return 'ABORTED';
  if(error?.message==='CULLING_BULK_TAG_SELECTION_CHANGED')return 'SELECTION_CHANGED';
  if(error?.message==='CULLING_BULK_TAG_VERSION_CONFLICT'||
      error instanceof WorkspaceCullingHTTPError&&error.status===409)return 'VERSION_CONFLICT';
  if(error?.message==='CULLING_BULK_TAG_SEGMENT_NOT_FOUND')return 'SEGMENT_NOT_FOUND';
  if(error instanceof WorkspaceSessionHTTPError&&[401,403].includes(error.status)||
      error instanceof WorkspaceCullingHTTPError&&[401,403].includes(error.status)||
      ['WORKSPACE_SESSION_IDENTITY_CHANGED','WORKSPACE_SESSION_EDIT_FORBIDDEN'].includes(error?.message))
    return 'ACCESS_DENIED';
  return 'RESULT_UNVERIFIED';
}
function result(orderedAssetIds,states,expectedCullingVersion,stoppedReason,lastVerifiedVersion){
  const complete=stoppedReason===null&&states.every(item=>['saved','unchanged'].includes(item.status));
  const savedCount=states.filter(item=>item.status==='saved').length;
  return Object.freeze({status:complete?'COMPLETE_AT_READ_TIME':'STOPPED_RELOAD_REQUIRED',
    orderedResults:Object.freeze(states.map(item=>Object.freeze({...item}))),
    expectedCullingVersion,lastVerifiedVersion,savedCount,
    stoppedReason,requiresReload:!complete||savedCount>0,authoritativeForFinal:false});
}

/**
 * The host supplies explicit current selection and a fresh Node JWT provider.
 * Neither is accepted as authority: each read/write round checks the same
 * bearer against a fresh Workspace session and server-side Project CAS.
 */
export async function applyWorkspaceCullingBulkTag(input){return applyBulkChange(input,'tag');}

/** One explicit Rating, Flag or Color Label operation; never a multi-field patch. */
export async function applyWorkspaceCullingBulkMark(input){return applyBulkChange(input,'mark');}

/** Assign an existing Story Segment, or explicitly clear it with null. */
export async function applyWorkspaceCullingBulkSegment(input){return applyBulkChange(input,'segment');}

async function applyBulkChange(input,kind){
  if(!plain(input))fail('INPUT_INVALID');
  const {baseURL,tokenProvider,selectionProvider,workspaceId,projectId,orderedAssetIds,
    expectedSubject,expectedTenantId,expectedCullingVersion,tag,action,field,value,segmentId,signal,
    fetchImpl=globalThis.fetch}=input;
  const validText=(text,max=120)=>typeof text==='string'&&text.length>0&&text.length<=max&&
    text.trim()===text&&!/[\u0000-\u001f\u007f]/u.test(text);
  const validChange=kind==='tag'?
    validText(tag)&&['add','remove'].includes(action)&&
      !Object.hasOwn(input,'field')&&!Object.hasOwn(input,'value')&&!Object.hasOwn(input,'segmentId'):
    kind==='mark'?!Object.hasOwn(input,'tag')&&!Object.hasOwn(input,'action')&&
      !Object.hasOwn(input,'segmentId')&&
      (field==='rating'?Number.isSafeInteger(value)&&value>=0&&value<=5:
        field==='flag'?['none','pick','reject'].includes(value):
          field==='colorLabel'?(value===null||validText(value)):false):
      kind==='segment'&&!Object.hasOwn(input,'tag')&&!Object.hasOwn(input,'action')&&
        !Object.hasOwn(input,'field')&&!Object.hasOwn(input,'value')&&
        Object.hasOwn(input,'segmentId')&&(segmentId===null||
          validText(segmentId,128));
  if(!UUID.test(workspaceId)||!UUID.test(projectId)||!Array.isArray(orderedAssetIds)||
      orderedAssetIds.length<2||orderedAssetIds.length>20||
      Reflect.ownKeys(orderedAssetIds).length!==orderedAssetIds.length+1||
      Array.from({length:orderedAssetIds.length},(_,index)=>Object.hasOwn(orderedAssetIds,index)).includes(false)||
      orderedAssetIds.some(id=>typeof id!=='string'||!UUID.test(id))||
      new Set(orderedAssetIds.map(id=>id.toLowerCase())).size!==orderedAssetIds.length||
      !Number.isSafeInteger(expectedCullingVersion)||expectedCullingVersion<0||
      expectedCullingVersion>Number.MAX_SAFE_INTEGER-20||
      !validChange||
      typeof tokenProvider!=='function'||typeof selectionProvider!=='function'||
      typeof fetchImpl!=='function')fail('INPUT_INVALID');
  const ids=Object.freeze([...orderedAssetIds]);
  const states=ids.map(assetId=>({assetId,status:'not_attempted'}));
  let currentVersion=expectedCullingVersion,stoppedReason=null;
  const selected=async()=>{abort(signal);selection(await selectionProvider(),workspaceId,projectId,ids);abort(signal);};
  const round=async work=>{
    await selected();
    let bearer=await tokenProvider({signal});abort(signal);
    if(typeof bearer!=='string'||!bearer||bearer.length>8192||/\s/u.test(bearer))fail('TOKEN_INVALID');
    try{
      const sameBearer=()=>bearer;
      const gate=new WorkspaceSessionClient({baseURL,tokenProvider:sameBearer,fetchImpl});
      const client=new WorkspaceCullingClient({baseURL,tokenProvider:sameBearer,fetchImpl});
      const fresh=async()=>{await selected();await gate.getFreshSession({workspaceId,expectedSubject,
        expectedTenantId,access:'edit',signal});await selected();};
      await fresh();
      const value=await work(client);
      await fresh();
      return value;
    }finally{bearer=undefined;}
  };
  // Validate the whole explicit set before the first mutation. Later CAS
  // checks still have to be repeated because this is not an atomic batch.
  try{
    await round(async client=>{
      const page=await client.getProjectPage({workspaceId,projectId,limit:1,signal});
      if(page.version!==currentVersion)fail('VERSION_CONFLICT');
      if(kind==='segment'&&segmentId!==null&&
          !page.segments.some(item=>item.id===segmentId))fail('SEGMENT_NOT_FOUND');
      for(const assetId of ids){
        const checked=await client.getAssetMark({workspaceId,projectId,assetId,signal});
        if(checked.version!==currentVersion||checked.mark.assetId!==assetId)fail('VERSION_CONFLICT');
      }
    });
  }catch(error){
    stoppedReason=reason(error);
    return result(ids,states,expectedCullingVersion,stoppedReason,currentVersion);
  }
  for(let index=0;index<ids.length;index++){
    const assetId=ids[index];let writeStarted=false;
    try{
      const outcome=await round(async client=>{
        const page=await client.getProjectPage({workspaceId,projectId,limit:1,signal});
        const before=await client.getAssetMark({workspaceId,projectId,assetId,signal});
        if(page.version!==currentVersion||before.version!==currentVersion||before.mark.assetId!==assetId)
          fail('VERSION_CONFLICT');
        if(kind==='segment'&&segmentId!==null&&
            !page.segments.some(item=>item.id===segmentId))fail('SEGMENT_NOT_FOUND');
        const expectedMark={...before.mark};
        if(kind==='tag')expectedMark.tags=action==='add'?
          (before.mark.tags.includes(tag)?before.mark.tags:[...before.mark.tags,tag]):
          before.mark.tags.filter(item=>item!==tag);
        else if(kind==='mark')expectedMark[field]=value;
        else expectedMark.segmentId=segmentId;
        if(JSON.stringify(expectedMark)===JSON.stringify(before.mark)){
          const stable=await client.getProjectPage({workspaceId,projectId,limit:1,signal});
          if(stable.version!==currentVersion)fail('VERSION_CONFLICT');
          return 'unchanged';
        }
        if(expectedMark.tags.length>32)fail('TAG_LIMIT');
        writeStarted=true;
        const saved=await client.saveAssetMark({workspaceId,projectId,assetId,
          baseVersion:currentVersion,rating:expectedMark.rating,flag:expectedMark.flag,
          colorLabel:expectedMark.colorLabel,tags:expectedMark.tags,
          segmentId:expectedMark.segmentId,signal});
        const after=await client.getAssetMark({workspaceId,projectId,assetId,signal});
        const verifiedPage=await client.getProjectPage({workspaceId,projectId,limit:1,signal});
        if(saved.version!==currentVersion+1||after.version!==saved.version||
            verifiedPage.version!==saved.version||
            JSON.stringify(saved.mark)!==JSON.stringify(expectedMark)||
            JSON.stringify(after.mark)!==JSON.stringify(expectedMark))fail('RESULT_UNVERIFIED');
        return 'saved';
      });
      if(outcome==='saved')currentVersion++;
      states[index]={assetId,status:outcome,...(outcome==='saved'?{verifiedVersion:currentVersion}:{})};
    }catch(error){
      stoppedReason=reason(error);
      states[index]={assetId,status:writeStarted&&stoppedReason!=='VERSION_CONFLICT'?'unverified':
        stoppedReason==='VERSION_CONFLICT'?'conflict':stoppedReason==='ACCESS_DENIED'?'denied':'not_attempted'};
      break;
    }
  }
  return result(ids,states,expectedCullingVersion,stoppedReason,currentVersion);
}
