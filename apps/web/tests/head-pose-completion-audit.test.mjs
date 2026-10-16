import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels,rotateCropPixels} from '../src/processing/pure.mjs';
import {portrait,recipe,syntheticPixels} from './fixtures.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=path=>readFile(resolve(root,path),'utf8');

test('HEAD-POSE-AUDIT-01: three official operations and their range remain distinct',async()=>{
  const matrix=await read('docs/EVOTO_AUDIT/SUITE_GAP_MATRIX.md');
  for(const [id,label] of [['0145','Up/Down'],['0146','Left/Right'],
    ['0147','Tilt'],['0148','Range−100…100 default0']])
    assert.match(matrix,new RegExp(`\\| EV3-${id} \\|[^\\n]*\\| ${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} \\|`));
  const audit=await read('docs/HEAD_POSE_COMPLETION_AUDIT.md');
  assert.match(audit,/\*\*NOT_IMPLEMENTED\*\*/);
  for(const url of ['https://support.evoto.ai/facial-reshape/',
    'https://support.evoto.ai/facial-reshape-ipad/',
    'https://support.evoto.ai/home/evoto-mobile/'])
    assert.ok(audit.includes(url));
  assert.match(audit,/index alone does not establish identical Mobile/);
  assert.match(audit,/completion count remains unchanged/);
});

test('HEAD-POSE-AUDIT-02: portrait person target is brightness, not pose geometry',()=>{
  const bound=portrait();
  assert.doesNotThrow(()=>validatePortraitRecipe(bound));
  for(const alias of ['head_pose_up_down','head_pose_left_right','head_pose_tilt']){
    const invented=structuredClone(bound);
    invented.targets[0].adjustmentType=alias;
    assert.throws(()=>validatePortraitRecipe(invented),/INVALID_PORTRAIT_TARGET/);
  }
});

test('HEAD-POSE-AUDIT-03: existing 90-degree rotation moves the full rectangular image',()=>{
  const data=new Uint8ClampedArray(2*3*4);
  for(let pixel=0;pixel<6;pixel++){
    data[pixel*4]=pixel+1;data[pixel*4+3]=255;
  }
  const frame={width:2,height:3,data};
  const original=data.slice(),turned=rotateCropPixels(frame,90);
  assert.deepEqual([turned.width,turned.height],[3,2]);
  assert.deepEqual(Array.from(turned.data.filter((_v,index)=>index%4===0)),
    [2,4,6,1,3,5]);
  assert.deepEqual(frame.data,original);
});

test('HEAD-POSE-AUDIT-04: generic extension storage cannot become an unrendered pose effect',()=>{
  const invented=recipe();
  invented.parameters.extendedParameters.headPose={upDown:40,leftRight:0,tilt:0};
  assert.doesNotThrow(()=>validateRecipe(invented),
    'a generic JSON extension is not a Head Pose product contract');
  assert.throws(()=>renderPixels(syntheticPixels(4,4),invented,
    {validateRecipe}),/UNSUPPORTED_WEB_ADJUSTMENT/);
});

test('HEAD-POSE-AUDIT-05: current detection/UI have no 3D pose output or pose sliders',async()=>{
  const [faces,ui,session,pure]=await Promise.all([
    read('apps/web/src/processing/faces.mjs'),
    read('apps/web/src/editor-ui.mjs'),read('apps/web/src/session.mjs'),
    read('apps/web/src/processing/pure.mjs')]);
  assert.match(faces,/outputFacialTransformationMatrixes:false/);
  assert.match(faces,/maskType:'face-oval-polygon-not-person-segmentation'/);
  assert.match(ui,/data-action="rotate"/);
  assert.doesNotMatch(ui,/<(?:input|button)[^>]+(?:id|data-action)="head-pose-/);
  assert.match(session,/key==='faceBrightness'/);
  assert.match(pure,/export function rotateCropPixels/);
  assert.doesNotMatch(pure,/headPose/);
});
