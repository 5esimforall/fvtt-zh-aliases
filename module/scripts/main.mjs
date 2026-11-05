import { activate } from './runtime.mjs';
import { TRANSLATION_MODULE } from './translations.mjs';
import { loadGrouping } from './groups.mjs';

function* visibleLocalItems() {
  for (const item of game.items?.values() ?? []) if (item.visible) yield item;
  for (const actor of game.actors?.values() ?? []) {
    if (actor.testUserPermission(game.user, 'OBSERVER')) yield* actor.items.values();
  }
}

const id = 'cpr-zh-aliases';
const api = { report: {status: 'waiting-for-cpr'} };
Hooks.once('init', () => { game.modules.get(id).api = api; });

Hooks.once('cprReady', async () => {
  api.report = {status: 'loading'};
  const report = await activate({
    cpr: globalThis.chrisPremades,
    renamedItems: CONFIG.chrisPremades?.renamedItems,
    packs: game.packs, loadGrouping, localItems: visibleLocalItems(),
    loadTitleIndex: async () => {
      const path = 'modules/' + TRANSLATION_MODULE + '/translation/cn/titles.json';
      const response = await fetch(foundry.utils.getRoute(path));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }
  });
  api.report = report;
  if (report.status === 'cluster-conflict') console.error(id, report.clusterErrors);
  else if (report.status === 'ready') {
    console.info(id, {registered: report.registered, conflicts: report.conflicts.length});
  } else {
    console.warn(id, report);
  }
});
