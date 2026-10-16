import test from 'node:test';
import assert from 'node:assert/strict';
import {levelsSyncGate, verifiedBatchRows} from '../src/editor-ui.mjs';

const session = {batchAvailable: true, batchSyncLevels() {}};
const state = {asset: {id: 'source'}, revision: 1, dirty: false,
  assets: [{id: 'source'}, {id: 'first'}, {id: 'second'}], busy: null, exporting: false};

test('LEVELS-SYNC-UI01: only authenticated saved source and two explicit distinct targets enable action', () => {
  assert.equal(levelsSyncGate(session, state, ['first', 'second']), null);
  assert.equal(levelsSyncGate(session, state, ['first']), 'LEVELS_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(levelsSyncGate(session, state, ['first', 'first']), 'LEVELS_SYNC_TWO_TARGETS_REQUIRED');
  assert.equal(levelsSyncGate(session, state, ['first', 'source']), 'LEVELS_SYNC_TARGETS_INVALID');
  assert.equal(levelsSyncGate(session, {...state, dirty: true}, ['first', 'second']), 'LEVELS_SYNC_SAVED_SOURCE_REQUIRED');
  assert.equal(levelsSyncGate({...session, batchAvailable: false}, state, ['first', 'second']),
    'LEVELS_SYNC_AUTHENTICATED_STORAGE_REQUIRED');
});

test('LEVELS-SYNC-UI02: expired/busy conditions block action and exact result rows reject missing or fabricated success', () => {
  assert.equal(levelsSyncGate(session, state, ['first', 'second'], {blocked: true}), 'LEVELS_SYNC_ACCESS_EXPIRED');
  assert.equal(levelsSyncGate(session, {...state, busy: 'saving'}, ['first', 'second']), 'LEVELS_SYNC_BUSY');
  const source = {id: 'source', revision: 1};
  const rows = [{assetId: 'first', status: 'unverified', reason: 'REVISION_CONFLICT'},
    {assetId: 'second', status: 'saved', revision: 2}];
  assert.deepEqual(verifiedBatchRows({source, results: rows}, source, ['first', 'second'])
    .map(row => ({assetId: row.assetId, status: row.status})),
  rows.map(row => ({assetId: row.assetId, status: row.status})));
  assert.equal(verifiedBatchRows({source, results: rows.slice(1)}, source, ['first', 'second']), null);
  assert.equal(verifiedBatchRows({source, results: [{assetId: 'first', status: 'saved'}, rows[1]]},
    source, ['first', 'second']), null);
});
