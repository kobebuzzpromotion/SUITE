import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExportFilename,EXPORT_NAMING_METHODS,sanitizeExportNamePart} from '../src/export-naming.mjs';

const source={originalFilename:'IMG_1234.CR3',format:'jpeg'};

test('EXPORT-NAME-01 / all nine documented desktop naming forms are rendered without changing the output extension',()=>{
  assert.equal(EXPORT_NAMING_METHODS.length,9);
  const cases=[
    [{method:'original'},'IMG_1234.jpg'],
    [{method:'custom-count',customName:'MyShoot',sequence:1,total:10},'MyShoot (1 of 10).jpg'],
    [{method:'capture-date-original',captureDate:'2024-07-30'},'20240730_IMG_1234.jpg'],
    [{method:'custom-sequence',customName:'Event',sequence:2,total:12},'Event_002.jpg'],
    [{method:'original-custom',customText:'Retouched'},'IMG_1234_Retouched.jpg'],
    [{method:'original-effect-preset',effectPresetName:'Portrait'},'IMG_1234_Portrait.jpg'],
    [{method:'original-export-preset',exportPresetName:'WebRes'},'IMG_1234_WebRes.jpg'],
    [{method:'original-effect-export-preset',effectPresetName:'Portrait',exportPresetName:'WebRes'},'IMG_1234_Portrait_WebRes.jpg'],
    [{method:'original-effect-custom',effectPresetName:'Portrait',customText:'Final'},'IMG_1234_Portrait_Final.jpg']
  ];
  for(const [input,expected] of cases)assert.equal(buildExportFilename({...source,...input}),expected);
  assert.equal(buildExportFilename({...source,format:'png'}),'IMG_1234.png');
  assert.equal(buildExportFilename({...source,format:'tiff'}),'IMG_1234.tif');
});

test('EXPORT-NAME-02 / source extension never leaks into final JPEG, PNG or TIFF format',()=>{
  assert.equal(buildExportFilename({originalFilename:'portrait.RAF',format:'jpeg'}),'portrait.jpg');
  assert.equal(buildExportFilename({originalFilename:'portrait.raw',format:'png'}),'portrait.png');
  assert.equal(buildExportFilename({originalFilename:'portrait.RAF',format:'tiff'}),'portrait.tif');
  assert.throws(()=>buildExportFilename({...source,format:'bmp'}),/EXPORT_FORMAT_UNSUPPORTED/);
});

test('EXPORT-NAME-03 / unsafe characters, traversal, controls, bidi controls and reserved device names stay in one safe component',()=>{
  for(const input of ['../../secret.CR3','..\\..\\secret.CR3','CON.CR3','bad:<x>|?.CR3','\u202ecritical.CR3']){
    const name=buildExportFilename({originalFilename:input,format:'jpeg'});
    assert.doesNotMatch(name,/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f\u202a-\u202e]/u);
    assert.ok(!name.startsWith('.'));
    assert.ok(name.endsWith('.jpg'));
  }
  assert.equal(buildExportFilename({originalFilename:'CON.CR3',format:'jpeg'}),'_CON.jpg');
  assert.equal(sanitizeExportNamePart('  trailing. '),'trailing');
  assert.throws(()=>sanitizeExportNamePart('../'),/EXPORT_NAME_REQUIRED/);
});

test('EXPORT-NAME-04 / collision avoidance is case-insensitive and never chooses an occupied name',()=>{
  const existing=['img_1234.JPG','IMG_1234_01.jpg','IMG_1234_02.JPG'];
  assert.equal(buildExportFilename({...source,existingNames:existing}),'IMG_1234_03.jpg');
  assert.equal(buildExportFilename({...source,format:'png',existingNames:existing}),'IMG_1234.png');
});

test('EXPORT-NAME-05 / sequence boundaries are validated and missing dynamic names fail closed',()=>{
  for(const position of [{sequence:0,total:2},{sequence:3,total:2},{sequence:1.2,total:2},{sequence:1,total:0}]){
    assert.throws(()=>buildExportFilename({...source,method:'custom-sequence',customName:'Set',...position}),/EXPORT_SEQUENCE_INVALID/);
  }
  assert.throws(()=>buildExportFilename({...source,method:'custom-count'}),/EXPORT_CUSTOM_NAME_REQUIRED/);
  assert.throws(()=>buildExportFilename({...source,method:'original-effect-preset'}),/EXPORT_EFFECT_PRESET_NAME_REQUIRED/);
  assert.throws(()=>buildExportFilename({...source,method:'unknown'}),/EXPORT_NAMING_METHOD_UNSUPPORTED/);
  assert.throws(()=>buildExportFilename({...source,existingNames:[3]}),/EXPORT_EXISTING_NAMES_INVALID/);
  assert.throws(()=>buildExportFilename({...source,existingNames:'IMG_1234.jpg'}),/EXPORT_EXISTING_NAMES_INVALID/);
  assert.throws(()=>buildExportFilename({...source,method:'original-custom',customText:'x'.repeat(4097)}),/EXPORT_NAME_TOO_LONG/);
});

test('EXPORT-NAME-06 / capture date requires a real calendar day and does not depend on local timezone',()=>{
  assert.equal(buildExportFilename({...source,method:'capture-date-original',captureDate:'20240229'}),'20240229_IMG_1234.jpg');
  for(const date of ['20230229','20241301','2024-02-31','2024-07-30Tbad','not a date']){
    assert.throws(()=>buildExportFilename({...source,method:'capture-date-original',captureDate:date}),/EXPORT_CAPTURE_DATE_INVALID/);
  }
  assert.throws(()=>buildExportFilename({...source,method:'capture-date-original'}),/EXPORT_CAPTURE_DATE_REQUIRED/);
});

test('EXPORT-NAME-07 / long multibyte names remain under filesystem component limit after collision suffix',()=>{
  const originalFilename='写'.repeat(120)+'.CR3';
  const first=buildExportFilename({originalFilename,format:'jpeg'});
  const second=buildExportFilename({originalFilename,format:'jpeg',existingNames:[first]});
  assert.ok(new TextEncoder().encode(first).length<=255);
  assert.ok(new TextEncoder().encode(second).length<=255);
  assert.notEqual(first,second);
  assert.match(second,/_01\.jpg$/);
});
