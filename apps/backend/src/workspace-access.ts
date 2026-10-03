import {DatabaseSync} from 'node:sqlite';
import {randomBytes, createHash} from 'node:crypto';
import {originalIntents, type PhotoIntent} from './photo-policy.js';

export interface GrantScope {userId: string; workspaceId: string; assetId: string; purpose: PhotoIntent}
// Private gateway grant, NOT a production provider signed URL. Bearer auth and live ACL remain mandatory.
// Only a digest is persisted. A grant cannot change tenant, subject, object or processing intent.
export class WorkspaceAccessGrants {
  private readonly db: DatabaseSync;
  constructor(file: string, private readonly authorize: (scope: GrantScope) => void, private readonly now: () => number = Date.now) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS workspace_access_grants(digest TEXT PRIMARY KEY,user_id TEXT NOT NULL,workspace_id TEXT NOT NULL,asset_id TEXT NOT NULL,purpose TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
  }
  close() {this.db.close();}
  issue(scope: GrantScope, lifetimeSeconds: number) {
    this.authorize(scope);
    if (!originalIntents.includes(scope.purpose) || !Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > 300) throw new Error('INVALID_GRANT');
    const token = randomBytes(32).toString('base64url'), expiresAt = this.now() + lifetimeSeconds * 1000;
    this.db.prepare('INSERT INTO workspace_access_grants VALUES(?,?,?,?,?,?)').run(this.digest(token), scope.userId, scope.workspaceId, scope.assetId, scope.purpose, expiresAt);
    return {token, expiresAt, scope: 'AUTHENTICATED_GATEWAY_ONLY'};
  }
  verify(scope: GrantScope, token: string) {
    this.authorize(scope); // Membership revocation invalidates access even before grant expiry.
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('ACCESS_GRANT_REJECTED');
    const r = this.db.prepare('SELECT * FROM workspace_access_grants WHERE digest=?').get(this.digest(token));
    if (!r || r.user_id !== scope.userId || r.workspace_id !== scope.workspaceId || r.asset_id !== scope.assetId || r.purpose !== scope.purpose || Number(r.expires_at) <= this.now()) throw new Error('ACCESS_GRANT_REJECTED');
    return {authorized: true, expiresAt: Number(r.expires_at)};
  }
  private digest(token: string) {return createHash('sha256').update(token).digest('hex');}
}
