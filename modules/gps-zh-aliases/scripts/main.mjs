import {activate} from './runtime.mjs';

const id = 'gps-zh-aliases';
Hooks.once('init', () => {
  game.modules.get(id).api = {report: {provider: 'gps', status: 'waiting-for-cpr'}};
});
Hooks.once('cprReady', async () => {
  const foundation = game.modules.get('truesight');
  const core = foundation?.active && foundation.api?.apiVersion === 1 ? foundation.api.names : null;
  let api, changedDuringLoad = false, retractDuringLoad = false, immediateDuringLoad = false;
  const hooks = Hooks;
  const hook = hooks.on('truesightChanged', change => {
    if (core?.affects && !core.affects(change, ['names', 'access', 'review', 'sources'])) return;
    if (!game.modules.get(id)?.active) return;
    const retract = Boolean(core?.affects?.(change, ['access'])) || !['ready', 'unreviewed'].includes(change?.status);
    const immediate = retract || Boolean(core?.affects?.(change, ['review', 'sources']));
    if (api?.refresh) void api.refresh(immediate ? {retract, delay: 0} : {retract: false, delay: 400, idle: true});
    else { changedDuringLoad = true; retractDuringLoad ||= retract; immediateDuringLoad ||= immediate; }
  });
  api = await activate({core, cpr: globalThis.chrisPremades,
    loadCorpus: () => core.loadCorpus(),
    isActive: () => ['truesight', id, 'chris-premades', 'gambits-premades']
      .every(moduleId => game.modules.get(moduleId)?.active)});
  game.modules.get(id).api = api;
  if (api.refresh) {
    const stop = api.stop;
    api.stop = () => { hooks.off('truesightChanged', hook); stop(); };
    if (changedDuringLoad) {
      await api.refresh(immediateDuringLoad ? {retract: retractDuringLoad, delay: 0} : {retract: false, delay: 400, idle: true});
    }
  } else hooks.off('truesightChanged', hook);
  if (api.report.status === 'ready') console.info(id, {status: 'ready', scopes: api.report.scopes.length});
  else console.warn(id, api.report);
});
