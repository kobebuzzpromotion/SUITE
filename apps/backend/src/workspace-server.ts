import type {IncomingMessage, ServerResponse} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Principal} from './auth.js';
import {AssetRepository} from './repository.js';
import type {StorageProvider} from './storage.js';
import {WorkspaceRepository, type WorkspacePermission} from './workspace.js';
import {WorkspaceStorageLedger, type RemoteStorageConfiguration, type StorageAction, type UsageEvent} from './workspace-storage.js';
import {WorkspaceAccessGrants} from './workspace-access.js';
import {originalIntents, type PhotoIntent} from './photo-policy.js';
import {WorkspaceProxyStore, type ProxyInput} from './workspace-proxy.js';

async function body(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[]=[]; let size=0;
  for await(const chunk of req) {size+=chunk.length;if(size>512*1024)throw new Error('PAYLOAD_TOO_LARGE');chunks.push(chunk);}
  const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_BODY');
  return value as Record<string,any>;
}
function reply(res:ServerResponse,status:number,data:unknown) {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function exportPresetRequest(value:Record<string,any>,keys:readonly string[]):Record<string,any>{
  if(Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))throw Error('INVALID_EXPORT_PRESET_INPUT');
  return value;
}
const absentConfiguration:RemoteStorageConfiguration={revision:'unconfigured',storagePlans:[],studio:null,
  tariffs:{currency:null,storageGBMonthMinor:null,uploadGBMinor:null,downloadGBMinor:null,put1000Minor:null,get1000Minor:null,list1000Minor:null,other1000Minor:null}};
const storagePermission:Record<StorageAction,WorkspacePermission>={
  'read-storage':'read','manage-storage-plan':'owner','manage-entitlements':'owner',upload:'edit','manage-storage-objects':'delete','record-usage':'read'};

