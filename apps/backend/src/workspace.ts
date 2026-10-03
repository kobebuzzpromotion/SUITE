import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {DatabaseSync, type SQLOutputValue} from 'node:sqlite';
import {validateRecipe} from './photo-policy.js';
import {validatePortraitBinding, validatePortraitContinuity} from './portrait-recipe.js';
import type {Asset} from './repository.js';

/** Actor identity and verified invitation email must originate from server authentication. */
export interface WorkspaceActor {userId: string}
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export type WorkspacePermission = 'read' | 'edit' | 'export' | 'select' | 'manage-members' | 'manage-projects' | 'manage-presets' | 'publish-gallery' | 'delete' | 'owner' | 'audit';
export interface Workspace {id: string; name: string; createdBy: string; createdAt: string; deletedAt: string | null}
export interface WorkspaceMember {workspaceId: string; userId: string; role: WorkspaceRole; joinedAt: string; removedAt: string | null}
export interface WorkspaceInvitation {id: string; workspaceId: string; email: string; role: Exclude<WorkspaceRole, 'OWNER'>; state: 'pending' | 'accepted' | 'revoked'; expiresAt: string; createdBy: string; acceptedBy: string | null; createdAt: string}
export interface WorkspaceProject {id: string; workspaceId: string; name: string; createdBy: string; createdAt: string; deletedAt: string | null}
export interface RecipeDifference {path: string; before?: unknown; after?: unknown}
export interface TeamRecipeVersion {id: string; workspaceId: string; projectId: string; assetId: string; editorUserId: string; createdAt: string; updatedAt: string; version: number; parentVersion: number; branch: boolean; body: Record<string, unknown>; changedFields: RecipeDifference[]; presetSnapshot: {id: string; version: number; body: Record<string, unknown>} | null}
export interface TeamRecipeSaveResult {outcome: 'saved' | 'conflict'; version: TeamRecipeVersion; currentVersion: number; diff: RecipeDifference[]}
export type PresetScope = 'PERSONAL' | 'WORKSPACE' | 'COMMUNITY';
export interface TeamPreset {id: string; workspaceId: string; scope: PresetScope; ownerUserId: string; name: string; version: number; body: Record<string, unknown>; createdAt: string; updatedAt: string; deletedAt: string | null}
export interface TeamSelection {workspaceId: string; projectId: string; assetId: string; version: number; selected: boolean; editorUserId: string; updatedAt: string}
export interface WorkspaceGallery {id: string; workspaceId: string; projectId: string; ownerUserId: string; title: string; assetIds: string[]; allowDownload: boolean; clientSelection: boolean; expiresAt: string | null; publishedBy: string | null; publishedAt: string | null; createdAt: string; deletedAt: string | null}
export interface WorkspaceAuditEvent {id: number; workspaceId: string; actorUserId: string; action: string; targetId: string; createdAt: string; details: Record<string, unknown>}
export type WorkspaceAssetLookup = (workspaceId: string, assetId: string, includeDeleted?: boolean) => Asset;
type Row = Record<string, SQLOutputValue>;
const roles: WorkspaceRole[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];
const permissions: Record<WorkspacePermission, readonly WorkspaceRole[]> = {
  read: roles, edit: ['OWNER', 'ADMIN', 'EDITOR'], export: ['OWNER', 'ADMIN', 'EDITOR'], select: roles,
  'manage-members': ['OWNER', 'ADMIN'], 'manage-projects': ['OWNER', 'ADMIN'], 'manage-presets': ['OWNER', 'ADMIN'],
  'publish-gallery': ['OWNER', 'ADMIN'], delete: ['OWNER', 'ADMIN'], owner: ['OWNER'], audit: ['OWNER', 'ADMIN'],
};
const text = (value: unknown, max = 255): string => {if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('INVALID_INPUT'); return value.trim();};
const subject = (actor: WorkspaceActor): string => {
  // Authenticated subjects are opaque identifiers. Trimming could impersonate a different subject.
  if (typeof actor?.userId !== 'string' || !actor.userId || actor.userId.length > 512 || /[\u0000-\u001f\u007f]/.test(actor.userId)) throw new Error('INVALID_SUBJECT');
  return actor.userId;
};
const revision = (value: number): void => {if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new Error('INVALID_REVISION');};
const nullable = (value: SQLOutputValue | undefined): string | null => value === null || value === undefined ? null : String(value);
const hashToken = (value: string): string => createHash('sha256').update(value).digest('hex');
const normalizedEmail = (value: string): string => {const result = text(value, 320).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error('INVALID_EMAIL'); return result;};

/** Use the existing plain JSON Recipe envelope; never place workspace fields inside it. */
function recipeJSON(value: unknown): string {
  validateRecipe(value);
  const inspect = (item: unknown): void => {
    if (item !== null && typeof item === 'object') {
      if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error('INVALID_RECIPE_JSON');
      for (const child of Object.values(item)) inspect(child);
    }
  };
  inspect(value);
  const json = JSON.stringify(value);
  if (json.length > 2_000_000) throw new Error('RECIPE_TOO_LARGE');
  validateRecipe(JSON.parse(json));
  return json;
}

