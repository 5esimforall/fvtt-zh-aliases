import { registerAliases } from './aliases.mjs';
import { collectNamePairs } from './translations.mjs';
import { GROUP_FIELDS, itemGroups } from './groups.mjs';

const lookupPacks = [
  'spells', 'items', 'feats', 'classFeatures', 'actions', 'raceFeatures',
  'speciesFeatures', 'miscellaneous', 'otherFeatures', 'monsterFeatures'
];

async function readIndexes(cpr, packs) {
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
  const indexes = new Map();
  const visible = [...packs.entries()].filter(([, pack]) => pack.visible && pack.documentName === 'Item');
  // Bound concurrent pack reads on world load; never request full documents.
  for (let i = 0; i < visible.length; i += 8) {
    await Promise.all(visible.slice(i, i + 8).map(async ([packId, pack]) => {
      const macroLists = sources.get(pack);
      const fields = [...GROUP_FIELDS, 'flags.babele.originalName', 'flags.chris-premades.info.identifier', 'flags.chris-premades.info.rules'];
      if (macroLists) fields.push('flags.chris-premades.info.aliases');
      const index = await pack.getIndex({fields});
      indexes.set(packId, index);
      if (!macroLists) return;
      for (const row of index.values()) {
        const info = row.flags?.['chris-premades']?.info;
        addNames({name: row.name, aliases: info?.aliases});
        // Translated pack rows can still be found by the CPR macro's name and ID.
        if (info?.identifier) {
          for (const macros of macroLists) addNames(macros?.[info.identifier]);
        }
      }
    }));
  }
  return {indexes, names};
}

export async function activate({ cpr, renamedItems, packs, loadTitleIndex, loadGrouping, localItems = [] }) {
  if (!renamedItems || ![null, Object.prototype].includes(Object.getPrototypeOf(renamedItems)) ||
      !Object.isExtensible(renamedItems) || !cpr?.utils?.constants?.packs ||
      !cpr.utils.constants.modernPacks || typeof cpr.utils.genericUtils?.getCPRSetting !== 'function') {
    return {status: 'unsupported-cpr'};
  }
  let catalogFor;
  try {
    catalogFor = await loadGrouping();
  } catch (error) {
    return {status: 'source-error', source: 'slow-insert', detail: String(error)};
  }
  try {
    const {indexes, names: nativeNames} = await readIndexes(cpr, packs);
    if (!nativeNames.size) return {status: 'no-visible-candidates'};
    const pairs = collectNamePairs(packs, await loadTitleIndex(), nativeNames);
    let groups;
    try {
      groups = itemGroups(indexes, catalogFor, localItems, cpr);
    } catch (error) {
      return {status: 'source-error', source: 'slow-insert', detail: String(error)};
    }
    return {...registerAliases(pairs, nativeNames, renamedItems, groups), grouping: 'slow-insert'};
  } catch (error) {
    // Never register from a partial corpus: a missing table could contain the conflicting name.
    return {status: 'source-error', source: error.source ?? null, detail: String(error.cause ?? error)};
  }
}
