import test from 'node:test';
import assert from 'node:assert/strict';
import {connectCatalog} from '../modules/truesight/scripts/catalog/api.mjs';
import {reviewWindowClass} from '../modules/truesight/scripts/review-window.mjs';

class Element {
  constructor(tag, text = '') { this.tag = tag; this.textContent = text; this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
}

test('review action precedes members and remains usable after apply and restoring exclusions', async t => {
  const keys = ['game','document','foundry','Hooks'];
  const originals = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  t.after(() => {for (const key of keys) globalThis[key] = originals[key];});
  globalThis.game = {i18n:{localize:key=>key}};
  globalThis.document = {createElement:tag=>new Element(tag),createTextNode:text=>new Element('#text',text)};
  globalThis.foundry = {applications:{api:{ApplicationV2:class {}}}};
  globalThis.Hooks = {on:()=>1,off:()=>{}};
  let saved = 0, restored = 0;
  const preview = {id:'preview',status:'ready',diff:{},groups:[{members:[{name:'Example',uuid:'Item.example'}]}],independent:[]};
  connectCatalog({getStatus:()=>({status:'ready',includeRisk:false,canUndo:true}),whenReady:async()=>{},
    read:()=>({excludedCount:1}),preview:()=>preview,apply:async id=>{assert.equal(id,'preview');saved++;},
    restoreExcluded:async()=>{restored++;}});
  const Window = reviewWindowClass(), app = new Window(), root = await app._renderHTML();
  const apply = root.children.find(el=>el.textContent==='TRUESIGHT.Grouping.Apply');
  const list = root.children.find(el=>el.children.some(child=>child.tag==='details'));
  assert.ok(root.children.indexOf(apply) < root.children.indexOf(list));
  assert.equal(apply.disabled,false);assert.equal(apply.hidden,false);
  await apply.onclick();assert.equal(saved,1);assert.equal(apply.hidden,true);
  const controls = root.children.find(el=>el.children.some(child=>child.textContent==='TRUESIGHT.Grouping.RestoreExcluded'));
  await controls.children.find(el=>el.textContent==='TRUESIGHT.Grouping.RestoreExcluded').onclick();
  assert.equal(restored,1);assert.equal(apply.hidden,false);assert.equal(apply.disabled,false);
  await apply.onclick();assert.equal(saved,2);
});
