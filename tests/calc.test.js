// Model tests. Run: node --test tests/
// Zero dependency: runs the <script> of index.html in a vm without a DOM (init() is skipped).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(HTML.match(/<script>([\s\S]*?)<\/script>/)[1], ctx);

const one = (median, p85) => ({ real: {}, stages: [{ id: 'a', name: 'A', median, p85 }], actions: [] });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('single stage: simulated median and P85 match the inputs', () => {
  const r = ctx.evaluate(one(10, 40));
  near(r.base.p50, 10, 0.5, 'p50');
  near(r.base.p85, 40, 2, 'p85');
});

test('constant stage (P85 = median) works', () => {
  const r = ctx.evaluate(one(5, 5));
  near(r.base.p50, 5, 1e-9, 'p50');
  near(r.base.p85, 5, 1e-9, 'p85');
});

test('50% cut on all items of the only stage halves the real P85', () => {
  const s = one(10, 40);
  s.real = { p50: 50, p85: 200 };
  s.actions = [{ id: 'x', name: 'X', effects: [{ stage: 'a', pess: 50, prob: 50, opt: 50, share: 100 }] }];
  const p = ctx.evaluate(s).ranked[0].proj.prob;
  near(p.p85, 100, 1e-6, 'projected p85');
  near(p.p50, 25, 1e-6, 'projected p50');
  near(p.gain85, 100, 1e-6, 'gain');
});

test('ranking uses probable gain and pess <= prob <= opt gives ordered gains', () => {
  const s = { real: {}, stages: [{ id: 'a', median: 10, p85: 60 }, { id: 'b', median: 10, p85: 15 }], actions: [
    { id: 'small', name: 'small', effects: [{ stage: 'b', pess: 10, prob: 50, opt: 90, share: 100 }] },
    { id: 'big', name: 'big', effects: [{ stage: 'a', pess: 10, prob: 50, opt: 90, share: 100 }] },
  ] };
  const r = ctx.evaluate(s);
  assert.equal(r.ranked[0].action.id, 'big');
  const p = r.ranked[0].proj;
  assert.ok(p.pess.gain85 < p.prob.gain85 && p.prob.gain85 < p.opt.gain85);
});

test('combined effect on the same stage is less than the sum of gains', () => {
  const eff = { stage: 'a', pess: 50, prob: 50, opt: 50, share: 100 };
  const s = one(10, 40);
  s.actions = [{ id: 'x', selected: true, effects: [eff] }, { id: 'y', selected: true, effects: [eff] }];
  const r = ctx.evaluate(s);
  assert.ok(r.combo.prob.gain85 < r.comboSum);
  near(r.combo.prob.p85, r.real.p85 * 0.25, 1e-6, 'two 50% cuts = 75% cut');
});

test('share of items: 0% changes nothing, negative % makes it slower', () => {
  const s = one(10, 40);
  s.actions = [
    { id: 'none', effects: [{ stage: 'a', pess: 50, prob: 50, opt: 50, share: 0 }] },
    { id: 'worse', effects: [{ stage: 'a', pess: -20, prob: -20, opt: -20, share: 100 }] },
  ];
  const r = ctx.evaluate(s);
  const byId = Object.fromEntries(r.ranked.map(x => [x.action.id, x.proj.prob.gain85]));
  near(byId.none, 0, 1e-9, 'no item touched');
  assert.ok(byId.worse < 0);
});

test('action without stage or probable % is not demonstrable', () => {
  const s = one(10, 40);
  s.actions = [{ id: 'v', name: 'vague', effects: [] }, { id: 'w', effects: [{ stage: '', prob: 30 }] }];
  const r = ctx.evaluate(s);
  assert.equal(r.ranked.length, 0);
  assert.equal(r.notDemo.length, 2);
});

test('paste parsing: Excel tabs, decimal comma, header skipped, actions grouped', () => {
  const st = ctx.parseStages('Stage\tMedian\tP85\nAnalysis\t12,5\t60\tTeam estimate\nQA\t5\t15');
  assert.equal(st.length, 2);
  assert.equal(st[0].median, 12.5);
  assert.equal(st[0].source, 'estimate');
  assert.equal(st[1].source, 'measured');
  const a = ctx.parseActions('Action\tStage\tPess\tProb\tOpt\t% items\nDoR\tanalysis\t20\t40\t60\t50%\nDoR\tQA\t0\t10\t20\nVague idea\nX\tNope\t1\t2\t3', st);
  assert.equal(a.actions.length, 3);
  assert.equal(a.actions[0].effects.length, 2);
  assert.equal(a.actions[0].effects[0].stage, st[0].id);
  assert.equal(a.actions[0].effects[0].share, 50);
  assert.equal(a.actions[0].effects[1].share, 100);
  assert.equal(a.actions[1].effects.length, 0);
  assert.deepEqual([...a.unknown], ['Nope']);
});

test('example data evaluates without errors', () => {
  const r = ctx.evaluate(ctx.example());
  assert.ok(r.ranked.length >= 4);
  assert.equal(r.notDemo.length, 1);
  assert.ok(r.combo && r.combo.prob.p85 < r.real.p85);
});
