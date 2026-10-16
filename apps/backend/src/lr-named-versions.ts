import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {WorkspaceActor, WorkspaceRepository, TeamRecipeVersion} from './workspace.js';

type Target={workspaceId:string;projectId:string;assetId:string};
type Entry={id:string;name:string;recipeId:string;recipeVersion:number;createdAt:string;updatedAt:string};
type Document={schemaVersion:1;revision:number;entries:Entry[];comparison:{left:string|null;right:string|null}};
type Authority=Pick<WorkspaceRepository,'authorize'|'recipeHistory'>;
const fail=(code:string):never=>{throw Error(code);};
function text(value:unknown,max=512):string {
  if(typeof value!=='string'||!value||value.trim()!==value||value.length>max||/[\u0000-\u001f\u007f]/u.test(value))return fail('NAMED_VERSION_INVALID_TEXT');
  return value;
}
function revision(value:unknown):number {
  if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>=Number.MAX_SAFE_INTEGER)return fail('NAMED_VERSION_INVALID_REVISION');
  return value as number;
}
const empty=():Document=>({schemaVersion:1,revision:0,entries:[],comparison:{left:null,right:null}});
function checked(value:Document):Document {
  if(value?.schemaVersion!==1||!Array.isArray(value.entries)||value.entries.length>1000||!value.comparison)fail('NAMED_VERSION_CORRUPT');
  revision(value.revision);const ids=new Set<string>();
  for(const entry of value.entries){
    text(entry.id);text(entry.recipeId);text(entry.name,120);
    if(ids.has(entry.id)||revision(entry.recipeVersion)<1||!Number.isFinite(Date.parse(entry.createdAt))||!Number.isFinite(Date.parse(entry.updatedAt)))fail('NAMED_VERSION_CORRUPT');
    ids.add(entry.id);
  }
  for(const id of [value.comparison.left,value.comparison.right])if(id!==null&&!ids.has(id))fail('NAMED_VERSION_CORRUPT');
  return value;
}

/** Explicit initialization, on the SAME connection as WorkspaceRepository.
 * Adds only this standalone service's table; no existing tables/routes are changed.
 * One personal catalog per authenticated member and asset, shared across that
 * member's devices. It is not a team/public catalog or an authorization grant.
 */
export function initializeNamedRecipeVersions(db:DatabaseSync):void {
  db.exec(`CREATE TABLE IF NOT EXISTS lr_named_recipe_versions (
    workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, asset_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
    body TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(workspace_id,project_id,asset_id,owner_user_id));`);
}

/** Host must inject verified server-auth actor and the repository using exactly db.
 * All methods perform ACL/liveness/history reads in the same SQLite transaction
 * as metadata read/CAS write. Do not call inside an existing transaction.
 * Persisted data consists only of names/references/comparison IDs; original bytes,
 * Recipe bodies and credentials are never copied into this table.
 * Server document.revision is independent of lr-named-versions.mjs local revision:
 * callers must fetch this service's document and use its revision for each command.
 * No offline blind merge or implicit local-catalog upload is supported.
 */
