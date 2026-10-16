import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {exportTrialDngCaptureDateFinal} from
  '../src/export-capture-date-final.mjs';
import {recipe,syntheticPixels,deferred} from './fixtures.mjs';

const START=Date.parse('2026-10-03T08:00:00.000Z');
const END='2026-11-03T08:00:00.000Z';
const sha=buffer=>createHash('sha256').update(new Uint8Array(buffer)).digest('hex');

// Exif/TIFF-shaped bytes for Gate testing, not a decodable camera RAW image.
function syntheticDng({offset='+09:00',dng=true}={}){
  const bytes=new Uint8Array(384),view=new DataView(bytes.buffer);
  bytes[0]=bytes[1]=0x49;view.setUint16(2,42,true);view.setUint32(4,8,true);
  view.setUint16(8,4,true);
  function entry(at,tag,type,count,value){
    view.setUint16(at,tag,true);view.setUint16(at+2,type,true);
    view.setUint32(at+4,count,true);view.setUint32(at+8,value,true);
  }
  entry(10,0x0112,3,1,1);entry(22,0x8769,4,1,120);
  entry(34,dng?0xc612:0xc611,1,4,0);bytes.set([1,4,0,0],42);
  entry(46,0xc614,2,12,300);
  view.setUint16(120,offset===null?1:2,true);
  entry(122,0x9003,2,20,200);
  if(offset!==null)entry(134,0x9011,2,7,240);
  bytes.set(new TextEncoder().encode('2024:02:29 23:59:58\0'),200);
  if(offset!==null)bytes.set(new TextEncoder().encode(`${offset}\0`),240);
  bytes.set(new TextEncoder().encode('Test Camera\0'),300);
  return bytes.buffer;
}

