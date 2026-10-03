import test from 'node:test';
import assert from 'node:assert/strict';
import {adjacentPhotoID,canSwitchPhoto,createFilmstripGesture,validatedSignInURL} from '../src/editor-ui.mjs';
import {EditorSession,checksum,neutralRecipe} from '../src/session.mjs';

function viewport(){
  const captured=new Set();
  return {scrollLeft:100,scrollWidth:900,clientWidth:300,
    setPointerCapture(id){captured.add(id);},hasPointerCapture(id){return captured.has(id);},releasePointerCapture(id){captured.delete(id);},captured};
}
function pointer(pointerType,id,x,y=0){return {pointerType,pointerId:id,isPrimary:true,button:0,clientX:x,clientY:y,prevented:false,preventDefault(){this.prevented=true;}};}

test('many-photo navigation has exact first/last edges and no selection side effect',()=>{
  const assets=Array.from({length:1000},(_,index)=>({id:`photo-${index}`}));
  assert.equal(adjacentPhotoID(assets,null,1),'photo-0');
  assert.equal(adjacentPhotoID(assets,null,-1),null);
  assert.equal(adjacentPhotoID(assets,'photo-0',-1),null);
  assert.equal(adjacentPhotoID(assets,'photo-0',1),'photo-1');
  assert.equal(adjacentPhotoID(assets,'photo-998',1),'photo-999');
  assert.equal(adjacentPhotoID(assets,'photo-999',1),null);
  assert.equal(adjacentPhotoID(assets,'missing',-1),null);
  assert.equal(assets[999].id,'photo-999');
});

test('dirty, busy, export and access gates refuse switching without mutating edit state',()=>{
  const base={dirty:false,busy:null,exporting:false,recipe:{exposure:1},revision:3};
  assert.equal(canSwitchPhoto(base),true);
  for(const state of [{...base,dirty:true},{...base,busy:'saving'},{...base,exporting:true}])assert.equal(canSwitchPhoto(state),false);
  assert.equal(canSwitchPhoto(base,{pending:true}),false);
  assert.equal(canSwitchPhoto(base,{blocked:true}),false);
  assert.deepEqual(base.recipe,{exposure:1});assert.equal(base.revision,3);
});

test('finger horizontal swipe leaves movement and inertia to native scrolling, suppressing a trailing tap',()=>{
  let now=1000;const strip=viewport(),gesture=createFilmstripGesture(strip,{clock:()=>now});
  gesture.pointerDown(pointer('touch',7,220));
  const move=pointer('touch',7,70);gesture.pointerMove(move);
  assert.equal(strip.scrollLeft,100);assert.equal(move.prevented,false);assert.equal(strip.captured.size,0);
  gesture.pointerEnd(pointer('touch',7,70));assert.equal(gesture.suppressClick(),true);
  now+=351;assert.equal(gesture.suppressClick(),false);
});

test('inertial scroll after touch release keeps photo taps blocked until movement settles',()=>{
  let now=1000;const strip=viewport(),gesture=createFilmstripGesture(strip,{clock:()=>now});
  gesture.pointerDown(pointer('touch',8,180));strip.scrollLeft=175;
  gesture.pointerEnd(pointer('touch',8,180));assert.equal(gesture.suppressClick(),true);
  now+=340;strip.scrollLeft=260;gesture.scroll();assert.equal(gesture.suppressClick(),true);
  now+=349;assert.equal(gesture.suppressClick(),true);
  now+=2;assert.equal(gesture.suppressClick(),false);
});

test('mouse drag scrolls the strip, captures its pointer, and cannot select an image',()=>{
  let now=0;const strip=viewport(),gesture=createFilmstripGesture(strip,{clock:()=>now});
  gesture.pointerDown(pointer('mouse',3,220));
  gesture.pointerMove(pointer('mouse',3,216));assert.equal(strip.scrollLeft,100);
  const move=pointer('mouse',3,120);gesture.pointerMove(move);
  assert.equal(strip.scrollLeft,200);assert.equal(move.prevented,true);assert.equal(strip.captured.has(3),true);
  gesture.pointerEnd(pointer('mouse',3,120));assert.equal(strip.captured.size,0);assert.equal(gesture.suppressClick(),true);
  gesture.pointerDown(pointer('mouse',4,120));gesture.pointerEnd(pointer('mouse',4,120));assert.equal(gesture.suppressClick(),true);
  now+=351;assert.equal(gesture.suppressClick(),false);
});

