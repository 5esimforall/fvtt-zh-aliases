import { registerAliases } from './aliases.mjs';
import { collectNamePairs } from './translations.mjs';

const lookupPacks = [
  'spells', 'items', 'feats', 'classFeatures', 'actions', 'raceFeatures',
  'speciesFeatures', 'miscellaneous', 'otherFeatures', 'monsterFeatures'
];

async function readNativeNames(cpr, packs) {
  const names = new Set();
  const roles = [...lookupPacks];
  if (cpr.utils.genericUtils.getCPRSetting('thirdParty')) {
    roles.push('thirdPartySpells', 'thirdPartyClassFeatures', 'thirdPartyFeats', 'thirdPartyItems');
  }
  const { constants } = cpr.utils;
  // Respect CPR's actual pack IDs, including world packs if configured.
  const editions = [[constants.packs, cpr.legacyMacros], [constants.modernPacks, cpr.macros]];
  const sources = new Map();
  for (const [packIds, macros] of editions) {
    for (const role of roles) {
      const pack = packs.get(packIds[role]);
      if (!pack?.visible || pack.documentName !== 'Item') continue;
      if (!sources.has(pack)) sources.set(pack, new Set());
      sources.get(pack).add(macros);
    }
  }
  function addNames(entry) {
    if (typeof entry?.name === 'string') names.add(entry.name);
    if (Array.isArray(entry?.aliases)) {
      for (const alias of entry.aliases) if (typeof alias === 'string') names.add(alias);
    }
  }
  await Promise.all(Array.from(sources, async ([pack, macroLists]) => {
    const index = await pack.getIndex({fields: ['flags.chris-premades.info.identifier', 'flags.chris-premades.info.aliases']});
    for (const row of index.values()) {
      const info = row.flags?.['chris-premades']?.info;
      addNames({name: row.name, aliases: info?.aliases});
      // Translated pack rows can still be found by the CPR macro's name and ID.
      if (info?.identifier) {
        for (const macros of macroLists) addNames(macros?.[info.identifier]);
      }
    }
  }));
  return names;
}

export async function activate({ cpr, renamedItems, packs, loadTitleIndex }) {
  if (!renamedItems || ![null, Object.prototype].includes(Object.getPrototypeOf(renamedItems)) ||
      !Object.isExtensible(renamedItems) || !cpr?.utils?.constants?.packs ||
      !cpr.utils.constants.modernPacks || typeof cpr.utils.genericUtils?.getCPRSetting !== 'function') {
    return {status: 'unsupported-cpr'};
  }
  try {
    const nativeNames = await readNativeNames(cpr, packs);
    if (!nativeNames.size) return {status: 'no-visible-candidates'};
    const pairs = collectNamePairs(packs, await loadTitleIndex(), nativeNames);
    return registerAliases(pairs, nativeNames, renamedItems);
  } catch (error) {
    // Never register from a partial corpus: a missing table could contain the conflicting name.
    return {status: 'source-error', source: error.source ?? null, detail: String(error.cause ?? error)};
  }
}
