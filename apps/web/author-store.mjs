import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {portableParameters,checkParameters,checkVersion,adoptionTransition} from './preset-policy.mjs';
export {portableParameters};
const validActor=a=>{if(!a||typeof a.id!=='string'||typeof a.authorName!=='string'||!['author','admin'].includes(a.role))throw Error('UNAUTHORIZED');return a;};
/** Internal trusted-principal boundary; HTTP must derive actor from InviteAuth, never request JSON. */
export class AuthorStore {
  constructor(path,{verifySource=()=>{throw Error('SOURCE_VERIFIER_REQUIRED');},clock=()=>new Date().toISOString()}={}){
    this.verifySource=verifySource;this.clock=clock;this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS trial_drafts(id TEXT PRIMARY KEY,author_id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trial_draft_versions(draft_id TEXT NOT NULL REFERENCES trial_drafts(id),revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(draft_id,revision));
      CREATE TABLE IF NOT EXISTS trial_submissions(draft_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,reviewer TEXT,reviewed_at TEXT,PRIMARY KEY(draft_id,revision));
      CREATE TABLE IF NOT EXISTS trial_presets(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(draft_id,revision));`);
  }
  close(){this.db.close();}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  checkedInput(actor,input){
    validActor(actor);if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>120||/[\x00-\x1f]/.test(input.name)||typeof input.assetID!=='string'||!Number.isSafeInteger(input.recipeRevision)||input.recipeRevision<1)throw Error('INVALID_DRAFT');
    const allowed=['name','recipe','assetID','recipeRevision','expectedRevision'];if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error('INVALID_DRAFT_FIELDS');
    const parameters=portableParameters(input.recipe);this.verifySource(actor,{assetID:input.assetID,recipeRevision:input.recipeRevision,parameters});return {name:input.name.trim(),parameters,source:{assetID:input.assetID,recipeRevision:input.recipeRevision}};
  }
  head(id){const row=this.db.prepare('SELECT * FROM trial_drafts WHERE id=?').get(id);if(!row)throw Error('NOT_FOUND');return row;}
  owned(actor,id){validActor(actor);const row=this.head(id);if(row.author_id!==actor.id)throw Error('NOT_FOUND');return row;}
  version(id,revision){const row=this.db.prepare('SELECT body FROM trial_draft_versions WHERE draft_id=? AND revision=?').get(id,revision);if(!row)throw Error('NOT_FOUND');return checkVersion(JSON.parse(String(row.body)),id,revision,String(this.head(id).author_id));}
  getDraft(actor,id){const h=this.owned(actor,id);const body=this.version(id,Number(h.revision));return {...body,status:String(h.status)};}
  listDrafts(actor){validActor(actor);return this.db.prepare('SELECT id FROM trial_drafts WHERE author_id=? ORDER BY rowid DESC').all(actor.id).map(r=>this.getDraft(actor,String(r.id)));}
  createDraft(actor,input){const values=this.checkedInput(actor,input),id=randomUUID(),now=this.clock();const body={id,authorID:actor.id,authorName:actor.authorName,...values,revision:1,createdAt:now,updatedAt:now};
    return this.transaction(()=>{this.db.prepare('INSERT INTO trial_drafts VALUES(?,?,1,?)').run(id,actor.id,'DRAFT');this.db.prepare('INSERT INTO trial_draft_versions VALUES(?,1,?)').run(id,JSON.stringify(body));return {...body,status:'DRAFT'};});
  }
  saveDraft(actor,id,input){const values=this.checkedInput(actor,input);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)throw Error('INVALID_REVISION');
    return this.transaction(()=>{const head=this.owned(actor,id);if(head.revision!==input.expectedRevision)throw Error('REVISION_CONFLICT');const previous=this.version(id,input.expectedRevision),revision=input.expectedRevision+1,body={...previous,...values,authorName:actor.authorName,revision,updatedAt:this.clock()};
      this.db.prepare('INSERT INTO trial_draft_versions VALUES(?,?,?)').run(id,revision,JSON.stringify(body));this.db.prepare('UPDATE trial_drafts SET revision=?,status=? WHERE id=?').run(revision,'DRAFT',id);return {...body,status:'DRAFT'};});
  }
  submitDraft(actor,id,expectedRevision){
    if(!Number.isSafeInteger(expectedRevision))throw Error('INVALID_REVISION');return this.transaction(()=>{const h=this.owned(actor,id);if(h.revision!==expectedRevision)throw Error('REVISION_CONFLICT');if(h.status!=='DRAFT')throw Error('VERSION_ALREADY_SUBMITTED');const body=this.version(id,expectedRevision);this.verifySource(actor,{...body.source,parameters:body.parameters});
      this.db.prepare('INSERT INTO trial_submissions VALUES(?,?,?, ?,NULL,NULL)').run(id,expectedRevision,JSON.stringify(body),'SUBMITTED');this.db.prepare('UPDATE trial_drafts SET status=? WHERE id=?').run('SUBMITTED',id);return {...body,status:'SUBMITTED'};});
  }
  admin(actor){validActor(actor);if(actor.role!=='admin')throw Error('FORBIDDEN');}
  submitted(row){const body=checkVersion(JSON.parse(String(row.body)),String(row.draft_id),Number(row.revision),String(this.head(String(row.draft_id)).author_id));if(JSON.stringify(body)!==JSON.stringify(this.version(String(row.draft_id),Number(row.revision))))throw Error('CORRUPT_SUBMISSION_SNAPSHOT');return body;}
  listSubmitted(actor){this.admin(actor);return this.db.prepare('SELECT * FROM trial_submissions ORDER BY rowid DESC').all().map(r=>({...this.submitted(r),status:String(r.status),reviewer:r.reviewer,reviewedAt:r.reviewed_at}));}
  reviewDraft(actor,id,expectedRevision,decision){
    this.admin(actor);if(!Number.isSafeInteger(expectedRevision)||!['ACCEPTED','REJECTED'].includes(decision))throw Error('INVALID_REVIEW');
    return this.transaction(()=>{const r=this.db.prepare('SELECT * FROM trial_submissions WHERE draft_id=? AND revision=?').get(id,expectedRevision);if(!r)throw Error('NOT_FOUND');if(r.status!=='SUBMITTED')throw Error('ALREADY_REVIEWED');const submitted=this.submitted(r);if(submitted.authorID===actor.id)throw Error('SELF_APPROVAL_FORBIDDEN');
      adoptionTransition(submitted,actor,decision); // ACCEPTED is the UI label for explicit APPROVED -> PUBLISHED transitions.
      const now=this.clock();this.db.prepare('UPDATE trial_submissions SET status=?,reviewer=?,reviewed_at=? WHERE draft_id=? AND revision=?').run(decision,actor.id,now,id,expectedRevision);
      this.db.prepare('UPDATE trial_drafts SET status=? WHERE id=? AND revision=?').run(decision,id,expectedRevision);
      let preset=null;if(decision==='ACCEPTED'){const body={formatVersion:1,id:randomUUID(),name:submitted.name,authorID:submitted.authorID,authorName:submitted.authorName,version:expectedRevision,parameters:submitted.parameters},sha256=createHash('sha256').update(JSON.stringify(body)).digest('hex');this.db.prepare('INSERT INTO trial_presets VALUES(?,?,?,?,?,?)').run(body.id,id,expectedRevision,JSON.stringify(body),sha256,now);preset={...body,sha256,acceptedAt:now};}return {draft:{...submitted,status:decision},preset};});
  }
  listPresets(actor){validActor(actor);return this.db.prepare('SELECT * FROM trial_presets ORDER BY rowid DESC').all().map(r=>{
    const body=JSON.parse(String(r.body)),keys=['formatVersion','id','name','authorID','authorName','version','parameters'];
    if(createHash('sha256').update(String(r.body)).digest('hex')!==r.sha256||Object.keys(body).sort().join(',')!==keys.sort().join(',')||body.formatVersion!==1||body.id!==r.id||body.version!==r.revision)throw Error('CORRUPT_PRESET');
    checkParameters(body.parameters);const submitted=this.db.prepare('SELECT * FROM trial_submissions WHERE draft_id=? AND revision=?').get(r.draft_id,r.revision);
    if(!submitted||submitted.status!=='ACCEPTED')throw Error('CORRUPT_PRESET');const source=this.submitted(submitted);
    if(body.authorID!==source.authorID||body.authorName!==source.authorName||body.name!==source.name||JSON.stringify(body.parameters)!==JSON.stringify(source.parameters))throw Error('CORRUPT_PRESET');
    return {...body,sha256:String(r.sha256),acceptedAt:String(r.created_at)};
  });}
}
