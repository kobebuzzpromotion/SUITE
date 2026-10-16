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
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('INVALID_REVISION');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Keep both Asset bindings, previous history and revision CAS inside one
      // SQLite write transaction; a separate process cannot trash a backdrop
      // between validation and Recipe commit.
      const asset = this.get(tenantId, id);
      this.validateBoundRecipe(body, asset);
      const extra = ((body as Record<string, unknown>).parameters as Record<string, unknown>)
        .extendedParameters as Record<string, unknown>;
      if (Object.hasOwn(extra, 'originalShadowManual') && expectedRevision === 0)
        throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_SAVED_BASE');
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
  /** Complete committed main history, bounded before loading bodies. No branch rows exist in this schema. */
  listRecipeHistory(tenantId: string, id: string): {revision: number; body: unknown}[] {
    // One read snapshot keeps the size preflight, bindings and rows coherent
    // if another backend process saves or trashes an Asset concurrently.
    this.db.exec('BEGIN');
    try {
      const asset = this.get(tenantId, id);
      const maximum = 1000, byteLimit = 16 * 1024 * 1024;
      const size = this.db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(body AS BLOB))),0) AS bytes FROM recipes WHERE asset_id=?').get(id);
      if (!size || typeof size.count !== 'number' || typeof size.bytes !== 'number' ||
          !Number.isSafeInteger(size.count) || !Number.isSafeInteger(size.bytes) || size.count < 0 || size.bytes < 0)
        throw new Error('CORRUPT_RECIPE_HISTORY');
      if (size.count > maximum || size.bytes > byteLimit) throw new Error('RECIPE_HISTORY_LIMIT');
      const rows = this.db.prepare('SELECT revision,body FROM recipes WHERE asset_id=? ORDER BY revision LIMIT ?').all(id, maximum + 1);
      if (rows.length > maximum) throw new Error('RECIPE_HISTORY_LIMIT');
      if (rows.length !== size.count) throw new Error('CORRUPT_RECIPE_HISTORY');
      const history: {revision: number; body: unknown}[] = [];
      let previous = 0, bytes = 0, reference: unknown;
      for (const row of rows) {
        if (typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) ||
            row.revision !== previous + 1 || typeof row.body !== 'string')
          throw new Error('CORRUPT_RECIPE_HISTORY');
        bytes += Buffer.byteLength(row.body, 'utf8');
        if (bytes > byteLimit) throw new Error('RECIPE_HISTORY_LIMIT');
        const body: unknown = JSON.parse(row.body);
        this.validateBoundRecipe(body, asset);
        const portrait = this.portrait(body);
        if (portrait !== undefined) {
          if (reference === undefined) reference = portrait;
          else validatePortraitContinuity(reference, portrait);
        }
        history.push({revision: row.revision, body});previous = row.revision;
      }
      this.db.exec('COMMIT');
      return history;
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
  }
  private validateBoundRecipe(body: unknown, asset: Asset): void {
    validateRecipe(body);
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (Object.hasOwn(extra, 'portrait')) validatePortraitBinding(extra.portrait, asset.id, asset.sha256);
    if (Object.hasOwn(extra, 'bwEdgeManual')) {
      const manual = extra.bwEdgeManual as Record<string, unknown>;
      const binding = manual.binding as Record<string, unknown>;
      // The typed Recipe validator checks shape and the 8 MP source-size cap.
      // Asset rows do not attest decoded dimensions; Final must check those.
      if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
          String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('INVALID_BW_EDGE_MANUAL_BINDING');
    }
    if (Object.hasOwn(extra, 'clothingSpotManual')) {
      const manual = extra.clothingSpotManual as Record<string, unknown>;
      const binding = manual.binding as Record<string, unknown>;
      // The authenticated tenant lookup supplies the real, non-trashed Asset.
      // Recipe binding strings are untrusted until compared with that row.
      // Asset metadata does not prove decoded Original width/height.
      if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
          String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('INVALID_CLOTHING_SPOT_MANUAL_BINDING');
    }
    if (Object.hasOwn(extra, 'contactsIrisManual')) {
      const manual = extra.contactsIrisManual as Record<string, unknown>;
      const binding = manual.binding as Record<string, unknown>;
      // The JWT-scoped tenant lookup supplies the current non-trashed Asset.
      // JSON person/eye/dimensions are not authenticated privacy or decode proof.
      if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
          String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('INVALID_CONTACTS_IRIS_MANUAL_BINDING');
    }
    if (Object.hasOwn(extra, 'faceDecorationsManual')) {
      const manual = extra.faceDecorationsManual as Record<string, unknown>;
      const binding = manual.binding as Record<string, unknown>;
      // Tenant-scoped current Asset/SHA is real registration evidence.
      // JSON person, authored face location and dimensions are not.
      if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
          String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('INVALID_FACE_DECORATIONS_MANUAL_BINDING');
    }
    if (Object.hasOwn(extra, 'handToneManual')) {
      const manual = extra.handToneManual as Record<string, unknown>;
      const binding = manual.binding as Record<string, unknown>;
      // The JWT-scoped tenant lookup supplied this real, non-trashed Asset.
      // The photo-bound JSON is not permission evidence or decoded dimensions.
      if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
          String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('INVALID_HAND_TONE_MANUAL_BINDING');
    }
    if (Object.hasOwn(extra, 'eyelinerManual')) {
      const manual = extra.eyelinerManual as Record<string, unknown>;
      const binding = manual.binding as Record<string, unknown>;
      // Tenant-scoped, non-trashed registration is the current Asset/SHA
      // evidence. JSON person/eye claims and dimensions are not authority.
      if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
          String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('INVALID_EYELINER_MANUAL_BINDING');
    }
    if (Object.hasOwn(extra, 'eyeshadowManual')) {
      const manual = extra.eyeshadowManual as Record<string, unknown>;
      const binding = manual.binding as Record<string, unknown>;
      // The JWT-scoped tenant lookup supplies the registered, non-trashed
      // Asset/SHA. JSON person, eye and dimensions do not prove consent or
      // decoded Original identity and require a separate product host gate.
      if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
          String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('INVALID_EYESHADOW_MANUAL_BINDING');
    }
    if (Object.hasOwn(extra, 'addShadowManual')) {
      const manual = extra.addShadowManual as Record<string, unknown>;
      const binding = manual.binding as Record<string, unknown>;
      // Shape, stroke limits and dimensions were checked by validateRecipe.
      // These identifiers are untrusted until compared with current rows in
      // this tenant. Original bytes and decoded dimensions are separate gates.
      if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
          String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('INVALID_ADD_SHADOW_MANUAL_BINDING');
      let backdrop: Asset;
      try {backdrop = this.get(asset.tenantId, String(binding.backdropID));}
      catch (error) {
        if ((error as Error).message === 'NOT_FOUND')
          throw new Error('INVALID_ADD_SHADOW_MANUAL_BACKDROP');
        throw error;
      }
      if (String(binding.backdropSHA256).toLowerCase() !== backdrop.sha256.toLowerCase())
        throw new Error('INVALID_ADD_SHADOW_MANUAL_BACKDROP');
    }
    if (Object.hasOwn(extra, 'originalShadowManual')) {
      const manual = extra.originalShadowManual as Record<string, unknown>;
      const binding = manual.binding as Record<string, unknown>;
      // Shape/capacity are typed in validateRecipe; real target and backdrop
      // rows are checked within the same transaction as Recipe CAS. Decoded
      // dimensions and Original bytes are separate gates at Final.
      if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
          String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_BINDING');
      let backdrop: Asset;
      try {backdrop = this.get(asset.tenantId, String(binding.backdropID));}
      catch (error) {
        if ((error as Error).message === 'NOT_FOUND')
          throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_BACKDROP');
        throw error;
      }
      if (String(binding.backdropSHA256).toLowerCase() !== backdrop.sha256.toLowerCase())
        throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_BACKDROP');
    }
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
