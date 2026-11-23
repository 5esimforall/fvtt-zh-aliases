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
  connectCatalog({getStatus:()=>({status:'unreviewed'}),whenReady: async () => {}, read: ids => ({apiVersion:1,status:'unreviewed',entries:new Map(ids.map(uuid => [uuid,{key:null}]))})});
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
  connectCatalog({getStatus:()=>({status:'unreviewed'}),whenReady:async()=>{},read:()=>({apiVersion:99,status:'ready',entries:new Map()})});
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

test('CPR coalesces refresh bursts and keeps owned aliases live during non-retracting rebuilds', async () => {
  const {createController} = await import('../modules/cpr-zh-aliases/scripts/runtime.mjs');
  const env=client();let calls=0,plans=0,release;
  const loadCorpus=async()=>{calls++;if(calls===2)await new Promise(resolve=>{release=resolve;});return core.readCorpus(env);};
  const api=createController({...env,loadCorpus,core:{...core,planAliases:args=>{plans++;return core.planAliases(args);}}});
  await api.refresh();assert.equal(env.renamedItems.迷踪步,'Misty Step');
  env.renamedItems.外部保留='Custom Target';
  const burst=Array.from({length:40},()=>api.refresh());
  assert.equal(env.renamedItems.迷踪步,'Misty Step');
  assert.equal(api.report.status,'ready');
  while(!release)await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,2);
  for(let i=0;i<40;i++)burst.push(api.refresh());release();await Promise.all(burst);
  assert.equal(calls,3);assert.equal(plans,2);
  assert.equal(env.renamedItems.迷踪步,'Misty Step');
  assert.equal(env.renamedItems.外部保留,'Custom Target');
  // Obsolete owned alias is pruned on atomic swap while external entries survive
  const titles = await env.loadTitleIndex();
  titles['dnd5e.spells'].titles['Legacy Action'] = '替代动作';
  delete titles['dnd5e.spells'].titles['Legacy Action'];
  env.loadTitleIndex = async () => titles;
  await api.refresh();
  assert.equal(env.renamedItems.替代动作, undefined);
  assert.equal(env.renamedItems.迷踪步, 'Misty Step');
  assert.equal(env.renamedItems.外部保留, 'Custom Target');
  // Retracting refresh clears owned entries synchronously
  let retractRelease, hold = false;
  const retractEnv = client();
  const slowRetract = createController({...retractEnv, loadTitleIndex: () => hold
    ? new Promise(r => { retractRelease = r; }) : retractEnv.loadTitleIndex()});
  await slowRetract.refresh();
  assert.equal(retractEnv.renamedItems.迷踪步, 'Misty Step');
  hold = true;
  const pending = slowRetract.refresh({retract: true});
  assert.equal(slowRetract.report.status, 'loading');
  assert.equal(retractEnv.renamedItems.迷踪步, undefined);
  while(!retractRelease) await new Promise(r => setTimeout(r, 0));
  retractRelease(await retractEnv.loadTitleIndex()); await pending;
  assert.equal(slowRetract.report.status, 'ready');
  assert.equal(retractEnv.renamedItems.迷踪步, 'Misty Step');
  // Failed refresh fails closed
  const brokenEnv = client();
  brokenEnv.renamedItems.外部保留 = 'Custom Target';
  const broken = createController(brokenEnv);
  await broken.refresh(); assert.equal(brokenEnv.renamedItems.灵巧动作, 'Cunning Action');
  const prevLoad = brokenEnv.loadTitleIndex;
  brokenEnv.loadTitleIndex = async () => { const t = await prevLoad(); delete t['dnd5e.spells']; return t; };
  await broken.refresh();
  assert.equal(broken.report.status, 'source-error');
  assert.equal(brokenEnv.renamedItems.灵巧动作, undefined);
  assert.equal(brokenEnv.renamedItems.外部保留, 'Custom Target');
  api.stop(); slowRetract.stop(); broken.stop();
});

