import test from 'node:test';
import assert from 'node:assert/strict';
import {batchEditGate,verifiedBatchRows} from '../src/editor-ui.mjs';

const connected={batchAvailable:true,batchApplyCurrentRecipe(){}};
const state={asset:{id:'source'},assets:[{id:'source'},{id:'one'},{id:'two'}],revision:2,dirty:false,busy:null,exporting:false};

test('batch UI requires authenticated storage and an actual session method',()=>{
  assert.equal(batchEditGate({...connected,batchAvailable:false},state,['one']),'BATCH_AUTHENTICATED_STORAGE_REQUIRED');
  assert.equal(batchEditGate({batchAvailable:true},state,['one']),'BATCH_AUTHENTICATED_STORAGE_REQUIRED');
  assert.equal(batchEditGate(connected,state,['one']),null);
});

test('batch UI accepts only a saved source and explicitly selected other assets',()=>{
  assert.equal(batchEditGate(connected,{...state,dirty:true},['one']),'BATCH_SAVED_SOURCE_REQUIRED');
  assert.equal(batchEditGate(connected,{...state,revision:0},['one']),'BATCH_SAVED_SOURCE_REQUIRED');
  assert.equal(batchEditGate(connected,state,[]),'BATCH_TARGETS_REQUIRED');
  assert.equal(batchEditGate(connected,state,['one','one']),'BATCH_TARGETS_REQUIRED');
  assert.equal(batchEditGate(connected,state,['source']),'BATCH_TARGETS_INVALID');
  assert.equal(batchEditGate(connected,state,['unknown']),'BATCH_TARGETS_INVALID');
  assert.equal(batchEditGate(connected,state,['one','two']),null);
});

test('batch UI stops during access loss, active work or export',()=>{
  assert.equal(batchEditGate(connected,state,['one'],{blocked:true}),'BATCH_ACCESS_EXPIRED');
  assert.equal(batchEditGate(connected,state,['one'],{pending:true}),'BATCH_BUSY');
  assert.equal(batchEditGate(connected,{...state,busy:'saving'},['one']),'BATCH_BUSY');
  assert.equal(batchEditGate(connected,{...state,exporting:true},['one']),'BATCH_BUSY');
});

test('batch UI only displays verified saved/conflict/unverified/failed rows for the exact source and targets',()=>{
  const result={source:{id:'source',revision:2},results:[
    {assetId:'one',status:'saved',revision:3},
    {assetId:'two',status:'conflict',reason:'BATCH_REVISION_CONFLICT'}]};
  assert.deepEqual(verifiedBatchRows(result,state.asset,['one','two']),null); // Source revision must be snapshotted.
  assert.deepEqual(verifiedBatchRows(result,{id:'source',revision:2},['one','two']).map(row=>row.status),['saved','conflict']);
  assert.equal(verifiedBatchRows({...result,source:{id:'other',revision:2}},{id:'source',revision:2},['one','two']),null);
  assert.equal(verifiedBatchRows({...result,results:[result.results[0]]},{id:'source',revision:2},['one','two']),null);
  assert.equal(verifiedBatchRows({...result,results:[result.results[0],result.results[0]]},{id:'source',revision:2},['one','two']),null);
  assert.equal(verifiedBatchRows({...result,results:[result.results[0],{assetId:'two',status:'success'}]},{id:'source',revision:2},['one','two']),null);
  assert.equal(verifiedBatchRows({...result,results:[{assetId:'one',status:'saved'},result.results[1]]},{id:'source',revision:2},['one','two']),null);
});
