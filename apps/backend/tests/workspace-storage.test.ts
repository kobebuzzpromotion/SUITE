import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {WorkspaceStorageLedger, PRODUCT_ENTITLEMENTS, type RemoteStorageConfiguration, type StorageActor, type StorageAuthorizer, type StorageCategory, type UsageEvent} from '../src/workspace-storage.js';
import {LocalObjectStorage} from '../src/storage.js';

// All large sizes are metadata-only logical quotas. These bytes are NOT synthetic RAW/image QA.
const owner:StorageActor={workspaceId:'workspace-a',userId:'owner'};
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const bytes=Buffer.from('SUITE immutable storage safety fixture; not RAW or another image format');
const quotaSizes=[100e9,500e9,1e12,2e12,3e12,5e12,10e12,20e12];
const configuration=():RemoteStorageConfiguration=>({revision:'test-config-not-a-commercial-offer',
  storagePlans:[...quotaSizes.map((quotaBytes,index)=>({id:`capacity-${index}`,quotaBytes,monthlyPriceMinor:null,currency:null})),
    {id:'tiny',quotaBytes:100,monthlyPriceMinor:null,currency:null},
    {id:'max-safe',quotaBytes:Number.MAX_SAFE_INTEGER,monthlyPriceMinor:null,currency:null}],
  tariffs:{currency:null,storageGBMonthMinor:null,uploadGBMinor:null,downloadGBMinor:null,put1000Minor:null,get1000Minor:null,list1000Minor:null,other1000Minor:null},
  studio:{includedSeats:2,baseMonthlyPriceMinor:null,additionalSeatMonthlyPriceMinor:null,currency:null}});
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'suite-workspace-storage-')),path=join(root,'ledger.sqlite');
  let config=configuration();
  const roles=new Map([['workspace-a/owner','OWNER'],['workspace-a/editor','EDITOR'],['workspace-a/viewer','VIEWER'],['workspace-b/owner-b','OWNER']]);
  const authorize:StorageAuthorizer=(actor,action)=>{
    const role=roles.get(`${actor.workspaceId}/${actor.userId}`);if(!role)throw new Error('WORKSPACE_ACCESS_DENIED');
    if(action==='read-storage')return;
    if(action==='upload'&&role!=='VIEWER')return;
    if(role!=='OWNER')throw new Error('WORKSPACE_PERMISSION_DENIED');
  };
  const ledger=new WorkspaceStorageLedger(path,()=>config,authorize);
  ledger.changePlan(owner,'capacity-3');ledger.setEntitlement(owner,'CLOUD_STORAGE',true);
  return {root,path,ledger,roles,authorize,getConfig:()=>config,setConfig:(next:RemoteStorageConfiguration)=>{config=next;},
    dispose:async()=>{try{ledger.close();}catch{}await rm(root,{recursive:true,force:true});}};
}
const reservation=(operationId:string,size:number,category:StorageCategory='Original',sha256=hash(operationId))=>({operationId,size,category,sha256});
const usageEvent=(eventId:string,overrides:Partial<UsageEvent>={}):UsageEvent=>({eventId,period:'2026-10',origin:'logical-test',uploadBytes:20,downloadBytes:30,exportBytes:10,put:2,get:3,list:1,other:0,...overrides});

test('Workspace storage: logical 100GB through 20TB quotas survive SQLite reopen without 32-bit truncation',async()=>{
  const f=await fixture();
  try{
    for(const [index,size] of quotaSizes.entries())assert.equal(f.ledger.changePlan(owner,`capacity-${index}`).quotaBytes,size);
    const input=reservation('logical-20TB',20e12);f.ledger.reserve(owner,input);f.ledger.commit(owner,input.operationId,{...input,persisted:true});
    const reopened=new WorkspaceStorageLedger(f.path,f.getConfig,f.authorize);
    try{const usage=reopened.usage(owner);assert.equal(usage.usedBytes,20e12);assert.equal(usage.categories.Original,20e12);assert.equal(usage.availableBytes,0);assert.equal(usage.newUploadsBlocked,true);}finally{reopened.close();}
  }finally{await f.dispose();}
});

