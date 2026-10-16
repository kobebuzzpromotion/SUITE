import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {InviteAuth} from '../invite-auth.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {recipe as neutralRecipe} from './fixtures.mjs';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';

// Test-only mounting of the existing WorkspaceHTTP under an invited local trial
// identity. The shipped trial-server does NOT mount WorkspaceHTTP; these tests
// prove the Workspace/SQLite contract, not product Trial-route connectivity.
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const grain = {amount: 47, seed: 0x12345678,
  shadows: 11, midtones: 22, highlights: 33, size: 44, roughness: 55, colorVariation: 66};
const extraKeys = ['shadows', 'midtones', 'highlights', 'size', 'roughness', 'colorVariation'];
const clone = value => structuredClone(value);

function grainRecipe(value = grain) {
  const body = neutralRecipe();
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', detail: {grain: clone(value)},
  };
  body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  return body;
}

function assertGrain(body, expected) {
  assert.deepEqual(body.parameters.extendedParameters.postDecodeAdjustments.detail.grain, expected);
  for (const key of extraKeys) assert.equal(Object.hasOwn(body.parameters.extendedParameters.postDecodeAdjustments.detail.grain, key), Object.hasOwn(expected, key));
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'suite-grain-preset-http-'));
  let now = START;
  const auth = new InviteAuth(join(directory, 'trial-auth.sqlite'), {clock: () => now});
  const repo = new AssetRepository(join(directory, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(directory, 'objects'));
  const workspaceHTTP = new WorkspaceHTTP(directory, repo, storage, undefined, () => now);
  const server = suiteServer(repo, storage, async header => {
    const principal = auth.resolveSession(header?.replace(/^Bearer /, ''));
    return {subject: principal.id, tenantId: principal.tenantId,
      verifiedEmail: `${principal.id}@example.com`};
  }, workspaceHTTP);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  function login(name, trialEndsAt = END) {
    const author = auth.createAuthor({authorName: name, trialEndsAt});
    const invitation = auth.issueInvite(author.id);
    const signed = auth.redeem(invitation.inviteToken);
    const client = new TrialClient({baseURL, fetcher: (url, init) => fetch(url, {
      ...init, headers: {...init.headers, authorization: `Bearer ${signed.sessionToken}`},
    })});
    return {author, client};
  }
  async function setup(owner) {
    const workspace = (await owner.request('/v1/workspaces', {method: 'POST', body: {name: 'Grain study'}})).workspace;
    const root = `/v1/workspaces/${workspace.id}`;
    const project = (await owner.request(`${root}/projects`, {method: 'POST', body: {name: 'Synthetic'}})).project;
    const bytes = Buffer.from('NON-RAW grain preset persistence fixture');
    const asset = (await owner.request(`${root}/projects/${project.id}/assets`, {method: 'POST', body: {
      name: 'fixture.txt', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length,
    }})).asset;
    return {root, workspace, project, asset,
      assetPath: `${root}/projects/${project.id}/assets/${asset.id}`};
  }
  return {auth, workspaceHTTP, login, setup, advance(ms) {now += ms;},
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      workspaceHTTP.close(); repo.close(); auth.close();
      await rm(directory, {recursive: true, force: true});
    }};
}

test('GRAIN-PRESET-HTTP01: Personal and Workspace save, reload and apply retain six extended Grain values', async () => {
  const f = await fixture();
  try {
    const {client} = f.login('Owner');
    const {root, assetPath} = await f.setup(client);
    const expected = grainRecipe();
    let revision = 0;
    for (const scope of ['PERSONAL', 'WORKSPACE']) {
      const created = (await client.request(`${root}/presets`, {method: 'POST',
        body: {scope, name: `${scope} grain`, body: expected}})).preset;
      assert.equal(created.scope, scope);
      assertGrain(created.body, grain);
      const reloaded = (await client.request(`${root}/presets/${created.id}`)).preset;
      assertGrain(reloaded.body, grain);
      assert.ok((await client.request(`${root}/presets`)).presets.some(item => item.id === created.id));
      const applied = await client.request(`${assetPath}/preset`, {method: 'POST',
        body: {baseVersion: revision, presetId: created.id,
          expectedPresetVersion: reloaded.version}});
      assert.equal(applied.outcome, 'saved');
      assertGrain(applied.version.body, grain);
      assertGrain(applied.version.presetSnapshot.body, grain);
      revision = applied.version.version;
      const saved = (await client.request(`${assetPath}/recipe`)).recipe;
      assert.equal(saved.version, revision);
      assertGrain(saved.body, grain);
    }
  } finally {await f.close();}
});

