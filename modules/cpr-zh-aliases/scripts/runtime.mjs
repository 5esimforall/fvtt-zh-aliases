import {installLookupFallback} from './shared/medkit-lookup.mjs';
import {lookupScope, yieldTurn} from './shared/adapter-runtime.mjs';

const lookupPacks = [
  'spells', 'items', 'feats', 'classFeatures', 'actions', 'raceFeatures',
  'speciesFeatures', 'miscellaneous', 'otherFeatures', 'monsterFeatures'
];
const DEFAULT_ITEM_TYPES = ['weapon', 'equipment', 'consumable', 'tool', 'backpack', 'loot'];
export const CPR_FIELDS = ['flags.chris-premades.info.identifier', 'flags.chris-premades.info.rules',
  'flags.chris-premades.info.aliases'];
const extraTranslations = ['chris-premades.CPRActions', 'chris-premades.CPRActions2024'];

function lookupSources(cpr, packs, {rules = null, includeMonster = true} = {}) {
  const roles = lookupPacks.filter(role => includeMonster || role !== 'monsterFeatures');
  if (cpr.utils.genericUtils.getCPRSetting('thirdParty')) {
    roles.push('thirdPartySpells', 'thirdPartyClassFeatures', 'thirdPartyFeats', 'thirdPartyItems');
  }
  const sources = new Map();
  const {constants} = cpr.utils;
  const editions = rules === '2014' ? [[constants.packs, cpr.legacyMacros]]
    : rules === '2024' ? [[constants.modernPacks, cpr.macros]]
    : [[constants.packs, cpr.legacyMacros], [constants.modernPacks, cpr.macros]];
  for (const [ids, macros] of editions) {
    if (!ids) continue;
    for (const role of roles) {
      const id = ids[role], pack = packs.get(id);
      if (!pack?.visible || pack.documentName !== 'Item') continue;
      if (!sources.has(id)) sources.set(id, new Set());
      sources.get(id).add(macros);
    }
  }
  return sources;
}

