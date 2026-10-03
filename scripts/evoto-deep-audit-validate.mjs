// Structural/evidence checks only. This validator cannot approve feature completeness.
import {readFile,access,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(repo,'docs/EVOTO_AUDIT');
const data=JSON.parse(await readFile(path.join(directory,'evoto-deep-audit.json'),'utf8'));
const errors=[];
function check(ok,message){if(!ok)errors.push(message);}
const ids=new Set(data.rows.map(r=>r.id));
const articleIds=new Set(data.articleIndex.map(a=>a.id));
check(ids.size===data.rows.length,'Duplicate feature row ID');
check(articleIds.size===data.articleIndex.length,'Duplicate article ID');
check(data.headings.length===data.articleIndex.reduce((n,a)=>n+a.headingCount,0),'Heading count mismatch');
check(new Set(data.headings.map(h=>h.id)).size===data.headings.length,'Duplicate heading ID');
const fields=['category','feature','subFeature','option','desktopWindows','desktopMacOS','iPad','iPhoneMobile','batch','personSpecific','groupPhoto','localProcessingCandidate','cloudGenerative','creditConsumption','creditFree','preset','sync','raw','jpeg','suiteStatus','suiteMaturity','suiteImplementationType','priority','suiteProcessingClass','suiteBillingClass','performance','qualityRisk','notes'];
for(const row of data.rows){
 for(const field of fields)check(row[field]!==undefined,`${row.id}: missing ${field}`);
 check(/^[A-I]$/.test(row.suiteStatus),`${row.id}: invalid A-I classification`);
 check(!['H','I'].includes(row.suiteStatus)||!/PASS|VERIFIED|COMPLETE/.test(row.suiteMaturity),`${row.id}: scope masquerades as maturity PASS`);
 check(row.sources.every(id=>articleIds.has(id)),`${row.id}: unresolved evidence`);
 check(row.availability!=='PHOTO_CONFIRMED'||row.sources.length>0,`${row.id}: confirmed feature lacks evidence`);
 check(row.availability!=='PHOTO_CONFIRMED'||row.optionEvidence?.length>0,`${row.id}: group presence used without option evidence`);
 check(row.optionEvidence?.every(e=>row.sources.includes(e.sourceId))??row.suiteStatus==='I',`${row.id}: option proof outside article evidence`);
 check(row.optionEvidence?.length!==0||[row.desktopWindows,row.desktopMacOS,row.iPad,row.iPhoneMobile].every(x=>x!=='DOCUMENTED'),`${row.id}: undocumented option promoted to a platform`);
 check(row.sources.every(id=>data.articleIndex.find(a=>a.id===id)?.platforms.every(p=>p!=='Video')),`${row.id}: video-only source attached to photo feature`);
}
for(const heading of data.headings){
 check(articleIds.has(heading.articleId),`${heading.id}: unresolved article`);
 check(heading.rowIds.every(id=>ids.has(id)),`${heading.id}: unresolved row`);
 check(heading.disposition!=='UI_FEATURE_MAPPED'||heading.rowIds.length>0,`${heading.id}: false mapped heading`);
}
for(const a of data.articleIndex){
 check(a.rowIds.every(id=>ids.has(id)),`${a.id}: unresolved matrix row`);
 check(/^https:\/\/support\.evoto\.ai\//.test(a.url),`${a.id}: nonofficial source`);
 check(/^[a-f0-9]{64}$/.test(a.sha256),`${a.id}: invalid body hash`);
 check(a.published&&a.updated&&a.checkedOn,`${a.id}: missing evidence dates`);
}
check(data.gate.unmappedOfficialArticle===data.articleIndex.filter(a=>!a.rowIds.length).length,'Article gate does not match ledger');
check(data.gate.unmappedOfficialHeading===data.headings.filter(h=>h.disposition==='OPEN_SEMANTIC_REVIEW').length,'Heading gate does not match ledger');
check(data.gate.unclassifiedSuiteStatus===data.rows.filter(r=>!r.suiteStatus).length,'Status gate mismatch');
check(data.gate.status==='BLOCK'&&data.status==='OPEN_NOT_COMPLETE','Incomplete audit must stay BLOCK/OPEN');
check(data.gate.unmappedOfficialFeature==='UNKNOWN_NOT_ZERO','No proof of feature zero-miss');
for(const name of ['EVOTO_FEATURE_MASTER','EVOTO_PLATFORM_MATRIX','EVOTO_PORTRAIT_MATRIX','EVOTO_COLOR_MATRIX','EVOTO_BACKGROUND_MATRIX','EVOTO_TETHER_MATRIX','EVOTO_EXPORT_MATRIX','EVOTO_CLOUD_TEAM_MATRIX','EVOTO_AI_LAB_MATRIX','EVOTO_PRICING_CREDIT_MATRIX','SUITE_GAP_MATRIX','SUITE_ADVANTAGE_MATRIX','EVIDENCE_INDEX','EVOTO_FEATURE_TREE','OFFICIAL_SUPPORT_ARTICLE_INDEX','HEADING_DISPOSITION','REQUIREMENT_TRACE_V2_V3']){
 try{await access(path.join(directory,name+'.md'));}catch{errors.push(`Missing ${name}.md`);}
}
const snapshotPath=process.env.EVOTO_SUPPORT_SNAPSHOT||path.resolve(repo,'../../work/evoto-deep-audit/support-snapshot.json');
try{const raw=await readFile(snapshotPath,'utf8');check(createHash('sha256').update(raw).digest('hex')===data.snapshotSHA256,'External acquisition cache hash changed');}catch{errors.push('Acquisition cache missing; cannot verify snapshot hash');}
const report={checkedOn:data.checkedOn,command:'node scripts/evoto-deep-audit-validate.mjs',structuralValidation:errors.length?'FAIL':'PASS_DOCUMENT_INTEGRITY_ONLY',auditGate:data.gate.status,counts:data.counts,errors,canonicalSHA256:createHash('sha256').update(await readFile(path.join(directory,'evoto-deep-audit.json'))).digest('hex'),scope:'Document and evidence integrity only; not semantic completeness, product behavior, or release acceptance'};
await writeFile(path.join(directory,'VALIDATION.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
