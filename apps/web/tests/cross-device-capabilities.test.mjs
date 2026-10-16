import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {preflightCrossDeviceCapabilities as preflight} from '../src/cross-device-capabilities.mjs';

const recipe=()=>({schemaVersion:1,parameters:{exposure:.2,contrast:1.1,saturation:1,
  rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
const preset=body=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspaceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',scope:'PERSONAL',ownerUserId:'owner',
  name:'Test',version:3,body,createdAt:'2026-10-05T00:00:00.000Z',
  updatedAt:'2026-10-05T00:00:00.000Z',deletedAt:null});
const run=(direction,kind,record)=>preflight({direction,kind,record});

test('CROSS-CAP01: both directions report only the narrow common Recipe v1 stages, preserve bytes and grant no transfer',()=>{
  const input=recipe();
  for(const direction of ['web-to-apple','apple-to-web']){
    const result=run(direction,'recipe',input);
    assert.equal(result.reportSchemaVersion,1);
    assert.equal(result.recipeSchemaVersion,1);
    assert.equal(result.assessment,'supported');
    assert.deepEqual(result.stages.map(row=>[row.name,row.assessment]),
      input.parameters.processingOrder.map(name=>[name,'supported']));
    assert.deepEqual(result.preservedRecord,input);
    assert.notStrictEqual(result.preservedRecord,input);
    assert.equal(Object.isFrozen(result.preservedRecord.parameters),true);
    assert.equal(result.operationAllowed,false);
    assert.equal(result.renderParity,'NOT_VERIFIED');
    assert.equal(result.authentication,'NOT_CHECKED');
    assert.equal(result.transfer,'NOT_CONNECTED');
    assert.equal(result.deviceVerification,'NOT_RUN');
    assert.deepEqual(input,recipe(),'source is unchanged');
  }
});

test('CROSS-CAP02: Web-only extensions and stages block Apple in both directions without dropping the input',()=>{
  const input=recipe();
  input.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',color:{calibration:{red:{hue:4}}},detail:{}};
  input.parameters.extendedParameters.canvasExpand={schemaVersion:1,margins:{left:.1,right:0,top:0,bottom:0}};
  input.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  for(const direction of ['web-to-apple','apple-to-web']){
    const result=run(direction,'recipe',input);
    assert.equal(result.assessment,'unsupported');
    assert.equal(result.stages.find(row=>row.name==='postDecodeAdjustments').assessment,'unsupported');
    assert.equal(result.extensions.find(row=>row.name==='postDecodeAdjustments').assessment,'unsupported');
    assert.equal(result.extensions.find(row=>row.name==='canvasExpand').assessment,'unsupported');
    assert.deepEqual(result.preservedRecord,input);
    assert.equal(result.operationAllowed,false);
  }
});

test('CROSS-CAP03: crop/export remain unverified and portraits are engine-incompatible, even when both sides have fields',()=>{
  const input=recipe();
  input.parameters.extendedParameters.crop={rotation:0,crop_rect:{x:0,y:0,width:1,height:1}};
  input.parameters.extendedParameters.export={format:'jpeg'};
  input.parameters.extendedParameters.portrait={engineVersion:'web-libraw-mediapipe-face-exposure-1'};
  input.parameters.processingOrder.push('crop');
  for(const direction of ['web-to-apple','apple-to-web']){
    const result=run(direction,'recipe',input);
    assert.equal(result.stages.at(-1).assessment,'unverified');
    assert.equal(result.extensions.find(row=>row.name==='crop').assessment,'unverified');
    assert.equal(result.extensions.find(row=>row.name==='export').assessment,'unverified');
    assert.equal(result.extensions.find(row=>row.name==='portrait').assessment,'unsupported');
    assert.equal(result.assessment,'unsupported');
    assert.deepEqual(result.preservedRecord,input);
  }
});

test('CROSS-CAP04: Personal/Workspace Preset metadata is versioned; Author/Community/deleted cannot be certified',()=>{
  const input=preset(recipe());
  for(const direction of ['web-to-apple','apple-to-web']){
    const report=run(direction,'preset',input);
    assert.deepEqual(report.preset,{scope:'PERSONAL',version:3,assessment:'supported'});
    assert.deepEqual(report.preservedRecord,input);
    for(const scope of ['AUTHOR','COMMUNITY']){
      const rejected=run(direction,'preset',{...input,scope});
      assert.equal(rejected.preset.assessment,'unsupported');
      assert.equal(rejected.operationAllowed,false);
      assert.deepEqual(rejected.preservedRecord,{...input,scope});
    }
    assert.equal(run(direction,'preset',{...input,deletedAt:'2026-10-06T00:00:00.000Z'}).assessment,'unsupported');
  }
});

test('CROSS-CAP05: unknown, malformed and hidden fields fail closed instead of silently translating',()=>{
  const base=recipe();
  const reject=value=>assert.throws(()=>run('web-to-apple','recipe',value),/CROSS_DEVICE_CAPABILITY_/);
  reject({...base,schemaVersion:2});
  reject({...base,parameters:{...base.parameters,processingOrder:['exposure','futureStage']}});
  reject({...base,parameters:{...base.parameters,processingOrder:['exposure','exposure']}});
  reject({...base,parameters:{...base.parameters,extendedParameters:{futureExtension:{value:1}}}});
  reject({...base,parameters:{...base.parameters,extendedParameters:{postCropAdjustments:{vignette:null}}}});
  const wrongOrder=run('web-to-apple','recipe',
    {...base,parameters:{...base.parameters,processingOrder:['contrast','exposure'],exposure:.2}});
  assert.equal(wrongOrder.order.assessment,'unsupported');
  assert.equal(wrongOrder.operationAllowed,false);
  const hidden=recipe();Object.defineProperty(hidden.parameters,'secret',{value:1,enumerable:false});reject(hidden);
  assert.throws(()=>run('web-to-apple','preset',{...preset(recipe()),version:0}),/CROSS_DEVICE_CAPABILITY_/);
  assert.throws(()=>run('apple-to-web','preset',{...preset(recipe()),updatedAt:'tomorrow'}),/CROSS_DEVICE_CAPABILITY_/);
  assert.throws(()=>run('unknown','recipe',base),/CROSS_DEVICE_CAPABILITY_/);
});

test('CROSS-CAP06: evidence pins match the actual current Web and Apple renderer allowlists',async()=>{
  const web=await readFile(new URL('../src/processing/pure.mjs',import.meta.url),'utf8');
  const apple=await readFile(new URL('../../../apps/apple/Suite/Services/PhotoPipeline.swift',import.meta.url),'utf8');
  assert.match(web,/const fixedOrder=\['exposure','contrast','saturation','postDecodeAdjustments','rotation','crop'\]/u);
  assert.match(web,/\['crop','export','portrait','postDecodeAdjustments','postCropAdjustments','canvasExpand','localLevels','bwEdgeManual','addShadowManual'\]/u);
  assert.match(apple,/supportedAdjustments: Set<RAWAdjustment> = \[\.exposure, \.contrast, \.saturation, \.rotation, \.crop\]/u);
  assert.match(apple,/isSubset\(of: \["crop", "export", "portrait"\]\)/u);
});

test('CROSS-CAP07: shared stage names do not hide Web numeric, rotation or physical-crop limits',()=>{
  for(const direction of ['web-to-apple','apple-to-web']){
    const highExposure=recipe();highExposure.parameters.exposure=5;
    assert.equal(run(direction,'recipe',highExposure).stages.find(row=>row.name==='exposure').assessment,'unsupported');
    const diagonal=recipe();diagonal.parameters.rotationDegrees=45;
    assert.equal(run(direction,'recipe',diagonal).stages.find(row=>row.name==='rotation').assessment,'unsupported');
    const physical=recipe();physical.parameters.extendedParameters.crop={rotation:0,
      crop_rect:{x:0,y:0,width:1,height:1},width_mm:200};
    physical.parameters.processingOrder.push('crop');
    const report=run(direction,'recipe',physical);
    assert.equal(report.stages.find(row=>row.name==='crop').assessment,'unsupported');
    assert.equal(report.extensions.find(row=>row.name==='crop').assessment,'unsupported');
    assert.deepEqual(report.preservedRecord,physical);
    assert.equal(report.operationAllowed,false);
  }
});
