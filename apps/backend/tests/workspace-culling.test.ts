import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceRepository} from '../src/workspace.js';
import {WorkspaceHTTP} from '../src/workspace-server.js';
import {suiteServer} from '../src/server.js';
import {jwtAuthenticator} from '../src/auth.js';

const original = Buffer.from('SUITE manual culling metadata fixture, not RAW');
const sha256 = createHash('sha256').update(original).digest('hex');
const owner = {userId:'owner'}, editor = {userId:'editor'}, viewer = {userId:'viewer'};
const mark = (baseVersion:number, overrides:Record<string,unknown>={}) => ({baseVersion,rating:4,flag:'pick',colorLabel:'Blue',tags:['hero','proof'],segmentId:null,...overrides});
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-culling-db-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  let repo=new WorkspaceRepository(join(root,'workspace.sqlite'),(wid,aid,deleted)=>assets.get(wid,aid,deleted));
  const workspace=repo.createWorkspace(owner,'Culling Studio'), project=repo.createProject(owner,workspace.id,'Project A');
  const asset=assets.create(workspace.id,{name:'synthetic.bin',sha256,size:original.length});
  repo.registerAsset(owner,workspace.id,project.id,asset.id);
  const add=(userId:string,role:'EDITOR'|'VIEWER')=>{
    const invite=repo.inviteMember(owner,workspace.id,{email:`${userId}@example.test`,role,expiresAt:'2099-01-01T00:00:00.000Z'});
    repo.acceptInvitation({userId},workspace.id,invite.token,`${userId}@example.test`);
  };
  return {root,assets,workspace,project,asset,add,get repo(){return repo;},reopen(){repo.close();repo=new WorkspaceRepository(join(root,'workspace.sqlite'),(wid,aid,deleted)=>assets.get(wid,aid,deleted));},
    simulateLegacy(){
      repo.close();const db=new DatabaseSync(join(root,'workspace.sqlite'));
      db.exec('DROP TABLE ws_culling_assignments; DROP TABLE ws_culling_marks; DROP TABLE ws_culling_segments; DROP TABLE ws_culling_heads;');db.close();
      repo=new WorkspaceRepository(join(root,'workspace.sqlite'),(wid,aid,deleted)=>assets.get(wid,aid,deleted));
    },
    async close(){repo.close();assets.close();await rm(root,{recursive:true,force:true});}};
}

test('CULLING-DB01: CAS, restart, one-segment assignment and selection stay separate',async()=>{
  const f=await fixture();try{
    const {id:wid}=f.workspace,{id:pid}=f.project,aid=f.asset.id;
    assert.equal(f.repo.getCullingPage(owner,wid,pid).version,1);
    f.repo.saveSelection(owner,wid,pid,aid,{baseVersion:0,selected:true});
    const a=f.repo.createCullingSegment(owner,wid,pid,{baseVersion:1,id:'first',name:'Opening'});
    const b=f.repo.createCullingSegment(owner,wid,pid,{baseVersion:2,id:'second',name:'Final'});
    assert.equal(a.version,2);assert.equal(b.version,3);
    assert.throws(()=>f.repo.saveCullingMark(owner,wid,pid,aid,mark(2,{segmentId:'first'})),/CULLING_VERSION_CONFLICT/);
    const saved=f.repo.saveCullingMark(owner,wid,pid,aid,mark(3,{segmentId:'first'}));
    assert.equal(saved.version,4);assert.deepEqual(saved.mark.tags,['hero','proof']);
    f.repo.saveCullingMark(owner,wid,pid,aid,mark(4,{segmentId:'second'}));
    assert.equal(f.repo.getCullingMark(owner,wid,pid,aid).segmentId,'second');
    const order=f.repo.reorderCullingSegments(owner,wid,pid,{baseVersion:5,orderedIds:['second','first']});
    assert.deepEqual(order.segments.map(s=>s.id),['second','first']);
    f.reopen();
    assert.equal(f.repo.getCullingPage(owner,wid,pid).version,6);
    assert.equal(f.repo.getCullingMark(owner,wid,pid,aid).segmentId,'second');
    assert.equal(f.repo.getSelection(owner,wid,pid,aid)?.selected,true);
    assert.equal(f.repo.getSelection(owner,wid,pid,aid)?.version,1);
    assert.deepEqual(f.repo.getCullingPage(owner,wid,pid).segments.map(s=>s.id),['second','first']);
  }finally{await f.close();}
});

