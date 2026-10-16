import {portablePresetRecipe} from './preset-author/preset-author-contract.mjs';
import {checkParameters} from '../preset-policy.mjs';

/**
 * One operation surface, not one storage or Recipe format. Adapters retain server-side
 * identity, authorization, version checks and publication policy. In particular a
 * Workspace preset replaces a whole Recipe; an Author preset merges portable globals.
 */
const WORKSPACE_KINDS = new Set(['PERSONAL', 'WORKSPACE']);
const AUTHOR_KINDS = new Set(['AUTHOR_DRAFT', 'AUTHOR_PUBLISHED']);
const KINDS = new Set([...WORKSPACE_KINDS, ...AUTHOR_KINDS, 'COMMUNITY']);

function fail(code) { throw new Error(code); }
function record(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
}
function nonempty(value, code) {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value.trim();
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('INVALID_PRESET_VERSION');
  return value;
}
function kind(value) {
  if (!KINDS.has(value)) fail('INVALID_PRESET_KIND');
  if (value === 'COMMUNITY') fail('COMMUNITY_NOT_IMPLEMENTED');
  return value;
}
function method(adapter, name) {
  if (typeof adapter?.[name] !== 'function') fail('PRESET_ADAPTER_NOT_CONNECTED');
  return adapter[name].bind(adapter);
}
function rows(response, key) {
  const result = Array.isArray(response) ? response : response?.[key];
  if (!Array.isArray(result)) fail('PRESET_LIST_RESPONSE_MISMATCH');
  return result;
}
function body(response, key) { return response?.[key] ?? response; }

function normalizedWorkspace(raw, expectedKind) {
  const value = record(raw, 'PRESET_RESPONSE_MISMATCH');
  if (!WORKSPACE_KINDS.has(value.scope) || (expectedKind && value.scope !== expectedKind)) fail('PRESET_SCOPE_MISMATCH');
  const id = nonempty(value.id, 'PRESET_RESPONSE_MISMATCH');
  const name = nonempty(value.name, 'PRESET_RESPONSE_MISMATCH');
  const workspaceId = nonempty(value.workspaceId, 'PRESET_RESPONSE_MISMATCH');
  const ownerId = nonempty(value.ownerUserId, 'PRESET_RESPONSE_MISMATCH');
  const recipe = structuredClone(record(value.body, 'PRESET_RESPONSE_MISMATCH'));
  return Object.freeze({
    kind: value.scope, id, version: version(value.version), name,
    owner: Object.freeze({id: ownerId, name: null}), workspaceId,
    status: 'SAVED', visibility: value.scope === 'PERSONAL' ? 'OWNER_ONLY' : 'WORKSPACE_MEMBERS',
    storage: 'WORKSPACE_PRESET_VERSIONS', applyMode: 'FULL_RECIPE_REPLACE',
    operations: Object.freeze(['reload', 'save', 'apply', 'delete']), recipe,
  });
}
function normalizedAuthor(raw, expectedKind, principal) {
  const value = record(raw, 'PRESET_RESPONSE_MISMATCH');
  const id = nonempty(value.id, 'PRESET_RESPONSE_MISMATCH');
  const name = nonempty(value.name, 'PRESET_RESPONSE_MISMATCH');
  const ownerName = nonempty(value.authorName, 'PRESET_RESPONSE_MISMATCH');
  const isDraft = expectedKind === 'AUTHOR_DRAFT';
  const revision = isDraft ? value.revision : value.version;
  const status = isDraft ? value.status : 'PUBLISHED';
  if (isDraft && !['DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED'].includes(status)) fail('PRESET_STATUS_MISMATCH');
  if (isDraft && (!principal?.id || value.authorID !== principal.id || value.authorName !== principal.authorName)) fail('AUTHOR_RESPONSE_MISMATCH');
  if (!isDraft && value.status && !['ACCEPTED', 'PUBLISHED'].includes(value.status)) fail('PRESET_STATUS_MISMATCH');
  const parameters = structuredClone(checkParameters(value.parameters));
  return Object.freeze({
    kind: expectedKind, id, version: version(revision), name,
    owner: Object.freeze({id: value.authorID ?? null, name: ownerName}),
    status, visibility: isDraft ? 'OWNER_AND_REVIEWERS' : 'PUBLISHED',
    storage: 'AUTHOR_PRESET_STORE', applyMode: 'PORTABLE_GLOBAL_MERGE',
    // Review is an admin-feed operation, never an ability inferred from an author's own draft.
    operations: Object.freeze(isDraft ? ['reload', 'apply', ...(status === 'DRAFT' ? ['save', 'submit'] : [])] : ['reload', 'apply']),
    parameters,
  });
}

/**
 * workspace: bound, authenticated adapter with listPresets/getPreset/createPreset/
 * updatePreset/deletePreset/applyPresetVersioned. The last method must enforce
 * expectedPresetVersion atomically on the server; a client precheck is insufficient.
 * author: existing trial API (listDrafts/createDraft/saveDraft/submitDraft/listPresets).
 * session: EditorSession for portable, unsaved application.
 */
