import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createManualCullingProject,setManualCullingMark,
  changeManualCullingTag,addManualCullingSegment,moveManualCullingAsset,
  filterManualCullingAssets} from '../src/smart-culling-project.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const source=path=>readFile(resolve(root,path),'utf8');

test('SMART-CULLING-AUDIT01: manual Project marks are deterministic, not AI selections',()=>{
  const asset={id:'asset-a',tenantId:'workspace-a',deletedAt:null};
  let state=createManualCullingProject({workspaceId:'workspace-a',projectId:'project-a',assets:[asset]});
  state=setManualCullingMark(state,asset.id,{selected:true,rating:5,flag:'pick',colorLabel:'Blue'});
  state=changeManualCullingTag(state,asset.id,'proof',true);
  state=addManualCullingSegment(state,{id:'story-1',name:'Opening'});
  state=moveManualCullingAsset(state,asset.id,'story-1');
  assert.deepEqual(filterManualCullingAssets(state,{mode:'and',minRating:5,tag:'proof',segmentId:'story-1'}),[asset.id]);
  assert.deepEqual(Object.keys(state.marks[0]).sort(),['assetId','colorLabel','flag','rating','selected','tags']);
  assert.equal(Object.hasOwn(state,'aiScore'),false);
  assert.equal(Object.hasOwn(state,'analysisStatus'),false);
});

test('SMART-CULLING-AUDIT02: current Node manual route exists; public product wiring is absent (gap snapshot)',async()=>{
  const [node,backend,hostMount,bootstrap,editor,author,trial,sites,cloud,schema]=await Promise.all([
    'apps/backend/src/workspace-server.ts','apps/backend/src/workspace.ts',
    'apps/web/src/workspace-culling-verified-mount.mjs','apps/web/src/bootstrap.mjs',
    'apps/web/src/editor-ui.mjs','apps/web/src/author-ui.mjs',
    'apps/web/src/trial-client.mjs','apps/web/src/sites-client.mjs',
    'apps/sites/src/worker.mjs','apps/sites/db/schema.ts'].map(source));
  assert.match(node,/action==='culling'/u);
  assert.match(backend,/CREATE TABLE IF NOT EXISTS ws_culling_marks/u);
  assert.match(hostMount,/mountWorkspaceCullingPanel/u);
  for(const [name,text] of [['bootstrap',bootstrap],['editor',editor],['author',author],
    ['TrialClient',trial],['SitesClient',sites],['Cloud worker',cloud],['D1 schema',schema]])
    assert.doesNotMatch(text,/mountVerifiedWorkspaceCulling|WorkspaceCullingClient|ws_culling_|\/culling(?:\/|\b)/u,
      `${name} has no Culling product route in this audit snapshot`);
});

test('SMART-CULLING-AUDIT03: candidate inventory contains 27 distinct suboperations, not 27 completed features',async()=>{
  const matrix=await source('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  const rows=matrix.split(/\r?\n/u).filter(line=>/^\| EV3-0(?:89[4-9]|9(?:0\d|1\d|20)) \|/u.test(line));
  assert.equal(rows.length,27);
  assert.ok(rows.some(line=>line.includes('EV3-0905')&&line.includes('Quality filter')));
  assert.ok(rows.some(line=>line.includes('EV3-0919')&&line.includes('XMP marks')));
});
