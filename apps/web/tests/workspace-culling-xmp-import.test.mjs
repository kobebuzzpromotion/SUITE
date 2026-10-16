import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {inspectWorkspaceCullingXMPSidecar,applyVerifiedWorkspaceCullingXMPImport} from '../src/workspace-culling-xmp-import.mjs';

const owner={userId:'owner'},encoder=new TextEncoder();
function packet(properties){return encoder.encode(`<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n`+
  `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n`+
  `  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n`+
  `    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">\n`+
  `      ${properties}\n`+
  `    </rdf:Description>\n`+
  `  </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>\n`);}
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'suite-xmp-import-'));
  const assets=new AssetRepository(join(root,'assets.sqlite'));
  const storage=new LocalObjectStorage(join(root,'objects'));
  const http=new WorkspaceHTTP(root,assets,storage);
  let server;
  try{
    const workspace=http.workspaces.createWorkspace(owner,'XMP Import');
    const project=http.workspaces.createProject(owner,workspace.id,'Project');
    const bytes=Buffer.from('synthetic-original');
    const originalSHA256=createHash('sha256').update(bytes).digest('hex');
    const asset=assets.create(workspace.id,{name:'first.bin',sha256:originalSHA256,size:bytes.length});
    const otherBytes=Buffer.from('other-original');
    const other=assets.create(workspace.id,{name:'second.bin',
      sha256:createHash('sha256').update(otherBytes).digest('hex'),size:otherBytes.length});
    http.workspaces.registerAsset(owner,workspace.id,project.id,asset.id);
    http.workspaces.registerAsset(owner,workspace.id,project.id,other.id);
    http.workspaces.createCullingSegment(owner,workspace.id,project.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
        id:'story',name:'Story'});
    http.workspaces.saveCullingMark(owner,workspace.id,project.id,asset.id,
      {baseVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),
        rating:1,flag:'pick',colorLabel:'Blue',tags:['keep'],segmentId:'story'});
    const invitation=http.workspaces.inviteMember(owner,workspace.id,
      {email:'viewer@example.test',role:'VIEWER',expiresAt:'2099-01-01T00:00:00.000Z'});
    http.workspaces.acceptInvitation({userId:'viewer'},workspace.id,invitation.token,'viewer@example.test');
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk=await exportJWK(publicKey);jwk.kid='xmp-import';
    server=suiteServer(assets,storage,jwtAuthenticator({issuer:'https://issuer.example',
      audience:'suite',jwks:createLocalJWKSet({keys:[jwk]})}),http);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const baseURL=`http://127.0.0.1:${address.port}`;
    const token=async(user='owner',tenant='personal')=>new SignJWT({tenant_id:tenant,
      email:`${user}@example.test`,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'xmp-import'}).setIssuer('https://issuer.example')
      .setAudience('suite').setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const input=(preview,overrides={})=>({preview,confirmImport:async({preview:value})=>value,
      baseURL,tokenProvider:()=>token(),
      selectionProvider:()=>({workspaceId:workspace.id,projectId:project.id,assetId:asset.id}),
      workspaceId:workspace.id,projectId:project.id,assetId:asset.id,
      expectedSubject:'owner',expectedTenantId:'personal',expectedOriginalSHA256:originalSHA256,
      expectedCullingVersion:http.workspaces.getCullingVersion(owner,workspace.id,project.id),...overrides});
    const mark=()=>http.workspaces.getCullingMark(owner,workspace.id,project.id,asset.id);
    return {assets,http,workspace,project,asset,other,originalSHA256,input,mark,token,baseURL,
      async close(){await new Promise(resolve=>server.close(resolve));http.close();assets.close();
        await rm(root,{recursive:true,force:true});}};
  }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));
    http.close();assets.close();await rm(root,{recursive:true,force:true});throw error;}
}

