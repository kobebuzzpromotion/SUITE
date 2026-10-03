import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import type {ObjectEvidence, StorageProvider} from './storage.js';

interface Session {id: string; tenant: string; operation: string; key: string; sha: string; size: number; partSize: number; complete: boolean}
// Internal development adapter only. No new public API, cloud vendor, or iOS background claim.
// Metadata is durable. Parts and final objects use the same immutable provider contract.
export class MultipartUploads {
  private readonly db: DatabaseSync;
  constructor(path: string, private readonly storage: StorageProvider) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS upload_sessions(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,operation TEXT NOT NULL,object_key TEXT NOT NULL,sha TEXT NOT NULL,size INTEGER NOT NULL,part_size INTEGER NOT NULL,complete INTEGER NOT NULL DEFAULT 0,UNIQUE(tenant,operation));
      CREATE TABLE IF NOT EXISTS upload_parts(session TEXT NOT NULL,part_index INTEGER NOT NULL,sha TEXT NOT NULL,size INTEGER NOT NULL,object_key TEXT,PRIMARY KEY(session,part_index));`);
    if (!this.db.prepare('PRAGMA table_info(upload_parts)').all().some(row => row.name === 'object_key')) this.db.exec('ALTER TABLE upload_parts ADD COLUMN object_key TEXT');
  }
  close() {this.db.close();}
  begin(tenant: string, operation: string, input: {key: string; sha256: string; size: number; partSize: number}): Session {
    if (!tenant || !operation || !/^[a-zA-Z0-9_-]+$/.test(input.key) || !/^[a-f0-9]{64}$/.test(input.sha256) ||
        !Number.isSafeInteger(input.size) || input.size <= 0 || !Number.isSafeInteger(input.partSize) || input.partSize <= 0 || Math.ceil(input.size / input.partSize) > 10000) throw new Error('INVALID_UPLOAD');
    this.db.prepare('INSERT INTO upload_sessions(id,tenant,operation,object_key,sha,size,part_size) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant,operation) DO NOTHING')
      .run(randomUUID(), tenant, operation, input.key, input.sha256, input.size, input.partSize);
    const row = this.db.prepare('SELECT id FROM upload_sessions WHERE tenant=? AND operation=?').get(tenant, operation)!;
    const session = this.get(tenant, String(row.id));
    if (session.key !== input.key || session.sha !== input.sha256 || session.size !== input.size || session.partSize !== input.partSize) throw new Error('IDEMPOTENCY_MISMATCH');
    return session;
  }
  private get(tenant: string, id: string): Session {
    const r = this.db.prepare('SELECT * FROM upload_sessions WHERE id=? AND tenant=?').get(id, tenant);
    if (!r) throw new Error('NOT_FOUND');
    return {id, tenant, operation: String(r.operation), key: String(r.object_key), sha: String(r.sha), size: Number(r.size), partSize: Number(r.part_size), complete: r.complete === 1};
  }
  private partKey(session: Session, index: number) {return 'part-' + session.id + '-' + index;}
  private storedPartKey(session: Session, index: number) {
    const row = this.db.prepare('SELECT object_key FROM upload_parts WHERE session=? AND part_index=?').get(session.id, index);
    return row?.object_key ? String(row.object_key) : this.partKey(session, index);
  }
  async putPart(tenant: string, id: string, index: number, sha256: string, source: AsyncIterable<Uint8Array>) {
    const session = this.get(tenant, id), count = Math.ceil(session.size / session.partSize);
    if (!Number.isSafeInteger(index) || index < 0 || index >= count) throw new Error('INVALID_PART');
    const size = Math.min(session.partSize, session.size - index * session.partSize);
    const previous = this.db.prepare('SELECT sha,size FROM upload_parts WHERE session=? AND part_index=?').get(id, index);
    if (previous && (previous.sha !== sha256 || Number(previous.size) !== size)) throw new Error('IDEMPOTENCY_MISMATCH');
    let key = this.storedPartKey(session, index);
    if (previous) {
      try {
        const found = await this.storage.inspect(key);
        if (!found.persisted || found.sha256 !== sha256 || found.size !== size) throw new Error('PART_CORRUPT');
      } catch {
        // Repair by a new immutable object; retain the old object for explicit cleanup/audit.
        key = this.partKey(session, index) + '-repair-' + randomUUID();
      }
    }
    const evidence = await this.storage.putImmutable(key, source, {sha256, size});
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const concurrent = this.db.prepare('SELECT sha,size FROM upload_parts WHERE session=? AND part_index=?').get(id, index);
      if (concurrent && (concurrent.sha !== sha256 || Number(concurrent.size) !== size)) throw new Error('IDEMPOTENCY_MISMATCH');
      this.db.prepare('INSERT INTO upload_parts(session,part_index,sha,size,object_key) VALUES(?,?,?,?,?) ON CONFLICT(session,part_index) DO UPDATE SET object_key=excluded.object_key').run(id, index, evidence.sha256, evidence.size, key);
      this.db.exec('COMMIT');
    } catch (error) {this.db.exec('ROLLBACK'); throw error;}
    return evidence;
  }
  async status(tenant: string, id: string) {
    const session = this.get(tenant, id), missing: number[] = [], verified: number[] = [];
    for (let i = 0; i < Math.ceil(session.size / session.partSize); i++) {
      const row = this.db.prepare('SELECT sha,size FROM upload_parts WHERE session=? AND part_index=?').get(id, i);
      try {
        if (!row) throw new Error('PART_MISSING');
        const actual = await this.storage.inspect(this.storedPartKey(session, i));
        if (!actual.persisted || actual.sha256 !== row.sha || actual.size !== Number(row.size)) throw new Error('PART_CORRUPT');
        verified.push(i);
      } catch {missing.push(i);}
    }
    return {session, verified, missing};
  }
  async finalize(tenant: string, id: string): Promise<ObjectEvidence> {
    const {session, missing} = await this.status(tenant, id);
    if (missing.length) throw new Error('PARTS_INCOMPLETE');
    const storage = this.storage, key = (i: number) => this.storedPartKey(session, i);
    async function* chunks() {
      for (let i = 0; i < Math.ceil(session.size / session.partSize); i++) for await (const chunk of storage.read(key(i))) yield chunk;
    }
    const result = await storage.putImmutable(session.key, chunks(), {sha256: session.sha, size: session.size});
    this.db.prepare('UPDATE upload_sessions SET complete=1 WHERE id=? AND tenant=?').run(id, tenant);
    // Parts are retained until a separately verified cleanup decision; no pre-commit deletion.
    // Caller must commit asset metadata before claiming Cloud Safe.
    return result;
  }
}
