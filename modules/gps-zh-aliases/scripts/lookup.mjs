const source = 'gambits-premades';
const installed = new WeakMap();

function lookupView(item, name) {
  // A separate read-only receiver also works when the original document is
  // frozen. Getters/methods retain their real document receiver and identity.
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

export function installLookupFallback({compendiumUtils, resolve, isActive = () => true, onError = () => {}}) {
  if (typeof compendiumUtils?.getAllAutomations !== 'function' || installed.has(compendiumUtils)) return null;
  const original = compendiumUtils.getAllAutomations;
  let enabled = true;
  async function getAllAutomations(item, options = {}) {
    const results = await original.call(this, item, {...options});
    if (!enabled || !isActive() || !Array.isArray(results) || results.some(entry => entry.source === source)) return results;
    try {
      const name = resolve(item, options);
      if (!name || name === item.name) return results;
      // Let CPR retain its own GPS directory, readiness, settings, priority,
      // version and UUID selection. Never publish other providers' retry hits.
      const retry = await original.call(this, lookupView(item, name), {...options});
      if (!enabled || !isActive()) return results;
      const gps = retry.filter(entry => entry.source === source);
      return gps.length ? [...results, ...gps].sort((a, b) => a.priority - b.priority) : results;
    } catch (error) {
      onError(error);
      return results;
    }
  }
  try {
    compendiumUtils.getAllAutomations = getAllAutomations;
    if (compendiumUtils.getAllAutomations !== getAllAutomations) return null;
  } catch {
    return null;
  }
  const stop = () => {
    if (!enabled) return;
    enabled = false;
    // Do not overwrite an extension installed after us; a retained chain calls
    // this disabled pass-through until the next reload.
    if (compendiumUtils.getAllAutomations === getAllAutomations) {
      try { compendiumUtils.getAllAutomations = original; } catch { /* Disabled pass-through if subsequently frozen. */ }
    }
    installed.delete(compendiumUtils);
  };
  installed.set(compendiumUtils, stop);
  return stop;
}
