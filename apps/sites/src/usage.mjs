const run=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).run();
export function storageLimit(env){const limit=Number(env.SUITE_TRIAL_STORAGE_LIMIT_BYTES);if(!Number.isSafeInteger(limit)||limit<=0)throw Error('TRIAL_LIMITS_NOT_CONFIGURED');return limit;}
function validateLimits(env){storageLimit(env);for(const name of ['SUITE_TRIAL_R2_WRITE_LIMIT_MONTH','SUITE_TRIAL_R2_READ_LIMIT_MONTH','SUITE_TRIAL_REQUEST_LIMIT_DAY']){const value=Number(env[name]);if(!Number.isSafeInteger(value)||value<=0)throw Error('TRIAL_LIMITS_NOT_CONFIGURED');}}
/** Reserve both staging parts and final bytes BEFORE a new import. Reservations never auto-expire/delete. */
export function reserveAssetStatement(env,id,size){return env.DB.prepare('INSERT INTO site_storage_reservations SELECT ?,?,? WHERE COALESCE((SELECT SUM(bytes) FROM site_storage_reservations),0)+?<=?').bind(id,size*2,new Date().toISOString(),size*2,storageLimit(env));}
export async function reserveObject(env,assetID,key,size){
  const sql='INSERT INTO site_storage_objects SELECT ?,?,?,?,? WHERE COALESCE((SELECT SUM(bytes) FROM site_storage_objects WHERE asset_id=?),0)+? <= COALESCE((SELECT bytes FROM site_storage_reservations WHERE asset_id=?),0)';
  const args=[key,assetID,size,'RESERVED',new Date().toISOString(),assetID,size,assetID];let result=await run(env,sql,...args);
  if(Number(result.meta?.changes)!==1){
    // Repaired parts keep the older bytes: reserve the extra retained physical bytes, not just logical RAW size.
    result=await run(env,'UPDATE site_storage_reservations SET bytes=bytes+? WHERE asset_id=? AND COALESCE((SELECT SUM(bytes) FROM site_storage_reservations),0)+?<=?',size,assetID,size,storageLimit(env));
    if(Number(result.meta?.changes)!==1)throw Error('TRIAL_STORAGE_LIMIT');result=await run(env,sql,...args);if(Number(result.meta?.changes)!==1)throw Error('TRIAL_STORAGE_LIMIT');
  }
}
export const persistedObject=(env,key)=>run(env,'UPDATE site_storage_objects SET state=? WHERE object_key=?','PERSISTED',key);
async function admit(env,kind,period,limit){
  if(!Number.isSafeInteger(limit)||limit<1)throw Error('TRIAL_LIMITS_NOT_CONFIGURED');
  const r=await run(env,'INSERT INTO site_operation_budget VALUES(?,?,1) ON CONFLICT(period,kind) DO UPDATE SET count=count+1 WHERE count<?',period,kind,limit);if(Number(r.meta?.changes)!==1)throw Error('TRIAL_OPERATION_LIMIT');
}
export async function measureRequest(request,env,handler){
  const started=performance.now(),now=env.__testNow??Date.now(),day=new Date(now).toISOString().slice(0,10),month=day.slice(0,7),s={requests:1,r2Reads:0,r2Writes:0,rowsRead:0,rowsWritten:0,unknown:0,bytes:0};
  const track=result=>{const m=result?.meta;if(Number.isFinite(m?.rows_read)&&Number.isFinite(m?.rows_written)){s.rowsRead+=m.rows_read;s.rowsWritten+=m.rows_written;}else s.unknown++;return result;};
  const wrapStatement=original=>({bind(...args){return wrapStatement(original.bind(...args));},async run(){return track(await original.run());},async all(){return track(await original.all());},async first(){const r=track(await original.all());return r.results[0]||null;}});
  const db={prepare(sql){return wrapStatement(env.DB.prepare(sql));},async batch(list){const result=await env.DB.batch(list.map(s=>s.__raw||s));result.forEach(track);return result;}};
  // D1 batch consumes real prepared statements; expose only the private wrapper's raw statement.
  const prepare=db.prepare;db.prepare=sql=>{function wrapped(raw){return {__raw:raw,bind(...a){return wrapped(raw.bind(...a));},async run(){return track(await raw.run());},async all(){return track(await raw.all());},async first(){const r=track(await raw.all());return r.results[0]||null;}};}return wrapped(env.DB.prepare(sql));};
  const context={...env,DB:db};
  const operation=async(kind)=>{const limit=Number(env[kind==='A'?'SUITE_TRIAL_R2_WRITE_LIMIT_MONTH':'SUITE_TRIAL_R2_READ_LIMIT_MONTH']);await admit(context,kind,month,limit);if(kind==='A')s.r2Writes++;else s.r2Reads++;};
  context.BUCKET={
    async get(key){await operation('B');const object=await env.BUCKET.get(key);if(object)s.bytes+=object.size;return object;},
    async put(...args){await operation('A');return env.BUCKET.put(...args);},
    async createMultipartUpload(...args){await operation('A');const upload=await env.BUCKET.createMultipartUpload(...args);return {async uploadPart(...p){await operation('A');return upload.uploadPart(...p);},async complete(...p){await operation('A');return upload.complete(...p);}};}
  };
  let response;
  try{validateLimits(env);await admit(context,'REQUEST',day,Number(env.SUITE_TRIAL_REQUEST_LIMIT_DAY));response=await handler(request,context);}
  catch(e){response=new Response(JSON.stringify({error:e.message}),{status:e.message==='TRIAL_LIMITS_NOT_CONFIGURED'?503:/LIMIT/.test(e.message)?429:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
  try{
    await env.DB.prepare('INSERT INTO site_metrics VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET requests=requests+excluded.requests,r2_reads=r2_reads+excluded.r2_reads,r2_writes=r2_writes+excluded.r2_writes,d1_rows_read=d1_rows_read+excluded.d1_rows_read,d1_rows_written=d1_rows_written+excluded.d1_rows_written,d1_metadata_unknown=d1_metadata_unknown+excluded.d1_metadata_unknown,object_bytes_requested=object_bytes_requested+excluded.object_bytes_requested,wall_ms=wall_ms+excluded.wall_ms').bind(day,1,s.r2Reads,s.r2Writes,s.rowsRead,s.rowsWritten,s.unknown,s.bytes,Math.ceil(performance.now()-started)).run();
  }catch{/* No success claim for unavailable metering. Reject response, retain all data. */response=new Response(JSON.stringify({error:'USAGE_ACCOUNTING_UNAVAILABLE'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
  return response;
}
