import test from 'node:test';
import assert from 'node:assert/strict';
import {selectiveColorSyncGate,verifiedBatchRows} from '../src/editor-ui.mjs';

const session={batchAvailable:true,batchSyncSelectiveColor(){}};
const state={asset:{id:'source'},revision:1,dirty:false,
  assets:[{id:'source'},{id:'first'},{id:'second'}],busy:null,exporting:false};

test('SELECTIVE-SYNC-UI01: authenticated saved source and two explicit distinct targets required',()=>{
  assert.equal(selectiveColorSyncGate(session,state,['first','second']),null);
  assert.equal(selectiveColorSyncGate(session,state,['first']),'SELECTIVE_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(selectiveColorSyncGate(session,state,['first','first']),'SELECTIVE_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(selectiveColorSyncGate(session,state,['first','source']),'SELECTIVE_SYNC_TARGETS_INVALID');
  assert.equal(selectiveColorSyncGate(session,{...state,dirty:true},['first','second']),
    'SELECTIVE_SYNC_SAVED_SOURCE_REQUIRED');
  assert.equal(selectiveColorSyncGate({...session,batchAvailable:false},state,['first','second']),
    'SELECTIVE_SYNC_AUTHENTICATED_STORAGE_REQUIRED');
});

test('SELECTIVE-SYNC-UI02: expired, busy, missing or fabricated result never becomes success',()=>{
  assert.equal(selectiveColorSyncGate(session,state,['first','second'],{blocked:true}),
    'SELECTIVE_SYNC_ACCESS_EXPIRED');
  assert.equal(selectiveColorSyncGate(session,{...state,busy:'saving'},['first','second']),
    'SELECTIVE_SYNC_BUSY');
  const source={id:'source',revision:1};
  const rows=[{assetId:'first',status:'conflict',reason:'SELECTIVE_SYNC_REVISION_CONFLICT'},
    {assetId:'second',status:'saved',revision:2}];
  assert.deepEqual(verifiedBatchRows({source,results:rows},source,['first','second'])
    .map(row=>({assetId:row.assetId,status:row.status,reason:row.reason,revision:row.revision})),
    rows.map(row=>({assetId:row.assetId,status:row.status,reason:row.reason,revision:row.revision})));
  assert.equal(verifiedBatchRows({source,results:rows.slice(1)},source,['first','second']),null);
  assert.equal(verifiedBatchRows({source,results:[{assetId:'first',status:'saved'},rows[1]]},
    source,['first','second']),null);
});
