import {activate} from './runtime.mjs';
import {catalogContext} from './catalog.mjs';

const id = 'misc-zh-aliases';
Hooks.once('init', () => {
  game.modules.get(id).api = {report: {provider: 'misc', status: 'waiting-for-cpr'}};
});
Hooks.once('cprReady', async () => {
  const foundation = game.modules.get('truesight');
  const core = foundation?.active && foundation.api?.apiVersion === 1 ? foundation.api.names : null;
  let api, changedDuringLoad = false, retractDuringLoad = false;
  const hooks = Hooks;
  const hook = hooks.on('truesightChanged', change => {
    if (core?.affects && !core.affects(change, ['names', 'identity', 'access', 'review', 'sources'])) return;
    if (!game.modules.get(id)?.active) return;
    const retract = Boolean(core?.affects?.(change, ['access'])) || !['ready', 'unreviewed'].includes(change?.status);
    if (api?.refresh) void api.refresh({retract});
    else { changedDuringLoad = true; retractDuringLoad ||= retract; }
  });
  api = await activate({core, cpr: globalThis.chrisPremades,
    loadCorpus: async () => ({
      ...await core.loadCorpus({fields: ['folderId']}),
      miscCatalog: catalogContext(game.packs, CONFIG['midi-item-showcase-community']?.automations)
    }),
    isActive: () => ['truesight', id, 'chris-premades', 'midi-item-showcase-community']
      .every(moduleId => game.modules.get(moduleId)?.active)});
  game.modules.get(id).api = api;
  if (api.refresh) {
    const stop = api.stop;
    api.stop = () => { hooks.off('truesightChanged', hook); stop(); };
    if (changedDuringLoad) await api.refresh({retract: retractDuringLoad});
  } else hooks.off('truesightChanged', hook);
  if (api.report.status === 'ready') console.info(id, {status: 'ready', scopes: api.report.scopes.length});
  else console.warn(id, api.report);
});
