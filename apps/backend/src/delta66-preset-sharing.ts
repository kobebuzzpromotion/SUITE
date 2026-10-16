import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {WorkspaceActor, WorkspaceRepository} from './workspace.js';

type Authority = Pick<WorkspaceRepository, 'authorize' | 'getPreset'>;
type Scope = 'PERSONAL' | 'WORKSPACE';
type JSONRecord = Record<string, unknown>;
function fail(code: string): never {throw Error(code);}
const identifier = (value: unknown): string => {
  if(typeof value!=='string'||!value.trim()||value.length>512||/[\u0000-\u001f\u007f]/u.test(value))fail('INVALID_PRESET_SHARING_ID');
  return value as string;
};
const version = (value: unknown): number => {
  if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>=Number.MAX_SAFE_INTEGER)fail('INVALID_PRESET_SHARING_VERSION');
  return value as number;
};
function record(value: unknown, keys: string[]): JSONRecord {
  if(!value||typeof value!=='object'||Array.isArray(value)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
      Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail('INVALID_PRESET_METADATA');
  return value as JSONRecord;
}
const tokenHash=(token:string)=>createHash('sha256').update(token,'utf8').digest('hex');

/** Explicit boundary from delta66-preset-library's local document into the server request.
 * `serverBaseVersion` MUST be the last server getMetadata.version, not the independently
 * incremented local document.version. This conversion drops only that local version field.
 * Local catalogs allow different versions of one preset and AUTHOR_* references; this
 * service deliberately supports only one CURRENT PERSONAL/WORKSPACE version per preset.
 * It rejects those broader local cases instead of silently choosing, upgrading or removing
 * references. saveMetadata subsequently checks current version/access using getPreset;
 * this structural conversion alone neither authorizes nor verifies reference freshness.
 */
export function presetLibraryDocumentToMetadataRequest(document: unknown, serverBaseVersion: number):
  {baseVersion: number; body: {schemaVersion: number; groups: unknown[]; entries: unknown[]}} {
  const local=record(document,['schemaVersion','version','groups','entries']);
  version(local.version);
  const baseVersion=version(serverBaseVersion);
  if(local.schemaVersion!==1||!Array.isArray(local.groups)||!Array.isArray(local.entries))
    fail('INVALID_PRESET_LIBRARY_DOCUMENT');
  const seen=new Set<string>();
  for(const raw of local.entries as unknown[]){
    const entry=record(raw,['kind','id','version','category','hot','groups','tags','outputIntent']);
    if(entry.kind!=='PERSONAL'&&entry.kind!=='WORKSPACE')fail('PRESET_METADATA_AUTHOR_REFERENCES_UNSUPPORTED');
    const id=identifier(entry.id);
    if(!version(entry.version))fail('INVALID_PRESET_METADATA_REFERENCE_VERSION');
    if(seen.has(id))fail('PRESET_METADATA_MULTIPLE_VERSIONS_UNSUPPORTED');
    seen.add(id);
  }
  return {baseVersion,body:{schemaVersion:1,groups:structuredClone(local.groups as unknown[]),
    entries:structuredClone(local.entries as unknown[])}};
}

/** Explicit schema initialization only. Nothing executes merely by importing this module.
 * The host supplies the SAME SQLite connection used by WorkspaceRepository, so ACL reads,
 * source liveness checks and writes participate in this transaction's database snapshot.
 */
export function initializeDelta66PresetSharing(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS delta66_preset_metadata (
      workspace_id TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('PERSONAL','WORKSPACE')),
      owner_key TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), body TEXT NOT NULL,
      editor_user_id TEXT NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY(workspace_id,scope,owner_key));
    CREATE TABLE IF NOT EXISTS delta66_preset_share (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, creator_user_id TEXT NOT NULL,
      source_preset_id TEXT NOT NULL, source_version INTEGER NOT NULL CHECK(source_version>0),
      source_scope TEXT NOT NULL CHECK(source_scope IN ('PERSONAL','WORKSPACE')),
      source_name TEXT NOT NULL, snapshot TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      audience TEXT NOT NULL CHECK(audience='WORKSPACE_MEMBERS'), recipient_user_id TEXT,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER,
      CHECK(expires_at>created_at));
    CREATE INDEX IF NOT EXISTS delta66_preset_share_source
      ON delta66_preset_share(workspace_id,source_preset_id);
  `);
}

/** Authenticated service, not an HTTP handler. actor MUST originate from existing verified
 * server auth. Public/anonymous/community access is deliberately absent. No original images,
 * credentials or raw bearer tokens are stored. No changes to existing tables/routes are made.
 */
export class Delta66PresetSharingService {
  constructor(private readonly db: DatabaseSync, private readonly authority: Authority,
    private readonly now: ()=>number = Date.now) {}
  private timestamp(): number {
    const value=this.now();if(!Number.isSafeInteger(value)||value<0)fail('INVALID_PRESET_SHARING_CLOCK');return value;
  }
  private transaction<T>(work:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    try{const result=work();this.db.exec('COMMIT');return result;}
    catch(error){try{this.db.exec('ROLLBACK');}catch{}throw error;}
  }
  private scope(actor:WorkspaceActor,workspaceId:string,scope:Scope,write:boolean):string {
    identifier(workspaceId);identifier(actor.userId);
    if(scope!=='PERSONAL'&&scope!=='WORKSPACE')fail('INVALID_PRESET_METADATA_SCOPE');
    this.authority.authorize(actor,workspaceId,write?(scope==='WORKSPACE'?'manage-presets':'edit'):'read');
    return scope==='PERSONAL'?actor.userId:'';
  }
  // Unlike the local catalog: no root version, no AUTHOR_* entries, no historical/multiple
  // versions per ID. getPreset is the existing current-version-only authorized API.
  private metadataBody(actor:WorkspaceActor,workspaceId:string,scope:Scope,input:unknown):string {
    const body=record(input,['schemaVersion','groups','entries']);
    if(body.schemaVersion!==1||!Array.isArray(body.groups)||body.groups.length>256||
        !Array.isArray(body.entries)||body.entries.length>10000)fail('INVALID_PRESET_METADATA');
    const groups=new Set<string>(),entries=new Set<string>();
    for(const raw of body.groups as unknown[]){
      const group=record(raw,['id','name']),id=identifier(group.id),name=identifier(group.name);
      if(groups.has(id)||name.length>255)fail('INVALID_PRESET_METADATA_GROUP');groups.add(id);
    }
    for(const raw of body.entries as unknown[]){
      const entry=record(raw,['kind','id','version','category','hot','groups','tags','outputIntent']);
      const id=identifier(entry.id),v=version(entry.version);
      if(!v||entries.has(id)||!['PERSONAL','WORKSPACE'].includes(String(entry.kind))||
          !['default','adjusted'].includes(String(entry.category))||typeof entry.hot!=='boolean'||
          !['any','print','sns'].includes(String(entry.outputIntent))||!Array.isArray(entry.groups)||entry.groups.length>64||
          !Array.isArray(entry.tags)||entry.tags.length>32)fail('INVALID_PRESET_METADATA_ENTRY');
      if(new Set(entry.groups).size!==entry.groups.length||entry.groups.some(value=>!groups.has(identifier(value))))fail('INVALID_PRESET_METADATA_GROUP');
      entry.tags.forEach(value=>{if(identifier(value).length>255)fail('INVALID_PRESET_METADATA_TAG');});
      const preset=this.authority.getPreset(actor,workspaceId,id);
      if(preset.version!==v||preset.scope!==entry.kind||scope==='WORKSPACE'&&preset.scope!=='WORKSPACE')
        fail('PRESET_METADATA_REFERENCE_STALE_OR_PRIVATE');
      entries.add(id);
    }
    const json=JSON.stringify(body);if(Buffer.byteLength(json,'utf8')>2*1024*1024)fail('PRESET_METADATA_TOO_LARGE');return json;
  }
  getMetadata(actor:WorkspaceActor,workspaceId:string,scope:Scope) {
    const owner=this.scope(actor,workspaceId,scope,false);
    const row=this.db.prepare('SELECT version,body,editor_user_id,updated_at FROM delta66_preset_metadata WHERE workspace_id=? AND scope=? AND owner_key=?').get(workspaceId,scope,owner);
    // Stored references may become stale/deleted. They are metadata, never authority to apply.
    return row?{version:Number(row.version),body:JSON.parse(String(row.body)),editorUserId:String(row.editor_user_id),updatedAt:Number(row.updated_at)}:
      {version:0,body:{schemaVersion:1,groups:[],entries:[]},editorUserId:null,updatedAt:null};
  }
  saveMetadata(actor:WorkspaceActor,workspaceId:string,scope:Scope,input:{baseVersion:number;body:unknown}) {
    return this.transaction(()=>{
      const owner=this.scope(actor,workspaceId,scope,true),base=version(input.baseVersion);
      const body=this.metadataBody(actor,workspaceId,scope,input.body),timestamp=this.timestamp();
      const row=this.db.prepare('SELECT version FROM delta66_preset_metadata WHERE workspace_id=? AND scope=? AND owner_key=?').get(workspaceId,scope,owner);
      if(Number(row?.version??0)!==base)fail('PRESET_METADATA_VERSION_CONFLICT');
      if(row){
        const changed=this.db.prepare('UPDATE delta66_preset_metadata SET version=?,body=?,editor_user_id=?,updated_at=? WHERE workspace_id=? AND scope=? AND owner_key=? AND version=?')
          .run(base+1,body,actor.userId,timestamp,workspaceId,scope,owner,base);
        if(changed.changes!==1)fail('PRESET_METADATA_VERSION_CONFLICT');
      }else this.db.prepare('INSERT INTO delta66_preset_metadata VALUES(?,?,?,?,?,?,?)').run(workspaceId,scope,owner,1,body,actor.userId,timestamp);
      return this.getMetadata(actor,workspaceId,scope);
    });
  }
  issue(actor:WorkspaceActor,workspaceId:string,input:{presetId:string;expectedVersion:number;expiresAt:number;recipientUserId?:string;confirmed:boolean}) {
    return this.transaction(()=>{
      const at=this.timestamp();
      if(input.confirmed!==true||!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=at||input.expiresAt-at>30*24*60*60*1000)
        fail('INVALID_PRESET_SHARE_EXPIRY_OR_CONFIRMATION');
      const preset=this.authority.getPreset(actor,workspaceId,identifier(input.presetId));
      if(preset.version!==version(input.expectedVersion))fail('PRESET_SHARE_VERSION_CONFLICT');
      if(preset.scope!=='PERSONAL'&&preset.scope!=='WORKSPACE')fail('PRESET_SHARE_SCOPE_UNSUPPORTED');
      this.authority.authorize(actor,workspaceId,preset.scope==='WORKSPACE'?'manage-presets':'edit');
      const recipient=input.recipientUserId===undefined?null:identifier(input.recipientUserId);
      if(recipient)this.authority.authorize({userId:recipient},workspaceId,'read');
      const token=randomBytes(32).toString('base64url'),id=randomUUID(),snapshot=JSON.stringify(preset.body);
      this.db.prepare('INSERT INTO delta66_preset_share VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)').run(
        id,workspaceId,actor.userId,preset.id,preset.version,preset.scope,preset.name,snapshot,tokenHash(token),
        'WORKSPACE_MEMBERS',recipient,at,input.expiresAt);
      return {id,token,workspaceId,sourcePresetId:preset.id,sourceVersion:preset.version,expiresAt:input.expiresAt,
        audience:'WORKSPACE_MEMBERS' as const,recipientUserId:recipient};
    });
  }
  resolve(actor:WorkspaceActor,workspaceId:string,token:string) {
    return this.transaction(()=>{
      this.authority.authorize(actor,workspaceId,'read');
      if(typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token))fail('PRESET_SHARE_UNAVAILABLE');
      const row=this.db.prepare('SELECT * FROM delta66_preset_share WHERE workspace_id=? AND token_hash=?').get(workspaceId,tokenHash(token));
      if(!row||row.revoked_at!==null||Number(row.expires_at)<=this.timestamp()||
          row.recipient_user_id!==null&&row.recipient_user_id!==actor.userId)fail('PRESET_SHARE_UNAVAILABLE');
      const creator={userId:String(row.creator_user_id)};
      // Deleted source, removed creator, or revoked creator role makes the link unavailable.
      try{
        this.authority.authorize(creator,workspaceId,row.source_scope==='WORKSPACE'?'manage-presets':'edit');
        const live=this.authority.getPreset(creator,workspaceId,String(row.source_preset_id));
        if(live.scope!==row.source_scope)fail('PRESET_SHARE_UNAVAILABLE');
      }catch{fail('PRESET_SHARE_UNAVAILABLE');}
      return {shareId:String(row.id),workspaceId,name:String(row.source_name),body:JSON.parse(String(row.snapshot)),
        sourcePresetId:String(row.source_preset_id),sourceVersion:Number(row.source_version),expiresAt:Number(row.expires_at),
        disposition:'snapshot-only-not-applied' as const};
    });
  }
  revoke(actor:WorkspaceActor,workspaceId:string,shareId:string) {
    return this.transaction(()=>{
      this.authority.authorize(actor,workspaceId,'read');identifier(shareId);
      const row=this.db.prepare('SELECT creator_user_id,revoked_at FROM delta66_preset_share WHERE workspace_id=? AND id=?').get(workspaceId,shareId);
      if(!row)fail('PRESET_SHARE_NOT_FOUND');
      // An active creator may revoke even after losing edit; another member needs manage-presets.
      if(row.creator_user_id!==actor.userId)this.authority.authorize(actor,workspaceId,'manage-presets');
      if(row.revoked_at===null)this.db.prepare('UPDATE delta66_preset_share SET revoked_at=? WHERE workspace_id=? AND id=? AND revoked_at IS NULL').run(this.timestamp(),workspaceId,shareId);
      return {id:shareId,revoked:true};
    });
  }
}
