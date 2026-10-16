import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {portrait,recipe,syntheticPixels} from './fixtures.mjs';

const read=path=>readFile(new URL(`../../../${path}`,import.meta.url),'utf8');

test('EYELINER-AUDIT-01: frozen evidence separates documented styles from unconfirmed Amount',async()=>{
  const master=await read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  assert.match(master,/\| EV3-0025 \| Portrait \| Makeup components \/ Eyeliner \| Eyeliner \| Style selection \| DOCUMENTED/);
  assert.match(master,/\| EV3-0026 \| Portrait \| Makeup components \/ Eyeliner \| Eyeliner \| Amount \| NOT_CONFIRMED/);
  const audit=await read('docs/EYELINER_COMPLETION_AUDIT.md');
  for(const url of ['https://support.evoto.ai/makeup/',
    'https://support.evoto.ai/makeup-ipad/',
    'https://support.evoto.ai/portrait-retouching-makeup/'])
    assert.ok(audit.includes(url));
  assert.match(audit,/Desktop[^\n]*9スタイル/);
  assert.match(audit,/Mobile[^\n]*9スタイル/);
  assert.match(audit,/iPad[^\n]*6デザイン/);
  assert.match(audit,/0\/44/);
});

test('EYELINER-AUDIT-02: portrait face brightness target cannot masquerade as eyeliner',()=>{
  const bound=portrait();
  assert.doesNotThrow(()=>validatePortraitRecipe(bound));
  bound.targets[0].adjustmentType='eyeliner';
  assert.throws(()=>validatePortraitRecipe(bound),/INVALID_PORTRAIT_TARGET/);
});

test('EYELINER-AUDIT-03: fake alias rejects; old Recipe still renders; portable photo binding rejects',()=>{
  const candidate=recipe();
  candidate.parameters.extendedParameters.eyeliner={style:1,side:'left'};
  assert.throws(()=>validateRecipe(candidate),/INVALID_EYELINER_MANUAL_ALIAS/);
  assert.throws(()=>portablePresetRecipe(candidate),
    /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  const old=recipe();
  assert.doesNotThrow(()=>validateRecipe(old));
  assert.doesNotThrow(()=>renderPixels(syntheticPixels(2,2),old,{validateRecipe}));
});

test('EYELINER-AUDIT-04: no product UI/Session/Worker operation; neighboring eye makeup stays distinct',async()=>{
  for(const path of ['apps/web/src/editor-ui.mjs','apps/web/src/session.mjs',
    'apps/web/src/processing/worker.mjs'])
    assert.doesNotMatch(await read(path),/eyeliner|linerStyle/i,
      `${path} lacks a dedicated Eyeliner operation`);
  const editor=await read('apps/web/src/editor-ui.mjs');
  assert.match(editor,/id="face-brightness"/);
  const audit=await read('docs/EYELINER_COMPLETION_AUDIT.md');
  for(const distinct of ['Eyelashes','Contacts','Eyeshadow','Eye Makeup'])
    assert.ok(audit.includes(distinct));
  assert.match(audit,/NOT_PROVEN \/ NOT_RUN/);
});
