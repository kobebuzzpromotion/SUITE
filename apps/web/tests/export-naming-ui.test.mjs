import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildExportFilename} from '../src/export-naming.mjs';

// No DOM emulator is installed. These tests verify the UI-to-pure-function
// source contract and the same builder's concrete outputs. Real click/download
// behavior still requires a browser run; do not report it as a browser PASS.
const ui=readFileSync(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');

function functionBody(start,end){
  const from=ui.indexOf(start),to=ui.indexOf(end,from+start.length);
  assert.ok(from>=0,`missing ${start}`);
  assert.ok(to>from,`missing ${end}`);
  return ui.slice(from,to);
}

test('EXPORT-NAME-UI-01 / current UI offers legacy, original, original-plus-text and explicit verified DNG date',()=>{
  assert.match(ui,/import \{buildExportFilename\} from '\.\/export-naming\.mjs';/);
  for(const mode of ['revision','original','original-custom','capture-date-original'])assert.match(ui,new RegExp(`<option value="${mode}"`));
  assert.match(ui,/id="export-name-method"/);
  assert.match(ui,/id="export-name-custom"/);
  assert.match(ui,/exportNameCustomLabel\.hidden=exportNameMethod\.value!=='original-custom'/);
  assert.match(ui,/byID\('export-section'\)\.querySelector\('\.button-pair'\)\.before\(exportNaming\)/);
  assert.equal(buildExportFilename({originalFilename:'shoot.CR3',format:'jpeg',method:'original'}),'shoot.jpg');
  assert.equal(buildExportFilename({originalFilename:'shoot.CR3',format:'png',method:'original-custom',customText:'仕上げ'}),'shoot_仕上げ.png');
});

test('EXPORT-NAME-UI-02 / naming plan validates before expensive Final export and unknown modes fail closed',()=>{
  const planner=functionBody('function plannedExportName(format){','async function run(method');
  assert.match(planner,/const method=exportNameMethod\.value,originalFilename=assetName\(state\.asset\)/);
  assert.match(planner,/if\(!state\.asset\)throw Error\('EXPORT_ORIGINAL_NAME_REQUIRED'\)/);
  assert.match(planner,/existingNames:completedDownloadNames/);
  assert.match(planner,/if\(method==='original'\)return buildExportFilename\(/);
  assert.match(planner,/if\(method==='original-custom'\)return buildExportFilename\(/);
  assert.match(planner,/customText:exportNameCustom\.value/);
  assert.match(planner,/throw Error\('EXPORT_NAMING_METHOD_UNSUPPORTED'\)/);

  const run=functionBody('async function run(method','function publishDownload(');
  const plan=run.indexOf("method==='exportFinal'&&!captureDate?plannedExportName(args[0]?.format):null");
  const processing=run.indexOf('await session[method](...callArgs)');
  assert.ok(plan>=0&&processing>plan,'filename must be validated before Final processing');
  assert.match(run,/await exportTrialDngCaptureDateFinal\(/);
  assert.match(run,/autoDownload:false/);
  assert.match(run,/catch\(error\)\{localError=/);
  assert.throws(()=>buildExportFilename({originalFilename:'shoot.CR3',format:'jpeg',method:'original-custom',customText:''}),/EXPORT_CUSTOM_TEXT_REQUIRED/);
});

test('EXPORT-NAME-UI-03 / Blob MIME and names are checked; only legacy modes auto-click',()=>{
  const delivery=functionBody('function publishDownload(result,format,filename,{autoDownload=true}={}){','function setImage(');
  assert.match(delivery,/if\(access\.reason\(\)\)return/);
  assert.match(delivery,/if\(!\(blob instanceof Blob\)\)throw Error\('EXPORT_BLOB_MISSING'\)/);
  assert.match(delivery,/tiff:'image\/tiff'/);
  assert.match(delivery,/if\(!type\|\|blob\.type!==type\|\|blob\.size===0\)throw Error\('ENCODER_FORMAT_MISMATCH'\)/);
  assert.match(delivery,/link\.download=filename/);
  assert.match(delivery,/completedDownloadNames\.add\(filename\);if\(autoDownload\)link\.click\(\)/);
  assert.doesNotMatch(delivery,/link\.download=`\$\{String\(assetName/);
  const first=buildExportFilename({originalFilename:'shoot.CR3',format:'jpeg',method:'original'});
  const next=buildExportFilename({originalFilename:'shoot.CR3',format:'jpeg',method:'original',existingNames:new Set([first])});
  assert.equal(next,'shoot_01.jpg');
});
