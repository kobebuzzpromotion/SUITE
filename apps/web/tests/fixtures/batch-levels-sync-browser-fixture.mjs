import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession, checksum, neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Actual Chrome Editor + Worker + authenticated Trial HTTP/SQLite with
// synthetic NON_RAW bytes. This is not a real RAW, Cloud or visual QA PASS.
const verdict = document.querySelector('#probe-verdict');
const report = document.querySelector('#probe-report');
const expect = (condition, message) => {if (!condition) throw Error(message);};
const waitFor = async (predicate, message) => {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw Error(`TIMED_OUT: ${message}`);
};
const clone = value => structuredClone(value);
const dataPixels = value => {
  const width = 12, height = 8, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([value, value + 12, value + 24, 255], i);
  return {width, height, data};
};
function adjusted({exposure, levels, temperature = 0}) {
  const body = neutralRecipe();
  body.parameters.exposure = exposure;
  if (levels || temperature) {
    body.parameters.extendedParameters.postDecodeAdjustments = {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
      color: {...(levels ? {levels: clone(levels)} : {}), ...(temperature ? {temperature} : {})},
    };
    body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  }
  return body;
}
const pixelOf = async blob => {
  expect(blob instanceof Blob && blob.type === 'image/png' && blob.size > 0, 'actual PNG Final Blob');
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');context.drawImage(bitmap, 0, 0);
  const pixel = [...context.getImageData(3, 3, 1, 1).data];bitmap.close();
  return pixel;
};
const selectedCheckbox = id => [...document.querySelectorAll('input[name="batch-target"]')]
  .find(input => input.value === id);
function choose(id) {
  const input = selectedCheckbox(id);
  expect(Boolean(input) && !input.disabled, 'Levels Sync target checkbox enabled');
  input.checked = true;input.dispatchEvent(new Event('change', {bubbles: true}));
}

