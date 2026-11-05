import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve, relative} from 'node:path';
import {readModules, files, root} from '../tools/workspace.mjs';
import {packageModules} from '../tools/package.mjs';
import {syncShared, sharedFiles, sharedConsumers} from '../tools/build.mjs';

test('three adapters depend on the independent Truesight foundation', async () => {
  const modules = await readModules();
  assert.deepEqual(modules.map(m => m.manifest.id), ['cpr-zh-aliases', 'gps-zh-aliases', 'misc-zh-aliases']);
  const dependencies = Object.fromEntries(modules.map(({manifest: m}) => [m.id, m.relationships.requires.map(r => r.id)]));
  assert.deepEqual(dependencies['cpr-zh-aliases'], ['truesight', 'chris-premades']);
  assert.deepEqual(dependencies['gps-zh-aliases'], ['truesight', 'chris-premades', 'gambits-premades']);
  assert.deepEqual(dependencies['misc-zh-aliases'], ['truesight', 'chris-premades', 'midi-item-showcase-community']);
  for (const {directory, manifest} of modules) {
    for await (const path of files(directory)) {
      if (!path.endsWith('.mjs')) continue;
      const content = await readFile(path, 'utf8');
      for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        assert.ok(match[1].startsWith('.'), 'No unbundled runtime dependency: ' + match[1]);
        const target = resolve(path, '..', match[1]);
        assert.ok(!relative(directory, target).startsWith('..'), 'Cross-plugin source import: ' + path);
        await readFile(target);
      }
    }
  }
  assert.equal(JSON.parse(await readFile(join(root, 'package.json'))).name, 'fvtt-zh-aliases');
});

test('each ZIP contains its own manifest and runtime without relying on the repository layout', async t => {
  const out = await mkdtemp(join(tmpdir(), 'zh-aliases-package-test-'));
  t.after(() => rm(out, {recursive: true, force: true}));
  const archives = await packageModules(out);
  const modules = await readModules();
  assert.equal(archives.length, 3);
  for (const [i, {manifest}] of modules.entries()) {
    const archive = archives[i];
    const listing = execFileSync('unzip', ['-Z1', archive], {encoding: 'utf8'}).trim().split('\n');
    assert.ok(listing.every(path => path.startsWith(manifest.id + '/')));
    const packed = JSON.parse(execFileSync('unzip', ['-p', archive, manifest.id + '/module.json'], {encoding: 'utf8'}));
    assert.deepEqual(packed, manifest);
    assert.ok(listing.includes(manifest.id + '/scripts/main.mjs'));
    if (sharedConsumers.includes(manifest.id)) for (const file of sharedFiles) {
      const bundled = execFileSync('unzip', ['-p', archive, manifest.id + '/scripts/shared/' + file], {encoding: 'utf8'});
      assert.equal(bundled, await readFile(join(root, 'modules', manifest.id, 'scripts/shared', file), 'utf8'));
    }
    assert.ok(!listing.some(path => path.includes('/tests/') || path.endsWith('.DS_Store')));
  }
});


test('shared runtime copies are generated from one source and stale or missing output is rejected', async t => {
  await syncShared({check: true});
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'zh-aliases-build-test-'));
  t.after(() => rm(workspaceRoot, {recursive: true, force: true}));
  await mkdir(join(workspaceRoot, 'shared'));
  for (const file of sharedFiles) await writeFile(join(workspaceRoot, 'shared', file), 'export const fixture = true;\n');
  await assert.rejects(syncShared({workspaceRoot, check: true}), /Stale shared runtime/);
  await syncShared({workspaceRoot});
  await syncShared({workspaceRoot, check: true});
  const target = join(workspaceRoot, 'modules', sharedConsumers[0], 'scripts/shared', sharedFiles[0]);
  await writeFile(target, 'stale');
  await assert.rejects(syncShared({workspaceRoot, check: true}), /Stale shared runtime/);
  await syncShared({workspaceRoot});
  await syncShared({workspaceRoot, check: true});
});
