import test from 'node:test';
import assert from 'node:assert/strict';
import {BW_EDGE_REMOVAL_VERSION} from '../src/processing/bw-edge-removal.mjs';
import {BW_EDGE_MANUAL_MAX_JSON_BYTES, BW_EDGE_MANUAL_MAX_PIXELS,
  BW_EDGE_MANUAL_SUBJECT_KIND, BW_EDGE_MANUAL_CORRECTION_KIND,
  validateBWEdgeManualContract} from '../src/processing/bw-edge-manual-contract.mjs';

const binding = Object.freeze({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), sourceWidth: 4000, sourceHeight: 2000});
const add = (path = [{u: .25, v: .5}]) => ({operation: 'ADD', path,
  radiusFraction: .12, hardness: 1});
const erase = () => ({operation: 'ERASE', path: [{u: .5, v: .5}],
  radiusFraction: .08, hardness: .5});
const document = () => ({schemaVersion: 1, engineVersion: BW_EDGE_REMOVAL_VERSION,
  binding: {...binding}, subjectStrokes: [add(), erase()], correctionStrokes: [add()]});
const runtime = (revision = 4) => ({...binding, draftBaseRevision: revision,
  savedRevision: revision, confirmedSelections: {subject: true, correction: true},
  permissionEvidence: {...binding,
    savedRevision: revision, action: 'edit', allowed: true}});

test('BW-MANUAL-01: independent subject/correction strokes are immutable and role-distinct', () => {
  const input = document(), before = structuredClone(input), context = runtime();
  const result = validateBWEdgeManualContract(input, context);
  assert.deepEqual(result.document, input);
  assert.equal(result.maskRoles.subject.kind, BW_EDGE_MANUAL_SUBJECT_KIND);
  assert.equal(result.maskRoles.subject.source, 'verified-manual-subject-matte');
  assert.equal(result.maskRoles.correction.kind, BW_EDGE_MANUAL_CORRECTION_KIND);
  assert.equal(result.maskRoles.correction.source,
    'owner-manual-bw-edge-correction-strokes');
  assert.notEqual(result.maskRoles.subject.kind, result.maskRoles.correction.kind);
  assert.equal(result.context.savedRevision, 4);
  assert.equal(result.context.action, 'edit');
  assert.ok(Object.isFrozen(result.document.subjectStrokes[0].path[0]));
  input.subjectStrokes[0].path[0].u = 0;
  assert.equal(result.document.subjectStrokes[0].path[0].u, .25);
  before.subjectStrokes[0].path[0].u = 0;
  assert.deepEqual(input, before);
  assert.equal(BW_EDGE_MANUAL_MAX_PIXELS, 8_000_000);
  assert.equal(BW_EDGE_MANUAL_MAX_JSON_BYTES, 96 * 1024);
});

test('BW-MANUAL-02: no saved revision is serialized; current proof is checked on each use', () => {
  const input = document();
  assert.equal(JSON.stringify(input).includes('savedRevision'), false);
  validateBWEdgeManualContract(input, runtime(4));
  validateBWEdgeManualContract(input, runtime(5));
  assert.throws(() => validateBWEdgeManualContract(input,
    {...runtime(5), draftBaseRevision: 4}), /BW_EDGE_MANUAL_REVISION_MISMATCH/);
  assert.throws(() => validateBWEdgeManualContract(input,
    {...runtime(5), permissionEvidence: {...runtime(5).permissionEvidence,
      savedRevision: 4}}), /BW_EDGE_MANUAL_REVISION_MISMATCH/);
  const withRevision = {...input, savedRevision: 4};
  assert.throws(() => validateBWEdgeManualContract(withRevision, runtime()),
    /BW_EDGE_MANUAL_DOCUMENT_INVALID/);
});

test('BW-MANUAL-03: Asset, Original SHA, full dimensions and permission evidence must agree', () => {
  const input = document();
  for (const change of [{assetID: '22222222-2222-4222-8222-222222222222'},
    {originalSHA256: 'b'.repeat(64)}, {sourceWidth: 2000}, {sourceHeight: 1000}]) {
    assert.throws(() => validateBWEdgeManualContract(input, {...runtime(), ...change}),
      /BW_EDGE_MANUAL_BINDING_MISMATCH/);
    assert.throws(() => validateBWEdgeManualContract(input, {...runtime(),
      permissionEvidence: {...runtime().permissionEvidence, ...change}}),
    /BW_EDGE_MANUAL_PERMISSION_DENIED/);
  }
  for (const evidence of [{...runtime().permissionEvidence, allowed: false},
    {...runtime().permissionEvidence, action: 'view'},
    {...runtime().permissionEvidence, unexpected: true}])
    assert.throws(() => validateBWEdgeManualContract(input,
      {...runtime(), permissionEvidence: evidence}), /BW_EDGE_MANUAL_PERMISSION_DENIED/);
  for (const confirmedSelections of [{subject: false, correction: true},
    {subject: true, correction: false}, {subject: true, correction: true, extra: true}])
    assert.throws(() => validateBWEdgeManualContract(input,
      {...runtime(), confirmedSelections}), /BW_EDGE_MANUAL_OWNER_CONFIRMATION_REQUIRED/);
  assert.equal(validateBWEdgeManualContract(input, {...runtime(),
    permissionEvidence: {...runtime().permissionEvidence, action: 'export'}}).context.action,
  'export');
});

