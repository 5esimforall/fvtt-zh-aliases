import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve, relative} from 'node:path';
import {readModules, files, root} from '../tools/workspace.mjs';
import {packageModules} from '../tools/package.mjs';

test('three installable modules have an optional-translation provider-independent foundation and independent adapter dependencies', async () => {
  const modules = await readModules();
  assert.deepEqual(modules.map(m => m.manifest.id), ['cpr-zh-aliases', 'gps-zh-aliases', 'truesight']);
  const dependencies = Object.fromEntries(modules.map(({manifest: m}) => [m.id, m.relationships.requires.map(r => r.id)]));
  assert.deepEqual(dependencies['truesight'], ['quick-insert']);
  assert.deepEqual(dependencies['cpr-zh-aliases'], ['truesight', 'chris-premades']);
  assert.deepEqual(dependencies['gps-zh-aliases'], ['truesight', 'chris-premades', 'gambits-premades']);
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
      if (manifest.id === 'truesight' && path.includes('/names/')) assert.doesNotMatch(content, /chris-premades|gambits-premades|renamedItems|cprNames/);
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
    assert.ok(!listing.some(path => path.includes('/tests/') || path.endsWith('.DS_Store')));
  }
});