test('GRAIN-PRESET-HTTP02: another identity cannot see Personal; trial expiry denies further access', async () => {
  const f = await fixture();
  try {
    const {client: owner, author} = f.login('Owner');
    const {client: other} = f.login('Stranger');
    const {root, workspace, project, asset, assetPath} = await f.setup(owner);
    const personal = (await owner.request(`${root}/presets`, {method: 'POST',
      body: {scope: 'PERSONAL', name: 'Private Grain', body: grainRecipe()}})).preset;
    await assert.rejects(other.request(`${root}/presets/${personal.id}`), /UNAUTHORIZED|FORBIDDEN|PRESET_NOT_FOUND/);
    await assert.rejects(other.request(`${assetPath}/preset`, {method: 'POST', body: {baseVersion: 0, presetId: personal.id,
      expectedPresetVersion: personal.version}}), /UNAUTHORIZED|FORBIDDEN|PRESET_NOT_FOUND/);
    assert.equal((await owner.request(`${assetPath}/recipe`)).recipe, null);
    f.advance(Date.parse(END) - START);
    await assert.rejects(owner.request(`${root}/presets/${personal.id}`), /UNAUTHORIZED/);
    await assert.rejects(owner.request(`${assetPath}/preset`, {method: 'POST', body: {baseVersion: 0, presetId: personal.id,
      expectedPresetVersion: personal.version}}), /UNAUTHORIZED/);
    assert.equal(f.workspaceHTTP.workspaces.latestRecipe({userId: author.id}, workspace.id, project.id, asset.id), null);
  } finally {await f.close();}
});

test('GRAIN-PRESET-HTTP03: stale Preset version is rejected without replacing six Grain values', async () => {
  const f = await fixture();
  try {
    const {client} = f.login('Owner');
    const {root, assetPath} = await f.setup(client);
    const preset = (await client.request(`${root}/presets`, {method: 'POST',
      body: {scope: 'PERSONAL', name: 'Grain v1', body: grainRecipe()}})).preset;
    const next = {...grain, shadows: 79};
    const updated = (await client.request(`${root}/presets/${preset.id}`, {method: 'PATCH',
      body: {baseVersion: 1, name: 'Grain v2', body: grainRecipe(next)}})).preset;
    assert.equal(updated.version, 2);
    assertGrain(updated.body, next);
    await assert.rejects(client.request(`${root}/presets/${preset.id}`, {method: 'PATCH',
      body: {baseVersion: 1, name: 'Stale', body: grainRecipe({...grain, size: 99})}}), /PRESET_VERSION_CONFLICT/);
    assertGrain((await client.request(`${root}/presets/${preset.id}`)).preset.body, next);
    await assert.rejects(client.request(`${assetPath}/preset`, {method: 'POST',
      body: {baseVersion: 0, presetId: preset.id,
        expectedPresetVersion: preset.version}}), /PRESET_VERSION_CONFLICT/);
    assert.equal((await client.request(`${assetPath}/recipe`)).recipe, null);
  } finally {await f.close();}
});

test('GRAIN-PRESET-HTTP04: legacy amount plus seed Recipe remains accepted and gains no fabricated controls', async () => {
  const f = await fixture();
  try {
    const {client} = f.login('Owner');
    const {root, assetPath} = await f.setup(client);
    const legacy = {amount: 23, seed: 17};
    for (const scope of ['PERSONAL', 'WORKSPACE']) {
      const preset = (await client.request(`${root}/presets`, {method: 'POST',
        body: {scope, name: `${scope} legacy grain`, body: grainRecipe(legacy)}})).preset;
      const reloaded = (await client.request(`${root}/presets/${preset.id}`)).preset;
      assertGrain(reloaded.body, legacy);
      const current = (await client.request(`${assetPath}/recipe`)).recipe;
      const applied = await client.request(`${assetPath}/preset`, {method: 'POST',
        body: {baseVersion: current?.version ?? 0, presetId: preset.id,
          expectedPresetVersion: reloaded.version}});
      assert.equal(applied.outcome, 'saved');
      assertGrain((await client.request(`${assetPath}/recipe`)).recipe.body, legacy);
    }
  } finally {await f.close();}
});
