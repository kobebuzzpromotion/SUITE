import test from 'node:test';
import assert from 'node:assert/strict';
import {calibrationSyncGate, verifiedBatchRows} from '../src/editor-ui.mjs';

const session={batchAvailable:true,batchSyncCalibration(){}};
const state={asset:{id:'source'},revision:1,dirty:false,
  assets:[{id:'source'},{id:'first'},{id:'second'}],busy:null,exporting:false};

test('CALIBRATION-SYNC-UI01 / authenticated saved source and two explicit distinct targets required',()=>{
  assert.equal(calibrationSyncGate(session,state,['first','second']),null);
  assert.equal(calibrationSyncGate(session,state,['first']),'CALIBRATION_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(calibrationSyncGate(session,state,['first','first']),'CALIBRATION_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(calibrationSyncGate(session,state,['first','source']),'CALIBRATION_SYNC_TARGETS_INVALID');
  assert.equal(calibrationSyncGate(session,{...state,dirty:true},['first','second']),
    'CALIBRATION_SYNC_SAVED_SOURCE_REQUIRED');
  assert.equal(calibrationSyncGate({...session,batchAvailable:false},state,['first','second']),
    'CALIBRATION_SYNC_AUTHENTICATED_STORAGE_REQUIRED');
});

test('CALIBRATION-SYNC-UI02 / expired, busy or fabricated result never becomes success',()=>{
  assert.equal(calibrationSyncGate(session,state,['first','second'],{blocked:true}),
    'CALIBRATION_SYNC_ACCESS_EXPIRED');
  assert.equal(calibrationSyncGate(session,{...state,busy:'saving'},['first','second']),
    'CALIBRATION_SYNC_BUSY');
  const source={id:'source',revision:1};
  const rows=[{assetId:'first',status:'conflict',reason:'CALIBRATION_SYNC_REVISION_CONFLICT'},
    {assetId:'second',status:'saved',revision:2}];
  assert.deepEqual(verifiedBatchRows({source,results:rows},source,['first','second'])
    .map(row=>({assetId:row.assetId,status:row.status,reason:row.reason,revision:row.revision})),
    rows.map(row=>({assetId:row.assetId,status:row.status,reason:row.reason,revision:row.revision})));
  assert.equal(verifiedBatchRows({source,results:rows.slice(1)},source,['first','second']),null);
  assert.equal(verifiedBatchRows({source,results:[{assetId:'first',status:'saved'},rows[1]]},
    source,['first','second']),null);
});
