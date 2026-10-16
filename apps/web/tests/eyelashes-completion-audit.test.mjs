import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {portrait,recipe,syntheticPixels} from './fixtures.mjs';

const read=path=>readFile(new URL(`../../../${path}`,import.meta.url),'utf8');

test('EYELASHES-AUDIT-01: frozen evidence confirms styles but not eyelash-only Amount',async()=>{
  const master=await read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  assert.match(master,/\| EV3-0023 \| Portrait \| Makeup components \/ Eyelashes \| Eyelashes \| Style selection \| DOCUMENTED/);
  assert.match(master,/\| EV3-0024 \| Portrait \| Makeup components \/ Eyelashes \| Eyelashes \| Amount \| NOT_CONFIRMED/);
  const audit=await read('docs/EYELASHES_COMPLETION_AUDIT.md');
  for(const url of ['https://support.evoto.ai/makeup/','https://support.evoto.ai/makeup-ipad/',
    'https://support.evoto.ai/portrait-retouching-makeup/'])assert.ok(audit.includes(url));
  assert.match(audit,/Desktop[^\n]*17スタイル/);
  assert.match(audit,/iPad[^\n]*14スタイル/);
  assert.match(audit,/Mobile[^\n]*17スタイル/);
  assert.match(audit,/0\/44/);
});

test('EYELASHES-AUDIT-02: portrait target is face brightness, not a lash style',()=>{
  const bound=portrait();
  assert.doesNotThrow(()=>validatePortraitRecipe(bound));
  bound.targets[0].adjustmentType='eyelashes';
  assert.throws(()=>validatePortraitRecipe(bound),/INVALID_PORTRAIT_TARGET/);
});

test('EYELASHES-AUDIT-03: opaque extension admission is not render or Author Preset support',()=>{
  const candidate=recipe();
  candidate.parameters.extendedParameters.eyelashes={style:1,side:'left'};
  assert.doesNotThrow(()=>validateRecipe(candidate),'generic Recipe JSON shape admits unknown extension');
  assert.throws(()=>renderPixels(syntheticPixels(2,2),candidate,{validateRecipe}),/UNSUPPORTED_WEB_ADJUSTMENT/);
  assert.throws(()=>portablePresetRecipe(candidate),/PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
});

test('EYELASHES-AUDIT-04: no dedicated UI, Session or Worker operation; unrelated makeup is not evidence',async()=>{
  for(const path of ['apps/web/src/editor-ui.mjs','apps/web/src/session.mjs',
    'apps/web/src/processing/worker.mjs']){
    assert.doesNotMatch(await read(path),/eyelashes|lashStyle/i,`${path} lacks a lash operation`);
  }
  const editor=await read('apps/web/src/editor-ui.mjs');
  assert.match(editor,/id="face-brightness"/);
  const worker=await read('apps/web/src/processing/worker.mjs');
  assert.match(worker,/blushManual/,'neighboring cheek makeup remains a distinct path');
  const audit=await read('docs/EYELASHES_COMPLETION_AUDIT.md');
  for(const distinct of ['Eyeliner','Contacts','Detail'])assert.ok(audit.includes(distinct));
});
