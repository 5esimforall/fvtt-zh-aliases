import test from 'node:test';
import assert from 'node:assert/strict';
import {installLookupFallback as installGPS} from '../modules/gps-zh-aliases/scripts/shared/medkit-lookup.mjs';
import {installLookupFallback as installMISC} from '../modules/misc-zh-aliases/scripts/shared/medkit-lookup.mjs';

const gps = 'gambits-premades', misc = 'midi-item-showcase-community', cpr = 'chris-premades';
const item = (name = '中文能力', source) => Object.freeze({name, type: 'feat', source});
const candidate = (source, priority, id = source) => ({source, priority, version: 'fixture', document: Object.freeze({uuid: id})});
function environment() {
  const calls = [], byName = new Map(), order = [misc, gps, cpr];
  const nativeAll = async (item, options = {}) => {
    calls.push(item.name);
    options.type = 'character';
    return (byName.get(item.name) ?? []).slice().sort((a, b) => a.priority - b.priority);
  };
  // These use local references, like CPR: wrapping the exported all entry alone
  // cannot change the preferred or applied queries.
  const nativePreferred = async (...args) => (await nativeAll(...args))[0]?.document;
  const nativeApplied = async (item, options) => item.source
    ? (await nativeAll(item, options)).find(entry => entry.source === item.source)?.document
    : nativePreferred(item, options);
  const utils = {getAllAutomations: nativeAll, getPreferredAutomation: nativePreferred, getAppliedOrPreferredAutomation: nativeApplied};
  const originals = {...utils};
  const install = (source, options = {}) => (source === gps ? installGPS : installMISC)({
    compendiumUtils: utils, source, resolve: item => /中文/.test(item.name) ? 'English Feature' : null,
    getSourceOrder: () => order, getAppliedSource: item => item.source, ...options
  });
  return {calls, byName, order, utils, originals, install};
}

test('independent bundles share one router, deduplicate retries and agree across all three entries in either load order', async () => {
  assert.notEqual(installGPS, installMISC, 'exercise separate published module instances');
  for (const sources of [[gps, misc], [misc, gps]]) {
    const env = environment(), candidates = [candidate(gps, 20), candidate(misc, 10)];
    env.byName.set('English Feature', candidates);
    const stopFirst = env.install(sources[0]);
    const wrappers = {...env.utils};
    const stopSecond = env.install(sources[1]);
    for (const key of Object.keys(wrappers)) assert.equal(env.utils[key], wrappers[key], 'no additional wrapper: ' + key);
    assert.equal(env.install(sources[0]), null);
    for (const name of ['English Feature', '中文能力', '中文能力 English Feature']) {
      const document = item(name), options = Object.freeze({rules: 'legacy'});
      env.calls.length = 0;
      const all = await env.utils.getAllAutomations(document, options);
      assert.deepEqual(all.map(row => row.source), [misc, gps]);
      assert.deepEqual(env.calls, name === 'English Feature' ? [name] : [name, 'English Feature']);
      assert.equal(await env.utils.getPreferredAutomation(document, options), all[0].document);
      assert.equal(await env.utils.getAppliedOrPreferredAutomation(document, options), all[0].document);
      assert.equal(document.name, name);
      assert.deepEqual(options, {rules: 'legacy'});
    }
    stopFirst();
    assert.equal((await env.utils.getPreferredAutomation(item())).uuid, sources[1]);
    stopSecond();
    assert.deepEqual(env.utils, env.originals);
    assert.equal(await env.utils.getPreferredAutomation(item()), undefined);
    const stopReload = env.install(gps);
    assert.equal((await env.utils.getPreferredAutomation(item())).uuid, gps);
    stopReload();
  }
});

