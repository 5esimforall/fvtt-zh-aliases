import {activate} from './runtime.mjs';

const id = 'cpr-zh-aliases';
const api = {report: {provider: 'cpr', status: 'waiting-for-cpr'}};
Hooks.once('init', () => { game.modules.get(id).api = api; });
Hooks.once('cprReady', async () => {
  api.report = {provider: 'cpr', status: 'loading'};
  const core = game.modules.get('zh-aliases-core')?.active ? game.modules.get('zh-aliases-core').api : null;
  api.report = await activate({core, cpr: globalThis.chrisPremades,
    renamedItems: CONFIG.chrisPremades?.renamedItems, packs: game.packs,
    loadCorpus: options => core.loadCorpus(options)});
  const {status, registered, clusterErrors} = api.report;
  if (status === 'ready') console.info(id, {status, registered});
  else console.warn(id, {status, registered, clusterErrors: clusterErrors?.length}, api.report);
});
