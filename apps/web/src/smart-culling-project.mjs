/**
 * Manual, in-memory Project culling only. Callers must supply the result of an
 * authorized Workspace.listAssets(actor, workspaceId, projectId). Neither this
 * module nor the current Asset shape can prove Project membership independently.
 * No AI result, Recipe, metadata, persistence, cloud sync or access grant is made.
 */
const KIND = 'suite-manual-project-culling-1';
const MAX_ASSETS = 100_000;
const MAX_SEGMENTS = 1_000;
const MAX_TAGS = 32;
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => plain(value) &&
  Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));

function identifier(value, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw Error(code);
  return value;
}
function label(value, code) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 120 ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw Error(code);
  return value;
}
function mark(assetId) {
  return Object.freeze({assetId, selected: false, rating: 0, flag: 'none',
    colorLabel: null, tags: Object.freeze([])});
}
function freezeState(projectId, workspaceId, assetIds, marks, segments, revision) {
  return Object.freeze({kind: KIND, projectId, workspaceId,
    assetIds: Object.freeze([...assetIds]), marks: Object.freeze(marks.map(row =>
      Object.freeze({...row, tags: Object.freeze([...row.tags])}))),
    segments: Object.freeze(segments.map(row => Object.freeze({...row,
      assetIds: Object.freeze([...row.assetIds])}))), revision});
}

/** Only IDs and tenant membership are read from the verified Project listing. */
export function createManualCullingProject({workspaceId, projectId, assets} = {}) {
  identifier(workspaceId, 'CULLING_WORKSPACE_INVALID');
  identifier(projectId, 'CULLING_PROJECT_INVALID');
  if (!Array.isArray(assets) || assets.length > MAX_ASSETS)
    throw Error('CULLING_ASSETS_INVALID');
  const ids = assets.map(asset => {
    if (!plain(asset) || asset.tenantId !== workspaceId || asset.deletedAt !== null)
      throw Error('CULLING_ASSET_SCOPE_INVALID');
    return identifier(asset.id, 'CULLING_ASSET_ID_INVALID');
  });
  if (new Set(ids).size !== ids.length) throw Error('CULLING_ASSETS_DUPLICATE');
  return freezeState(projectId, workspaceId, ids, ids.map(mark), [], 0);
}

function checked(state) {
  if (!exact(state, ['kind', 'projectId', 'workspaceId', 'assetIds', 'marks', 'segments', 'revision']) ||
      state.kind !== KIND || !Array.isArray(state.assetIds) ||
      !Array.isArray(state.marks) || !Array.isArray(state.segments) ||
      !Number.isSafeInteger(state.revision) || state.revision < 0)
    throw Error('CULLING_STATE_INVALID');
  identifier(state.workspaceId, 'CULLING_STATE_INVALID');
  identifier(state.projectId, 'CULLING_STATE_INVALID');
  if (state.assetIds.length > MAX_ASSETS || state.marks.length !== state.assetIds.length ||
      state.segments.length > MAX_SEGMENTS) throw Error('CULLING_STATE_INVALID');
  const ids = new Set();
  for (let i = 0; i < state.assetIds.length; i++) {
    const id = identifier(state.assetIds[i], 'CULLING_STATE_INVALID');
    if (ids.has(id)) throw Error('CULLING_STATE_INVALID');
    ids.add(id);
    const row = state.marks[i];
    if (!exact(row, ['assetId', 'selected', 'rating', 'flag', 'colorLabel', 'tags']) ||
        row.assetId !== id || typeof row.selected !== 'boolean' ||
        !Number.isSafeInteger(row.rating) || row.rating < 0 || row.rating > 5 ||
        !['none', 'pick', 'reject'].includes(row.flag) ||
        (row.colorLabel !== null && typeof row.colorLabel !== 'string') ||
        !Array.isArray(row.tags) || row.tags.length > MAX_TAGS)
      throw Error('CULLING_STATE_INVALID');
    if (row.colorLabel !== null) label(row.colorLabel, 'CULLING_STATE_INVALID');
    for (const tag of row.tags) label(tag, 'CULLING_STATE_INVALID');
    if (new Set(row.tags).size !== row.tags.length) throw Error('CULLING_STATE_INVALID');
  }
  const segmentIds = new Set(), assigned = new Set();
  for (const segment of state.segments) {
    if (!exact(segment, ['id', 'name', 'assetIds']) || !Array.isArray(segment.assetIds))
      throw Error('CULLING_STATE_INVALID');
    identifier(segment.id, 'CULLING_STATE_INVALID');
    label(segment.name, 'CULLING_STATE_INVALID');
    if (segmentIds.has(segment.id)) throw Error('CULLING_STATE_INVALID');
    segmentIds.add(segment.id);
    for (const id of segment.assetIds) {
      if (!ids.has(id) || assigned.has(id)) throw Error('CULLING_STATE_INVALID');
      assigned.add(id);
    }
  }
  return state;
}
function update(state, marks = state.marks, segments = state.segments) {
  if (state.revision === Number.MAX_SAFE_INTEGER) throw Error('CULLING_REVISION_LIMIT');
  return freezeState(state.projectId, state.workspaceId, state.assetIds,
    marks, segments, state.revision + 1);
}
function indexFor(state, assetId) {
  const index = state.assetIds.indexOf(identifier(assetId, 'CULLING_ASSET_ID_INVALID'));
  if (index < 0) throw Error('CULLING_ASSET_NOT_IN_PROJECT');
  return index;
}