test('mouse wheel scrolls horizontally until the edge; horizontal trackpad movement remains native',()=>{
  let now=0;const strip=viewport(),gesture=createFilmstripGesture(strip,{clock:()=>now});
  const wheel={deltaX:0,deltaY:40,deltaMode:0,prevented:false,preventDefault(){this.prevented=true;}};
  gesture.wheel(wheel);assert.equal(strip.scrollLeft,140);assert.equal(wheel.prevented,true);
  strip.scrollLeft=600;const edge={...wheel,prevented:false};gesture.wheel(edge);assert.equal(strip.scrollLeft,600);assert.equal(edge.prevented,false);
  const trackpad={deltaX:-60,deltaY:2,deltaMode:0,prevented:false,preventDefault(){this.prevented=true;}};
  gesture.wheel(trackpad);assert.equal(strip.scrollLeft,600);assert.equal(trackpad.prevented,false);assert.equal(gesture.suppressClick(),true);
  now+=201;assert.equal(gesture.suppressClick(),false);
});

test('optional cloud sign-in link must be the supplied same-origin ChatGPT route',()=>{
  const base='https://suite.example.test/?view=author';
  assert.equal(validatedSignInURL('/signin-with-chatgpt?return_to=%2F',base),'https://suite.example.test/signin-with-chatgpt?return_to=%2F');
  for(const value of ['https://other.example.test/signin-with-chatgpt?return_to=%2F','/signin-with-chatgpt?return_to=https%3A%2F%2Fother.example.test','/signin-with-chatgpt?return_to=%2F&extra=1','/trial/login','javascript:alert(1)']){
    assert.throws(()=>validatedSignInURL(value,base),/SIGNIN_ROUTE_UNCONFIRMED/);
  }
});

test('1000-photo state switching retains each saved edit across first, middle, last and session restart (synthetic NON_RAW)',async()=>{
  const bytes=new TextEncoder().encode('NON_RAW_FILMSTRIP_STATE_ONLY').buffer,sha256=await checksum(bytes);
  const assets=Array.from({length:1000},(_,index)=>({id:`photo-${index}`,name:`photo-${index}.raw`,sha256,size:bytes.byteLength}));
  const remote=new Map(assets.map(asset=>[asset.id,{revision:1,body:neutralRecipe()}]));
  const pixel={width:2,height:2,data:new Uint8ClampedArray(16).fill(128)};
  const storageMap=new Map(assets.map(asset=>[asset.id,{asset,proxy:pixel,history:[neutralRecipe()],cursor:0,revision:1,reference:null,dirty:false}]));
  const api={
    listAssets:async()=>assets,
    getRecipe:async id=>structuredClone(remote.get(id)),
    saveRecipe:async(id,expected,body)=>{const current=remote.get(id);if(current.revision!==expected)throw Error('REVISION_CONFLICT');const saved={revision:expected+1,body:structuredClone(body)};remote.set(id,saved);return structuredClone(saved);},
    getOriginal:async()=>{throw Error('UNEXPECTED_ORIGINAL_FETCH');}
  };
  const storage={get:async id=>structuredClone(storageMap.get(id)),put:async(id,value)=>storageMap.set(id,structuredClone(value))};
  const processing={render:async pixels=>pixels,encode:async pixels=>new Blob([pixels.data],{type:'image/png'})};
  let url=0;const urlAPI={createObjectURL:()=>`blob:synthetic-filmstrip-${++url}`,revokeObjectURL(){}};
  const create=()=>new EditorSession({api,storage,processing,urlAPI});
  const session=create();await session.initialize();assert.equal(session.state.assets.length,1000);
  await session.openAsset('photo-0');await session.setAdjustment('exposure',0.7);
  assert.equal(canSwitchPhoto(session.state),false);
  await assert.rejects(session.openAsset('photo-999'),/UNSAVED_EDITS/);
  await session.save();await session.openAsset('photo-500');assert.equal(session.state.asset.id,'photo-500');
  await session.openAsset('photo-999');await session.setAdjustment('exposure',-0.5);await session.save();
  await session.openAsset('photo-0');assert.equal(session.state.recipe.parameters.exposure,0.7);
  await session.openAsset('photo-999');assert.equal(session.state.recipe.parameters.exposure,-0.5);
  const restored=create();await restored.initialize();await restored.openAsset('photo-0');
  assert.equal(restored.state.recipe.parameters.exposure,0.7);
  await restored.openAsset('photo-999');assert.equal(restored.state.recipe.parameters.exposure,-0.5);
  assert.equal(assets[0].sha256,sha256);assert.equal(assets[999].sha256,sha256);
});