export function createPresetFacade({workspace, author, session, principal} = {}) {
  async function list({kind: selectedKind} = {}) {
    const selected = selectedKind ? [kind(selectedKind)] : [
      ...(workspace ? ['PERSONAL', 'WORKSPACE'] : []),
      ...(author && principal ? ['AUTHOR_DRAFT'] : []),
      ...(author ? ['AUTHOR_PUBLISHED'] : []),
    ];
    if (!selected.length) fail('PRESET_ADAPTER_NOT_CONNECTED');
    const output = [];
    if (selected.some(item => WORKSPACE_KINDS.has(item))) {
      const items = rows(await method(workspace, 'listPresets')(), 'presets').map(item => normalizedWorkspace(item));
      output.push(...items.filter(item => selected.includes(item.kind)));
    }
    if (selected.includes('AUTHOR_DRAFT')) {
      if (!principal?.id) fail('AUTHOR_PRINCIPAL_REQUIRED');
      output.push(...rows(await method(author, 'listDrafts')(), 'drafts').map(item => normalizedAuthor(item, 'AUTHOR_DRAFT', principal)));
    }
    if (selected.includes('AUTHOR_PUBLISHED')) {
      output.push(...rows(await method(author, 'listPresets')(), 'presets').map(item => normalizedAuthor(item, 'AUTHOR_PUBLISHED', principal)));
    }
    return output;
  }

  async function reload({kind: selectedKind, id}) {
    const target = kind(selectedKind); nonempty(id, 'INVALID_PRESET_ID');
    if (WORKSPACE_KINDS.has(target)) {
      const result = await method(workspace, 'getPreset')(id);
      const preset = normalizedWorkspace(body(result, 'preset'), target);
      if (preset.id !== id) fail('PRESET_RESPONSE_MISMATCH');
      return preset;
    }
    const found = (await list({kind: target})).find(item => item.id === id);
    if (!found) fail('PRESET_NOT_FOUND');
    return found;
  }

  async function save({kind: selectedKind, id, expectedVersion, name, recipe, source}) {
    const target = kind(selectedKind);
    if (target === 'AUTHOR_PUBLISHED') fail('PUBLISHED_PRESET_IMMUTABLE');
    const safeName = nonempty(name, 'INVALID_PRESET_NAME');
    const updating = id !== undefined && id !== null;
    if (updating) { nonempty(id, 'INVALID_PRESET_ID'); version(expectedVersion); }
    const checkedRecipe = WORKSPACE_KINDS.has(target)
      ? structuredClone(record(recipe, 'INVALID_RECIPE'))
      : portablePresetRecipe(record(recipe, 'INVALID_RECIPE'));
    if (WORKSPACE_KINDS.has(target)) {
      if (updating) {
        const before = await reload({kind: target, id});
        if (before.version !== expectedVersion) fail('PRESET_VERSION_CONFLICT');
      }
      const result = updating
        ? await method(workspace, 'updatePreset')(id, {baseVersion: expectedVersion, name: safeName, body: checkedRecipe})
        : await method(workspace, 'createPreset')({scope: target, name: safeName, body: checkedRecipe});
      const preset = normalizedWorkspace(body(result, 'preset'), target);
      if (updating && (preset.id !== id || preset.version !== expectedVersion + 1)) fail('PRESET_SAVE_RESPONSE_MISMATCH');
      return preset;
    }
    if (!principal?.id || !principal?.authorName) fail('AUTHOR_PRINCIPAL_REQUIRED');
    const assetID = nonempty(source?.assetID, 'SAVED_SOURCE_REQUIRED');
    const recipeRevision = version(source?.recipeRevision);
    const state = session?.state;
    if (!state?.asset || state.asset.id !== assetID || state.revision !== recipeRevision || state.dirty || state.busy || state.exporting) fail('SAVED_SOURCE_REQUIRED');
    const portable = checkedRecipe; // validated before copying; rejects photo-local and unknown fields
    if (updating) {
      const before = await reload({kind: target, id});
      if (before.version !== expectedVersion) fail('PRESET_VERSION_CONFLICT');
      if (before.status !== 'DRAFT') fail('AUTHOR_DRAFT_IMMUTABLE');
    }
    const input = {name: safeName, recipe: portable, assetID, recipeRevision};
    const result = updating
      ? await method(author, 'saveDraft')(id, {expectedRevision: expectedVersion, ...input})
      : await method(author, 'createDraft')(input);
    const preset = normalizedAuthor(body(result, 'draft'), target, principal);
    if (preset.status !== 'DRAFT' || (updating && (preset.id !== id || preset.version !== expectedVersion + 1))) fail('PRESET_SAVE_RESPONSE_MISMATCH');
    return preset;
  }

  async function apply({kind: selectedKind, id, version: expectedVersion, context} = {}) {
    const target = kind(selectedKind); nonempty(id, 'INVALID_PRESET_ID'); version(expectedVersion);
    const preset = await reload({kind: target, id});
    if (preset.version !== expectedVersion) fail('PRESET_VERSION_CONFLICT');
    if (WORKSPACE_KINDS.has(target)) {
      const projectId = nonempty(context?.projectId, 'PRESET_APPLY_CONTEXT_REQUIRED');
      const assetId = nonempty(context?.assetId, 'PRESET_APPLY_CONTEXT_REQUIRED');
      if (!Number.isSafeInteger(context?.baseVersion) || context.baseVersion < 0) fail('PRESET_APPLY_CONTEXT_REQUIRED');
      const result = await method(workspace, 'applyPresetVersioned')({presetId: id, expectedPresetVersion: expectedVersion, projectId, assetId, baseVersion: context.baseVersion});
      if (result?.outcome !== 'saved' || result?.version?.presetSnapshot?.id !== id || result.version.presetSnapshot.version !== expectedVersion) fail('PRESET_APPLY_RESPONSE_MISMATCH');
      return Object.freeze({outcome: 'saved', applyMode: preset.applyMode, preset, result});
    }
    const safe = checkParameters(preset.parameters);
    await method(session, 'applyPortablePreset')(structuredClone(safe));
    if (session.state?.dirty !== true) fail('PRESET_APPLY_RESPONSE_MISMATCH');
    return Object.freeze({outcome: 'applied_unsaved', applyMode: preset.applyMode, preset});
  }

  /** Explicit published Author Vignette-only operation; never falls back to Full. */
  async function applyVignetteOnly({kind: selectedKind,id,version: expectedVersion,expectedSHA256}={}) {
    if(kind(selectedKind)!=='AUTHOR_PUBLISHED')fail('PRESET_ACTION_UNSUPPORTED');
    nonempty(id,'INVALID_PRESET_ID');version(expectedVersion);
    if(typeof expectedSHA256!=='string'||!/^[0-9a-f]{64}$/i.test(expectedSHA256))
      fail('INVALID_PRESET_SHA256');
    const result=await method(session,'applyPublishedAuthorVignetteOnly')({presetID:id,
      expectedVersion,expectedSHA256});
    if(result?.presetID!==id||result.version!==expectedVersion||result.saved!==false||
        result.assetID!==session.state?.asset?.id||session.state?.dirty!==true)
      fail('PRESET_APPLY_RESPONSE_MISMATCH');
    return Object.freeze({outcome:'applied_unsaved',applyMode:'AUTHOR_VIGNETTE_ONLY',result});
  }

  async function submit({kind: selectedKind, id, version: expectedVersion}) {
    if (kind(selectedKind) !== 'AUTHOR_DRAFT') fail('PRESET_ACTION_UNSUPPORTED');
    version(expectedVersion);
    const before = await reload({kind: selectedKind, id});
    if (before.version !== expectedVersion) fail('PRESET_VERSION_CONFLICT');
    if (before.status !== 'DRAFT') fail('AUTHOR_DRAFT_IMMUTABLE');
    const received = await method(author, 'submitDraft')(id, {expectedRevision: expectedVersion});
    const after = normalizedAuthor(body(received, 'draft'), 'AUTHOR_DRAFT', principal);
    if (after.id !== id || after.version !== expectedVersion || after.status !== 'SUBMITTED') fail('PRESET_SUBMIT_RESPONSE_MISMATCH');
    return after;
  }

  async function review({kind: selectedKind, id, version: expectedVersion, decision}) {
    if (kind(selectedKind) !== 'AUTHOR_DRAFT') fail('PRESET_ACTION_UNSUPPORTED');
    if (!['ACCEPTED', 'REJECTED'].includes(decision)) fail('INVALID_REVIEW_DECISION');
    version(expectedVersion);
    if (principal?.role !== 'admin') fail('FORBIDDEN_REVIEW_ACTION');
    // Reviewing another author's submission needs the admin feed, not listDrafts() of self.
    const submitted = rows(await method(author, 'listSubmitted')(), 'drafts').find(item => item.id === id);
    if (!submitted) fail('PRESET_NOT_FOUND');
    if (submitted.authorID === principal.id) fail('FORBIDDEN_SELF_REVIEW');
    if (submitted.revision !== expectedVersion) fail('PRESET_VERSION_CONFLICT');
    if (submitted.status !== 'SUBMITTED') fail('INVALID_SUBMISSION_TRANSITION');
    const received = await method(author, 'reviewDraft')(id, {expectedRevision: expectedVersion, decision});
    const result = body(received, 'draft');
    if (result?.id !== id || result?.revision !== expectedVersion || result?.status !== decision) fail('PRESET_REVIEW_RESPONSE_MISMATCH');
    return Object.freeze({id, version: expectedVersion, status: decision, published: decision === 'ACCEPTED'});
  }

  async function remove({kind: selectedKind, id}) {
    const target = kind(selectedKind);
    if (!WORKSPACE_KINDS.has(target)) fail('PRESET_ACTION_UNSUPPORTED');
    const before = await reload({kind: target, id});
    const result = await method(workspace, 'deletePreset')(id);
    if (result?.deleted !== true) fail('PRESET_DELETE_RESPONSE_MISMATCH');
    return Object.freeze({deleted: true, preset: before, recipeSnapshotsRetained: result.recipeSnapshotsRetained === true});
  }

  return Object.freeze({list, reload, save, apply, applyVignetteOnly, submit, review, remove});
}
