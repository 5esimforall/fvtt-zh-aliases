import { activate } from './runtime.mjs';
import { TRANSLATION_MODULE } from './translations.mjs';

const id = 'cpr-zh-aliases';
const api = { report: {status: 'waiting-for-cpr'} };
Hooks.once('init', () => { game.modules.get(id).api = api; });

Hooks.once('cprReady', async () => {
  api.report = {status: 'loading'};
  const report = await activate({
    cpr: globalThis.chrisPremades,
    renamedItems: CONFIG.chrisPremades?.renamedItems,
    packs: game.packs,
    loadTitleIndex: async () => {
      const path = 'modules/' + TRANSLATION_MODULE + '/translation/cn/titles.json';
      const response = await fetch(foundry.utils.getRoute(path));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }
  });
  api.report = report;
  if (report.status === 'ready') {
    console.info(id, {registered: report.registered, conflicts: report.conflicts.length});
  } else {
    console.warn(id, report);
  }
});
