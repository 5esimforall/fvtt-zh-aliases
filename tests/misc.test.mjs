import {FoundryCollection} from './helpers/foundry-collection.mjs';
import {connectCatalog} from '../../truesight/module/scripts/catalog/api.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {core} from '../../truesight/module/scripts/names/api.mjs';
import {BASE_ITEM_PACKS} from '../../truesight/module/scripts/names/translations.mjs';
import {activate} from '../modules/misc-zh-aliases/scripts/runtime.mjs';
import {installLookupFallback} from '../modules/misc-zh-aliases/scripts/lookup.mjs';
import {activate as activateCPR} from '../modules/cpr-zh-aliases/scripts/runtime.mjs';

function client() {
  const docs = ['2014', '2024'].map((rules, i) => ({_id: 'deflectMissiles' + i, name: 'Deflect Missiles', type: 'feat',
    uuid: 'Compendium.midi-item-showcase-community.misc-class-features' + (i ? '-2024' : '') + '.Item.deflectMissiles' + i,
    system: {source: {rules}}}));
  const packs = new FoundryCollection(docs.map((doc, i) => ['midi-item-showcase-community.misc-class-features' + (i ? '-2024' : ''),
    {visible: true, documentName: 'Item', getIndex: async () => new Map([[doc._id, doc]])}]));
  const titleIndex = Object.fromEntries(BASE_ITEM_PACKS.map(id => [id, {titles: {}}]));
  titleIndex['dnd5e.classfeatures'].titles = {'Deflect Missiles': '拨挡飞弹'};
  const settings = {miscPremades: 1, additionalCompendiums: {'chris-premades': 0, 'midi-item-showcase-community': 10}};
  const calls = [];
  const itemTypes = ['weapon', 'equipment', 'consumable', 'tool', 'backpack', 'loot'];
  const native = async (item, options) => {
    calls.push({name: item.name, rules: options.rules, actor: item.actor});
    if (!Object.hasOwn(settings.additionalCompendiums, 'midi-item-showcase-community')) return [];
    const doc = docs.find(doc => doc.name === item.name && doc.system.source.rules === core.rulesEdition(options.rules ?? 'legacy'));
    return doc ? [{document: doc, source: 'midi-item-showcase-community', priority: 10, version: 'fixture'}] : [];
  };
  const compendiumUtils = {getAllAutomations: native, getMISCAutomation: async () => {}};
  const cpr = {utils: {compendiumUtils, constants: {itemTypes}, genericUtils: {getCPRSetting: key => settings[key]}}};
  const localItems = [];
  const loadCorpus = async () => ({...await core.readCorpus({packs, localItems, loadTitleIndex: async () => titleIndex,
    loadGrouping: () => items => new Map(items.map(i => [i.uuid, {key: null}]))}),
    miscCatalog: {folders: new Map([['midi-item-showcase-community.misc-homebrew', new Map([['Items', 'items']])]])}});
  return {core, cpr, loadCorpus, packs, titleIndex, settings, calls, docs, compendiumUtils, native, localItems};
}
const feat = name => Object.freeze({name, type: 'feat'});

test('MISC alone recognizes Chinese and bilingual Deflect Missiles with native UUIDs, rules and display names unchanged', async () => {
  for (let clientNumber = 0; clientNumber < 2; clientNumber++) {
    const env = client(), api = await activate(env);
    assert.equal(api.report.status, 'ready');
    assert.equal(api.report.scopes.length, 6);
    for (const [i, rules] of ['legacy', 'modern'].entries()) {
      const lookup = name => env.compendiumUtils.getAllAutomations(feat(name), {rules});
      const [control] = await lookup('Deflect Missiles');
      assert.equal(control.document.uuid, env.docs[i].uuid);
      for (const name of ['拨挡飞弹', '拨挡飞弹 Deflect Missiles']) {
        const item = feat(name);
        const [result] = await env.compendiumUtils.getAllAutomations(item, {rules});
        assert.equal(result.document, control.document);
        assert.equal(result.source, 'midi-item-showcase-community');
        assert.equal(result.version, 'fixture');
        assert.equal(item.name, name);
      }
    }
    assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('未知拨挡飞弹')), []);
    api.stop();
    assert.equal(env.compendiumUtils.getAllAutomations, env.native);
    assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹'), {}), []);
  }
});

