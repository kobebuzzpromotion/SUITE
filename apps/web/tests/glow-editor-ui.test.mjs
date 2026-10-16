import test from 'node:test';
import assert from 'node:assert/strict';
import {canEditGlowMode,glowMaskVisible,glowModeFromRecipe} from '../src/editor-ui.mjs';

const session={setGlowMode(){},setAdjustment(){}};
const ready={asset:{id:'asset'},afterURL:'blob:after',glowMaskURL:'blob:mask',busy:null,exporting:false};

test('Glow mode UI preserves legacy Recipes and reads only the saved extended mode',()=>{
  assert.equal(glowModeFromRecipe(null),'legacy');
  assert.equal(glowModeFromRecipe({parameters:{extendedParameters:{postDecodeAdjustments:{color:{glow:{intensity:40,radius:8,threshold:180}}}}}}),'legacy');
  for(const mode of ['whiteMist','blackMist','halation'])
    assert.equal(glowModeFromRecipe({parameters:{extendedParameters:{postDecodeAdjustments:{color:{glow:{mode}}}}}}),mode);
});

test('Glow mode control rejects absent photo, missing method, busy work and expired access',()=>{
  assert.equal(canEditGlowMode(session,ready),true);
  assert.equal(canEditGlowMode({},ready),false);
  assert.equal(canEditGlowMode(session,{...ready,asset:null}),false);
  assert.equal(canEditGlowMode(session,{...ready,busy:'rendering'}),false);
  assert.equal(canEditGlowMode(session,{...ready,exporting:true}),false);
  assert.equal(canEditGlowMode(session,ready,{pending:true}),false);
  assert.equal(canEditGlowMode(session,ready,{blocked:true}),false);
});

test('Glow mask is preview-only and never visible over Before or absent pixels',()=>{
  assert.equal(glowMaskVisible(ready,{enabled:true,view:'after'}),true);
  assert.equal(glowMaskVisible(ready,{enabled:true,view:'split'}),true);
  assert.equal(glowMaskVisible(ready,{enabled:true,view:'before'}),false);
  assert.equal(glowMaskVisible(ready,{enabled:false,view:'after'}),false);
  for(const changes of [{asset:null},{afterURL:null},{glowMaskURL:null},{busy:'rendering'},{exporting:true}])
    assert.equal(glowMaskVisible({...ready,...changes},{enabled:true,view:'after'}),false);
  assert.equal(glowMaskVisible(ready,{enabled:true,blocked:true}),false);
  assert.equal(glowMaskVisible(ready,{enabled:true,pending:true}),false);
});
