import {WorkspaceSessionClient} from './workspace-session-client.mjs';
import {WorkspaceCullingClient} from './workspace-culling-client.mjs';

/**
 * Node Workspace single-photo, data-only XMP sidecar bytes. No OS write, RAW
 * mutation, metadata merge, Final authorization or Cloud connection.
 * Adobe XMP Basic: https://developer.adobe.com/xmp/docs/xmp-namespaces/xmp/
 * Adobe serialization: https://developer.adobe.com/xmp/docs/xmp-specifications/
 * xmp:Rating is -1 (rejected) or 0..5; xmp:Label is free text, NOT a
 * standardized color-palette code. There is no verified independent Pick
 * property here, so Pick and simultaneous reject+stars fail closed.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/i;
const fail=code=>{throw Error(`CULLING_XMP_${code}`);};
const abort=signal=>{if(signal?.aborted)throw new DOMException('XMP generation cancelled','AbortError');};
function own(value,keys){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value))&&
  Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function selection(value,workspaceId,projectId,assetId){
  if(!own(value,['workspaceId','projectId','assetId'])||value.workspaceId!==workspaceId||
      value.projectId!==projectId||value.assetId!==assetId)fail('SELECTION_CHANGED');
}
function xmlText(value){
  if(typeof value!=='string'||!value||value.length>120||value.trim()!==value)fail('LABEL_INVALID');
  for(const ch of value){const cp=ch.codePointAt(0);
    if(!(cp===9||cp===10||cp===13||cp>=0x20&&cp<=0xd7ff||
        cp>=0xe000&&cp<=0xfffd||cp>=0x10000&&cp<=0x10ffff))fail('LABEL_INVALID');}
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&apos;');
}
function mappedMark(mark,assetId){
  if(!own(mark,['assetId','rating','flag','colorLabel','tags','segmentId'])||mark.assetId!==assetId||
      !Number.isInteger(mark.rating)||mark.rating<0||mark.rating>5||
      !['none','pick','reject'].includes(mark.flag)||
      !Array.isArray(mark.tags)||mark.tags.length!==0||mark.segmentId!==null)fail('MARK_UNREPRESENTABLE');
  if(mark.flag==='pick'||mark.flag==='reject'&&mark.rating!==0)fail('FLAG_MAPPING_UNVERIFIED');
  if(mark.colorLabel!==null&&typeof mark.colorLabel!=='string')fail('LABEL_INVALID');
  const rating=mark.flag==='reject'?-1:mark.rating;
  const label=mark.colorLabel===null?null:xmlText(mark.colorLabel);
  return {rating,label};
}
function packet({rating,label}){
  const labelProperty=label===null?'':`\n      <xmp:Label>${label}</xmp:Label>`;
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n`+
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n`+
    `  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n`+
    `    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">\n`+
    `      <xmp:Rating>${rating}</xmp:Rating>${labelProperty}\n`+
    `    </rdf:Description>\n`+
    `  </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>\n`;
}

/**
 * A trusted Node host supplies current explicit selection and fresh bearer.
 * Those inputs are not themselves authority: the server session, Asset and
 * mark are re-read twice. The result is only a reference to this read moment.
 */