test('CPR controller resolves scoped class features and titlebar lookups despite monster, NPC, and edition collisions', async () => {
  const {createController} = await import('../modules/cpr-zh-aliases/scripts/runtime.mjs');
  const renamedItems = {};
  const docs = {
    rage14: {uuid: 'cpr.14.rage', name: 'Rage', type: 'feat'},
    rage24: {uuid: 'cpr.24.rage', name: 'Rage', type: 'feat'},
    sneak24: {uuid: 'cpr.24.sneak', name: 'Sneak Attack', type: 'feat'},
    deflect24: {uuid: 'cpr.24.deflect', name: 'Deflect Attacks', type: 'feat'},
    deflectSummon14: {uuid: 'cpr.14.deflectSummon', name: 'Deflect Attack', type: 'feat'},
    actionSurge24: {uuid: 'cpr.24.actionSurge', name: 'Action Surge', type: 'feat'},
    lay14: {uuid: 'cpr.14.lay', name: 'Lay on Hands', type: 'feat'},
    lay24: {uuid: 'cpr.24.lay', name: 'Lay On Hands', type: 'feat'}
  };
  const packs = new Map([
    ['cpr.class14', {visible: true, documentName: 'Item', getIndex: async () => [docs.rage14, docs.lay14]}],
    ['cpr.class24', {visible: true, documentName: 'Item', getIndex: async () => [docs.rage24, docs.sneak24, docs.deflect24, docs.actionSurge24, docs.lay24]}],
    ['cpr.summon14', {visible: true, documentName: 'Item', getIndex: async () => [docs.deflectSummon14]}],
    ['dnd5e.classfeatures', {visible: true, documentName: 'Item', getIndex: async () => [
      {_id: 'r14', name: '狂暴', type: 'feat', flags: {babele: {originalName: 'Rage'}}, system: {identifier: 'rage', type: {value: 'class'}, source: {rules: '2014'}}},
      {_id: 'l14', name: '圣疗', type: 'feat', flags: {babele: {originalName: 'Lay on Hands'}}, system: {identifier: 'lay-on-hands', type: {value: 'class'}, source: {rules: '2014'}}}
    ]}],
    ['dnd5e.classes24', {visible: true, documentName: 'Item', getIndex: async () => [
      {_id: 'r24', name: '狂暴', type: 'feat', flags: {babele: {originalName: 'Rage'}}, system: {identifier: 'rage', type: {value: 'class'}, source: {rules: '2024'}}},
      {_id: 's24', name: '偷袭', type: 'feat', flags: {babele: {originalName: 'Sneak Attack'}}, system: {identifier: 'sneak-attack', type: {value: 'class'}, source: {rules: '2024'}}},
      {_id: 'd24', name: '拨挡攻击', type: 'feat', flags: {babele: {originalName: 'Deflect Attacks'}}, system: {identifier: 'deflect-attacks', type: {value: 'class'}, source: {rules: '2024'}}},
      {_id: 'a24', name: '动作如潮', type: 'feat', flags: {babele: {originalName: 'Action Surge'}}, system: {identifier: 'action-surge', type: {value: 'class'}, source: {rules: '2024'}}},
      {_id: 'l24', name: '圣疗', type: 'feat', flags: {babele: {originalName: 'Lay On Hands'}}, system: {identifier: 'lay-on-hands', type: {value: 'class'}, source: {rules: '2024'}}}
    ]}],
    ['dnd5e.monsterfeatures', {visible: true, documentName: 'Item', getIndex: async () => [
      {_id: 'b14', name: '狂暴', type: 'feat', flags: {babele: {originalName: 'Berserk'}}, system: {identifier: 'berserk', type: {value: 'monster'}, source: {rules: '2014'}}},
      {_id: 'da14', name: '拨挡攻击', type: 'feat', flags: {babele: {originalName: 'Deflect Attack'}}, system: {identifier: 'deflect-attack', type: {value: 'monster'}, source: {rules: '2014'}}}
    ]}],
    ['third.party', {visible: true, documentName: 'Item', getIndex: async () => [
      {_id: 'otherSurge', name: '动作如潮', type: 'feat', flags: {babele: {originalName: 'Other Surge'}}, system: {identifier: 'other-surge', type: {value: 'class'}, source: {rules: '2024'}}}
    ]}]
  ]);
  const titleIndex = Object.fromEntries([...BASE_ITEM_PACKS, 'chris-premades.CPRActions', 'chris-premades.CPRActions2024'].map(id => [id, {titles: {}}]));
  titleIndex['dnd5e.classfeatures'].titles = {Rage: '狂暴', 'Lay on Hands': '圣疗'};
  titleIndex['dnd5e.classes24'].titles = {Rage: '狂暴', 'Sneak Attack': '偷袭', 'Deflect Attacks': '拨挡攻击', 'Action Surge': '动作如潮', 'Lay On Hands': '圣疗'};
  titleIndex['dnd5e.monsterfeatures'] = {titles: {Berserk: '狂暴', 'Deflect Attack': '拨挡攻击'}};
  titleIndex['third.party'] = {titles: {'Other Surge': '动作如潮'}};
  const localItems = [
    {uuid: 'Actor.npc1.Item.sneak', name: '偷袭', type: 'feat', flags: {babele: {originalName: 'Sneak Attack (1/Round)'}}, system: {source: {rules: '2024'}}, actorType: 'npc'}
  ];
  const allByEdition = {
    legacy: [docs.rage14, docs.lay14, docs.deflectSummon14],
    modern: [docs.rage24, docs.sneak24, docs.deflect24, docs.actionSurge24, docs.lay24]
  };
  const nativeAll = async (item, opts = {}) => {
    const targetName = renamedItems[item.name] ?? item.name;
    const list = allByEdition[opts.rules ?? 'legacy'] ?? [];
    const hit = list.find(d => d.name === targetName);
    return hit ? [{document: hit, source: 'chris-premades', priority: 0}] : [];
  };
  const compendiumUtils = {
    getAllAutomations: nativeAll,
    getPreferredAutomation: async (item, opts) => (await nativeAll(item, opts))[0]?.document,
    getAppliedOrPreferredAutomation: async (item, opts) => (await nativeAll(item, opts))[0]?.document
  };
  const settings = {thirdParty: false, additionalCompendiums: {'chris-premades': 0}};
  const cpr = {
    macros: {}, legacyMacros: {},
    utils: {
      constants: {
        packs: {classFeatures: 'cpr.class14', monsterFeatures: 'cpr.summon14'},
        modernPacks: {classFeatures: 'cpr.class24'},
        itemTypes: ['weapon', 'equipment']
      },
      genericUtils: {getCPRSetting: key => settings[key]},
      itemUtils: {getSource: () => undefined},
      compendiumUtils
    }
  };
  const api = createController({
    core, cpr, renamedItems, packs,
    loadCorpus: () => core.readCorpus({
      packs, localItems, loadTitleIndex: async () => titleIndex,
      loadGrouping: () => items => new Map(items.map(i => [i.uuid, {key: null}]))
    })
  });
  await api.refresh();
  assert.equal(Object.hasOwn(renamedItems, '狂暴'), false);
  assert.equal(Object.hasOwn(renamedItems, '圣疗'), false);
  assert.equal(Object.hasOwn(renamedItems, '动作如潮'), false);

  const pc = {type: 'character'};
  const rageFeat = {name: '狂暴', type: 'feat', actor: pc, system: {type: {value: 'class'}}};
  assert.equal((await compendiumUtils.getAllAutomations(rageFeat, {rules: 'modern'}))[0].document, docs.rage24);
  assert.equal(await compendiumUtils.getPreferredAutomation(rageFeat, {rules: 'legacy'}), docs.rage14);
  assert.equal(await compendiumUtils.getAppliedOrPreferredAutomation(rageFeat, {rules: 'modern'}), docs.rage24);

  // Monster / NPC Berserk is not misrouted to character Rage
  assert.deepEqual(await compendiumUtils.getAllAutomations({
    name: '狂暴', type: 'feat', actor: {type: 'npc'}, system: {type: {value: 'monster'}}
  }, {rules: 'legacy'}), []);

  // NPC local Sneak Attack (1/Round) does not break PC Sneak Attack
  assert.equal(await compendiumUtils.getPreferredAutomation({
    name: '偷袭', type: 'feat', actor: pc, system: {type: {value: 'class'}}
  }, {rules: 'modern'}), docs.sneak24);

  // Deflect Attacks 2024 vs Deflect Attack 2014 monster/summon
  assert.equal(await compendiumUtils.getPreferredAutomation({
    name: '拨挡攻击', type: 'feat', actor: pc, system: {type: {value: 'class'}}
  }, {rules: 'modern'}), docs.deflect24);

  // Lay on Hands (2014) vs Lay On Hands (2024) across editions
  assert.equal(await compendiumUtils.getPreferredAutomation({
    name: '圣疗', type: 'feat', actor: pc, system: {type: {value: 'class'}}
  }, {rules: 'legacy'}), docs.lay14);
  assert.equal(await compendiumUtils.getPreferredAutomation({
    name: '圣疗', type: 'feat', actor: pc, system: {type: {value: 'class'}}
  }, {rules: 'modern'}), docs.lay24);

  // Same-scope conflict Action Surge vs Other Surge resolves via identifier / originalName / compendiumSource, fails closed without evidence
  assert.equal(await compendiumUtils.getPreferredAutomation({
    name: '动作如潮', type: 'feat', actor: pc, system: {type: {value: 'class'}, identifier: 'action-surge'}
  }, {rules: 'modern'}), docs.actionSurge24);
  assert.equal(await compendiumUtils.getPreferredAutomation({
    name: '动作如潮', type: 'feat', actor: pc, system: {type: {value: 'class'}}, _stats: {compendiumSource: 'Compendium.dnd5e.classes24.Item.a24'}
  }, {rules: 'modern'}), docs.actionSurge24);
  assert.equal(await compendiumUtils.getPreferredAutomation({
    name: '动作如潮', type: 'feat', actor: pc, system: {type: {value: 'class'}}
  }, {rules: 'modern'}), undefined);

  api.stop();
  assert.equal(compendiumUtils.getAllAutomations, nativeAll);
  assert.equal(await compendiumUtils.getPreferredAutomation(rageFeat, {rules: 'modern'}), undefined);
});

