import {WorkspacePresetClient} from './workspace-preset-client.mjs';
import {decodePortablePresetSnapshot} from './delta66-preset-catalog.mjs';

const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?
  '['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
/** Existing Node Workspace routes only. Sharing means a NEW WORKSPACE snapshot for current
 * members; it is not a public token/link, entitlement transfer or COMMUNITY publication.
 * WorkspacePresetClient performs a fresh subject/tenant/membership gate for each operation;
 * the server enforces manage-presets for Workspace creation and edit for Personal copies.
 */
export function createWorkspacePresetSharing(config){
  const client=new WorkspacePresetClient(config);
  async function createAndRead(scope,name,body,signal){
    const created=await client.createPreset({scope,name,body,signal});
    try{
      const result=await client.getPreset(created.preset.id,{signal}),row=result.preset;
      if(row.version!==1||row.scope!==scope||row.name!==name.trim()||canonical(row.body)!==canonical(body))
        throw Error('PRESET_SHARED_SNAPSHOT_READBACK_MISMATCH');
      return row;
    }catch(error){
      // Creation may already have committed. Do not silently retry and create another copy.
      if(error&&typeof error==='object')error.createdPresetId=created.preset.id;
      throw error;
    }
  }
  async function shareSnapshot({presetId,expectedVersion,name,confirmed=false,signal}={}){
    if(confirmed!==true||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw Error('PRESET_SHARE_CONFIRMATION_REQUIRED');
    const {preset}=await client.getPreset(presetId,{signal});
    if(preset.version!==expectedVersion)throw Error('PRESET_SHARE_SOURCE_VERSION_CHANGED');
    const copied=await createAndRead('WORKSPACE',name??preset.name,structuredClone(preset.body),signal);
    return {preset:copied,source:{id:preset.id,version:preset.version},
      sharing:'workspace-members-snapshot',sourceUpdated:false};
  }
  async function importSnapshot({token,name,confirmed=false,signal}={}){
    if(confirmed!==true)throw Error('PRESET_IMPORT_CONFIRMATION_REQUIRED');
    const draft=decodePortablePresetSnapshot(token);
    const preset=await createAndRead('PERSONAL',name??draft.name,draft.recipe,signal);
    return {preset,importedAs:'personal-portable-copy',tokenGrantedAuthority:false};
  }
  return Object.freeze({shareSnapshot,importSnapshot});
}
