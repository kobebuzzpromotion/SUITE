import {createHash, randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir, open, link, unlink, stat} from 'node:fs/promises';
import {join} from 'node:path';
export interface ObjectEvidence {sha256: string; size: number; persisted: boolean}
export interface StorageProvider {
  putImmutable(key: string, source: AsyncIterable<Uint8Array>, expected: {sha256: string; size: number}): Promise<ObjectEvidence>;
  inspect(key: string): Promise<ObjectEvidence>;
  read(key: string): AsyncIterable<Uint8Array>;
}
// Development-only private filesystem provider; no public URLs, no production durability claim.
export class LocalObjectStorage implements StorageProvider {
  constructor(private readonly root: string, private readonly maxBytes = 1024 * 1024 * 1024) {}
  private path(key: string) { if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error('INVALID_OBJECT_KEY'); return join(this.root, key); }
  async putImmutable(key: string, source: AsyncIterable<Uint8Array>, expected: {sha256: string; size: number}) {
    if (!/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.size) || expected.size <= 0 || expected.size > this.maxBytes) throw new Error('INVALID_OBJECT');
    await mkdir(this.root, {recursive: true});
    const final = this.path(key), staging = this.path('staging-' + randomUUID());
    const file = await open(staging, 'wx', 0o600);
    const hash = createHash('sha256'); let size = 0;
    try {
      for await (const chunk of source) {
        size += chunk.byteLength;
        if (size > expected.size || size > this.maxBytes) throw new Error('SIZE_MISMATCH');
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) {
          const result = await file.write(chunk, offset, chunk.length - offset);
          if (!result.bytesWritten) throw new Error('WRITE_FAILED');
          offset += result.bytesWritten;
        }
      }
      if (size !== expected.size || hash.digest('hex') !== expected.sha256) throw new Error('CHECKSUM_MISMATCH');
      await file.sync();
      await file.close();
      try { await link(staging, final); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = await this.inspect(key);
        if (existing.sha256 !== expected.sha256 || existing.size !== expected.size) throw new Error('IMMUTABLE_OBJECT');
      }
      const evidence = await this.inspect(key);
      if (evidence.sha256 !== expected.sha256 || evidence.size !== expected.size) throw new Error('PERSISTENCE_VERIFICATION_FAILED');
      return evidence;
    } finally {
      await file.close().catch(() => {});
      await unlink(staging).catch(() => {});
    }
  }
  async inspect(key: string): Promise<ObjectEvidence> {
    const path = this.path(key), info = await stat(path);
    if (!info.isFile()) throw new Error('OBJECT_MISSING');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return {sha256: hash.digest('hex'), size: info.size, persisted: true};
  }
  read(key: string): AsyncIterable<Uint8Array> {return createReadStream(this.path(key));}
}
