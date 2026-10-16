import test from 'node:test';
import assert from 'node:assert/strict';
import {canSampleLevels,LEVELS_CHANNELS,levelsHistogramPath,moveLevelsSamplePoint} from '../src/editor-ui.mjs';
import {mapPreviewClick} from '../src/preview-coordinate.mjs';

const session={sampleLevelsAt(){}};
const ready={asset:{id:'asset'},afterURL:'blob:after',levelsHistogram:{includedPixels:2},busy:null,exporting:false};

test('Levels photo sampling requires a live After preview and active access',()=>{
  assert.equal(canSampleLevels(session,ready),true);
  assert.equal(canSampleLevels(session,ready,{view:'split'}),true);
  for(const changes of [{asset:null},{afterURL:null},{levelsHistogram:null},{levelsHistogram:{includedPixels:0}},{busy:'preview'},{exporting:true}])
    assert.equal(canSampleLevels(session,{...ready,...changes}),false);
  assert.equal(canSampleLevels({},ready),false);
  assert.equal(canSampleLevels(session,ready,{view:'before'}),false);
  assert.equal(canSampleLevels(session,ready,{pending:true}),false);
  assert.equal(canSampleLevels(session,ready,{blocked:true}),false);
});

test('Levels histogram exposes Master and all three RGB channels without claiming luma',()=>{
  assert.deepEqual(LEVELS_CHANNELS,['master','red','green','blue']);
  const bins=new Uint32Array(256);bins[0]=1;bins[128]=4;bins[255]=2;
  const path=levelsHistogramPath(bins);
  assert.match(path,/^M0,/);
  assert.match(path,/252,/);
  assert.equal(path.split(' L').length,64);
  assert.equal(levelsHistogramPath(new Uint32Array(256)),'');
  assert.equal(levelsHistogramPath(new Uint32Array(255)),'');
  const invalid=Array(256).fill(0);invalid[17]=-1;
  assert.equal(levelsHistogramPath(invalid),'');
});

test('keyboard eyedropper moves within the actual image and rejects unknown keys',()=>{
  assert.deepEqual(moveLevelsSamplePoint({x:.5,y:.5},'ArrowRight'),{x:.51,y:.5});
  assert.deepEqual(moveLevelsSamplePoint({x:.5,y:.5},'ArrowUp',{coarse:true}),{x:.5,y:.4});
  assert.deepEqual(moveLevelsSamplePoint({x:0,y:1},'ArrowLeft'),{x:0,y:1});
  assert.deepEqual(moveLevelsSamplePoint({x:0,y:1},'ArrowDown'),{x:0,y:1});
  assert.throws(()=>moveLevelsSamplePoint({x:NaN,y:0},'ArrowLeft'),/LEVELS_SAMPLE_POINT_INVALID/);
  assert.throws(()=>moveLevelsSamplePoint({x:0,y:0},'Enter'),/LEVELS_SAMPLE_KEY_INVALID/);
});

test('eyedropper maps only displayed After pixels and rejects letterbox or Before',()=>{
  const afterRect={left:400,top:0,width:400,height:400},beforeRect={left:0,top:0,width:390,height:400};
  assert.deepEqual(mapPreviewClick({afterRect,beforeRect,naturalWidth:400,naturalHeight:200,clientX:600,clientY:200,view:'split'}),{x:.5,y:.5});
  assert.throws(()=>mapPreviewClick({afterRect,beforeRect,naturalWidth:400,naturalHeight:200,clientX:600,clientY:10,view:'split'}),/PREVIEW_CONTAIN_LETTERBOX/);
  assert.throws(()=>mapPreviewClick({afterRect,beforeRect,naturalWidth:400,naturalHeight:200,clientX:200,clientY:200,view:'split'}),/PREVIEW_BEFORE_REGION/);
  assert.throws(()=>mapPreviewClick({afterRect,naturalWidth:400,naturalHeight:200,clientX:600,clientY:200,view:'before'}),/PREVIEW_AFTER_REQUIRED/);
});