test('CULLING-DB02: tenant, Project, Asset, role, validation and soft-trash fail closed',async()=>{
  const f=await fixture();try{
    const {id:wid}=f.workspace,{id:pid}=f.project,aid=f.asset.id;
    f.add('editor','EDITOR');f.add('viewer','VIEWER');
    const otherProject=f.repo.createProject(owner,wid,'Project B');
    assert.throws(()=>f.repo.getCullingMark(owner,wid,otherProject.id,aid),/ASSET_NOT_FOUND/);
    const otherWorkspace=f.repo.createWorkspace({userId:'stranger'},'Other Tenant');
    assert.throws(()=>f.repo.getCullingPage(owner,otherWorkspace.id,pid),/FORBIDDEN/);
    assert.throws(()=>f.repo.getCullingPage({userId:'stranger'},wid,pid),/FORBIDDEN/);
    assert.throws(()=>f.repo.saveCullingMark(viewer,wid,pid,aid,mark(1)),/FORBIDDEN/);
    assert.throws(()=>f.repo.createCullingSegment(editor,wid,pid,{baseVersion:1,id:'x',name:'X'}),/FORBIDDEN/);
    for(const invalid of [mark(1,{rating:6}),mark(1,{tags:['same','same']}),mark(1,{flag:'AI'}),mark(1,{colorLabel:' bad'}),mark(1,{selected:true})])
      assert.throws(()=>f.repo.saveCullingMark(owner,wid,pid,aid,invalid),/INVALID_CULLING_INPUT/);
    assert.equal(f.repo.getCullingPage(owner,wid,pid).version,1);
    const saved=f.repo.saveCullingMark(editor,wid,pid,aid,mark(1));assert.equal(saved.version,2);
    f.repo.trashAsset(owner,wid,pid,aid);
    assert.deepEqual(f.repo.getCullingPage(owner,wid,pid).marks,[]);
    assert.throws(()=>f.repo.getCullingMark(owner,wid,pid,aid),/ASSET_NOT_FOUND/);
    assert.throws(()=>f.repo.saveCullingMark(editor,wid,pid,aid,mark(2)),/ASSET_NOT_FOUND/);
    f.repo.restoreAsset(owner,wid,pid,aid);
    assert.deepEqual(f.repo.getCullingMark(owner,wid,pid,aid).tags,['hero','proof']);
    assert.equal(f.assets.get(wid,aid).sha256,sha256);
    f.repo.removeMember(owner,wid,'editor');
    assert.throws(()=>f.repo.saveCullingMark(editor,wid,pid,aid,mark(4)),/FORBIDDEN/);
  }finally{await f.close();}
});

test('CULLING-DB03: additive migration opens an old Workspace DB without altering selection or assets',async()=>{
  const f=await fixture();try{
    const wid=f.workspace.id,pid=f.project.id,aid=f.asset.id;
    f.repo.saveSelection(owner,wid,pid,aid,{baseVersion:0,selected:true});
    f.simulateLegacy();
    assert.equal(f.repo.getSelection(owner,wid,pid,aid)?.version,1);
    assert.equal(f.repo.getSelection(owner,wid,pid,aid)?.selected,true);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),0);
    assert.equal(f.repo.getCullingMark(owner,wid,pid,aid).rating,0);
    const second=f.assets.create(wid,{name:'legacy-new.bin',sha256:createHash('sha256').update('legacy-new').digest('hex'),size:10});
    f.repo.registerAsset(owner,wid,pid,second.id);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),1);
    assert.throws(()=>f.repo.saveCullingMark(owner,wid,pid,aid,mark(0)),/CULLING_VERSION_CONFLICT/);
    assert.equal(f.repo.saveCullingMark(owner,wid,pid,aid,mark(1)).version,2);
    assert.equal(f.assets.get(wid,aid).sha256,sha256);
  }finally{await f.close();}
});

test('CULLING-DB05: registration, trash and restore invalidate old Asset-set snapshots atomically',async()=>{
  const f=await fixture();try{
    const wid=f.workspace.id,pid=f.project.id,aid=f.asset.id;
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),1);
    assert.equal(f.repo.registerAsset(owner,wid,pid,aid).sha256,sha256);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),1,'idempotent registration is not a set change');
    const second=f.assets.create(wid,{name:'second.bin',sha256:createHash('sha256').update('second').digest('hex'),size:6});
    f.repo.registerAsset(owner,wid,pid,second.id);
    assert.equal(f.repo.getCullingPage(owner,wid,pid).version,2);
    assert.equal(f.repo.getCullingPage(owner,wid,pid).marks.length,2);
    assert.throws(()=>f.repo.saveCullingMark(owner,wid,pid,aid,mark(1)),/CULLING_VERSION_CONFLICT/);
    f.repo.trashAsset(owner,wid,pid,second.id);
    assert.equal(f.repo.getCullingPage(owner,wid,pid).version,3);
    assert.deepEqual(f.repo.getCullingPage(owner,wid,pid).marks.map(item=>item.assetId),[aid]);
    assert.throws(()=>f.repo.saveCullingMark(owner,wid,pid,aid,mark(2)),/CULLING_VERSION_CONFLICT/);
    f.repo.restoreAsset(owner,wid,pid,second.id);
    assert.equal(f.repo.getCullingPage(owner,wid,pid).version,4);
    f.repo.restoreAsset(owner,wid,pid,second.id);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),4,'repeat restore is not a set change');
    assert.throws(()=>f.repo.createCullingSegment(owner,wid,pid,{baseVersion:3,id:'stale',name:'Stale'}),/CULLING_VERSION_CONFLICT/);
    f.repo.trashProject(owner,wid,pid);
    assert.throws(()=>f.repo.getCullingPage(owner,wid,pid),/PROJECT_NOT_FOUND/);
    f.repo.restoreProject(owner,wid,pid);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),4,'Project availability did not mutate its Asset set');
    assert.equal(f.assets.get(wid,aid).sha256,sha256);
  }finally{await f.close();}
});

