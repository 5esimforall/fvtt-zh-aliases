import {connectCatalog} from '../modules/truesight/scripts/catalog/api.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {core} from '../modules/truesight/scripts/names/api.mjs';
import {BASE_ITEM_PACKS} from '../modules/truesight/scripts/names/translations.mjs';
import {activate} from '../modules/gps-zh-aliases/scripts/runtime.mjs';
import {installLookupFallback} from '../modules/gps-zh-aliases/scripts/lookup.mjs';
import {activate as activateCPR} from '../modules/cpr-zh-aliases/scripts/runtime.mjs';

function client() {
  const docs = ['2014', '2024'].map((rules, i) => ({_id: 'indomitable' + i, name: 'Indomitable', type: 'feat',
    uuid: 'Compendium.gambits-premades.gps-class-features' + (i ? '-2024' : '') + '.Item.indomitable' + i,
    system: {source: {rules}}}));
  const packs = new Map(docs.map((doc, i) => ['gambits-premades.gps-class-features' + (i ? '-2024' : ''),
    {visible: true, documentName: 'Item', getIndex: async () => new Map([[doc._id, doc]])}]));
  const titleIndex = Object.fromEntries(BASE_ITEM_PACKS.map(id => [id, {titles: {}}]));
  titleIndex['dnd5e.classfeatures'].titles = {Indomitable: '不屈'};
  const settings = {gambitPremades: 1, additionalCompendiums: {'chris-premades': 0, 'gambits-premades': 10}};
  const calls = [];
  const itemTypes = ['weapon', 'equipment', 'consumable', 'tool', 'backpack', 'loot'];
  const native = async (item, options) => {
    calls.push({name: item.name, rules: options.rules, actor: item.actor});
    if (!Object.hasOwn(settings.additionalCompendiums, 'gambits-premades')) return [];
    const doc = docs.find(doc => doc.name === item.name && doc.system.source.rules === core.rulesEdition(options.rules ?? 'legacy'));
    return doc ? [{document: doc, source: 'gambits-premades', priority: 10, version: 'fixture'}] : [];
  };
  const compendiumUtils = {getAllAutomations: native, getGPSAutomation: async () => {}};
  const cpr = {utils: {compendiumUtils, constants: {itemTypes}, genericUtils: {getCPRSetting: key => settings[key]}}};
  const localItems = [];
  const loadCorpus = () => core.readCorpus({packs, localItems, loadTitleIndex: async () => titleIndex,
    loadGrouping: () => items => new Map(items.map(i => [i.uuid, {key: null}]))});
  return {core, cpr, loadCorpus, packs, titleIndex, settings, calls, docs, compendiumUtils, native, localItems};
}
const feat = name => Object.freeze({name, type: 'feat'});

test('GPS alone recognizes Chinese and bilingual Indomitable with native UUIDs, rules and display names unchanged', async () => {
  for (let clientNumber = 0; clientNumber < 2; clientNumber++) {
    const env = client(), api = await activate(env);
    assert.equal(api.report.status, 'ready');
    assert.equal(api.report.scopes.length, 6);
    for (const [i, rules] of ['legacy', 'modern'].entries()) {
      const lookup = name => env.compendiumUtils.getAllAutomations(feat(name), {rules});
      const [control] = await lookup('Indomitable');
      assert.equal(control.document.uuid, env.docs[i].uuid);
      for (const name of ['不屈', '不屈 Indomitable']) {
        const item = feat(name);
        const [result] = await env.compendiumUtils.getAllAutomations(item, {rules});
        assert.equal(result.document, control.document);
        assert.equal(result.source, 'gambits-premades');
        assert.equal(result.version, 'fixture');
        assert.equal(item.name, name);
      }
    }
    assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('未知不屈')), []);
    api.stop();
    assert.equal(env.compendiumUtils.getAllAutomations, env.native);
    assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('不屈'), {}), []);
  }
});

test('GPS preserves native hits and existing aliases without consulting the fallback', async () => {
  const existing = [{source: 'gambits-premades', document: {uuid: 'native-alias'}}];
  const utils = {getAllAutomations: async () => existing};
  const stop = installLookupFallback({compendiumUtils: utils, resolve: () => {throw Error('must not resolve');}});
  assert.equal(await utils.getAllAutomations(feat('既有名称')), existing);
  stop();
});