/** Supplemental authenticated routes. No production provider, billing checkout, or email delivery is claimed. */
export class WorkspaceHTTP {
  readonly workspaces:WorkspaceRepository;
  readonly ledger:WorkspaceStorageLedger;
  readonly grants:WorkspaceAccessGrants;
  readonly proxies:WorkspaceProxyStore;
  private recordingMeasuredUsage=false;
  constructor(directory:string,private readonly assets:AssetRepository,private readonly storage:StorageProvider,
    configuration:()=>RemoteStorageConfiguration=()=>absentConfiguration, now:()=>number=Date.now) {
    this.workspaces=new WorkspaceRepository(join(directory,'workspace.sqlite'),(wid,aid,deleted)=>assets.get(wid,aid,deleted));
    this.ledger=new WorkspaceStorageLedger(join(directory,'workspace-storage.sqlite'),configuration,
      (actor,action)=>{
        // Only the synchronous private server recorder may attribute an already authorized transfer
        // after membership is revoked. No HTTP body can enter this accounting context.
        if(action==='record-usage'&&this.recordingMeasuredUsage)return;
        this.workspaces.authorize(actor,actor.workspaceId,storagePermission[action]);
      });
    this.grants=new WorkspaceAccessGrants(join(directory,'workspace-grants.sqlite'),scope=>{
      this.workspaces.authorize({userId:scope.userId},scope.workspaceId,'export');
      this.assets.get(scope.workspaceId,scope.assetId);
    },now);
    this.proxies=new WorkspaceProxyStore(join(directory,'workspace-proxy.sqlite'),storage,this.ledger);
  }
  close(){this.proxies.close();this.grants.close();this.ledger.close();this.workspaces.close();}
  isManagedTenant(tenantId:string){return this.workspaces.hasWorkspace(tenantId);}
  async handle(req:IncomingMessage,res:ServerResponse,url:URL,principal:Principal):Promise<boolean> {
    if(!/^\/v1\/workspaces(?:\/|$)/.test(url.pathname))return false;
    const actor={userId:principal.subject},method=req.method;
    try {
      if(url.pathname==='/v1/workspaces') {
        if(method==='GET'){reply(res,200,{workspaces:this.workspaces.listWorkspaces(actor)});return true;}
        if(method==='POST'){const b=await body(req);reply(res,201,{workspace:this.workspaces.createWorkspace(actor,b.name)});return true;}
      }
      const parts=url.pathname.split('/').filter(Boolean);
      const wid=parts[2];if(!wid||!/^[a-f0-9-]{36}$/.test(wid))throw new Error('NOT_FOUND');
      const tail=parts.slice(3), section=tail[0],id=tail[1],action=tail[2];
      if(section==='invitations'&&id==='accept'&&tail.length===2&&method==='POST'){
        const b=await body(req);if(!principal.verifiedEmail)throw new Error('VERIFIED_EMAIL_REQUIRED');
        reply(res,200,{member:this.workspaces.acceptInvitation(actor,wid,b.token,principal.verifiedEmail)});return true;
      }
      const member=this.workspaces.authorize(actor,wid,'read');
      if(tail.length===0&&method==='GET'){reply(res,200,{workspace:this.workspaces.getWorkspace(actor,wid)});return true;}
      if(section==='session'&&tail.length===1&&method==='GET'){
        reply(res,200,{session:{subject:principal.subject,tenantId:principal.tenantId,workspaceId:wid,
          membership:{userId:member.userId,role:member.role,joinedAt:member.joinedAt}}});return true;
      }
      if(section==='session'&&tail.length===1&&method==='POST'){this.workspaces.recordEvent(actor,wid,'login',principal.subject);reply(res,200,{authenticated:true});return true;}
      if(section==='audit'&&tail.length===1&&method==='GET'){reply(res,200,{events:this.workspaces.listAudit(actor,wid)});return true;}
      if(section==='presets'){
        if(tail.length===1&&method==='GET'){reply(res,200,{presets:this.workspaces.listPresets(actor,wid)});return true;}
        if(tail.length===1&&method==='POST'){const b=await body(req);reply(res,201,{preset:this.workspaces.createPreset(actor,wid,{name:b.name,body:b.body,scope:b.scope})});return true;}
        if(id&&tail.length===2&&method==='GET'){reply(res,200,{preset:this.workspaces.getPreset(actor,wid,id)});return true;}
        if(id&&tail.length===2&&method==='PATCH'){const b=await body(req);reply(res,200,{preset:this.workspaces.updatePreset(actor,wid,id,{baseVersion:b.baseVersion,name:b.name,body:b.body})});return true;}
        if(id&&tail.length===2&&method==='DELETE'){this.workspaces.deletePreset(actor,wid,id);reply(res,200,{deleted:true,recipeSnapshotsRetained:true});return true;}
      }
      if(section==='export-presets'){
        if(tail.length===1&&method==='GET'){reply(res,200,{presets:this.workspaces.listExportPresets(actor,wid)});return true;}
        if(tail.length===1&&method==='POST'){
          const b=exportPresetRequest(await body(req),['scope','name','settings']);
          reply(res,201,{preset:this.workspaces.createExportPreset(actor,wid,{scope:b.scope,name:b.name,settings:b.settings})});return true;
        }
        if(id&&tail.length===2&&method==='GET'){reply(res,200,{preset:this.workspaces.getExportPreset(actor,wid,id)});return true;}
        if(id&&tail.length===2&&method==='PATCH'){
          const b=exportPresetRequest(await body(req),['baseVersion','name','settings']);
          reply(res,200,{preset:this.workspaces.updateExportPreset(actor,wid,id,{baseVersion:b.baseVersion,name:b.name,settings:b.settings})});return true;
        }
      }
      if(section==='members'){
        if(tail.length===1&&method==='GET'){reply(res,200,{members:this.workspaces.listMembers(actor,wid)});return true;}
        if(id&&tail.length===2&&method==='PATCH'){const b=await body(req);reply(res,200,{member:this.workspaces.setMemberRole(actor,wid,decodeURIComponent(id),b.role)});return true;}
        if(id&&tail.length===2&&method==='DELETE'){this.workspaces.removeMember(actor,wid,decodeURIComponent(id));reply(res,200,{removed:true});return true;}
      }
      if(section==='invitations'){
        if(tail.length===1&&method==='GET'){reply(res,200,{invitations:this.workspaces.listInvitations(actor,wid)});return true;}
        if(tail.length===1&&method==='POST'){const b=await body(req);reply(res,201,{...this.workspaces.inviteMember(actor,wid,{email:b.email,role:b.role,expiresAt:b.expiresAt}),delivery:'NOT_CONFIGURED'});return true;}
        if(id&&tail.length===2&&method==='DELETE'){this.workspaces.revokeInvitation(actor,wid,id);reply(res,200,{revoked:true});return true;}
      }
      if(section==='storage'&&tail.length===1&&method==='GET') {reply(res,200,{usage:this.ledger.usage({...actor,workspaceId:wid}),entitlements:this.ledger.entitlements({...actor,workspaceId:wid}),billing:'NOT_CONNECTED'});return true;}
      if(section==='storage'&&id==='cost'&&tail.length===2&&method==='GET'){reply(res,200,{report:this.ledger.costReport({...actor,workspaceId:wid},url.searchParams.get('period')??new Date().toISOString().slice(0,7))});return true;}
      if(section==='storage'&&id==='audit'&&tail.length===2&&method==='GET'){reply(res,200,{events:this.ledger.auditLog({...actor,workspaceId:wid})});return true;}
      if(section==='storage'&&['plan','entitlements','seats'].includes(id??'')&&tail.length===2&&['POST','PUT','PATCH'].includes(method??'')) {this.workspaces.authorize(actor,wid,'owner');reply(res,501,{error:'BILLING_NOT_CONNECTED',message:'購入・プラン変更は未接続です。既存原本は削除しません。'});return true;}
      if(section==='projects'){
        if(tail.length===1&&method==='GET'){reply(res,200,{projects:this.workspaces.listProjects(actor,wid)});return true;}
        if(tail.length===1&&method==='POST'){const b=await body(req);reply(res,201,{project:this.workspaces.createProject(actor,wid,b.name)});return true;}
        if(id&&tail.length===2&&method==='GET'){reply(res,200,{project:this.workspaces.getProject(actor,wid,id)});return true;}
        if(id&&action==='culling'){
          if(tail.length===3&&method==='GET'){
            const rawLimit=url.searchParams.get('limit');const limit=rawLimit===null?100:Number(rawLimit);
            reply(res,200,{culling:this.workspaces.getCullingPage(actor,wid,id,limit,url.searchParams.get('after'))});return true;
          }
          if(tail[3]==='export-preflight'&&tail.length===4&&method==='POST'){
            reply(res,200,{preflight:this.workspaces.preflightCullingExport(actor,wid,id,await body(req))});return true;
          }
          if(tail[3]==='segments'&&tail.length===4&&method==='POST'){
            reply(res,201,{culling:this.workspaces.createCullingSegment(actor,wid,id,await body(req))});return true;
          }
          if(tail[3]==='segments'&&tail[4]==='order'&&tail.length===5&&method==='PUT'){
            reply(res,200,{culling:this.workspaces.reorderCullingSegments(actor,wid,id,await body(req))});return true;
          }
          if(tail[3]==='segments'&&tail[4]&&tail.length===5&&method==='PATCH'){
            reply(res,200,{culling:this.workspaces.renameCullingSegment(actor,wid,id,decodeURIComponent(tail[4]),await body(req))});return true;
          }
        }
        if(id&&tail.length===3&&action==='trash'&&method==='POST'){
          const project=this.workspaces.getProject(actor,wid,id,true);this.workspaces.authorize(actor,wid,'manage-projects');
          if(project.deletedAt===null)this.workspaces.trashProject(actor,wid,id);
          this.reconcileProjectTrash(actor,wid,id);
          reply(res,200,{trashed:true,physicallyDeleted:false,usageRetained:true});return true;
        }
        if(id&&tail.length===3&&action==='restore'&&method==='POST'){
          const project=this.workspaces.restoreProject(actor,wid,id);
          this.reconcileProjectTrash(actor,wid,id);
          reply(res,200,{project,restored:true,physicallyDeleted:false});return true;
        }
        if(id&&action==='assets'){
          if(tail.length===3&&method==='GET'){reply(res,200,{assets:this.workspaces.listAssets(actor,wid,id),representation:'PROXY_METADATA_ONLY',proxyTransport:'NOT_CONNECTED'});return true;}
          if(tail.length===3&&method==='POST'){
            const b=await body(req);this.workspaces.authorize(actor,wid,'edit');this.workspaces.getProject(actor,wid,id);
            const asset=b.assetId?this.assets.get(wid,b.assetId):this.assets.createOrReuse(wid,{name:b.name,sha256:b.sha256,size:b.size});
            reply(res,201,{asset:this.workspaces.registerAsset(actor,wid,id,asset.id)});return true;
          }
          const aid=tail[3],operation=tail[4];
          if(aid&&operation==='proxies'){
            const scope={workspaceId:wid,projectId:id,assetId:aid},storageActor={...actor,workspaceId:wid};
            const guard=(input?:{originalSHA256:string;recipeVersion:number})=>{
              this.workspaces.authorize(actor,wid,method==='GET'?'read':'edit');
              const original=this.workspaces.getAsset(actor,wid,id,aid),recipe=this.workspaces.latestRecipe(actor,wid,id,aid);
              if(input&&(original.sha256!==input.originalSHA256||recipe?.version!==input.recipeVersion))throw Error('PROXY_SOURCE_CONFLICT');
            };
            guard();
            if(tail.length===5&&method==='GET'){
              const recipe=this.workspaces.latestRecipe(actor,wid,id,aid);
              reply(res,200,{proxies:this.proxies.list(scope).filter(r=>r.recipeVersion===recipe?.version),resumeMode:'WHOLE_BLOB_RETRY',maxBytes:16*1024*1024});return true;
            }
            if(tail.length===5&&method==='POST'){
              const input=await body(req) as unknown as ProxyInput;
              reply(res,201,{proxy:this.proxies.begin(storageActor,scope,input,()=>guard(input))});return true;
            }
            const proxyId=tail[5];
            if(proxyId&&(tail.length===6||tail.length===7&&tail[6]==='content')){
              const record=this.proxies.get(scope,proxyId);guard(record);
              if(tail.length===6&&method==='GET'){reply(res,200,{proxy:record});return true;}
              if(tail.length===7&&method==='PUT'){
                if(req.headers['content-type']!==record.mimeType)throw Error('INVALID_PROXY_MIME');
                let transferred=0;const measured=async function*(){for await(const chunk of req){transferred+=chunk.length;yield chunk;}};
                try{const proxy=await this.proxies.upload(storageActor,scope,proxyId,measured(),()=>guard(record));reply(res,200,{proxy});}
                finally{this.recordMeasuredTraffic(actor,wid,{uploadBytes:transferred,downloadBytes:0,exportBytes:0,put:1,get:0,list:0,other:0});}return true;
              }
              if(tail.length===7&&method==='GET'){
                const {bytes}=await this.proxies.download(scope,proxyId,()=>guard(record));guard(record);
                res.writeHead(200,{'Content-Type':record.mimeType,'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
                this.recordMeasuredTraffic(actor,wid,{uploadBytes:0,downloadBytes:bytes.length,exportBytes:0,put:0,get:1,list:0,other:0});return true;
              }
            }
          }
          if(aid&&tail.length===5){
            if(operation==='restore'&&method==='POST'){this.workspaces.restoreAsset(actor,wid,id,aid);this.accountTrash(actor,wid,aid,false);reply(res,200,{restored:true,physicallyDeleted:false});return true;}
            if(operation==='trash'&&method==='POST'){
              const existing=this.workspaces.getAsset(actor,wid,id,aid,true);
              if(existing.deletedAt===null)this.workspaces.trashAsset(actor,wid,id,aid);
              this.accountTrash(actor,wid,aid,true);reply(res,200,{trashed:true,physicallyDeleted:false,usageRetained:true});return true;
            }
            const asset=this.workspaces.getAsset(actor,wid,id,aid);
            if(operation==='recipe'){
              if(method==='GET'){reply(res,200,{recipe:this.workspaces.latestRecipe(actor,wid,id,aid)});return true;}
              if(method==='PUT'){const b=await body(req);const result=this.workspaces.saveRecipe(actor,wid,id,aid,{baseVersion:b.baseVersion,body:b.recipe,...(b.presetId===undefined?{}:{presetId:b.presetId})});reply(res,result.outcome==='conflict'?409:200,result);return true;}
            }
            if(operation==='versions'&&method==='GET'){reply(res,200,{versions:this.workspaces.recipeHistory(actor,wid,id,aid)});return true;}
            if(operation==='preset'&&method==='POST'){
              const b=await body(req);
              if(!Number.isSafeInteger(b.expectedPresetVersion)||b.expectedPresetVersion<1||
                  b.expectedPresetVersion>=Number.MAX_SAFE_INTEGER)throw new Error('INVALID_PRESET_VERSION');
              const result=this.workspaces.applyPreset(actor,wid,id,aid,b.baseVersion,b.presetId,
                b.expectedPresetVersion,b.expectedOriginalSHA256);
              reply(res,result.outcome==='conflict'?409:200,result);return true;
            }
            if(operation==='glow-preset'&&method==='POST'){
              const b=await body(req);
              const result=this.workspaces.applyGlowPresetVersioned(actor,wid,id,aid,{
                baseVersion:b.baseVersion,presetId:b.presetId,
                expectedPresetVersion:b.expectedPresetVersion,
                expectedOriginalSHA256:b.expectedOriginalSHA256});
              reply(res,200,result);return true;
            }
            if(operation==='grain-preset'&&method==='POST'){
              const b=await body(req);
              const result=this.workspaces.applyGrainPresetVersioned(actor,wid,id,aid,{
                baseVersion:b.baseVersion,presetId:b.presetId,
                expectedPresetVersion:b.expectedPresetVersion,
                expectedOriginalSHA256:b.expectedOriginalSHA256});
              reply(res,200,result);return true;
            }
            if(operation==='calibration-preset'&&method==='POST'){
              const b=await body(req);
              const result=this.workspaces.applyCalibrationPresetVersioned(actor,wid,id,aid,{
                baseVersion:b.baseVersion,presetId:b.presetId,
                expectedPresetVersion:b.expectedPresetVersion,
                expectedOriginalSHA256:b.expectedOriginalSHA256});
              reply(res,200,result);return true;
            }
            if(operation==='levels-preset'&&method==='POST'){
              const b=await body(req);
              const result=this.workspaces.applyLevelsPresetVersioned(actor,wid,id,aid,{
                baseVersion:b.baseVersion,presetId:b.presetId,
                expectedPresetVersion:b.expectedPresetVersion,
                expectedOriginalSHA256:b.expectedOriginalSHA256});
              reply(res,200,result);return true;
            }
            if(operation==='selective-preset'&&method==='POST'){
              const b=await body(req);
              const result=this.workspaces.applySelectivePresetVersioned(actor,wid,id,aid,{
                baseVersion:b.baseVersion,presetId:b.presetId,
                expectedPresetVersion:b.expectedPresetVersion,
                expectedOriginalSHA256:b.expectedOriginalSHA256});
              reply(res,200,result);return true;
            }
            if(operation==='vignette-preset'&&method==='POST'){
              const b=await body(req);
              const result=this.workspaces.applyVignettePresetVersioned(actor,wid,id,aid,{
                baseVersion:b.baseVersion,presetId:b.presetId,
                expectedPresetVersion:b.expectedPresetVersion,
                expectedOriginalSHA256:b.expectedOriginalSHA256});
              reply(res,200,result);return true;
            }
            if(operation==='selection'){
              if(method==='GET'){reply(res,200,{selection:this.workspaces.getSelection(actor,wid,id,aid)});return true;}
              if(method==='PUT'){const b=await body(req);reply(res,200,{selection:this.workspaces.saveSelection(actor,wid,id,aid,{baseVersion:b.baseVersion,selected:b.selected})});return true;}
            }
            if(operation==='culling'){
              if(method==='GET'){reply(res,200,{version:this.workspaces.getCullingVersion(actor,wid,id),mark:this.workspaces.getCullingMark(actor,wid,id,aid)});return true;}
              if(method==='PUT'){reply(res,200,{culling:this.workspaces.saveCullingMark(actor,wid,id,aid,await body(req))});return true;}
            }
            if(operation==='access'&&method==='POST'){
              const b=await body(req);const grant=this.grants.issue({...actor,workspaceId:wid,assetId:aid,purpose:b.purpose},b.lifetimeSeconds);
              reply(res,201,{...grant,path:`/v1/workspaces/${wid}/projects/${id}/assets/${aid}/original?purpose=${encodeURIComponent(b.purpose)}&grant=${grant.token}`});return true;
            }
            if(operation==='original'&&method==='PUT'){
              this.workspaces.authorize(actor,wid,'edit');
              const storageActor={...actor,workspaceId:wid};
              this.ledger.reserve(storageActor,{operationId:aid,category:'Original',sha256:asset.sha256,size:asset.size});
              // Existing immutable object key, not the accounting key. Retry can reconcile put→ledger→DB interruption.
              let measuredBytes=0,verified=asset;const workspaces=this.workspaces;
              const measured=async function*(){for await(const chunk of req){measuredBytes+=chunk.length;workspaces.authorize(actor,wid,'edit');workspaces.getAsset(actor,wid,id,aid);yield chunk;}};
              try{
                const evidence=await this.storage.putImmutable(asset.originalKey,measured(),{sha256:asset.sha256,size:asset.size});
                this.workspaces.authorize(actor,wid,'edit');this.workspaces.getAsset(actor,wid,id,aid);
                this.ledger.commit(storageActor,aid,evidence);
                verified=this.assets.markVerified(wid,aid,evidence);
              }finally{this.recordMeasuredTraffic(actor,wid,{uploadBytes:measuredBytes,downloadBytes:0,exportBytes:0,put:1,get:0,list:0,other:0});}
              reply(res,200,{asset:verified,verificationScope:'LOCAL_PROVIDER_ONLY_NOT_PRODUCTION_CLOUD'});return true;
            }
            if(operation==='original'&&method==='GET'){
              this.workspaces.authorize(actor,wid,'export');
              const purpose=url.searchParams.get('purpose') as PhotoIntent;
              if(!originalIntents.includes(purpose))throw new Error('ORIGINAL_REQUIRES_EXPLICIT_PROCESSING_INTENT');
              const grant=url.searchParams.get('grant');if(grant!==null)this.grants.verify({...actor,workspaceId:wid,assetId:aid,purpose},grant);
              if(!asset.cloudSafe){reply(res,409,{error:'WAITING_FOR_ORIGINAL',message:'Original取得待ち'});return true;}
              try {const proof=await this.storage.inspect(asset.originalKey);if(!proof.persisted||proof.sha256!==asset.sha256||proof.size!==asset.size)throw new Error('VERIFICATION_FAILED');}
              catch{this.assets.invalidateVerification(wid,aid);reply(res,503,{error:'WAITING_FOR_ORIGINAL',message:'Original取得待ち'});return true;}
              this.workspaces.authorize(actor,wid,'export');this.workspaces.getAsset(actor,wid,id,aid);
              if(grant!==null)this.grants.verify({...actor,workspaceId:wid,assetId:aid,purpose},grant);
              this.workspaces.recordEvent(actor,wid,'export',aid,{projectId:id,purpose,stage:'original-download-started',verificationScope:'LOCAL_PROVIDER_ONLY'});
              res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':asset.size,'Cache-Control':'no-store'});
              let measuredBytes=0;const workspaces=this.workspaces,storage=this.storage,grants=this.grants;
              const measured=async function*(){
                for await(const chunk of storage.read(asset.originalKey)){
                  workspaces.authorize(actor,wid,'export');workspaces.getAsset(actor,wid,id,aid);
                  if(grant!==null)grants.verify({...actor,workspaceId:wid,assetId:aid,purpose},grant);
                  const nextSize=measuredBytes+chunk.byteLength;if(nextSize>asset.size)throw new Error('SIZE_MISMATCH');
                  measuredBytes=nextSize;yield chunk;
                }
                if(measuredBytes!==asset.size)throw new Error('SIZE_MISMATCH');
              };
              try{
                await pipeline(Readable.from(measured()),res);
                this.workspaces.recordEvent(actor,wid,'export',aid,{projectId:id,purpose,bytes:measuredBytes,stage:'original-download-completed',verificationScope:'LOCAL_PROVIDER_ONLY'});
              }catch(error){
                if((error as Error).message==='SIZE_MISMATCH')this.assets.invalidateVerification(wid,aid);
                throw error;
              }finally{this.recordMeasuredTraffic(actor,wid,{uploadBytes:0,downloadBytes:measuredBytes,exportBytes:purpose.startsWith('final-')?measuredBytes:0,put:0,get:1,list:0,other:0});}
              return true;
            }
          }
        }
      }
      reply(res,404,{error:'NOT_FOUND'});return true;
    }catch(error){
      if(res.headersSent){res.destroy();return true;}
      const message=(error as Error).message;
      const status=/FORBIDDEN|VERIFIED_EMAIL_REQUIRED|ACCESS_GRANT_REJECTED/.test(message)?403:/NOT_FOUND/.test(message)?404:/CONFLICT|ALREADY|EXISTS|LAST_OWNER|QUOTA|ENTITLEMENT|EXPIRED|IMMUTABLE|ORIGINAL_REQUIRES|CULLING_SEGMENT_LIMIT/.test(message)?409:/^(INVALID|PAYLOAD|CHECKSUM|SIZE|RECIPE_TOO_LARGE)/.test(message)||error instanceof SyntaxError?400:503;
      reply(res,status,{error:status===503?'OPERATION_UNAVAILABLE':message});return true;
    }
  }
  private accountTrash(actor:{userId:string},workspaceId:string,assetId:string,trashed:boolean){
    const storageActor={...actor,workspaceId},reservation=this.ledger.reservationForOperation(storageActor,assetId);
    if(reservation?.objectCommitted)this.ledger.setTrash(storageActor,reservation.objectKey,trashed);
  }
  private reconcileProjectTrash(actor:{userId:string},workspaceId:string,projectId:string){
    for(const state of this.workspaces.registeredAssetStates(actor,workspaceId,projectId))this.accountTrash(actor,workspaceId,state.assetId,state.trashed);
  }
  private recordMeasuredTraffic(actor:{userId:string},workspaceId:string,traffic:Pick<UsageEvent,'uploadBytes'|'downloadBytes'|'exportBytes'|'put'|'get'|'list'|'other'>){
    this.recordingMeasuredUsage=true;
    try{this.ledger.recordUsage({...actor,workspaceId},{eventId:randomUUID(),period:new Date().toISOString().slice(0,7),origin:'adapter-measured',...traffic});}
    finally{this.recordingMeasuredUsage=false;}
  }
}