function lookupNames(sources, indexes, types = null) {
  const names = new Set();
  function add(entry) {
    if (typeof entry?.name === 'string') names.add(entry.name);
    for (const alias of Array.isArray(entry?.aliases) ? entry.aliases : []) {
      if (typeof alias === 'string') names.add(alias);
    }
  }
  for (const [id, macros] of sources) for (const row of indexes.get(id)?.values() ?? []) {
    if (types && row.type && !types.includes(row.type)) continue;
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

function readExternalAliases(renamedItems, owned) {
  const external = Object.create(null);
  if (!renamedItems || ![null, Object.prototype].includes(Object.getPrototypeOf(renamedItems))) return external;
  for (const [key, value] of Object.entries(renamedItems)) {
    if (owned.get(key) === value) continue;
    external[key] = value;
  }
  return external;
}

async function computeGlobalPlan({core, cpr, renamedItems, existingAliases, packs, loadCorpus, isCurrent = () => true, idle = false, ...corpusOptions}) {
  const provider = 'cpr';
  if (core?.apiVersion !== 1) return {report: {provider, status: 'unsupported-core'}};
  if (!renamedItems || ![null, Object.prototype].includes(Object.getPrototypeOf(renamedItems)) ||
      !Object.isExtensible(renamedItems) || !cpr?.utils?.constants?.packs ||
      !cpr.utils.constants.modernPacks || typeof cpr.utils.genericUtils?.getCPRSetting !== 'function') {
    return {report: {provider, status: 'unsupported-cpr'}};
  }
  try {
    const sources = lookupSources(cpr, packs);
    if (!sources.size) return {report: {provider, status: 'no-visible-candidates'}};
    const corpus = await (loadCorpus ? loadCorpus({fields: CPR_FIELDS})
      : core.readCorpus({packs, ...corpusOptions, fields: CPR_FIELDS}));
    if (!isCurrent() || corpus.isCurrent?.() === false) return {report: {provider, status: 'superseded'}};
    const names = lookupNames(sources, corpus.indexes);
    if (!names.size) return {report: {provider, status: 'no-visible-candidates'}};
    const pairs = core.collectNamePairs(corpus.sources, corpus.titleIndex, names, extraTranslations);
    await yieldTurn(idle);
    if (!isCurrent() || corpus.isCurrent?.() === false) return {report: {provider, status: 'superseded'}};
    let groups;
    try {
      groups = core.itemGroups(corpus.indexes, corpus.catalogFor, corpus.localItems, row => macroNames(row, cpr));
    } catch (error) {
      return {report: {provider, ...core.sourceError(error, 'truesight')}};
    }
    await yieldTurn(idle);
    if (!isCurrent() || corpus.isCurrent?.() === false) return {report: {provider, status: 'superseded'}};
    // CPR's single exact-key table requires agreement across types and editions.
    const {aliases, report} = core.planAliases({pairs, lookupNames: names, existingAliases: existingAliases ?? renamedItems, groups});
    if (!isCurrent() || corpus.isCurrent?.() === false) return {report: {provider, status: 'superseded'}};
    return {report: {...report, provider, grouping: 'truesight'}, aliases, corpus, groups, pairs, pairKnownNames: names};
  } catch (error) {
    return {report: {provider, ...core.sourceError(error)}};
  }
}

export async function activate({onRegister = () => {}, ...options}) {
  const result = await computeGlobalPlan(options);
  if (!result.aliases) return result.report;
  let registered = 0;
  for (const [displayName, lookupName] of result.aliases) {
    if (displayName in options.renamedItems) continue;
    options.renamedItems[displayName] = lookupName;
    onRegister(displayName, lookupName);
    registered++;
  }
  return {...result.report, registered};
}

/** Retract only entries installed by this adapter. A late asynchronous build
 * cannot publish names based on a superseded review. */
export function createController(options) {
  const owned = new Map();
  const api = {report: {provider: 'cpr', status: 'loading'}};
  let scopedState = null, stopLookup = null;
  const hasMedkitEntry = typeof options.cpr?.utils?.compendiumUtils?.getAllAutomations === 'function';
  const clear = () => {
    for (const [key, value] of owned) if (options.renamedItems?.[key] === value) delete options.renamedItems[key];
    owned.clear();
  };
  function planScoped(targetState, thirdParty, scope) {
    const key = JSON.stringify([Boolean(thirdParty), scope.rules, scope.type,
      scope.category ?? null, scope.excludeCategories ?? null, scope.actorType ?? null]);
    if (!targetState.plans.has(key)) {
      const sourceKey = JSON.stringify([Boolean(thirdParty), scope.rules, scope.actorType ?? null, scope.types]);
      let names = targetState.sourcesCache.get(sourceKey);
      if (!names) {
        const sources = lookupSources(options.cpr, options.packs, {
          rules: scope.rules,
          includeMonster: scope.actorType !== 'character'
        });
        names = lookupNames(sources, targetState.corpus.indexes, scope.types);
        targetState.sourcesCache.set(sourceKey, names);
      }
      let missingIdKey = false;
      for (const name of names) {
        if (!targetState.pairKnownNames.has(name) && /^[A-Za-z0-9]{16}$/.test(name)) {
          targetState.pairKnownNames.add(name);
          missingIdKey = true;
        }
      }
      if (missingIdKey) {
        targetState.pairs = options.core.collectNamePairs(targetState.corpus.sources, targetState.corpus.titleIndex, targetState.pairKnownNames, extraTranslations);
      }
      const planned = options.core.planAliases({
        pairs: targetState.pairs,
        lookupNames: names,
        existingAliases: targetState.externalAliases,
        groups: targetState.groups,
        scope
      });
      targetState.plans.set(key, planned);
    }
    return targetState.plans.get(key);
  }
  function resolve(item, lookupOptions) {
    const valid = scopedState?.corpus.isAccessCurrent
      ? scopedState.corpus.isAccessCurrent()
      : scopedState?.corpus.isCurrent?.() !== false;
    if (scopedState && !valid) scopedState = null;
    if (!scopedState || !/\p{Script=Han}/u.test(item.name)) return null;
    const utils = options.cpr.utils;
    const enabledSources = utils.genericUtils.getCPRSetting('additionalCompendiums');
    if (enabledSources && typeof enabledSources === 'object' && !Object.hasOwn(enabledSources, 'chris-premades')) return null;
    const itemTypes = Array.isArray(utils.constants.itemTypes) ? utils.constants.itemTypes : DEFAULT_ITEM_TYPES;
    const scope = lookupScope(item, lookupOptions, options.core, itemTypes);
    if (!scope) return null;
    const planned = planScoped(scopedState, utils.genericUtils.getCPRSetting('thirdParty'), scope);
    return (typeof options.core.resolveItemAlias === 'function'
      ? options.core.resolveItemAlias(planned, item) : planned.aliases.get(item.name)) ?? null;
  }
  if (typeof options.core?.createRefreshQueue !== 'function') {
    api.refresh = async () => (api.report = {provider: 'cpr', status: 'unsupported-core'});
    api.stop = () => { clear(); scopedState = null; api.report = {provider: 'cpr', status: 'stopped'}; };
    return api;
  }
  const queue = options.core.createRefreshQueue({
    invalidate: opts => {
      if (opts?.retract) {
        clear();
        scopedState = null;
        api.report = {provider: 'cpr', status: 'loading'};
      }
    },
    build: async (isCurrent, buildOptions) => {
      const externalAliases = readExternalAliases(options.renamedItems, owned);
      const result = await computeGlobalPlan({
        ...options, existingAliases: externalAliases, isCurrent, idle: Boolean(buildOptions?.idle)
      });
      if (!isCurrent() || result.report.status === 'superseded') return;
      if (!result.aliases) {
        clear();
        scopedState = null;
        api.report = result.report;
        return;
      }
      const nextAliases = result.aliases;
      for (const [key, value] of [...owned]) {
        if (nextAliases.get(key) === value) continue;
        if (options.renamedItems?.[key] === value) delete options.renamedItems[key];
        owned.delete(key);
      }
      let registered = 0;
      for (const [displayName, lookupName] of nextAliases) {
        if (displayName in options.renamedItems) {
          if (owned.get(displayName) === lookupName) registered++;
          continue;
        }
        options.renamedItems[displayName] = lookupName;
        owned.set(displayName, lookupName);
        registered++;
      }
      const nextScoped = {
        corpus: result.corpus,
        groups: result.groups,
        pairs: result.pairs,
        pairKnownNames: result.pairKnownNames,
        externalAliases,
        plans: new Map(),
        sourcesCache: new Map()
      };
      if (hasMedkitEntry && !stopLookup) {
        const utils = options.cpr.utils;
        stopLookup = installLookupFallback({
          compendiumUtils: utils.compendiumUtils,
          source: 'chris-premades',
          resolve,
          isActive: options.isActive ?? (() => true),
          getSourceOrder: () => Object.keys(utils.genericUtils.getCPRSetting('additionalCompendiums') ?? {}),
          getAppliedSource: typeof utils.itemUtils?.getSource === 'function' ? item => utils.itemUtils.getSource(item) : undefined,
          onError: error => { api.lastLookupError = {status: 'lookup-error', detail: String(error)}; }
        });
      }
      scopedState = nextScoped;
      api.report = {...result.report, registered};
    }
  });
  api.refresh = async opts => { await queue.request(opts); return api.report; };
  api.stop = () => {
    queue.stop();
    clear();
    scopedState = null;
    stopLookup?.();
    stopLookup = null;
    api.report = {provider: 'cpr', status: 'stopped'};
  };
  return api;
}