test('Workspace storage: unsafe integers, overflow, invalid evidence and operation reuse fail closed',async()=>{
  const f=await fixture();
  try{
    for(const size of [-1,0,0.5,Number.MAX_SAFE_INTEGER+1,Infinity,NaN])assert.throws(()=>f.ledger.reserve(owner,reservation('invalid',size)),/INVALID_STORAGE_INTEGER/);
    f.ledger.changePlan(owner,'max-safe');const input=reservation('max',Number.MAX_SAFE_INTEGER);f.ledger.reserve(owner,input);
    assert.throws(()=>f.ledger.reserve(owner,reservation('extra',1)),/STORAGE_QUOTA_EXCEEDED/);
    assert.throws(()=>f.ledger.reserve(owner,reservation('max',1)),/STORAGE_IDEMPOTENCY_MISMATCH/);
    for(const evidence of [{...input,persisted:false},{...input,persisted:'true' as unknown as boolean},{...input,persisted:true,sha256:hash('wrong')},{...input,persisted:true,size:1}])assert.throws(()=>f.ledger.commit(owner,'max',evidence),/STORAGE_VERIFICATION_FAILED/);
    assert.equal(f.ledger.usage(owner).usedBytes,0);assert.equal(f.ledger.usage(owner).reservedBytes,Number.MAX_SAFE_INTEGER);
    const bad=configuration();bad.storagePlans[0]!.quotaBytes=Number.MAX_SAFE_INTEGER+1;f.setConfig(bad);assert.throws(()=>f.ledger.changePlan(owner,'capacity-0'),/INVALID_STORAGE_INTEGER/);
  }finally{await f.dispose();}
});

test('Workspace storage: member dedup, commit retry and isolated workspace accounting never multiply Original usage',async()=>{
  const f=await fixture();
  try{
    const input=reservation('asset-a',50),first=f.ledger.reserve(owner,input);
    assert.deepEqual(f.ledger.reservationForOperation(owner,'asset-a'),first);
    assert.equal(f.ledger.reservationForOperation(owner,'missing'),null);
    const editor={workspaceId:owner.workspaceId,userId:'editor'};
    const duplicate=f.ledger.reserve(editor,{...input,operationId:'asset-a-peer'});
    assert.equal(duplicate.objectKey,first.objectKey);assert.equal(f.ledger.usage(owner).reservedBytes,50);
    f.ledger.commit(owner,input.operationId,{...input,persisted:true});
    f.ledger.commit(editor,'asset-a-peer',{...input,persisted:true});
    f.ledger.commit(owner,input.operationId,{...input,persisted:true});
    assert.equal(f.ledger.usage(owner).usedBytes,50);assert.equal(f.ledger.usage(owner).physicalAccountingObjectCount,1);
    assert.equal(f.ledger.reserve(editor,{...input,operationId:'asset-a-third'}).requiresUpload,false);
    const other={workspaceId:'workspace-b',userId:'owner-b'};f.ledger.changePlan(other,'capacity-0');f.ledger.setEntitlement(other,'CLOUD_STORAGE',true);
    assert.equal(f.ledger.reservationForOperation(other,'asset-a'),null);
    assert.notEqual(f.ledger.reserve(other,input).objectKey,first.objectKey);
    assert.throws(()=>f.ledger.object(other,first.objectKey),/STORAGE_OBJECT_NOT_FOUND/);
    assert.equal(f.ledger.usage(other).usedBytes,0);
  }finally{await f.dispose();}
});

test('Workspace storage: release retains shared reservation, retry rechecks quota and reuses accounting ID',async()=>{
  const f=await fixture();
  try{
    f.ledger.changePlan(owner,'tiny');const input=reservation('asset-a',60),first=f.ledger.reserve(owner,input);
    f.ledger.reserve(owner,{...input,operationId:'asset-b'});f.ledger.release(owner,'asset-a');assert.equal(f.ledger.usage(owner).reservedBytes,60);
    f.ledger.release(owner,'asset-b');assert.equal(f.ledger.usage(owner).reservedBytes,0);
    const competitor=reservation('other',80);f.ledger.reserve(owner,competitor);
    assert.throws(()=>f.ledger.reserve(owner,input),/STORAGE_QUOTA_EXCEEDED/);
    assert.throws(()=>f.ledger.commit(owner,'asset-a',{...input,persisted:true}),/STORAGE_RESERVATION_RELEASED/);
    f.ledger.release(owner,'other');const retry=f.ledger.reserve(owner,input);assert.equal(retry.objectKey,first.objectKey);assert.equal(retry.state,'reserved');
    f.ledger.commit(owner,'asset-a',{...input,persisted:true});assert.equal(f.ledger.release(owner,'asset-a').state,'committed');assert.equal(f.ledger.usage(owner).usedBytes,60);
  }finally{await f.dispose();}
});

