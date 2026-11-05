import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import vm from 'node:vm';
import {core} from '../../truesight/module/scripts/names/api.mjs';
import {activate as activateGPS} from '../modules/gps-zh-aliases/scripts/runtime.mjs';
import {activate as activateMISC} from '../modules/misc-zh-aliases/scripts/runtime.mjs';
import {FoundryCollection} from './helpers/foundry-collection.mjs';

const modules = process.env.CPR_MODULES_DIR;
const gps = 'gambits-premades', misc = 'midi-item-showcase-community';

test('installed CPR title menu, Tidy header, Medkit and applied/preferred queries share alias candidates and source priority', {
  skip: !modules && 'set CPR_MODULES_DIR to a trusted Foundry Data/modules directory'
}, async () => {
  const map = JSON.parse(await readFile(join(modules, 'chris-premades/dist/main.js.map'), 'utf8'));
  const source = suffix => {
    const code = map.sourcesContent[map.sources.findIndex(path => path.endsWith(suffix))];
    assert.ok(code, suffix);
    return code;
  };
  const extract = (code, name) => {
    const match = code.match(new RegExp('^(?:export )?(?:async )?function ' + name + '\\([^]*?^\\}', 'm'));
    assert.ok(match, 'Update source replay for CPR: ' + name);
    return match[0].replace(/^export /, '');
  };
  const utilities = source('/compendiumUtils.js');
  const functions = ['getGPSAutomation', 'getMISCAutomation', 'getAllAutomations', 'getPreferredAutomation', 'getAppliedOrPreferredAutomation']
    .map(name => extract(utilities, name)).join('\n');
  const prepare = source('/medkit-item.js').match(/^    async readyData\(\) \{[^]*?^    \}/m);
  assert.ok(prepare, 'Medkit readyData');
  const titleIndex = JSON.parse(await readFile(join(modules, 'dnd-simplified-chinese-babele-patch/translation/cn/titles.json'), 'utf8'));

  for (const providers of [[gps], [misc], [gps, misc], [misc, gps]]) {
    // Both providers/editions are synthetic rows; no claim that these actual
    // packs contain Deflect Missiles in both rule editions.
    const directories = new Map(), documents = new Map(), packs = new FoundryCollection();
    for (const provider of [gps, misc]) {
      const entries = ['legacy', 'modern'].map((rules, i) => {
        const pack = provider + '.' + (provider === gps ? 'gps' : 'misc') + '-class-features' + (i ? '-2024' : '');
        const row = {_id: 'deflect', uuid: 'Compendium.' + pack + '.Item.deflect', name: 'Deflect Missiles', type: 'feat', rules,
          system: {source: {rules: i ? '2024' : '2014'}}, version: 'fixture-version'};
        documents.set(row.uuid, Object.freeze({uuid: row.uuid, name: row.name}));
        packs.set(pack, {visible: true, documentName: 'Item', getIndex: async () => new FoundryCollection([[row._id, row]])});
        return row;
      });
      directories.set(provider, entries);
    }
    const settings = {gambitPremades: 1, miscPremades: 1, additionalCompendiums: {[gps]: 10, [misc]: 20, 'chris-premades': 30}};
    const constants = {itemTypes: ['weapon', 'equipment', 'consumable', 'tool', 'backpack', 'loot']};
    let cprDocument;
    const itemUtils = {getVersion: () => 'fixture-version', isUpToDate: async () => -1};
    const genericUtils = {getCPRSetting: key => settings[key], getRules: item => item.rules, translate: key => key};
    const timers = [], icon = {style: {color: ''}};
    const ctx = vm.createContext({constants, itemUtils, genericUtils,
      gambitPremades: {gambitItems: directories.get(gps), gambitMonsters: []},
      miscPremades: {miscItems: directories.get(misc), miscMonsters: []},
      getCPRAutomation: async () => cprDocument, getACCAutomation: async () => undefined,
      getItemFromCompendium: async () => undefined, fromUuid: async uuid => documents.get(uuid),
      setTimeout: callback => timers.push(callback),
      foundry: {applications: {sidebar: {apps: {Compendium: class {}}}}},
      document: {querySelectorAll: () => [{innerText: 'CHRISPREMADES.Medkit.Medkit', querySelector: () => icon}]}
    });
    vm.runInContext(functions + '\n' + extract(source('/itemUtils.js'), 'getSource') + '\n' +
      extract(source('/extensions/titlebar.js'), 'appendHeaderControl') + '\n' +
      extract(source('/integrations/tidy5e.js'), 'renderTidyItemSheet') + '\n' +
      prepare[0].trim().replace('async readyData()', 'async function readyData()'), ctx);
    itemUtils.getSource = ctx.getSource;
    const compendiumUtils = Object.fromEntries(['getGPSAutomation', 'getMISCAutomation', 'getAllAutomations', 'getPreferredAutomation', 'getAppliedOrPreferredAutomation']
      .map(key => [key, ctx[key]]));
    ctx.compendiumUtils = compendiumUtils;
    const env = {core, cpr: {utils: {compendiumUtils, constants, genericUtils, itemUtils}},
      loadCorpus: () => core.readCorpus({packs, loadTitleIndex: () => titleIndex,
        loadGrouping: () => items => new Map(items.map(item => [item.uuid, {key: null}]))})};
    const makeItem = (name, rules = 'legacy', applied) => Object.freeze({name, rules, type: 'feat', documentName: 'Item',
      flags: Object.freeze({'chris-premades': {info: {source: applied}}})});
    const checkStatus = async (item, available) => {
      const app = {document: item, classList: {contains: () => false}};
      icon.style.color = '';
      ctx.appendHeaderControl(app, []);
      for (const timer of timers.splice(0)) await timer();
      assert.equal(icon.style.color, available ? 'yellow' : '');
      icon.style.color = '';
      await ctx.renderTidyItemSheet(app, {querySelector: () => icon}, {});
      assert.equal(icon.style.color, available ? 'yellow' : '');
      const medkit = {item};
      await ctx.readyData.call(medkit);
      assert.equal(medkit._prepared, true);
      assert.equal(medkit.availableAutomations.length > 0, available);
      return medkit.availableAutomations;
    };
    // Reproduce the native miss without changing the item display name.
    await checkStatus(makeItem('拨挡飞弹 Deflect Missiles'), false);
    const apis = [];
    for (const provider of providers) apis.push(await (provider === gps ? activateGPS : activateMISC)(env));
    assert.ok(apis.every(api => api.report.status === 'ready'));
    for (const rules of ['legacy', 'modern']) {
      const control = await compendiumUtils.getAllAutomations(makeItem('Deflect Missiles', rules), {rules});
      for (const name of ['拨挡飞弹', '拨挡飞弹 Deflect Missiles']) {
        const item = makeItem(name, rules), results = await checkStatus(item, true);
        assert.deepEqual(Array.from(results, entry => entry.source), [gps, misc].filter(provider => providers.includes(provider)));
        for (const row of results) assert.equal(row.document, control.find(entry => entry.source === row.source).document);
        assert.equal(await compendiumUtils.getPreferredAutomation(item, {rules}), results[0].document);
        assert.equal(await compendiumUtils.getAppliedOrPreferredAutomation(item, {rules}), results[0].document);
        for (const provider of providers) {
          assert.equal(await compendiumUtils.getAppliedOrPreferredAutomation(makeItem(name, rules, provider), {rules}),
            results.find(entry => entry.source === provider).document);
        }
        assert.equal(item.name, name);
      }
    }
    // Native CPR and provider priorities, not installation order, choose default.
    cprDocument = Object.freeze({uuid: 'fixture.cpr'});
    settings.additionalCompendiums['chris-premades'] = 1;
    assert.equal(await compendiumUtils.getPreferredAutomation(makeItem('拨挡飞弹')), cprDocument);
    cprDocument = undefined;
    await checkStatus(makeItem('未知译名'), false);
    for (const api of apis) api.stop();
    await checkStatus(makeItem('拨挡飞弹 Deflect Missiles'), false);
    await checkStatus(makeItem('Deflect Missiles'), true);
    for (const key of ['getAllAutomations', 'getPreferredAutomation', 'getAppliedOrPreferredAutomation']) assert.equal(compendiumUtils[key], ctx[key]);
  }
});
