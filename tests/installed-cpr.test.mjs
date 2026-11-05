// Opt-in replay against a trusted local CPR installation. Execute only the lookup
// functions, with small in-memory packs. Never start Foundry or open a world DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { activate } from '../module/scripts/runtime.mjs';
import { TRANSLATION_MODULE } from '../module/scripts/translations.mjs';

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
  const names = {mistyStep: 'Misty Step', cunningAction: 'Cunning Action'};
  const macros = Object.fromEntries(Object.entries(names).map(([id, name]) => [id, {name}]));
  const packIds = [{spells: 'fixture.spells14'}, {spells: 'fixture.spells24', classFeatures: 'fixture.features24'}];
  const packs = new Map();
  for (const ids of packIds) {
    for (const [role, key] of Object.entries(ids)) {
      const identifier = role === 'spells' ? 'mistyStep' : 'cunningAction';
      const row = {_id: identifier, uuid: key + '.' + identifier, name: names[identifier],
        flags: {'chris-premades': {info: {identifier}}}};
      packs.set(key, {visible: true, documentName: 'Item', getIndex: async () => [row],
        getDocument: async id => id === row._id ? row : undefined});
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
  const report = await activate({renamedItems, packs, cpr: {macros, legacyMacros: macros,
    utils: {constants, genericUtils: {getCPRSetting: () => false}}},
    loadTitleIndex: async () => JSON.parse(await readFile(join(modules, TRANSLATION_MODULE, 'translation/cn/titles.json'), 'utf8'))});
  assert.equal(report.status, 'ready', JSON.stringify(report));
  for (const [i, rule] of rules.entries()) {
    const lookup = name => ctx.getCPRAutomation(spell(name), {rules: rule});
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
