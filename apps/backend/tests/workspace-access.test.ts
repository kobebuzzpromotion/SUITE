import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorkspaceAccessGrants, type GrantScope} from '../src/workspace-access.js';

test('WG01 authenticated gateway grants bind subject workspace asset purpose and expire across reopen', async () => {
  const root=await mkdtemp(join(tmpdir(),'suite-grant-test-')), file=join(root,'grants.sqlite');
  let now=100000, calls=0;
  let grants=new WorkspaceAccessGrants(file,()=>{calls++;},()=>now);
  const scope:GrantScope={userId:'u1',workspaceId:'w1',assetId:'a1',purpose:'final-jpeg'};
  try {
    const grant=grants.issue(scope,2);assert.equal(grants.verify(scope,grant.token).authorized,true);
    for(const change of [{userId:'u2'},{workspaceId:'w2'},{assetId:'a2'},{purpose:'final-tiff' as const}])assert.throws(()=>grants.verify({...scope,...change},grant.token),/REJECTED/);
    grants.close();grants=new WorkspaceAccessGrants(file,()=>{calls++;},()=>now);
    assert.equal(grants.verify(scope,grant.token).authorized,true);
    now=grant.expiresAt;assert.throws(()=>grants.verify(scope,grant.token),/REJECTED/);
    assert.throws(()=>grants.issue(scope,301),/INVALID_GRANT/);
    assert.throws(()=>grants.issue({...scope,purpose:'library'},60),/INVALID_GRANT/);
    assert.ok(calls>=9);assert.equal((await readFile(file)).includes(Buffer.from(grant.token)),false);
  } finally {grants.close();await rm(root,{recursive:true,force:true});}
});
test('WG02 live membership revoke defeats an unexpired gateway grant and invalid tokens fail closed', async () => {
  const root=await mkdtemp(join(tmpdir(),'suite-grant-test-'));let active=true;
  const grants=new WorkspaceAccessGrants(join(root,'grants.sqlite'),()=>{if(!active)throw new Error('FORBIDDEN');});
  const scope:GrantScope={userId:'u1',workspaceId:'w1',assetId:'a1',purpose:'high-precision'};
  try {
    const grant=grants.issue(scope,300);assert.throws(()=>grants.verify(scope,'not-a-token'),/REJECTED/);
    active=false;assert.throws(()=>grants.verify(scope,grant.token),/FORBIDDEN/);
    assert.throws(()=>grants.issue(scope,60),/FORBIDDEN/);
  } finally {grants.close();await rm(root,{recursive:true,force:true});}
});