test('Workspace storage: independent processes serialize quota reservations without overbooking',async()=>{
  const f=await fixture();
  try{
    f.ledger.changePlan(owner,'tiny');
    const moduleURL=new URL('../src/workspace-storage.js',import.meta.url).href;
    const code=`const {WorkspaceStorageLedger}=await import(process.argv[1]); const ledger=new WorkspaceStorageLedger(process.argv[2],()=>JSON.parse(process.argv[3]),()=>{}); process.stdout.write('READY\\n'); process.stdin.once('data',()=>{try{ledger.reserve(JSON.parse(process.argv[4]),JSON.parse(process.argv[5]));process.stdout.write('RESERVED\\n');}catch(e){process.stdout.write(String(e.message)+'\\n');}finally{ledger.close();process.exit(0);}});`;
    const children=['parallel-a','parallel-b','parallel-c'].map(id=>{
      const child=spawn(process.execPath,['--input-type=module','-e',code,moduleURL,f.path,JSON.stringify(f.getConfig()),JSON.stringify(owner),JSON.stringify(reservation(id,60))],{stdio:['pipe','pipe','pipe'],windowsHide:true});
      let output='';const ready=new Promise<void>((resolve,reject)=>{child.stdout.on('data',chunk=>{output+=String(chunk);if(output.includes('READY'))resolve();});child.once('error',reject);child.once('exit',()=>{if(!output.includes('READY'))reject(new Error('CHILD_EXITED_BEFORE_READY'));});});
      const done=new Promise<string>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve(output):reject(new Error(`RESERVATION_CHILD_FAILED:${code}:${output}`)));});
      return {child,ready,done};
    });
    const timer=setTimeout(()=>children.forEach(item=>item.child.kill()),15000);
    try{await Promise.all(children.map(item=>item.ready));children.forEach(item=>item.child.stdin.write('GO'));const output=await Promise.all(children.map(item=>item.done));assert.equal(output.filter(value=>value.includes('RESERVED')).length,1);assert.equal(output.filter(value=>value.includes('STORAGE_QUOTA_EXCEEDED')).length,2);assert.equal(f.ledger.usage(owner).reservedBytes,60);}finally{clearTimeout(timer);children.forEach(item=>item.child.kill());}
  }finally{await f.dispose();}
});

test('Workspace storage: 1.6TB used, 2TB to 1TB downgrade blocks new upload and never deletes Original bytes',async()=>{
  const f=await fixture();const store=new LocalObjectStorage(join(f.root,'objects'));const key='original-workspace-a-storage-fixture';
  try{
    const integrity={sha256:hash(bytes),size:bytes.length};await store.putImmutable(key,Readable.from([bytes]),integrity);
    const actual=reservation('actual-object',bytes.length,'Original',integrity.sha256);f.ledger.reserve(owner,actual);f.ledger.commit(owner,actual.operationId,{...actual,persisted:true});
    const logical=reservation('logical-capacity-only',1.6e12-bytes.length);f.ledger.reserve(owner,logical);f.ledger.commit(owner,logical.operationId,{...logical,persisted:true});
    const lower=f.ledger.changePlan(owner,'capacity-2');assert.equal(lower.quotaBytes,1e12);assert.equal(lower.usedBytes,1.6e12);assert.equal(lower.overQuota,true);assert.equal(lower.newUploadsBlocked,true);
    assert.throws(()=>f.ledger.reserve(owner,reservation('over-quota',1)),/STORAGE_QUOTA_EXCEEDED/);
    f.ledger.setEntitlement(owner,'CLOUD_STORAGE',false);assert.throws(()=>f.ledger.reserve(owner,reservation('cancelled',1)),/STORAGE_ENTITLEMENT_REQUIRED/);
    assert.deepEqual(await readFile(join(f.root,'objects',key)),bytes);assert.equal((await store.inspect(key)).sha256,integrity.sha256);
    assert.equal(f.ledger.usage(owner).usedBytes,1.6e12);assert.equal(f.ledger.object(owner,f.ledger.reserve(owner,actual).objectKey).state,'committed');
    f.ledger.setEntitlement(owner,'CLOUD_STORAGE',true);f.ledger.changePlan(owner,'capacity-4');assert.equal(f.ledger.reserve(owner,reservation('after-upgrade',1)).state,'reserved');
  }finally{await f.dispose();}
});

