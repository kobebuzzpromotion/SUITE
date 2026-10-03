import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const validToken=t=>typeof t==='string'&&/^[A-Za-z0-9_-]{43}$/.test(t);
/** Invitation-only LOCAL trial. No public signup, provider selection or production-auth claim. */
export class InviteAuth {
  constructor(path,{clock=()=>Date.now(),sessionTTL=7*86400000}={}){
    if(!Number.isSafeInteger(sessionTTL)||sessionTTL<1000||sessionTTL>7*86400000)throw Error('INVALID_SESSION_TTL');
    this.clock=clock;this.sessionTTL=sessionTTL;this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS trial_authors(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS trial_invites(hash TEXT PRIMARY KEY,author_id TEXT NOT NULL REFERENCES trial_authors(id),expires_at INTEGER NOT NULL,used_at INTEGER);
      CREATE TABLE IF NOT EXISTS trial_sessions(hash TEXT PRIMARY KEY,author_id TEXT NOT NULL REFERENCES trial_authors(id),expires_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);`);
    // Separate trial-auth DB only; existing Asset/Recipe schema is untouched.
    const add=(table,name,type)=>{if(!this.db.prepare('PRAGMA table_info('+table+')').all().some(r=>r.name===name))this.db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+type);};
    add('trial_authors','trial_ends_at','INTEGER NOT NULL DEFAULT 0');add('trial_invites','id','TEXT');add('trial_invites','trial_ends_at','INTEGER NOT NULL DEFAULT 0');add('trial_invites','revoked','INTEGER NOT NULL DEFAULT 0');add('trial_sessions','invite_hash','TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS trial_invite_id ON trial_invites(id)');
  }
  close(){this.db.close();}
  principal(row,trialEnd=row.trial_ends_at,invitationID=null){return {id:String(row.id),authorName:String(row.name),role:String(row.role),tenantId:'trial-'+row.id,trialEndsAt:trialEnd?new Date(trialEnd).toISOString():null,invitationID};}
  rawAuthor(id){const row=this.db.prepare('SELECT * FROM trial_authors WHERE id=?').get(id);if(!row)throw Error('UNAUTHORIZED');if(row.active!==1)throw Error('TRIAL_REVOKED');return row;}
  author(id){return this.principal(this.rawAuthor(id));}
  endTime(value){const ms=typeof value==='string'?Date.parse(value):NaN;if(!Number.isSafeInteger(ms)||ms<=this.clock())throw Error('INVALID_TRIAL_END');return ms;}
  grant(row){if(row.revoked)throw Error('TRIAL_REVOKED');if(!row.trial_ends_at)throw Error('TRIAL_END_NOT_CONFIGURED');if(row.trial_ends_at<=this.clock())throw Error('TRIAL_EXPIRED');}
  createAuthor({authorName,role='author',trialEndsAt}){
    if(typeof authorName!=='string'||!authorName.trim()||authorName.length>80||/[\x00-\x1f]/.test(authorName)||!['author','admin'].includes(role))throw Error('INVALID_AUTHOR');
    const id=randomUUID(),end=trialEndsAt===undefined?0:this.endTime(trialEndsAt);this.db.prepare('INSERT INTO trial_authors(id,name,role,active,created_at,trial_ends_at) VALUES(?,?,?,?,?,?)').run(id,authorName.trim(),role,1,this.clock(),end);return this.author(id);
  }
  issueInvite(authorID,{ttlMs=48*3600000,trialEndsAt}={}){
    const author=this.rawAuthor(authorID);if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>7*86400000)throw Error('INVALID_INVITE_TTL');
    const end=trialEndsAt===undefined?author.trial_ends_at:this.endTime(trialEndsAt);this.grant({trial_ends_at:end,revoked:0});
    const inviteToken=secret(),expiresAt=this.clock()+ttlMs,id=randomUUID();this.db.prepare('INSERT INTO trial_invites(hash,author_id,expires_at,used_at,id,trial_ends_at,revoked) VALUES(?,?,?,NULL,?,?,0)').run(hash(inviteToken),authorID,expiresAt,id,end);return {inviteToken,expiresAt,invitationID:id,trialEndsAt:new Date(end).toISOString()};
  }
  redeem(inviteToken){
    if(!validToken(inviteToken))throw Error('UNAUTHORIZED');this.db.exec('BEGIN IMMEDIATE');
    try{
      const row=this.db.prepare('SELECT * FROM trial_invites WHERE hash=? AND used_at IS NULL AND expires_at>?').get(hash(inviteToken),this.clock());if(!row)throw Error('UNAUTHORIZED');
      this.grant(row);const principal=this.principal(this.rawAuthor(String(row.author_id)),row.trial_ends_at,row.id),now=this.clock(),sessionToken=secret(),expiresAt=now+this.sessionTTL;
      this.db.prepare('UPDATE trial_invites SET used_at=? WHERE hash=? AND used_at IS NULL').run(now,hash(inviteToken));
      this.db.prepare('INSERT INTO trial_sessions(hash,author_id,expires_at,revoked,invite_hash) VALUES(?,?,?,0,?)').run(hash(sessionToken),principal.id,expiresAt,row.hash);this.db.exec('COMMIT');return {sessionToken,principal,expiresAt};
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  resolveSession(token){
    if(!validToken(token))throw Error('UNAUTHORIZED');const row=this.db.prepare('SELECT * FROM trial_sessions WHERE hash=? AND expires_at>?').get(hash(token),this.clock());if(!row)throw Error('UNAUTHORIZED');const author=this.rawAuthor(String(row.author_id)),invite=this.db.prepare('SELECT * FROM trial_invites WHERE hash=?').get(row.invite_hash);if(!invite)throw Error('TRIAL_END_NOT_CONFIGURED');this.grant(invite);if(row.revoked)throw Error('UNAUTHORIZED');return this.principal(author,invite.trial_ends_at,invite.id);
  }
  logout(token){if(validToken(token))this.db.prepare('UPDATE trial_sessions SET revoked=1 WHERE hash=?').run(hash(token));}
  setTrialEnd(id,value){const end=this.endTime(value);this.db.exec('BEGIN IMMEDIATE');try{this.rawAuthor(id);this.db.prepare('UPDATE trial_authors SET trial_ends_at=? WHERE id=?').run(end,id);this.db.prepare('UPDATE trial_invites SET trial_ends_at=? WHERE author_id=?').run(end,id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  setInviteTrialEnd(id,value){const end=this.endTime(value),r=this.db.prepare('UPDATE trial_invites SET trial_ends_at=? WHERE id=? AND revoked=0').run(end,id);if(r.changes!==1)throw Error('NOT_FOUND');}
  revokeInvite(id){const r=this.db.prepare('UPDATE trial_invites SET revoked=1 WHERE id=?').run(id);if(!r.changes)throw Error('NOT_FOUND');}
  listInvitations(){return this.db.prepare('SELECT i.id,a.id AS author_id,a.name,a.role,i.trial_ends_at,i.revoked FROM trial_invites i JOIN trial_authors a ON a.id=i.author_id ORDER BY i.rowid DESC').all().map(r=>({id:r.id,authorID:r.author_id,authorName:r.name,email:null,role:r.role,trialEndsAt:r.trial_ends_at?new Date(r.trial_ends_at).toISOString():null,revoked:!!r.revoked}));}
  revokeAuthor(id){this.rawAuthor(id);this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('UPDATE trial_authors SET active=0 WHERE id=?').run(id);this.db.prepare('UPDATE trial_sessions SET revoked=1 WHERE author_id=?').run(id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