test('retry contributes only GPS, retains existing providers and priority, and does not mutate options', async () => {
  const originalDoc = {uuid: 'cpr.original'}, otherDoc = {uuid: 'misc.retry'}, gpsDoc = {uuid: 'gps'};
  const options = Object.freeze({rules: 'modern'});
  const utils = {getAllAutomations: async (item, opts) => {
    opts.type = 'character';
    return item.name === '不屈' ? [{source: 'chris-premades', priority: 20, document: originalDoc}]
      : [{source: 'gambits-premades', priority: 10, document: gpsDoc}, {source: 'misc', priority: 0, document: otherDoc}];
  }};
  const stop = installLookupFallback({compendiumUtils: utils, resolve: () => 'Indomitable'});
  const results = await utils.getAllAutomations(feat('不屈'), options);
  assert.deepEqual(results.map(x => x.source), ['gambits-premades', 'chris-premades']);
  assert.equal(results[0].document, gpsDoc);
  assert.equal(results[1].document, originalDoc);
  assert.deepEqual(options, {rules: 'modern'});
  stop();
});

test('a fallback error keeps original behavior, while an original lookup error is not swallowed', async () => {
  const errors = [], original = [];
  const utils = {getAllAutomations: async item => {if (item.name === 'Indomitable') throw Error('retry failed'); return original;}};
  const stop = installLookupFallback({compendiumUtils: utils, resolve: () => 'Indomitable', onError: e => errors.push(e.message)});
  assert.equal(await utils.getAllAutomations(feat('不屈')), original);
  assert.deepEqual(errors, ['retry failed']);
  await assert.rejects(utils.getAllAutomations(feat('Indomitable')), /retry failed/);
  stop();
});

test('conflicting translations fail closed and a failed refresh discards the previous plan', async () => {
  const env = client();
  env.titleIndex['dnd5e.classes24'].titles = {'Other Feature': '不屈'};
  const api = await activate(env);
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('不屈')), []);
  assert.equal(api.report.scopes.find(s => s.scope.type === 'feat' && s.scope.rules === '2014').conflicts[0].reason, 'ambiguous-name');
  delete env.titleIndex['dnd5e.classes24'].titles['Other Feature'];
  await api.refresh();
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('不屈')))[0].document, env.docs[0]);
  delete env.titleIndex[BASE_ITEM_PACKS[0]];
  await api.refresh();
  assert.equal(api.report.status, 'source-error');
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('不屈')), []);
  api.stop();
});

test('missing core, missing GPS entry, read-only namespace and missing grouping keep native entry intact', async () => {
  const env = client();
  assert.equal((await activate({...env, core: null})).report.status, 'unsupported-core');
  assert.equal((await activate({...env, cpr: {}})).report.status, 'unsupported-gps-entry');
  const bad = await activate({...env, loadCorpus: async () => {throw Object.assign(Error('missing'), {source: 'truesight'});}});
  assert.equal(bad.report.source, 'truesight');
  assert.equal(env.compendiumUtils.getAllAutomations, env.native);
  Object.freeze(env.compendiumUtils);
  assert.equal((await activate(env)).report.status, 'unsupported-gps-entry');
  assert.equal(env.compendiumUtils.getAllAutomations, env.native);
});

test('disabled source, unknown edition/type, monsters and inactive adapter do not receive GPS fallbacks', async () => {
  const env = client();
  let active = true;
  const api = await activate({...env, isActive: () => active});
  for (const [item, options] of [[feat('不屈'), {rules: 'future'}],
    [{name: '不屈', type: 'race'}, {}], [{name: '不屈', type: 'feat', actor: {type: 'npc'}}, {}]]) {
    assert.deepEqual(await env.compendiumUtils.getAllAutomations(item, options), []);
  }
  env.settings.additionalCompendiums = {};
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('不屈')), []);
  env.settings.additionalCompendiums = {'gambits-premades': 10};
  active = false;
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('不屈')), []);
  active = true;
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('不屈'))).length, 1);
  api.stop();
});

test('GPS uses current integration mode and respects hidden packs, not CPR thirdParty setting', async () => {
  const env = client();
  const homebrew = {...env.docs[0], name: 'Homebrew', uuid: 'gps.homebrew'};
  env.docs.push(homebrew);
  env.packs.set('gambits-premades.gps-homebrew-features', {visible: true, documentName: 'Item', getIndex: async () => [homebrew]});
  env.titleIndex['dnd5e.classfeatures'].titles.Homebrew = '自制能力';
  env.packs.set('gambits-premades.gps-race-features', {visible: false, documentName: 'Item', getIndex: () => {throw Error('hidden');}});
  const api = await activate(env);
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('自制能力')), []);
  env.settings.gambitPremades = 3;
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('自制能力')))[0].document, homebrew);
  env.settings.gambitPremades = 1;
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('自制能力')), []);
  api.stop();
});

test('native GPS initialization can complete after adapter startup; misses are not cached', async () => {
  const env = client(), native = env.native;
  let ready = false;
  env.compendiumUtils.getAllAutomations = async (...args) => ready ? native(...args) : [];
  const api = await activate(env);
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('不屈')), []);
  ready = true;
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('不屈')))[0].document, env.docs[0]);
  api.stop();
});

