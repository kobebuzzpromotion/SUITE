import {WorkspaceSessionClient} from './workspace-session-client.mjs';
import {WorkspaceCullingClient,WorkspaceCullingHTTPError} from './workspace-culling-client.mjs';

/**
 * A narrow, non-destructive Node Workspace XMP import boundary. The accepted
 * packet subset has one RDF Description with only xmp:Rating (integer 0..5)
 * and/or nonempty xmp:Label. Valid XMP outside this subset fails closed.
 * Adobe XMP Basic: https://developer.adobe.com/xmp/docs/xmp-namespaces/xmp/
 * Rating -1 means Reject in XMP, but is deliberately unsupported here: this
 * import does not change the existing SUITE Flag (including Pick/Reject).
 * The confirmation callback is a host UI intent assertion, never identity or
 * permission evidence. Panel/Trial/Cloud/RAW/Final remain unconnected.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/i;
const fail=code=>{throw Error(`CULLING_XMP_IMPORT_${code}`);};
const abort=signal=>{if(signal?.aborted)throw new DOMException('XMP import cancelled','AbortError');};
const own=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value))&&
  Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const previews=new WeakMap();

function decodeLabel(raw){
  if(!raw||raw.includes('<')||raw.includes('>')||/&(?!(?:amp|lt|gt|quot|apos);)/u.test(raw))fail('LABEL_INVALID');
  const text=raw.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"')
    .replaceAll('&apos;',"'").replaceAll('&amp;','&');
  if(!text||text.length>120||text.trim()!==text||/[\u0000-\u001f\u007f]/u.test(text))fail('LABEL_INVALID');
  return text;
}

/** Parse bytes synchronously, copy no file data into the returned preview. */
export function inspectWorkspaceCullingXMPSidecar(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>4096)fail('BYTES_INVALID');
  let xml;try{xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('UTF8_INVALID');}
  if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?xml-stylesheet|\u0000/iu.test(xml))fail('XML_UNSUPPORTED');
  if(xml.includes('<?xpacket begin=')!==xml.includes('<?xpacket end='))fail('XML_UNSUPPORTED');
  const body=/^(?:<\?xml version="1\.0" encoding="UTF-8"\?>\s*)?(?:<\?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"\?>\s*)?<x:xmpmeta xmlns:x="adobe:ns:meta\/">\s*<rdf:RDF xmlns:rdf="http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#">\s*<rdf:Description rdf:about="" xmlns:xmp="http:\/\/ns\.adobe\.com\/xap\/1\.0\/">([\s\S]*?)<\/rdf:Description>\s*<\/rdf:RDF>\s*<\/x:xmpmeta>\s*(?:<\?xpacket end="w"\?>\s*)?$/u.exec(xml.trim());
  if(!body)fail('XML_UNSUPPORTED');
  let rest=body[1].trim(),rating=null,label=null,hasRating=false,hasLabel=false;
  while(rest){
    const item=/^<xmp:(Rating|Label)>([^<]*)<\/xmp:\1>/u.exec(rest);
    if(!item)fail('XML_UNSUPPORTED');
    if(item[1]==='Rating'){
      if(hasRating)fail('DUPLICATE_PROPERTY');
      hasRating=true;
      if(item[2]==='-1')fail('REJECT_RATING_UNSUPPORTED');
      if(!/^[0-5]$/u.test(item[2]))fail('RATING_INVALID');
      rating=Number(item[2]);
    }else{
      if(hasLabel)fail('DUPLICATE_PROPERTY');
      hasLabel=true;label=decodeLabel(item[2]);
    }
    rest=rest.slice(item[0].length).trim();
  }
  if(!hasRating&&!hasLabel)fail('NO_SUPPORTED_PROPERTY');
  const preview=Object.freeze({status:'PREVIEW_ONLY',rating,label,
    fields:Object.freeze([...(hasRating?['rating']:[]),...(hasLabel?['colorLabel']:[])]),
    flagPolicy:'PRESERVE_EXISTING_FLAG',authoritativeForFinal:false});
  previews.set(preview,Object.freeze({hasRating,rating,hasLabel,label}));
  return preview;
}

