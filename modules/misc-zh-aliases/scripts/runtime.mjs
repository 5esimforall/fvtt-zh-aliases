import {catalogNames, lookupScope} from './catalog.mjs';
import {installLookupFallback} from './lookup.mjs';

export async function activate({core, cpr, loadCorpus, isActive = () => true}) {
  const api = {report: {provider: 'misc', status: 'loading'}};
  if (core?.apiVersion !== 1 || typeof core.createRefreshQueue !== 'function') {
    api.report.status = 'unsupported-core';
    return api;
  }
  const utils = cpr?.utils;
  if (typeof utils?.compendiumUtils?.getAllAutomations !== 'function' ||
      typeof utils?.compendiumUtils?.getMISCAutomation !== 'function' ||
      typeof utils?.genericUtils?.getCPRSetting !== 'function' || !Array.isArray(utils?.constants?.itemTypes)) {
    api.report.status = 'unsupported-misc-entry';
    return api;
  }
  let state, stop;
  function plan(mode, scope) {
    const key = JSON.stringify([mode, scope.rules, scope.type]);
    if (!state.plans.has(key)) {
      const names = catalogNames(state.corpus.indexes, mode, scope, state.corpus.miscCatalog);
      const pairs = core.collectNamePairs(state.corpus.sources, state.corpus.titleIndex, names);
      const result = core.planAliases({pairs, lookupNames: names, groups: state.groups, scope});
      state.plans.set(key, result);
      api.report.scopes.push({...result.report, mode});
      if (result.report.status === 'cluster-conflict') api.report.status = 'cluster-conflict';
    }
    return state.plans.get(key);
  }
  function resolve(item, options) {
    if (state?.corpus.isCurrent?.() === false) state = null;
    if (!state || !/\p{Script=Han}/u.test(item.name)) return null;
    const enabledSources = utils.genericUtils.getCPRSetting('additionalCompendiums');
    if (!Object.hasOwn(enabledSources ?? {}, 'midi-item-showcase-community')) return null;
    const scope = lookupScope(item, options, core, utils.constants.itemTypes);
    if (!scope) return null;
    const mode = utils.genericUtils.getCPRSetting('miscPremades');
    return plan(mode, scope).aliases.get(item.name) ?? null;
  }
  const queue = core.createRefreshQueue({
    invalidate: () => { state = null; api.report = {provider: 'misc', status: 'loading'}; },
    build: async isCurrent => {
      try {
        const corpus = await loadCorpus();
        if (!isCurrent() || corpus.isCurrent?.() === false) return;
        let groups;
        try {
          groups = core.itemGroups(corpus.indexes, corpus.catalogFor, corpus.localItems);
        } catch (error) {
          throw Object.assign(new Error('Grouping unavailable', {cause: error}), {source: 'truesight'});
        }
        if (!isCurrent() || corpus.isCurrent?.() === false) return;
        state = {corpus, groups, plans: new Map()};
        api.report = {provider: 'misc', status: 'ready', grouping: 'truesight', scopes: []};
        // Validate every dictionary before enabling any fallback. Plans remain
        // scoped; the two editions never share a global display-name map.
        const mode = utils.genericUtils.getCPRSetting('miscPremades');
        for (const rules of ['2014', '2024']) for (const type of ['spell', 'feat', 'item']) {
          plan(mode, {rules, type, types: type === 'item' ? [...utils.constants.itemTypes] : [type]});
        }
        if (!stop) stop = installLookupFallback({compendiumUtils: utils.compendiumUtils, resolve, isActive,
          onError: error => { api.lastLookupError = {status: 'lookup-error', detail: String(error)}; }});
        if (!stop) {
          state = null;
          api.report = {provider: 'misc', status: 'unsupported-misc-entry'};
        }
      } catch (error) {
        if (isCurrent()) {
          state = null;
          api.report = {provider: 'misc', ...core.sourceError(error)};
        }
      }
    }
  });
  api.refresh = async () => { await queue.request(); return api.report; };
  api.stop = () => {
    queue.stop();
    state = null;
    stop?.();
    stop = null;
    api.report = {provider: 'misc', status: 'stopped'};
  };
  await api.refresh();
  return api;
}
