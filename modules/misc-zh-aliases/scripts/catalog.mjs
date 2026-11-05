// CPR 1.5.49 assigns editions by pack suffix for its standard MISC packs.
const standard = ['misc-items', 'misc-class-features', 'misc-feats', 'misc-spells', 'misc-race-features', 'misc-actions'];
const provider = 'midi-item-showcase-community';

export function catalogNames(indexes, mode, scope, {folders = new Map(), automations = {}} = {}) {
  if (![1, 2, 3, 4].includes(mode)) return new Set();
  const names = new Set();
  const add = (row, rules) => {
    const edition = rules === '2024' ? 'modern' : 'legacy';
    if (scope.rules === rules && scope.types.includes(row.type) && typeof row.name === 'string' &&
        !automations[edition]?.[row.name]?.factory) names.add(row.name);
  };
  for (const rules of ['2014', '2024']) {
    const suffix = rules === '2024' ? '-2024' : '';
    for (const key of standard) for (const row of indexes.get(provider + '.' + key + suffix)?.values() ?? []) add(row, rules);
    if ([2, 4].includes(mode)) {
      const id = provider + '.misc-homebrew' + suffix;
      const folder = folders.get(id)?.get('Items');
      if (folder) for (const row of indexes.get(id)?.values() ?? []) {
        if (row.folderId === folder) add(row, rules);
      }
    }
    if ([3, 4].includes(mode)) {
      const id = provider + '.misc-unearthed-arcana' + suffix;
      const folder = folders.get(id)?.get('Spells');
      if (folder) for (const row of indexes.get(id)?.values() ?? []) {
        // CPR's UA spell branch uses the row edition, unlike standard packs.
        if (row.folderId === folder) add(row, row.system?.source?.rules === '2024' ? '2024' : '2014');
      }
      // CPR 1.5.49 stores UUID as type in the UA class-feature branch.
      // Those rows cannot match getMISCAutomation; do not invent a repair here.
    }
  }
  return names;
}

export function catalogContext(packs, automations) {
  const folders = new Map();
  for (const [id, pack] of packs.entries()) {
    if (!id.startsWith(provider + '.') || !pack.visible) continue;
    folders.set(id, new Map([...pack.folders?.values() ?? []].map(folder => [folder.name, folder.id])));
  }
  return {folders, automations};
}
