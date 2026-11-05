const lookupPacks = [
  'spells', 'items', 'feats', 'classFeatures', 'actions', 'raceFeatures',
  'speciesFeatures', 'miscellaneous', 'otherFeatures', 'monsterFeatures'
];
export const CPR_FIELDS = ['flags.chris-premades.info.identifier', 'flags.chris-premades.info.rules',
  'flags.chris-premades.info.aliases'];
const extraTranslations = ['chris-premades.CPRActions', 'chris-premades.CPRActions2024'];

function lookupSources(cpr, packs) {
  const roles = [...lookupPacks];
  if (cpr.utils.genericUtils.getCPRSetting('thirdParty')) {
    roles.push('thirdPartySpells', 'thirdPartyClassFeatures', 'thirdPartyFeats', 'thirdPartyItems');
  }
  const sources = new Map();
  const {constants} = cpr.utils;
  for (const [ids, macros] of [[constants.packs, cpr.legacyMacros], [constants.modernPacks, cpr.macros]]) {
    for (const role of roles) {
      const id = ids[role], pack = packs.get(id);
      if (!pack?.visible || pack.documentName !== 'Item') continue;
      if (!sources.has(id)) sources.set(id, new Set());
      sources.get(id).add(macros);
    }
  }
  return sources;
}

function lookupNames(sources, indexes) {
  const names = new Set();
  function add(entry) {
    if (typeof entry?.name === 'string') names.add(entry.name);
    for (const alias of Array.isArray(entry?.aliases) ? entry.aliases : []) {
      if (typeof alias === 'string') names.add(alias);
    }
  }
  for (const [id, macros] of sources) for (const row of indexes.get(id).values()) {
    const info = row.flags?.['chris-premades']?.info;
    add({name: row.name, aliases: info?.aliases});
    if (info?.identifier) for (const list of macros) add(list?.[info.identifier]);
  }
  return names;
}

export function macroNames(row, cpr) {
  const info = row.flags?.['chris-premades']?.info;
  if (!info?.identifier) return [];
  const edition = info.rules ?? row.system?.source?.rules;
  const lists = edition === 'legacy' || edition === '2014' ? [cpr.legacyMacros]
    : edition === 'modern' || edition === '2024' ? [cpr.macros] : [cpr.macros, cpr.legacyMacros];
  return [...new Set(lists.map(list => list?.[info.identifier]?.name).filter(name => typeof name === 'string'))];
}

export async function activate({core, cpr, renamedItems, packs, loadCorpus, ...corpusOptions}) {
  const provider = 'cpr';
  if (core?.apiVersion !== 1) return {provider, status: 'unsupported-core'};
  if (!renamedItems || ![null, Object.prototype].includes(Object.getPrototypeOf(renamedItems)) ||
      !Object.isExtensible(renamedItems) || !cpr?.utils?.constants?.packs ||
      !cpr.utils.constants.modernPacks || typeof cpr.utils.genericUtils?.getCPRSetting !== 'function') {
    return {provider, status: 'unsupported-cpr'};
  }
  try {
    const sources = lookupSources(cpr, packs);
    if (!sources.size) return {provider, status: 'no-visible-candidates'};
    const corpus = await (loadCorpus ? loadCorpus({fields: CPR_FIELDS})
      : core.readCorpus({packs, ...corpusOptions, fields: CPR_FIELDS}));
    const names = lookupNames(sources, corpus.indexes);
    if (!names.size) return {provider, status: 'no-visible-candidates'};
    const pairs = core.collectNamePairs(corpus.sources, corpus.titleIndex, names, extraTranslations);
    let groups;
    try {
      groups = core.itemGroups(corpus.indexes, corpus.catalogFor, corpus.localItems, row => macroNames(row, cpr));
    } catch (error) {
      return {provider, ...core.sourceError(error, 'slow-insert')};
    }
    // CPR's single exact-key table requires agreement across types and editions.
    const {aliases, report} = core.planAliases({pairs, lookupNames: names, existingAliases: renamedItems, groups});
    let registered = 0;
    for (const [displayName, lookupName] of aliases) {
      if (displayName in renamedItems) continue;
      renamedItems[displayName] = lookupName;
      registered++;
    }
    return {...report, provider, registered, grouping: 'slow-insert'};
  } catch (error) {
    return {provider, ...core.sourceError(error)};
  }
}