test('native provider hits stay intact while CPR priorities select the preferred candidate, including equal-priority ties', async () => {
  for (const sources of [[gps, misc], [misc, gps]]) {
    const env = environment();
    const native = candidate(cpr, 30), nativeGPS = candidate(gps, 20, 'native-gps-alias');
    env.byName.set('中文能力', [native, nativeGPS]);
    env.byName.set('English Feature', [candidate(misc, 10), candidate(gps, 0, 'must-not-replace'), candidate('other', -1)]);
    const stops = sources.map(source => env.install(source));
    let all = await env.utils.getAllAutomations(item());
    assert.deepEqual(all.map(r => r.document.uuid), [misc, 'native-gps-alias', cpr]);
    assert.equal(await env.utils.getPreferredAutomation(item()), all[0].document);
    // Changing only native priorities changes the winner; no hardcoded MISC/GPS precedence.
    native.priority = 5;
    assert.equal(await env.utils.getPreferredAutomation(item()), native.document);
    native.priority = 10;
    assert.equal(await env.utils.getPreferredAutomation(item()), native.document, 'native result wins a priority tie');
    env.byName.delete('中文能力');
    env.byName.set('English Feature', [candidate(gps, 10), candidate(misc, 10)]);
    assert.equal((await env.utils.getPreferredAutomation(item())).uuid, misc);
    env.order.reverse();
    assert.equal((await env.utils.getPreferredAutomation(item())).uuid, gps);
    stops.forEach(stop => stop());
  }
});

test('applied source remains pinned even when another provider is preferred, unavailable, or unadapted', async () => {
  const env = environment(), native = candidate(misc, 50, 'existing-applied');
  env.byName.set('English Feature', [candidate(gps, 1), candidate(misc, 20)]);
  const stops = [env.install(gps), env.install(misc)];
  assert.equal((await env.utils.getPreferredAutomation(item())).uuid, gps);
  assert.equal((await env.utils.getAppliedOrPreferredAutomation(item('中文能力', misc))).uuid, misc);
  env.byName.set('中文能力', [native]);
  assert.equal(await env.utils.getAppliedOrPreferredAutomation(item('中文能力', misc)), native.document);
  env.byName.delete('中文能力');
  env.byName.set('English Feature', [candidate(gps, 1)]);
  assert.equal(await env.utils.getAppliedOrPreferredAutomation(item('中文能力', misc)), undefined);
  assert.equal(await env.utils.getAppliedOrPreferredAutomation(item('中文能力', 'custom.pack')), undefined);
  assert.equal(await env.utils.getAppliedOrPreferredAutomation(item('中文能力', cpr)), undefined);
  stops.forEach(stop => stop());
});

test('unknown or rejected names, inactive providers and missing optional CPR entries retain native behavior', async () => {
  const env = environment();
  env.byName.set('English Feature', [candidate(gps, 1)]);
  let enabled = true, name = null;
  const stop = env.install(gps, {isActive: () => enabled, resolve: () => name});
  assert.deepEqual(await env.utils.getAllAutomations(item()), []);
  assert.equal(await env.utils.getPreferredAutomation(item()), undefined);
  assert.equal(await env.utils.getAppliedOrPreferredAutomation(item()), undefined);
  name = 'English Feature';
  assert.equal((await env.utils.getPreferredAutomation(item())).uuid, gps);
  enabled = false;
  assert.deepEqual(await env.utils.getAllAutomations(item()), []);
  assert.equal(await env.utils.getPreferredAutomation(item()), undefined);
  assert.equal(await env.utils.getAppliedOrPreferredAutomation(item()), undefined);
  stop();
});

test('installation rolls back all entries if an optional entry is read-only; absent entries are not invented', async () => {
  const env = environment();
  Object.defineProperty(env.utils, 'getPreferredAutomation', {writable: false});
  assert.equal(env.install(gps), null);
  assert.deepEqual(env.utils, env.originals);
  assert.equal(Object.getOwnPropertySymbols(env.utils).length, 0);
  Object.defineProperty(env.utils, 'getPreferredAutomation', {writable: true});
  delete env.utils.getPreferredAutomation;
  delete env.utils.getAppliedOrPreferredAutomation;
  const stop = env.install(gps);
  assert.equal(typeof stop, 'function');
  assert.equal('getPreferredAutomation' in env.utils, false);
  assert.equal('getAppliedOrPreferredAutomation' in env.utils, false);
  stop();
});

test('later third-party wrappers survive stop and retained router functions become pass-throughs', async () => {
  const env = environment();
  env.byName.set('English Feature', [candidate(gps, 1)]);
  const stop = env.install(gps), outer = {};
  for (const [key, wrapped] of Object.entries(env.utils)) {
    outer[key] = env.utils[key] = function(...args) { return wrapped.apply(this, args); };
  }
  assert.equal((await env.utils.getPreferredAutomation(item())).uuid, gps);
  stop();
  for (const key of Object.keys(outer)) assert.equal(env.utils[key], outer[key]);
  assert.equal(await env.utils.getPreferredAutomation(item()), undefined);
  assert.equal(await env.utils.getAppliedOrPreferredAutomation(item()), undefined);
  const stopAgain = env.install(gps);
  assert.equal((await env.utils.getPreferredAutomation(item())).uuid, gps);
  stopAgain();
  for (const key of Object.keys(outer)) assert.equal(env.utils[key], outer[key]);
});