export async function createVerifiedWorkspaceCullingXMPSidecar(input){
  if(!own(input,['baseURL','tokenProvider','selectionProvider','workspaceId','projectId','assetId',
    'expectedSubject','expectedTenantId','expectedOriginalSHA256','expectedCullingVersion'])&&
     !own(input,['baseURL','tokenProvider','selectionProvider','workspaceId','projectId','assetId',
       'expectedSubject','expectedTenantId','expectedOriginalSHA256','expectedCullingVersion','signal'])&&
     !own(input,['baseURL','tokenProvider','selectionProvider','workspaceId','projectId','assetId',
       'expectedSubject','expectedTenantId','expectedOriginalSHA256','expectedCullingVersion','fetchImpl'])&&
     !own(input,['baseURL','tokenProvider','selectionProvider','workspaceId','projectId','assetId',
       'expectedSubject','expectedTenantId','expectedOriginalSHA256','expectedCullingVersion','signal','fetchImpl']))
    fail('CONFIG_INVALID');
  const {baseURL,tokenProvider,selectionProvider,workspaceId,projectId,assetId,expectedSubject,
    expectedTenantId,expectedOriginalSHA256,expectedCullingVersion,signal,
    fetchImpl=globalThis.fetch}=input;
  if([workspaceId,projectId,assetId].some(value=>typeof value!=='string'||!UUID.test(value))||
      typeof expectedOriginalSHA256!=='string'||!SHA.test(expectedOriginalSHA256)||
      !Number.isSafeInteger(expectedCullingVersion)||expectedCullingVersion<0||
      typeof tokenProvider!=='function'||typeof selectionProvider!=='function'||typeof fetchImpl!=='function')
    fail('CONFIG_INVALID');
  const currentSelection=async()=>{abort(signal);selection(await selectionProvider(),workspaceId,projectId,assetId);abort(signal);};
  const readAssets=async(token,origin)=>{
    await currentSelection();
    const url=`${origin}/v1/workspaces/${workspaceId}/projects/${projectId}/assets`;
    const response=await fetchImpl(url,{method:'GET',signal,credentials:'omit',cache:'no-store',
      redirect:'error',referrerPolicy:'no-referrer',headers:{Authorization:`Bearer ${token}`}});
    abort(signal);
    if(!response||response.ok!==true||response.status!==200||response.redirected===true)fail('ASSET_READ_FAILED');
    const body=await response.json();abort(signal);await currentSelection();
    if(!own(body,['assets','representation','proxyTransport'])||!Array.isArray(body.assets)||
        body.assets.length>10000||body.representation!=='PROXY_METADATA_ONLY'||
        body.proxyTransport!=='NOT_CONNECTED')fail('ASSET_RESPONSE_INVALID');
    const matches=body.assets.filter(asset=>asset?.id===assetId);
    if(matches.length!==1||matches[0].tenantId!==workspaceId||matches[0].deletedAt!==null||
        typeof matches[0].sha256!=='string'||!SHA.test(matches[0].sha256)||
        matches[0].sha256.toLowerCase()!==expectedOriginalSHA256.toLowerCase())fail('ASSET_IDENTITY_CHANGED');
    return matches[0].sha256.toLowerCase();
  };
  const read=async()=>{
    await currentSelection();
    // One bearer per complete read round. A live host may rotate users between
    // tokenProvider calls; separate clients must never read as separate users.
    let token=await tokenProvider({signal});abort(signal);
    if(typeof token!=='string'||!token||token.length>8192||/\s/u.test(token))fail('TOKEN_INVALID');
    try{
      const sameBearer=()=>token;
      const gate=new WorkspaceSessionClient({baseURL,tokenProvider:sameBearer,fetchImpl});
      const client=new WorkspaceCullingClient({baseURL,tokenProvider:sameBearer,fetchImpl});
      const fresh=async()=>{await currentSelection();await gate.getFreshSession({workspaceId,
        expectedSubject,expectedTenantId,access:'edit',signal});await currentSelection();};
      await fresh();
      const page=await client.getProjectPage({workspaceId,projectId,limit:1,signal});
      const mark=await client.getAssetMark({workspaceId,projectId,assetId,signal});
      const sha=await readAssets(token,gate.baseURL);
      await fresh();abort(signal);
      if(page.version!==expectedCullingVersion||mark.version!==expectedCullingVersion)fail('VERSION_CHANGED');
      return {sha,mark:mark.mark};
    }finally{token=undefined;}
  };
  const first=await read(),second=await read();
  abort(signal);
  if(first.sha!==second.sha||JSON.stringify(first.mark)!==JSON.stringify(second.mark))fail('SNAPSHOT_CHANGED');
  const mapped=mappedMark(second.mark,assetId);
  const bytes=new TextEncoder().encode(packet(mapped));
  if(bytes.length>4096)fail('PACKET_TOO_LARGE');
  return Object.freeze({assetId,originalSHA256:second.sha,cullingVersion:expectedCullingVersion,
    bytes,mimeType:'application/rdf+xml',extension:'.xmp',
    flagMapping:second.mark.flag==='reject'?'reject-as-rating-minus-one':'none',
    labelMeaning:second.mark.colorLabel===null?'none':'literal-text-not-standard-color',
    status:'VERIFIED_AT_READ_TIME_ONLY',authoritativeForFinal:false});
}
