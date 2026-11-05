import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = new URL('../module/', import.meta.url);
const {id, version} = JSON.parse(await readFile(new URL('module.json', moduleDir), 'utf8'));
const archive = new URL('../dist/' + id + '-v' + version + '.zip', import.meta.url);
const stage = await mkdtemp(join(tmpdir(), id + '-'));
try {
  await cp(moduleDir, join(stage, id), {recursive: true});
  execFileSync('zip', ['-qr', 'module.zip', id, '-x', '*/.DS_Store'], {cwd: stage});
  await mkdir(new URL('./', archive), {recursive: true});
  await cp(join(stage, 'module.zip'), archive);
} finally {
  await rm(stage, {recursive: true, force: true});
}
console.log(fileURLToPath(archive));
