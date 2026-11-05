import {core} from '../modules/zh-aliases-core/scripts/api.mjs';
// Opt-in replay against a trusted local CPR installation. Execute only the lookup
// functions, with small in-memory packs. Never start Foundry or open a world DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { activate } from '../modules/cpr-zh-aliases/scripts/runtime.mjs';
import { TRANSLATION_MODULE } from '../modules/zh-aliases-core/scripts/translations.mjs';

const modules = process.env.CPR_MODULES_DIR;
test('installed CPR resolves the real translation spellings to the English control document', {
  skip: !modules && 'set CPR_MODULES_DIR to a trusted Foundry Data/modules directory'
}, async () => {
  const map = JSON.parse(await readFile(join(modules, 'chris-premades/dist/main.js.map'), 'utf8'));
  function lookupFunction(file, name) {
    const source = map.sourcesContent[map.sources.findIndex(path => path.endsWith('/' + file))];
    const match = source?.match(new RegExp('^(?:async )?function ' + name + '\\([^]*?^\\}', 'm'));
    assert.ok(match, 'Update the integration fixture for CPR: ' + name);
    return match[0];
  }
  const rules = ['legacy', 'modern'];
  const names = {mistyStep: 'Misty Step', cunningAction: 'Cunning Action', bladeWard: 'Blade Ward'};
  const macros = Object.fromEntries(Object.entries(names).map(([id, name]) => [id, {name}]));
  const packIds = [{spells: 'fixture.spells14'}, {spells: 'fixture.spells24', classFeatures: 'fixture.features24'}];
  const packs = new Map();
  for (const ids of packIds) {
    for (const [role, key] of Object.entries(ids)) {
      const identifier = role === 'spells' ? 'mistyStep' : 'cunningAction';
      const row = {_id: identifier, uuid: key + '.' + identifier, name: names[identifier],
        flags: {'chris-premades': {info: {identifier}}}};
      const blade = {_id:'bladeWard', uuid:key+'.bladeWard', name:'Blade Ward', flags:{'chris-premades':{info:{identifier:'bladeWard'}}}};
      const rows = role === 'spells' ? [row, blade] : [row];
      packs.set(key, {visible: true, documentName: 'Item', getIndex: async () => rows,
        getDocument: async id => rows.find(r => r._id === id)});
    }
  }
  const renamedItems = {};
  const constants = {packs: packIds[0], modernPacks: packIds[1]};
  const ctx = vm.createContext({legacyMacros: macros, modernMacros: macros, macros,
    customMacroList: [], registeredMacroList: [], constants, game: {packs}, CONFIG: {chrisPremades: {renamedItems}}});
  vm.runInContext([
    lookupFunction('genericUtils.js', 'getIdentifier'), lookupFunction('genericUtils.js', 'getCPRIdentifiers'),
    lookupFunction('custom.js', 'getMacro'), 'const custom = {getMacro};',
    'const genericUtils = {getIdentifier, getCPRIdentifiers, getCPRSetting: () => false};',
    lookupFunction('compendiumUtils.js', 'getItemFromCompendium'), lookupFunction('compendiumUtils.js', 'getCPRAutomation')
  ].join('\n'), ctx);
  const spell = name => Object.freeze({name, type: 'spell'});
  assert.equal(await ctx.getCPRAutomation(spell('迷踪步')), undefined);
  const displayed = ['剑刃防护', '剑刃防护 Blade Ward', '剑刃防护 blade ward'].map(spell);
  assert.equal(await ctx.getCPRAutomation(displayed[2]), undefined);
  const report = await activate({core, renamedItems, packs, loadGrouping:()=>items=>new Map(items.map(i=>[i.uuid,{key:null}])), localItems:displayed.map((item,i)=>({...item,uuid:'Item.'+i})), cpr: {macros, legacyMacros: macros,
    utils: {constants, genericUtils: {getCPRSetting: () => false}}},
    loadTitleIndex: async () => JSON.parse(await readFile(join(modules, TRANSLATION_MODULE, 'translation/cn/titles.json'), 'utf8'))});
  assert.equal(report.status, 'ready', JSON.stringify(report));
  for (const [i, rule] of rules.entries()) {
    const lookup = name => ctx.getCPRAutomation(spell(name), {rules: rule});
    const blade = await lookup('Blade Ward');
    assert.equal(blade.uuid, packIds[i].spells + '.bladeWard');
    for (const item of displayed) assert.equal(await ctx.getCPRAutomation(item,{rules:rule}), blade);
    const control = await lookup('Misty Step');
    assert.equal(control.uuid, packIds[i].spells + '.mistyStep');
    for (const name of ['迷踪步', '迷踪步 Misty Step']) assert.equal(await lookup(name), control);
  }
  const feat = name => Object.freeze({name, type: 'feat', system: {type: {value: 'class'}}});
  const control = await ctx.getCPRAutomation(feat('Cunning Action'), {rules: 'modern'});
  assert.equal(control.uuid, 'fixture.features24.cunningAction');
  for (const name of ['灵巧动作', '灵巧动作 Cunning Action']) {
    assert.equal(await ctx.getCPRAutomation(feat(name), {rules: 'modern'}), control);
  }
  assert.equal(await ctx.getCPRAutomation(spell('未知 Misty Step')), undefined);
  const alreadyIdentified = {...spell('灵巧动作'), flags: {'chris-premades': {info: {identifier: 'mistyStep'}}}};
  assert.equal((await ctx.getCPRAutomation(alreadyIdentified)).uuid, 'fixture.spells14.mistyStep');
});