/** Manual selection, 0..5 stars, flag and opaque user-chosen color label. */
export function setManualCullingMark(state, assetId, patch) {
  checked(state);
  const index = indexFor(state, assetId);
  if (!exact(patch, ['selected', 'rating', 'flag', 'colorLabel']) ||
      Object.keys(patch).length === 0) throw Error('CULLING_MARK_INVALID');
  const next = {...state.marks[index]};
  if (Object.hasOwn(patch, 'selected')) {
    if (typeof patch.selected !== 'boolean') throw Error('CULLING_MARK_INVALID');
    next.selected = patch.selected;
  }
  if (Object.hasOwn(patch, 'rating')) {
    if (!Number.isSafeInteger(patch.rating) || patch.rating < 0 || patch.rating > 5)
      throw Error('CULLING_MARK_INVALID');
    next.rating = patch.rating;
  }
  if (Object.hasOwn(patch, 'flag')) {
    if (!['none', 'pick', 'reject'].includes(patch.flag)) throw Error('CULLING_MARK_INVALID');
    next.flag = patch.flag;
  }
  if (Object.hasOwn(patch, 'colorLabel')) {
    next.colorLabel = patch.colorLabel === null ? null : label(patch.colorLabel, 'CULLING_MARK_INVALID');
  }
  const marks = [...state.marks]; marks[index] = next;
  return update(state, marks);
}

/** Custom tags are photo-local here, not XMP and not account-synchronized. */
export function changeManualCullingTag(state, assetId, tag, present) {
  checked(state);
  const index = indexFor(state, assetId);
  label(tag, 'CULLING_TAG_INVALID');
  if (typeof present !== 'boolean') throw Error('CULLING_TAG_INVALID');
  const old = state.marks[index], tags = old.tags.filter(item => item !== tag);
  if (present) tags.push(tag);
  if (tags.length > MAX_TAGS) throw Error('CULLING_TAG_LIMIT');
  const marks = [...state.marks]; marks[index] = {...old, tags};
  return update(state, marks);
}

export function addManualCullingSegment(state, {id, name} = {}) {
  checked(state);
  identifier(id, 'CULLING_SEGMENT_INVALID');
  label(name, 'CULLING_SEGMENT_INVALID');
  if (state.segments.length >= MAX_SEGMENTS) throw Error('CULLING_SEGMENT_LIMIT');
  if (state.segments.some(item => item.id === id)) throw Error('CULLING_SEGMENT_DUPLICATE');
  return update(state, state.marks, [...state.segments, {id, name, assetIds: []}]);
}