test('Workspace storage: Trash and Recovery preserve all bytes and exclusive category accounting',async()=>{
  const f=await fixture();
  try{
    const keys:string[]=[];for(const [index,category] of (['Original','Proxy','Generated','Export'] as const).entries()){
      const input=reservation(category,(index+1)*10,category),record=f.ledger.reserve(owner,input);keys.push(record.objectKey);f.ledger.commit(owner,input.operationId,{...input,persisted:true});
    }
    assert.deepEqual(f.ledger.usage(owner).categories,{Original:10,Proxy:20,Generated:30,Export:40,Trash:0});
    const trashed=f.ledger.setTrash(owner,keys[0]!,true);assert.equal(trashed.usedBytes,100);assert.equal(trashed.categories.Trash,10);assert.equal(trashed.categories.Original,0);
    assert.equal(Object.values(trashed.categories).reduce((a,b)=>a+b,0),trashed.usedBytes);
    const recovered=f.ledger.setTrash(owner,keys[0]!,false);assert.equal(recovered.usedBytes,100);assert.equal(recovered.categories.Original,10);assert.equal(recovered.categories.Trash,0);
  }finally{await f.dispose();}
});

test('Workspace storage: live authorizer rejects other workspace, Viewer writes and revoked members',async()=>{
  const f=await fixture();
  try{
    const viewer={workspaceId:owner.workspaceId,userId:'viewer'},editor={workspaceId:owner.workspaceId,userId:'editor'};
    f.ledger.usage(viewer);assert.throws(()=>f.ledger.reserve(viewer,reservation('viewer',1)),/PERMISSION_DENIED/);
    assert.throws(()=>f.ledger.changePlan(editor,'capacity-0'),/PERMISSION_DENIED/);assert.throws(()=>f.ledger.setEntitlement(editor,'MOBILE',true),/PERMISSION_DENIED/);
    assert.throws(()=>f.ledger.usage({...owner,workspaceId:'workspace-b'}),/ACCESS_DENIED/);
    const input=reservation('pending-before-revoke',10);f.ledger.reserve(editor,input);f.roles.delete('workspace-a/editor');
    for(const operation of [()=>f.ledger.usage(editor),()=>f.ledger.reserve(editor,input),()=>f.ledger.commit(editor,input.operationId,{...input,persisted:true}),()=>f.ledger.release(editor,input.operationId)])assert.throws(operation,/ACCESS_DENIED/);
    assert.equal(f.ledger.usage(owner).reservedBytes,10);
    assert.throws(()=>new WorkspaceStorageLedger(':memory:',f.getConfig,undefined as unknown as StorageAuthorizer),/STORAGE_AUTHORIZER_REQUIRED/);
  }finally{await f.dispose();}
});

test('Workspace storage: independent entitlements and remote seat pricing retain unknown prices as null',async()=>{
  const f=await fixture();
  try{
    for(const product of PRODUCT_ENTITLEMENTS)f.ledger.setEntitlement(owner,product,true);
    f.ledger.setEntitlement(owner,'GENERATIVE_AI',false);const state=f.ledger.entitlements(owner);assert.equal(state.MOBILE,true);assert.equal(state.DESKTOP,true);assert.equal(state.ALL,true);assert.equal(state.STUDIO,true);assert.equal(state.CLOUD_STORAGE,true);assert.equal(state.GENERATIVE_AI,false);
    f.ledger.setSeatAllocation(owner,5);const first=f.ledger.costReport(owner,'2026-10');assert.equal(first.studio?.includedSeats,2);assert.equal(first.studio?.additionalSeats,3);assert.equal(first.studio?.baseMonthlyPriceMinor,null);assert.equal(first.totalEstimateMinor,null);assert.equal(first.grossMarginMinor,null);assert.equal(first.financialObservationRecorded,false);
    const next=configuration();next.revision='updated-test-config';next.studio!.includedSeats=4;f.setConfig(next);
    const updated=f.ledger.costReport(owner,'2026-10');assert.equal(updated.configRevision,'updated-test-config');assert.equal(updated.studio?.additionalSeats,1);assert.equal(updated.studio?.additionalSeatMonthlyPriceMinor,null);
    assert.throws(()=>f.ledger.setSeatAllocation(owner,Number.MAX_SAFE_INTEGER+1),/INVALID_STORAGE_INTEGER/);
  }finally{await f.dispose();}
});

