import type {ObjectEvidence, StorageProvider} from './storage.js';
// Product provider contract. LocalObjectStorage intentionally does NOT implement it.
// Provider adoption, authenticated authorization, deletion gates and real cloud QA remain pending.
export interface ObjectReference {key: string; version: string; tenantId: string; assetId: string; sha256: string; size: number}
export interface ObjectStorageProvider extends StorageProvider {
  readonly identifier: string;
  head(reference: ObjectReference): Promise<ObjectEvidence & {version: string; metadata: Record<string, string>}>;
  get(reference: ObjectReference): Promise<AsyncIterable<Uint8Array>>;
  put(reference: ObjectReference, bytes: AsyncIterable<Uint8Array>): Promise<ObjectEvidence>;
  delete(reference: ObjectReference, authorizedPurgeEvidence: string): Promise<void>;
  signedAccess(reference: ObjectReference, authorizationEvidence: string, expiresAt: Date): Promise<URL>;
  multipartBegin(reference: ObjectReference, operationId: string): Promise<string>;
  multipartResume(sessionId: string, authorizationEvidence: string): Promise<{verifiedPartIndexes: number[]}>;
  multipartPut(sessionId: string, partIndex: number, bytes: AsyncIterable<Uint8Array>, checksum: string): Promise<ObjectEvidence>;
  multipartComplete(sessionId: string, authorizationEvidence: string): Promise<ObjectEvidence>;
}
