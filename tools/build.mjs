import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './workspace.mjs';

export const sharedFiles = ['medkit-lookup.mjs', 'adapter-runtime.mjs'];
export const sharedConsumers = ['cpr-zh-aliases', 'gps-zh-aliases', 'misc-zh-aliases'];

export async function syncShared({check = false, workspaceRoot = root} = {}) {
  for (const file of sharedFiles) {
    const generated = '// Generated from shared/' + file + '. Edit the source, then run npm run build.\n' +
      await readFile(join(workspaceRoot, 'shared', file), 'utf8');
    for (const id of sharedConsumers) {
      const directory = join(workspaceRoot, 'modules', id, 'scripts/shared');
      const target = join(directory, file);
      if (check) {
        const actual = await readFile(target, 'utf8').catch(() => null);
        if (actual !== generated) throw Error('Stale shared runtime: ' + target + '; run npm run build');
      } else {
        await mkdir(directory, {recursive: true});
        await writeFile(target, generated);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await syncShared({check: process.argv.includes('--check')});
