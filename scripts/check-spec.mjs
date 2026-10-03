import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest = JSON.parse(await readFile('docs/requirements.json', 'utf8'));
for (const [source, count, prefix] of [['SUITE_SPEC.md',84,'SPEC'],['MOBILE_OVERRIDE.md',16,'MOBILE'],['ADDITIONAL_SPEC.md',23,'ADD'],['CLOUD_STORAGE_OVERRIDE.md',24,'CLOUD']]) {
  const text = await readFile('docs/' + source, 'utf8');
  const headings = [...text.replaceAll('\r\n','\n').matchAll(prefix === 'ADD' ? /⸻\n\n(\d+)\. ([^\n]+)/g : /^(\d+)\. ([^\n]+)\n=+$/gm)];
  assert.equal(headings.length, count, source + ' lost source sections');
  for (const [index, heading] of headings.entries()) {
    assert.equal(Number(heading[1]), index + 1);
    const id = prefix + '-' + String(index + 1).padStart(prefix === 'SPEC' ? 3 : 2, '0');
    const records = manifest.requirements.filter(item => item.id === id);
    assert.equal(records.length, 1, id + ' must appear once');
    assert.equal(records[0].title, heading[2]);
    for (const file of records[0].evidence) await access(file);
    assert.ok(records[0].implementation && records[0].tests && records[0].testEvidence, id + ' missing implementation/test/evidence mapping');
    for (const file of records[0].implementation.paths) await access(file);
    for (const file of records[0].tests.files) await access(file);
  }
}
const policy = await readFile('docs/MOBILE_RELEASE_FIRST.md', 'utf8');
assert.ok(policy.includes('MOBILE RELEASE > WEB RELEASE'));
assert.ok(policy.includes('Web完成はMobile Release Gateに含めない'));
assert.equal((policy.match(/^- \[ \]/gm) || []).length, 11);
assert.equal(manifest.requirements.length, 147);
assert.equal(new Set(manifest.requirements.map(r => r.id)).size, 147);
const lock = JSON.parse(await readFile('contracts/frozen.sha256.json', 'utf8'));
for (const entry of lock.files) {
  assert.equal(createHash('sha256').update(await readFile(entry.path)).digest('hex'), entry.sha256, entry.path + ' changed frozen contract; requires user authority');
}
console.log('PASS: 147 sections (84 basic + 16 mobile + 23 session + 24 cloud) retained and traced; 11 minimum release checks; Mobile > Web.');
console.log('PASS: frozen canonical contract hashes unchanged; each requirement maps implementation, test and evidence (unimplemented/unverified retained).');
