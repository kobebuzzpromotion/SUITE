import test from 'node:test';
import assert from 'node:assert/strict';
import {grainSyncGate, verifiedBatchRows} from '../src/editor-ui.mjs';

const session={batchAvailable:true,batchSyncGrain(){}};
const state={asset:{id:'source'},revision:1,dirty:false,
  assets:[{id:'source'},{id:'first'},{id:'second'}],busy:null,exporting:false};

test('GRAIN-SYNC-UI01 / authenticated saved source and two explicit distinct targets required',()=>{
  assert.equal(grainSyncGate(session,state,['first','second']),null);
  assert.equal(grainSyncGate(session,state,['first']),'GRAIN_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(grainSyncGate(session,state,['first','first']),'GRAIN_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(grainSyncGate(session,state,['first','source']),'GRAIN_SYNC_TARGETS_INVALID');
  assert.equal(grainSyncGate(session,{...state,dirty:true},['first','second']),
    'GRAIN_SYNC_SAVED_SOURCE_REQUIRED');
  assert.equal(grainSyncGate({...session,batchAvailable:false},state,['first','second']),
    'GRAIN_SYNC_AUTHENTICATED_STORAGE_REQUIRED');
});

test('GRAIN-SYNC-UI02 / expired, busy or fabricated result never becomes success',()=>{
  assert.equal(grainSyncGate(session,state,['first','second'],{blocked:true}),
    'GRAIN_SYNC_ACCESS_EXPIRED');
  assert.equal(grainSyncGate(session,{...state,busy:'saving'},['first','second']),
    'GRAIN_SYNC_BUSY');
  const source={id:'source',revision:1};
  const rows=[{assetId:'first',status:'conflict',reason:'GRAIN_SYNC_REVISION_CONFLICT'},
    {assetId:'second',status:'saved',revision:2}];
  assert.deepEqual(verifiedBatchRows({source,results:rows},source,['first','second'])
    .map(row=>({assetId:row.assetId,status:row.status,reason:row.reason,revision:row.revision})),
    rows.map(row=>({assetId:row.assetId,status:row.status,reason:row.reason,revision:row.revision})));
  assert.equal(verifiedBatchRows({source,results:rows.slice(1)},source,['first','second']),null);
  assert.equal(verifiedBatchRows({source,results:[{assetId:'first',status:'saved'},rows[1]]},
    source,['first','second']),null);
});
