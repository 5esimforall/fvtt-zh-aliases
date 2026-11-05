import {catalogNames} from './catalog.mjs';
import {activateProvider} from './shared/adapter-runtime.mjs';

const provider = {
  id: 'gps', source: 'gambits-premades', lookupMethod: 'getGPSAutomation', modeSetting: 'gambitPremades',
  catalogNames: (corpus, mode, scope) => catalogNames(corpus.indexes, mode, scope)
};

export function activate(options) {
  return activateProvider({...options, provider});
}
