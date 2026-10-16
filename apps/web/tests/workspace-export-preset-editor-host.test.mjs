import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {
  WORKSPACE_EXPORT_PRESET_EDITOR_BLOCKERS,
  inspectWorkspaceExportPresetEditorHost,
  createWorkspaceExportPresetEditorHost,
  createWorkspaceExportPresetEditorNotice,
} from '../src/workspace-export-preset-editor-host.mjs';

const local = name => fileURLToPath(new URL(`../src/${name}`, import.meta.url));

test('EXPORT-PRESET-EDITOR-01: Trial, Sites and local Editor cannot claim Node JWT identity from a supplied object', () => {
  const forged = {workspaceId: 'a', expectedSubject: 'same-looking-id',
    expectedTenantId: 'personal', tokenProvider: () => 'unverified'};
  for (const trialSession of [undefined, {mode: 'INVITED_LOCAL_TRIAL'},
    {mode: 'SITES'}, {mode: 'PUBLIC_BROWSER_LOCAL'}, {mode: 'NODE_WORKSPACE'}]) {
    const outcome = inspectWorkspaceExportPresetEditorHost({trialSession, workspaceHost: forged});
    assert.equal(outcome.available, false);
    assert.deepEqual(outcome.blockers, WORKSPACE_EXPORT_PRESET_EDITOR_BLOCKERS);
    assert.throws(() => createWorkspaceExportPresetEditorHost({trialSession, workspaceHost: forged}),
      /WORKSPACE_EXPORT_PRESET_EDITOR_NOT_CONNECTED/);
  }
  assert.ok(Object.isFrozen(WORKSPACE_EXPORT_PRESET_EDITOR_BLOCKERS));
});

test('EXPORT-PRESET-EDITOR-02: product notice is noninteractive and never exposes Save/Select/Apply', () => {
  const nodes = [];
  const document = {createElement(tag) {
    const node = {tagName: tag.toUpperCase(), attributes: new Map(), textContent: '',
      setAttribute(key, value) {this.attributes.set(key, value);}};
    nodes.push(node);return node;
  }};
  const note = createWorkspaceExportPresetEditorNotice({document,
    trialSession: {mode: 'INVITED_LOCAL_TRIAL'}});
  assert.equal(note.tagName, 'P');
  assert.equal(note.attributes.get('role'), 'note');
  assert.match(note.textContent, /未接続/);
  assert.match(note.textContent, /Final設定/);
  assert.deepEqual(nodes.map(node => node.tagName), ['P']);
  assert.throws(() => createWorkspaceExportPresetEditorNotice(),
    /WORKSPACE_EXPORT_PRESET_EDITOR_DOCUMENT_REQUIRED/);
});

test('EXPORT-PRESET-EDITOR-03: current bootstrap passes Trial context, not a Node Workspace subject/tenant/token host', async () => {
  const bootstrap = await readFile(local('bootstrap.mjs'), 'utf8');
  const editor = await readFile(local('editor-ui.mjs'), 'utf8');
  assert.match(bootstrap, /mountEditor\(session,/);
  assert.doesNotMatch(bootstrap, /WorkspaceExportPresetClient|tokenProvider|expectedTenantId/);
  assert.match(editor, /createWorkspaceExportPresetEditorNotice\(\{document,trialSession\}\)/);
  assert.doesNotMatch(editor, /createWorkspaceExportPresetPanel|createWorkspaceExportPresetEditorHost\(/);
});
