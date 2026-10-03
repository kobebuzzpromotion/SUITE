import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  CROP_RATIOS, PRINT_PRESETS, EXPORT_PRESETS, defaultCropSettings, defaultExportSettings, validateCropSettings,
  validateExportSettings, validateCropRatio, validateCropRect, requiredPixels, centeredRect,
  resolutionAssessment, estimatedUncompressedBytes, type CropSettings, type CropRatio, type PrintPreset
} from '../src/crop-export.js';
import {validateRecipe} from '../src/photo-policy.js';
import {AssetRepository} from '../src/repository.js';

const physical=(w:number,h:number,dpi=300):CropSettings=>({
  ...defaultCropSettings(),preset_id:'custom.size',preset_name:'Custom Size',width_mm:w,height_mm:h,
  orientation:w<=h?'portrait':'landscape',crop_ratio:{width:w,height:h},custom_size:true,requested_dpi:dpi
});
const recipe=(crop=defaultCropSettings(),settings=defaultExportSettings())=>({
  schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:crop.rotation,
    extendedParameters:{crop,export:settings},processingOrder:['exposure','contrast','saturation','rotation','crop']}
});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8, String(a)+' != '+String(b));
const oriented=(p:PrintPreset,landscape:boolean):CropSettings=>{
  assert.ok(p.width_mm&&p.height_mm);
  const w=landscape?p.height_mm:p.width_mm,h=landscape?p.width_mm:p.height_mm;
  return {...physical(w,h),preset_id:p.id,preset_name:p.name,custom_size:false};
};

