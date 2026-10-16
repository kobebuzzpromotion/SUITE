import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FEATURE_CATALOG,LIGHTROOM_SECTIONS,missingFeatureTypes} from '../src/feature-catalog.mjs';

test('FEATURE-INDEX01: every Evoto audit row is present in the browser inventory without a duplicate ID',()=>{
  const source=JSON.parse(readFileSync(new URL('../../../docs/EVOTO_AUDIT/evoto-deep-audit.json',import.meta.url)));
  const output=JSON.parse(readFileSync(new URL('../../../dist/web/runtime_assets/evoto-feature-inventory.json',import.meta.url)));
  assert.equal(source.rows.length,1100);assert.equal(output.rows.length,source.rows.length);
  assert.equal(output.kind,'AUDIT_CANDIDATES_NOT_IMPLEMENTATION_CLAIMS');
  assert.deepEqual(output.rows.map(row=>row.id),source.rows.map(row=>row.id));
  assert.equal(new Set(output.rows.map(row=>row.id)).size,1100);
});

test('FEATURE-INDEX02: missing controls stay visible and distinctly unavailable',()=>{
  const groups=new Set(FEATURE_CATALOG.map(group=>group.group));
  for(const name of ['RAW color','Light','Curve','Color','Detail','Optics','Masks','Portrait','Cleanup and AI','Workflow','Output'])assert.ok(groups.has(name));
  assert.ok(FEATURE_CATALOG.some(group=>group.items.some(([name,status])=>name.includes('Face Brightness')&&status==='PRIVACY_REVIEW_REQUIRED')));
  assert.ok(LIGHTROOM_SECTIONS.length>=15);
  for(const name of ['Exposure','Contrast','Highlights','Shadows','Whites','Blacks','Saturation','Vibrance','Clarity','Texture','Face Brightness','TIFF']){
    assert.ok(FEATURE_CATALOG.some(group=>group.items.some(([label])=>label===name)),`${name} must have its own UI row`);
  }
});

test('FEATURE-INDEX03: only deduplicated feature types enter existing adjustment categories',()=>{
  const rows=JSON.parse(readFileSync(new URL('../../../dist/web/runtime_assets/evoto-feature-inventory.json',import.meta.url))).rows;
  const result=missingFeatureTypes(rows);
  assert.equal(result.items.length,137);assert.equal(result.items.filter(item=>item.source==='Evoto').length,119);
  assert.equal(result.items.filter(item=>item.source==='Lightroom').length,18);
  assert.equal(result.supplement.length,50);
  assert.equal(new Set(result.items.map(item=>item.id)).size,result.items.length);
  assert.ok(result.items.every(item=>item.name&&item.category&&['未接続','一部のみ','停止中'].includes(item.status)));
  assert.ok(result.items.some(item=>item.name==='HSL'&&item.category==='HSL'));
});
