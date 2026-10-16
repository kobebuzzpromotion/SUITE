import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {fileURLToPath} from 'node:url';

test('LOCAL-LEVELS-BROWSER-FIXTURE: synthetic Editor and shared Crop validator bundle for the browser',async()=>{
  const result=await build({
    entryPoints:[fileURLToPath(new URL('./fixtures/local-levels-browser.mjs',import.meta.url))],
    bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'silent'
  });
  assert.equal(result.outputFiles.length,1);
  const source=new TextDecoder().decode(result.outputFiles[0].contents);
  assert.ok(source.length>100_000);
  assert.match(source,/SHARED_CROP_VALIDATOR_REQUIRED/);
  assert.match(source,/Touch PointerEvent stroke/);
  assert.match(source,/setLocalLevels/);
  assert.match(source,/expandCanvasPixels/);
});
