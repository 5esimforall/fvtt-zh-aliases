// @ts-check

// CPR 1.5.49 assigns editions by pack suffix for its standard MISC packs.
const standard = ['misc-items', 'misc-class-features', 'misc-feats', 'misc-spells', 'misc-race-features', 'misc-actions'];
const provider = 'midi-item-showcase-community';

/**
 * @param {import('../../../types/aliases.d.ts').CorpusSnapshot['indexes']} indexes
 * @param {number} mode
 * @param {import('../../../types/aliases.d.ts').AliasScope} scope
 * @param {import('../../../types/aliases.d.ts').MiscCatalogContext} [context]
 * @returns {Set<string>}
 */
export function catalogNames(indexes, mode, scope, {folders = new Map(), automations = {}} = {}) {
  if (![1, 2, 3, 4].includes(mode)) return new Set();
  /** @type {Set<string>} */
  const names = new Set();
  /**
   * @param {any} row
   * @param {import('../../../types/aliases.d.ts').RulesEdition} rules
   */
  const add = (row, rules) => {
    const edition = rules === '2024' ? 'modern' : 'legacy';
    if (scope.rules === rules && scope.types?.includes(/** @type {string} */ (row.type)) && typeof row.name === 'string' &&
        !automations[edition]?.[row.name]?.factory) names.add(row.name);
  };
  for (const rules of /** @type {const} */ (['2014', '2024'])) {
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

/**
 * @param {Map<string, any>} packs
 * @param {import('../../../types/aliases.d.ts').MiscCatalogContext['automations']} automations
 * @returns {import('../../../types/aliases.d.ts').MiscCatalogContext}
 */
export function catalogContext(packs, automations) {
  /** @type {import('../../../types/aliases.d.ts').MiscPackFolderIndex} */
  const folders = new Map();
  for (const [id, pack] of packs.entries()) {
    if (!id.startsWith(provider + '.') || !pack.visible) continue;
    folders.set(id, new Map([...(pack.folders?.values() ?? [])].map((/** @type {any} */ folder) => [folder.name, folder.id])));
  }
  return {folders, automations};
}