test('cpr main entry ignores identity-only changes, debounces name refreshes without retracting, and retracts access immediately', async t => {
  const env = client(), handlers = new Map(), self = {active: true};
  let nextHookId = 0, corpusCalls = 0, planCalls = 0;
  const revisions = {index: 0, sources: 0, names: 0, access: 0, review: 0, packs: 0};
  connectCatalog({getStatus:()=>({status:'unreviewed', revisions}),whenReady: async () => {}, read: ids => ({apiVersion:1,status:'unreviewed',entries:new Map(ids.map(uuid => [uuid,{key:null}]))})});
  const trackedCore = {
    ...core,
    loadCorpus: opts => { corpusCalls++; return core.loadCorpus(opts); },
    planAliases: args => { planCalls++; return core.planAliases(args); }
  };
  const deps = {
    Hooks: {
      once: (event, callback) => handlers.set(event, callback),
      on: (event, cb) => { const id = ++nextHookId; handlers.set(event + '#' + id, {event, cb}); return id; },
      off: (_event, id) => { for (const [k, v] of handlers) if (k.endsWith('#' + id) && v.cb) handlers.delete(k); }
    },
    game: {
      user: {isGM: false},
      modules: new Map([['truesight', {active: true, api: {apiVersion: 1, names: trackedCore}}], ['cpr-zh-aliases', self], ['chris-premades', {active: true}], ['dnd-simplified-chinese-babele-patch', {active: true}]]),
      packs: env.packs
    },
    chrisPremades: env.cpr, CONFIG: {chrisPremades: {renamedItems: env.renamedItems}},
    location: {href: 'http://localhost/table/game'},
    foundry: {utils: {getRoute: path => '/table/' + path}},
    fetch: async () => ({ok: true, json: async () => env.loadTitleIndex()})
  };
  for (const [key, value] of Object.entries(deps)) {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
    t.after(() => before ? Object.defineProperty(globalThis, key, before) : delete globalThis[key]);
  }
  const url = new URL('../modules/cpr-zh-aliases/scripts/main.mjs?bust=' + Math.random(), import.meta.url);
  await import(url.href);
  handlers.get('init')();
  await handlers.get('cprReady')();
  t.after(() => self.api.stop());
  assert.equal(corpusCalls, 1);
  assert.equal(planCalls, 1);
  assert.equal(env.renamedItems.迷踪步, 'Misty Step');

  const emit = payload => {
    for (const entry of handlers.values()) if (entry?.event === 'truesightChanged') entry.cb(payload);
  };
  emit({status: 'ready', changes: ['identity']});
  await new Promise(r => setTimeout(r, 30));
  assert.equal(corpusCalls, 1);
  assert.equal(planCalls, 1);

  revisions.names++;
  for (let i = 0; i < 5; i++) emit({status: 'ready', changes: ['names']});
  assert.equal(env.renamedItems.迷踪步, 'Misty Step');
  assert.equal(corpusCalls, 1);
  await new Promise(r => setTimeout(r, 460));
  assert.equal(corpusCalls, 2);
  assert.equal(planCalls, 2);

  revisions.access++;
  emit({status: 'ready', changes: ['access']});
  assert.equal(env.renamedItems.迷踪步, undefined);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(corpusCalls, 3);
  assert.equal(planCalls, 3);
  assert.equal(env.renamedItems.迷踪步, 'Misty Step');
});
