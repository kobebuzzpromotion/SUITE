import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {portrait,recipe,syntheticPixels} from './fixtures.mjs';

const read=path=>readFile(new URL(`../../../${path}`,import.meta.url),'utf8');

test('EYESHADOW-AUDIT-01: official evidence tracks 14/8 styles, not a confirmed component Amount',async()=>{
  const master=await read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  assert.match(master,/\| EV3-0021 \| Portrait \| Makeup components \/ Eyeshadow \| Eyeshadow \| Style selection \| DOCUMENTED/);
  assert.match(master,/\| EV3-0022 \| Portrait \| Makeup components \/ Eyeshadow \| Eyeshadow \| Amount \| NOT_CONFIRMED/);
  const audit=await read('docs/EYESHADOW_COMPLETION_AUDIT.md');
  for(const url of ['https://support.evoto.ai/makeup/','https://support.evoto.ai/makeup-ipad/',
    'https://support.evoto.ai/portrait-retouching-makeup/'])assert.ok(audit.includes(url));
  assert.match(audit,/Desktop[^\n]*14スタイル/);
  assert.match(audit,/iPad[^\n]*8スタイル/);
  assert.match(audit,/Mobile[^\n]*14スタイル/);
  assert.match(audit,/0\/44/);
});

test('EYESHADOW-AUDIT-02: face brightness target is not eyeshadow',()=>{
  const target=portrait();assert.doesNotThrow(()=>validatePortraitRecipe(target));
  target.targets[0].adjustmentType='eyeshadow';
  assert.throws(()=>validatePortraitRecipe(target),/INVALID_PORTRAIT_TARGET/);
});

test('EYESHADOW-AUDIT-03: fake alias rejects; old Recipe renders; portable photo binding rejects',()=>{
  const candidate=recipe();candidate.parameters.extendedParameters.eyeshadow={style:1};
  assert.throws(()=>validateRecipe(candidate),/INVALID_EYESHADOW_MANUAL_ALIAS/);
  assert.throws(()=>portablePresetRecipe(candidate),/PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  const old=recipe();
  assert.doesNotThrow(()=>validateRecipe(old));
  assert.doesNotThrow(()=>renderPixels(syntheticPixels(2,2),old,{validateRecipe}));
});

test('EYESHADOW-AUDIT-04: current product UI, Session, Worker lack dedicated eyeshadow path',async()=>{
  for(const path of ['apps/web/src/editor-ui.mjs','apps/web/src/session.mjs',
    'apps/web/src/processing/worker.mjs'])
    assert.doesNotMatch(await read(path),/eyeshadow|eyeShadow/i);
  const audit=await read('docs/EYESHADOW_COMPLETION_AUDIT.md');
  for(const distinct of ['Eyeliner','Eyelashes','Contacts','NOT_RUN','NOT_CONFIRMED'])
    assert.ok(audit.includes(distinct));
  const editor=await read('apps/web/src/editor-ui.mjs');
  assert.match(editor,/id="face-brightness"/);
});
