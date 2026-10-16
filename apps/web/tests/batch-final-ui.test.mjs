import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {batchFinalGate,verifiedBatchFinalManifest} from '../src/editor-ui.mjs';
import {planExportQueue} from '../src/export-queue.mjs';

const assets=[{id:'a',name:'one.RAW',sha256:'a'.repeat(64),size:4},{id:'b',name:'two.RAW',sha256:'b'.repeat(64),size:4},{id:'c',name:'three.RAW',sha256:'c'.repeat(64),size:4}];
const saved={asset:assets[0],assets,revision:2,dirty:false,busy:null,exporting:false};
const session={batchAvailable:true,exportBatchFinal(){},cancelExport(){}};
const plan=planExportQueue({orderedIds:['b','a'],assets});
const items=[{assetId:'b',blob:new Blob(['b'],{type:'image/png'})},{assetId:'a',blob:new Blob(['a'],{type:'image/png'})}];

test('Batch Final UI requires authenticated saved source, explicit 2..20 unique ordered IDs and idle permission',()=>{
  assert.equal(batchFinalGate(session,saved,['b','a']),null);
  assert.equal(batchFinalGate({...session,batchAvailable:false},saved,['b','a']),'BATCH_FINAL_AUTHENTICATED_STORAGE_REQUIRED');
  assert.equal(batchFinalGate(session,{...saved,dirty:true},['b','a']),'BATCH_FINAL_SAVED_SOURCE_REQUIRED');
  assert.equal(batchFinalGate(session,{...saved,revision:0},['b','a']),'BATCH_FINAL_SAVED_SOURCE_REQUIRED');
  assert.equal(batchFinalGate(session,saved,['b','a'],{blocked:true}),'BATCH_FINAL_ACCESS_EXPIRED');
  assert.equal(batchFinalGate(session,{...saved,exporting:true},['b','a']),'BATCH_FINAL_BUSY');
  assert.equal(batchFinalGate(session,saved,['a']),'BATCH_FINAL_SELECTION_REQUIRED');
  assert.equal(batchFinalGate(session,saved,['a','a']),'BATCH_FINAL_SELECTION_INVALID');
  assert.equal(batchFinalGate(session,saved,['a','unknown']),'BATCH_FINAL_SELECTION_INVALID');
  const many=Array.from({length:21},(_,i)=>String(i));
  assert.equal(batchFinalGate(session,saved,many),'BATCH_FINAL_TOO_LARGE');
});

test('only complete correctly ordered Final Blobs produce safe individual names',()=>{
  const result={status:'complete',plan,items};
  const manifest=verifiedBatchFinalManifest(result,['b','a'],{format:'png',method:'custom-sequence',customName:'../Selection',existingNames:[]});
  assert.equal(manifest.status,'download-manifest-only');
  assert.deepEqual(manifest.files.map(file=>[file.assetId,file.name]),[['b','_Selection_001.png'],['a','_Selection_002.png']]);
  assert.equal(manifest.files[0].blob,items[0].blob);
  assert.throws(()=>verifiedBatchFinalManifest({...result,status:'partial'},['b','a'],{format:'png'}),/EXPORT_BATCH_RESULT_INCOMPLETE/);
  assert.throws(()=>verifiedBatchFinalManifest({...result,items:items.slice(0,1)},['b','a'],{format:'png'}),/EXPORT_BATCH_RESULT_INCOMPLETE/);
  assert.throws(()=>verifiedBatchFinalManifest(result,['a','b'],{format:'png'}),/EXPORT_BATCH_RESULT_INCOMPLETE/);
  assert.throws(()=>verifiedBatchFinalManifest(result,['b','a'],{format:'png',method:'custom-sequence',customName:''}),/EXPORT_CUSTOM_NAME_REQUIRED/);
});

test('Batch Final UI keeps manual links, URL cleanup, cancellation, and narrow touch controls in source',()=>{
  const ui=readFileSync(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/editorial-editor.css',import.meta.url),'utf8');
  assert.match(ui,/for\(const file of batchFinalDownloads\)URL\.revokeObjectURL\(file\.url\)/);
  assert.match(ui,/session\.cancelExport\(\)/);
  assert.match(ui,/link\.href=file\.url;link\.download=file\.name/);
  assert.doesNotMatch(ui,/batchFinalDownloads[^\n]*\.click\(/);
  assert.match(css,/\.batch-final-move\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/);
  assert.match(css,/\.batch-final-choice\s*\{[^}]*min-height:\s*44px/);
  assert.match(css,/#batch-final-downloads\s*\{[^}]*overflow-y:\s*auto/);
});
