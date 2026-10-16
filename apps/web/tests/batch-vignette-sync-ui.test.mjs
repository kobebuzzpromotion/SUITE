import test from 'node:test';
import assert from 'node:assert/strict';
import {vignetteSyncGate, verifiedBatchRows} from '../src/editor-ui.mjs';

const session={batchAvailable:true,batchSyncVignette(){}};
const state={asset:{id:'source'},revision:1,dirty:false,
  assets:[{id:'source'},{id:'first'},{id:'second'}],busy:null,exporting:false};

test('VIGNETTE-SYNC-UI01: saved authenticated source and two distinct selected targets are required',()=>{
  assert.equal(vignetteSyncGate(session,state,['first','second']),null);
  assert.equal(vignetteSyncGate(session,state,['first']),'VIGNETTE_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(vignetteSyncGate(session,state,['first','first']),'VIGNETTE_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(vignetteSyncGate(session,state,['first','source']),'VIGNETTE_SYNC_TARGETS_INVALID');
  assert.equal(vignetteSyncGate(session,{...state,dirty:true},['first','second']),
    'VIGNETTE_SYNC_SAVED_SOURCE_REQUIRED');
  assert.equal(vignetteSyncGate({...session,batchAvailable:false},state,['first','second']),
    'VIGNETTE_SYNC_AUTHENTICATED_STORAGE_REQUIRED');
});

test('VIGNETTE-SYNC-UI02: busy/expired and fabricated result rows are not successful',()=>{
  assert.equal(vignetteSyncGate(session,state,['first','second'],{blocked:true}),
    'VIGNETTE_SYNC_ACCESS_EXPIRED');
  assert.equal(vignetteSyncGate(session,{...state,busy:'saving'},['first','second']),
    'VIGNETTE_SYNC_BUSY');
  const source={id:'source',revision:1};
  const rows=[{assetId:'first',status:'unverified',reason:'VIGNETTE_SYNC_POSTSAVE_MISMATCH'},
    {assetId:'second',status:'saved',revision:2}];
  assert.deepEqual(verifiedBatchRows({source,results:rows},source,['first','second'])
    .map(row=>({assetId:row.assetId,status:row.status,reason:row.reason,revision:row.revision})),
    rows.map(row=>({assetId:row.assetId,status:row.status,reason:row.reason,revision:row.revision})));
  assert.equal(verifiedBatchRows({source,results:rows.slice(1)},source,['first','second']),null);
  assert.equal(verifiedBatchRows({source,results:[{assetId:'first',status:'saved'},rows[1]]},
    source,['first','second']),null);
});
