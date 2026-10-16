// Source preparation ONLY. No download, dependency install, compiler or build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [sourceArg, wrapperCommit, librawCommit] = process.argv.slice(2);
const fail = message => { throw new Error(message); };
if (process.argv.length !== 5 || !sourceArg ||
    !/^[0-9a-f]{40}$/.test(wrapperCommit ?? '') || !/^[0-9a-f]{40}$/.test(librawCommit ?? ''))
  fail('Usage: node prepare.mjs WRAPPER_PACKAGE_SOURCE WRAPPER_COMMIT_40HEX LIBRAW_COMMIT_40HEX');
const source = fs.realpathSync(sourceArg);
if (source.split(path.sep).some(part => part.toLowerCase() === 'node_modules'))
  fail('Use a dedicated source checkout, never node_modules');
const here = path.dirname(fileURLToPath(import.meta.url));
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const read = relative => fs.readFileSync(path.join(source, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
if (pkg.name !== '@colorhythm/libraw-wasm' || pkg.version !== '1.1.1')
  fail('Only @colorhythm/libraw-wasm source version 1.1.1 is accepted');
if (git(source, 'rev-parse', 'HEAD') !== wrapperCommit) fail('Wrapper commit mismatch');
const rawRoot = fs.realpathSync(path.join(source, 'LibRaw'));
if (git(rawRoot, 'rev-parse', 'HEAD') !== librawCommit) fail('LibRaw commit mismatch');
if (git(source, 'status', '--porcelain') || git(rawRoot, 'status', '--porcelain'))
  fail('Both checkouts must be clean before preparation');
for (const license of ['LICENSE.CDDL', 'LICENSE.LGPL', 'COPYRIGHT'])
  if (!fs.statSync(path.join(rawRoot, license)).isFile()) fail(`Missing LibRaw ${license}`);
const version = fs.readFileSync(path.join(rawRoot, 'libraw/libraw_version.h'), 'utf8');
for (const [key, value] of [['MAJOR', 0], ['MINOR', 21], ['PATCH', 4]])
  if (!new RegExp(`#define\\s+LIBRAW_${key}_VERSION\\s+${value}\\b`).test(version))
    fail('Native extension source is pinned to LibRaw 0.21.4 API; explicitly review other versions');
const cpp = fs.readFileSync(path.join(here, 'suite-libraw.cpp'), 'utf8');
const methods = fs.readFileSync(path.join(here, 'wrapper-methods.ts.txt'), 'utf8');
const buildPath = 'scripts/build.mjs';
const indexPath = 'src/index.ts';
const build = read(buildPath);
const index = read(indexPath);
if (build.includes('_suite_libraw_') || index.includes('SUITE_NATIVE_ABI_1')) fail('Source is already patched');
const once = (text, needle, replacement) => {
  if (text.split(needle).length !== 2) fail(`Expected exactly one source anchor: ${needle}`);
  return text.replace(needle, replacement);
};
// The upstream build appends customFunctions values to libraw_c_api.cpp,
// restores that file in finally, and exports every customFunctions key.
for (const anchor of ['Object.keys(customFunctions)', 'Object.values(customFunctions)', 'EXPORTED_FUNCTIONS', 'finally'])
  if (!build.includes(anchor)) fail(`Unsupported upstream build shape: ${anchor}`);
const definitions = {
  _suite_libraw_abi_version: cpp,
  _suite_libraw_plan_full_geometry: '',
  _suite_libraw_set_max_raw_memory_mb: '',
  _suite_libraw_get_processed_format: '',
};
const additions = Object.entries(definitions).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
const nextBuild = once(build, 'const customFunctions = {', `const customFunctions = {\n${additions}`);
let nextIndex = once(index, '    private inputPtr = 0 as Ptr;', `    private inputPtr = 0 as Ptr;\n${methods}`);
nextIndex = once(nextIndex, 'this.inputPtr = dataPtr;', 'this.inputPtr = dataPtr;\n            this.suiteInputLength = buffer.byteLength;');
nextIndex = once(nextIndex, 'this.inputPtr = 0;', 'this.inputPtr = 0;\n        this.suiteInputLength = 0;');
const sha = value => createHash('sha256').update(value).digest('hex');
const record = {
  schemaVersion: 1, abi: 1, wrapper: { name: pkg.name, version: pkg.version, commit: wrapperCommit },
  libraw: { version: '0.21.4', commit: librawCommit },
  extensionSHA256: sha(cpp), methodsSHA256: sha(methods),
  files: [
    { path: buildPath, before: sha(build), after: sha(nextBuild) },
    { path: indexPath, before: sha(index), after: sha(nextIndex) },
  ],
  compiled: false,
};
// Validate everything before writing. Keep exclusive original backups. In a
// partial filesystem failure the record is absent; never build that checkout.
const edits = [[buildPath, build, nextBuild], [indexPath, index, nextIndex]];
for (const [relative] of edits)
  for (const suffix of ['.suite-original', '.suite-preparing'])
    if (fs.existsSync(path.join(source, relative + suffix))) fail('Existing recovery files; inspect before retrying');
const recordPath = path.join(source, 'suite-native-preparation.json');
if (fs.existsSync(recordPath)) fail('Existing preparation record');
for (const [relative, original, next] of edits) {
  fs.writeFileSync(path.join(source, relative + '.suite-original'), original, { flag: 'wx' });
  fs.writeFileSync(path.join(source, relative + '.suite-preparing'), next, { flag: 'wx' });
}
for (const [relative] of edits)
  fs.renameSync(path.join(source, relative + '.suite-preparing'), path.join(source, relative));
fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
process.stdout.write('Source prepared only. No WASM or TypeScript build was run.\n');
