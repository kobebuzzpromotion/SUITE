import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExportSizeSelection,parseExportResolutionSelection,canStartConfiguredExport} from '../src/editor-ui.mjs';
import {planExportDimensions} from '../src/export-size.mjs';
import {writeExportResolutionBlob,readExportResolution} from '../src/export-resolution.mjs';

test('export UI retains five existing sizes and adds long edge, short edge and dimensions',()=>{
  assert.deepEqual(parseExportSizeSelection('original'),{kind:'original'});
  assert.deepEqual(parseExportSizeSelection('percentage',{value:'50'}),{kind:'percentage',value:50});
  assert.deepEqual(parseExportSizeSelection('width',{value:'400'}),{kind:'width',value:400});
  assert.deepEqual(parseExportSizeSelection('height',{value:'300'}),{kind:'height',value:300});
  assert.deepEqual(parseExportSizeSelection('fit',{width:'400',height:'300'}),{kind:'fit',width:400,height:300});
  for(const kind of ['long-edge','short-edge'])assert.deepEqual(parseExportSizeSelection(kind,{value:'400'}),{kind,value:400});
  assert.deepEqual(parseExportSizeSelection('dimensions',{width:'400',height:'300'}),{kind:'dimensions',width:400,height:300});
  const source={width:800,height:600};
  for(const settings of [parseExportSizeSelection('long-edge',{value:'400'}),parseExportSizeSelection('short-edge',{value:'300'}),parseExportSizeSelection('dimensions',{width:'400',height:'300'})]){
    const plan=planExportDimensions(source,settings);assert.deepEqual([plan.width,plan.height],[400,300]);
  }
});

test('export UI rejects missing, fractional, oversized or invented pixel settings before Final',()=>{
  for(const [kind,fields] of [['long-edge',{}],['short-edge',{value:'0'}],['dimensions',{width:'400'}],['dimensions',{width:'400',height:'1.5'}],['percentage',{value:'101'}],['width',{value:'16385'}],['fit',{width:'1e3',height:'300'}],['stretch',{width:'400',height:'300'}]])
    assert.throws(()=>parseExportSizeSelection(kind,fields));
  assert.throws(()=>planExportDimensions({width:100,height:80},parseExportSizeSelection('long-edge',{value:'200'})),/EXPORT_SIZE_EDGE_INVALID/);
});

test('PPI/PPC UI remains separate metadata and reaches an actual encoded PNG Blob',async()=>{
  const original=new Blob([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAOSURBVBhXY/jPwABC/wEP+QP98+IdQAAAAABJRU5ErkJggg==','base64'))],{type:'image/png'});
  assert.equal(parseExportResolutionSelection('none',''),undefined);
  const resolution=parseExportResolutionSelection('ppi','300');
  assert.deepEqual(resolution,{unit:'ppi',value:300});
  const final=await writeExportResolutionBlob(original,resolution);
  assert.deepEqual(readExportResolution(new Uint8Array(await final.arrayBuffer()),'png'),{format:'png',width:2,height:1,unit:'ppm',x:11811,y:11811});
  assert.deepEqual(parseExportResolutionSelection('ppc','120'),{unit:'ppc',value:120});
  for(const [unit,value] of [['ppi',''],['ppc','0'],['ppi','1.5'],['ppi','65536'],['dpi','300']])assert.throws(()=>parseExportResolutionSelection(unit,value));
});

test('UI blocks Export when unsaved, busy, expired or missing a photo',()=>{
  const ready={asset:{id:'a'},revision:1,dirty:false,busy:null,exporting:false};
  assert.equal(canStartConfiguredExport(ready),true);
  for(const changed of [{asset:null},{revision:0},{dirty:true},{busy:'saving'},{exporting:true}])assert.equal(canStartConfiguredExport({...ready,...changed}),false);
  assert.equal(canStartConfiguredExport(ready,{pending:true}),false);
  assert.equal(canStartConfiguredExport(ready,{blocked:true}),false);
});
