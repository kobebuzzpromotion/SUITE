import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {recipe,portrait,syntheticPixels} from './fixtures.mjs';

const read=path=>readFile(new URL(`../../../${path}`,import.meta.url),'utf8');

test('CONTACTS-AUDIT-01: official 11-style evidence does not turn generic Amount/Color into cross-device parity',async()=>{
  const master=await read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  assert.match(master,/\| EV3-0027 \| Portrait \| Makeup components \/ Contacts \| Contacts \| Style selection \| DOCUMENTED \| DOCUMENTED \| DOCUMENTED \| DOCUMENTED/);
  for(const [id,option] of [[28,'Amount'],[29,'Color selection']])
    assert.match(master,new RegExp(`\\| EV3-00${id} \\| Portrait \\| Makeup components / Contacts \\| Contacts \\| ${option} \\| NOT_CONFIRMED`));
  const audit=await read('docs/CONTACTS_COMPLETION_AUDIT.md');
  for(const url of ['https://support.evoto.ai/makeup/',
    'https://support.evoto.ai/makeup-ipad/',
    'https://support.evoto.ai/portrait-retouching-makeup/',
    'https://support.evoto.ai/bring-portraits-to-life-with-evotos-eye-retouch-tools/'])
    assert.ok(audit.includes(url));
  assert.match(audit,/11スタイル/u);
  assert.match(audit,/0\/44のまま/u);
});

test('CONTACTS-AUDIT-02: face EV target cannot masquerade as Contacts or Eyeshadow',()=>{
  const current=portrait();
  assert.doesNotThrow(()=>validatePortraitRecipe(current));
  for(const type of ['contacts','colored_contacts','eyeshadow']){
    const invented=structuredClone(current);
    invented.targets[0].adjustmentType=type;
    assert.throws(()=>validatePortraitRecipe(invented),/INVALID_PORTRAIT_TARGET/);
  }
});

test('CONTACTS-AUDIT-03: fake Contacts alias is rejected before rendering or Author portable Preset',()=>{
  const invented=recipe();
  invented.parameters.extendedParameters.contacts={style:1,amount:50};
  assert.throws(()=>validateRecipe(invented),/INVALID_CONTACTS_IRIS_MANUAL_ALIAS/);
  assert.throws(()=>renderPixels(syntheticPixels(4,4),invented,{validateRecipe}),
    /INVALID_CONTACTS_IRIS_MANUAL_ALIAS/);
  assert.throws(()=>portablePresetRecipe(invented),
    /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
});

test('CONTACTS-AUDIT-04: product face oval/UI/Apple paths lack iris ring, lens style and Contacts session',async()=>{
  const [faces,pure,ui,session,apple,appleUI]=await Promise.all([
    read('apps/web/src/processing/faces.mjs'),
    read('apps/web/src/processing/pure.mjs'),
    read('apps/web/src/editor-ui.mjs'),
    read('apps/web/src/session.mjs'),
    read('apps/apple/Suite/Services/PortraitPipeline.swift'),
    read('apps/apple/Suite/Shared/EditorComponents.swift')]);
  assert.match(faces,/maskType:'face-oval-polygon-not-person-segmentation'/);
  assert.match(pure,/target\.adjustmentType!=='face_brightness'/);
  assert.match(ui,/id="face-brightness"/);
  assert.doesNotMatch(ui,/(?:id="contacts-|setContacts|data-action="contacts)/i);
  assert.match(session,/if\(key==='faceBrightness'\)/);
  assert.doesNotMatch(session,/(?:setContacts|readContactsRuntime)/i);
  assert.match(apple,/FaceBrightnessAdapter\(\)/);
  assert.doesNotMatch(apple,/ContactsAdapter/);
  assert.doesNotMatch(appleUI,/Contacts (?:Style|Amount|Color)/);
});
