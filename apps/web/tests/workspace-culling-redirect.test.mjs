import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceCullingClient} from '../src/workspace-culling-client.mjs';

const workspaceId='18dccd9f-24aa-46b6-945d-32b7c4ff2a0a';
const projectId='dbfd14e5-4c4f-47fd-82e8-2a4c803cc21d';

test('CULLING-REDIRECT-01: bearer requests reject redirects without leaking to a followed location',async()=>{
  let called=0,options;
  const client=new WorkspaceCullingClient({baseURL:'https://workspace.example',
    tokenProvider:async()=> 'synthetic-test-token',
    fetchImpl:async(_url,init)=>{called++;options=init;
      return {ok:true,redirected:true,json:async()=>({})};}});
  await assert.rejects(()=>client.getProjectPage({workspaceId,projectId}),
    /CULLING_RESPONSE_REDIRECTED/);
  assert.equal(called,1);
  assert.equal(options.redirect,'error');
  assert.equal(options.cache,'no-store');
  assert.equal(options.referrerPolicy,'no-referrer');
  assert.equal(options.credentials,'omit');
  assert.equal(options.headers.Authorization,'Bearer synthetic-test-token');
});
