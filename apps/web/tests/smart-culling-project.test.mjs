import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualCullingProject, setManualCullingMark,
  changeManualCullingTag, addManualCullingSegment, renameManualCullingSegment,
  moveManualCullingAsset, reorderManualCullingSegments,
  filterManualCullingAssets} from '../src/smart-culling-project.mjs';

const assets = Object.freeze(['a', 'b', 'c'].map(id => Object.freeze({id,
  tenantId: 'studio-1', deletedAt: null, sha256: id.repeat(64), name: `${id}.raw`})));
const start = () => createManualCullingProject({workspaceId: 'studio-1',
  projectId: 'project-1', assets});

test('CULLING-MANUAL01: Project-scoped state copies only authorized Asset IDs and preserves source', () => {
  const state = start();
  assert.deepEqual(state.assetIds, ['a', 'b', 'c']);
  assert.deepEqual(state.marks.map(row => [row.selected, row.rating, row.flag, row.tags]),
    [[false, 0, 'none', []], [false, 0, 'none', []], [false, 0, 'none', []]]);
  assert.equal(state.projectId, 'project-1');
  assert.equal(state.workspaceId, 'studio-1');
  assert.equal(state.revision, 0);
  assert.equal(JSON.stringify(state).includes('sha256'), false);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.marks[0]), true);
  assert.equal(assets[0].name, 'a.raw');
  assert.throws(() => createManualCullingProject({workspaceId: 'studio-1',
    projectId: 'project-1', assets: [...assets, {...assets[0], id: 'other', tenantId: 'other'}]}),
  /CULLING_ASSET_SCOPE_INVALID/);
  assert.throws(() => createManualCullingProject({workspaceId: 'studio-1',
    projectId: 'project-1', assets: [assets[0], assets[0]]}), /CULLING_ASSETS_DUPLICATE/);
  assert.throws(() => createManualCullingProject({workspaceId: 'studio-1',
    projectId: 'project-1', assets: [{...assets[0], deletedAt: '2026-01-01'}]}),
  /CULLING_ASSET_SCOPE_INVALID/);
});

test('CULLING-MANUAL02: manual selection, stars, flags and photo-local tags are immutable', () => {
  const original = start();
  const marked = setManualCullingMark(original, 'a',
    {selected: true, rating: 5, flag: 'pick', colorLabel: 'green'});
  const tagged = changeManualCullingTag(marked, 'a', 'portfolio', true);
  assert.deepEqual(tagged.marks[0], {assetId: 'a', selected: true, rating: 5,
    flag: 'pick', colorLabel: 'green', tags: ['portfolio']});
  assert.deepEqual(original.marks[0], {assetId: 'a', selected: false, rating: 0,
    flag: 'none', colorLabel: null, tags: []});
  assert.deepEqual(changeManualCullingTag(tagged, 'a', 'portfolio', false).marks[0].tags, []);
  assert.equal(tagged.revision, 2);
  assert.deepEqual(filterManualCullingAssets(tagged, {selected: true}), ['a']);
  assert.deepEqual(filterManualCullingAssets(tagged, {minRating: 4, tag: 'portfolio'}), ['a']);
  assert.deepEqual(filterManualCullingAssets(tagged, {mode: 'or', selected: true,
    flag: 'reject'}), ['a']);
});

test('CULLING-MANUAL03: Story Segment placement, Unassigned, rename, reorder and filter', () => {
  const original = start();
  let state = addManualCullingSegment(original, {id: 'ceremony', name: 'Ceremony'});
  state = addManualCullingSegment(state, {id: 'portraits', name: 'Portraits'});
  state = moveManualCullingAsset(state, 'a', 'ceremony');
  state = moveManualCullingAsset(state, 'b', 'portraits');
  assert.deepEqual(filterManualCullingAssets(state, {segmentId: null}), ['c']);
  assert.deepEqual(filterManualCullingAssets(state, {segmentId: 'ceremony'}), ['a']);
  state = moveManualCullingAsset(state, 'a', 'portraits');
  assert.deepEqual(state.segments.map(segment => segment.assetIds), [[], ['b', 'a']]);
  state = renameManualCullingSegment(state, 'portraits', 'Group portraits');
  state = reorderManualCullingSegments(state, ['portraits', 'ceremony']);
  assert.deepEqual(state.segments.map(segment => segment.name),
    ['Group portraits', 'Ceremony']);
  state = moveManualCullingAsset(state, 'b', null);
  assert.deepEqual(filterManualCullingAssets(state, {segmentId: null}), ['b', 'c']);
  assert.deepEqual(original.segments, []);
  assert.throws(() => reorderManualCullingSegments(state,
    ['portraits', 'portraits']), /CULLING_SEGMENT_ORDER_INVALID/);
});

test('CULLING-MANUAL04: unknown Asset, invalid marks and forged state fail closed', () => {
  const state = start();
  assert.throws(() => setManualCullingMark(state, 'not-in-project',
    {selected: true}), /CULLING_ASSET_NOT_IN_PROJECT/);
  for (const patch of [{rating: 6}, {rating: 2.5}, {selected: 'yes'},
    {flag: 'favorite'}, {qualityScore: 1}, {[Symbol('hidden')]: true},
    {colorLabel: ''}, {}])
    assert.throws(() => setManualCullingMark(state, 'a', patch), /CULLING_MARK_INVALID/);
  assert.throws(() => changeManualCullingTag(state, 'a', 'bad\u0000tag', true),
    /CULLING_TAG_INVALID/);
  assert.throws(() => moveManualCullingAsset(state, 'a', 'missing'),
    /CULLING_SEGMENT_NOT_FOUND/);
  assert.throws(() => filterManualCullingAssets(state, {aiQuality: 'best'}),
    /CULLING_FILTER_INVALID/);
  const forged = {...state, marks: [{...state.marks[0], rating: 7},
    ...state.marks.slice(1)]};
  assert.throws(() => filterManualCullingAssets(forged), /CULLING_STATE_INVALID/);
  assert.deepEqual(state.assetIds, ['a', 'b', 'c']);
});

test('CULLING-MANUAL05: selection stays distinct from star/flag/tag and no AI or XMP is inferred', () => {
  let state = start();
  state = setManualCullingMark(state, 'a', {selected: true});
  state = setManualCullingMark(state, 'b', {rating: 5});
  state = setManualCullingMark(state, 'c', {flag: 'pick'});
  assert.deepEqual(filterManualCullingAssets(state, {selected: true}), ['a']);
  assert.deepEqual(filterManualCullingAssets(state, {minRating: 5}), ['b']);
  assert.deepEqual(filterManualCullingAssets(state, {flag: 'pick'}), ['c']);
  assert.deepEqual(filterManualCullingAssets(state, {mode: 'and', selected: true,
    minRating: 5}), []);
  assert.deepEqual(filterManualCullingAssets(state, {}), ['a', 'b', 'c']);
  assert.equal(Object.hasOwn(state, 'aiAnalysis'), false);
  assert.equal(Object.hasOwn(state, 'saved'), false);
});
