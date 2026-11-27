// @ts-check

// CPR 1.5.49's GPS integration reads these public compendiums. It assigns
// legacy/modern by pack suffix rather than by each row's source.rules field.
const standard = ['gps-spells', 'gps-class-features', 'gps-items', 'gps-generic-features', 'gps-race-features'];
const homebrew = ['gps-homebrew-features', 'gps-homebrew-items', 'gps-homebrew-spells'];
const thirdParty = ['gps-3rd-party-features', 'gps-3rd-party-items', 'gps-3rd-party-spells'];

/**
 * @param {import('../../../types/aliases.d.ts').CorpusSnapshot['indexes']} indexes
 * @param {number} mode
 * @param {import('../../../types/aliases.d.ts').AliasScope} scope
 * @returns {Set<string>}
 */
export function catalogNames(indexes, mode, scope) {
  if (![1, 2, 3, 4].includes(mode)) return new Set();
  const keys = [...standard, ...([3, 4].includes(mode) ? homebrew : []),
    ...([2, 4].includes(mode) ? thirdParty : [])];
  const suffix = scope.rules === '2024' ? '-2024' : '';
  /** @type {Set<string>} */
  const names = new Set();
  for (const key of keys) for (const row of indexes.get('gambits-premades.' + key + suffix)?.values() ?? []) {
    if (scope.types?.includes(/** @type {string} */ (row.type)) && typeof row.name === 'string') names.add(row.name);
  }
  return names;
}