test('CE01 twelve ratios preserve required labels and independent IDs',()=>{
  assert.deepEqual(CROP_RATIOS.map(p=>p.name),['Original','Free','1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','Custom Ratio']);
  assert.equal(new Set(CROP_RATIOS.map(p=>p.id)).size,12);
});
test('CE02 every fixed ratio yields centered in-bounds crop in both source orientations',()=>{
  for(const p of CROP_RATIOS) if('ratio' in p) for(const [w,h] of [[6000,4000],[4000,6000]] as const){
    const r=centeredRect(w,h,p.ratio); validateCropRect(r);
    near(w*r.width/(h*r.height),p.ratio.width/p.ratio.height);near(r.x*2+r.width,1);near(r.y*2+r.height,1);
  }
});
test('CE03 custom ratio supports nonstandard positive proportions without changing inputs',()=>{
  const ratio={width:7,height:11},before=JSON.stringify(ratio);
  const rect=centeredRect(5000,4000,ratio);near(5000*rect.width/(4000*rect.height),7/11);
  assert.equal(JSON.stringify(ratio),before);assert.throws(()=>validateCropRatio({width:1,height:0}));
});
test('CE04 JSON print catalog equals portable TypeScript and has 37 source-backed entries',async()=>{
  const fixture=JSON.parse(await readFile('contracts/fixtures/print-presets.json','utf8'));
  assert.deepEqual(PRINT_PRESETS,fixture.presets);assert.equal(PRINT_PRESETS.length,37);
  validateCropSettings(fixture.wire_examples.crop);validateExportSettings(fixture.wire_examples.export);
  validateRecipe(fixture.wire_examples.recipe);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.wire_examples)),fixture.wire_examples);
  assert.equal(new Set(PRINT_PRESETS.map(p=>p.id)).size,37);
  for(const p of PRINT_PRESETS){assert.equal(p.available,true);assert.match(p.source_url!,/^https:\/\//);assert.equal(p.checked_at,'2026-10-03');}
});
test('CE05 A0 double and B0 double are independent exact physical presets',()=>{
  const by=(id:string)=>PRINT_PRESETS.find(p=>p.id===id)!;
  assert.deepEqual([by('a.a0-double').width_mm,by('a.a0-double').height_mm],[1189,1682]);
  assert.deepEqual([by('b.b0-double').width_mm,by('b.b0-double').height_mm],[1456,2060]);
  assert.deepEqual([by('a.a0').width_mm,by('a.a0').height_mm],[841,1189]);
  assert.deepEqual([by('b.b0').width_mm,by('b.b0').height_mm],[1030,1456]);
});
test('CE06 A-series and JIS B-series contain full required dimensions',()=>{
  assert.deepEqual(PRINT_PRESETS.filter(p=>p.category==='aSeries').map(p=>[p.width_mm,p.height_mm]),[[1189,1682],[841,1189],[594,841],[420,594],[297,420],[210,297],[148,210],[105,148]]);
  assert.deepEqual(PRINT_PRESETS.filter(p=>p.category==='bSeries').map(p=>[p.width_mm,p.height_mm]),[[1456,2060],[1030,1456],[728,1030],[515,728],[364,515],[257,364],[182,257],[128,182]]);
});
test('CE07 all 21 photo print labels retained; KG and postcard are not conflated',()=>{
  const photos=PRINT_PRESETS.filter(p=>p.category==='photoPrint');
  assert.deepEqual(photos.map(p=>p.name),['L','2L','DSC','DSCW','KG','はがき','HV','スクエア','パノラマ','キャビネ','八切','六切','ワイド六切','四切','ワイド四切','大四切','半切','全紙','大全紙','全倍','A3ノビ']);
  assert.deepEqual([photos.find(p=>p.id==='photo.kg')!.width_mm,photos.find(p=>p.id==='photo.postcard')!.width_mm],[102,100]);
});
test('CE08 all 37 presets validate in portrait and landscape and calculate pixels independently',()=>{
  for(const p of PRINT_PRESETS)for(const landscape of [false,true]){
    const c=oriented(p,landscape);validateCropSettings(c);
    const px=requiredPixels(c.width_mm!,c.height_mm!,300);
    assert.equal(px.width,Math.ceil(c.width_mm!/25.4*300));assert.equal(px.height,Math.ceil(c.height_mm!/25.4*300));
  }
});
test('CE09 preset ID cannot lie about physical dimensions or bypass with custom_size',()=>{
  const a4=oriented(PRINT_PRESETS.find(p=>p.id==='a.a4')!,false);
  assert.throws(()=>validateCropSettings({...a4,width_mm:100,crop_ratio:{width:100,height:297}}),/PRESET_DIMENSIONS/);
  assert.throws(()=>validateCropSettings({...a4,custom_size:true}),/PRESET/);
  const {width_mm,height_mm,crop_ratio,...withoutMM}=a4;
  assert.throws(()=>validateCropSettings(withoutMM),/PRESET_DIMENSIONS/);
});
test('CE10 mm/dpi uses ceiling not floor and does not merely tag DPI',()=>{
  assert.deepEqual(requiredPixels(25.4,50.8,300),{width:300,height:600});
  assert.deepEqual(requiredPixels(210,297),{width:2481,height:3508});
  assert.deepEqual(requiredPixels(210,297,144),{width:1191,height:1684});
  assert.deepEqual(requiredPixels(0.1,0.1,72),{width:1,height:1});
});
test('CE11 invalid nonfinite and unsafe dimensions are rejected',()=>{
  for(const value of [0,-1,NaN,Infinity]){assert.throws(()=>requiredPixels(value,10));assert.throws(()=>requiredPixels(10,value));assert.throws(()=>requiredPixels(10,10,value));}
  assert.throws(()=>requiredPixels(Number.MAX_VALUE,10));
  assert.throws(()=>centeredRect(0,4000,{width:1,height:1}));
});
test('CE12 explicit custom physical size and custom DPI round-trip as plain JSON',()=>{
  const c=physical(181.5,257.25,240);c.crop_rect=centeredRect(4000,6000,c.crop_ratio!);
  validateCropSettings(c);const restored=JSON.parse(JSON.stringify(c));validateCropSettings(restored);
  assert.deepEqual(restored,c);assert.deepEqual(resolutionAssessment(4000,6000,c).required,requiredPixels(181.5,257.25,240));
});
test('CE13 physical size rejects one-sided dimensions, mismatching ratio and wrong orientation',()=>{
  const c=physical(210,297);
  assert.throws(()=>validateCropSettings({...c,height_mm:undefined}));
  assert.throws(()=>validateCropSettings({...c,crop_ratio:{width:1,height:1}}));
  assert.throws(()=>validateCropSettings({...c,orientation:'landscape'}));
  assert.throws(()=>validateCropSettings({...defaultCropSettings(),custom_size:true}));
});
test('CE14 normalized crop rejects zero/outside/nonfinite rect and unknown nested fields',()=>{
  for(const rect of [{x:-0.1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:0.1,y:0,width:1,height:1},{x:NaN,y:0,width:1,height:1},{x:0,y:0,width:1,height:1,hidden:1}])assert.throws(()=>validateCropRect(rect));
  assert.throws(()=>validateCropSettings({...defaultCropSettings(),crop_ratio:{width:1,height:1,hidden:1}}));
});
test('CE15 Crop settings reject null optional values, missing fields and unknown fields',()=>{
  for(const bad of [{...defaultCropSettings(),width_mm:null,height_mm:null},{...defaultCropSettings(),crop_ratio:null},{...defaultCropSettings(),futureFlag:true},{preset_id:'x'}])assert.throws(()=>validateCropSettings(bad));
  assert.equal(JSON.stringify(defaultCropSettings()).includes('null'),false);
});
test('CE16 cropped-source resolution reports worst-axis shortfall and safe recommended DPI',()=>{
  const c=physical(254,254);c.crop_rect={x:1/3,y:0.25,width:1/3,height:0.5};
  const r=resolutionAssessment(6000,4000,c);
  assert.deepEqual(r.available,{width:2000,height:2000});assert.deepEqual(r.required,{width:3000,height:3000});
  near(r.shortfallPercent,100/3);assert.equal(r.recommendedDPI,200);assert.equal(r.needsUpscale,true);
});
test('CE17 sufficient cropped source requires no upscale and no physical target has no invented DPI',()=>{
  const c=physical(254,254);c.crop_rect=centeredRect(6000,4000,{width:1,height:1});
  const r=resolutionAssessment(6000,4000,c);assert.equal(r.needsUpscale,false);assert.equal(r.shortfallPercent,0);assert.equal(r.recommendedDPI,400);
  const natural=resolutionAssessment(6000,4000,defaultCropSettings());assert.equal(natural.required,undefined);assert.equal(natural.recommendedDPI,undefined);
});
test('CE18 source rotation swaps dimensions once; mm dimensions are already oriented',()=>{
  const c=physical(254,381);c.rotation=90;
  const r=resolutionAssessment(6000,4000,c);assert.deepEqual(r.available,{width:4000,height:6000});
  assert.deepEqual(r.required,{width:3000,height:4500});assert.equal(r.needsUpscale,false);
  c.rotation=-270;assert.deepEqual(resolutionAssessment(6000,4000,c),r);
  assert.throws(()=>validateCropSettings({...c,rotation:45}));
});
test('CE19 crop rectangle cannot silently distort the physical or selected aspect',()=>{
  const c=physical(254,254);assert.throws(()=>resolutionAssessment(6000,4000,c),/RATIO_MISMATCH/);
  c.crop_rect=centeredRect(6000,4000,{width:1,height:1});assert.doesNotThrow(()=>resolutionAssessment(6000,4000,c));
});
test('CE20 JPEG defaults to quality 100 and explicit quality changes remain explicit',()=>{
  const s=defaultExportSettings();validateExportSettings(s);assert.equal(s.jpeg_quality,100);
  validateExportSettings({...s,jpeg_quality:80});assert.equal(s.jpeg_quality,100);
  for(const value of [0,101,99.5,NaN])assert.throws(()=>validateExportSettings({...s,jpeg_quality:value}));
});
test('CE21 TIFF 8/16 and lossless modes are data model settings, not encoder certification',()=>{
  for(const bit_depth of [8,16])for(const tiff_compression of ['none','lzw'] as const)for(const color_space of ['sRGB','adobeRGB'] as const)
    validateExportSettings({...defaultExportSettings(),format:'tiff',bit_depth,tiff_compression,color_space});
});
test('CE22 PNG alpha and bit depth are stored without silently changing their requested values',()=>{
  const s={...defaultExportSettings(),format:'png' as const,bit_depth:16,preserve_alpha:true};validateExportSettings(s);
  assert.deepEqual(JSON.parse(JSON.stringify(s)),s);assert.equal(s.bit_depth,16);
  assert.throws(()=>validateExportSettings({...s,tiff_compression:'lzw'}));
});
test('CE23 incompatible formats and unsupported metadata/profile values are rejected',()=>{
  const s=defaultExportSettings();
  for(const bad of [{...s,bit_depth:16},{...s,preserve_alpha:true},{...s,tiff_compression:'lzw'},{...s,color_space:'tag-only-adobe'},{...s,metadata:'guess'},{...s,format:'raw'},{...s,bit_depth:32}])assert.throws(()=>validateExportSettings(bad));
});
test('CE24 file naming and metadata retain valid settings and reject unsafe paths/placeholders',()=>{
  const s=defaultExportSettings();
  validateExportSettings({...s,metadata:'remove',file_name_template:'作品-{original}-{sequence}'});
  for(const name of ['../escape','folder/file','C:\\file','{unknown}','', 'a'.repeat(129),'a\nb','a\u007fb','a\u202eb'])assert.throws(()=>validateExportSettings({...s,file_name_template:name}));
});
test('CE25 uncompressed buffer estimate reflects dimensions/bit depth/alpha, not compressed size',()=>{
  assert.equal(estimatedUncompressedBytes({width:3000,height:2000},defaultExportSettings()),18000000);
  assert.equal(estimatedUncompressedBytes({width:3000,height:2000},{...defaultExportSettings(),format:'tiff',bit_depth:16}),36000000);
  assert.equal(estimatedUncompressedBytes({width:3000,height:2000},{...defaultExportSettings(),format:'png',preserve_alpha:true}),24000000);
  assert.throws(()=>estimatedUncompressedBytes({width:Number.MAX_SAFE_INTEGER,height:3000},defaultExportSettings()));
});
test('CE26 Crop/Export payload bridges existing Recipe schema v1 without mutation',()=>{
  const c=physical(210,297);c.crop_rect=centeredRect(4000,6000,c.crop_ratio!);const r=recipe(c);
  const before=JSON.stringify(r);validateRecipe(r);assert.equal(JSON.stringify(r),before);
  validateRecipe(JSON.parse(before));assert.equal(r.schemaVersion,1);
});
test('CE27 Recipe rejects double rotation risk, wrong stage order and mismatched export DPI',()=>{
  const r=recipe({...defaultCropSettings(),rotation:90});assert.equal(r.parameters.rotationDegrees,90);validateRecipe(r);
  assert.throws(()=>validateRecipe({...r,parameters:{...r.parameters,rotationDegrees:0}}));
  assert.throws(()=>validateRecipe({...r,parameters:{...r.parameters,processingOrder:['crop','exposure','contrast','saturation','rotation']}}));
  assert.throws(()=>validateRecipe(recipe(defaultCropSettings(),{...defaultExportSettings(),requested_dpi:240})));
});
test('CE28 Crop/Export Recipe survives SQLite close/reopen and CAS conflict without changing Original identity',async()=>{
  const root=await mkdtemp(join(tmpdir(),'suite-crop-test-')),db=join(root,'metadata.sqlite');
  let repo=new AssetRepository(db);
  try{
    // Metadata boundary only, NOT a RAW image or real RAW execution fixture.
    const asset=repo.create('tenant-crop',{name:'metadata-only-asset',sha256:'a'.repeat(64),size:1});
    const r=recipe();repo.saveRecipe('tenant-crop',asset.id,'tester',0,r);
    assert.throws(()=>repo.saveRecipe('tenant-crop',asset.id,'other',0,r),/REVISION_CONFLICT/);
    repo.close();repo=new AssetRepository(db);
    assert.deepEqual(repo.latestRecipe('tenant-crop',asset.id)!.body,r);
    assert.equal(repo.get('tenant-crop',asset.id).originalKey,asset.originalKey);
    assert.equal(repo.get('tenant-crop',asset.id).sha256,asset.sha256);
    assert.throws(()=>repo.latestRecipe('wrong-tenant',asset.id),/NOT_FOUND/);
  }finally{repo.close();await rm(root,{recursive:true,force:true});}
});
test('CE29 export validation rejects unknown field/null and accepts explicit DPI/metadata policy',()=>{
  const s=defaultExportSettings();validateExportSettings({...s,requested_dpi:144,metadata:'remove'});
  for(const bad of [{...s,newRenderer:true},{...s,metadata:null},{...s,requested_dpi:0},{...s,requested_dpi:Infinity}])assert.throws(()=>validateExportSettings(bad));
});
test('CE30 changing target DPI explicitly recalculates pixels and does not mutate source crop',()=>{
  const c=physical(254,254);c.crop_rect={x:1/3,y:0.25,width:1/3,height:0.5};
  assert.equal(resolutionAssessment(6000,4000,c).needsUpscale,true);
  const lower={...c,requested_dpi:200};assert.equal(resolutionAssessment(6000,4000,lower).needsUpscale,false);
  assert.equal(c.requested_dpi,300);assert.deepEqual(lower.crop_rect,c.crop_rect);
});
test('CE31 four export recommendations retain high-quality settings without renderer certification',()=>{
  assert.equal(EXPORT_PRESETS.length,4);
  for(const p of EXPORT_PRESETS)validateExportSettings(p.settings);
  assert.equal(EXPORT_PRESETS[0].settings.jpeg_quality,100);
  assert.equal(EXPORT_PRESETS[1].settings.requested_dpi,300);
  assert.equal(EXPORT_PRESETS[2].settings.bit_depth,16);
  assert.equal(EXPORT_PRESETS[2].settings.color_space,'adobeRGB');
  assert.equal(EXPORT_PRESETS[3].settings.preserve_alpha,true);
  assert.deepEqual(EXPORT_PRESETS[0].suggestedRatioIDs,['ratio.1:1','ratio.4:5','ratio.16:9','ratio.9:16']);
});
