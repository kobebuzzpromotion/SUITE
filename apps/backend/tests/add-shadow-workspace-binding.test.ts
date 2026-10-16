import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {WorkspaceRepository} from '../src/workspace.js';
import type {Asset} from '../src/repository.js';

const owner={userId:'owner'},editor={userId:'editor'};
const targetID='11111111-1111-4111-8111-111111111111';
const backdropID='22222222-2222-4222-8222-222222222222';
const foreignID='33333333-3333-4333-8333-333333333333';
const targetSHA='a'.repeat(64),backdropSHA='b'.repeat(64);
const baseRecipe=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,
  saturation:1,rotationDegrees:0,extendedParameters:{},
  processingOrder:['exposure','contrast','saturation','rotation']}});
function shadowRecipe(binding={assetID:targetID,originalSHA256:targetSHA,
  sourceWidth:16,sourceHeight:16,backdropID,backdropSHA256:backdropSHA}){
  const body=baseRecipe();
  body.parameters.extendedParameters={addShadowManual:{schemaVersion:1,
    engineVersion:'suite-srgb8-explicit-mask-shadow-1',binding,
    subjectStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.1,
      hardness:1}],settings:{mode:'drop',opacity:80,blur:0,gradient:0,
      blend:'normal',offsetX:2,offsetY:1,shadowColor:[0,0,0]}}};
  return body;
}
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-shadow-workspace-'));
  const dbPath=join(root,'workspace.sqlite'),assets=new Map<string,Asset>();
  const lookup=(wid:string,id:string)=>{
    const asset=assets.get(`${wid}:${id}`);
    if(!asset)throw Error('ASSET_NOT_FOUND');return asset;
  };
  const repo=new WorkspaceRepository(dbPath,lookup);
  const workspace=repo.createWorkspace(owner,'Studio');
  const project=repo.createProject(owner,workspace.id,'Subjects');
  const backdropProject=repo.createProject(owner,workspace.id,'Backdrops');
  const foreignWorkspace=repo.createWorkspace(owner,'Other Studio');
  const foreignProject=repo.createProject(owner,foreignWorkspace.id,'Foreign');
  function register(wid:string,pid:string,id:string,sha:string){
    const asset:Asset={id,tenantId:wid,name:'Original',originalKey:`original/${wid}/${id}`,
      sha256:sha,size:4,cloudSafe:true,deletedAt:null};
    assets.set(`${wid}:${id}`,asset);repo.registerAsset(owner,wid,pid,id);return asset;
  }
  const target=register(workspace.id,project.id,targetID,targetSHA);
  const backdrop=register(workspace.id,backdropProject.id,backdropID,backdropSHA);
  register(foreignWorkspace.id,foreignProject.id,foreignID,backdropSHA);
  return {root,dbPath,repo,assets,workspace,project,backdropProject,
    foreignWorkspace,target,backdrop,cleanup:async()=>{
      repo.close();const path=resolve(root),temp=resolve(tmpdir());
      if(!path.startsWith(temp+sep)||!path.split(sep).at(-1)?.startsWith('suite-shadow-workspace-'))
        throw Error('UNSAFE_TEST_CLEANUP');
      await rm(path,{recursive:true,force:true});}};
}

test('SHADOW-WS-01: same-Workspace registered backdrop in another Project saves/reloads without changing Original or old Recipe',async()=>{
  const f=await fixture();try{
    const neutral=f.repo.saveRecipe(owner,f.workspace.id,f.project.id,targetID,
      {baseVersion:0,body:baseRecipe()});
    assert.equal(neutral.outcome,'saved');
    const originalBefore={target:{...f.target},backdrop:{...f.backdrop}};
    const saved=f.repo.saveRecipe(owner,f.workspace.id,f.project.id,targetID,
      {baseVersion:1,body:shadowRecipe()});
    assert.equal(saved.outcome,'saved');
    assert.deepEqual(saved.version.body,shadowRecipe());
    assert.deepEqual(f.repo.latestRecipe(owner,f.workspace.id,f.project.id,targetID),saved.version);
    assert.deepEqual(f.repo.recipeHistory(owner,f.workspace.id,f.project.id,targetID)
      .map(item=>item.version),[1,2]);
    assert.deepEqual({target:f.target,backdrop:f.backdrop},originalBefore);
  }finally{await f.cleanup();}
});

