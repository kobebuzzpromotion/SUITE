import test from 'node:test';
import assert from 'node:assert/strict';
import {createExportOutputAdjustmentsForm} from '../src/export-output-adjustments-ui.mjs';

class Node {
  constructor(tag,document){this.tagName=tag.toUpperCase();this.ownerDocument=document;
    this.children=[];this.attributes=new Map();this.listeners=new Map();this.value='';
    this.checked=false;this.disabled=false;this.textContent='';}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  append(...children){this.children.push(...children);}
  addEventListener(type,handler){const list=this.listeners.get(type)??[];list.push(handler);this.listeners.set(type,list);}
  focus(){this.ownerDocument.activeElement=this;}
  remove(){this.removed=true;}
  async emit(type,properties={}){const event={type,preventDefault(){this.defaultPrevented=true;},...properties};
    for(const handler of this.listeners.get(type)??[])await handler(event);return event;}
}
const document=()=>({activeElement:null,createElement(tag){return new Node(tag,this);},
  createTextNode(text){const node=new Node('#text',this);node.textContent=text;return node;}});
const all=node=>[node,...node.children.flatMap(all)];
const field=(form,name)=>all(form).find(node=>node.getAttribute('name')===name);
const radio=(form,kind)=>all(form).find(node=>node.getAttribute('value')===kind);
const button=(form,type)=>all(form).find(node=>node.tagName==='BUTTON'&&node.getAttribute('type')===type);
const manual={kind:'manual',gain:1.25,radiusPx:2.5,thresholdLuma:8};

test('OUTPUT-READWRITE-01: strict setter and readback cover manual and none without invoking Final',()=>{
  const calls=[],view=createExportOutputAdjustmentsForm({document:document(),onApply:value=>calls.push(value)});
  assert.deepEqual(view.getSettings(),{kind:'none'});
  assert.deepEqual(view.setSettings(manual),manual);
  assert.deepEqual(view.getSettings(),manual);
  assert.equal(radio(view.element,'manual').checked,true);
  assert.equal(field(view.element,'gain').value,'1.25');
  assert.equal(field(view.element,'radiusPx').value,'2.5');
  assert.equal(field(view.element,'thresholdLuma').value,'8');
  assert.deepEqual(calls,[],'programmatic setting is never a Final submit');
  assert.deepEqual(view.setSettings({kind:'none'}),{kind:'none'});
  assert.deepEqual(view.getSettings(),{kind:'none'});
  assert.equal(radio(view.element,'none').checked,true);
  assert.equal(field(view.element,'gain').value,'1');
  assert.deepEqual(calls,[]);
});

test('OUTPUT-READWRITE-02: invalid external settings leave all draft controls unchanged',()=>{
  const view=createExportOutputAdjustmentsForm({document:document(),onApply(){}});
  view.setSettings(manual);
  for(const bad of [{kind:'screen-high'},{...manual,gain:3},{...manual,unknown:1},
    {kind:'manual',gain:1,radiusPx:1,thresholdLuma:NaN},
    {kind:'none',gain:1},Object.create({kind:'none'})]){
    assert.throws(()=>view.setSettings(bad));
    assert.deepEqual(view.getSettings(),manual);
    assert.equal(field(view.element,'gain').value,'1.25');
  }
});

test('OUTPUT-READWRITE-03: Cancel and Escape restore latest externally set baseline; only explicit submit exports',async()=>{
  const events=[],doc=document();
  const view=createExportOutputAdjustmentsForm({document:doc,onApply:value=>events.push(value),
    onCancel:()=>events.push('cancel')});
  view.setSettings(manual);
  field(view.element,'gain').value='1.9';
  await button(view.element,'button').emit('click');
  assert.deepEqual(view.getSettings(),manual);
  assert.equal(doc.activeElement,radio(view.element,'manual'));
  field(view.element,'thresholdLuma').value='16';
  const escape=await view.element.emit('keydown',{key:'Escape'});
  assert.equal(escape.defaultPrevented,true);
  assert.deepEqual(view.getSettings(),manual);
  assert.deepEqual(events,['cancel','cancel']);
  await view.element.emit('submit');
  assert.deepEqual(events,['cancel','cancel',manual]);
});

test('OUTPUT-READWRITE-04: disabled, pending and destroyed forms reject external writes',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve;});
  const view=createExportOutputAdjustmentsForm({document:document(),onApply:()=>pending});
  view.setDisabled(true);
  assert.throws(()=>view.setSettings(manual),/OUTPUT_SHARPENING_FORM_NOT_SETTABLE/);
  assert.deepEqual(view.getSettings(),{kind:'none'});
  view.setDisabled(false);
  const submission=view.element.emit('submit');
  assert.throws(()=>view.setSettings(manual),/OUTPUT_SHARPENING_FORM_NOT_SETTABLE/);
  finish();await submission;
  assert.deepEqual(view.setSettings(manual),manual);
  view.destroy();
  assert.throws(()=>view.setSettings({kind:'none'}),/OUTPUT_SHARPENING_FORM_NOT_SETTABLE/);
});
