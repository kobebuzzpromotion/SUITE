import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession, checksum, neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Browser Editor + actual loopback Trial HTTP/SQLite/cookie authorization.
// The decoder receives synthetic NON_RAW bytes and generates numerical pixels;
// it does not claim real RAW, Cloud, visual photo quality or device coverage.
const verdict = document.querySelector('#probe-verdict');
const report = document.querySelector('#probe-report');
const passed = [];
const expect = (condition, message) => {if (!condition) throw Error(message);};
const waitFor = async (predicate, message) => {
  const until = Date.now() + 12000;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw Error(`TIMED_OUT: ${message}`);
};
const syntheticPixels = (value = 45) => {
  const width = 12, height = 8, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([value, value + 2, value + 4, 255], i);
  return {width, height, data};
};
let active = null, serial = 0;
async function setup(label) {
  if (active) {active.dispose();active.worker.dispose();active = null;}
  const invitation = await (await fetch('/fixture/new')).json();
  const client = new TrialClient();
  await client.login(invitation.inviteToken);
  const create = async role => {
    const original = new TextEncoder().encode(`NON_RAW_BROWSER_BATCH_EDIT_${label}_${role}`);
    const sha256 = await checksum(original.buffer);
    const asset = await client.createAsset({name: `${label}-${role}.NONRAW`,
      sha256, size: original.byteLength});
    await client.putOriginal(asset.id, original.buffer.slice(0));
    return {asset, sha256};
  };
  const source = await create('source'), first = await create('first'), second = await create('second');
  const recipe = neutralRecipe();recipe.parameters.exposure = 0.75;
  await client.saveRecipe(source.asset.id, 0, recipe);
  const worker = createProcessing({workerURL: '/processing-worker.js'});
  const processing = {...worker, syntheticTestOnly: true,
    async decodeRaw(original, {mode} = {}) {
      if (!['proxy', 'final'].includes(mode)) throw Error('SYNTHETIC_MODE_INVALID');
      const text = new TextDecoder().decode(original);
      if (!text.startsWith('NON_RAW_BROWSER_BATCH_EDIT_')) throw Error('REAL_RAW_NOT_SUPPORTED_IN_FIXTURE');
      return {pixels: syntheticPixels(text.includes('_second') ? 65 : 45),
        provenance: {fixture: 'SYNTHETIC_NON_RAW'}, metadata: {fixture: true}};
    }};
  const session = new EditorSession({api: client, processing,
    personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset(source.asset.id);
  const dispose = mountEditor(session, {trialSession: await client.getSession(), authorAPI: client});
  active = {client, source, first, second, recipe, session, worker, dispose};
  return active;
}
function target(item) {
  const input = [...document.querySelectorAll('input[name="batch-target"]')]
    .find(candidate => candidate.value === item.asset.id);
  expect(Boolean(input), 'target checkbox exists');
  return input;
}
function choose(item, checked) {
  const input = target(item);
  expect(!input.disabled, 'target checkbox enabled');
  input.checked = checked;
  input.dispatchEvent(new Event('change', {bubbles: true}));
}
const outcome = () => document.querySelector('#batch-outcome')?.textContent ?? '';
const rows = () => [...document.querySelectorAll('#batch-results li')].map(li => ({
  text: li.textContent, className: li.className}));
const apply = () => {
  const button = document.querySelector('#batch-apply');
  expect(!button.disabled, 'batch apply button enabled');
  button.click();
};
async function originalUnchanged(client, item) {
  const bytes = await client.getOriginal(item.asset.id);
  expect(await checksum(bytes) === item.sha256, 'Original SHA stays unchanged');
}

async function success() {
  const f = await setup(`success-${++serial}`);
  choose(f.first, true);choose(f.second, true);
  expect(document.querySelector('#batch-selection').textContent.includes('2 件'),
    'explicit two-target selection shown');
  apply();
  await waitFor(() => outcome().includes('2/2 件'), 'two saves displayed');
  expect(rows().length === 2 && rows().every(row => row.className.includes('batch-result-saved')),
    'both results verified as saved in Editor');
  for (const item of [f.first, f.second]) {
    const stored = await f.client.getRecipe(item.asset.id);
    expect(stored.revision === 1 && JSON.stringify(stored.body) === JSON.stringify(f.recipe),
      'exact Recipe persisted to each target');
    await originalUnchanged(f.client, item);
  }
  await originalUnchanged(f.client, f.source);
  expect((await f.client.getRecipe(f.source.asset.id)).revision === 1,
    'source saved revision unchanged');
  passed.push('success: explicit two-target UI selection → authenticated SQLite saves');
}

async function cancelledSelection() {
  const f = await setup(`cancel-${++serial}`);
  choose(f.first, true);choose(f.second, true);
  choose(f.first, false); // UI has no in-flight cancellation; this is selection cancellation.
  expect(document.querySelector('#batch-selection').textContent.includes('1 件'),
    'cancelled target removed from selection');
  apply();
  await waitFor(() => outcome().includes('1/1 件'), 'one save displayed');
  expect(await f.client.getRecipe(f.first.asset.id) === null,
    'deselected target was not applied');
  expect((await f.client.getRecipe(f.second.asset.id)).revision === 1,
    'remaining selected target saved');
  for (const item of [f.source, f.first, f.second]) await originalUnchanged(f.client, item);
  passed.push('selection cancellation: deselected Asset receives no Recipe');
}

async function revisionRace() {
  const f = await setup(`race-${++serial}`);
  const originalSave = f.client.saveRecipe.bind(f.client);
  const competing = neutralRecipe();competing.parameters.exposure = -0.5;
  let raced = false;
  f.client.saveRecipe = async (id, expectedRevision, body) => {
    if (!raced && id === f.first.asset.id) {
      raced = true;
      await originalSave(id, 0, competing); // Real HTTP/SQLite concurrent CAS winner.
    }
    return originalSave(id, expectedRevision, body);
  };
  choose(f.first, true);choose(f.second, true);apply();
  await waitFor(() => outcome().includes('1/2 件'), 'CAS race outcome displayed');
  expect(raced, 'actual competing save occurred');
  expect(rows().length === 2 && rows()[0].className.includes('batch-result-unverified') &&
    rows()[1].className.includes('batch-result-saved'),
  'ambiguous HTTP CAS failure is not mislabeled saved or definitively unapplied');
  expect(JSON.stringify((await f.client.getRecipe(f.first.asset.id)).body) === JSON.stringify(competing),
    'competitor Recipe remains on first target');
  expect((await f.client.getRecipe(f.second.asset.id)).revision === 1,
    'second target still saves');
  for (const item of [f.source, f.first, f.second]) await originalUnchanged(f.client, item);
  passed.push('CAS race: first target unverified, second saved, no false success');
}

async function permissionRevocation() {
  const f = await setup(`revoke-${++serial}`);
  const originalAuthorize = f.client.assertPermission.bind(f.client);
  let revoked = false;
  f.client.assertPermission = async (...args) => {
    if (!revoked && args[0] === f.first.asset.id) {
      revoked = true;
      const response = await fetch('/fixture/revoke');
      expect(response.ok && (await response.json()).revoked, 'test invitation revoked on server');
    }
    return originalAuthorize(...args);
  };
  choose(f.first, true);choose(f.second, true);apply();
  await waitFor(() => outcome().includes('結果を確認できませんでした'),
    'revocation shown as unverified, not saved');
  expect(revoked, 'server-side invitation revocation occurred');
  expect(rows().length === 2 && rows().every(row => row.className.includes('batch-result-unverified')),
    'Editor never claims either target saved after permission loss');
  const reissue = await (await fetch('/fixture/reissue')).json();
  await f.client.login(reissue.inviteToken); // Same owner, fresh authorized session for verification only.
  expect(await f.client.getRecipe(f.first.asset.id) === null &&
    await f.client.getRecipe(f.second.asset.id) === null,
  'neither target was written after real backend revocation');
  for (const item of [f.source, f.first, f.second]) await originalUnchanged(f.client, item);
  passed.push('server-side permission revocation: no target writes or false success');
}

document.querySelector('#probe-run-all').addEventListener('click', () => {
  void (async () => {
    try {
      await success();await cancelledSelection();await revisionRace();await permissionRevocation();
      verdict.textContent = JSON.stringify({result: 'BATCH-EDIT-BROWSER-PASS', passed,
        userAgent: navigator.userAgent});
      report.textContent = JSON.stringify({scenarios: passed.length, finalOutcome: outcome(),
        finalRows: rows()});
    } catch (error) {
      verdict.textContent = JSON.stringify({result: 'BATCH-EDIT-BROWSER-FAIL',
        error: error?.message ?? String(error), stack: error?.stack});
      report.textContent = JSON.stringify({passed, outcome: outcome(), rows: rows(),
        sessionError: active?.session.state.error});
    }
  })();
});
