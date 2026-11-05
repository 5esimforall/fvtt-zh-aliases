import {core} from './api.mjs';

Hooks.once('init', () => { game.modules.get('zh-aliases-core').api = core; });