test('stopping a wrapper preserves a later extension and blocks further fallback through its chain', async () => {
  const utils = {getAllAutomations: async item => item.name === 'Indomitable' ? [{source: 'gambits-premades'}] : []};
  const stop = installLookupFallback({compendiumUtils: utils, resolve: () => 'Indomitable'});
  assert.equal(installLookupFallback({compendiumUtils: utils, resolve: () => 'Indomitable'}), null);
  const wrapped = utils.getAllAutomations, later = (...args) => wrapped(...args);
  utils.getAllAutomations = later;
  stop();
  assert.equal(utils.getAllAutomations, later);
  assert.deepEqual(await later(feat('不屈')), []);
});

test('stop during asynchronous loading cannot install a late wrapper', async () => {
  const env = client(), api = await activate(env);
  api.stop();
  // A refresh after stop is explicit; stop again before its snapshot resolves.
  const refreshing = api.refresh();
  api.stop();
  await refreshing;
  assert.equal(api.report.status, 'stopped');
  assert.equal(env.compendiumUtils.getAllAutomations, env.native);
});

test('GPS entry point starts on a non-GM client without the CPR alias adapter and respects Foundry routes', async t => {
  const env = client(), events = new Map(), self = {};
  const modules = new Map([['truesight', {active: true, api: {apiVersion:1,names:core}}], ['gps-zh-aliases', self],
    ...['chris-premades', 'gambits-premades'].map(id => [id, {active: true}])]);
  self.active = true;
  modules.set('dnd-simplified-chinese-babele-patch', {active:true});
  connectCatalog({whenReady: async () => {}, read: ids => ({apiVersion:1,status:'unreviewed',entries:new Map(ids.map(uuid => [uuid,{key:null}]))})});
  const dependencies = {Hooks: {once: (event, cb) => events.set(event, cb), on: (event, cb) => events.set(event, cb), off: event => events.delete(event)},
    game: {modules, packs: env.packs, user: {isGM: false}, i18n: {localize: key => key}},
    CONFIG: {}, chrisPremades: env.cpr, location: {href: 'http://localhost/table/game'},
    foundry: {utils: {getRoute: path => '/table/' + path}},
    fetch: async path => {
      assert.equal(path, '/table/modules/dnd-simplified-chinese-babele-patch/translation/cn/titles.json');
      return {ok: true, json: async () => env.titleIndex};
    }};
  for (const [key, value] of Object.entries(dependencies)) {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {value, configurable: true});
    t.after(() => before ? Object.defineProperty(globalThis, key, before) : delete globalThis[key]);
  }
  await import('../modules/gps-zh-aliases/scripts/main.mjs');
  events.get('init')();
  assert.equal(self.api.report.status, 'waiting-for-cpr');
  assert.equal(env.compendiumUtils.getAllAutomations, env.native);
  await events.get('cprReady')();
  t.after(() => self.api.stop());
  assert.equal(self.api.report.status, 'ready');
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('不屈')))[0].document, env.docs[0]);
  modules.get('gambits-premades').active = false;
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('不屈')), []);
});

test('both adapters share evidence but keep provider output and disabling independent', async () => {
  const env = client(), renamedItems = {}, spell = {name: 'Misty Step', type: 'spell', uuid: 'fixture.cpr.misty'};
  env.packs.set('fixture.cpr', {visible: true, documentName: 'Item', getIndex: async () => [spell]});
  Object.assign(env.cpr.utils.constants, {packs: {spells: 'fixture.cpr'}, modernPacks: {spells: 'fixture.cpr'}});
  Object.assign(env.titleIndex, {'chris-premades.CPRActions': {titles: {}}, 'chris-premades.CPRActions2024': {titles: {}}});
  env.titleIndex['dnd5e.spells'].titles = {'Misty Step': '迷踪步'};
  env.compendiumUtils.getAllAutomations = async (item, options = {}) =>
    (renamedItems[item.name] ?? item.name) === 'Misty Step'
      ? [{document: spell, source: 'chris-premades', priority: 0}]
      : env.native(item, options);
  const original = env.compendiumUtils.getAllAutomations;
  const [cprReport, gps] = await Promise.all([activateCPR({...env, renamedItems}), activate(env)]);
  assert.equal(cprReport.status, 'ready');
  assert.equal(renamedItems.迷踪步, 'Misty Step');
  assert.equal(Object.hasOwn(renamedItems, '不屈'), false);
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('不屈')))[0].document, env.docs[0]);
  assert.equal((await env.compendiumUtils.getAllAutomations({name: '迷踪步', type: 'spell'}))[0].document, spell);
  gps.stop();
  assert.equal(env.compendiumUtils.getAllAutomations, original);
  assert.equal(renamedItems.迷踪步, 'Misty Step');
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('不屈')), []);
});
