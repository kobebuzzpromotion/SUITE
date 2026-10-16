import {WorkspaceSessionClient, WorkspaceSessionHTTPError} from './workspace-session-client.mjs';
import {WorkspaceCullingClient, WorkspaceCullingHTTPError} from './workspace-culling-client.mjs';
import {mountWorkspaceCullingPanel} from './workspace-culling-panel.mjs';
import {createVerifiedWorkspaceCullingXMPSidecar} from './workspace-culling-xmp-sidecar.mjs';
import {applyVerifiedWorkspaceCullingXMPImport} from './workspace-culling-xmp-import.mjs';

/**
 * Node Workspace host boundary, not Trial/Cloud or AI culling. The existing
 * panel also creates Segments, so only OWNER/ADMIN may mount until it has
 * role-specific controls. A trusted host supplies current selection and a
 * fresh Node bearer; neither token nor any secret is retained by this module.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/i;
const own = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length &&
  Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));
const abort = signal => {if (signal?.aborted) throw new DOMException('Culling request cancelled', 'AbortError');};
const denied = () => {throw new WorkspaceCullingHTTPError(403, 'CULLING_HOST_SCOPE_OR_ROLE_CHANGED');};

export async function mountVerifiedWorkspaceCulling({container, baseURL, tokenProvider,
  selectionProvider, workspaceId, projectId, assetId, expectedSubject, expectedTenantId,
  fetchImpl = globalThis.fetch, signal} = {}) {
  if (!container || typeof container.replaceChildren !== 'function' ||
      typeof tokenProvider !== 'function' || typeof selectionProvider !== 'function' ||
      [workspaceId, projectId, assetId].some(value => typeof value !== 'string' || !UUID.test(value)))
    throw Error('CULLING_VERIFIED_MOUNT_CONFIG_INVALID');
  const scope = Object.freeze({workspaceId, projectId, assetId});
  const selected = async () => {
    let value;
    try {value = await selectionProvider();} catch {denied();}
    if (!own(value, ['workspaceId', 'projectId', 'assetId']) ||
        Object.keys(scope).some(key => value[key] !== scope[key])) denied();
    abort(signal);
  };
  // Constructor validation also enforces HTTPS or loopback HTTP; no other
  // origin can receive the bearer. The host's tokenProvider is not called yet.
  const sessionConfig = {baseURL, fetchImpl};
  new WorkspaceSessionClient({...sessionConfig, tokenProvider});
  const verifiedTokenProvider = async ({signal: requestSignal} = {}) => {
    await selected(); abort(requestSignal);
    let token;
    try {token = await tokenProvider({signal: requestSignal});} catch (error) {
      if (requestSignal?.aborted || error?.name === 'AbortError')
        throw new DOMException('Culling request cancelled', 'AbortError');
      denied();
    }
    abort(requestSignal);
    try {
      // This exact token is returned to the immediately following Culling
      // request; a second host token call could switch accounts between gate
      // and action. It exists only in this one asynchronous operation.
      const gate = new WorkspaceSessionClient({...sessionConfig, tokenProvider: () => token});
      const identity = await gate.getFreshSession({workspaceId, expectedSubject, expectedTenantId,
        access: 'edit', signal: requestSignal});
      if (!['OWNER', 'ADMIN'].includes(identity.membership.role)) denied();
      await selected(); abort(requestSignal);
      return token;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (error instanceof WorkspaceSessionHTTPError && error.status === 401)
        throw new WorkspaceCullingHTTPError(401, 'CULLING_HOST_AUTH_REQUIRED');
      denied();
    }
  };
  const scopedFetch = async (url, init) => {
    await selected(); abort(init?.signal);
    const response = await fetchImpl(url, init);
    if(response?.redirected===true)throw Error('CULLING_RESPONSE_REDIRECTED');
    const checkedAfterWrite = async () => {
      try {await selected(); abort(init?.signal);} catch (error) {
        if (init?.method !== 'GET') throw Error('CULLING_VERIFIED_RESULT_UNCERTAIN');
        throw error;
      }
    };
    await checkedAfterWrite();
    // The existing client reads only ok/status/json. Recheck selection after
    // the body too, so an in-flight Asset switch cannot look saved in the UI.
    return {ok: response.ok, status: response.status, redirected: response.redirected, json: async () => {
      const value = await response.json();
      await checkedAfterWrite();
      return value;
    }};
  };
  await selected(); abort(signal);
  const client = new WorkspaceCullingClient({baseURL, tokenProvider: verifiedTokenProvider, fetchImpl: scopedFetch});
  const page = await client.getProjectPage({workspaceId, projectId, limit: 1, signal});
  const mark = await client.getAssetMark({workspaceId, projectId, assetId, signal});
  if (page.version !== mark.version || mark.mark.assetId !== assetId)
    throw Error('CULLING_VERIFIED_MOUNT_SNAPSHOT_CONFLICT');
  await selected(); abort(signal);
  const readCurrentAssetSHA = async requestSignal => {
    await selected();abort(requestSignal);
    // The SHA comes from the authenticated Node Asset registry, never a DOM
    // field, sidecar filename, or host assertion. Each XMP gate rechecks it.
    const bearer = await verifiedTokenProvider({signal: requestSignal});
    const assetResponse = await scopedFetch(`${new URL(baseURL).origin}/v1/workspaces/${workspaceId}/projects/${projectId}/assets`,
      {method: 'GET', signal: requestSignal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', headers: {Authorization: `Bearer ${bearer}`}});
    if (!assetResponse || assetResponse.ok !== true || assetResponse.status !== 200 || assetResponse.redirected === true)
      throw Error('CULLING_XMP_ASSET_READ_FAILED');
    const body = await assetResponse.json();abort(requestSignal);await selected();
    if (!own(body, ['assets', 'representation', 'proxyTransport']) || !Array.isArray(body.assets) ||
        body.assets.length > 10000 || body.representation !== 'PROXY_METADATA_ONLY' ||
        body.proxyTransport !== 'NOT_CONNECTED') throw Error('CULLING_XMP_ASSET_RESPONSE_INVALID');
    const matches = body.assets.filter(asset => asset?.id === assetId);
    if (matches.length !== 1 || matches[0].tenantId !== workspaceId || matches[0].deletedAt !== null ||
        typeof matches[0].sha256 !== 'string' || !SHA.test(matches[0].sha256))
      throw Error('CULLING_XMP_ASSET_IDENTITY_CHANGED');
    return matches[0].sha256;
  };
  const xmpProvider = async ({expectedCullingVersion, signal: requestSignal}) => {
    await selected();abort(requestSignal);
    if (!Number.isSafeInteger(expectedCullingVersion) || expectedCullingVersion < 0)
      throw Error('CULLING_XMP_VERSION_INVALID');
    const sha=await readCurrentAssetSHA(requestSignal);
    const result = await createVerifiedWorkspaceCullingXMPSidecar({baseURL,
      tokenProvider: verifiedTokenProvider, selectionProvider, workspaceId, projectId, assetId,
      expectedSubject, expectedTenantId, expectedOriginalSHA256: sha,
      expectedCullingVersion, signal: requestSignal, fetchImpl: scopedFetch});
    await selected();abort(requestSignal);
    return result;
  };
  const xmpImportProvider=async({preview,expectedCullingVersion,confirmImport,signal:requestSignal})=>{
    await selected();abort(requestSignal);
    if(!Number.isSafeInteger(expectedCullingVersion)||expectedCullingVersion<0||
        typeof confirmImport!=='function')throw Error('CULLING_XMP_IMPORT_CONFIG_INVALID');
    const sha=await readCurrentAssetSHA(requestSignal);
    const result=await applyVerifiedWorkspaceCullingXMPImport({preview,confirmImport,baseURL,
      tokenProvider:verifiedTokenProvider,selectionProvider,workspaceId,projectId,assetId,
      expectedSubject,expectedTenantId,expectedOriginalSHA256:sha,
      expectedCullingVersion,signal:requestSignal,fetchImpl:scopedFetch});
    await selected();abort(requestSignal);
    return result;
  };
  const panel = mountWorkspaceCullingPanel({container, baseURL, tokenProvider: verifiedTokenProvider,
    workspaceId, projectId, assetId, fetchImpl: scopedFetch, preflightEnabled: true,
    xmpProvider,xmpImportProvider,
    bulkTagHost:{expectedSubject,expectedTenantId,assertHostSelection:async({signal:requestSignal})=>{
      await selected();abort(requestSignal);
    }}});
  let disposed = false;
  return Object.freeze({getState: () => panel.getState(), refresh: () => panel.refresh(),
    dispose: () => {if (disposed) return; disposed = true; panel.dispose();},
    /** Host calls this immediately when its selected Asset/Project changes. */
    checkSelection: async () => {
      if (disposed) return false;
      try {await selected(); return true;} catch {disposed = true; panel.dispose(); return false;}
    }});
}
