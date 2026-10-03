import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(readFileSync(resolve(root,name),'utf8'));
const m=read('metadata.json'), s=read('sources.json');
const results=[];
const check=(name,fn)=>{try{fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}};
check('Submission remains blocked; no external action or provider adoption',()=>{
 assert.equal(m.submissionReady,false);assert.equal(m.mobileRelease,'BLOCK');
 assert.equal(m.externalSubmissionPerformed,false);assert.equal(m.productionProviderSelected,false);
 assert.equal(m.documentStatus,'DRAFT_NOT_FOR_UPLOAD');assert(m.blockers.length>0);
});
check('Initial iPhone/iPad targets only; Mac QA and Web gate separated',()=>{
 assert.deepEqual(m.targetDevices,['iPhone','iPad']);assert.equal(m.macRole,'QA_ENVIRONMENT_ONLY');assert.equal(m.webRequiredForMobileRelease,false);
 for(const id of ['macAvailability','visionAvailability'])assert.equal(m.fields.find(f=>f.id===id).status,'NOT_RUN');
});
const required=['appName','subtitle','description','keywords','primaryCategory','screenshots','appIcon','privacyPolicyUrl','supportUrl','marketingUrl','appPrivacy','collectedData','thirdPartySdks','cloudServices','authentication','storageServices','ageRating','encryption','exportCompliance','reviewNotes','reviewInstructions','demoAccount','reviewPath','iapRequired','accountDeletion','rights','terms','bundleId','developerTeam','seller','sku','appleId','releaseVersion','minimumOs','territoriesPricing','reviewContact'];
check('Required submission topics present once with status and evidence document',()=>{
 assert.equal(new Set(m.fields.map(f=>f.id)).size,m.fields.length);
 for(const id of required)assert(m.fields.some(f=>f.id===id),id);
 for(const f of m.fields){assert(Object.hasOwn(m.states,f.status));assert(f.reason);assert(f.owner);assert(existsSync(resolve(root,f.document)),f.document);}
});
check('Unconfirmed declarations, account IDs and URLs remain null',()=>{
 for(const value of Object.values(m.declaredAnswers))assert.equal(value,null);
 for(const f of m.fields)assert.equal(f.value,null,'unapproved value '+f.id);
 for(const id of ['privacyPolicyUrl','supportUrl','marketingUrl','termsUrl','bundleId','developerTeam','seller','appleId','ageRating','iapRequired'])assert.equal(m.fields.find(f=>f.id===id).draft,null,id);
 assert.equal(m.observedSource.archiveInspected,false);assert.equal(m.observedSource.privacyManifestFound,false);
});
const textStats={};
check('Draft copy obeys current character/UTF-8 byte limits',()=>{
 for(const [id,limit,unit]of [['appName',30,'characters'],['subtitle',30,'characters'],['description',4000,'characters'],['keywords',100,'bytes'],['reviewNotes',4000,'bytes']]){
   const draft=m.fields.find(f=>f.id===id).draft;assert.equal(typeof draft,'string');
   const characters=[...draft].length,bytes=Buffer.byteLength(draft,'utf8');textStats[id]={characters,bytes,limit,unit};
   assert((unit==='bytes'?bytes:characters)<=limit,id);
 }
 assert(textStats.appName.characters>=2);
});
check('Apple official sources are attributed and dated',()=>{
 assert(s.sources.length>=15);
 for(const source of s.sources){assert.equal(new URL(source.url).hostname,'developer.apple.com');assert.equal(source.checkedAt,'2026-10-03');assert(source.purpose);}
});
check('Requested classification documents and local evidence links exist',()=>{
 for(const name of ['README.md','METADATA.md','ASSETS.md','PRIVACY_DATA_SDK.md','REVIEW_LEGAL.md','NEXT_SUBMISSION.md','APP_INFORMATION.md','STORE_METADATA.md','SCREENSHOTS.md','APP_ICON.md','APP_PRIVACY.md','PRIVACY_POLICY.md','THIRD_PARTY_SERVICES.md','EXPORT_COMPLIANCE.md','APP_REVIEW.md','ACCOUNT_DELETION.md','IAP_ASSESSMENT.md'])assert(existsSync(resolve(root,name)),name);
 for(const p of m.evidence)assert(existsSync(resolve(root,p)),p);
});
const fail=results.filter(x=>x.status==='FAIL').length;
console.log(JSON.stringify({scope:'APPLE_SUBMISSION_DOCUMENT_STATIC_CHECK_ONLY',date:'2026-10-03',submissionReady:false,total:results.length,pass:results.length-fail,fail,skip:0,fields:m.fields.length,officialSources:s.sources.length,textStats,results,notExecuted:['native build','real RAW pipeline','iPhone device','iPad device','ASC registration','archive validation','legal/privacy declarations']},null,2));
process.exitCode=fail?1:0;