test('stopping or invalidating evidence during a pending retry cannot publish stale candidates', async () => {
  for (const action of ['stop', 'invalidate', 'inactive']) {
    let release, started;
    const waiting = new Promise(resolve => { started = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    const env = environment();
    env.utils.getAllAutomations = async document => {
      if (document.name !== 'English Feature') return [];
      started();
      return pending;
    };
    let name = 'English Feature', active = true;
    const stop = env.install(gps, {resolve: () => name, isActive: () => active});
    const result = env.utils.getPreferredAutomation(item());
    await waiting;
    if (action === 'stop') stop();
    if (action === 'invalidate') name = null;
    if (action === 'inactive') active = false;
    release([candidate(gps, 1)]);
    assert.equal(await result, undefined);
    stop();
  }
});

test('one provider failure preserves original candidates and the other provider; native exceptions still propagate', async () => {
  const env = environment(), native = candidate(cpr, 10), errors = [];
  env.byName.set('中文能力', [native]);
  env.byName.set('English Feature', [candidate(misc, 1)]);
  const stopGPS = env.install(gps, {resolve: () => {throw Error('bad plan');}, onError: error => errors.push(error.message)});
  const stopMISC = env.install(misc);
  assert.equal((await env.utils.getPreferredAutomation(item())).uuid, misc);
  assert.deepEqual((await env.utils.getAllAutomations(item())).map(r => r.source), [misc, cpr]);
  assert.ok(errors.includes('bad plan'));
  stopGPS(); stopMISC();
  const broken = {getAllAutomations: async () => {throw Error('native failure');}, getPreferredAutomation: async () => undefined};
  const stop = installGPS({compendiumUtils: broken, source: gps, resolve: () => 'English Feature'});
  await assert.rejects(broken.getPreferredAutomation(item()), /native failure/);
  stop();
});

test('retry view preserves frozen document receivers, nested data, options and native namespace receivers', async () => {
  const data = Object.freeze({identifier: 'original-system-identifier'});
  const document = Object.freeze({name: '中文能力', system: data,
    readIdentity() { assert.equal(this, document); return this.system; }});
  const options = Object.freeze({rules: 'legacy', identifier: 'original-cpr-identifier'});
  const result = candidate(gps, 1);
  const utils = {getAllAutomations: async function(view, received) {
    assert.equal(this, utils);
    assert.equal(view.system, data);
    assert.equal(view.readIdentity(), data);
    assert.deepEqual(received, options);
    received.type = 'character';
    if (view.name !== 'English Feature') return [];
    assert.equal(Reflect.set(view, 'name', 'mutated'), false);
    return [result];
  }, getPreferredAutomation: async () => undefined};
  const stop = installGPS({compendiumUtils: utils, source: gps, resolve: () => 'English Feature'});
  assert.equal(await utils.getPreferredAutomation(document, options), result.document);
  assert.equal(document.name, '中文能力');
  assert.deepEqual(options, {rules: 'legacy', identifier: 'original-cpr-identifier'});
  stop();
});

test('source-order failures and non-array retries preserve native results; applied queries without source API remain untouched', async () => {
  const native = [candidate(cpr, 1)], errors = [];
  const nativeApplied = async () => native[0].document;
  const utils = {getAllAutomations: async item => item.name === 'English Feature' ? null : native,
    getAppliedOrPreferredAutomation: nativeApplied};
  let stop = installGPS({compendiumUtils: utils, source: gps, resolve: () => 'English Feature',
    getSourceOrder: () => {throw Error('settings unavailable');}, onError: error => errors.push(error.message)});
  assert.equal(await utils.getAllAutomations(item()), native);
  assert.equal(utils.getAppliedOrPreferredAutomation, nativeApplied);
  assert.deepEqual(errors, ['settings unavailable']);
  stop();
  stop = installGPS({compendiumUtils: utils, source: gps, resolve: () => 'English Feature', onError: error => errors.push(error.message)});
  assert.equal(await utils.getAllAutomations(item()), native);
  assert.equal(errors.at(-1), 'Expected automation candidates');
  stop();
});
