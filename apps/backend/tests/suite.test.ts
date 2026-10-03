import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {jwtAuthenticator, configuredAuthenticator} from '../src/auth.js';
import {suiteServer} from '../src/server.js';
import {representationFor, exportReadiness, mayEvict, isCloudSafe} from '../src/photo-policy.js';
import {MOBILE_RELEASE_CHECKS, evaluateMobileRelease, type Check} from '../src/gates.js';
// Storage boundary bytes only; NOT a real RAW fixture or decoder test.
const image = Buffer.from('synthetic-storage-bytes: never replace with a proxy');
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const recipe = {schemaVersion: 1, parameters: {exposure: 0.3, contrast: 1, saturation: 1, rotationDegrees: 0, extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-test-'));
  const repo = new AssetRepository(join(root, 'metadata.sqlite')), storage = new LocalObjectStorage(join(root, 'objects'));
  return {root, repo, storage, cleanup: async () => {repo.close(); await rm(root, {recursive: true, force: true});}};
}
test('ordinary browsing and editing never select Original; Final always does', () => {
  assert.equal(representationFor('library'), 'thumbnail');
  for (const intent of ['select', 'edit'] as const) assert.equal(representationFor(intent), 'proxy');
  for (const intent of ['final-jpeg', 'final-tiff', 'high-precision', 'redevelop'] as const) assert.equal(representationFor(intent), 'original');
});
test('offline or failed Original acquisition waits, never produces Proxy Final', () => {
  assert.deepEqual(exportReadiness({originalLocal: false, checksumValid: false, cloudSafe: true, online: false, fetchFailed: false}), {state: 'waiting-for-original', message: 'Original取得待ち'});
  assert.equal(exportReadiness({originalLocal: false, checksumValid: false, cloudSafe: true, online: true, fetchFailed: true}).state, 'waiting-for-original');
  assert.equal(exportReadiness({originalLocal: true, checksumValid: false, cloudSafe: false, online: true, fetchFailed: false}).state, 'waiting-for-original');
  assert.equal(exportReadiness({originalLocal: false, checksumValid: false, cloudSafe: true, online: true, fetchFailed: false}).state, 'fetch-original');
});
test('Proxy eviction is separate and an unsafe Original is never eligible', () => {
  assert.equal(mayEvict({kind: 'proxy', pinned: false, recoverable: true, cloudSafe: false, originalEvictionOptIn: false}), true);
  assert.equal(mayEvict({kind: 'original', pinned: false, recoverable: true, cloudSafe: false, originalEvictionOptIn: true}), false);
  assert.equal(mayEvict({kind: 'original', pinned: true, recoverable: true, cloudSafe: true, originalEvictionOptIn: true}), false);
  assert.equal(mayEvict({kind: 'recipe', pinned: false, recoverable: true, cloudSafe: true, originalEvictionOptIn: true}), false);
});
test('Cloud Safe requires all seven independently verified conditions', () => {
  const all = {checksumVerified: true, objectPersisted: true, metadataCommitted: true, permissionVerified: true, uploadCompleted: true, sizeMatched: true, ownerWorkspaceConfirmed: true};
  for (const key of Object.keys(all)) assert.equal(isCloudSafe({...all, [key]: false}), false);
  assert.equal(isCloudSafe(all), true);
});
test('actual immutable object writes reject corrupt upload and preserve previous Original', async () => {
  const f = await fixture();
  try {
    const expected = {sha256: hash(image), size: image.length};
    await assert.rejects(f.storage.putImmutable('original-test', Readable.from([Buffer.alloc(image.length)]), expected), /CHECKSUM/);
    await f.storage.putImmutable('original-test', Readable.from([image]), expected);
    const other = Buffer.from('other');
    await assert.rejects(f.storage.putImmutable('original-test', Readable.from([other]), {sha256: hash(other), size: other.length}), /IMMUTABLE/);
    assert.equal((await f.storage.inspect('original-test')).sha256, hash(image));
    await f.storage.putImmutable('proxy-test', Readable.from([other]), {sha256: hash(other), size: other.length});
    assert.equal((await f.storage.inspect('original-test')).sha256, hash(image));
  } finally {await f.cleanup();}
});
test('durable metadata, recipe CAS and soft delete survive reopening without overwriting Original', async () => {
  const f = await fixture();
  try {
    const asset = f.repo.create('tenant-a', {name: 'IMG.RAW', sha256: hash(image), size: image.length});
    assert.equal(asset.cloudSafe, false);
    assert.throws(() => f.repo.get('tenant-b', asset.id), /NOT_FOUND/);
    assert.throws(() => f.repo.markVerified('tenant-a', asset.id, {sha256: 'wrong', size: image.length, persisted: true}), /VERIFICATION/);
    const evidence = await f.storage.putImmutable(asset.originalKey, Readable.from([image]), {sha256: hash(image), size: image.length});
    assert.equal(f.repo.markVerified('tenant-a', asset.id, evidence).cloudSafe, true);
    assert.equal(f.repo.saveRecipe('tenant-a', asset.id, 'editor', 0, recipe).revision, 1);
    assert.throws(() => f.repo.saveRecipe('tenant-a', asset.id, 'editor', 0, recipe), /REVISION_CONFLICT/);
    const reopened = new AssetRepository(join(f.root, 'metadata.sqlite'));
    assert.deepEqual(reopened.latestRecipe('tenant-a', asset.id)?.body, recipe);
    reopened.close();
    f.repo.trash('tenant-a', asset.id);
    assert.throws(() => f.repo.get('tenant-a', asset.id), /NOT_FOUND/);
    f.repo.restore('tenant-a', asset.id);
    assert.equal(f.repo.get('tenant-a', asset.id).cloudSafe, true);
    assert.equal((await f.storage.inspect(asset.originalKey)).sha256, hash(image));
  } finally {await f.cleanup();}
});
test('release gate excludes Web while requiring every mobile/legacy gate; unknown/expired blocks', () => {
  assert.equal(MOBILE_RELEASE_CHECKS.some(k => /web/i.test(k)), false);
  const checks = Object.fromEntries(MOBILE_RELEASE_CHECKS.map(k => [k, {state: 'PASS', evidence_ref: 'device-test:' + k, valid_until: '2099-01-01'} satisfies Check]));
  const input = {subject_id: 'build-1', subject_version: 1, checks, high_impact_uncertain: false};
  assert.equal(evaluateMobileRelease(input, '2026-10-03').decision, 'PASS');
  assert.equal(evaluateMobileRelease({...input, checks: {...checks, 'ipad-device': undefined}}, '2026-10-03').decision, 'BLOCK');
  assert.equal(evaluateMobileRelease({...input, checks: {...checks, export: {state: 'PASS', evidence_ref: 'old', valid_until: '2020-01-01'}}}, '2026-10-03').decision, 'BLOCK');
});
test('missing auth configuration fails closed instead of accepting a tenant header', async () => {
  await assert.rejects(configuredAuthenticator({})('Bearer made-up'), /AUTH_NOT_CONFIGURED/);
});
test('authenticated import → upload verification → recipe → on-demand Original; tenant isolation and stale edits', async () => {
  const f = await fixture();
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'test-key';
  const auth = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite', jwks: createLocalJWKSet({keys: [jwk]})});
  const token = (tenant: string, exp = '5m') => new SignJWT({tenant_id: tenant}).setProtectedHeader({alg: 'RS256', kid: 'test-key'}).setIssuer('https://issuer.example').setAudience('suite').setSubject('user-1').setIssuedAt().setExpirationTime(exp).sign(privateKey);
  const server = suiteServer(f.repo, f.storage, auth);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = 'http://127.0.0.1:' + address.port;
  const headers = {Authorization: 'Bearer ' + await token('tenant-a'), 'Content-Type': 'application/json'};
  try {
    assert.equal((await fetch(url + '/v1/assets', {headers: {'X-Tenant-ID': 'tenant-a'}})).status, 401);
    const created = await fetch(url + '/v1/assets', {method: 'POST', headers, body: JSON.stringify({name: 'RAW file', sha256: hash(image), size: image.length})});
    assert.equal(created.status, 201);
    const asset = await created.json() as {id: string; cloudSafe: boolean; originalKey: string};
    assert.equal(asset.cloudSafe, false);
    const endpoint = url + '/v1/assets/' + asset.id;
    const waiting = await fetch(endpoint + '/original?purpose=final-jpeg', {headers});
    assert.equal(waiting.status, 409);
    assert.equal((await waiting.json() as {message: string}).message, 'Original取得待ち');
    assert.equal((await fetch(endpoint + '/original', {method: 'PUT', headers, body: image})).status, 200);
    assert.equal((await fetch(endpoint + '/original?purpose=library', {headers})).status, 409);
    const result = await fetch(endpoint + '/original?purpose=final-tiff', {headers});
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), image);
    assert.equal((await fetch(endpoint + '/recipe', {method: 'PUT', headers, body: JSON.stringify({expectedRevision: 0, recipe})})).status, 200);
    assert.equal((await fetch(endpoint + '/recipe', {method: 'PUT', headers, body: JSON.stringify({expectedRevision: 0, recipe})})).status, 409);
    assert.equal((await fetch(endpoint + '/recipe', {headers: {Authorization: 'Bearer ' + await token('tenant-b')}})).status, 404);
    assert.equal((await fetch(url + '/v1/assets', {headers: {Authorization: 'Bearer ' + await token('tenant-a', '1s ago')}})).status, 401);
    await writeFile(join(f.root, 'objects', asset.originalKey), 'simulated disk corruption');
    const corrupt = await fetch(endpoint + '/original?purpose=final-jpeg', {headers});
    assert.equal(corrupt.status, 503);
    assert.equal((await corrupt.json() as {message: string}).message, 'Original取得待ち');
    assert.equal(f.repo.get('tenant-a', asset.id).cloudSafe, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await f.cleanup();
  }
});

test('Mac and each real RAW load gate stay independent from iPhone/iPad device evidence', () => {
  const checks = Object.fromEntries(MOBILE_RELEASE_CHECKS.map(k => [k, {state: 'PASS', evidence_ref: 'fixture-only:' + k, valid_until: '2099-01-01'} satisfies Check]));
  for (const missing of ['mac-build-tests', 'real-raw-load-100', 'real-raw-load-500', 'real-raw-load-1000', 'full-lifecycle-sync-recovery', 'iphone-device', 'ipad-device']) {
    const result = evaluateMobileRelease({subject_id: 'unit-fixture', subject_version: 1, checks: {...checks, [missing]: undefined}, high_impact_uncertain: false}, '2026-10-03');
    assert.equal(result.decision, 'BLOCK');
    assert.ok(result.unknowns.includes(missing));
  }
});
