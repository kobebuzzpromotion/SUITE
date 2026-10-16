import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {createVerifiedWorkspaceCullingXMPSidecar as sidecar} from '../src/workspace-culling-xmp-sidecar.mjs';

const owner={userId:'owner'};
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-culling-xmp-'));
  const assets=new AssetRepository(join(root,'assets.sqlite')),
    storage=new LocalObjectStorage(join(root,'objects')),
    http=new WorkspaceHTTP(root,assets,storage);
  let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'XMP Studio'),
      project=http.workspaces.createProject(owner,workspace.id,'XMP Project');
    const original=Buffer.from('synthetic-original-non-RAW-immutable');
    const asset=assets.create(workspace.id,{name:'selected.bin',
      sha256:createHash('sha256').update(original).digest('hex'),size:original.length});
    const other=assets.create(workspace.id,{name:'other.bin',
      sha256:createHash('sha256').update('other').digest('hex'),size:5});
    http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);
    http.workspaces.registerAsset(owner,workspace.id,project.id,other.id);
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='culling-xmp';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const token=async(user='owner',tenant='personal',nonce)=>{
      let jwt=new SignJWT({tenant_id:tenant,email:`${user}@example.test`,email_verified:true})
        .setProtectedHeader({alg:'RS256',kid:'culling-xmp'}).setIssuer('https://issuer.example')
        .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m');
      if(nonce!==undefined)jwt=jwt.setJti(nonce);
      return jwt.sign(privateKey);
    };
    const mark=(rating,flag,colorLabel,tags=[],segmentId=null)=>{
      const baseVersion=http.workspaces.getCullingVersion(owner,workspace.id,project.id);
      return http.workspaces.saveCullingMark(owner,workspace.id,project.id,asset.id,
        {baseVersion,rating,flag,colorLabel,tags,segmentId});
    };
    const input=overrides=>({baseURL:`http://127.0.0.1:${address.port}`,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,assetId:asset.id}),
      workspaceId:workspace.id,projectId:project.id,assetId:asset.id,
      expectedSubject:'owner',expectedTenantId:'personal',expectedOriginalSHA256:asset.sha256,
      expectedCullingVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),...overrides});
    return {root,assets,http,workspace,project,asset,other,original,token,mark,input,
      async close(){await new Promise(resolve=>server.close(resolve));http.close();assets.close();
        await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}
const xml=result=>new TextDecoder('utf-8',{fatal:true}).decode(result.bytes);

test('CULLING-XMP01 / JWT SQLite: one explicit mark becomes only XMP Rating and literal Label, with no writes',async()=>{
  const f=await fixture();try{
    f.mark(4,'none','赤 & 青 <確認> "引用"');
    const beforeAsset=f.assets.get(f.workspace.id,f.asset.id),
      audit=f.http.workspaces.listAudit(owner,f.workspace.id).length,
      original=Buffer.from(f.original);
    const result=await sidecar(f.input());
    assert.equal(result.status,'VERIFIED_AT_READ_TIME_ONLY');
    assert.equal(result.authoritativeForFinal,false);
    assert.equal(result.assetId,f.asset.id);
    assert.equal(result.originalSHA256,f.asset.sha256);
    assert.equal(result.extension,'.xmp');
    assert.equal(result.labelMeaning,'literal-text-not-standard-color');
    assert.match(xml(result),/<xmp:Rating>4<\/xmp:Rating>/u);
    assert.match(xml(result),/<xmp:Label>赤 &amp; 青 &lt;確認&gt; &quot;引用&quot;<\/xmp:Label>/u);
    assert.doesNotMatch(xml(result),/permissionEvidence|originalSHA256|assetId|Authorization/u);
    assert.equal(f.http.workspaces.listAudit(owner,f.workspace.id).length,audit);
    assert.deepEqual(f.assets.get(f.workspace.id,f.asset.id),beforeAsset);
    assert.deepEqual(f.original,original);
  }finally{await f.close();}
});

test('CULLING-XMP02 / JWT SQLite: Adobe Rating -1 is only safe for reject with no stars; Pick and ambiguous combinations refuse',async()=>{
  const f=await fixture();try{
    f.mark(0,'reject',null);
    const result=await sidecar(f.input());
    assert.match(xml(result),/<xmp:Rating>-1<\/xmp:Rating>/u);
    assert.doesNotMatch(xml(result),/<xmp:Label>/u);
    assert.equal(result.flagMapping,'reject-as-rating-minus-one');
    f.mark(2,'reject',null);
    await assert.rejects(()=>sidecar(f.input()),/CULLING_XMP_FLAG_MAPPING_UNVERIFIED/u);
    f.mark(0,'pick',null);
    await assert.rejects(()=>sidecar(f.input()),/CULLING_XMP_FLAG_MAPPING_UNVERIFIED/u);
    f.mark(3,'none',null,['unmapped-tag']);
    await assert.rejects(()=>sidecar(f.input()),/CULLING_XMP_MARK_UNREPRESENTABLE/u);
  }finally{await f.close();}
});

test('CULLING-XMP03 / JWT SQLite: fake mark, other Asset/SHA, old version, changed host and revoked tenant fail closed',async()=>{
  const f=await fixture();try{
    f.mark(5,'none','Blue');
    await assert.rejects(()=>sidecar({...f.input(),mark:{rating:5}}),/CULLING_XMP_CONFIG_INVALID/u);
    await assert.rejects(()=>sidecar(f.input({expectedOriginalSHA256:f.other.sha256})),/CULLING_XMP_ASSET_IDENTITY_CHANGED/u);
    await assert.rejects(()=>sidecar(f.input({expectedCullingVersion:0})),/CULLING_XMP_VERSION_CHANGED/u);
    await assert.rejects(()=>sidecar(f.input({selectionProvider:()=>({workspaceId:f.workspace.id,
      projectId:f.project.id,assetId:f.other.id})})),/CULLING_XMP_SELECTION_CHANGED/u);
    await assert.rejects(()=>sidecar(f.input({tokenProvider:()=>f.token('owner','wrong-tenant')})),
      /WORKSPACE_SESSION_IDENTITY_CHANGED/u);
    await assert.rejects(()=>sidecar(f.input({tokenProvider:()=>f.token('stranger')})),
      /WORKSPACE_SESSION_HTTP_403/u);
  }finally{await f.close();}
});

test('CULLING-XMP04 / JWT SQLite: in-flight mark change and abort cannot publish stale sidecar bytes',async()=>{
  const f=await fixture();try{
    f.mark(3,'none',null);
    let pageReads=0;
    const fetchImpl=(url,init)=>{
      if(new URL(url).pathname.endsWith('/culling')&&new URL(url).searchParams.get('limit')==='1'&&
          ++pageReads===2) f.mark(4,'none',null);
      return fetch(url,init);
    };
    await assert.rejects(()=>sidecar(f.input({fetchImpl})),/CULLING_XMP_VERSION_CHANGED/u);
    const controller=new AbortController();controller.abort();
    await assert.rejects(()=>sidecar(f.input({signal:controller.signal})),error=>error.name==='AbortError');
  }finally{await f.close();}
});

test('CULLING-XMP05 / JWT SQLite: every read within a round uses exactly one short-lived bearer; second round re-authenticates',async()=>{
  const f=await fixture();try{
    f.mark(4,'none','Blue');
    const issued=[],used=[];
    const tokenProvider=async()=>{
      const bearer=await f.token('owner','personal',`round-${issued.length+1}`);
      issued.push(bearer);return bearer;
    };
    const fetchImpl=(url,init)=>{
      used.push({path:new URL(url).pathname,bearer:init?.headers?.Authorization});
      return fetch(url,init);
    };
    const result=await sidecar(f.input({tokenProvider,fetchImpl}));
    assert.match(xml(result),/<xmp:Rating>4<\/xmp:Rating>/u);
    assert.equal(issued.length,2);
    assert.notEqual(issued[0],issued[1]);
    assert.equal(used.length,10);
    for(let round=0;round<2;round++){
      const requests=used.slice(round*5,round*5+5);
      assert.deepEqual(requests.map(item=>item.bearer),Array(5).fill(`Bearer ${issued[round]}`));
      assert.match(requests[0].path,/\/session$/u);
      assert.match(requests.at(-1).path,/\/session$/u);
      assert.ok(requests.some(item=>item.path.endsWith('/assets')));
      assert.ok(requests.some(item=>item.path.endsWith('/culling')));
    }
    assert.doesNotMatch(xml(result),/round-1|round-2|Bearer /u);
    assert.equal(Object.values(result).includes(issued[0])||Object.values(result).includes(issued[1]),false);
  }finally{await f.close();}
});

test('CULLING-XMP06 / JWT SQLite: account switch on the second round cannot publish bytes',async()=>{
  const f=await fixture();try{
    f.mark(4,'none',null);
    let calls=0;
    await assert.rejects(()=>sidecar(f.input({tokenProvider:()=>f.token(++calls===1?'owner':'stranger')})),
      /WORKSPACE_SESSION_HTTP_403/u);
    assert.equal(calls,2);
  }finally{await f.close();}
});