async function fixture(){
  const dataDir=await mkdtemp(join(tmpdir(),'suite-dng-final-'));
  let now=START;
  const context=await createTrialServer({dataDir,port:0,clock:()=>now});
  await new Promise((done,reject)=>{
    context.server.once('error',reject);
    context.server.listen(0,'127.0.0.1',done);
  });
  const baseURL=`http://127.0.0.1:${context.server.address().port}`;
  async function login(name,trialEndsAt=END){
    const author=context.auth.createAuthor({authorName:name,trialEndsAt});
    const invitation=context.auth.issueInvite(author.id);
    const response=await fetch(baseURL+'/trial/login',{method:'POST',
      headers:{'X-Suite-Trial':'1','Content-Type':'application/json'},
      body:JSON.stringify({inviteToken:invitation.inviteToken})});
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie,/^suite_trial=/);
    const client=new TrialClient({baseURL,fetcher:(url,init)=>fetch(url,
      {...init,headers:{...init.headers,Cookie:cookie}})});
    return {client};
  }
  async function create(client,name='IMG_1234.dng',original=syntheticDng()){
    const created=await client.createAsset({name,sha256:sha(original),
      size:original.byteLength});
    const asset=await client.putOriginal(created.id,original);
    const saved=await client.saveRecipe(asset.id,0,recipe());
    assert.equal(saved.revision,1);
    return {asset,original,saved};
  }
  async function editor(client,record,{onFinalEncode,finalType}={}){
    let finalEncodes=0;
    const processing={syntheticTestOnly:true,
      async decodeRaw(){return {pixels:syntheticPixels(4,4),
        provenance:{fixture:'SYNTHETIC_DNG_DECODE_NOT_RAW'}};},
      async makeProxy(pixels){return pixels;},
      async render(pixels){return pixels;},
      async encode(pixels,{format,signal}){
        if(format==='jpeg'){
          finalEncodes++;
          if(onFinalEncode)await onFinalEncode({signal,client,record});
        }
        return new Blob([pixels.data],{type:format==='jpeg'&&finalType?
          finalType:`image/${format}`});
      }};
    const session=new EditorSession({api:client,processing,
      storage:{get:async()=>undefined,put:async()=>{}},
      urlAPI:{createObjectURL:()=>`blob:synthetic-${Math.random()}`,
        revokeObjectURL(){}},personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
    await session.initialize();await session.openAsset(record.asset.id);
    return {session,get finalEncodes(){return finalEncodes;}};
  }
  return {context,login,create,editor,advance(ms){now+=ms;},
    objectPath(asset){
      const base=resolve(dataDir,'objects')+sep;
      const target=resolve(dataDir,'objects',asset.originalKey);
      if(!target.startsWith(base))throw Error('DNG_FINAL_OBJECT_PATH_INVALID');
      return target;
    },
    async cleanup(){
      await new Promise((done,reject)=>context.server.close(error=>
        error?reject(error):done()));
      const target=resolve(dataDir),base=resolve(tmpdir())+sep;
      if(!target.startsWith(base)||!target.split(sep).at(-1).startsWith('suite-dng-final-'))
        throw Error('DNG_FINAL_FIXTURE_CLEANUP_TARGET_INVALID');
      await rm(target,{recursive:true,force:true});
    }};
}

test('DNG-FINAL-HTTP01 / REAL_TRIAL_SQLITE_SYNTHETIC_DNG: saved Final Blob gets safe date name, Original and Recipe unchanged',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Owner');
    const record=await f.create(client,'IMG_1234.dng');
    const editor=await f.editor(client,record);
    const before=editor.session.state;
    const result=await exportTrialDngCaptureDateFinal({api:client,
      session:editor.session,exportOptions:{format:'jpeg'}});
    assert.equal(result.filename,'20240229_IMG_1234.jpg');
    assert.equal(result.captureDate,'2024-02-29');
    assert.equal(result.blob.type,'image/jpeg');
    assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),
      new Uint8Array(syntheticPixels(4,4).data));
    assert.equal(editor.finalEncodes,1);
    assert.deepEqual(result.binding,{assetID:record.asset.id,
      originalSHA256:record.asset.sha256,savedRevision:1});
    assert.equal(sha(await client.getOriginal(record.asset.id)),sha(record.original));
    assert.deepEqual(await client.getRecipe(record.asset.id),record.saved);
    assert.equal(editor.session.state.dirty,false);
    assert.deepEqual(editor.session.state.recipe,before.recipe);
    assert.ok(Object.isFrozen(result));
  }finally{await f.cleanup();}
});

test('DNG-FINAL-HTTP02: missing Exif offset and non-DNG never reach Final encode',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Owner');
    for(const [label,original,expected] of [
      ['missing.dng',syntheticDng({offset:null}),/CAPTURE_DATE_NAMING_EVIDENCE_UNAVAILABLE/],
      ['false.dng',syntheticDng({dng:false}),/EXIF_CAPTURE_DNG_VERSION_INVALID/]
    ]){
      const record=await f.create(client,label,original);
      const editor=await f.editor(client,record);
      await assert.rejects(exportTrialDngCaptureDateFinal({api:client,
        session:editor.session}),expected);
      assert.equal(editor.finalEncodes,0);
    }
  }finally{await f.cleanup();}
});

test('DNG-FINAL-HTTP03: Recipe revision race during Final yields no Blob result',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Owner');
    const record=await f.create(client);
    const editor=await f.editor(client,record,{onFinalEncode:async()=>{
      await client.saveRecipe(record.asset.id,1,recipe());
    }});
    await assert.rejects(exportTrialDngCaptureDateFinal({api:client,
      session:editor.session,exportOptions:{format:'jpeg'}}),
    /EXPORT_FIXED_RECIPE_MISMATCH|CAPTURE_DATE_NAMING_SAVED_RECIPE_MISMATCH/);
    assert.equal(editor.finalEncodes,1);
    assert.equal(editor.session.state.dirty,false);
    assert.equal((await client.getRecipe(record.asset.id)).revision,2);
  }finally{await f.cleanup();}
});

