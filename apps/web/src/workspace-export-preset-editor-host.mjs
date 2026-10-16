import {WorkspaceSessionClient} from './workspace-session-client.mjs';
import {WorkspaceExportPresetClient,validateWorkspaceExportPresetSettings} from './workspace-export-preset-client.mjs';

// Caller mode is only a routing hint, never authentication evidence.
const verifiedHosts=new WeakSet();
export const WORKSPACE_EXPORT_PRESET_EDITOR_BLOCKERS=Object.freeze([
  'NODE_WORKSPACE_AUTHENTICATED_SESSION_REQUIRED','SAME_ORIGIN_WORKSPACE_API_REQUIRED',
]);
export function inspectWorkspaceExportPresetEditorHost({workspaceHost}={}){
  const available=Boolean(workspaceHost&&verifiedHosts.has(workspaceHost));
  return Object.freeze({available,blockers:available?Object.freeze([]):WORKSPACE_EXPORT_PRESET_EDITOR_BLOCKERS});
}

/** Never exchanges Trial/Sites cookies or infers a Node principal from them. */
export async function createWorkspaceExportPresetEditorHost({trialSession,workspaceContext,readSettings,applySettings,canUse,signal}={}){
  const principal=trialSession?.principal;
  if(trialSession?.mode!=='NODE_WORKSPACE'||!principal||!workspaceContext||
      principal.subject!==workspaceContext.expectedSubject||principal.tenantId!==workspaceContext.expectedTenantId||
      [readSettings,applySettings,canUse].some(fn=>typeof fn!=='function'))
    throw Error('WORKSPACE_EXPORT_PRESET_EDITOR_NODE_IDENTITY_REQUIRED');
  const {workspaceId,expectedSubject,expectedTenantId,tokenProvider}=workspaceContext;
  const baseURL=globalThis.location?.origin;
  if(typeof tokenProvider!=='function')throw Error('WORKSPACE_EXPORT_PRESET_EDITOR_TOKEN_PROVIDER_REQUIRED');
  const guardedTokenProvider=async({signal:operationSignal}={})=>{
    guard(operationSignal);const token=await tokenProvider({signal:operationSignal??signal});guard(operationSignal);return token;
  };
  const client=new WorkspaceExportPresetClient({baseURL,workspaceId,expectedSubject,expectedTenantId,tokenProvider:guardedTokenProvider});
  const gate=new WorkspaceSessionClient({baseURL,tokenProvider:guardedTokenProvider});
  function guard(operationSignal){
    if(signal?.aborted||operationSignal?.aborted)throw new DOMException('Workspace Export cancelled','AbortError');
    if(trialSession.mode!=='NODE_WORKSPACE'||trialSession.principal!==principal||principal.subject!==expectedSubject||
        principal.tenantId!==expectedTenantId)throw Error('WORKSPACE_EXPORT_PRESET_EDITOR_IDENTITY_CHANGED');
  }
  async function authorize(operationSignal){
    guard(operationSignal);
    await gate.getFreshSession({workspaceId,expectedSubject,expectedTenantId,access:'edit',signal:operationSignal??signal});
    guard(operationSignal);
  }
  await authorize(signal);
  const host=Object.freeze({
    async applySettings({settings,signal:operationSignal}={}){
      const checked=validateWorkspaceExportPresetSettings(settings);
      await authorize(operationSignal);
      if(canUse()!==true)throw Error('WORKSPACE_EXPORT_PRESET_EDITOR_NOT_READY');
      // Actual Editor form provides atomic validation, readback and rollback.
      // No photo recipe mutation or assertion of successful image export.
      const result=validateWorkspaceExportPresetSettings(applySettings(checked));
      if(JSON.stringify(result)!==JSON.stringify(checked))throw Error('WORKSPACE_EXPORT_PRESET_APPLY_READBACK_MISMATCH');
      return result;
    },
    async readCurrentSettings({signal:operationSignal}={}){
      await authorize(operationSignal);
      if(canUse()!==true)throw Error('WORKSPACE_EXPORT_PRESET_EDITOR_NOT_READY');
      return validateWorkspaceExportPresetSettings(readSettings());
    },
  });
  const connection=Object.freeze({client,host});verifiedHosts.add(connection);return connection;
}

export function createWorkspaceExportPresetEditorNotice({document}={}){
  if(!document||typeof document.createElement!=='function')throw Error('WORKSPACE_EXPORT_PRESET_EDITOR_DOCUMENT_REQUIRED');
  const note=document.createElement('p');note.className='control-help';note.setAttribute('role','note');
  note.textContent='Workspace共有は実Node認証・所属確認と同じoriginのWorkspace API接続が必要です。ローカル書き出し設定はブラウザ内だけに保存され、共有済みにはなりません。';
  return note;
}