test('CULLING-XMP-IMPORT01: bounded strict Adobe namespace subset, duplicate/unknown/XXE/UTF8/Reject fail closed',()=>{
  const source=packet('<xmp:Rating>5</xmp:Rating>\n      <xmp:Label>Amber &amp; Gold</xmp:Label>');
  const before=Uint8Array.from(source),preview=inspectWorkspaceCullingXMPSidecar(source);
  assert.deepEqual(preview.fields,['rating','colorLabel']);
  assert.equal(preview.rating,5);assert.equal(preview.label,'Amber & Gold');
  assert.equal(preview.flagPolicy,'PRESERVE_EXISTING_FLAG');
  assert.deepEqual(source,before);assert.equal(Object.isFrozen(preview),true);
  for(const invalid of [
    packet('<xmp:Rating>-1</xmp:Rating>'),packet('<xmp:Rating>3.0</xmp:Rating>'),
    packet('<xmp:Rating>5</xmp:Rating><xmp:Rating>1</xmp:Rating>'),
    packet('<xmp:Rating>5</xmp:Rating><xmp:Flag>Pick</xmp:Flag>'),
    packet('<xmp:Label>Green &unknown;</xmp:Label>'),
    packet('<xmp:Label> </xmp:Label>'),
    encoder.encode(new TextDecoder().decode(packet('<xmp:Rating>5</xmp:Rating>')).replace('<?xpacket end="w"?>','')),
    encoder.encode('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+new TextDecoder().decode(packet('<xmp:Rating>5</xmp:Rating>'))),
    encoder.encode(new TextDecoder().decode(packet('<xmp:Rating>5</xmp:Rating>')).replace('http://ns.adobe.com/xap/1.0/','https://evil.example/xmp')),
    new Uint8Array([0xc3,0x28]),new Uint8Array(4097)
  ])assert.throws(()=>inspectWorkspaceCullingXMPSidecar(invalid),/CULLING_XMP_IMPORT_/u);
});

test('CULLING-XMP-IMPORT02 / JWT SQLite: a single supported property never clears absent Rating or Label',async()=>{
  const f=await fixture();try{
    const ratingOnly=inspectWorkspaceCullingXMPSidecar(packet('<xmp:Rating>0</xmp:Rating>'));
    const rating=await applyVerifiedWorkspaceCullingXMPImport(f.input(ratingOnly));
    assert.equal(rating.status,'VERIFIED_SAVED_AT_READ_TIME');
    assert.equal(f.mark().rating,0);assert.equal(f.mark().colorLabel,'Blue');
    const labelOnly=inspectWorkspaceCullingXMPSidecar(packet('<xmp:Label>Gold</xmp:Label>'));
    const label=await applyVerifiedWorkspaceCullingXMPImport(f.input(labelOnly));
    assert.equal(label.status,'VERIFIED_SAVED_AT_READ_TIME');
    assert.equal(f.mark().rating,0);assert.equal(f.mark().colorLabel,'Gold');
    assert.equal(f.mark().flag,'pick');assert.deepEqual(f.mark().tags,['keep']);
    assert.equal(f.mark().segmentId,'story');
  }finally{await f.close();}
});

test('CULLING-XMP-IMPORT03 / JWT SQLite: preview then explicit approval saves only Rating/Label with readback',async()=>{
  const f=await fixture();try{
    const bytes=packet('<xmp:Label>Amber &amp; Gold</xmp:Label>\n<xmp:Rating>5</xmp:Rating>');
    const preview=inspectWorkspaceCullingXMPSidecar(bytes),before=f.mark();
    let seen=null;
    const saved=await applyVerifiedWorkspaceCullingXMPImport(f.input(preview,{confirmImport:async({preview:value})=>{
      seen=value;return value;}}));
    assert.equal(seen,preview);assert.equal(saved.status,'VERIFIED_SAVED_AT_READ_TIME');
    assert.equal(saved.authoritativeForFinal,false);assert.equal(saved.requiresReload,true);
    assert.equal(f.mark().rating,5);assert.equal(f.mark().colorLabel,'Amber & Gold');
    for(const key of ['flag','tags','segmentId'])assert.deepEqual(f.mark()[key],before[key]);
    assert.deepEqual(bytes,packet('<xmp:Label>Amber &amp; Gold</xmp:Label>\n<xmp:Rating>5</xmp:Rating>'));
    const unchanged=await applyVerifiedWorkspaceCullingXMPImport(f.input(preview));
    assert.equal(unchanged.status,'UNCHANGED_AT_READ_TIME');assert.equal(unchanged.requiresReload,false);
  }finally{await f.close();}
});

test('CULLING-XMP-IMPORT04 / JWT SQLite: approval, identity, SHA, Asset, version and viewer gates write nothing',async()=>{
  const f=await fixture();try{
    const preview=inspectWorkspaceCullingXMPSidecar(packet('<xmp:Rating>4</xmp:Rating>'));
    const before=f.mark();let tokens=0;
    await assert.rejects(()=>applyVerifiedWorkspaceCullingXMPImport(f.input(preview,
      {confirmImport:()=>false,tokenProvider:()=>{tokens++;return f.token();}})),/NOT_APPROVED/u);
    assert.equal(tokens,0);
    await assert.rejects(()=>applyVerifiedWorkspaceCullingXMPImport(f.input({...preview})),/CONFIG_INVALID/u);
    for(const overrides of [
      {expectedOriginalSHA256:'0'.repeat(64)},
      {selectionProvider:()=>({workspaceId:f.workspace.id,projectId:f.project.id,assetId:f.other.id})},
      {tokenProvider:()=>f.token('viewer'),expectedSubject:'viewer'},
      {tokenProvider:()=>f.token('owner','wrong')},
      {expectedCullingVersion:0}
    ])await assert.rejects(()=>applyVerifiedWorkspaceCullingXMPImport(f.input(preview,overrides)));
    assert.deepEqual(f.mark(),before);
  }finally{await f.close();}
});

test('CULLING-XMP-IMPORT05 / JWT SQLite: 409 conflict or lost write response never claims saved',async()=>{
  const f=await fixture();try{
    const preview=inspectWorkspaceCullingXMPSidecar(packet('<xmp:Rating>4</xmp:Rating>'));
    let conflictInjected=false;
    const conflict=await applyVerifiedWorkspaceCullingXMPImport(f.input(preview,{fetchImpl:(url,init)=>{
      if(!conflictInjected&&init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')){
        conflictInjected=true;const before=f.mark();
        f.http.workspaces.saveCullingMark(owner,f.workspace.id,f.project.id,f.asset.id,
          {baseVersion:f.http.workspaces.getCullingVersion(owner,f.workspace.id,f.project.id),
            rating:before.rating,flag:before.flag,colorLabel:'outside',tags:before.tags,segmentId:before.segmentId});
      }
      return fetch(url,init);
    }}));
    assert.equal(conflict.status,'CONFLICT_RELOAD_REQUIRED');assert.equal(conflict.confirmedVersion,null);
    assert.equal(f.mark().rating,1);assert.equal(f.mark().colorLabel,'outside');
    let dropped=false;
    const uncertain=await applyVerifiedWorkspaceCullingXMPImport(f.input(preview,{fetchImpl:async(url,init)=>{
      if(!dropped&&init.method==='PUT'&&new URL(url).pathname.endsWith('/culling')){
        dropped=true;await fetch(url,init);throw Error('lost response');}
      return fetch(url,init);
    }}));
    assert.equal(uncertain.status,'UNVERIFIED_RELOAD_REQUIRED');assert.equal(uncertain.confirmedVersion,null);
    assert.equal(f.mark().rating,4);
  }finally{await f.close();}
});

test('CULLING-XMP-IMPORT06 / JWT SQLite: abort or account switch before CAS cannot report success',async()=>{
  const f=await fixture();try{
    const preview=inspectWorkspaceCullingXMPSidecar(packet('<xmp:Rating>5</xmp:Rating>'));
    const controller=new AbortController();
    await assert.rejects(()=>applyVerifiedWorkspaceCullingXMPImport(f.input(preview,{signal:controller.signal,
      confirmImport:async({preview:value})=>{controller.abort();return value;}})),error=>error.name==='AbortError');
    assert.equal(f.mark().rating,1);
    let selected=f.asset.id;
    await assert.rejects(()=>applyVerifiedWorkspaceCullingXMPImport(f.input(preview,{
      selectionProvider:()=>({workspaceId:f.workspace.id,projectId:f.project.id,assetId:selected}),
      confirmImport:async({preview:value})=>{selected=f.other.id;return value;}})),/SELECTION_CHANGED/u);
    assert.equal(f.mark().rating,1);
  }finally{await f.close();}
});
