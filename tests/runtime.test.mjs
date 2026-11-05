import {connectCatalog} from '../../truesight/module/scripts/catalog/api.mjs';
import {core} from '../../truesight/module/scripts/names/api.mjs';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { activate } from '../modules/cpr-zh-aliases/scripts/runtime.mjs';
import { BASE_ITEM_PACKS } from '../../truesight/module/scripts/names/translations.mjs';

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
    const index = Object.fromEntries([...BASE_ITEM_PACKS,'chris-premades.CPRActions','chris-premades.CPRActions2024'].map(id => [id, {titles: {}}]));
    index['dnd5e.spells'].titles = {'Misty Step': '迷踪步', 'Cunning Action': '灵巧动作',
      'Legacy Action': '替代动作', 'Another Name': '既有名称'};
    return index;
  }
  const loadGrouping = () => items => new Map(items.map(i => [i.uuid, {key:null}]));
  return {core, loadGrouping, renamedItems: table, packs, cpr, loadTitleIndex, calls, requested, docs};
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
    env.packs.set(id, {documentName, visible, getIndex: async () => []});
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
  connectCatalog({whenReady: async () => {}, read: ids => ({apiVersion:1,status:'unreviewed',entries:new Map(ids.map(uuid => [uuid,{key:null}]))})});
  const deps = {
    Hooks: {once: (event, callback) => events.set(event, callback), on: (event, cb) => events.set(event, cb), off: event => events.delete(event)},
    game: {user: {isGM: false}, modules: new Map([['truesight', {active:true,api:{apiVersion:1,names:core}}], ['cpr-zh-aliases', self], ['dnd-simplified-chinese-babele-patch', {active:true}]]), packs: env.packs},
    chrisPremades: env.cpr, CONFIG: {chrisPremades: {renamedItems: env.renamedItems}},
    location: {href:'http://localhost/table/game'},
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
  await import('../modules/cpr-zh-aliases/scripts/main.mjs');
  events.get('init')();
  assert.equal(self.api.report.status, 'waiting-for-cpr'); assert.deepEqual(env.requested, []);
  await events.get('cprReady')();
  assert.equal(self.api.report.status, 'ready'); assert.equal(env.renamedItems.迷踪步, 'Misty Step');
});

test('a conflicting CPR flag on a non-CPR member blocks all its siblings without affecting unrelated lookups', async () => {
  const env = client();
  const rows = [{_id:'a',name:'迷踪步 misty step',type:'spell'},
    {_id:'b',name:'另一个译名',type:'spell',flags:{'chris-premades':{info:{identifier:'cunningAction',rules:'modern'}}}}];
  env.packs.set('extra.spells',{visible:true,documentName:'Item',getIndex:async()=>rows});
  const report = await activate({...env,loadGrouping:()=>items=>new Map(items.map(i=>[i.uuid,{key:'fixture-group'}]))});
  assert.equal(report.grouping,'truesight');
  assert.equal(report.status,'cluster-conflict');
  assert.deepEqual(report.clusterErrors[0].candidates.map(c=>c.englishName),['Cunning Action','Misty Step']);
  assert.equal(env.renamedItems['另一个译名'],undefined);
  assert.equal(env.renamedItems['迷踪步 misty step'],undefined);
  assert.equal(env.renamedItems['灵巧动作'],'Cunning Action');
});

test('missing or incompatible catalog never masquerades as an empty grouping result', async () => {
  const {loadGrouping} = await import('../../truesight/module/scripts/names/groups.mjs');
  const env = client();
  connectCatalog(null);
  let r = await activate({...env,loadGrouping});
  assert.equal(r.status,'source-error'); assert.equal(r.source,'truesight');
  connectCatalog({whenReady:async()=>{},read:()=>({apiVersion:99,status:'ready',entries:new Map()})});
  r = await activate({...env,loadGrouping});
  assert.equal(r.status,'source-error'); assert.equal(r.source,'truesight');
  assert.deepEqual(env.renamedItems,{});
});

test('CPR refresh withdraws only owned aliases and rejects late asynchronous publication', async () => {
  const {createController} = await import('../modules/cpr-zh-aliases/scripts/runtime.mjs');
  const env = client(); env.renamedItems.existing = 'Existing';
  const api = createController(env); await api.refresh();
  assert.equal(env.renamedItems.迷踪步,'Misty Step');
  env.renamedItems.灵巧动作='External replacement';
  api.stop();
  assert.equal(env.renamedItems.迷踪步,undefined);
  assert.equal(env.renamedItems.灵巧动作,'External replacement');
  assert.equal(env.renamedItems.existing,'Existing');
  let release;
  const slow = createController({...client(), loadTitleIndex:()=>new Promise(resolve=>{release=resolve;})});
  const pending = slow.refresh();
  while(!release) await new Promise(resolve=>setTimeout(resolve,0));
  slow.stop(); release(await env.loadTitleIndex());
  await pending; assert.equal(slow.report.status,'stopped');
});
