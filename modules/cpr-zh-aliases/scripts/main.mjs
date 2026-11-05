import {createController} from './runtime.mjs';

const id = 'cpr-zh-aliases';
Hooks.once('init', () => { game.modules.get(id).api = {report: {provider: 'cpr', status: 'waiting-for-cpr'}}; });
Hooks.once('cprReady', async () => {
  const foundation = game.modules.get('truesight');
  const core = foundation?.active && foundation.api?.apiVersion === 1 ? foundation.api.names : null;
  const api = createController({core, cpr: globalThis.chrisPremades,
    renamedItems: CONFIG.chrisPremades?.renamedItems, packs: game.packs,
    loadCorpus: options => core.loadCorpus(options)});
  game.modules.get(id).api = api;
  const refresh = api.refresh, stop = api.stop;
  const hooks = Hooks;
  const hook = hooks.on('truesightChanged', () => { if (game.modules.get(id)?.active) void refresh(); });
  api.stop = () => { hooks.off('truesightChanged', hook); stop(); };
  await refresh();
  if (api.report.status !== 'ready') console.warn(id, api.report);
});