test('SHADOW-WS-02: target mismatch, foreign/unregistered/deleted backdrop, altered SHA and revoked editor fail before commit',async()=>{
  const f=await fixture();try{
    const save=(body:unknown)=>f.repo.saveRecipe(owner,f.workspace.id,f.project.id,
      targetID,{baseVersion:0,body});
    assert.throws(()=>save(shadowRecipe({assetID:backdropID,
      originalSHA256:targetSHA,sourceWidth:16,sourceHeight:16,
      backdropID:targetID,backdropSHA256:backdropSHA})),
    /INVALID_ADD_SHADOW_MANUAL_BINDING/);
    assert.throws(()=>save(shadowRecipe({assetID:targetID,
      originalSHA256:'c'.repeat(64),sourceWidth:16,sourceHeight:16,
      backdropID,backdropSHA256:backdropSHA})),
    /INVALID_ADD_SHADOW_MANUAL_BINDING/);
    const foreign=shadowRecipe({assetID:targetID,originalSHA256:targetSHA,
      sourceWidth:16,sourceHeight:16,backdropID:foreignID,backdropSHA256:backdropSHA});
    assert.throws(()=>save(foreign),/ADD_SHADOW_BACKGROUND_NOT_FOUND/);
    assert.throws(()=>save(shadowRecipe({assetID:targetID,
      originalSHA256:targetSHA,sourceWidth:16,sourceHeight:16,
      backdropID:'44444444-4444-4444-8444-444444444444',
      backdropSHA256:backdropSHA})),/ADD_SHADOW_BACKGROUND_NOT_FOUND/);
    assert.throws(()=>save(shadowRecipe({assetID:targetID,
      originalSHA256:targetSHA,sourceWidth:16,sourceHeight:16,
      backdropID,backdropSHA256:'c'.repeat(64)})),
    /ADD_SHADOW_BACKGROUND_IDENTITY_CHANGED/);
    f.repo.trashAsset(owner,f.workspace.id,f.backdropProject.id,backdropID);
    assert.throws(()=>save(shadowRecipe()),/ADD_SHADOW_BACKGROUND_NOT_FOUND/);
    assert.equal(f.repo.latestRecipe(owner,f.workspace.id,f.project.id,targetID),null);
    f.repo.restoreAsset(owner,f.workspace.id,f.backdropProject.id,backdropID);
    const changed={...f.backdrop,sha256:'c'.repeat(64)};
    f.assets.set(`${f.workspace.id}:${backdropID}`,changed);
    assert.throws(()=>save(shadowRecipe()),/ADD_SHADOW_BACKGROUND_IDENTITY_CHANGED/);
    f.assets.set(`${f.workspace.id}:${backdropID}`,f.backdrop);
    const invitation=f.repo.inviteMember(owner,f.workspace.id,{email:'editor@example.com',
      role:'EDITOR',expiresAt:new Date(Date.now()+600000).toISOString()});
    f.repo.acceptInvitation(editor,f.workspace.id,invitation.token,'editor@example.com');
    f.repo.removeMember(owner,f.workspace.id,'editor');
    assert.throws(()=>f.repo.saveRecipe(editor,f.workspace.id,f.project.id,targetID,
      {baseVersion:0,body:shadowRecipe()}),/FORBIDDEN/);
    assert.equal(f.repo.latestRecipe(owner,f.workspace.id,f.project.id,targetID),null);
  }finally{await f.cleanup();}
});