test('CULLING-DB06: tenant, role and failed head write leave version and Asset membership unchanged',async()=>{
  const f=await fixture();try{
    const wid=f.workspace.id,pid=f.project.id,aid=f.asset.id;
    f.add('editor','EDITOR');f.add('viewer','VIEWER');
    const second=f.assets.create(wid,{name:'blocked.bin',sha256:createHash('sha256').update('blocked').digest('hex'),size:7});
    const otherWorkspace=f.repo.createWorkspace({userId:'stranger'},'Foreign');
    assert.throws(()=>f.repo.registerAsset({userId:'stranger'},wid,pid,second.id),/FORBIDDEN/);
    assert.throws(()=>f.repo.registerAsset(owner,otherWorkspace.id,pid,second.id),/FORBIDDEN/);
    assert.throws(()=>f.repo.trashAsset(viewer,wid,pid,aid),/FORBIDDEN/);
    assert.throws(()=>f.repo.restoreAsset(editor,wid,pid,aid),/FORBIDDEN/);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),1);
    assert.deepEqual(f.repo.listAssets(owner,wid,pid).map(asset=>asset.id),[aid]);
    const db=new DatabaseSync(join(f.root,'workspace.sqlite'));
    try {db.exec("CREATE TRIGGER block_culling_head BEFORE UPDATE ON ws_culling_heads BEGIN SELECT RAISE(ABORT,'HEAD_WRITE_BLOCKED'); END;");}
    finally {db.close();}
    assert.throws(()=>f.repo.registerAsset(owner,wid,pid,second.id),/HEAD_WRITE_BLOCKED/);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),1);
    assert.deepEqual(f.repo.listAssets(owner,wid,pid).map(asset=>asset.id),[aid]);
    assert.throws(()=>f.repo.trashAsset(owner,wid,pid,aid),/HEAD_WRITE_BLOCKED/);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),1);
    assert.deepEqual(f.repo.listAssets(owner,wid,pid).map(asset=>asset.id),[aid]);
    const reset=new DatabaseSync(join(f.root,'workspace.sqlite'));
    try {reset.exec('DROP TRIGGER block_culling_head;');} finally {reset.close();}
    f.repo.trashAsset(owner,wid,pid,aid);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),2);
    const blockRestore=new DatabaseSync(join(f.root,'workspace.sqlite'));
    try {blockRestore.exec("CREATE TRIGGER block_culling_head BEFORE UPDATE ON ws_culling_heads BEGIN SELECT RAISE(ABORT,'HEAD_WRITE_BLOCKED'); END;");}
    finally {blockRestore.close();}
    assert.throws(()=>f.repo.restoreAsset(owner,wid,pid,aid),/HEAD_WRITE_BLOCKED/);
    assert.equal(f.repo.getCullingVersion(owner,wid,pid),2);
    assert.deepEqual(f.repo.registeredAssetStates(owner,wid,pid),[{assetId:aid,trashed:true}]);
  }finally{await f.close();}
});

test('CULLING-DB04: damaged stored tags fail closed, never returning a saved-looking mark',async()=>{
  const f=await fixture();try{
    const wid=f.workspace.id,pid=f.project.id,aid=f.asset.id;
    f.repo.saveCullingMark(owner,wid,pid,aid,mark(1));
    const db=new DatabaseSync(join(f.root,'workspace.sqlite'));
    try {db.prepare('UPDATE ws_culling_marks SET tags_json=? WHERE workspace_id=? AND project_id=? AND asset_id=?').run('{broken',wid,pid,aid);}
    finally {db.close();}
    assert.throws(()=>f.repo.getCullingMark(owner,wid,pid,aid),/CULLING_STATE_CORRUPT/);
    assert.throws(()=>f.repo.getCullingPage(owner,wid,pid),/CULLING_STATE_CORRUPT/);
  }finally{await f.close();}
});

