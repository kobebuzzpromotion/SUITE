// Actual denial reasons and preserved bytes; explicitly NOT a RAW/pixel/Apple test.
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,existsSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {AssetRepository} from '../dist/apps/backend/src/repository.js';
import {geometryIdentifier} from '../dist/apps/backend/src/person-geometry.js';

const folder=path.resolve(process.argv[2]||'');
const evidenceRoot=path.resolve('docs/evidence');
assert.ok(folder.startsWith(evidenceRoot+path.sep));
const metadata=JSON.parse(readFileSync(path.join(folder,'RUN_METADATA.json'),'utf8'));
for(const entry of JSON.parse(readFileSync(path.join(folder,'regression.json'),'utf8')).sourceHashes){
  assert.equal(createHash('sha256').update(readFileSync(entry.file)).digest('hex'),entry.sha256,entry.file);
}
const output=path.join(folder,'PERSON_INTEGRITY_DENIALS.json');
assert.equal(existsSync(output),false,'Evidence is write-once');
const startedAt=new Date().toISOString(), events=[];
const tempBase=realpathSync(tmpdir()), root=mkdtempSync(path.join(tempBase,'suite-portrait-denials-'));
let repo;
try {
  const database=path.join(root,'assets.sqlite'), original=path.join(root,'original.storage-fixture.bin');
  const bytes=Buffer.from('NON_IMAGE storage-byte fixture. Not RAW, not a substitute image.');
  writeFileSync(original,bytes,{flag:'wx'});
  const hash=x=>createHash('sha256').update(x).digest('hex'), checksum=hash(bytes);
  repo=new AssetRepository(database);
  const asset=repo.create('tenant',{name:'original.storage-fixture.bin',sha256:checksum,size:bytes.length});
  const body={schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:0,processingOrder:['exposure','contrast','saturation','rotation'],extendedParameters:{portrait:{schemaVersion:1,engineVersion:'apple-vision-face-exposure-1',assetID:asset.id,originalSHA256:checksum,createdAt:'2026-10-03T00:00:00.000Z',updatedAt:'2026-10-03T00:00:00.000Z',targets:[{id:randomUUID(),anchor:{x:.1,y:.2,width:.2,height:.3},adjustmentType:'face_brightness',value:0},{id:randomUUID(),anchor:{x:.6,y:.2,width:.2,height:.3},adjustmentType:'face_brightness',value:0}]}}}};
  repo.saveRecipe('tenant',asset.id,'editor',0,body);
  const second=structuredClone(body);second.parameters.extendedParameters.portrait.targets[0].value=.5;
  repo.saveRecipe('tenant',asset.id,'editor',1,second);
  const deny=(id,scope,operation,inspect=()=>true,candidate=second)=>{
    let reason=null;try{operation();}catch(error){reason=error instanceof Error?error.message:String(error);}
    const preserved=inspect()&&hash(readFileSync(original))===checksum&&repo.get('tenant',asset.id).sha256===checksum;
    assert.ok(reason,id+' must reject');assert.ok(preserved,id+' must preserve');
    const incoming=candidate.parameters.extendedParameters.portrait, expected=second.parameters.extendedParameters.portrait;
    events.push({id,test_id:'PGI-DENIAL-'+id,scope,status:'DENIED_AS_EXPECTED',asset_id:asset.id,actual_asset_id:incoming.assetID,person_id:incoming.targets[0]?.id??'UNKNOWN',expected_person_id:expected.targets[0].id,recipe_version:2,wire_schema_version:candidate.schemaVersion,portrait_schema_version:incoming.schemaVersion,stored_recipe_revision:2,expected_geometry_identifier:geometryIdentifier(expected.targets[0].anchor),actual_geometry_identifier:incoming.targets[0]?geometryIdentifier(incoming.targets[0].anchor):'MISSING',expected_inventory:expected.targets.map(t=>({person_id:t.id,geometry_identifier:geometryIdentifier(t.anchor)})),actual_inventory:incoming.targets.map(t=>({person_id:t.id,geometry_identifier:geometryIdentifier(t.anchor)})),raw_checksum:checksum,actual_recipe_original_checksum:incoming.originalSHA256,raw_checksum_scope:'DB_METADATA_AND_NON_IMAGE_STORAGE_BYTES; REAL_RAW_NOT_RUN',reason,rejection_reason:reason,timestamp:new Date().toISOString(),originalStorageBytesPreserved:true,originalStorageChecksumBefore:checksum,originalStorageChecksumAfter:hash(readFileSync(original)),rawChecksum:'NOT_RUN_REAL_RAW_ABSENT'});
  };
  const saveCases=[
    ['PERSON_UUID_REPLACEMENT',p=>p.targets[0].id=randomUUID()],
    ['PERSON_GEOMETRY_SWAP',p=>{const a=p.targets[0].anchor;p.targets[0].anchor=p.targets[1].anchor;p.targets[1].anchor=a;}],
    ['WRONG_ASSET',p=>p.assetID=randomUUID()],
    ['WRONG_ORIGINAL_SHA',p=>p.originalSHA256='b'.repeat(64)],
    ['INVALID_PERSON_ID',p=>p.targets[0].id='person-index-0'],
    ['WRONG_ADJUSTMENT_TYPE',p=>p.targets[0].adjustmentType='skin_retouch'],
    ['OUT_OF_RANGE_VALUE',p=>p.targets[0].value=99],
    ['WRONG_RECIPE_VERSION',p=>p.schemaVersion=2],
    ['PARTIAL_PERSON_INVENTORY',p=>p.targets.pop()]
  ];
  for(const [id,mutate] of saveCases){const invalid=structuredClone(second);mutate(invalid.parameters.extendedParameters.portrait);deny(id,'SAVE_BOUNDARY',()=>repo.saveRecipe('tenant',asset.id,'editor',2,invalid),()=>JSON.stringify(repo.latestRecipe('tenant',asset.id)?.body)===JSON.stringify(second),invalid);}
  const readCases=[
    ['REOPEN_UUID_TAMPER',p=>p.targets[0].id=randomUUID()],
    ['REOPEN_GEOMETRY_SWAP',p=>{const a=p.targets[0].anchor;p.targets[0].anchor=p.targets[1].anchor;p.targets[1].anchor=a;}],
    ['REOPEN_ORIGINAL_SHA_TAMPER',p=>p.originalSHA256='b'.repeat(64)]
  ];
  for(const [id,mutate] of readCases){
    const invalid=structuredClone(second);mutate(invalid.parameters.extendedParameters.portrait);const damaged=JSON.stringify(invalid);
    repo.close();const db=new DatabaseSync(database);db.prepare('UPDATE recipes SET body=? WHERE asset_id=? AND revision=2').run(damaged,asset.id);db.close();repo=new AssetRepository(database);
    deny(id,'SQLITE_REOPEN_BOUNDARY',()=>repo.latestRecipe('tenant',asset.id),()=>{const inspect=new DatabaseSync(database);try{return inspect.prepare('SELECT body FROM recipes WHERE asset_id=? AND revision=2').get(asset.id)?.body===damaged;}finally{inspect.close();}},invalid);
    repo.close();const restore=new DatabaseSync(database);restore.prepare('UPDATE recipes SET body=? WHERE asset_id=? AND revision=2').run(JSON.stringify(second),asset.id);restore.close();repo=new AssetRepository(database);
  }
  assert.deepEqual(repo.latestRecipe('tenant',asset.id)?.body,second);
  writeFileSync(output,JSON.stringify({schemaVersion:1,startedAt,endedAt:new Date().toISOString(),buildID:metadata.build.id,commitSHA:metadata.environment.commitSHA_display,commitReason:metadata.environment.commitReason_display,environment:metadata.environment,events,summary:{checks:events.length,deniedAsExpected:events.length,unexpectedAccepts:0},scope:'WINDOWS_RECIPE_DENIAL_REASON_AND_NON_IMAGE_STORAGE_BYTES_ONLY',faceBrightness:'IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED',native:'NOT_RUN',visual:'NOT_RUN',mobileRelease:'BLOCK'},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,checks:events.length,status:'PASS_SCOPED_DENIAL_DIAGNOSTICS'}));
} finally {
  repo?.close();
  const resolved=realpathSync(root);
  assert.ok(resolved.startsWith(tempBase+path.sep)&&path.basename(resolved).startsWith('suite-portrait-denials-'));
  rmSync(resolved,{recursive:true,force:true});
}
