import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adjacentPhotoID,canSwitchPhoto} from '../src/editor-ui.mjs';

const ui=readFileSync(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('FILMSTRIP-V01 / synthetic asset IDs: ordered horizontal card and navigation source contract',()=>{
  const assets=[{id:'artificial-1',name:'one.raw'},{id:'artificial-2',name:'two.raw'},{id:'artificial-3',name:'three.raw'}];
  assert.equal(adjacentPhotoID(assets,assets[0].id,1),assets[1].id);
  assert.equal(adjacentPhotoID(assets,assets[1].id,1),assets[2].id);
  assert.equal(adjacentPhotoID(assets,assets[2].id,-1),assets[1].id);
  assert.equal(canSwitchPhoto({busy:null,exporting:false,dirty:false}),true);
  assert.equal(canSwitchPhoto({busy:null,exporting:false,dirty:true}),false);
  assert.match(ui,/for\(const \[index,asset\] of assets\.entries\(\)\)/);
  assert.match(ui,/filmstrip-item\$\{asset\.id===selectedID\?' is-selected':''\}/);
  assert.match(ui,/stripItems\.replaceChildren\(fragment\)/);
  assert.match(css,/\.filmstrip-items\s*\{[^}]*display:flex;[^}]*width:max-content;/);
  assert.match(css,/\.filmstrip-track\s*\{[^}]*overflow-x:auto;/);
});

test('FILMSTRIP-V02 / synthetic source audit: current cards are RAW/name placeholders, not image thumbnails',()=>{
  const cardLoop=ui.slice(ui.indexOf('for(const [index,asset] of assets.entries())'),ui.indexOf('if(!assets.length)fragment.append'));
  assert.ok(cardLoop.length>0,'asset-card render loop must be present');
  assert.match(cardLoop,/filmstrip-raw/);
  assert.match(cardLoop,/filmstrip-name/);
  assert.doesNotMatch(cardLoop,/createElement\(['"]img['"]\)|element\(['"]img['"]|\.src\s*=|backgroundImage/);
});