test('MISC preserves native hits and existing aliases without consulting the fallback', async () => {
  const existing = [{source: 'midi-item-showcase-community', document: {uuid: 'native-alias'}}];
  const utils = {getAllAutomations: async () => existing};
  const stop = installLookupFallback({compendiumUtils: utils, resolve: () => {throw Error('must not resolve');}});
  assert.equal(await utils.getAllAutomations(feat('既有名称')), existing);
  stop();
});

test('retry contributes only MISC, retains existing providers and priority, and does not mutate options', async () => {
  const originalDoc = {uuid: 'cpr.original'}, otherDoc = {uuid: 'misc.retry'}, miscDoc = {uuid: 'misc'};
  const options = Object.freeze({rules: 'modern'});
  const utils = {getAllAutomations: async (item, opts) => {
    opts.type = 'character';
    return item.name === '拨挡飞弹' ? [{source: 'chris-premades', priority: 20, document: originalDoc}]
      : [{source: 'midi-item-showcase-community', priority: 10, document: miscDoc}, {source: 'misc', priority: 0, document: otherDoc}];
  }};
  const stop = installLookupFallback({compendiumUtils: utils, resolve: () => 'Deflect Missiles'});
  const results = await utils.getAllAutomations(feat('拨挡飞弹'), options);
  assert.deepEqual(results.map(x => x.source), ['midi-item-showcase-community', 'chris-premades']);
  assert.equal(results[0].document, miscDoc);
  assert.equal(results[1].document, originalDoc);
  assert.deepEqual(options, {rules: 'modern'});
  stop();
});

test('a fallback error keeps original behavior, while an original lookup error is not swallowed', async () => {
  const errors = [], original = [];
  const utils = {getAllAutomations: async item => {if (item.name === 'Deflect Missiles') throw Error('retry failed'); return original;}};
  const stop = installLookupFallback({compendiumUtils: utils, resolve: () => 'Deflect Missiles', onError: e => errors.push(e.message)});
  assert.equal(await utils.getAllAutomations(feat('拨挡飞弹')), original);
  assert.deepEqual(errors, ['retry failed']);
  await assert.rejects(utils.getAllAutomations(feat('Deflect Missiles')), /retry failed/);
  stop();
});

test('conflicting translations fail closed and a failed refresh discards the previous plan', async () => {
  const env = client();
  env.titleIndex['dnd5e.classes24'].titles = {'Other Feature': '拨挡飞弹'};
  const api = await activate(env);
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')), []);
  assert.equal(api.report.scopes.find(s => s.scope.type === 'feat' && s.scope.rules === '2014').conflicts[0].reason, 'ambiguous-name');
  delete env.titleIndex['dnd5e.classes24'].titles['Other Feature'];
  await api.refresh();
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')))[0].document, env.docs[0]);
  delete env.titleIndex[BASE_ITEM_PACKS[0]];
  await api.refresh();
  assert.equal(api.report.status, 'source-error');
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')), []);
  api.stop();
});

test('missing core, missing MISC entry, read-only namespace and missing grouping keep native entry intact', async () => {
  const env = client();
  assert.equal((await activate({...env, core: null})).report.status, 'unsupported-core');
  assert.equal((await activate({...env, cpr: {}})).report.status, 'unsupported-misc-entry');
  const bad = await activate({...env, loadCorpus: async () => {throw Object.assign(Error('missing'), {source: 'truesight'});}});
  assert.equal(bad.report.source, 'truesight');
  assert.equal(env.compendiumUtils.getAllAutomations, env.native);
  Object.freeze(env.compendiumUtils);
  assert.equal((await activate(env)).report.status, 'unsupported-misc-entry');
  assert.equal(env.compendiumUtils.getAllAutomations, env.native);
});

test('disabled source, unknown edition/type, monsters and inactive adapter do not receive MISC fallbacks', async () => {
  const env = client();
  let active = true;
  const api = await activate({...env, isActive: () => active});
  for (const [item, options] of [[feat('拨挡飞弹'), {rules: 'future'}],
    [{name: '拨挡飞弹', type: 'race'}, {}], [{name: '拨挡飞弹', type: 'feat', actor: {type: 'npc'}}, {}]]) {
    assert.deepEqual(await env.compendiumUtils.getAllAutomations(item, options), []);
  }
  env.settings.additionalCompendiums = {};
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')), []);
  env.settings.additionalCompendiums = {'midi-item-showcase-community': 10};
  active = false;
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')), []);
  active = true;
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹'))).length, 1);
  api.stop();
});