test('SHADOW-WS-03: deleted backdrop or corrupt historical reference blocks reload and next CAS write',async()=>{
  const f=await fixture();try{
    const saved=f.repo.saveRecipe(owner,f.workspace.id,f.project.id,targetID,
      {baseVersion:0,body:shadowRecipe()});
    assert.equal(saved.version.version,1);
    f.repo.trashAsset(owner,f.workspace.id,f.backdropProject.id,backdropID);
    assert.throws(()=>f.repo.recipeHistory(owner,f.workspace.id,f.project.id,targetID),
      /ADD_SHADOW_BACKGROUND_NOT_FOUND/);
    assert.throws(()=>f.repo.latestRecipe(owner,f.workspace.id,f.project.id,targetID),
      /ADD_SHADOW_BACKGROUND_NOT_FOUND/);
    assert.throws(()=>f.repo.saveRecipe(owner,f.workspace.id,f.project.id,targetID,
      {baseVersion:1,body:baseRecipe()}),/ADD_SHADOW_BACKGROUND_NOT_FOUND/);
    f.repo.restoreAsset(owner,f.workspace.id,f.backdropProject.id,backdropID);
    const db=new DatabaseSync(f.dbPath);
    try{
      db.prepare(`INSERT INTO ws_recipe_versions(id,workspace_id,project_id,asset_id,
        version,parent_version,editor_user_id,created_at,branch,body,changed_fields,preset_snapshot)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(randomUUID(),f.workspace.id,
        f.project.id,targetID,2,1,'owner',new Date().toISOString(),1,
        JSON.stringify(shadowRecipe({assetID:targetID,originalSHA256:targetSHA,
          sourceWidth:16,sourceHeight:16,backdropID:foreignID,
          backdropSHA256:backdropSHA})),JSON.stringify([]));
    }finally{db.close();}
    assert.throws(()=>f.repo.getRecipeVersion(owner,f.workspace.id,f.project.id,
      targetID,1),/ADD_SHADOW_BACKGROUND_NOT_FOUND/);
    assert.throws(()=>f.repo.latestRecipe(owner,f.workspace.id,f.project.id,targetID),
      /ADD_SHADOW_BACKGROUND_NOT_FOUND/);
    assert.throws(()=>f.repo.saveRecipe(owner,f.workspace.id,f.project.id,targetID,
      {baseVersion:1,body:baseRecipe()}),/ADD_SHADOW_BACKGROUND_NOT_FOUND/);
  }finally{await f.cleanup();}
});

test('SHADOW-WS-04: Personal/Workspace Preset create/update/legacy apply cannot carry photo-bound shadow',async()=>{
  const f=await fixture();try{
    for(const scope of ['PERSONAL','WORKSPACE'] as const)
      assert.throws(()=>f.repo.createPreset(owner,f.workspace.id,
        {scope,name:'Bound',body:shadowRecipe()}),/PHOTO_BOUND_ADD_SHADOW_PRESET_FORBIDDEN/);
    assert.deepEqual(f.repo.listPresets(owner,f.workspace.id),[]);
    const preset=f.repo.createPreset(owner,f.workspace.id,
      {scope:'WORKSPACE',name:'Neutral',body:baseRecipe()});
    assert.throws(()=>f.repo.updatePreset(owner,f.workspace.id,preset.id,
      {baseVersion:1,name:'Bound update',body:shadowRecipe()}),
    /PHOTO_BOUND_ADD_SHADOW_PRESET_FORBIDDEN/);
    assert.equal(f.repo.getPreset(owner,f.workspace.id,preset.id).version,1);
    assert.throws(()=>f.repo.saveRecipe(owner,f.workspace.id,f.project.id,targetID,
      {baseVersion:0,body:shadowRecipe(),presetId:preset.id}),
    /PHOTO_BOUND_ADD_SHADOW_PRESET_FORBIDDEN/);
    const db=new DatabaseSync(f.dbPath);
    try{
      db.prepare(`INSERT INTO ws_preset_versions(preset_id,version,name,body,
        editor_user_id,created_at) VALUES(?,2,?,?,?,?)`).run(preset.id,
        'Legacy bound',JSON.stringify(shadowRecipe()),owner.userId,new Date().toISOString());
      db.prepare('UPDATE ws_presets SET current_version=2 WHERE id=?').run(preset.id);
    }finally{db.close();}
    assert.throws(()=>f.repo.applyPreset(owner,f.workspace.id,f.project.id,targetID,
      0,preset.id,2),/PHOTO_BOUND_ADD_SHADOW_PRESET_FORBIDDEN/);
    assert.equal(f.repo.latestRecipe(owner,f.workspace.id,f.project.id,targetID),null);
  }finally{await f.cleanup();}
});