document.querySelector('#probe-run').addEventListener('click', () => {void (async () => {
  let dispose = null, worker = null;
  try {
    const invitation = await (await fetch('/fixture/new')).json();
    const client = new TrialClient();await client.login(invitation.inviteToken);
    const make = async name => {
      const original = new TextEncoder().encode(`NON_RAW_LEVELS_SYNC_BROWSER_${name}`);
      const sha256 = await checksum(original.buffer);
      const asset = await client.createAsset({name: `${name}.nonraw`, sha256, size: original.length});
      await client.putOriginal(asset.id, original.buffer.slice(0));
      return {asset, sha256};
    };
    const source = await make('source'), first = await make('first'), second = await make('second');
    const sourceRecipe = adjusted({exposure: 1.1, levels: {master: {gamma: 0.55, outputBlack: 35}, red: {inputWhite: 230}}});
    const firstRecipe = adjusted({exposure: -0.5, levels: {blue: {outputWhite: 180}}, temperature: 18});
    const secondRecipe = adjusted({exposure: 0.65, temperature: -20});
    for (const [item, body] of [[source, sourceRecipe], [first, firstRecipe], [second, secondRecipe]])
      expect((await client.saveRecipe(item.asset.id, 0, body)).revision === 1, 'saved initial Recipe');
    worker = createProcessing({workerURL: '/processing-worker.js'});
    const processing = {...worker, syntheticTestOnly: true,
      async decodeRaw(original, {mode} = {}) {
        if (!['proxy', 'final'].includes(mode)) throw Error('SYNTHETIC_MODE_INVALID');
        const text = new TextDecoder().decode(original);
        if (!text.startsWith('NON_RAW_LEVELS_SYNC_BROWSER_')) throw Error('REAL_RAW_NOT_SUPPORTED_IN_FIXTURE');
        return {pixels: dataPixels(text.includes('_second') ? 108 : text.includes('_first') ? 88 : 68),
          provenance: {fixture: 'SYNTHETIC_NON_RAW'}, metadata: {fixture: true}};
      }};
    const session = new EditorSession({api: client, processing,
      personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
    await session.initialize();await session.openAsset(first.asset.id);
    const baseline = await pixelOf(await session.exportFinal({format: 'png'}));
    await session.openAsset(source.asset.id);
    const historyBefore = {canUndo: session.state.canUndo, canRedo: session.state.canRedo,
      recipe: JSON.stringify(session.state.recipe), revision: session.state.revision};
    dispose = mountEditor(session, {trialSession: await client.getSession(), authorAPI: client});
    choose(first.asset.id);choose(second.asset.id);
    const button = document.querySelector('#levels-sync-apply');
    expect(!button.disabled && document.querySelector('#batch-selection').textContent.includes('2 件'),
      'two explicit targets and Levels-only action enabled');
    button.click();
    await waitFor(() => document.querySelector('#levels-sync-outcome').textContent.includes('2/2 件'),
      'Levels Sync outcome in actual Editor');
    const rows = [...document.querySelectorAll('#levels-sync-results li')];
    expect(rows.length === 2 && rows.every(row => row.classList.contains('batch-result-saved')),
      'both target rows individually verified saved');
    expect(JSON.stringify(session.state.recipe) === historyBefore.recipe &&
      session.state.revision === historyBefore.revision &&
      session.state.canUndo === historyBefore.canUndo && session.state.canRedo === historyBefore.canRedo,
    'source current history and Undo/Redo boundary unchanged');
    for (const [item, prior] of [[first, firstRecipe], [second, secondRecipe]]) {
      const stored = await client.getRecipe(item.asset.id);
      expect(stored.revision === 2, 'target CAS revision advanced exactly once');
      expect(stored.body.parameters.exposure === prior.parameters.exposure,
        'target exposure retained, not source exposure');
      expect(stored.body.parameters.extendedParameters.postDecodeAdjustments.color.temperature ===
        prior.parameters.extendedParameters.postDecodeAdjustments.color.temperature,
      'target temperature retained');
      expect(JSON.stringify(stored.body.parameters.extendedParameters.postDecodeAdjustments.color.levels) ===
        JSON.stringify(sourceRecipe.parameters.extendedParameters.postDecodeAdjustments.color.levels),
      'only source Levels copied');
      expect(await checksum(await client.getOriginal(item.asset.id)) === item.sha256,
        'target Original SHA unchanged');
    }
    expect(await checksum(await client.getOriginal(source.asset.id)) === source.sha256,
      'source Original SHA unchanged');
    await session.openAsset(first.asset.id);await session.reload();
    expect(session.state.revision === 2 && !session.state.canUndo && !session.state.canRedo,
      'reloaded synced target starts at saved history boundary');
    const syncedPreview = [...session.previewPixels.data.slice(0, 3)];
    const syncedFinal = await pixelOf(await session.exportFinal({format: 'png'}));
    expect(syncedFinal.some((value, index) => index < 3 && value !== baseline[index]),
      'actual Worker Final PNG pixel differs from pre-Sync target Final');
    await session.setAdjustment('exposure', -0.25);
    expect(session.state.canUndo && !session.state.canRedo, 'new local edit starts target history');
    await session.undo();
    expect(session.state.recipe.parameters.exposure === firstRecipe.parameters.exposure && session.state.canRedo,
      'Undo returns to saved Levels Sync target without crossing source history');
    await session.redo();
    expect(session.state.recipe.parameters.exposure === -0.25, 'Redo replays only target local edit');
    await session.save();await session.openAsset(source.asset.id);
    const originalSave = client.saveRecipe.bind(client);
    let raced = false;
    client.saveRecipe = async (id, expectedRevision, body) => {
      if (!raced && id === first.asset.id) {
        raced = true;
        const competing = clone(body);competing.parameters.exposure = 0.3;
        await originalSave(id, expectedRevision, competing);
      }
      return originalSave(id, expectedRevision, body);
    };
    choose(first.asset.id);choose(second.asset.id);
    document.querySelector('#levels-sync-apply').click();
    await waitFor(() => document.querySelector('#levels-sync-outcome').textContent.includes('1/2 件'),
      'partial Levels Sync outcome in actual Editor');
    const partialRows = [...document.querySelectorAll('#levels-sync-results li')];
    expect(raced && partialRows.length === 2 &&
      partialRows[0].classList.contains('batch-result-unverified') &&
      partialRows[1].classList.contains('batch-result-saved'),
    'CAS race cannot be displayed as two saved targets');
    for (const item of [source, first, second])
      expect(await checksum(await client.getOriginal(item.asset.id)) === item.sha256,
        'Original SHA remains unchanged after partial Sync');
    report.textContent = JSON.stringify({baseline, syncedFinal, syncedPreview,
      sourceRevision: historyBefore.revision, targetRevision: 2, rows: rows.map(row => row.textContent),
      partialRows: partialRows.map(row => row.textContent),
      synthetic: true, originalSHA: [source.sha256, first.sha256, second.sha256]});
    verdict.textContent = 'LEVELS-SYNC-BROWSER-PASS';
  } catch (error) {
    verdict.textContent = `LEVELS-SYNC-BROWSER-FAIL: ${error?.message ?? String(error)}`;
    report.textContent = error?.stack ?? String(error);
  } finally {dispose?.();worker?.dispose();}
})();});