test('MISC uses current integration mode and respects hidden packs, not CPR thirdParty setting', async () => {
  const env = client();
  const homebrew = {...env.docs[0], name: 'Homebrew', uuid: 'misc.homebrew', folderId: 'items'};
  env.docs.push(homebrew);
  env.packs.set('midi-item-showcase-community.misc-homebrew', {visible: true, documentName: 'Item', getIndex: async () => [homebrew]});
  env.titleIndex['dnd5e.classfeatures'].titles.Homebrew = '自制能力';
  env.packs.set('midi-item-showcase-community.misc-race-features', {visible: false, documentName: 'Item', getIndex: () => {throw Error('hidden');}});
  const api = await activate(env);
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('自制能力')), []);
  env.settings.miscPremades = 2;
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('自制能力')))[0].document, homebrew);
  env.settings.miscPremades = 1;
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('自制能力')), []);
  api.stop();
});

test('native MISC initialization can complete after adapter startup; misses are not cached', async () => {
  const env = client(), native = env.native;
  let ready = false;
  env.compendiumUtils.getAllAutomations = async (...args) => ready ? native(...args) : [];
  const api = await activate(env);
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')), []);
  ready = true;
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')))[0].document, env.docs[0]);
  api.stop();
});

test('stopping a wrapper preserves a later extension and blocks further fallback through its chain', async () => {
  const utils = {getAllAutomations: async item => item.name === 'Deflect Missiles' ? [{source: 'midi-item-showcase-community'}] : []};
  const stop = installLookupFallback({compendiumUtils: utils, resolve: () => 'Deflect Missiles'});
  assert.equal(installLookupFallback({compendiumUtils: utils, resolve: () => 'Deflect Missiles'}), null);
  const wrapped = utils.getAllAutomations, later = (...args) => wrapped(...args);
  utils.getAllAutomations = later;
  stop();
  assert.equal(utils.getAllAutomations, later);
  assert.deepEqual(await later(feat('拨挡飞弹')), []);
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

test('MISC entry point starts on a non-GM client without the CPR alias adapter and respects Foundry routes', async t => {
  const env = client(), events = new Map(), self = {};
  const modules = new Map([['truesight', {active: true, api: {apiVersion:1,names:core}}], ['misc-zh-aliases', self],
    ...['chris-premades', 'midi-item-showcase-community'].map(id => [id, {active: true}])]);
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
  await import('../modules/misc-zh-aliases/scripts/main.mjs');
  events.get('init')();
  assert.equal(self.api.report.status, 'waiting-for-cpr');
  assert.equal(env.compendiumUtils.getAllAutomations, env.native);
  await events.get('cprReady')();
  t.after(() => self.api.stop());
  assert.equal(self.api.report.status, 'ready');
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')))[0].document, env.docs[0]);
  modules.get('midi-item-showcase-community').active = false;
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')), []);
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
  const [cprReport, misc] = await Promise.all([activateCPR({...env, renamedItems}), activate(env)]);
  assert.equal(cprReport.status, 'ready');
  assert.equal(renamedItems.迷踪步, 'Misty Step');
  assert.equal(Object.hasOwn(renamedItems, '拨挡飞弹'), false);
  assert.equal((await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')))[0].document, env.docs[0]);
  assert.equal((await env.compendiumUtils.getAllAutomations({name: '迷踪步', type: 'spell'}))[0].document, spell);
  misc.stop();
  assert.equal(env.compendiumUtils.getAllAutomations, original);
  assert.equal(renamedItems.迷踪步, 'Misty Step');
  assert.deepEqual(await env.compendiumUtils.getAllAutomations(feat('拨挡飞弹')), []);
});

test('MISC and GPS wrappers compose in either order, survive independent stopping and reload', async () => {
  const {activate: activateGPS} = await import('../modules/gps-zh-aliases/scripts/runtime.mjs');
  for (const miscFirst of [true, false]) {
    const env = client();
    env.settings.gambitPremades = 1;
    env.settings.additionalCompendiums['gambits-premades'] = 5;
    env.packs.set('gambits-premades.gps-class-features', env.packs.get('midi-item-showcase-community.misc-class-features'));
    env.compendiumUtils.getGPSAutomation = async () => {};
    const miscDoc = env.docs[0], gpsDoc = {...miscDoc, uuid: 'fixture.gps'};
    const native = async item => item.name === 'Deflect Missiles' ? [
      {source: 'midi-item-showcase-community', document: miscDoc, priority: 10},
      {source: 'gambits-premades', document: gpsDoc, priority: 5}
    ] : [{source: 'chris-premades', document: {uuid: 'fixture.cpr'}, priority: 20}];
    env.compendiumUtils.getAllAutomations = native;
    let misc, gps;
    if (miscFirst) { misc = await activate(env); gps = await activateGPS(env); }
    else { gps = await activateGPS(env); misc = await activate(env); }
    const lookup = () => env.compendiumUtils.getAllAutomations(feat('拨挡飞弹'));
    const result = await lookup();
    assert.deepEqual(result.map(r => r.source), ['gambits-premades', 'midi-item-showcase-community', 'chris-premades']);
    assert.equal(result[0].document, gpsDoc);
    assert.equal(result[1].document, miscDoc);
    misc.stop();
    assert.deepEqual((await lookup()).map(r => r.source), ['gambits-premades', 'chris-premades']);
    gps.stop();
    assert.deepEqual((await lookup()).map(r => r.source), ['chris-premades']);
    // A fresh activation has no shared mutable plan from either old wrapper.
    misc = await activate(env);
    assert.deepEqual((await lookup()).map(r => r.source), ['midi-item-showcase-community', 'chris-premades']);
    misc.stop();
  }
});

test('MISC catalog follows its modes, factory exclusions, pack editions and UA folder boundary', async () => {
  const {catalogNames, catalogContext} = await import('../modules/misc-zh-aliases/scripts/catalog.mjs');
  const prefix = 'midi-item-showcase-community.';
  const row = (name, type = 'feat', extra = {}) => ({name, type, ...extra});
  const indexes = new Map([
    [prefix + 'misc-feats', [row('Standard'), row('Factory')]],
    [prefix + 'misc-actions-2024', [row('Modern', 'feat', {system: {source: {rules: '2014'}}})]],
    [prefix + 'misc-homebrew', [row('Homebrew', 'feat', {folderId: 'items'}), row('Monster', 'feat', {folderId: 'monsters'})]],
    [prefix + 'misc-unearthed-arcana', [
      row('UA Modern Spell', 'spell', {folderId: 'spells', system: {source: {rules: '2024'}}}),
      row('UA Legacy Spell', 'spell', {folderId: 'spells'}),
      row('Outside', 'spell', {folderId: 'outside'}), row('UA Feature', 'feat', {folderId: 'classes'})
    ]]
  ]);
  const packs = new FoundryCollection([...indexes.keys()].map(id => [id, {visible: true, folders: [
    {id: 'items', name: 'Items'}, {id: 'spells', name: 'Spells'}
  ]}]));
  const automations = {legacy: {Factory: {factory: true}}};
  const context = catalogContext(packs, automations);
  const names = (mode, rules = '2014', type = 'feat') => [...catalogNames(indexes, mode, {rules, type, types: [type]}, context)];
  assert.deepEqual(names(0), []);
  assert.deepEqual(names(1), ['Standard']);
  assert.deepEqual(names(2), ['Standard', 'Homebrew']);
  assert.deepEqual(names(3), ['Standard']);
  assert.deepEqual(names(4), ['Standard', 'Homebrew']);
  assert.deepEqual(names(4, '2024'), ['Modern']);
  assert.deepEqual(names(2, '2024', 'spell'), []);
  assert.deepEqual(names(3, '2024', 'spell'), ['UA Modern Spell']);
  assert.deepEqual(names(4, '2014', 'spell'), ['UA Legacy Spell']);
  packs.get(prefix + 'misc-homebrew').visible = false;
  assert.equal(catalogContext(packs, automations).folders.has(prefix + 'misc-homebrew'), false);
});
