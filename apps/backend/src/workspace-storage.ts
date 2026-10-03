import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';

/** Accounting only. No provider, payment, object deletion or Cloud Safe decision is implemented here. */
export type StorageCategory = 'Original'|'Proxy'|'Generated'|'Export';
export type ProductEntitlement = 'MOBILE'|'DESKTOP'|'ALL'|'STUDIO'|'CLOUD_STORAGE'|'GENERATIVE_AI';
export const PRODUCT_ENTITLEMENTS: readonly ProductEntitlement[] = ['MOBILE','DESKTOP','ALL','STUDIO','CLOUD_STORAGE','GENERATIVE_AI'];
export interface StorageActor {userId:string; workspaceId:string}
export type StorageAction = 'read-storage'|'manage-storage-plan'|'manage-entitlements'|'upload'|'manage-storage-objects'|'record-usage';
/** Mandatory trusted server callback. It must query current Workspace membership/role, not token claims alone. */
export type StorageAuthorizer = (actor:StorageActor, action:StorageAction)=>void;
export interface StoragePlan {id:string; quotaBytes:number; monthlyPriceMinor:number|null; currency:string|null}
export interface StorageTariffs {
  currency:string|null; storageGBMonthMinor:number|null; uploadGBMinor:number|null; downloadGBMinor:number|null;
  put1000Minor:number|null; get1000Minor:number|null; list1000Minor:number|null; other1000Minor:number|null;
}
export interface RemoteStorageConfiguration {
  revision:string; storagePlans:readonly StoragePlan[];
  tariffs:StorageTariffs;
  studio: {includedSeats:number; baseMonthlyPriceMinor:number|null; additionalSeatMonthlyPriceMinor:number|null; currency:string|null}|null;
}
export interface ReserveStorageRequest {operationId:string; category:StorageCategory; sha256:string; size:number}
export interface StorageReservation {
  operationId:string;
  /** Opaque accounting-object ID, NOT a StorageProvider object key or signed download capability. */
  objectKey:string;
  category:StorageCategory; sha256:string; size:number;
  state:'reserved'|'committed'|'released'; objectCommitted:boolean; requiresUpload:boolean;
}
export interface StorageUsage {
  workspaceId:string; planId:string|null; configRevision:string|null; quotaBytes:number;
  usedBytes:number; reservedBytes:number; availableBytes:number; overQuota:boolean; newUploadsBlocked:boolean;
  categories:Record<StorageCategory|'Trash',number>; physicalAccountingObjectCount:number;
}
export interface UsageEvent {
  eventId:string; period:string; origin:'adapter-measured'|'logical-test';
  uploadBytes:number; downloadBytes:number; exportBytes:number;
  put:number; get:number; list:number; other:number;
}
export interface FinancialObservation {
  period:string; currency:string|null; origin:'external-statement'|'logical-test';
  storageRevenueMinor:number|null; storageProviderCostMinor:number|null; aiCostMinor:number|null;
  appleFeeMinor:number|null; paymentFeeMinor:number|null;
}
const categories:readonly StorageCategory[] = ['Original','Proxy','Generated','Export'];
const fields = ['uploadBytes','downloadBytes','exportBytes','put','get','list','other'] as const;
const financialFields = ['storageRevenueMinor','storageProviderCostMinor','aiCostMinor','appleFeeMinor','paymentFeeMinor'] as const;
const tariffs = ['storageGBMonthMinor','uploadGBMinor','downloadGBMinor','put1000Minor','get1000Minor','list1000Minor','other1000Minor'] as const;
function fail(message:string):never {throw new Error(message);}
function textID(value:unknown):asserts value is string {if(typeof value!=='string'||!value.trim()||value.length>200||/[\u0000-\u001f]/u.test(value))fail('INVALID_STORAGE_ID');}
function integer(value:unknown, positive=false):asserts value is number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<(positive?1:0))fail('INVALID_STORAGE_INTEGER');}
function sum(a:number,b:number):number {integer(a);integer(b);if(a>Number.MAX_SAFE_INTEGER-b)fail('STORAGE_INTEGER_OVERFLOW');return a+b;}
function price(value:unknown):asserts value is number|null {if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER))fail('INVALID_STORAGE_PRICE');}
function currency(value:unknown):asserts value is string|null {if(value!==null&&(typeof value!=='string'||!/^[A-Z]{3}$/.test(value)))fail('INVALID_STORAGE_CURRENCY');}
function period(value:string) {if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))fail('INVALID_STORAGE_PERIOD');}
function finiteCost(value:number):number {if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)fail('STORAGE_COST_OVERFLOW');return value;}

