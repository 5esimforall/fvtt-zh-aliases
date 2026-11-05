import test from 'node:test';
import assert from 'node:assert/strict';
import {memberSources} from '../modules/truesight/scripts/review-member.mjs';
import {readFileSync} from 'node:fs';
test('member source badges preserve editions and flag uncertain evidence',()=>{
 const refs=[{record:{label:"PHB'14",title:'Handbook'},page:'10'}];
 assert.deepEqual(memberSources({status:'confirmed',references:refs},s=>s),[{label:"PHB'14",title:'Handbook · 10',warning:false}]);
 const conflict=memberSources({status:'edition-conflict',references:refs},s=>s);
 assert.equal(conflict[0].warning,true);assert.equal(conflict.at(-1).label,'edition-conflict');
 assert.equal(memberSources(null,s=>s)[0].label,'unknown');
});
test('layout resets native fixed button height without overriding header icon fonts',()=>{
 const css=readFileSync(new URL('../modules/truesight/styles.css',import.meta.url),'utf8');
 assert.match(css,/\.ts-review \.ts-row \{[^}]*height:auto;[^}]*min-height:54px/);
 assert.match(css,/\.ts-review \.ts-row \{ width:100%/);
 assert.match(css,/\.ts-options \.ts-menu \{ position:absolute/);
 assert.match(css,/\.ts-member-name[^}]*font-size:14px/);
 assert.doesNotMatch(css,/\.truesight-review :is\(button,input,select\)/);
});
