// Generated from shared/adapter-runtime.mjs. Edit the source, then run npm run build.
import {installLookupFallback} from './medkit-lookup.mjs';

const nextTurn = () => new Promise(resolve => setTimeout(resolve, 0));

export function baselineScopes(itemTypes) {
  const scopes = [];
  for (const rules of ['2014', '2024']) {
    scopes.push(
      {rules, type: 'spell', types: ['spell']},
      {rules, type: 'feat', types: ['feat'], excludeCategories: ['monster'], actorType: 'character'},
      {rules, type: 'item', types: [...itemTypes], actorType: 'character'}
    );
  }
  return scopes;
}

export async function activateProvider({provider, core, cpr, loadCorpus, isActive = () => true}) {
  const api = {report: {provider: provider.id, status: 'loading'}};
  if (core?.apiVersion !== 1 || typeof core.createRefreshQueue !== 'function') {
    api.report.status = 'unsupported-core';
    return api;
  }
  const utils = cpr?.utils;
  if (typeof utils?.compendiumUtils?.getAllAutomations !== 'function' ||
      typeof utils?.compendiumUtils?.[provider.lookupMethod] !== 'function' ||
      typeof utils?.genericUtils?.getCPRSetting !== 'function' || !Array.isArray(utils?.constants?.itemTypes)) {
    api.report.status = 'unsupported-' + provider.id + '-entry';
    return api;
  }
  let state, stop;
  function pairsForMode(targetState, mode, scopeNames) {
    let cached = targetState.pairsCache.get(mode);
    if (!cached) {
      const allNames = new Set(scopeNames);
      for (const scope of baselineScopes(utils.constants.itemTypes)) {
        for (const name of provider.catalogNames(targetState.corpus, mode, scope)) allNames.add(name);
      }
      cached = {
        pairs: core.collectNamePairs(targetState.corpus.sources, targetState.corpus.titleIndex, allNames),
        knownNames: allNames
      };
      targetState.pairsCache.set(mode, cached);
    } else {
      let missingIdKey = false;
      for (const name of scopeNames) {
        if (!cached.knownNames.has(name) && /^[A-Za-z0-9]{16}$/.test(name)) {
          cached.knownNames.add(name);
          missingIdKey = true;
        }
      }
      if (missingIdKey) {
        cached.pairs = core.collectNamePairs(targetState.corpus.sources, targetState.corpus.titleIndex, cached.knownNames);
      }
    }
    return cached.pairs;
  }
  function planFor(targetState, targetReport, mode, scope) {
    const key = JSON.stringify([mode, scope.rules, scope.type, scope.category ?? null, scope.excludeCategories ?? null, scope.actorType ?? null]);
    if (!targetState.plans.has(key)) {
      const names = provider.catalogNames(targetState.corpus, mode, scope);
      const pairs = pairsForMode(targetState, mode, names);
      const result = core.planAliases({pairs, lookupNames: names, groups: targetState.groups, scope});
      targetState.plans.set(key, result);
      targetReport.scopes.push({...result.report, mode});
      if (result.report.status === 'cluster-conflict') targetReport.status = 'cluster-conflict';
    }
    return targetState.plans.get(key);
  }
  function resolve(item, options) {
    const valid = state?.corpus.isAccessCurrent ? state.corpus.isAccessCurrent() : state?.corpus.isCurrent?.() !== false;
    if (state && !valid) state = null;
    if (!state || !/\p{Script=Han}/u.test(item.name)) return null;
    const enabledSources = utils.genericUtils.getCPRSetting('additionalCompendiums');
    if (!Object.hasOwn(enabledSources ?? {}, provider.source)) return null;
    const scope = lookupScope(item, options, core, utils.constants.itemTypes);
    if (!scope) return null;
    const mode = utils.genericUtils.getCPRSetting(provider.modeSetting);
    const planned = planFor(state, api.report, mode, scope);
    return (typeof core.resolveItemAlias === 'function' ? core.resolveItemAlias(planned, item) : planned.aliases.get(item.name)) ?? null;
  }
  const queue = core.createRefreshQueue({
    invalidate: options => {
      if (options?.retract) {
        state = null;
        api.report = {provider: provider.id, status: 'loading'};
      }
    },
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
        await nextTurn();
        if (!isCurrent() || corpus.isCurrent?.() === false) return;
        const nextState = {corpus, groups, plans: new Map(), pairsCache: new Map()};
        const nextReport = {provider: provider.id, status: 'ready', grouping: 'truesight', scopes: []};
        // Validate every dictionary before enabling any fallback. Plans remain
        // scoped; the two editions never share a global display-name map.
        const mode = utils.genericUtils.getCPRSetting(provider.modeSetting);
        const scopes = baselineScopes(utils.constants.itemTypes);
        for (let i = 0; i < scopes.length; i++) {
          planFor(nextState, nextReport, mode, scopes[i]);
          if (i + 1 < scopes.length) {
            await nextTurn();
            if (!isCurrent() || corpus.isCurrent?.() === false) return;
          }
        }
        if (!isCurrent() || corpus.isCurrent?.() === false) return;
        if (!stop) stop = installLookupFallback({compendiumUtils: utils.compendiumUtils, source: provider.source, resolve, isActive,
          getSourceOrder: () => Object.keys(utils.genericUtils.getCPRSetting('additionalCompendiums') ?? {}),
          getAppliedSource: typeof utils.itemUtils?.getSource === 'function' ? item => utils.itemUtils.getSource(item) : undefined,
          onError: error => { api.lastLookupError = {status: 'lookup-error', detail: String(error)}; }});
        if (!stop) {
          state = null;
          api.report = {provider: provider.id, status: 'unsupported-' + provider.id + '-entry'};
          return;
        }
        state = nextState;
        api.report = nextReport;
      } catch (error) {
        if (isCurrent()) {
          state = null;
          api.report = {provider: provider.id, ...core.sourceError(error)};
        }
      }
    }
  });
  api.refresh = async options => { await queue.request(options); return api.report; };
  api.stop = () => {
    queue.stop();
    state = null;
    stop?.();
    stop = null;
    api.report = {provider: provider.id, status: 'stopped'};
  };
  await api.refresh();
  return api;
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
  if (!type) return null;
  const rawCategory = type === 'feat' && typeof item.system?.type?.value === 'string'
    ? item.system.type.value.trim() : '';
  const category = rawCategory || undefined;
  const excludeCategories = type === 'feat' && actorType === 'character' && category !== 'monster'
    ? ['monster'] : undefined;
  const scopeActorType = type === 'spell' ? undefined : actorType;
  return {
    rules, type,
    types: type === 'item' ? [...itemTypes] : [type],
    ...(category ? {category} : {}),
    ...(excludeCategories ? {excludeCategories} : {}),
    ...(scopeActorType ? {actorType: scopeActorType} : {})
  };
}
