import {activate} from './runtime.mjs';

const id = 'gps-zh-aliases';
Hooks.once('init', () => {
  game.modules.get(id).api = {report: {provider: 'gps', status: 'waiting-for-cpr'}};
});
Hooks.once('cprReady', async () => {
  const foundation = game.modules.get('truesight');
  const core = foundation?.active && foundation.api?.apiVersion === 1 ? foundation.api.names : null;
  let api, changedDuringLoad = false;
  const hooks = Hooks;
  const hook = hooks.on('truesightChanged', () => {
    if (!game.modules.get(id)?.active) return;
    if (api?.refresh) void api.refresh(); else changedDuringLoad = true;
  });
  api = await activate({core, cpr: globalThis.chrisPremades,
    loadCorpus: () => core.loadCorpus(),
    isActive: () => ['truesight', id, 'chris-premades', 'gambits-premades']
      .every(moduleId => game.modules.get(moduleId)?.active)});
  game.modules.get(id).api = api;
  if (api.refresh) {
    const stop = api.stop;
    api.stop = () => { hooks.off('truesightChanged', hook); stop(); };
    if (changedDuringLoad) await api.refresh();
  } else hooks.off('truesightChanged', hook);
  if (api.report.status === 'ready') console.info(id, {status: 'ready', scopes: api.report.scopes.length});
  else console.warn(id, api.report);
});
