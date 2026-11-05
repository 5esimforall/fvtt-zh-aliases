import {readdir, readFile, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));

export async function readModules() {
  const entries = await readdir(join(root, 'modules'), {withFileTypes: true});
  return Promise.all(entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map(async entry => {
    const directory = join(root, 'modules', entry.name);
    const manifest = JSON.parse(await readFile(join(directory, 'module.json'), 'utf8'));
    if (manifest.id !== entry.name || !/^[a-z0-9-]+$/.test(manifest.id)) throw Error('Module ID must match directory: ' + entry.name);
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw Error('Invalid module version: ' + manifest.id);
    for (const file of manifest.esmodules ?? []) {
      if (file.startsWith('/') || file.split('/').includes('..') || !(await stat(join(directory, file))).isFile()) {
        throw Error('Invalid module entry: ' + file);
      }
    }
    return {directory, manifest};
  }));
}

export async function* files(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}