test('Workspace storage: idempotent measured-vs-logical traffic and user accounting remain distinct',async()=>{
  const f=await fixture();
  try{
    const input=usageEvent('first');f.ledger.recordUsage(owner,input);f.ledger.recordUsage(owner,input);
    f.ledger.recordUsage(owner,usageEvent('adapter',{origin:'adapter-measured',uploadBytes:0,downloadBytes:50,exportBytes:50}));
    f.roles.set('workspace-a/__proto__','OWNER');const prototypeActor={...owner,userId:'__proto__'};f.ledger.recordUsage(prototypeActor,usageEvent('prototype-user',{uploadBytes:5}));
    const report=f.ledger.costReport(owner,'2026-10');assert.equal(report.traffic.uploadBytes,25);assert.equal(report.traffic.downloadBytes,110);assert.equal(report.traffic.exportBytes,70);assert.equal(report.traffic.logicalTestEvents,2);assert.equal(report.traffic.adapterMeasuredEvents,1);assert.equal(report.traffic.byUser['__proto__']!.uploadBytes,5);
    assert.equal(f.ledger.costReport(owner,'2026-11').traffic.uploadBytes,0);
    assert.throws(()=>f.ledger.recordUsage(owner,{...input,put:3}),/STORAGE_IDEMPOTENCY_MISMATCH/);
    assert.throws(()=>f.ledger.recordUsage(owner,usageEvent('bad',{exportBytes:31})),/INVALID_EXPORT_TRAFFIC_SUBSET/);
    assert.equal(f.ledger.auditLog(owner).filter(event=>event.action==='storage-usage-recorded').length,3);
  }finally{await f.dispose();}
});

test('Workspace storage: usage overflow rolls back and cost estimates never imply a paid subscription',async()=>{
  const f=await fixture();
  try{
    f.ledger.recordUsage(owner,usageEvent('max',{uploadBytes:Number.MAX_SAFE_INTEGER,downloadBytes:0,exportBytes:0,put:0,get:0,list:0}));
    assert.throws(()=>f.ledger.recordUsage(owner,usageEvent('overflow',{uploadBytes:1})),/STORAGE_INTEGER_OVERFLOW/);
    assert.equal(f.ledger.costReport(owner,'2026-10').traffic.uploadBytes,Number.MAX_SAFE_INTEGER);
    const config=configuration();config.tariffs={currency:'JPY',storageGBMonthMinor:1,uploadGBMinor:2,downloadGBMinor:3,put1000Minor:4,get1000Minor:5,list1000Minor:6,other1000Minor:7};f.setConfig(config);
    // Deliberately arbitrary injected rates, not a commercial quote, provider price or Apple fee assumption.
    f.ledger.recordUsage(owner,usageEvent('cost',{period:'2026-11',uploadBytes:1e9,downloadBytes:2e9,exportBytes:1e9,put:1000,get:1000,list:1000,other:1000}));
    const estimated=f.ledger.costReport(owner,'2026-11');assert.equal(estimated.totalEstimateMinor,30);assert.match(estimated.estimateCaveat,/NOT_PROVIDER_INVOICE/);
    f.ledger.recordFinancialObservation(owner,{period:'2026-11',currency:'JPY',origin:'logical-test',storageRevenueMinor:100,storageProviderCostMinor:30,aiCostMinor:10,appleFeeMinor:null,paymentFeeMinor:5});assert.equal(f.ledger.costReport(owner,'2026-11').grossMarginMinor,null);
    f.ledger.recordFinancialObservation(owner,{period:'2026-11',currency:'JPY',origin:'logical-test',storageRevenueMinor:100,storageProviderCostMinor:30,aiCostMinor:10,appleFeeMinor:15,paymentFeeMinor:5});assert.equal(f.ledger.costReport(owner,'2026-11').grossMarginMinor,40);
    assert.equal(f.ledger.entitlements(owner).MOBILE,false);
  }finally{await f.dispose();}
});

test('Workspace storage: append-only audit records attribution and transaction actions',async()=>{
  const f=await fixture();
  try{
    const input=reservation('audited',10),record=f.ledger.reserve(owner,input);f.ledger.commit(owner,input.operationId,{...input,persisted:true});f.ledger.setTrash(owner,record.objectKey,true);f.ledger.setTrash(owner,record.objectKey,false);
    const events=f.ledger.auditLog(owner);assert.deepEqual(events.map(event=>event.action),['storage-plan-change','entitlement-change','storage-reserve','storage-commit','storage-trash','storage-recover']);
    assert.equal(events.every(event=>event.userId===owner.userId&&!Number.isNaN(Date.parse(event.createdAt))),true);
    const db=new DatabaseSync(f.path);try{assert.throws(()=>db.exec("UPDATE storage_audit SET action='rewritten'"),/IMMUTABLE_STORAGE_AUDIT/);assert.throws(()=>db.exec('DELETE FROM storage_audit'),/IMMUTABLE_STORAGE_AUDIT/);}finally{db.close();}
    assert.equal(f.ledger.auditLog(owner).length,6);
  }finally{await f.dispose();}
});