export class WorkspaceStorageLedger {
  private readonly db:DatabaseSync;
  constructor(path:string, private readonly configuration:()=>RemoteStorageConfiguration, private readonly authorize:StorageAuthorizer) {
    if(typeof configuration!=='function'||typeof authorize!=='function')fail('STORAGE_AUTHORIZER_REQUIRED');
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS storage_plans(workspace_id TEXT PRIMARY KEY,plan_id TEXT NOT NULL,quota INTEGER NOT NULL,config_revision TEXT NOT NULL,plan_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS storage_entitlements(workspace_id TEXT NOT NULL,product TEXT NOT NULL,enabled INTEGER NOT NULL,PRIMARY KEY(workspace_id,product));
      CREATE TABLE IF NOT EXISTS storage_objects(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,category TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,state TEXT NOT NULL,trashed INTEGER NOT NULL DEFAULT 0,UNIQUE(workspace_id,category,sha256,size));
      CREATE TABLE IF NOT EXISTS storage_reservations(workspace_id TEXT NOT NULL,operation_id TEXT NOT NULL,object_id TEXT NOT NULL REFERENCES storage_objects(id),state TEXT NOT NULL,created_by TEXT NOT NULL,PRIMARY KEY(workspace_id,operation_id));
      CREATE TABLE IF NOT EXISTS storage_usage_events(workspace_id TEXT NOT NULL,event_id TEXT NOT NULL,user_id TEXT NOT NULL,period TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(workspace_id,event_id));
      CREATE TABLE IF NOT EXISTS storage_financials(workspace_id TEXT NOT NULL,period TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(workspace_id,period));
      CREATE TABLE IF NOT EXISTS storage_seats(workspace_id TEXT PRIMARY KEY,seats INTEGER NOT NULL,config_revision TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS storage_audit(id INTEGER PRIMARY KEY,workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS storage_audit_immutable_update BEFORE UPDATE ON storage_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_STORAGE_AUDIT'); END;
      CREATE TRIGGER IF NOT EXISTS storage_audit_immutable_delete BEFORE DELETE ON storage_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_STORAGE_AUDIT'); END;
    `);
  }
  close(){this.db.close();}
  private check(actor:StorageActor, action:StorageAction){textID(actor.userId);textID(actor.workspaceId);this.authorize(actor,action);}
  private transaction<T>(body:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=body();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  private audit(actor:StorageActor,action:string,details:unknown){this.db.prepare('INSERT INTO storage_audit(workspace_id,user_id,action,details,created_at) VALUES(?,?,?,?,?)').run(actor.workspaceId,actor.userId,action,JSON.stringify(details),new Date().toISOString());}
  private config():RemoteStorageConfiguration {
    const config=structuredClone(this.configuration());textID(config.revision);
    const ids=new Set<string>();
    for(const plan of config.storagePlans){textID(plan.id);integer(plan.quotaBytes);price(plan.monthlyPriceMinor);currency(plan.currency);if(ids.has(plan.id))fail('DUPLICATE_STORAGE_PLAN');ids.add(plan.id);if(plan.monthlyPriceMinor!==null&&plan.currency===null)fail('STORAGE_PRICE_CURRENCY_REQUIRED');}
    currency(config.tariffs.currency);for(const field of tariffs)price(config.tariffs[field]);
    if(tariffs.some(field=>config.tariffs[field]!==null)&&config.tariffs.currency===null)fail('STORAGE_PRICE_CURRENCY_REQUIRED');
    if(config.studio){integer(config.studio.includedSeats);price(config.studio.baseMonthlyPriceMinor);price(config.studio.additionalSeatMonthlyPriceMinor);currency(config.studio.currency);if((config.studio.baseMonthlyPriceMinor!==null||config.studio.additionalSeatMonthlyPriceMinor!==null)&&config.studio.currency===null)fail('STORAGE_PRICE_CURRENCY_REQUIRED');}
    return config;
  }
  changePlan(actor:StorageActor,planId:string):StorageUsage {
    this.check(actor,'manage-storage-plan');textID(planId);const config=this.config(),plan=config.storagePlans.find(p=>p.id===planId);if(!plan)fail('UNKNOWN_STORAGE_PLAN');
    return this.transaction(()=>{this.db.prepare('INSERT INTO storage_plans(workspace_id,plan_id,quota,config_revision,plan_json) VALUES(?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET plan_id=excluded.plan_id,quota=excluded.quota,config_revision=excluded.config_revision,plan_json=excluded.plan_json').run(actor.workspaceId,plan.id,plan.quotaBytes,config.revision,JSON.stringify(plan));this.audit(actor,'storage-plan-change',{planId,quotaBytes:plan.quotaBytes,configRevision:config.revision});return this.usageInternal(actor.workspaceId);});
  }
  setEntitlement(actor:StorageActor,product:ProductEntitlement,enabled:boolean){
    this.check(actor,'manage-entitlements');if(!PRODUCT_ENTITLEMENTS.includes(product)||typeof enabled!=='boolean')fail('INVALID_ENTITLEMENT');
    this.transaction(()=>{this.db.prepare('INSERT INTO storage_entitlements(workspace_id,product,enabled) VALUES(?,?,?) ON CONFLICT(workspace_id,product) DO UPDATE SET enabled=excluded.enabled').run(actor.workspaceId,product,enabled?1:0);this.audit(actor,'entitlement-change',{product,enabled});});
    // This does not perform or prove a purchase, renewal, refund or Apple entitlement validation.
  }
  entitlements(actor:StorageActor):Record<ProductEntitlement,boolean>{this.check(actor,'read-storage');return this.entitlementsInternal(actor.workspaceId);}
  private entitlementsInternal(workspace:string):Record<ProductEntitlement,boolean>{const result=Object.fromEntries(PRODUCT_ENTITLEMENTS.map(p=>[p,false])) as Record<ProductEntitlement,boolean>;for(const row of this.db.prepare('SELECT product,enabled FROM storage_entitlements WHERE workspace_id=?').all(workspace))result[String(row.product) as ProductEntitlement]=row.enabled===1;return result;}
  setSeatAllocation(actor:StorageActor,seats:number){this.check(actor,'manage-entitlements');integer(seats);const config=this.config();if(!config.studio)fail('STUDIO_CONFIGURATION_UNAVAILABLE');this.transaction(()=>{this.db.prepare('INSERT INTO storage_seats(workspace_id,seats,config_revision) VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET seats=excluded.seats,config_revision=excluded.config_revision').run(actor.workspaceId,seats,config.revision);this.audit(actor,'seat-allocation-change',{seats,configRevision:config.revision});});}
  private reservation(workspace:string,operationId:string):StorageReservation|null {
    const r=this.db.prepare('SELECT r.operation_id,r.state AS reservation_state,o.* FROM storage_reservations r JOIN storage_objects o ON o.id=r.object_id WHERE r.workspace_id=? AND r.operation_id=? AND o.workspace_id=?').get(workspace,operationId,workspace);
    if(!r)return null;
    return {operationId:String(r.operation_id),objectKey:String(r.id),category:String(r.category) as StorageCategory,sha256:String(r.sha256),size:Number(r.size),state:String(r.reservation_state) as StorageReservation['state'],objectCommitted:r.state==='committed',requiresUpload:r.reservation_state==='reserved'&&r.state!=='committed'};
  }
  /** Read-only Workspace-scoped accounting lookup; never returns a provider download capability. */
  reservationForOperation(actor:StorageActor,operationId:string):StorageReservation|null {
    this.check(actor,'read-storage');textID(operationId);return this.reservation(actor.workspaceId,operationId);
  }
  reserve(actor:StorageActor,input:ReserveStorageRequest):StorageReservation {
    this.check(actor,'upload');textID(input.operationId);integer(input.size,true);if(!categories.includes(input.category)||typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256))fail('INVALID_STORAGE_OBJECT');
    return this.transaction(()=>{
      const previous=this.reservation(actor.workspaceId,input.operationId);
      if(previous){if(previous.sha256!==input.sha256||previous.size!==input.size||previous.category!==input.category)fail('STORAGE_IDEMPOTENCY_MISMATCH');if(previous.state!=='released')return previous;}
      let object=this.db.prepare('SELECT * FROM storage_objects WHERE workspace_id=? AND category=? AND sha256=? AND size=?').get(actor.workspaceId,input.category,input.sha256,input.size);
      if(!object||object.state==='abandoned'){
        const usage=this.usageInternal(actor.workspaceId);
        if(!this.entitlementsInternal(actor.workspaceId).CLOUD_STORAGE)fail('STORAGE_ENTITLEMENT_REQUIRED');
        if(input.size>usage.availableBytes)fail('STORAGE_QUOTA_EXCEEDED');
        if(!object){const id='accounting-'+randomUUID();this.db.prepare('INSERT INTO storage_objects(id,workspace_id,category,sha256,size,state) VALUES(?,?,?,?,?,?)').run(id,actor.workspaceId,input.category,input.sha256,input.size,'pending');object=this.db.prepare('SELECT * FROM storage_objects WHERE id=?').get(id);}
        else this.db.prepare("UPDATE storage_objects SET state='pending' WHERE id=? AND workspace_id=?").run(String(object.id),actor.workspaceId);
      }
      if(previous)this.db.prepare("UPDATE storage_reservations SET state='reserved',created_by=? WHERE workspace_id=? AND operation_id=? AND state='released'").run(actor.userId,actor.workspaceId,input.operationId);
      else this.db.prepare('INSERT INTO storage_reservations(workspace_id,operation_id,object_id,state,created_by) VALUES(?,?,?,?,?)').run(actor.workspaceId,input.operationId,String(object!.id),'reserved',actor.userId);
      this.audit(actor,previous?'storage-reserve-retry':'storage-reserve',{operationId:input.operationId,objectKey:String(object!.id),size:input.size});
      return this.reservation(actor.workspaceId,input.operationId)!;
    });
  }
  commit(actor:StorageActor,operationId:string,evidence:{sha256:string;size:number;persisted:boolean}):StorageReservation {
    this.check(actor,'upload');textID(operationId);integer(evidence.size,true);
    return this.transaction(()=>{const reservation=this.reservation(actor.workspaceId,operationId);if(!reservation)fail('STORAGE_RESERVATION_NOT_FOUND');if(evidence.persisted!==true||evidence.sha256!==reservation.sha256||evidence.size!==reservation.size)fail('STORAGE_VERIFICATION_FAILED');if(reservation.state==='released')fail('STORAGE_RESERVATION_RELEASED');if(reservation.state==='committed')return reservation;
      this.db.prepare("UPDATE storage_objects SET state='committed' WHERE workspace_id=? AND id=?").run(actor.workspaceId,reservation.objectKey);
      this.db.prepare("UPDATE storage_reservations SET state='committed' WHERE workspace_id=? AND operation_id=?").run(actor.workspaceId,operationId);
      this.audit(actor,'storage-commit',{operationId,objectKey:reservation.objectKey,size:reservation.size});return this.reservation(actor.workspaceId,operationId)!;
    });
  }
  release(actor:StorageActor,operationId:string):StorageReservation {
    this.check(actor,'upload');textID(operationId);return this.transaction(()=>{
      const reservation=this.reservation(actor.workspaceId,operationId);if(!reservation)fail('STORAGE_RESERVATION_NOT_FOUND');
      if(reservation.state==='released'||reservation.state==='committed')return reservation;
      this.db.prepare("UPDATE storage_reservations SET state='released' WHERE workspace_id=? AND operation_id=?").run(actor.workspaceId,operationId);
      const outstanding=this.db.prepare("SELECT COUNT(*) AS count FROM storage_reservations WHERE workspace_id=? AND object_id=? AND state='reserved'").get(actor.workspaceId,reservation.objectKey);
      if(outstanding?.count===0)this.db.prepare("UPDATE storage_objects SET state='abandoned' WHERE workspace_id=? AND id=? AND state='pending'").run(actor.workspaceId,reservation.objectKey);
      this.audit(actor,'storage-reservation-release',{operationId,objectKey:reservation.objectKey});return this.reservation(actor.workspaceId,operationId)!;
    });
  }
  object(actor:StorageActor,objectKey:string){this.check(actor,'read-storage');textID(objectKey);const row=this.db.prepare('SELECT * FROM storage_objects WHERE workspace_id=? AND id=?').get(actor.workspaceId,objectKey);if(!row)fail('STORAGE_OBJECT_NOT_FOUND');return {objectKey:String(row.id),category:String(row.category) as StorageCategory,sha256:String(row.sha256),size:Number(row.size),state:String(row.state),trashed:row.trashed===1};}
  /** Physical accounting state only; caller must ensure all shared asset references agree before moving to Trash. No bytes are removed. */
  setTrash(actor:StorageActor,objectKey:string,trashed:boolean){this.check(actor,'manage-storage-objects');textID(objectKey);if(typeof trashed!=='boolean')fail('INVALID_TRASH_STATE');return this.transaction(()=>{const row=this.db.prepare("SELECT * FROM storage_objects WHERE workspace_id=? AND id=? AND state='committed'").get(actor.workspaceId,objectKey);if(!row)fail('STORAGE_OBJECT_NOT_FOUND');this.db.prepare('UPDATE storage_objects SET trashed=? WHERE workspace_id=? AND id=?').run(trashed?1:0,actor.workspaceId,objectKey);this.audit(actor,trashed?'storage-trash':'storage-recover',{objectKey});return this.usageInternal(actor.workspaceId);});}
  usage(actor:StorageActor):StorageUsage {this.check(actor,'read-storage');return this.usageInternal(actor.workspaceId);}
  private usageInternal(workspaceId:string):StorageUsage {
    const plan=this.db.prepare('SELECT * FROM storage_plans WHERE workspace_id=?').get(workspaceId);
    const result:StorageUsage={workspaceId,planId:plan?String(plan.plan_id):null,configRevision:plan?String(plan.config_revision):null,quotaBytes:plan?Number(plan.quota):0,usedBytes:0,reservedBytes:0,availableBytes:0,overQuota:false,newUploadsBlocked:true,categories:{Original:0,Proxy:0,Generated:0,Export:0,Trash:0},physicalAccountingObjectCount:0};
    integer(result.quotaBytes);
    for(const row of this.db.prepare("SELECT * FROM storage_objects WHERE workspace_id=? AND state IN ('committed','pending')").all(workspaceId)){
      const size=Number(row.size);integer(size,true);
      if(row.state==='pending')result.reservedBytes=sum(result.reservedBytes,size);
      else{result.usedBytes=sum(result.usedBytes,size);result.physicalAccountingObjectCount=sum(result.physicalAccountingObjectCount,1);const bucket=row.trashed===1?'Trash':String(row.category) as StorageCategory;result.categories[bucket]=sum(result.categories[bucket],size);}
    }
    const allocated=sum(result.usedBytes,result.reservedBytes);result.availableBytes=Math.max(0,result.quotaBytes-allocated);result.overQuota=allocated>result.quotaBytes;result.newUploadsBlocked=result.availableBytes===0||!this.entitlementsInternal(workspaceId).CLOUD_STORAGE;return result;
  }
  recordUsage(actor:StorageActor,event:UsageEvent){this.check(actor,'record-usage');textID(event.eventId);period(event.period);if(!['adapter-measured','logical-test'].includes(event.origin))fail('INVALID_USAGE_ORIGIN');for(const field of fields)integer(event[field]);if(event.exportBytes>event.downloadBytes)fail('INVALID_EXPORT_TRAFFIC_SUBSET');return this.transaction(()=>{
    const old=this.db.prepare('SELECT body,user_id FROM storage_usage_events WHERE workspace_id=? AND event_id=?').get(actor.workspaceId,event.eventId);
    const body=JSON.stringify({eventId:event.eventId,period:event.period,origin:event.origin,...Object.fromEntries(fields.map(f=>[f,event[f]]))});
    if(old){if(old.body!==body||old.user_id!==actor.userId)fail('STORAGE_IDEMPOTENCY_MISMATCH');return;}
    const totals=this.traffic(actor.workspaceId,event.period);for(const field of fields)sum(totals[field],event[field]);
    this.db.prepare('INSERT INTO storage_usage_events(workspace_id,event_id,user_id,period,body) VALUES(?,?,?,?,?)').run(actor.workspaceId,event.eventId,actor.userId,event.period,body);
    this.audit(actor,'storage-usage-recorded',{eventId:event.eventId,period:event.period,origin:event.origin});
  });}
  private traffic(workspace:string,selectedPeriod:string){const result={uploadBytes:0,downloadBytes:0,exportBytes:0,put:0,get:0,list:0,other:0,logicalTestEvents:0,adapterMeasuredEvents:0,byUser:Object.create(null) as Record<string,Record<typeof fields[number],number>>};for(const row of this.db.prepare('SELECT body,user_id FROM storage_usage_events WHERE workspace_id=? AND period=?').all(workspace,selectedPeriod)){
    const event=JSON.parse(String(row.body)) as UsageEvent;const user=String(row.user_id);const own=result.byUser[user]??Object.fromEntries(fields.map(f=>[f,0])) as Record<typeof fields[number],number>;
    for(const field of fields){result[field]=sum(result[field],event[field]);own[field]=sum(own[field],event[field]);}result.byUser[user]=own;event.origin==='logical-test'?result.logicalTestEvents++:result.adapterMeasuredEvents++;
  }return result;}
  recordFinancialObservation(actor:StorageActor,input:FinancialObservation){this.check(actor,'manage-storage-plan');period(input.period);currency(input.currency);if(!['external-statement','logical-test'].includes(input.origin))fail('INVALID_FINANCIAL_ORIGIN');for(const field of financialFields)price(input[field]);if(financialFields.some(f=>input[f]!==null)&&input.currency===null)fail('STORAGE_PRICE_CURRENCY_REQUIRED');this.transaction(()=>{this.db.prepare('INSERT INTO storage_financials(workspace_id,period,body) VALUES(?,?,?) ON CONFLICT(workspace_id,period) DO UPDATE SET body=excluded.body').run(actor.workspaceId,input.period,JSON.stringify(input));this.audit(actor,'financial-observation-recorded',{period:input.period,origin:input.origin});});}
  costReport(actor:StorageActor,selectedPeriod:string){
    this.check(actor,'manage-storage-plan');period(selectedPeriod);const config=this.config(),usage=this.usageInternal(actor.workspaceId),traffic=this.traffic(actor.workspaceId,selectedPeriod),rates=config.tariffs;
    const component=(rate:number|null,quantity:number)=>rate===null?null:finiteCost(rate*quantity);
    const estimates={storageSteadyStateMonth:component(rates.storageGBMonthMinor,usage.usedBytes/1e9),upload:component(rates.uploadGBMinor,traffic.uploadBytes/1e9),download:component(rates.downloadGBMinor,traffic.downloadBytes/1e9),put:component(rates.put1000Minor,traffic.put/1000),get:component(rates.get1000Minor,traffic.get/1000),list:component(rates.list1000Minor,traffic.list/1000),other:component(rates.other1000Minor,traffic.other/1000)};
    const values=Object.values(estimates);const totalEstimateMinor=values.every(v=>v!==null)?finiteCost(values.reduce<number>((a,v)=>a+(v??0),0)):null;
    const record=this.db.prepare('SELECT body FROM storage_financials WHERE workspace_id=? AND period=?').get(actor.workspaceId,selectedPeriod);
    const financial:FinancialObservation=record?JSON.parse(String(record.body)) as FinancialObservation:{period:selectedPeriod,currency:null,origin:'external-statement',storageRevenueMinor:null,storageProviderCostMinor:null,aiCostMinor:null,appleFeeMinor:null,paymentFeeMinor:null};
    const grossMarginMinor=financialFields.every(f=>financial[f]!==null)?finiteCost(financial.storageRevenueMinor!-financial.storageProviderCostMinor!-financial.aiCostMinor!-financial.appleFeeMinor!-financial.paymentFeeMinor!):null;
    const plan=this.db.prepare('SELECT plan_json FROM storage_plans WHERE workspace_id=?').get(actor.workspaceId);
    const seatRow=this.db.prepare('SELECT seats FROM storage_seats WHERE workspace_id=?').get(actor.workspaceId),seats=seatRow?Number(seatRow.seats):0;
    const studio=config.studio?{...config.studio,seats,additionalSeats:Math.max(0,seats-config.studio.includedSeats)}:null;
    return {period:selectedPeriod,usage,traffic,configRevision:config.revision,currency:rates.currency,estimates,totalEstimateMinor,
      estimateCaveat:'CONFIGURED_ESTIMATE_NOT_PROVIDER_INVOICE; current-byte steady-state month, not integrated byte-hours; no fee/minimum/tier/tax assumptions',
      plan:plan?JSON.parse(String(plan.plan_json)) as StoragePlan:null,studio,financialObservation:financial,financialObservationRecorded:!!record,grossMarginMinor};
  }
  auditLog(actor:StorageActor){this.check(actor,'manage-storage-plan');return this.db.prepare('SELECT user_id,action,details,created_at FROM storage_audit WHERE workspace_id=? ORDER BY id').all(actor.workspaceId).map(row=>({userId:String(row.user_id),action:String(row.action),details:JSON.parse(String(row.details)) as unknown,createdAt:String(row.created_at)}));}
}