export class NamedRecipeVersionsService {
  constructor(private readonly db:DatabaseSync,private readonly authority:Authority,
    private readonly now:()=>number=Date.now){}
  private transaction<T>(work:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    try{const result=work();this.db.exec('COMMIT');return result;}
    catch(error){try{this.db.exec('ROLLBACK');}catch{}throw error;}
  }
  private history(actor:WorkspaceActor,target:Target,write:boolean):TeamRecipeVersion[] {
    text(actor.userId);text(target.workspaceId);text(target.projectId);text(target.assetId);
    this.authority.authorize(actor,target.workspaceId,write?'edit':'read');
    // recipeHistory calls getAsset: revoked membership, deleted project/asset and
    // invalid Recipe bindings fail here rather than reviving a stale local name.
    return this.authority.recipeHistory(actor,target.workspaceId,target.projectId,target.assetId).filter(row=>!row.branch);
  }
  private load(actor:WorkspaceActor,target:Target):Document {
    const row=this.db.prepare('SELECT revision,body FROM lr_named_recipe_versions WHERE workspace_id=? AND project_id=? AND asset_id=? AND owner_user_id=?')
      .get(target.workspaceId,target.projectId,target.assetId,actor.userId);
    if(!row)return empty();
    const d=checked(JSON.parse(String(row.body)) as Document);
    if(d.revision!==Number(row.revision))fail('NAMED_VERSION_CORRUPT');return d;
  }
  private resolveEntry(entry:Entry,history:TeamRecipeVersion[]):TeamRecipeVersion {
    const row=history.find(row=>row.id===entry.recipeId&&row.version===entry.recipeVersion);
    return row??fail('NAMED_VERSION_REFERENCE_UNAVAILABLE');
  }
  private update(actor:WorkspaceActor,target:Target,baseRevision:number,
    change:(document:Document,history:TeamRecipeVersion[],at:string)=>void):Document {
    return this.transaction(()=>{
      const base=revision(baseRevision),history=this.history(actor,target,true),d=this.load(actor,target);
      if(d.revision!==base)fail('NAMED_VERSION_CONFLICT');
      const clock=this.now();if(!Number.isSafeInteger(clock)||clock<0||clock>8640000000000000)fail('NAMED_VERSION_CLOCK');
      const at=new Date(clock).toISOString();change(d,history,at);d.revision=base+1;checked(d);
      const body=JSON.stringify(d);if(Buffer.byteLength(body)>1024*1024)fail('NAMED_VERSION_LIMIT');
      if(base===0)this.db.prepare('INSERT INTO lr_named_recipe_versions VALUES(?,?,?,?,?,?,?)').run(target.workspaceId,target.projectId,target.assetId,actor.userId,d.revision,body,at);
      else {
        const changed=this.db.prepare('UPDATE lr_named_recipe_versions SET revision=?,body=?,updated_at=? WHERE workspace_id=? AND project_id=? AND asset_id=? AND owner_user_id=? AND revision=?')
          .run(d.revision,body,at,target.workspaceId,target.projectId,target.assetId,actor.userId,base);
        if(changed.changes!==1)fail('NAMED_VERSION_CONFLICT');
      }
      return structuredClone(d);
    });
  }
  get(actor:WorkspaceActor,target:Target){return this.transaction(()=>{
    const history=this.history(actor,target,false),document=this.load(actor,target);
    return {document,unavailableEntryIds:document.entries.filter(e=>!history.some(v=>v.id===e.recipeId&&v.version===e.recipeVersion)).map(e=>e.id)};
  });}
  create(actor:WorkspaceActor,target:Target,input:{baseRevision:number;recipeId:string;recipeVersion:number;name:string}):Document {
    const label=text(input.name,120),recipeId=text(input.recipeId),recipeVersion=revision(input.recipeVersion);
    return this.update(actor,target,input.baseRevision,(d,history,at)=>{
      if(d.entries.length>=1000||recipeVersion<1)fail('NAMED_VERSION_LIMIT_OR_REFERENCE');
      const entry:Entry={id:randomUUID(),name:label,recipeId,recipeVersion,createdAt:at,updatedAt:at};
      this.resolveEntry(entry,history);d.entries.push(entry);
    });
  }
  rename(actor:WorkspaceActor,target:Target,input:{baseRevision:number;id:string;name:string}):Document {
    const id=text(input.id),label=text(input.name,120);
    return this.update(actor,target,input.baseRevision,(d,_history,at)=>{
      const entry=d.entries.find(e=>e.id===id)??fail('NAMED_VERSION_NOT_FOUND');entry.name=label;entry.updatedAt=at;
    });
  }
  remove(actor:WorkspaceActor,target:Target,input:{baseRevision:number;id:string}):Document {
    const id=text(input.id);return this.update(actor,target,input.baseRevision,d=>{
      const index=d.entries.findIndex(e=>e.id===id);if(index<0)fail('NAMED_VERSION_NOT_FOUND');d.entries.splice(index,1);
      if(d.comparison.left===id)d.comparison.left=null;if(d.comparison.right===id)d.comparison.right=null;
    });
  }
  selectComparison(actor:WorkspaceActor,target:Target,input:{baseRevision:number;left:string|null;right:string|null}):Document {
    const left=input.left===null?null:text(input.left),right=input.right===null?null:text(input.right);
    return this.update(actor,target,input.baseRevision,(d,history)=>{
      for(const id of [left,right])if(id!==null)this.resolveEntry(d.entries.find(e=>e.id===id)??fail('NAMED_VERSION_NOT_FOUND'),history);
      d.comparison={left,right};
    });
  }
  resolve(actor:WorkspaceActor,target:Target,id:string){return this.transaction(()=>{
    text(id);const history=this.history(actor,target,false),d=this.load(actor,target);
    const entry=d.entries.find(e=>e.id===id)??fail('NAMED_VERSION_NOT_FOUND');
    return {entry,recipe:this.resolveEntry(entry,history),metadataRevision:d.revision,originalUnchanged:true as const};
  });}
  compare(actor:WorkspaceActor,target:Target){return this.transaction(()=>{
    const history=this.history(actor,target,false),d=this.load(actor,target);
    const side=(id:string|null)=>{const entry=d.entries.find(e=>e.id===id)??fail('NAMED_VERSION_COMPARISON_INCOMPLETE');return {entry,recipe:this.resolveEntry(entry,history)};};
    return {left:side(d.comparison.left),right:side(d.comparison.right),metadataRevision:d.revision,rendered:false as const};
  });}
}