test('DNG-FINAL-HTTP04: logout after Session Final is caught by second fresh Trial Gate',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Owner');
    const record=await f.create(client);
    const editor=await f.editor(client,record);
    const actualFinal=editor.session.exportFinal.bind(editor.session);
    editor.session.exportFinal=async options=>{
      const blob=await actualFinal(options);
      await client.logout();
      return blob;
    };
    await assert.rejects(exportTrialDngCaptureDateFinal({api:client,
      session:editor.session,exportOptions:{format:'jpeg'}}),
    /UNAUTHORIZED|SESSION_REQUIRED/);
    assert.equal(editor.finalEncodes,1);
  }finally{await f.cleanup();}
});

test('DNG-FINAL-HTTP05: same TrialClient, safe name, Blob MIME and cancellation fail closed',async()=>{
  const f=await fixture();try{
    const owner=await f.login('Owner'),other=await f.login('Other');
    const record=await f.create(owner.client,'../IMG<>.dng');
    const editor=await f.editor(owner.client,record);
    await assert.rejects(exportTrialDngCaptureDateFinal({api:other.client,
      session:editor.session}),/CAPTURE_DATE_FINAL_INPUT_INVALID/);
    const renamed=await exportTrialDngCaptureDateFinal({api:owner.client,
      session:editor.session,existingNames:['20240229__IMG_.jpg']});
    assert.equal(renamed.filename,'20240229__IMG__01.jpg');
    const controller=new AbortController();controller.abort();
    await assert.rejects(exportTrialDngCaptureDateFinal({api:owner.client,
      session:editor.session,signal:controller.signal}),{name:'AbortError'});
    const wrong=await f.editor(owner.client,record,{finalType:'text/plain'});
    await assert.rejects(exportTrialDngCaptureDateFinal({api:owner.client,
      session:wrong.session,exportOptions:{format:'jpeg'}}),
    /CAPTURE_DATE_FINAL_BLOB_INVALID/);
  }finally{await f.cleanup();}
});

test('DNG-FINAL-HTTP06: abort during synthetic Final cancels Session and returns no Blob',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Owner');
    const record=await f.create(client),entered=deferred(),release=deferred();
    const controller=new AbortController();
    const editor=await f.editor(client,record,{onFinalEncode:async()=>{
      entered.resolve();await release.promise;
    }});
    const pending=exportTrialDngCaptureDateFinal({api:client,
      session:editor.session,exportOptions:{format:'jpeg'},signal:controller.signal});
    await entered.promise;controller.abort();release.resolve();
    await assert.rejects(pending,error=>error.name==='AbortError'||
      error.message==='EXPORT_ABORTED');
    assert.equal(editor.session.state.exporting,false);
    assert.equal(editor.finalEncodes,1);
  }finally{await f.cleanup();}
});

test('DNG-FINAL-HTTP07: Original bytes changed after Session Final are rejected by second fresh Gate',async()=>{
  const f=await fixture();try{
    const {client}=await f.login('Owner');
    const record=await f.create(client);
    const editor=await f.editor(client,record);
    const actualFinal=editor.session.exportFinal.bind(editor.session);
    editor.session.exportFinal=async options=>{
      const blob=await actualFinal(options);
      const changed=new Uint8Array(record.original.slice(0));
      changed[320]^=1;
      await writeFile(f.objectPath(record.asset),changed);
      return blob;
    };
    await assert.rejects(exportTrialDngCaptureDateFinal({api:client,
      session:editor.session,exportOptions:{format:'jpeg'}}),
    /CAPTURE_DATE_GATE_ORIGINAL_CHANGED|RAW_CHECKSUM_MISMATCH|WAITING_FOR_ORIGINAL/);
    assert.equal(editor.finalEncodes,1);
  }finally{await f.cleanup();}
});