function selection(value,workspaceId,projectId,assetId){
  if(!own(value,['workspaceId','projectId','assetId'])||value.workspaceId!==workspaceId||
      value.projectId!==projectId||value.assetId!==assetId)fail('SELECTION_CHANGED');
}
function markMatches(actual,expected){
  return actual?.assetId===expected.assetId&&
    ['rating','flag','colorLabel','tags','segmentId'].every(key=>
      JSON.stringify(actual[key])===JSON.stringify(expected[key]));
}
function outcome(status,{assetId,expectedCullingVersion,confirmedVersion=null}={}){
  return Object.freeze({status,assetId,expectedCullingVersion,confirmedVersion,
    requiresReload:status.endsWith('RELOAD_REQUIRED')||status==='VERIFIED_SAVED_AT_READ_TIME',
    authoritativeForFinal:false});
}

/**
 * confirmImport must resolve to the exact branded preview after a separate,
 * explicit owner action. This callback is not trusted as authentication; the
 * same short-lived Node bearer checks identity, Asset SHA, Project version,
 * CAS write and readback. No filename or XMP self-assertion is authoritative.
 */
export async function applyVerifiedWorkspaceCullingXMPImport(input){
  if(!own(input,['preview','confirmImport','baseURL','tokenProvider','selectionProvider',
    'workspaceId','projectId','assetId','expectedSubject','expectedTenantId',
    'expectedOriginalSHA256','expectedCullingVersion'])&&
     !own(input,['preview','confirmImport','baseURL','tokenProvider','selectionProvider',
       'workspaceId','projectId','assetId','expectedSubject','expectedTenantId',
       'expectedOriginalSHA256','expectedCullingVersion','signal'])&&
     !own(input,['preview','confirmImport','baseURL','tokenProvider','selectionProvider',
       'workspaceId','projectId','assetId','expectedSubject','expectedTenantId',
       'expectedOriginalSHA256','expectedCullingVersion','fetchImpl'])&&
     !own(input,['preview','confirmImport','baseURL','tokenProvider','selectionProvider',
       'workspaceId','projectId','assetId','expectedSubject','expectedTenantId',
       'expectedOriginalSHA256','expectedCullingVersion','signal','fetchImpl']))fail('CONFIG_INVALID');
  const {preview,confirmImport,baseURL,tokenProvider,selectionProvider,workspaceId,projectId,
    assetId,expectedSubject,expectedTenantId,expectedOriginalSHA256,expectedCullingVersion,
    signal,fetchImpl=globalThis.fetch}=input;
  const parsed=previews.get(preview);
  if(!parsed||[workspaceId,projectId,assetId].some(value=>typeof value!=='string'||!UUID.test(value))||
      typeof expectedOriginalSHA256!=='string'||!SHA.test(expectedOriginalSHA256)||
      !Number.isSafeInteger(expectedCullingVersion)||expectedCullingVersion<0||
      expectedCullingVersion===Number.MAX_SAFE_INTEGER||
      typeof confirmImport!=='function'||typeof tokenProvider!=='function'||
      typeof selectionProvider!=='function'||typeof fetchImpl!=='function')fail('CONFIG_INVALID');
  const selected=async()=>{abort(signal);selection(await selectionProvider(),workspaceId,projectId,assetId);abort(signal);};
  await selected();
  if(await confirmImport({preview,signal})!==preview)fail('NOT_APPROVED');
  await selected();
  let bearer=await tokenProvider({signal});abort(signal);
  if(typeof bearer!=='string'||!bearer||bearer.length>8192||/\s/u.test(bearer))fail('TOKEN_INVALID');
  try{
    const sameBearer=()=>bearer;
    const gate=new WorkspaceSessionClient({baseURL,tokenProvider:sameBearer,fetchImpl});
    const client=new WorkspaceCullingClient({baseURL,tokenProvider:sameBearer,fetchImpl});
    const fresh=async()=>{await selected();await gate.getFreshSession({workspaceId,
      expectedSubject,expectedTenantId,access:'edit',signal});await selected();};
    const assetSHA=async()=>{
      await selected();
      const response=await fetchImpl(`${gate.baseURL}/v1/workspaces/${workspaceId}/projects/${projectId}/assets`,
        {method:'GET',signal,credentials:'omit',cache:'no-store',redirect:'error',
          referrerPolicy:'no-referrer',headers:{Authorization:`Bearer ${bearer}`}});
      abort(signal);
      if(!response||response.ok!==true||response.status!==200||response.redirected===true)
        fail('ASSET_READ_FAILED');
      const body=await response.json();abort(signal);await selected();
      if(!own(body,['assets','representation','proxyTransport'])||!Array.isArray(body.assets)||
          body.assets.length>10000||body.representation!=='PROXY_METADATA_ONLY'||
          body.proxyTransport!=='NOT_CONNECTED')fail('ASSET_RESPONSE_INVALID');
      const matches=body.assets.filter(asset=>asset?.id===assetId);
      if(matches.length!==1||matches[0].tenantId!==workspaceId||matches[0].deletedAt!==null||
          typeof matches[0].sha256!=='string'||!SHA.test(matches[0].sha256)||
          matches[0].sha256.toLowerCase()!==expectedOriginalSHA256.toLowerCase())
        fail('ASSET_IDENTITY_CHANGED');
      return matches[0].sha256.toLowerCase();
    };
    await fresh();
    const page=await client.getProjectPage({workspaceId,projectId,limit:1,signal});
    const before=await client.getAssetMark({workspaceId,projectId,assetId,signal});
    const sha=await assetSHA();await fresh();
    if(page.version!==expectedCullingVersion||before.version!==expectedCullingVersion||
        before.mark.assetId!==assetId)fail('VERSION_CONFLICT');
    const expected={...before.mark};
    if(parsed.hasRating)expected.rating=parsed.rating;
    if(parsed.hasLabel)expected.colorLabel=parsed.label;
    if(markMatches(before.mark,expected)){
      const stable=await client.getProjectPage({workspaceId,projectId,limit:1,signal});
      if(stable.version!==expectedCullingVersion)fail('VERSION_CONFLICT');
      await fresh();
      return outcome('UNCHANGED_AT_READ_TIME',
        {assetId,expectedCullingVersion,confirmedVersion:expectedCullingVersion});
    }
    let saved;
    try{
      saved=await client.saveAssetMark({workspaceId,projectId,assetId,baseVersion:expectedCullingVersion,
        rating:expected.rating,flag:expected.flag,colorLabel:expected.colorLabel,
        tags:expected.tags,segmentId:expected.segmentId,signal});
    }catch(error){
      return outcome(error instanceof WorkspaceCullingHTTPError&&error.status===409?
        'CONFLICT_RELOAD_REQUIRED':'UNVERIFIED_RELOAD_REQUIRED',{assetId,expectedCullingVersion});
    }
    try{
      const after=await client.getAssetMark({workspaceId,projectId,assetId,signal});
      const verifiedPage=await client.getProjectPage({workspaceId,projectId,limit:1,signal});
      const verifiedSHA=await assetSHA();await fresh();
      if(verifiedSHA!==sha||saved.version!==expectedCullingVersion+1||
          after.version!==saved.version||verifiedPage.version!==saved.version||
          !markMatches(saved.mark,expected)||!markMatches(after.mark,expected))
        return outcome('UNVERIFIED_RELOAD_REQUIRED',{assetId,expectedCullingVersion});
      return outcome('VERIFIED_SAVED_AT_READ_TIME',
        {assetId,expectedCullingVersion,confirmedVersion:saved.version});
    }catch{return outcome('UNVERIFIED_RELOAD_REQUIRED',{assetId,expectedCullingVersion});}
  }finally{bearer=undefined;}
}
