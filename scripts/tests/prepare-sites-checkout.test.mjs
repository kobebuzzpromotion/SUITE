import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectLocalBuild,prepareSitesCheckout} from '../prepare-sites-checkout.mjs';

const root=resolve(import.meta.dirname,'../..');

test('local Site preparation copies the required source and aligned Worker/client, with all live gates unrun',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'suite-sites-prepare-')),output=join(parent,'candidate');
  try{
    const inspected=inspectLocalBuild(root);
    assert.deepEqual(inspected.logicalBindings,{d1:'DB',r2:'BUCKET',assets:'ASSETS'});
    assert.equal(inspected.localDatabaseId,'local-not-production');
    const evidence=prepareSitesCheckout({root,output});
    const persisted=JSON.parse(await readFile(join(output,'PREP_EVIDENCE.json'),'utf8'));
    assert.deepEqual(persisted,evidence);
    assert.equal(evidence.status,'LOCAL_PACKAGE_PREPARED_NOT_DEPLOYABLE');
    assert.equal(evidence.gates.deployment,'NOT_RUN');
    assert.equal(evidence.gates.actualD1Binding,'NOT_RUN');
    assert.equal(evidence.gates.actualR2Binding,'NOT_RUN');
    assert.equal(evidence.gates.selectedSiteProjectId,'MISSING_NOT_WRITTEN');
    assert.equal(evidence.gates.sourceArtifactSameBuild,'NOT_PROVEN');
    assert.equal(evidence.localChecks.databaseId,'LOCAL_PLACEHOLDER_NOT_PRODUCTION');
    assert.ok(evidence.source.files.some(file=>file.path==='package-lock.json'));
    assert.ok(evidence.source.files.some(file=>file.path==='apps/sites/src/worker.mjs'));
    assert.ok(evidence.artifact.files.some(file=>file.path==='dist/server/index.js'));
    assert.ok(evidence.artifact.files.some(file=>file.path==='dist/client/app.js'));
    assert.ok(evidence.artifact.files.some(file=>file.path==='drizzle/0002_suite_sites.sql'));
    assert.ok((await stat(join(output,'NON_DEPLOYABLE_CANDIDATE/dist/server/index.js'))).size>0);
    assert.doesNotMatch(JSON.stringify(evidence),/appgprj_/);
    assert.throws(()=>prepareSitesCheckout({root,output}),/PREP_OUTPUT_EXISTS/);
  }finally{await rm(parent,{recursive:true,force:true});}
});

test('missing local build/source refuses before any output is created',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'suite-sites-prepare-missing-')),fixture=join(parent,'fixture'),output=join(parent,'candidate');
  try{
    await mkdir(fixture);
    assert.throws(()=>prepareSitesCheckout({root:fixture,output}),/PREP_MISSING:package\.json/);
    await assert.rejects(stat(output),{code:'ENOENT'});
  }finally{await rm(parent,{recursive:true,force:true});}
});

test('output anywhere under SUITE root is refused before inspection or copying',async()=>{
  for(const output of [root,join(root,'dist','web','nested-candidate'),join(root,'scripts','nested-candidate')]){
    assert.throws(()=>prepareSitesCheckout({root,output}),/PREP_OUTPUT_UNSAFE/);
  }
});

test('nested symlink in an allowlisted source tree is refused before output creation',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'suite-sites-prepare-link-'));
  const fixture=join(parent,'fixture'),output=join(parent,'candidate'),target=join(parent,'outside');
  try{
    await mkdir(join(fixture,'contracts'),{recursive:true});
    await mkdir(target);
    for(const name of ['package.json','package-lock.json','tsconfig.json'])await writeFile(join(fixture,name),'{}');
    await symlink(target,join(fixture,'contracts','nested-link'),'junction');
    assert.throws(()=>prepareSitesCheckout({root:fixture,output}),/PREP_SYMLINK/);
    await assert.rejects(stat(output),{code:'ENOENT'});
  }finally{await rm(parent,{recursive:true,force:true});}
});

test('CLI reports prepared local evidence with a blocking exit status',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'suite-sites-prepare-cli-')),output=join(parent,'candidate');
  try{
    const cli=fileURLToPath(new URL('../prepare-sites-checkout.mjs',import.meta.url));
    const result=spawnSync(process.execPath,[cli,'--root',root,'--output',output],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,2,result.stderr);
    assert.equal(JSON.parse(result.stdout).status,'LOCAL_PACKAGE_PREPARED_NOT_DEPLOYABLE');
    assert.equal(JSON.parse(await readFile(join(output,'PREP_EVIDENCE.json'),'utf8')).gates.deployment,'NOT_RUN');
  }finally{await rm(parent,{recursive:true,force:true});}
});
