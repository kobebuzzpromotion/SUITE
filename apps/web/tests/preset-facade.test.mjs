import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresetFacade} from '../src/preset-facade.mjs';

const recipe = () => ({schemaVersion: 1, parameters: {
  exposure: 0.5, contrast: 1.1, saturation: 1.2, rotationDegrees: 0,
  extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const parameters = () => ({exposure: 0.5, contrast: 1.1, saturation: 1.2});
const workspacePreset = (scope = 'PERSONAL', version = 1) => ({
  id: `${scope.toLowerCase()}-1`, workspaceId: 'workspace-1', scope,
  ownerUserId: 'user-1', name: `${scope} look`, version, body: recipe(),
});
const authorDraft = (status = 'DRAFT', revision = 1) => ({
  id: 'draft-1', authorID: 'author-1', authorName: 'Author One',
  name: 'Soft light', revision, status, parameters: parameters(),
});
const authorPublished = () => ({
  id: 'published-1', authorID: 'author-1', authorName: 'Author One',
  name: 'Published light', version: 4, parameters: parameters(),
});
const principal = {id: 'author-1', authorName: 'Author One', role: 'author'};

test('one catalog preserves provenance, visibility, apply mode and all live kinds', async () => {
  const facade = createPresetFacade({
    workspace: {listPresets: async () => [workspacePreset(), workspacePreset('WORKSPACE')]},
    author: {listDrafts: async () => [authorDraft()], listPresets: async () => [authorPublished()]},
    principal,
  });
  const items = await facade.list();
  assert.deepEqual(items.map(item => item.kind), ['PERSONAL', 'WORKSPACE', 'AUTHOR_DRAFT', 'AUTHOR_PUBLISHED']);
  assert.deepEqual(items.map(item => item.applyMode), [
    'FULL_RECIPE_REPLACE', 'FULL_RECIPE_REPLACE', 'PORTABLE_GLOBAL_MERGE', 'PORTABLE_GLOBAL_MERGE',
  ]);
  assert.equal(items[0].visibility, 'OWNER_ONLY');
  assert.equal(items[1].visibility, 'WORKSPACE_MEMBERS');
  assert.equal(items[2].status, 'DRAFT');
  assert.equal(items[3].status, 'PUBLISHED');
  assert.ok(!items[3].operations.includes('save'));
  await assert.rejects(facade.list({kind: 'COMMUNITY'}), /COMMUNITY_NOT_IMPLEMENTED/);
});

test('workspace save, reload, apply and delete delegate without changing full Recipe contract', async () => {
  let current = workspacePreset();
  const calls = [];
  const workspace = {
    getPreset: async id => {assert.equal(id, current.id); return {preset: current};},
    createPreset: async input => {calls.push(['create', input]); return {preset: current};},
    updatePreset: async (id, input) => {
      calls.push(['update', id, input]); current = {...current, version: 2, name: input.name, body: input.body};
      return {preset: current};
    },
    applyPresetVersioned: async input => {
      calls.push(['apply', input]);
      return {outcome: 'saved', version: {presetSnapshot: {id: input.presetId, version: input.expectedPresetVersion, body: current.body}}};
    },
    deletePreset: async id => {calls.push(['delete', id]); return {deleted: true, recipeSnapshotsRetained: true};},
  };
  const facade = createPresetFacade({workspace});
  const created = await facade.save({kind: 'PERSONAL', name: 'Personal look', recipe: recipe()});
  assert.equal(created.version, 1);
  assert.deepEqual(calls[0][1], {scope: 'PERSONAL', name: 'Personal look', body: recipe()});
  const updated = await facade.save({kind: 'PERSONAL', id: created.id, expectedVersion: 1, name: 'New name', recipe: recipe()});
  assert.equal(updated.version, 2);
  assert.equal(calls[1][2].baseVersion, 1);
  assert.deepEqual((await facade.reload({kind: 'PERSONAL', id: created.id})).recipe, recipe());
  await assert.rejects(facade.apply({kind: 'PERSONAL', id: created.id, version: 1, context: {projectId: 'p', assetId: 'a', baseVersion: 0}}), /PRESET_VERSION_CONFLICT/);
  const result = await facade.apply({kind: 'PERSONAL', id: created.id, version: 2, context: {projectId: 'p', assetId: 'a', baseVersion: 0}});
  assert.equal(result.outcome, 'saved');
  assert.equal(result.applyMode, 'FULL_RECIPE_REPLACE');
  assert.deepEqual(calls[2][1], {presetId: created.id, expectedPresetVersion: 2, projectId: 'p', assetId: 'a', baseVersion: 0});
  const removed = await facade.remove({kind: 'PERSONAL', id: created.id});
  assert.equal(removed.recipeSnapshotsRetained, true);
});

test('workspace apply fails closed without atomic versioned adapter or matching snapshot', async () => {
  const base = {getPreset: async () => workspacePreset('WORKSPACE')};
  const facade = createPresetFacade({workspace: base});
  const input = {kind: 'WORKSPACE', id: 'workspace-1', version: 1, context: {projectId: 'p', assetId: 'a', baseVersion: 0}};
  await assert.rejects(facade.apply(input), /PRESET_ADAPTER_NOT_CONNECTED/);
  base.applyPresetVersioned = async () => ({outcome: 'saved', version: {presetSnapshot: {id: 'workspace-1', version: 2}}});
  await assert.rejects(facade.apply(input), /PRESET_APPLY_RESPONSE_MISMATCH/);
});

test('Author save uses saved-source portable Recipe, applies unsaved globals and retains photo-local state', async () => {
  const state = {asset: {id: 'asset-1'}, revision: 3, dirty: false, busy: null, exporting: false,
    recipe: {...recipe(), photoLocalCrop: {x: 2}}};
  const calls = [];
  const session = {state, applyPortablePreset: async safe => {
    calls.push(['apply', safe]);
    state.recipe.parameters.exposure = safe.exposure;
    state.dirty = true;
  }};
  let draft = authorDraft();
  const author = {
    listDrafts: async () => [draft],
    createDraft: async input => {calls.push(['create', input]); return draft;},
    saveDraft: async (id, input) => {calls.push(['save', id, input]); draft = {...draft, revision: 2}; return draft;},
  };
  const facade = createPresetFacade({author, session, principal});
  const source = {assetID: 'asset-1', recipeRevision: 3};
  const created = await facade.save({kind: 'AUTHOR_DRAFT', name: 'Soft light', recipe: recipe(), source});
  assert.equal(created.status, 'DRAFT');
  assert.equal(calls[0][1].recipe.parameters.rotationDegrees, 0);
  assert.deepEqual(Object.keys(calls[0][1].recipe.parameters.extendedParameters), []);
  await facade.save({kind: 'AUTHOR_DRAFT', id: draft.id, expectedVersion: 1, name: 'Soft light', recipe: recipe(), source});
  assert.equal(calls[1][2].expectedRevision, 1);
  const applied = await facade.apply({kind: 'AUTHOR_DRAFT', id: draft.id, version: 2});
  assert.equal(applied.outcome, 'applied_unsaved');
  assert.equal(applied.applyMode, 'PORTABLE_GLOBAL_MERGE');
  assert.deepEqual(state.recipe.photoLocalCrop, {x: 2});
  assert.equal(state.dirty, true);
  await assert.rejects(facade.save({kind: 'AUTHOR_DRAFT', name: 'x', recipe: recipe(), source}), /SAVED_SOURCE_REQUIRED/);
});

test('Author rejects photo-local Recipe, immutable published Save, and cross-author draft response', async () => {
  let createCalls = 0;
  const author = {
    createDraft: async () => {createCalls++; return authorDraft();},
    listDrafts: async () => [{...authorDraft(), authorID: 'another-author'}],
  };
  const session = {state: {asset: {id: 'asset-1'}, revision: 3, dirty: false}};
  const facade = createPresetFacade({author, session, principal});
  const withCrop = recipe(); withCrop.parameters.extendedParameters.crop = {x: 1};
  const source = {assetID: 'asset-1', recipeRevision: 3};
  await assert.rejects(facade.save({kind: 'AUTHOR_DRAFT', name: 'x', recipe: withCrop, source}), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  assert.equal(createCalls, 0);
  await assert.rejects(facade.save({kind: 'AUTHOR_PUBLISHED', name: 'x', recipe: recipe(), source}), /PUBLISHED_PRESET_IMMUTABLE/);
  await assert.rejects(facade.list({kind: 'AUTHOR_DRAFT'}), /AUTHOR_RESPONSE_MISMATCH/);
});

test('Author submit and admin review enforce status, version and self-review boundary', async () => {
  let status = 'DRAFT';
  const author = {
    listDrafts: async () => [{...authorDraft(), status}],
    submitDraft: async () => {status = 'SUBMITTED'; return {...authorDraft(), status};},
  };
  const facade = createPresetFacade({author, principal});
  const submitted = await facade.submit({kind: 'AUTHOR_DRAFT', id: 'draft-1', version: 1});
  assert.equal(submitted.status, 'SUBMITTED');
  await assert.rejects(facade.submit({kind: 'AUTHOR_DRAFT', id: 'draft-1', version: 1}), /AUTHOR_DRAFT_IMMUTABLE/);
  const admin = {id: 'admin-1', authorName: 'Reviewer', role: 'admin'};
  author.listSubmitted = async () => [{...authorDraft('SUBMITTED'), authorID: 'author-1'}];
  author.reviewDraft = async () => ({draft: {...authorDraft('ACCEPTED'), authorID: 'author-1'}});
  const reviewer = createPresetFacade({author, principal: admin});
  const reviewed = await reviewer.review({kind: 'AUTHOR_DRAFT', id: 'draft-1', version: 1, decision: 'ACCEPTED'});
  assert.deepEqual(reviewed, {id: 'draft-1', version: 1, status: 'ACCEPTED', published: true});
  author.listSubmitted = async () => [{...authorDraft('SUBMITTED'), authorID: admin.id}];
  await assert.rejects(reviewer.review({kind: 'AUTHOR_DRAFT', id: 'draft-1', version: 1, decision: 'ACCEPTED'}), /FORBIDDEN_SELF_REVIEW/);
});

test('Community and unsupported actions never fall through to another storage service', async () => {
  const facade = createPresetFacade();
  await assert.rejects(facade.save({kind: 'COMMUNITY', name: 'x', recipe: recipe()}), /COMMUNITY_NOT_IMPLEMENTED/);
  await assert.rejects(facade.apply({kind: 'COMMUNITY', id: 'x', version: 1}), /COMMUNITY_NOT_IMPLEMENTED/);
  await assert.rejects(facade.remove({kind: 'AUTHOR_PUBLISHED', id: 'x'}), /PRESET_ACTION_UNSUPPORTED/);
});
