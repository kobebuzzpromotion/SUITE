import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCrossDeviceCompatReportUI} from '../src/cross-device-compat-report-ui.mjs';

class Node {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes=new Map();this.textContent='';this.removed=false;}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  removeAttribute(name){this.attributes.delete(name);}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  remove(){this.removed=true;}
}
const document={createElement:tag=>new Node(tag)};
const asset=(id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sha256='a'.repeat(64))=>({id,sha256});
const recipe=()=>({schemaVersion:1,parameters:{exposure:.2,contrast:1.1,saturation:1,
  rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
const state=(overrides={})=>{
  const current={asset:asset(),revision:1,recipe:recipe(),dirty:false,
    busy:false,exporting:false,pending:false,blocked:false,...overrides};
  return {assets:current.asset?[current.asset]:[],...current};
};
const findings=ui=>ui.element.children[3].children.map(row=>[row.textContent,row.attributes.get('data-assessment')]);

test('CROSS-DEVICE-REPORT-01: saved selected revision renders individual data-only findings, never an operation',()=>{
  const ui=createCrossDeviceCompatReportUI({document});
  const outcome=ui.update(state());
  assert.equal(outcome.assetId,asset().id);
  assert.equal(outcome.originalSHA256,asset().sha256);
  assert.equal(outcome.revision,1);
  assert.equal(outcome.assessment,'supported');
  assert.equal(outcome.operationAllowed,false);
  assert.equal(ui.element.attributes.get('data-asset-id'),asset().id);
  assert.equal(ui.element.attributes.get('data-revision'),'1');
  assert.deepEqual(findings(ui).map(row=>row[1]),Array(5).fill('supported'));
  assert.match(ui.element.children[2].textContent,/data-only.*認証・転送・iPad描画は未検証/);
  assert.equal(ui.element.children[2].attributes.get('aria-live'),'polite');
  assert.equal(ui.element.children.flatMap(node=>node.children).some(node=>node.tagName==='BUTTON'),false);
  assert.throws(()=>createCrossDeviceCompatReportUI(),/CROSS_DEVICE_REPORT_DOCUMENT_REQUIRED/);
});

test('CROSS-DEVICE-REPORT-02: supported/unverified/unsupported remain distinct, body or revision change replaces all old findings',()=>{
  const ui=createCrossDeviceCompatReportUI({document});
  ui.update(state());
  const mixed=recipe();
  mixed.parameters.extendedParameters.postDecodeAdjustments={detail:{sharpness:10}};
  mixed.parameters.extendedParameters.crop={crop_rect:{x:0,y:0,width:1,height:1}};
  mixed.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  mixed.parameters.processingOrder.push('crop');
  const outcome=ui.update(state({revision:2,recipe:mixed}));
  assert.equal(outcome.assessment,'unsupported');
  assert.equal(ui.element.attributes.get('data-revision'),'2');
  assert.deepEqual(new Set(findings(ui).map(row=>row[1])),new Set(['supported','unverified','unsupported']));
  assert.equal(findings(ui).filter(row=>row[0].includes('postDecodeAdjustments')).length,2);
  assert.match(ui.element.children[2].textContent,/r2/);
  const next=ui.update(state({asset:asset('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b'.repeat(64)),revision:1}));
  assert.equal(next.assetId,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(ui.element.attributes.get('data-asset-id'),next.assetId);
  assert.equal(findings(ui).length,5);
  assert.equal(findings(ui).some(row=>row[0].includes('crop')),false);
});

test('CROSS-DEVICE-REPORT-03: dirty, expired, processing, missing or malformed saved state clears stale assessment',()=>{
  const ui=createCrossDeviceCompatReportUI({document});
  for(const invalid of [{dirty:true},{blocked:true},{busy:'rendering'},{exporting:true},{pending:true},
    {asset:null},{asset:asset(asset().id,'0')},{assets:[]},{assets:[asset(asset().id,'b'.repeat(64))]},
    {revision:0},
    {recipe:{...recipe(),parameters:{...recipe().parameters,extendedParameters:{future:{value:1}}}}}]){
    ui.update(state());
    assert.equal(ui.update(state(invalid)),null);
    assert.equal(findings(ui).length,0);
    assert.equal(ui.element.attributes.has('data-asset-id'),false);
    assert.equal(ui.element.attributes.has('data-revision'),false);
    assert.doesNotMatch(ui.element.children[2].textContent,/総合: supported/);
  }
  ui.destroy();
  assert.equal(ui.element.removed,true);
  assert.equal(ui.update(state()),null);
});

test('CROSS-DEVICE-REPORT-04: product Editor mounts read-only UI on save path and refreshes it from current access and session state',async()=>{
  const editor=await readFile(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
  assert.match(editor,/createCrossDeviceCompatReportUI\(\{document\}\)/);
  assert.match(editor,/byID\('save-section'\)\.after\(crossDeviceReport\.element\)/);
  assert.match(editor,/crossDeviceReport\.update\(\{\.\.\.state,pending,blocked:Boolean\(invalidSession\|\|access\.reason\(\)\|\|endedCodes\.includes\(state\.error\)\)\}\)/);
  assert.match(editor,/additionalDisposers\.push\(crossDeviceReport\.destroy\)/);
});
