import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const proof=json('docs/ADDITIONAL_SOURCE_PRESERVATION.json');
for(const file of [...proof.files,proof.chatPart3,proof.existing147Manifest])assert.equal(hash(file.file),file.sha256,file.file);
for(const file of proof.files)assert.equal(file.normalizedBodyMatches,true,file.file);
const counts={};
for(const [file,prefix,count] of [['docs/CROP_REQUIREMENTS.json','CROP',16],['docs/WORKSPACE_REQUIREMENTS.json','WS',45]]){
  const rows=json(file).requirements;assert.equal(rows.length,count);assert.equal(new Set(rows.map(r=>r.id)).size,count);
  for(let i=0;i<count;i++){
    const row=rows[i];assert.equal(row.id,prefix+'-'+String(i+1).padStart(2,'0'));
    assert.equal(row.section,i+1);assert.ok(row.title&&row.status&&row.limitations&&row.evidence);
    for(const path of [row.source,...row.design,...row.implementationPaths,...row.testFiles])assert.ok(existsSync(path),row.id+' '+path);
  }
  counts[prefix]=count;
}
assert.equal(json('docs/requirements.json').requirements.length,147);
const pricing=json('docs/PRICING_REQUIREMENTS.json').requirements;
assert.equal(pricing.length,28);
for(let i=0;i<28;i++){
  const row=pricing[i];assert.equal(row.id,'PRICE-'+String(i+1).padStart(2,'0'));assert.equal(row.section,i+1);
  assert.equal(row.acceptance,'NOT_PASSED');for(const path of [row.source,...row.design,...row.implementationPaths,...row.testFiles])assert.ok(existsSync(path),path);
}
counts.PRICE=28;
console.log(JSON.stringify({status:'PASS_SOURCE_TRACE_INTEGRITY_ONLY',counts,existing147:'UNCHANGED',sourceBodies:proof.files.length,featureAcceptance:'NOT_PASSED'},null,2));
