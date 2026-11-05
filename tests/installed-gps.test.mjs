import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import vm from 'node:vm';
import {core} from '../../truesight/module/scripts/names/api.mjs';
import {activate} from '../modules/gps-zh-aliases/scripts/runtime.mjs';

const modules = process.env.CPR_MODULES_DIR;
test('installed CPR Medkit lookup reaches GPS for Chinese names without routing other providers through the alias', {
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
  const entries = ['legacy', 'modern'].map((rules, i) => ({name: 'Indomitable', type: 'feat', rules,
    version: '2.1.38', uuid: 'fixture.gps.' + rules, _id: 'indomitable' + i}));
  const documents = new Map(entries.map(e => [e.uuid, Object.freeze({uuid: e.uuid, name: e.name})]));
  const cprDocument = {uuid: 'fixture.cpr.original'};
  const settings = {gambitPremades: 1, additionalCompendiums: {'chris-premades': 10, 'gambits-premades': 20, 'midi-item-showcase-community': 30}};
  const constants = {itemTypes: ['weapon', 'equipment', 'consumable', 'tool', 'backpack', 'loot']};
  const genericUtils = {getCPRSetting: key => settings[key]};
  const ctx = vm.createContext({gambitPremades: {gambitItems: entries, gambitMonsters: []}, constants,
    genericUtils, itemUtils: {getVersion: () => 'fallback'},
    miscPremades: {miscItems: [], miscMonsters: []},
    getCPRAutomation: async item => item.name === '不屈' ? cprDocument : undefined,
    getMISCAutomation: async item => item.name === 'Indomitable' ? {uuid: 'fixture.misc.retry'} : undefined,
    getACCAutomation: async () => undefined, getItemFromCompendium: async () => undefined,
    fromUuid: async uuid => documents.get(uuid)});
  vm.runInContext([lookup('getGPSAutomation'), lookup('getAllAutomations')].join('\n'), ctx);
  const compendiumUtils = {getAllAutomations: ctx.getAllAutomations, getGPSAutomation: ctx.getGPSAutomation};
  const packs = new Map(entries.map((entry, i) => ['gambits-premades.gps-class-features' + (i ? '-2024' : ''), {
    documentName: 'Item', visible: true, getIndex: async () => new Map([[entry._id, entry]])
  }]));
  const titleIndex = JSON.parse(await readFile(join(modules, 'dnd-simplified-chinese-babele-patch/translation/cn/titles.json'), 'utf8'));
  const api = await activate({core, cpr: {utils: {compendiumUtils, constants, genericUtils}},
    loadCorpus: () => core.readCorpus({packs, loadTitleIndex: () => titleIndex,
      loadGrouping: () => items => new Map(items.map(item => [item.uuid, {key: null}]))})});
  assert.equal(api.report.status, 'ready');
  for (const rules of ['legacy', 'modern']) {
    const control = await compendiumUtils.getAllAutomations({name: 'Indomitable', type: 'feat'}, {rules});
    const gpsControl = control.find(entry => entry.source === 'gambits-premades');
    for (const name of ['不屈', '不屈 Indomitable']) {
      const item = Object.freeze({name, type: 'feat'});
      const result = await compendiumUtils.getAllAutomations(item, {rules});
      const gps = result.find(entry => entry.source === 'gambits-premades');
      assert.equal(gps.document, gpsControl.document);
      assert.equal(gps.document.uuid, 'fixture.gps.' + rules);
      assert.equal(gps.version, '2.1.38');
      assert.equal(gps.priority, 20);
      assert.equal(result.find(entry => entry.source === 'chris-premades')?.document, name === '不屈' ? cprDocument : undefined);
      assert.equal(result.some(entry => entry.source === 'midi-item-showcase-community'), false);
      assert.equal(item.name, name);
    }
  }
  api.stop();
  const disabled = await compendiumUtils.getAllAutomations({name: '不屈', type: 'feat'}, {rules: 'modern'});
  assert.equal(disabled.some(entry => entry.source === 'gambits-premades'), false);
  assert.equal(compendiumUtils.getAllAutomations, ctx.getAllAutomations);
});
