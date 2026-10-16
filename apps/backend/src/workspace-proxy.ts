import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import type {StorageProvider} from './storage.js';
import type {WorkspaceStorageLedger, StorageActor} from './workspace-storage.js';

export const MAX_PROXY_BYTES=16*1024*1024;
export interface ProxyScope {workspaceId:string;projectId:string;assetId:string}
export interface ProxyInput {operationId:string;level:'thumbnail'|'preview'|'high-preview';originalSHA256:string;recipeVersion:number;sha256:string;size:number;width:number;height:number;mimeType:'image/jpeg'|'image/png'}
export type ProxyRecord=ProxyInput&ProxyScope&{state:'pending'|'committed';verificationScope:'PROXY_ONLY_NOT_ORIGINAL_CLOUD_SAFE';resumeMode:'WHOLE_BLOB_RETRY'};
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
function checkInput(v:ProxyInput){
  if(!v||Object.keys(v).sort().join(',')!=='height,level,mimeType,operationId,originalSHA256,recipeVersion,sha256,size,width'||!uuid(v.operationId)||!sha(v.originalSHA256)||!sha(v.sha256)||!['thumbnail','preview','high-preview'].includes(v.level)||!['image/jpeg','image/png'].includes(v.mimeType)||![v.size,v.width,v.height,v.recipeVersion].every(n=>Number.isSafeInteger(n)&&n>0)||v.size>MAX_PROXY_BYTES||v.width*v.height>8_000_000||Math.max(v.width,v.height)>({thumbnail:512,preview:2048,'high-preview':4096}[v.level]))throw Error('INVALID_PROXY_INPUT');
}
function dimensions(bytes:Buffer,mime:string):[number,number]{
  if(mime==='image/png'){
    if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')throw Error('INVALID_PROXY_IMAGE');
    return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  }
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw Error('INVALID_PROXY_IMAGE');
  let p=2;
  while(p<bytes.length){
    if(bytes[p++]!==255)throw Error('INVALID_PROXY_IMAGE');while(bytes[p]===255)p++;
    const marker=bytes[p++];if(marker===undefined||marker===0xda||marker===0xd9)break;
    if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
    if(p+2>bytes.length)break;const length=bytes.readUInt16BE(p);if(length<2||p+length>bytes.length)break;
    if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)break;return [bytes.readUInt16BE(p+5),bytes.readUInt16BE(p+3)];}p+=length;
  }
  throw Error('INVALID_PROXY_IMAGE');
}
/** Auth is repeated by the owning HTTP scope callback. No original verification or eviction. */
export class WorkspaceProxyStore {
  private readonly db:DatabaseSync;
  constructor(path:string,private readonly storage:StorageProvider,private readonly ledger:WorkspaceStorageLedger){
    this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS workspace_proxy_operations(workspace_id TEXT NOT NULL,operation_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(workspace_id,operation_id));`);
  }
  close(){this.db.close();}
  private key(r:ProxyRecord){return 'proxy-'+createHash('sha256').update(JSON.stringify([r.workspaceId,r.sha256,r.size])).digest('hex');}
  private operation(r:ProxyRecord){return 'proxy-'+r.operationId;}
  get(scope:ProxyScope,operationId:string):ProxyRecord{
    if(!uuid(operationId))throw Error('INVALID_PROXY_OPERATION');
    const row=this.db.prepare('SELECT body,state FROM workspace_proxy_operations WHERE workspace_id=? AND project_id=? AND asset_id=? AND operation_id=?').get(scope.workspaceId,scope.projectId,scope.assetId,operationId);
    if(!row)throw Error('PROXY_NOT_FOUND');return {...JSON.parse(String(row.body)),state:String(row.state)} as ProxyRecord;
  }
  list(scope:ProxyScope):ProxyRecord[]{return this.db.prepare('SELECT operation_id FROM workspace_proxy_operations WHERE workspace_id=? AND project_id=? AND asset_id=? ORDER BY rowid DESC').all(scope.workspaceId,scope.projectId,scope.assetId).map(row=>this.get(scope,String(row.operation_id)));}
  begin(actor:StorageActor,scope:ProxyScope,input:ProxyInput,guard:()=>void):ProxyRecord{
    checkInput(input);guard();
    const record:ProxyRecord={operationId:input.operationId,level:input.level,originalSHA256:input.originalSHA256,recipeVersion:input.recipeVersion,sha256:input.sha256,size:input.size,width:input.width,height:input.height,mimeType:input.mimeType,...scope,state:'pending',verificationScope:'PROXY_ONLY_NOT_ORIGINAL_CLOUD_SAFE',resumeMode:'WHOLE_BLOB_RETRY'};
    const stored=this.db.prepare('SELECT body FROM workspace_proxy_operations WHERE workspace_id=? AND operation_id=?').get(scope.workspaceId,input.operationId);
    const body=JSON.stringify(record);
    if(stored&&stored.body!==body)throw Error('PROXY_OPERATION_CONFLICT');
    if(!stored)this.db.prepare('INSERT INTO workspace_proxy_operations VALUES(?,?,?,?,?,?)').run(scope.workspaceId,input.operationId,scope.projectId,scope.assetId,body,'pending');
    this.ledger.reserve(actor,{operationId:this.operation(record),category:'Proxy',sha256:input.sha256,size:input.size});
    return this.get(scope,input.operationId);
  }
  private async verified(r:ProxyRecord,guard:()=>void):Promise<Buffer>{
    guard();const evidence=await this.storage.inspect(this.key(r));guard();
    if(evidence.persisted!==true||evidence.sha256!==r.sha256||evidence.size!==r.size)throw Error('PROXY_VERIFICATION_FAILED');
    const chunks:Buffer[]=[];let size=0;const hash=createHash('sha256');
    for await(const chunk of this.storage.read(this.key(r))){guard();size+=chunk.byteLength;if(size>r.size)throw Error('SIZE_MISMATCH');hash.update(chunk);chunks.push(Buffer.from(chunk));}
    if(size!==r.size||hash.digest('hex')!==r.sha256)throw Error('CHECKSUM_MISMATCH');
    const bytes=Buffer.concat(chunks),[w,h]=dimensions(bytes,r.mimeType);if(w!==r.width||h!==r.height)throw Error('INVALID_PROXY_DIMENSIONS');guard();return bytes;
  }
  async upload(actor:StorageActor,scope:ProxyScope,operationId:string,source:AsyncIterable<Uint8Array>,guard:()=>void){
    const r=this.get(scope,operationId);guard();
    this.ledger.reserve(actor,{operationId:this.operation(r),category:'Proxy',sha256:r.sha256,size:r.size});
    const chunks:Buffer[]=[];let size=0;const hash=createHash('sha256');
    for await(const chunk of source){guard();size+=chunk.byteLength;if(size>r.size||size>MAX_PROXY_BYTES)throw Error('SIZE_MISMATCH');hash.update(chunk);chunks.push(Buffer.from(chunk));}
    if(size!==r.size||hash.digest('hex')!==r.sha256)throw Error('CHECKSUM_MISMATCH');
    const bytes=Buffer.concat(chunks),[w,h]=dimensions(bytes,r.mimeType);if(w!==r.width||h!==r.height)throw Error('INVALID_PROXY_DIMENSIONS');
    guard();await this.storage.putImmutable(this.key(r),(async function*(){yield bytes;})(),{sha256:r.sha256,size:r.size});
    await this.verified(r,guard);guard();
    this.ledger.commit(actor,this.operation(r),{sha256:r.sha256,size:r.size,persisted:true});
    this.db.prepare("UPDATE workspace_proxy_operations SET state='committed' WHERE workspace_id=? AND operation_id=?").run(scope.workspaceId,operationId);
    return this.get(scope,operationId);
  }
  async download(scope:ProxyScope,operationId:string,guard:()=>void){const record=this.get(scope,operationId);if(record.state!=='committed')throw Error('PROXY_NOT_COMMITTED');const bytes=await this.verified(record,guard);return {record,bytes};}
}