test('installed Slow Insert validates the five Blade Ward members, separated by rules', {
  skip: !process.env.SLOW_INSERT_MODULE_DIR && 'set SLOW_INSERT_MODULE_DIR to a trusted Slow Insert directory'
}, async t => {
  const dir = process.env.SLOW_INSERT_MODULE_DIR;
  const {pathToFileURL} = await import('node:url');
  const {GROUPING_REGISTRY} = await import(pathToFileURL(join(dir,'data/grouping-registry.mjs')));
  const {itemGroups, loadGrouping} = await import('../modules/zh-aliases-core/scripts/groups.mjs');
  const modules = new Map([['slow-insert',{active:true}]]), packs = new Map(), indexes = new Map();
  for (const [uuid, record] of Object.entries(GROUPING_REGISTRY.members)) {
    if (record.identifier !== 'blade-ward') continue;
    const [,pkg,id,,_id] = uuid.split('.'), packId = pkg + '.' + id;
    const index = new Map([[_id,{_id, type:'spell',name:record.names[0],_stats:{modifiedTime:record.modifiedTime},
      system:{identifier:record.identifier,school:record.school,level:record.level,source:{rules:record.rules}}}]]);
    modules.set(pkg, {version:record.packageVersion});
    packs.set(packId,{index,metadata:{packageName:pkg,packageType:'module'}});
    indexes.set(packId,index);
  }
  for (const [key,value] of Object.entries({
    game:{modules,packs,system:{id:'dnd5e'},i18n:{localize:k=>k}},
    foundry:{utils:{getRoute:p=>{assert.equal(p,'modules/slow-insert/scripts/grouping.mjs');return pathToFileURL(join(dir,'scripts/grouping.mjs')).href;}}},
    location:{href:'http://localhost/game'},CONFIG:{DND5E:{}}
  })) {
    const before = Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(()=>before ? Object.defineProperty(globalThis,key,before) : delete globalThis[key]);
  }
  const catalog = await loadGrouping();
  const groups = itemGroups(indexes,catalog,[]);
  assert.equal(groups.get('spell:2014:blade-ward').length,2);
  assert.equal(groups.get('spell:2024:blade-ward').length,3);
  const {applyPlan} = await import('./helpers/apply-plan.mjs');
  const table = {};
  assert.equal(applyPlan([],new Set(['Blade Ward']),table,groups).status,'ready');
  assert.equal(table['剑刃防护 blade ward'],'Blade Ward');
  assert.equal(table.剑刃防护,'Blade Ward');
  modules.get('dnd5e_classpack').version = 'unverified-version';
  assert.equal(itemGroups(indexes,catalog,[]).get('spell:2014:blade-ward').length,1);
});
