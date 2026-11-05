// CPR 1.5.49's GPS integration reads these public compendiums. It assigns
// legacy/modern by pack suffix rather than by each row's source.rules field.
const standard = ['gps-spells', 'gps-class-features', 'gps-items', 'gps-generic-features', 'gps-race-features'];
const homebrew = ['gps-homebrew-features', 'gps-homebrew-items', 'gps-homebrew-spells'];
const thirdParty = ['gps-3rd-party-features', 'gps-3rd-party-items', 'gps-3rd-party-spells'];

export function catalogNames(indexes, mode, scope) {
  if (![1, 2, 3, 4].includes(mode)) return new Set();
  const keys = [...standard, ...([3, 4].includes(mode) ? homebrew : []),
    ...([2, 4].includes(mode) ? thirdParty : [])];
  const suffix = scope.rules === '2024' ? '-2024' : '';
  const names = new Set();
  for (const key of keys) for (const row of indexes.get('gambits-premades.' + key + suffix)?.values() ?? []) {
    if (scope.types.includes(row.type) && typeof row.name === 'string') names.add(row.name);
  }
  return names;
}

export function lookupScope(item, options, core, itemTypes) {
  const rules = core.rulesEdition(options.rules ?? 'legacy');
  if (!rules) return null;
  // Match Medkit's actor classification; monster identity translation is not
  // covered. NPC spells still use the ordinary spell catalog, as CPR does.
  let actorType = item.actor?.type ?? 'character';
  if (actorType !== 'character' && actorType !== 'npc') return null;
  if (item.actor?.items?.find(entry => entry.type === 'class')) actorType = 'character';
  if (actorType === 'npc' && item.type !== 'spell') return null;
  const type = item.type === 'spell' || item.type === 'feat' ? item.type
    : itemTypes.includes(item.type) ? 'item' : null;
  return type ? {rules, type, types: type === 'item' ? [...itemTypes] : [type]} : null;
}