export function recipeDifferences(before: unknown, after: unknown, path = ''): RecipeDifference[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().flatMap(key => recipeDifferences(a[key], b[key], `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`));
  }
  return [{path: path || '/', ...(before === undefined ? {} : {before}), ...(after === undefined ? {} : {after})}];
}

/** Supplemental metadata only. Original bytes and existing storage contracts remain owned by AssetRepository/Storage. */
export class WorkspaceRepository {
  private readonly db: DatabaseSync;
  constructor(path: string, private readonly assetLookup: WorkspaceAssetLookup, private readonly clock: () => Date = () => new Date()) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS ws_workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS ws_members(workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),user_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('OWNER','ADMIN','EDITOR','VIEWER')),joined_at TEXT NOT NULL,removed_at TEXT,PRIMARY KEY(workspace_id,user_id));
      CREATE TABLE IF NOT EXISTS ws_invitations(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('ADMIN','EDITOR','VIEWER')),token_hash TEXT NOT NULL UNIQUE,state TEXT NOT NULL CHECK(state IN ('pending','accepted','revoked')),expires_at TEXT NOT NULL,created_by TEXT NOT NULL,accepted_by TEXT,created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS ws_pending_invitation ON ws_invitations(workspace_id,email) WHERE state='pending';
      CREATE TABLE IF NOT EXISTS ws_projects(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),name TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT,UNIQUE(workspace_id,id));
      CREATE TABLE IF NOT EXISTS ws_assets(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,original_key TEXT NOT NULL,sha256 TEXT NOT NULL,registered_by TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT,PRIMARY KEY(workspace_id,project_id,asset_id),UNIQUE(workspace_id,asset_id),FOREIGN KEY(workspace_id,project_id) REFERENCES ws_projects(workspace_id,id));
      CREATE TABLE IF NOT EXISTS ws_recipe_heads(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(workspace_id,project_id,asset_id),FOREIGN KEY(workspace_id,project_id,asset_id) REFERENCES ws_assets(workspace_id,project_id,asset_id));
      CREATE TABLE IF NOT EXISTS ws_recipe_versions(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,version INTEGER NOT NULL,parent_version INTEGER NOT NULL,editor_user_id TEXT NOT NULL,created_at TEXT NOT NULL,branch INTEGER NOT NULL,body TEXT NOT NULL,changed_fields TEXT NOT NULL,preset_snapshot TEXT,UNIQUE(workspace_id,project_id,asset_id,version),FOREIGN KEY(workspace_id,project_id,asset_id) REFERENCES ws_assets(workspace_id,project_id,asset_id));
      CREATE TABLE IF NOT EXISTS ws_presets(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),scope TEXT NOT NULL CHECK(scope IN ('PERSONAL','WORKSPACE','COMMUNITY')),owner_user_id TEXT NOT NULL,created_at TEXT NOT NULL,current_version INTEGER NOT NULL,deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS ws_preset_versions(preset_id TEXT NOT NULL REFERENCES ws_presets(id),version INTEGER NOT NULL,name TEXT NOT NULL,body TEXT NOT NULL,editor_user_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(preset_id,version));
      CREATE TABLE IF NOT EXISTS ws_selections(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,version INTEGER NOT NULL,selected INTEGER NOT NULL,editor_user_id TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(workspace_id,project_id,asset_id),FOREIGN KEY(workspace_id,project_id,asset_id) REFERENCES ws_assets(workspace_id,project_id,asset_id));
      CREATE TABLE IF NOT EXISTS ws_galleries(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,title TEXT NOT NULL,asset_ids TEXT NOT NULL,allow_download INTEGER NOT NULL,client_selection INTEGER NOT NULL,expires_at TEXT,published_by TEXT,published_at TEXT,created_at TEXT NOT NULL,deleted_at TEXT,FOREIGN KEY(workspace_id,project_id) REFERENCES ws_projects(workspace_id,id));
      CREATE TABLE IF NOT EXISTS ws_audit(id INTEGER PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),actor_user_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT NOT NULL,created_at TEXT NOT NULL,details TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS ws_recipe_immutable_update BEFORE UPDATE ON ws_recipe_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECIPE_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_recipe_immutable_delete BEFORE DELETE ON ws_recipe_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECIPE_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_preset_immutable_update BEFORE UPDATE ON ws_preset_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PRESET_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_preset_immutable_delete BEFORE DELETE ON ws_preset_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PRESET_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_audit_immutable_update BEFORE UPDATE ON ws_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
      CREATE TRIGGER IF NOT EXISTS ws_audit_immutable_delete BEFORE DELETE ON ws_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
    `);
  }
  close(): void {this.db.close();}
  /** Internal routing probe, not an authorization decision or public enumeration endpoint. */
  hasWorkspace(workspaceId: string): boolean {return !!this.db.prepare('SELECT 1 FROM ws_workspaces WHERE id=?').get(workspaceId);}
  private now(): string {return this.clock().toISOString();}
  private transaction<T>(operation: () => T): T {this.db.exec('BEGIN IMMEDIATE'); try {const result = operation(); this.db.exec('COMMIT'); return result;} catch (error) {this.db.exec('ROLLBACK'); throw error;}}
  private log(actor: WorkspaceActor, workspaceId: string, action: string, targetId: string, details: Record<string, unknown> = {}): void {this.db.prepare('INSERT INTO ws_audit(workspace_id,actor_user_id,action,target_id,created_at,details) VALUES(?,?,?,?,?,?)').run(workspaceId, subject(actor), action, targetId, this.now(), JSON.stringify(details));}
  private workspace(row: Row): Workspace {return {id: String(row.id), name: String(row.name), createdBy: String(row.created_by), createdAt: String(row.created_at), deletedAt: nullable(row.deleted_at)};}
  private member(row: Row): WorkspaceMember {return {workspaceId: String(row.workspace_id), userId: String(row.user_id), role: String(row.role) as WorkspaceRole, joinedAt: String(row.joined_at), removedAt: nullable(row.removed_at)};}
  private invitation(row: Row): WorkspaceInvitation {return {id: String(row.id), workspaceId: String(row.workspace_id), email: String(row.email), role: String(row.role) as WorkspaceInvitation['role'], state: String(row.state) as WorkspaceInvitation['state'], expiresAt: String(row.expires_at), createdBy: String(row.created_by), acceptedBy: nullable(row.accepted_by), createdAt: String(row.created_at)};}
  private project(row: Row): WorkspaceProject {return {id: String(row.id), workspaceId: String(row.workspace_id), name: String(row.name), createdBy: String(row.created_by), createdAt: String(row.created_at), deletedAt: nullable(row.deleted_at)};}
  private requireMember(actor: WorkspaceActor, workspaceId: string, permission: WorkspacePermission, includeDeleted = false): WorkspaceMember {
    const row = this.db.prepare('SELECT m.*,w.deleted_at AS workspace_deleted FROM ws_members m JOIN ws_workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=? AND m.user_id=? AND m.removed_at IS NULL').get(workspaceId, subject(actor));
    if (!row || (!includeDeleted && row.workspace_deleted !== null)) throw new Error('FORBIDDEN');
    const member = this.member(row);
    if (!Object.hasOwn(permissions, permission) || !permissions[permission].includes(member.role)) throw new Error('FORBIDDEN');
    return member;
  }
  authorize(actor: WorkspaceActor, workspaceId: string, permission: WorkspacePermission): WorkspaceMember {return this.requireMember(actor, workspaceId, permission);}
  createWorkspace(actor: WorkspaceActor, name: string): Workspace {return this.transaction(() => {
    const id = randomUUID(), timestamp = this.now(), userId = subject(actor);
    this.db.prepare('INSERT INTO ws_workspaces(id,name,created_by,created_at) VALUES(?,?,?,?)').run(id, text(name), userId, timestamp);
    this.db.prepare("INSERT INTO ws_members(workspace_id,user_id,role,joined_at) VALUES(?,?,'OWNER',?)").run(id, userId, timestamp);
    this.log(actor, id, 'workspace-created', id); return this.getWorkspace(actor, id);
  });}
  listWorkspaces(actor: WorkspaceActor): Workspace[] {return this.db.prepare('SELECT w.* FROM ws_workspaces w JOIN ws_members m ON m.workspace_id=w.id WHERE m.user_id=? AND m.removed_at IS NULL AND w.deleted_at IS NULL ORDER BY w.created_at,w.id').all(subject(actor)).map(row => this.workspace(row));}
  getWorkspace(actor: WorkspaceActor, workspaceId: string): Workspace {this.requireMember(actor, workspaceId, 'read'); return this.workspace(this.db.prepare('SELECT * FROM ws_workspaces WHERE id=?').get(workspaceId)!);}
  listMembers(actor: WorkspaceActor, workspaceId: string): WorkspaceMember[] {this.requireMember(actor, workspaceId, 'read'); return this.db.prepare('SELECT * FROM ws_members WHERE workspace_id=? AND removed_at IS NULL ORDER BY user_id').all(workspaceId).map(row => this.member(row));}
  private mutableMember(actor: WorkspaceActor, workspaceId: string, userId: string, nextRole?: WorkspaceRole): Row {
    const acting = this.requireMember(actor, workspaceId, 'manage-members');
    const row = this.db.prepare('SELECT * FROM ws_members WHERE workspace_id=? AND user_id=? AND removed_at IS NULL').get(workspaceId, subject({userId}));
    if (!row) throw new Error('MEMBER_NOT_FOUND');
    if ((row.role === 'OWNER' || nextRole === 'OWNER') && acting.role !== 'OWNER') throw new Error('FORBIDDEN');
    if (row.role === 'OWNER' && nextRole !== 'OWNER' && Number(this.db.prepare("SELECT COUNT(*) AS count FROM ws_members WHERE workspace_id=? AND role='OWNER' AND removed_at IS NULL").get(workspaceId)!.count) <= 1) throw new Error('LAST_OWNER');
    return row;
  }
  setMemberRole(actor: WorkspaceActor, workspaceId: string, userId: string, role: WorkspaceRole): WorkspaceMember {return this.transaction(() => {if (!roles.includes(role)) throw new Error('INVALID_ROLE'); const previous = this.mutableMember(actor, workspaceId, userId, role); this.db.prepare('UPDATE ws_members SET role=? WHERE workspace_id=? AND user_id=?').run(role, workspaceId, userId); this.log(actor, workspaceId, 'member-role-changed', userId, {from: previous.role, to: role}); return this.member(this.db.prepare('SELECT * FROM ws_members WHERE workspace_id=? AND user_id=?').get(workspaceId, userId)!);});}
  removeMember(actor: WorkspaceActor, workspaceId: string, userId: string): void {this.transaction(() => {this.mutableMember(actor, workspaceId, userId); this.db.prepare('UPDATE ws_members SET removed_at=? WHERE workspace_id=? AND user_id=?').run(this.now(), workspaceId, userId); this.log(actor, workspaceId, 'member-removed', userId);});}
  inviteMember(actor: WorkspaceActor, workspaceId: string, input: {email: string; role: Exclude<WorkspaceRole, 'OWNER'>; expiresAt: string}): {invitation: WorkspaceInvitation; token: string} {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'manage-members');
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(input.role)) throw new Error('INVALID_ROLE');
    const email = normalizedEmail(input.email), expiresAt = this.futureDate(input.expiresAt), existing = this.db.prepare("SELECT * FROM ws_invitations WHERE workspace_id=? AND email=? AND state='pending'").get(workspaceId, email);
    if (existing && String(existing.expires_at) > this.now()) throw new Error('INVITATION_EXISTS');
    if (existing) {this.db.prepare("UPDATE ws_invitations SET state='revoked' WHERE id=?").run(String(existing.id)); this.log(actor, workspaceId, 'expired-invitation-replaced', String(existing.id));}
    const accepted = this.db.prepare("SELECT 1 FROM ws_invitations i JOIN ws_members m ON m.workspace_id=i.workspace_id AND m.user_id=i.accepted_by WHERE i.workspace_id=? AND i.email=? AND i.state='accepted' AND m.removed_at IS NULL").get(workspaceId, email);
    if (accepted) throw new Error('ALREADY_MEMBER');
    const id = randomUUID(), token = randomBytes(32).toString('base64url');
    this.db.prepare("INSERT INTO ws_invitations(id,workspace_id,email,role,token_hash,state,expires_at,created_by,created_at) VALUES(?,?,?,?,?,'pending',?,?,?)").run(id, workspaceId, email, input.role, hashToken(token), expiresAt, subject(actor), this.now());
    this.log(actor, workspaceId, 'member-invited', id, {role: input.role});
    return {invitation: this.invitation(this.db.prepare('SELECT * FROM ws_invitations WHERE id=?').get(id)!), token};
  });}
  private futureDate(value: string): string {const date = new Date(value); if (!Number.isFinite(date.valueOf()) || date.valueOf() <= this.clock().valueOf()) throw new Error('INVALID_EXPIRY'); return date.toISOString();}
  acceptInvitation(actor: WorkspaceActor, workspaceId: string, token: string, verifiedEmail: string): WorkspaceMember {return this.transaction(() => {
    const userId = subject(actor), email = normalizedEmail(verifiedEmail);
    if (typeof token !== 'string' || token.length > 512 || token.length < 32) throw new Error('INVALID_INVITATION');
    const row = this.db.prepare('SELECT i.* FROM ws_invitations i JOIN ws_workspaces w ON w.id=i.workspace_id WHERE i.workspace_id=? AND i.token_hash=? AND w.deleted_at IS NULL').get(workspaceId, hashToken(token));
    if (!row || row.email !== email || row.state === 'revoked') throw new Error('INVALID_INVITATION');
    if (row.state === 'accepted') {if (row.accepted_by !== userId) throw new Error('INVALID_INVITATION'); return this.requireMember(actor, workspaceId, 'read');}
    if (String(row.expires_at) <= this.now()) throw new Error('INVITATION_EXPIRED');
    // A removed/demoted inviter cannot leave a still-usable privilege grant behind.
    this.requireMember({userId: String(row.created_by)}, workspaceId, 'manage-members');
    const existing = this.db.prepare('SELECT * FROM ws_members WHERE workspace_id=? AND user_id=?').get(workspaceId, userId);
    if (existing && existing.removed_at === null) throw new Error('ALREADY_MEMBER');
    this.db.prepare('INSERT INTO ws_members(workspace_id,user_id,role,joined_at,removed_at) VALUES(?,?,?,?,NULL) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role,joined_at=excluded.joined_at,removed_at=NULL').run(workspaceId, userId, String(row.role), this.now());
    this.db.prepare("UPDATE ws_invitations SET state='accepted',accepted_by=? WHERE id=?").run(userId, String(row.id));
    this.log(actor, workspaceId, 'invitation-accepted', String(row.id)); return this.requireMember(actor, workspaceId, 'read');
  });}
  listInvitations(actor: WorkspaceActor, workspaceId: string): WorkspaceInvitation[] {this.requireMember(actor, workspaceId, 'manage-members'); return this.db.prepare('SELECT * FROM ws_invitations WHERE workspace_id=? ORDER BY created_at,id').all(workspaceId).map(row => this.invitation(row));}
  revokeInvitation(actor: WorkspaceActor, workspaceId: string, invitationId: string): void {this.transaction(() => {this.requireMember(actor, workspaceId, 'manage-members'); const row = this.db.prepare('SELECT * FROM ws_invitations WHERE workspace_id=? AND id=?').get(workspaceId, invitationId); if (!row || row.state !== 'pending') throw new Error('INVALID_INVITATION'); this.db.prepare("UPDATE ws_invitations SET state='revoked' WHERE id=?").run(invitationId); this.log(actor, workspaceId, 'invitation-revoked', invitationId);});}
  createProject(actor: WorkspaceActor, workspaceId: string, name: string): WorkspaceProject {return this.transaction(() => {this.requireMember(actor, workspaceId, 'manage-projects'); const id = randomUUID(); this.db.prepare('INSERT INTO ws_projects(id,workspace_id,name,created_by,created_at) VALUES(?,?,?,?,?)').run(id, workspaceId, text(name), subject(actor), this.now()); this.log(actor, workspaceId, 'project-created', id); return this.getProject(actor, workspaceId, id);});}
  getProject(actor: WorkspaceActor, workspaceId: string, projectId: string, includeDeleted = false): WorkspaceProject {this.requireMember(actor, workspaceId, includeDeleted ? 'delete' : 'read'); const row = this.db.prepare('SELECT * FROM ws_projects WHERE workspace_id=? AND id=?').get(workspaceId, projectId); if (!row || (!includeDeleted && row.deleted_at !== null)) throw new Error('PROJECT_NOT_FOUND'); return this.project(row);}
  listProjects(actor: WorkspaceActor, workspaceId: string): WorkspaceProject[] {this.requireMember(actor, workspaceId, 'read'); return this.db.prepare('SELECT * FROM ws_projects WHERE workspace_id=? AND deleted_at IS NULL ORDER BY created_at,id').all(workspaceId).map(row => this.project(row));}
  registerAsset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): Asset {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'edit'); this.getProject(actor, workspaceId, projectId);
    const asset = this.resolveAsset(workspaceId, assetId);
    const row = this.db.prepare('SELECT * FROM ws_assets WHERE workspace_id=? AND asset_id=?').get(workspaceId, assetId);
    if (row) {if (row.project_id !== projectId || row.deleted_at !== null) throw new Error('ASSET_ALREADY_REGISTERED'); return this.getAsset(actor, workspaceId, projectId, assetId);}
    this.db.prepare('INSERT INTO ws_assets(workspace_id,project_id,asset_id,original_key,sha256,registered_by,created_at) VALUES(?,?,?,?,?,?,?)').run(workspaceId, projectId, assetId, asset.originalKey, asset.sha256, subject(actor), this.now());
    this.log(actor, workspaceId, 'asset-registered', assetId, {projectId}); return asset;
  });}
  private resolveAsset(workspaceId: string, assetId: string, includeDeleted = false): Asset {const asset = this.assetLookup(workspaceId, assetId, includeDeleted); if (asset.tenantId !== workspaceId || asset.id !== assetId || (!includeDeleted && asset.deletedAt !== null)) throw new Error('ASSET_NOT_FOUND'); return asset;}
  getAsset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, includeDeleted = false): Asset {
    this.requireMember(actor, workspaceId, includeDeleted ? 'delete' : 'read'); this.getProject(actor, workspaceId, projectId);
    const row = this.db.prepare('SELECT * FROM ws_assets WHERE workspace_id=? AND project_id=? AND asset_id=?').get(workspaceId, projectId, assetId);
    if (!row || (!includeDeleted && row.deleted_at !== null)) throw new Error('ASSET_NOT_FOUND');
    const asset = this.resolveAsset(workspaceId, assetId, includeDeleted);
    if (asset.originalKey !== row.original_key || asset.sha256 !== row.sha256) throw new Error('ORIGINAL_IDENTITY_CHANGED');
    return {...asset, deletedAt: nullable(row.deleted_at) ?? asset.deletedAt};
  }
  listAssets(actor: WorkspaceActor, workspaceId: string, projectId: string): Asset[] {this.getProject(actor, workspaceId, projectId); return this.db.prepare('SELECT asset_id FROM ws_assets WHERE workspace_id=? AND project_id=? AND deleted_at IS NULL ORDER BY created_at,asset_id').all(workspaceId, projectId).map(row => this.getAsset(actor, workspaceId, projectId, String(row.asset_id)));}
  /** Internal reconciliation accessor only: deleted references remain visible to authorized recovery operations. */
  registeredAssetStates(actor: WorkspaceActor, workspaceId: string, projectId: string): {assetId: string; trashed: boolean}[] {
    this.requireMember(actor, workspaceId, 'delete');
    this.getProject(actor, workspaceId, projectId, true);
    return this.db.prepare('SELECT a.asset_id,a.deleted_at AS asset_deleted,p.deleted_at AS project_deleted FROM ws_assets a JOIN ws_projects p ON p.workspace_id=a.workspace_id AND p.id=a.project_id WHERE a.workspace_id=? AND a.project_id=? ORDER BY a.created_at,a.asset_id').all(workspaceId, projectId).map(row => ({assetId: String(row.asset_id), trashed: row.asset_deleted !== null || row.project_deleted !== null}));
  }
  private recipeVersion(row: Row): TeamRecipeVersion {return {id: String(row.id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), assetId: String(row.asset_id), editorUserId: String(row.editor_user_id), createdAt: String(row.created_at), updatedAt: String(row.created_at), version: Number(row.version), parentVersion: Number(row.parent_version), branch: row.branch === 1, body: JSON.parse(String(row.body)), changedFields: JSON.parse(String(row.changed_fields)), presetSnapshot: row.preset_snapshot === null ? null : JSON.parse(String(row.preset_snapshot))};}
  private portrait(body: Record<string, unknown>): unknown {
    return ((body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>).portrait;
  }
  private validatedRecipeHistory(asset: Asset, workspaceId: string, projectId: string): TeamRecipeVersion[] {
    let reference: unknown;
    return this.db.prepare('SELECT * FROM ws_recipe_versions WHERE workspace_id=? AND project_id=? AND asset_id=? ORDER BY version').all(workspaceId, projectId, asset.id).map(row => {
      const version = this.recipeVersion(row);
      validateRecipe(version.body);
      const portrait = this.portrait(version.body);
      if (portrait !== undefined) {
        validatePortraitBinding(portrait, asset.id, asset.sha256);
        if (reference === undefined) reference = portrait;
        else validatePortraitContinuity(reference, portrait);
      }
      return version;
    });
  }
  getRecipeVersion(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, version: number): TeamRecipeVersion {
    const asset = this.getAsset(actor, workspaceId, projectId, assetId); revision(version);
    const found = this.validatedRecipeHistory(asset, workspaceId, projectId).find(item => item.version === version);
    if (!found) throw new Error('VERSION_NOT_FOUND'); return found;
  }
  latestRecipe(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): TeamRecipeVersion | null {
    const asset = this.getAsset(actor, workspaceId, projectId, assetId);
    const row = this.db.prepare('SELECT v.* FROM ws_recipe_heads h JOIN ws_recipe_versions v ON v.workspace_id=h.workspace_id AND v.project_id=h.project_id AND v.asset_id=h.asset_id AND v.version=h.version WHERE h.workspace_id=? AND h.project_id=? AND h.asset_id=?').get(workspaceId, projectId, assetId);
    const history = this.validatedRecipeHistory(asset, workspaceId, projectId);
    return row ? history.find(item => item.version === Number(row.version)) ?? null : null;
  }
  recipeHistory(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): TeamRecipeVersion[] {
    const asset = this.getAsset(actor, workspaceId, projectId, assetId);
    return this.validatedRecipeHistory(asset, workspaceId, projectId);
  }
  saveRecipe(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, input: {baseVersion: number; body: unknown; presetId?: string}): TeamRecipeSaveResult {return this.transaction(() => this.commitRecipe(actor, workspaceId, projectId, assetId, input));}
  private commitRecipe(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, input: {baseVersion: number; body: unknown; presetId?: string}): TeamRecipeSaveResult {
    this.requireMember(actor, workspaceId, 'edit'); const asset = this.getAsset(actor, workspaceId, projectId, assetId); revision(input.baseVersion);
    const encoded = recipeJSON(input.body), body = JSON.parse(encoded) as Record<string, unknown>;
    const incoming = this.portrait(body);
    if (incoming !== undefined) {
      validatePortraitBinding(incoming, asset.id, asset.sha256);
      const reference = this.validatedRecipeHistory(asset, workspaceId, projectId).map(v => this.portrait(v.body)).find(p => p !== undefined);
      if (reference !== undefined) validatePortraitContinuity(reference, incoming);
    }
    const current = this.latestRecipe(actor, workspaceId, projectId, assetId);
    const base = input.baseVersion === 0 ? null : this.getRecipeVersion(actor, workspaceId, projectId, assetId, input.baseVersion);
    const currentVersion = current?.version ?? 0, conflict = currentVersion !== input.baseVersion;
    const version = Number(this.db.prepare('SELECT COALESCE(MAX(version),0) AS version FROM ws_recipe_versions WHERE workspace_id=? AND project_id=? AND asset_id=?').get(workspaceId, projectId, assetId)!.version) + 1;
    revision(version);
    const preset = input.presetId === undefined ? null : this.getPreset(actor, workspaceId, input.presetId);
    const presetSnapshot = preset ? {id: preset.id, version: preset.version, body: preset.body} : null;
    const changedFields = recipeDifferences(base?.body ?? {}, body), diff = recipeDifferences(current?.body ?? {}, body), id = randomUUID();
    this.db.prepare('INSERT INTO ws_recipe_versions(id,workspace_id,project_id,asset_id,version,parent_version,editor_user_id,created_at,branch,body,changed_fields,preset_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, workspaceId, projectId, assetId, version, input.baseVersion, subject(actor), this.now(), conflict ? 1 : 0, encoded, JSON.stringify(changedFields), presetSnapshot ? JSON.stringify(presetSnapshot) : null);
    if (!conflict) this.db.prepare('INSERT INTO ws_recipe_heads(workspace_id,project_id,asset_id,version) VALUES(?,?,?,?) ON CONFLICT(workspace_id,project_id,asset_id) DO UPDATE SET version=excluded.version').run(workspaceId, projectId, assetId, version);
    this.log(actor, workspaceId, conflict ? 'recipe-conflict-preserved' : 'recipe-saved', assetId, {projectId, version, baseVersion: input.baseVersion, previousHead: currentVersion, changedFields});
    return {outcome: conflict ? 'conflict' : 'saved', version: this.getRecipeVersion(actor, workspaceId, projectId, assetId, version), currentVersion: conflict ? currentVersion : version, diff};
  }
  applyPreset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, baseVersion: number, presetId: string): TeamRecipeSaveResult {
    return this.transaction(() => {
      this.requireMember(actor, workspaceId, 'edit');
      const preset = this.getPreset(actor, workspaceId, presetId);
      return this.commitRecipe(actor, workspaceId, projectId, assetId, {baseVersion, body: preset.body, presetId});
    });
  }
  private preset(row: Row): TeamPreset {return {id: String(row.id), workspaceId: String(row.workspace_id), scope: String(row.scope) as PresetScope, ownerUserId: String(row.owner_user_id), name: String(row.name), version: Number(row.current_version), body: JSON.parse(String(row.body)), createdAt: String(row.created_at), updatedAt: String(row.version_created_at), deletedAt: nullable(row.deleted_at)};}
  getPreset(actor: WorkspaceActor, workspaceId: string, presetId: string): TeamPreset {
    this.requireMember(actor, workspaceId, 'read');
    const row = this.db.prepare('SELECT p.*,v.name,v.body,v.created_at AS version_created_at FROM ws_presets p JOIN ws_preset_versions v ON v.preset_id=p.id AND v.version=p.current_version WHERE p.workspace_id=? AND p.id=? AND p.deleted_at IS NULL').get(workspaceId, presetId);
    if (!row || (row.scope === 'PERSONAL' && row.owner_user_id !== subject(actor))) throw new Error('PRESET_NOT_FOUND'); return this.preset(row);
  }
  listPresets(actor: WorkspaceActor, workspaceId: string): TeamPreset[] {
    this.requireMember(actor, workspaceId, 'read');
    return this.db.prepare("SELECT p.*,v.name,v.body,v.created_at AS version_created_at FROM ws_presets p JOIN ws_preset_versions v ON v.preset_id=p.id AND v.version=p.current_version WHERE p.workspace_id=? AND p.deleted_at IS NULL AND (p.scope<>'PERSONAL' OR p.owner_user_id=?) ORDER BY p.created_at,p.id").all(workspaceId, subject(actor)).map(row => this.preset(row));
  }
  createPreset(actor: WorkspaceActor, workspaceId: string, input: {name: string; body: unknown; scope?: PresetScope}): TeamPreset {return this.transaction(() => {
    const scope = input.scope ?? 'WORKSPACE';
    if (!['PERSONAL', 'WORKSPACE', 'COMMUNITY'].includes(scope)) throw new Error('INVALID_PRESET_SCOPE');
    // COMMUNITY is a reserved scope, not an implemented public publishing service.
    if (scope === 'COMMUNITY') throw new Error('COMMUNITY_NOT_IMPLEMENTED');
    this.requireMember(actor, workspaceId, scope === 'PERSONAL' ? 'edit' : 'manage-presets');
    const body = recipeJSON(input.body), id = randomUUID(), timestamp = this.now();
    this.db.prepare('INSERT INTO ws_presets(id,workspace_id,scope,owner_user_id,created_at,current_version) VALUES(?,?,?,?,?,1)').run(id, workspaceId, scope, subject(actor), timestamp);
    this.db.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,1,?,?,?,?)').run(id, text(input.name), body, subject(actor), timestamp);
    this.log(actor, workspaceId, 'preset-created', id, {scope}); return this.getPreset(actor, workspaceId, id);
  });}
  private requirePresetEditor(actor: WorkspaceActor, workspaceId: string, preset: TeamPreset): void {
    this.requireMember(actor, workspaceId, preset.scope === 'PERSONAL' && preset.ownerUserId === subject(actor) ? 'edit' : 'manage-presets');
  }
  updatePreset(actor: WorkspaceActor, workspaceId: string, presetId: string, input: {baseVersion: number; name: string; body: unknown}): TeamPreset {return this.transaction(() => {
    const existing = this.getPreset(actor, workspaceId, presetId); this.requirePresetEditor(actor, workspaceId, existing); revision(input.baseVersion);
    if (existing.version !== input.baseVersion) throw new Error('PRESET_VERSION_CONFLICT');
    const body = recipeJSON(input.body), version = existing.version + 1; revision(version);
    this.db.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,?,?,?,?,?)').run(presetId, version, text(input.name), body, subject(actor), this.now());
    this.db.prepare('UPDATE ws_presets SET current_version=? WHERE id=? AND workspace_id=?').run(version, presetId, workspaceId);
    this.log(actor, workspaceId, 'preset-updated', presetId, {baseVersion: input.baseVersion, version}); return this.getPreset(actor, workspaceId, presetId);
  });}
  deletePreset(actor: WorkspaceActor, workspaceId: string, presetId: string): void {this.transaction(() => {
    const preset = this.getPreset(actor, workspaceId, presetId); this.requirePresetEditor(actor, workspaceId, preset);
    this.db.prepare('UPDATE ws_presets SET deleted_at=? WHERE id=? AND workspace_id=?').run(this.now(), presetId, workspaceId);
    this.log(actor, workspaceId, 'preset-deleted', presetId, {version: preset.version});
  });}
  private selection(row: Row): TeamSelection {return {workspaceId: String(row.workspace_id), projectId: String(row.project_id), assetId: String(row.asset_id), version: Number(row.version), selected: row.selected === 1, editorUserId: String(row.editor_user_id), updatedAt: String(row.updated_at)};}
  getSelection(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): TeamSelection | null {
    this.getAsset(actor, workspaceId, projectId, assetId);
    const row = this.db.prepare('SELECT * FROM ws_selections WHERE workspace_id=? AND project_id=? AND asset_id=?').get(workspaceId, projectId, assetId); return row ? this.selection(row) : null;
  }
  saveSelection(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, input: {baseVersion: number; selected: boolean}): TeamSelection {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'select'); this.getAsset(actor, workspaceId, projectId, assetId); revision(input.baseVersion);
    if (typeof input.selected !== 'boolean') throw new Error('INVALID_SELECTION');
    const existing = this.getSelection(actor, workspaceId, projectId, assetId); if ((existing?.version ?? 0) !== input.baseVersion) throw new Error('SELECTION_VERSION_CONFLICT');
    const version = input.baseVersion + 1; revision(version);
    this.db.prepare('INSERT INTO ws_selections(workspace_id,project_id,asset_id,version,selected,editor_user_id,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,project_id,asset_id) DO UPDATE SET version=excluded.version,selected=excluded.selected,editor_user_id=excluded.editor_user_id,updated_at=excluded.updated_at').run(workspaceId, projectId, assetId, version, input.selected ? 1 : 0, subject(actor), this.now());
    this.log(actor, workspaceId, 'selection-saved', assetId, {projectId, version, before: existing?.selected ?? false, after: input.selected}); return this.getSelection(actor, workspaceId, projectId, assetId)!;
  });}
  trashAsset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): void {this.transaction(() => {
    this.requireMember(actor, workspaceId, 'delete'); this.getAsset(actor, workspaceId, projectId, assetId);
    this.db.prepare('UPDATE ws_assets SET deleted_at=? WHERE workspace_id=? AND project_id=? AND asset_id=?').run(this.now(), workspaceId, projectId, assetId); this.log(actor, workspaceId, 'asset-deleted', assetId, {projectId, physicalDeletion: false});
  });}
  restoreAsset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): Asset {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'delete'); this.getAsset(actor, workspaceId, projectId, assetId, true);
    this.db.prepare('UPDATE ws_assets SET deleted_at=NULL WHERE workspace_id=? AND project_id=? AND asset_id=?').run(workspaceId, projectId, assetId); this.log(actor, workspaceId, 'asset-recovered', assetId, {projectId}); return this.getAsset(actor, workspaceId, projectId, assetId);
  });}
  trashProject(actor: WorkspaceActor, workspaceId: string, projectId: string): void {this.transaction(() => {
    this.requireMember(actor, workspaceId, 'manage-projects'); this.getProject(actor, workspaceId, projectId);
    this.db.prepare('UPDATE ws_projects SET deleted_at=? WHERE workspace_id=? AND id=?').run(this.now(), workspaceId, projectId); this.log(actor, workspaceId, 'project-deleted', projectId, {physicalDeletion: false});
  });}
  restoreProject(actor: WorkspaceActor, workspaceId: string, projectId: string): WorkspaceProject {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'manage-projects'); this.getProject(actor, workspaceId, projectId, true);
    this.db.prepare('UPDATE ws_projects SET deleted_at=NULL WHERE workspace_id=? AND id=?').run(workspaceId, projectId); this.log(actor, workspaceId, 'project-recovered', projectId); return this.getProject(actor, workspaceId, projectId);
  });}
  /** Server integration calls this AFTER a verified operation; never expose arbitrary action/details from HTTP. */
  recordEvent(actor: WorkspaceActor, workspaceId: string, action: 'login' | 'export' | 'storage-plan-changed' | 'billing-changed', targetId: string, details: Record<string, unknown> = {}): void {
    const required: Record<typeof action, WorkspacePermission> = {login: 'read', export: 'export', 'storage-plan-changed': 'owner', 'billing-changed': 'owner'};
    if (!Object.hasOwn(required, action)) throw new Error('INVALID_AUDIT_ACTION');
    this.requireMember(actor, workspaceId, required[action]); this.log(actor, workspaceId, action, text(targetId, 512), details);
  }
  listAudit(actor: WorkspaceActor, workspaceId: string): WorkspaceAuditEvent[] {
    this.requireMember(actor, workspaceId, 'audit'); return this.db.prepare('SELECT * FROM ws_audit WHERE workspace_id=? ORDER BY id').all(workspaceId).map(row => ({id: Number(row.id), workspaceId, actorUserId: String(row.actor_user_id), action: String(row.action), targetId: String(row.target_id), createdAt: String(row.created_at), details: JSON.parse(String(row.details))}));
  }
}
