import {catalogNames} from './catalog.mjs';
import {activateProvider} from './shared/adapter-runtime.mjs';

const provider = {
  id: 'misc', source: 'midi-item-showcase-community', lookupMethod: 'getMISCAutomation', modeSetting: 'miscPremades',
  catalogNames: (corpus, mode, scope) => catalogNames(corpus.indexes, mode, scope, corpus.miscCatalog)
};

export function activate(options) {
  return activateProvider({...options, provider});
}
