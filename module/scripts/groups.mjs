// Adapt Foundry index rows to the audited Item catalog used by Slow Insert.
// Do not import its panel, user pins, edition filters or preferred member.
export async function loadGrouping() {
  if (!game.modules.get('slow-insert')?.active) throw new Error('Slow Insert is not active');
  const path = foundry.utils.getRoute('modules/slow-insert/scripts/grouping.mjs');
  const {buildGroupingCatalog} = await import(new URL(path, location.href).href);
  if (typeof buildGroupingCatalog !== 'function') throw new Error('Slow Insert does not export buildGroupingCatalog');
  return items => buildGroupingCatalog(items.map(item => ({item})), {
    packs: game.packs, modules: game.modules, system: game.system, world: game.world,
    sourceBooks: CONFIG.DND5E?.sourceBooks, localize: key => game.i18n.localize(key),
    externalPublications: {titles: globalThis.Parser?.SOURCE_JSON_TO_FULL,
      abbreviations: globalThis.Parser?.SOURCE_JSON_TO_ABV, dates: globalThis.Parser?.SOURCE_JSON_TO_DATE}
  }).entries;
}

export const GROUP_FIELDS = ['system.identifier', 'system.source', 'system.school', 'system.level', '_stats.modifiedTime'];
function nameEvidence(row, source, cpr) {
  const info = row.flags?.['chris-premades']?.info;
  const names = new Set();
  if (info?.identifier) {
    const edition = info.rules ?? row.system?.source?.rules;
    const lists = edition === 'legacy' || edition === '2014' ? [cpr.legacyMacros]
      : edition === 'modern' || edition === '2024' ? [cpr.macros] : [cpr.macros, cpr.legacyMacros];
    for (const macros of lists) {
      const name = macros?.[info.identifier]?.name;
      if (typeof name === 'string') names.add(name);
    }
  }
  return {displayName: row.name, source, originalName: row.flags?.babele?.originalName ?? row.originalName,
    cprNames: [...names]};
}

export function itemGroups(indexes, catalogFor, localItems, cpr) {
  const items = [], rows = new Map();
  for (const [packId, index] of indexes) {
    for (const row of index.values()) {
      if (!row._id || !row.name) continue;
      const uuid = 'Compendium.' + packId + '.Item.' + row._id;
      items.push({uuid, documentType: 'Item', subType: row.type, name: row.name, package: packId, system: row.system});
      rows.set(uuid, row);
    }
  }
  const catalog = catalogFor(items), groups = new Map();
  if (!(catalog instanceof Map)) throw new TypeError('Expected Slow Insert catalog entries');
  function add(key, member) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(member);
  }
  for (const item of items) {
    const entry = catalog.get(item.uuid);
    if (!entry || !(entry.key === null || typeof entry.key === 'string')) {
      throw new Error('Invalid Slow Insert catalog entry: ' + item.uuid);
    }
    const key = entry.key;
    if (key || /\p{Script=Han}/u.test(item.name)) {
      add(key ?? item.uuid, nameEvidence(rows.get(item.uuid), item.uuid, cpr));
    }
  }
  for (const item of localItems) {
    if (item.uuid && /\p{Script=Han}/u.test(item.name)) {
      add(item.uuid, nameEvidence(item, item.uuid, cpr));
    }
  }
  return groups;
}
