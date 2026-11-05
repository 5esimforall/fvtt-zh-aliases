import {activate} from './runtime.mjs';

const id = 'gps-zh-aliases';
Hooks.once('init', () => {
  game.modules.get(id).api = {report: {provider: 'gps', status: 'waiting-for-cpr'}};
});
Hooks.once('cprReady', async () => {
  const core = game.modules.get('zh-aliases-core')?.active ? game.modules.get('zh-aliases-core').api : null;
  const api = await activate({core, cpr: globalThis.chrisPremades,
    loadCorpus: () => core.loadCorpus(),
    isActive: () => ['zh-aliases-core', id, 'chris-premades', 'gambits-premades']
      .every(moduleId => game.modules.get(moduleId)?.active)});
  game.modules.get(id).api = api;
  if (api.report.status === 'ready') console.info(id, {status: 'ready', scopes: api.report.scopes.length});
  else console.warn(id, api.report);
});
