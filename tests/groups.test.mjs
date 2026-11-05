import test from 'node:test';
import assert from 'node:assert/strict';
import {registerAliases} from '../module/scripts/aliases.mjs';
import {itemGroups} from '../module/scripts/groups.mjs';

const native = new Set(['Blade Ward', 'Shield', 'Misty Step']);
const member = (displayName, source = displayName, more) => ({displayName, source, ...more});
const group = (...names) => names.map((name, i) => member(name, 'pack#' + i));
const run = (groups, table = {}, pairs = [], names = native) => ({
  report: registerAliases(pairs, names, table, new Map(groups)), table
});

test('approved siblings share one CPR name; observed bilingual English is matched in full', () => {
  const members = group('Blade Ward', '剑刃防护 blade ward', '刀剑之护', '剑刃防护（BLADE WARD）', 'Blade Ward 剑刃守护');
  const {report, table} = run([['2014', members], ['other', group('不相干')], ['partial', group('自制 Improved Blade Ward')]]);
  assert.equal(report.status, 'ready');
  for (const row of members.slice(1)) assert.equal(table[row.displayName], 'Blade Ward');
  for (const key of ['Blade Ward', '不相干', '自制 Improved Blade Ward']) assert.ok(!Object.hasOwn(table, key));
});

test('rejects the entire inconsistent group, including dictionary matches; order cannot select a winner', () => {
  const members = group('Blade Ward', '剑刃防护 shield', '第三个译名');
  const pairs = [{translatedName: '第三个译名', englishName:'Blade Ward', source:'PHB#Blade Ward'}];
  for (const items of [members, members.toReversed()]) {
    const {report, table} = run([['bad', items], ['ok', group('迷踪步 misty step')]], {}, pairs);
    assert.equal(report.status,'cluster-conflict');
    assert.deepEqual(report.clusterErrors[0].groups, ['bad']);
    assert.deepEqual(report.clusterErrors[0].candidates.map(c => c.englishName), ['Blade Ward','Shield']);
    assert.ok(report.clusterErrors[0].candidates[0].sources.includes('PHB#Blade Ward'));
    assert.equal(report.clusterErrors[0].members.length, 3);
    assert.equal(table['迷踪步 misty step'], 'Misty Step');
    assert.ok(!Object.hasOwn(table,'剑刃防护 shield') && !Object.hasOwn(table,'第三个译名'));
  }
});

test('existing direct mapping, linked CPR macro and ambiguous folded spellings are evidence, not tie breakers', () => {
  const mismatch = [member('护盾', 'cpr#1', {cprNames:['Blade Ward']}), member('旧译')];
  assert.deepEqual(run([['bad',mismatch]], {护盾:'Shield'}).table, {护盾:'Shield'});
  assert.equal(run([['bad',mismatch]], {护盾:'Shield'}).report.status, 'cluster-conflict');
  const {report,table} = run([['case',group('防护 blade ward')]], {}, [], new Set(['Blade Ward', 'BLADE WARD']));
  assert.equal(report.clusterErrors[0].candidates.length, 2);
  assert.deepEqual(table, {});
});

test('shared exact keys cannot overwrite another edition; independent evidence does not propagate across groups', () => {
  const groups = [['legacy',group('Blade Ward','同名','旧译')], ['modern',group('Shield','同名','新译')]];
  const {report,table} = run(groups);
  assert.deepEqual(report.clusterErrors[0].groups,['legacy','modern']);
  assert.deepEqual(table,{});
  const ok = run([groups[0],['unproven',group('同名','不能据此推断')]]);
  assert.equal(ok.table.旧译,'Blade Ward');
  assert.ok(!Object.hasOwn(ok.table,'不能据此推断'));
});

test('only catalog-approved UUIDs group; stale, unlisted, other editions and local items remain independent', () => {
  const index = new Map([['pack.a', ['甲','乙','丙','丁'].map((name,i)=>({_id:'id'+i,name,type:'spell',system:{identifier:'spell'}}))]]);
  const groups = itemGroups(index, items => new Map(items.map((item,i)=>[item.uuid,
    {key: i<2 ? '2014' : i===2 ? '2024' : null, warning:i===3?'stale':null}])),
    [{uuid:'Actor.1.Item.2',name:'戊'}],{});
  assert.deepEqual(groups.get('2014').map(m=>m.displayName),['甲','乙']);
  assert.equal(groups.size,4);
});

test('bilingual inference cannot contradict a known translation or use a mere English substring', () => {
  const pairs = [{translatedName:'剑刃防护',englishName:'Blade Ward',source:'PHB#Blade Ward'}];
  const {report,table} = run([['wrong',group('剑刃防护 Shield')],['valid',group('剑刃防护blade ward')],
    ['partial',group('自订 Greater Blade Ward')]],{},pairs);
  assert.equal(report.clusterErrors.length, 1);
  assert.deepEqual(report.clusterErrors[0].groups, ['wrong']);
  assert.equal(table['剑刃防护blade ward'], 'Blade Ward');
  assert.ok(!Object.hasOwn(table,'剑刃防护 Shield') && !Object.hasOwn(table,'自订 Greater Blade Ward'));
});
