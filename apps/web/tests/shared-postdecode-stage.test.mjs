import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

test('SHARED-STAGE01 / JSON and Swift wire stage name matches the existing Web Recipe v1 extension',async()=>{
  const schema=JSON.parse(await readFile(new URL('../../../contracts/recipe-v1.schema.json',import.meta.url),'utf8'));
  const swift=await readFile(new URL('../../../packages/SuiteCore/Sources/SuiteCore/Recipe.swift',import.meta.url),'utf8');
  const native=await readFile(new URL('../../../apps/apple/Suite/Services/PhotoPipeline.swift',import.meta.url),'utf8');
  const stages=schema.properties.parameters.properties.processingOrder.items.enum;
  assert.ok(stages.includes('postDecodeAdjustments'));
  assert.match(swift,/case lensCorrection, postDecodeAdjustments, crop, rotation/);
  assert.match(swift,/extendedParameters\["postDecodeAdjustments"\].*processingOrder\.contains\(\.postDecodeAdjustments\)/);
  assert.match(native,/supportedAdjustments: Set<RAWAdjustment> = \[\.exposure, \.contrast, \.saturation, \.rotation, \.crop\]/);
  const recipe={schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:0,
    extendedParameters:{postDecodeAdjustments:{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{vibrance:12}}},
    processingOrder:['exposure','contrast','saturation','postDecodeAdjustments','rotation']}};
  assert.doesNotThrow(()=>validateRecipe(recipe));
  const missing=structuredClone(recipe);missing.parameters.processingOrder=missing.parameters.processingOrder.filter(s=>s!=='postDecodeAdjustments');
  assert.throws(()=>validateRecipe(missing));
});
