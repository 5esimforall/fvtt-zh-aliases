// Generated from shared/medkit-lookup.mjs. Edit the source, then run npm run build.
// @ts-check

// One router per CPR namespace, shared by independently installed adapter bundles.
// The versioned symbol is a private registration protocol, not a provider alias table.
const routerKey = Symbol.for('fvtt-zh-aliases.medkit-lookup.v1');

/**
 * @param {any} item
 * @param {string} name
 * @returns {any}
 */
function lookupView(item, name) {
  return new Proxy({}, {
    get: (_, key) => {
      if (key === 'name') return name;
      const value = Reflect.get(item, key, item);
      return typeof value === 'function' ? value.bind(item) : value;
    },
    has: (_, key) => key in item,
    getPrototypeOf: () => Object.getPrototypeOf(item),
    set: () => false, defineProperty: () => false, deleteProperty: () => false
  });
}

/**
 * @param {any} compendiumUtils
 * @param {() => string[]} getSourceOrder
 * @param {((item: any) => string | undefined) | undefined} getAppliedSource
 */
function createRouter(compendiumUtils, getSourceOrder, getAppliedSource) {
  /** @type {Map<string, any>} */
  const providers = new Map();
  /** @type {Record<string, any>} */
  const originals = {getAllAutomations: compendiumUtils.getAllAutomations};
  for (const key of ['getPreferredAutomation', 'getAppliedOrPreferredAutomation']) {
    if (typeof compendiumUtils[key] === 'function') originals[key] = compendiumUtils[key];
  }
  /**
   * @param {any} provider
   * @param {unknown} error
   */
  const notify = (provider, error) => { try { provider.onError(error); } catch { /* Diagnostics cannot replace native results. */ } };
  /** @param {any} provider */
  const active = provider => {
    if (providers.get(provider.source) !== provider) return false;
    try { return provider.isActive(); } catch (error) { notify(provider, error); return false; }
  };
  const anyActive = () => [...providers.values()].some(active);
  /**
   * @param {any} provider
   * @param {any} item
   * @param {any} options
   * @returns {string | null}
   */
  const resolve = (provider, item, options) => {
    if (!active(provider)) return null;
    try { return provider.resolve(item, options); } catch (error) { notify(provider, error); return null; }
  };

  /**
   * @this {any}
   * @param {any} item
   * @param {any} [options]
   * @returns {Promise<any>}
   */
  async function getAllAutomations(item, options = {}) {
    // Preserve native exceptions and document identity. CPR mutates its options.
    const results = await originals.getAllAutomations.call(this, item, {...options});
    if (!Array.isArray(results) || !anyActive()) return results;
    /** @type {Map<string, Promise<any>>} */
    const retries = new Map();
    /** @type {Array<{ provider: any, name: string, entries: any[] }>} */
    const additions = [];
    const candidates = [...providers.values()];
    // Equal-priority aliases use CPR's configured source order, never adapter
    // registration order. Existing native candidates retain their own tie order.
    /** @type {string[]} */
    let order;
    try {
      order = getSourceOrder();
      if (!Array.isArray(order)) throw new TypeError('Expected automation source order');
    } catch (error) {
      candidates.forEach(provider => notify(provider, error));
      return results;
    }
    /** @param {string} source */
    const rank = source => { const i = order.indexOf(source); return i < 0 ? Infinity : i; };
    candidates.sort((a, b) => (rank(a.source) - rank(b.source)) || a.source.localeCompare(b.source));
    for (const provider of candidates) {
      if (results.some(entry => entry.source === provider.source)) continue;
      const name = resolve(provider, item, options);
      if (!name || name === item.name) continue;
      try {
        // Each distinct English name is queried once, always through the
        // pre-router entry rather than another provider's fallback.
        if (!retries.has(name)) retries.set(name, originals.getAllAutomations.call(this, lookupView(item, name), {...options}));
        const retry = await retries.get(name);
        if (!Array.isArray(retry)) throw new TypeError('Expected automation candidates');
        additions.push({provider, name, entries: retry.filter(entry => entry.source === provider.source)});
      } catch (error) { notify(provider, error); }
    }
    // A stop, evidence refresh, or permission change while awaiting a retry
    // must not publish candidates from a withdrawn plan.
    const extra = additions.flatMap(({provider, name, entries}) => resolve(provider, item, options) === name ? entries : []);
    return extra.length ? [...results, ...extra].sort((a, b) => a.priority - b.priority) : results;
  }

  /**
   * @this {any}
   * @param {any} item
   * @param {any} options
   * @returns {Promise<any>}
   */
  async function preferred(item, options) {
    // Read the public entry at call time so later extensions remain in the path.
    const results = await compendiumUtils.getAllAutomations.call(this, item, {...options});
    if (!Array.isArray(results)) return originals.getPreferredAutomation?.call(this, item, {...options});
    return results[0]?.document;
  }

  /** @type {Record<string, any>} */
  const wrappers = {getAllAutomations};
  if (originals.getPreferredAutomation) wrappers.getPreferredAutomation = /** @this {any} @param {any} item @param {any} [options] */ async function(item, options = {}) {
    if (!anyActive()) return originals.getPreferredAutomation.call(this, item, {...options});
    return preferred.call(this, item, options);
  };
  if (originals.getAppliedOrPreferredAutomation && typeof getAppliedSource === 'function') {
    wrappers.getAppliedOrPreferredAutomation = /** @this {any} @param {any} item @param {any} [options] */ async function(item, options = {}) {
      if (!anyActive()) return originals.getAppliedOrPreferredAutomation.call(this, item, {...options});
      const source = getAppliedSource(item);
      if (!source) return preferred.call(this, item, options);
      // Preserve CPR's existing applied-source semantics, including custom
      // compendium sources. A missing applied provider is not permission to switch.
      const result = await originals.getAppliedOrPreferredAutomation.call(this, item, {...options});
      if (result || !providers.has(source)) return result;
      const results = await compendiumUtils.getAllAutomations.call(this, item, {...options});
      return Array.isArray(results) ? results.find(entry => entry.source === source)?.document : result;
    };
  }

  function restore() {
    for (const [key, wrapper] of Object.entries(wrappers)) {
      if (compendiumUtils[key] !== wrapper) continue;
      try { compendiumUtils[key] = originals[key]; } catch { /* Retained wrappers become native pass-throughs. */ }
    }
    if (compendiumUtils[routerKey] === router) Reflect.deleteProperty(compendiumUtils, routerKey);
  }
  const router = {
    protocol: 1,
    /** @param {any} provider */
    register(provider) {
      if (providers.has(provider.source)) return null;
      providers.set(provider.source, provider);
      return () => {
        if (providers.get(provider.source) !== provider) return;
        providers.delete(provider.source);
        if (!providers.size) restore();
      };
    }
  };
  try {
    Object.defineProperty(compendiumUtils, routerKey, {value: router, configurable: true});
    for (const [key, wrapper] of Object.entries(wrappers)) {
      compendiumUtils[key] = wrapper;
      if (compendiumUtils[key] !== wrapper) throw new TypeError('Read-only automation entry: ' + key);
    }
  } catch {
    restore();
    return null;
  }
  return router;
}

/**
 * @param {import('../types/aliases.d.ts').LookupFallbackOptions} options
 * @returns {(() => void) | null}
 */
export function installLookupFallback({compendiumUtils, source, resolve, isActive = () => true, onError = () => {},
  getSourceOrder = () => [], getAppliedSource}) {
  if (typeof compendiumUtils?.getAllAutomations !== 'function' || typeof source !== 'string' || typeof resolve !== 'function') return null;
  const router = compendiumUtils[routerKey] ?? createRouter(compendiumUtils, getSourceOrder, getAppliedSource);
  if (router?.protocol !== 1 || typeof router.register !== 'function') return null;
  return router.register({source, resolve, isActive, onError});
}