test('BW-MANUAL-04: strict JSON schema and source-capacity gate fail closed', () => {
  const input = document();
  for (const bad of [{...input, schemaVersion: 2}, {...input, engineVersion: 'other'},
    {...input, hidden: true}, {...input, binding: {...binding, savedRevision: 4}},
    {...input, binding: {...binding, originalSHA256: 'bad'}}])
    assert.throws(() => validateBWEdgeManualContract(bad, runtime()),
      /BW_EDGE_MANUAL_(DOCUMENT|BINDING)_INVALID/);
  assert.throws(() => validateBWEdgeManualContract({...input,
    binding: {...binding, sourceWidth: 8_000_001, sourceHeight: 1}}, runtime()),
  /BW_EDGE_MANUAL_BINDING_INVALID/);
  assert.throws(() => validateBWEdgeManualContract({...input,
    binding: {...binding, sourceWidth: 1, sourceHeight: 0}}, runtime()),
  /BW_EDGE_MANUAL_BINDING_INVALID/);
  const symbol = document();symbol[Symbol('hidden')] = true;
  assert.throws(() => validateBWEdgeManualContract(symbol, runtime()),
    /BW_EDGE_MANUAL_DOCUMENT_INVALID/);
  const getter = document();Object.defineProperty(getter, 'schemaVersion', {get() {throw Error('unsafe');}});
  assert.throws(() => validateBWEdgeManualContract(getter, runtime()),
    /BW_EDGE_MANUAL_DOCUMENT_INVALID/);
});

test('BW-MANUAL-05: both roles require ADD and share 64-stroke/4096-point caps', () => {
  const input = document();
  for (const key of ['subjectStrokes', 'correctionStrokes']) {
    assert.throws(() => validateBWEdgeManualContract({...input, [key]: [erase()]}, runtime()),
      /BW_EDGE_MANUAL_ADD_REQUIRED/);
    assert.throws(() => validateBWEdgeManualContract({...input, [key]: []}, runtime()),
      /BW_EDGE_MANUAL_STROKES_INVALID/);
  }
  const maxStrokes = {...input, subjectStrokes: Array.from({length: 32}, add),
    correctionStrokes: Array.from({length: 32}, add)};
  validateBWEdgeManualContract(maxStrokes, runtime());
  assert.throws(() => validateBWEdgeManualContract({...maxStrokes,
    correctionStrokes: [...maxStrokes.correctionStrokes, add()]}, runtime()),
  /BW_EDGE_MANUAL_CAPACITY/);
  const points = Array.from({length: 2048}, () => ({u: .5, v: .5}));
  validateBWEdgeManualContract({...input, subjectStrokes: [add(points)],
    correctionStrokes: [add(points)]}, runtime());
  assert.throws(() => validateBWEdgeManualContract({...input,
    subjectStrokes: [add([...points, {u: .5, v: .5}])],
    correctionStrokes: [add(points)]}, runtime()), /BW_EDGE_MANUAL_CAPACITY/);
});

test('BW-MANUAL-06: existing authoring brush schema, finite coordinates and dense arrays', () => {
  const input = document();
  for (const stroke of [{...add(), operation: 'add'}, {...add(), radiusFraction: 0},
    {...add(), radiusFraction: .26}, {...add(), radiusFraction: NaN},
    {...add(), hardness: Infinity}, {...add(), hidden: true}])
    assert.throws(() => validateBWEdgeManualContract({...input,
      correctionStrokes: [stroke]}, runtime()), /BW_EDGE_MANUAL_STROKE_INVALID/);
  for (const point of [{u: NaN, v: .5}, {u: -.1, v: .5},
    {u: 1.1, v: .5}, {x: .5, y: .5}, {u: .5, v: .5, z: 0}])
    assert.throws(() => validateBWEdgeManualContract({...input,
      correctionStrokes: [add([point])]}, runtime()), /BW_EDGE_MANUAL_POINT_INVALID/);
  const sparse = [add(), add()];delete sparse[1];
  assert.throws(() => validateBWEdgeManualContract({...input,
    subjectStrokes: sparse}, runtime()), /BW_EDGE_MANUAL_STROKES_INVALID/);
});

test('BW-MANUAL-07: UTF-8 JSON size and cancellation are bounded without mutation', () => {
  const points = Array.from({length: 2048}, () =>
    ({u: .12345678901234566, v: .9876543210987654}));
  const input = {...document(), subjectStrokes: [add(points)],
    correctionStrokes: [add(points)]};
  const before = structuredClone(input);
  assert.throws(() => validateBWEdgeManualContract(input, runtime()),
    /BW_EDGE_MANUAL_JSON_LIMIT/);
  const abort = new AbortController();abort.abort();
  assert.throws(() => validateBWEdgeManualContract(document(), runtime(),
    {signal: abort.signal}), error => error.name === 'AbortError');
  assert.deepEqual(input, before);
});
