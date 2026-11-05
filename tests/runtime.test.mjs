import test from 'node:test';
import assert from 'node:assert/strict';
import { activate } from '../module/scripts/runtime.mjs';
import { BASE_ITEM_PACKS } from '../module/scripts/translations.mjs';

function client() {
  const calls = [], table = {}, docs = [
    {name: 'Misty Step'},
    {name: '异名', flags: {'chris-premades': {info: {identifier: 'cunningAction', aliases: ['既有名称']}}}}
  ];
  const pack = {visible: true, documentName: 'Item', async getIndex(query) {
    calls.push(query); return docs;
  }};
  const packs = new Map([['world.local-spells', pack], ['private.features', {
    visible: false, documentName: 'Item', getIndex() {throw Error('private pack accessed');}
  }]]);
  const cpr = {utils: {constants: {packs: {spells: 'world.local-spells', feats: 'private.features'},
    modernPacks: {classFeatures: 'world.local-spells'}}, genericUtils: {getCPRSetting: () => false}},
    macros: {cunningAction: {name: 'Cunning Action', aliases: ['Legacy Action']}}, legacyMacros: {}};
  const requested = [];
  async function loadTitleIndex() {
    requested.push('titles');
    const index = Object.fromEntries(BASE_ITEM_PACKS.map(id => [id, {titles: {}}]));
    index['dnd5e.spells'].titles = {'Misty Step': '迷踪步', 'Cunning Action': '灵巧动作',
      'Legacy Action': '替代动作', 'Another Name': '既有名称'};
    return index;
  }
  return {renamedItems: table, packs, cpr, loadTitleIndex, calls, requested, docs};
}

test('builds on each client, deduplicates pack reads and respects visibility, names and aliases', async () => {
  for (let i = 0; i < 2; i++) {
    const env = client(), before = structuredClone(env.docs);
    const report = await activate(env);
    assert.equal(report.status, 'ready'); assert.equal(report.registered, 6);
    assert.equal(env.renamedItems.迷踪步, 'Misty Step');
    assert.equal(env.renamedItems.灵巧动作, 'Cunning Action');
    assert.equal(env.renamedItems.替代动作, 'Legacy Action');
    assert.ok(!Object.hasOwn(env.renamedItems, '既有名称'));
    assert.deepEqual(env.docs, before);
    assert.equal(env.calls.length, 1);
    assert.deepEqual(env.requested, ['titles']);
  }
  assert.deepEqual(client().renamedItems, {}); // fresh client with module disabled
});

test('missing or incompatible CPR leaves the table untouched', async () => {
  const env = client();
  for (const renamedItems of [undefined, [], new Map(), Object.freeze({})]) {
    assert.equal((await activate({...env, renamedItems})).status, 'unsupported-cpr');
  }
  assert.equal((await activate({...env, cpr: undefined})).status, 'unsupported-cpr');
  assert.equal((await activate({...env, packs: new Map()})).status, 'no-visible-candidates');
  assert.deepEqual(env.requested, []); assert.deepEqual(env.renamedItems, {});
});

test('a missing dictionary or index never installs partial aliases', async () => {
  const env = client();
  const badId = BASE_ITEM_PACKS.at(-1);
  const report = await activate({...env, loadTitleIndex: async () => {
    const result = await env.loadTitleIndex();
    delete result[badId];
    return result;
  }});
  assert.equal(report.status, 'source-error'); assert.equal(report.source, badId);
  assert.deepEqual(env.renamedItems, {});
  env.packs.get('world.local-spells').getIndex = () => {throw Error('not accessible');};
  assert.equal((await activate(env)).status, 'source-error');
  assert.deepEqual(env.renamedItems, {});
});

test('additional visible Item sources can reveal conflicts; Actor, hidden pack and folder titles do not', async () => {
  const env = client();
  const titleIndex = await env.loadTitleIndex();
  for (const [id, documentName, visible] of [['extra.spells', 'Item', true],
    ['extra.actors', 'Actor', true], ['extra.private', 'Item', false]]) {
    env.packs.set(id, {documentName, visible});
    titleIndex[id] = {titles: {'Other Action': '灵巧动作'}, folders: {'Spells': '迷踪步'}};
  }
  titleIndex['extra.spells'].titles = {'Other Step': '迷踪步'};
  const r = await activate({...env, loadTitleIndex: () => titleIndex});
  assert.equal(env.renamedItems.迷踪步, undefined);
  assert.equal(env.renamedItems['迷踪步 Misty Step'], 'Misty Step');
  assert.equal(env.renamedItems.灵巧动作, 'Cunning Action');
  const [conflict] = r.conflicts;
  assert.deepEqual(conflict.candidates.find(c => c.englishName === 'Other Step').sources, ['extra.spells#Other Step']);
});

test('Foundry entry point waits for cprReady on a non-GM client and uses the configured route', async t => {
  const env = client(), events = new Map(), self = {};
  const deps = {
    Hooks: {once: (event, callback) => events.set(event, callback)},
    game: {user: {isGM: false}, modules: new Map([['cpr-zh-aliases', self]]), packs: env.packs},
    chrisPremades: env.cpr, CONFIG: {chrisPremades: {renamedItems: env.renamedItems}},
    foundry: {utils: {getRoute: path => '/table/' + path}},
    fetch: async path => {
      assert.equal(path, '/table/modules/dnd-simplified-chinese-babele-patch/translation/cn/titles.json');
      return {ok: true, json: env.loadTitleIndex};
    }
  };
  for (const [key, value] of Object.entries(deps)) {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
    t.after(() => before ? Object.defineProperty(globalThis, key, before) : delete globalThis[key]);
  }
  await import('../module/scripts/main.mjs');
  events.get('init')();
  assert.equal(self.api.report.status, 'waiting-for-cpr'); assert.deepEqual(env.requested, []);
  await events.get('cprReady')();
  assert.equal(self.api.report.status, 'ready'); assert.equal(env.renamedItems.迷踪步, 'Misty Step');
});
