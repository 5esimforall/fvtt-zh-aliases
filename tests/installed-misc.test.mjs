import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import vm from 'node:vm';
import {core} from '../../truesight/module/scripts/names/api.mjs';
import {activate} from '../modules/misc-zh-aliases/scripts/runtime.mjs';

const modules = process.env.CPR_MODULES_DIR;
test('installed CPR Medkit lookup reaches MISC for Chinese names without routing other providers through the alias', {
  skip: !modules && 'set CPR_MODULES_DIR to a trusted Foundry Data/modules directory'
}, async () => {
  const map = JSON.parse(await readFile(join(modules, 'chris-premades/dist/main.js.map'), 'utf8'));
  const source = map.sourcesContent[map.sources.findIndex(path => path.endsWith('/compendiumUtils.js'))];
  const medkit = map.sourcesContent[map.sources.findIndex(path => path.endsWith('/medkit-item.js'))];
  assert.ok(medkit.includes('compendiumUtils.getAllAutomations(this.item,'));
  function lookup(name) {
    const match = source.match(new RegExp('^async function ' + name + '\\([^]*?^\\}', 'm'));
    assert.ok(match, 'Update the integration fixture for CPR: ' + name);
    return match[0];
  }
  const entries = ['legacy', 'modern'].map((rules, i) => ({name: 'Deflect Missiles', type: 'feat', rules,
    version: 'fixture-version', uuid: 'fixture.misc.' + rules, _id: 'deflectMissiles' + i}));
  const documents = new Map(entries.map(e => [e.uuid, Object.freeze({uuid: e.uuid, name: e.name})]));
  const cprDocument = {uuid: 'fixture.cpr.original'};
  const settings = {miscPremades: 1, additionalCompendiums: {'chris-premades': 10, 'midi-item-showcase-community': 20, 'gambits-premades': 30}};
  const constants = {itemTypes: ['weapon', 'equipment', 'consumable', 'tool', 'backpack', 'loot']};
  const genericUtils = {getCPRSetting: key => settings[key]};
  const ctx = vm.createContext({constants,
    genericUtils, itemUtils: {getVersion: () => 'fallback'},
    gambitPremades: {gambitItems: [], gambitMonsters: []},
    getCPRAutomation: async item => item.name === '拨挡飞弹' ? cprDocument : undefined,
    getGPSAutomation: async item => item.name === 'Deflect Missiles' ? {uuid: 'fixture.gps.retry'} : undefined,
    getACCAutomation: async () => undefined, getItemFromCompendium: async () => undefined,
    fromUuid: async uuid => documents.get(uuid)});
  vm.runInContext([lookup('getMISCAutomation'), lookup('getAllAutomations')].join('\n'), ctx);
  const compendiumUtils = {getAllAutomations: ctx.getAllAutomations, getMISCAutomation: ctx.getMISCAutomation};
  const packs = new Map(entries.map((entry, i) => ['midi-item-showcase-community.misc-class-features' + (i ? '-2024' : ''), {
    documentName: 'Item', visible: true, getIndex: async () => new Map([[entry._id, entry]])
  }]));
  // Build the native directory with installed CPR's real integration, not a
  // handwritten approximation. Both editions here are synthetic fixture rows.
  const integration = map.sourcesContent[map.sources.findIndex(path => path.endsWith('/integrations/miscPremades.js'))];
  assert.ok(integration);
  ctx.game = {packs};
  ctx.CONFIG = {'midi-item-showcase-community': {automations: Object.fromEntries(
    entries.map(entry => [entry.rules, {[entry.name]: {version: entry.version, aliases: ['既有拨挡']}}]))}};
  genericUtils.log = () => {};
  vm.runInContext(integration.replace(/^import .*;$/gm, '').replace('export let miscPremades =', 'globalThis.miscPremades ='), ctx);
  await ctx.miscPremades.init(1);
  assert.equal(ctx.miscPremades.miscItems.length, 2);
  const titleIndex = JSON.parse(await readFile(join(modules, 'dnd-simplified-chinese-babele-patch/translation/cn/titles.json'), 'utf8'));
  const api = await activate({core, cpr: {utils: {compendiumUtils, constants, genericUtils}},
    loadCorpus: () => core.readCorpus({packs, loadTitleIndex: () => titleIndex,
      loadGrouping: () => items => new Map(items.map(item => [item.uuid, {key: null}]))})});
  assert.equal(api.report.status, 'ready');
  for (const rules of ['legacy', 'modern']) {
    const control = await compendiumUtils.getAllAutomations({name: 'Deflect Missiles', type: 'feat'}, {rules});
    const miscControl = control.find(entry => entry.source === 'midi-item-showcase-community');
    for (const name of ['拨挡飞弹', '拨挡飞弹 Deflect Missiles', '既有拨挡']) {
      const item = Object.freeze({name, type: 'feat'});
      const result = await compendiumUtils.getAllAutomations(item, {rules});
      const misc = result.find(entry => entry.source === 'midi-item-showcase-community');
      assert.equal(misc.document, miscControl.document);
      assert.equal(misc.document.uuid, 'fixture.misc.' + rules);
      assert.equal(misc.version, 'fixture-version');
      assert.equal(misc.priority, 20);
      assert.equal(result.find(entry => entry.source === 'chris-premades')?.document, name === '拨挡飞弹' ? cprDocument : undefined);
      assert.equal(result.some(entry => entry.source === 'gambits-premades'), false);
      assert.equal(item.name, name);
    }
  }
  assert.equal((await compendiumUtils.getAllAutomations({name: '未知译名', type: 'feat'})).some(
    entry => entry.source === 'midi-item-showcase-community'), false);
  api.stop();
  const disabled = await compendiumUtils.getAllAutomations({name: '拨挡飞弹', type: 'feat'}, {rules: 'modern'});
  assert.equal(disabled.some(entry => entry.source === 'midi-item-showcase-community'), false);
  assert.equal(compendiumUtils.getAllAutomations, ctx.getAllAutomations);
});
