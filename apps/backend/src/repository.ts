import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {validateRecipe} from './photo-policy.js';
import {validatePortraitBinding, validatePortraitContinuity} from './portrait-recipe.js';
export interface Asset {id: string; tenantId: string; name: string; originalKey: string; sha256: string; size: number; cloudSafe: boolean; deletedAt: string | null}
export class AssetRepository {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,original_key TEXT UNIQUE NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,cloud_safe INTEGER NOT NULL DEFAULT 0,deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS recipes(asset_id TEXT NOT NULL,revision INTEGER NOT NULL,editor TEXT NOT NULL,updated_at TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(asset_id,revision),FOREIGN KEY(asset_id) REFERENCES assets(id));
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,tenant_id TEXT NOT NULL,asset_id TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL);
    `);
  }
  close() {this.db.close();}
  /** Workspace registration only: same Original is one physical object, not one copy per member. */
  createOrReuse(tenantId: string, input: {name: string; sha256: string; size: number}): Asset {
    if (typeof input.name !== 'string' || !input.name || input.name.length > 255 || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256) || !Number.isSafeInteger(input.size) || input.size <= 0) throw new Error('INVALID_ASSET');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT id,deleted_at FROM assets WHERE tenant_id=? AND sha256=? AND size=? ORDER BY id LIMIT 1').get(tenantId, input.sha256, input.size);
      if (row?.deleted_at) throw new Error('ASSET_IN_TRASH');
      const asset = row ? this.get(tenantId, String(row.id)) : this.create(tenantId, input);
      this.db.exec('COMMIT'); return asset;
    } catch(error) {this.db.exec('ROLLBACK'); throw error;}
  }
  create(tenantId: string, input: {name: string; sha256: string; size: number}): Asset {
    if (typeof input.name !== 'string' || !input.name || input.name.length > 255 || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256) || !Number.isSafeInteger(input.size) || input.size <= 0) throw new Error('INVALID_ASSET');
    const id = randomUUID(), originalKey = 'original-' + randomUUID();
    this.db.prepare('INSERT INTO assets(id,tenant_id,name,original_key,sha256,size) VALUES(?,?,?,?,?,?)').run(id, tenantId, input.name, originalKey, input.sha256, input.size);
    return this.get(tenantId, id);
  }
  get(tenantId: string, id: string, includeDeleted = false): Asset {
    const row = this.db.prepare('SELECT * FROM assets WHERE id=? AND tenant_id=?').get(id, tenantId);
    if (!row || (!includeDeleted && row.deleted_at)) throw new Error('NOT_FOUND');
    return {id: String(row.id), tenantId, name: String(row.name), originalKey: String(row.original_key), sha256: String(row.sha256), size: Number(row.size), cloudSafe: row.cloud_safe === 1, deletedAt: row.deleted_at ? String(row.deleted_at) : null};
  }
  list(tenantId: string) {
    return this.db.prepare('SELECT id FROM assets WHERE tenant_id=? AND deleted_at IS NULL').all(tenantId).map(row => this.get(tenantId, String(row.id)));
  }
  markVerified(tenantId: string, id: string, evidence: {sha256: string; size: number; persisted: boolean}) {
    const asset = this.get(tenantId, id);
    if (!evidence.persisted || evidence.sha256 !== asset.sha256 || evidence.size !== asset.size) throw new Error('VERIFICATION_FAILED');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE assets SET cloud_safe=1 WHERE id=? AND tenant_id=? AND deleted_at IS NULL').run(id, tenantId);
      this.audit(tenantId, id, 'server-object-verified-and-committed');
      this.db.exec('COMMIT');
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
    return this.get(tenantId, id);
  }
  invalidateVerification(tenantId: string, id: string) {
    this.get(tenantId, id);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE assets SET cloud_safe=0 WHERE id=? AND tenant_id=?').run(id, tenantId);
      this.audit(tenantId, id, 'object-verification-invalidated');
      this.db.exec('COMMIT');
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
  }
  saveRecipe(tenantId: string, id: string, editor: string, expectedRevision: number, body: unknown) {
    const asset = this.get(tenantId, id); this.validateBoundRecipe(body, asset);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('INVALID_REVISION');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const latest = this.latestRecipe(tenantId, id);
      if ((latest?.revision ?? 0) !== expectedRevision) throw new Error('REVISION_CONFLICT');
      const incoming = this.portrait(body);
      if (incoming !== undefined) {
        const reference = this.portraitReference(asset);
        if (reference !== undefined) validatePortraitContinuity(reference, incoming);
      }
      const revision = expectedRevision + 1, updatedAt = new Date().toISOString();
      this.db.prepare('INSERT INTO recipes(asset_id,revision,editor,updated_at,body) VALUES(?,?,?,?,?)').run(id, revision, editor, updatedAt, JSON.stringify(body));
      this.audit(tenantId, id, 'recipe-committed');
      this.db.exec('COMMIT');
      return {revision, editor, updatedAt, body};
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
  }
  latestRecipe(tenantId: string, id: string): {revision: number; editor: string; updatedAt: string; body: unknown} | null {
    const asset = this.get(tenantId, id);
    const row = this.db.prepare('SELECT * FROM recipes WHERE asset_id=? ORDER BY revision DESC LIMIT 1').get(id);
    if (!row) return null;
    const body: unknown = JSON.parse(String(row.body));
    // Semantic corruption must not become a valid edit after restart. Keep the row for recovery.
    this.validateBoundRecipe(body, asset);
    this.portraitReference(asset);
    return {revision: Number(row.revision), editor: String(row.editor), updatedAt: String(row.updated_at), body};
  }
  private validateBoundRecipe(body: unknown, asset: Asset): void {
    validateRecipe(body);
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (Object.hasOwn(extra, 'portrait')) validatePortraitBinding(extra.portrait, asset.id, asset.sha256);
  }
  private portrait(body: unknown): unknown {
    const parameters = (body as Record<string, unknown>).parameters as Record<string, unknown>;
    return (parameters.extendedParameters as Record<string, unknown>).portrait;
  }
  private portraitReference(asset: Asset): unknown {
    let reference: unknown;
    for (const row of this.db.prepare('SELECT body FROM recipes WHERE asset_id=? ORDER BY revision').all(asset.id)) {
      const body: unknown = JSON.parse(String(row.body));
      this.validateBoundRecipe(body, asset);
      const portrait = this.portrait(body);
      if (portrait !== undefined) {
        if (reference === undefined) reference = portrait;
        else validatePortraitContinuity(reference, portrait);
      }
    }
    return reference;
  }
  trash(tenantId: string, id: string) {this.get(tenantId, id); this.db.prepare('UPDATE assets SET deleted_at=? WHERE id=? AND tenant_id=?').run(new Date().toISOString(), id, tenantId);}
  restore(tenantId: string, id: string) {this.get(tenantId, id, true); this.db.prepare('UPDATE assets SET deleted_at=NULL WHERE id=? AND tenant_id=?').run(id, tenantId);}
  private audit(tenant: string, asset: string, action: string) {this.db.prepare('INSERT INTO audit(tenant_id,asset_id,action,created_at) VALUES(?,?,?,?)').run(tenant, asset, action, new Date().toISOString());}
}