test('CULLING-HTTP05: authenticated Node HTTP serves paged Project marks, CAS 409 and viewer 403',async()=>{
  const root=await mkdtemp(join(tmpdir(),'suite-culling-http-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const http=new WorkspaceHTTP(root,assets,storage);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='culling-test';
  const authenticate=jwtAuthenticator({issuer:'https://issuer.example',audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})});
  const server=suiteServer(assets,storage,authenticate,http);
  try{
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const addr=server.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
    const request=async(path:string,user='owner',method='GET',data?:unknown)=>{
      const token=await new SignJWT({tenant_id:'personal',email:`${user}@example.test`,email_verified:true})
        .setProtectedHeader({alg:'RS256',kid:'culling-test'}).setIssuer('https://issuer.example').setAudience('suite')
        .setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
      const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${token}`,...(data===undefined?{}:{'content-type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
      return {status:response.status,body:await response.json() as any};
    };
    const wid=(await request('/v1/workspaces','owner','POST',{name:'HTTP Studio'})).body.workspace.id;
    const pid=(await request(`/v1/workspaces/${wid}/projects`,'owner','POST',{name:'HTTP Project'})).body.project.id;
    const asset=(await request(`/v1/workspaces/${wid}/projects/${pid}/assets`,'owner','POST',{name:'bytes.bin',sha256,size:original.length})).body.asset;
    const path=`/v1/workspaces/${wid}/projects/${pid}`,apath=`${path}/assets/${asset.id}`;
    const invite=(await request(`/v1/workspaces/${wid}/invitations`,'owner','POST',{email:'viewer@example.test',role:'VIEWER',expiresAt:'2099-01-01T00:00:00.000Z'})).body;
    assert.equal((await request(`/v1/workspaces/${wid}/invitations/accept`,'viewer','POST',{token:invite.token})).status,200);
    const seg=await request(`${path}/culling/segments`,'owner','POST',{baseVersion:1,id:'proof',name:'Proof'});
    assert.equal(seg.status,201);assert.equal(seg.body.culling.version,2);
    assert.equal((await request(`${apath}/culling`,'viewer','PUT',mark(2,{segmentId:'proof'}))).status,403);
    const saved=await request(`${apath}/culling`,'owner','PUT',mark(2,{segmentId:'proof'}));
    assert.equal(saved.status,200);assert.equal(saved.body.culling.mark.rating,4);
    assert.equal((await request(`${apath}/culling`,'owner','PUT',mark(2))).status,409);
    const page=await request(`${path}/culling?limit=1`,'viewer');
    assert.equal(page.status,200);assert.equal(page.body.culling.version,3);assert.equal(page.body.culling.marks.length,1);
    assert.equal(page.body.culling.marks[0].segmentId,'proof');assert.equal(page.body.culling.nextAfter,null);
    assert.equal((await request(`${apath}/selection`,'viewer','PUT',{baseVersion:0,selected:true})).status,200);
    assert.equal((await request(`${apath}/culling`,'viewer')).body.mark.rating,4);
    assert.equal((await request(`${path}/culling?limit=0`)).status,400);
    assert.equal((await request(`${path}/culling/segments/order`,'owner','PUT',{baseVersion:3,orderedIds:['proof']})).status,200);
    const secondBytes=Buffer.from('second culling Asset');
    const second=(await request(`${path}/assets`,'owner','POST',{name:'second.bin',sha256:createHash('sha256').update(secondBytes).digest('hex'),size:secondBytes.length}));
    assert.equal(second.status,201);
    assert.equal((await request(`${path}/culling`)).body.culling.version,5);
    assert.equal((await request(`${apath}/culling`,'owner','PUT',mark(4))).status,409);
    assert.equal((await request(`${path}/assets/${second.body.asset.id}/trash`,'viewer','POST')).status,403);
    assert.equal((await request(`${path}/culling`)).body.culling.version,5);
    assert.equal((await request(`${path}/assets/${second.body.asset.id}/trash`,'owner','POST')).status,200);
    const trashed=await request(`${path}/culling`);
    assert.equal(trashed.body.culling.version,6);
    assert.deepEqual(trashed.body.culling.marks.map((item:any)=>item.assetId),[asset.id]);
    assert.equal((await request(`${path}/assets/${second.body.asset.id}/restore`,'owner','POST')).status,200);
    assert.equal((await request(`${path}/culling`)).body.culling.version,7);
    assert.equal((await request(`${apath}/culling`,'owner','PUT',mark(6))).status,409);
  }finally{
    if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    http.close();assets.close();await rm(root,{recursive:true,force:true});
  }
});