export function renameManualCullingSegment(state, segmentId, name) {
  checked(state);
  identifier(segmentId, 'CULLING_SEGMENT_INVALID');
  label(name, 'CULLING_SEGMENT_INVALID');
  const index = state.segments.findIndex(item => item.id === segmentId);
  if (index < 0) throw Error('CULLING_SEGMENT_NOT_FOUND');
  const segments = [...state.segments]; segments[index] = {...segments[index], name};
  return update(state, state.marks, segments);
}

/** Move a photo to one existing Segment, or null for Unassigned. */
export function moveManualCullingAsset(state, assetId, segmentId) {
  checked(state);
  indexFor(state, assetId);
  if (segmentId !== null && !state.segments.some(item => item.id === segmentId))
    throw Error('CULLING_SEGMENT_NOT_FOUND');
  const segments = state.segments.map(segment => ({...segment,
    assetIds: segment.assetIds.filter(id => id !== assetId)}));
  if (segmentId !== null) segments.find(item => item.id === segmentId).assetIds.push(assetId);
  return update(state, state.marks, segments);
}

export function reorderManualCullingSegments(state, orderedIds) {
  checked(state);
  if (!Array.isArray(orderedIds) || orderedIds.length !== state.segments.length ||
      new Set(orderedIds).size !== orderedIds.length ||
      orderedIds.some(id => !state.segments.some(item => item.id === id)))
    throw Error('CULLING_SEGMENT_ORDER_INVALID');
  return update(state, state.marks,
    orderedIds.map(id => state.segments.find(item => item.id === id)));
}

/** Deterministic filter only; never infers quality, face identity or similarity. */
export function filterManualCullingAssets(state, filters = {}) {
  checked(state);
  if (!exact(filters, ['mode', 'selected', 'minRating', 'flag', 'colorLabel', 'tag', 'segmentId']))
    throw Error('CULLING_FILTER_INVALID');
  const mode = filters.mode ?? 'and';
  if (!['and', 'or'].includes(mode)) throw Error('CULLING_FILTER_INVALID');
  const predicates = [];
  if (Object.hasOwn(filters, 'selected')) {
    if (typeof filters.selected !== 'boolean') throw Error('CULLING_FILTER_INVALID');
    predicates.push(row => row.selected === filters.selected);
  }
  if (Object.hasOwn(filters, 'minRating')) {
    if (!Number.isSafeInteger(filters.minRating) || filters.minRating < 0 || filters.minRating > 5)
      throw Error('CULLING_FILTER_INVALID');
    predicates.push(row => row.rating >= filters.minRating);
  }
  if (Object.hasOwn(filters, 'flag')) {
    if (!['none', 'pick', 'reject'].includes(filters.flag)) throw Error('CULLING_FILTER_INVALID');
    predicates.push(row => row.flag === filters.flag);
  }
  if (Object.hasOwn(filters, 'colorLabel')) {
    if (filters.colorLabel !== null) label(filters.colorLabel, 'CULLING_FILTER_INVALID');
    predicates.push(row => row.colorLabel === filters.colorLabel);
  }
  if (Object.hasOwn(filters, 'tag')) {
    label(filters.tag, 'CULLING_FILTER_INVALID');
    predicates.push(row => row.tags.includes(filters.tag));
  }
  if (Object.hasOwn(filters, 'segmentId')) {
    const id = filters.segmentId;
    if (id !== null && !state.segments.some(segment => segment.id === id))
      throw Error('CULLING_SEGMENT_NOT_FOUND');
    const assigned = new Set(state.segments.flatMap(segment => segment.assetIds));
    const target = id === null ? null : new Set(state.segments.find(segment => segment.id === id).assetIds);
    predicates.push(row => target === null ? !assigned.has(row.assetId) : target.has(row.assetId));
  }
  return Object.freeze(state.marks.filter(row => predicates.length === 0 ||
    (mode === 'and' ? predicates.every(predicate => predicate(row)) :
      predicates.some(predicate => predicate(row)))).map(row => row.assetId));
}
