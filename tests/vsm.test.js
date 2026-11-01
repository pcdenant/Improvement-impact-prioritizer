// Future-state VSM model tests. Run: node --test tests/vsm.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'vsm.html'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(HTML.match(/<script>([\s\S]*?)<\/script>/)[1], ctx);

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
// 7 items/week = 1 item/day, so wait (days) = inventory.
const base = () => ({
  throughput: 7, real: { p50: 30, p85: 120, target: 60 },
  steps: [{ id: 'a', name: 'A', pt: 2, inv: 10 }, { id: 'b', name: 'B', pt: 3, inv: '', wait: 5 }],
  bursts: [],
});

test('current state: wait = inventory / throughput, LT and flow efficiency', () => {
  const s = ctx.stream(base(), [], 'prob');
  near(s.steps[0].wt, 10, 1e-9, 'Little wait');
  near(s.steps[1].wt, 5, 1e-9, 'entered wait');
  near(s.lt, 20, 1e-9, 'lead time');
  near(s.fe, 0.25, 1e-9, 'flow efficiency');
});

test('inventory 10 -> 5 halves that wait; P85 scales with the lead-time ratio', () => {
  const st = base();
  st.bursts = [{ id: 'x', changes: [{ step: 'a', field: 'inv', pess: 8, prob: 5, opt: 2 }] }];
  const p = ctx.evaluate(st).ranked[0].proj;
  near(p.prob.lt, 15, 1e-9, 'future LT');
  near(p.prob.p85, 120 * 15 / 20, 1e-9, 'projected P85');
  near(p.prob.gain85, 30, 1e-9, 'gain');
  assert.ok(p.pess.gain85 < p.prob.gain85 && p.prob.gain85 < p.opt.gain85);
});

test('throughput x2 halves every wait, process time unchanged', () => {
  const st = base();
  st.bursts = [{ id: 't', changes: [{ step: '', field: 'tp', pess: 14, prob: 14, opt: 14 }] }];
  const p = ctx.evaluate(st).ranked[0].proj.prob.stream;
  near(p.wt, 7.5, 1e-9, 'waits halved');
  near(p.pt, 5, 1e-9, 'process unchanged');
});

test('two bursts on the same box multiply, not add', () => {
  const st = base();
  const ch = { step: 'a', field: 'pt', pess: 1, prob: 1, opt: 1 };
  st.bursts = [{ id: 'x', selected: true, changes: [ch] }, { id: 'y', selected: true, changes: [ch] }];
  const r = ctx.evaluate(st);
  near(r.combo.prob.stream.steps[0].pt, 0.5, 1e-9, '2 x (2 -> 1) = 0.5');
});

test('not demonstrable: no change, or inventory change on a step without inventory', () => {
  const st = base();
  st.bursts = [{ id: 'v', changes: [] }, { id: 'w', changes: [{ step: 'b', field: 'inv', prob: 2 }] }];
  const r = ctx.evaluate(st);
  assert.equal(r.ranked.length, 0);
  assert.equal(r.notDemo.length, 2);
});

test('paste steps and example data', () => {
  const s = ctx.parseSteps('Step\tPT\tInv\nAnalysis\t3,5\t40\nQA\t2\t\t6');
  assert.equal(s.length, 2);
  assert.equal(s[0].pt, 3.5);
  assert.equal(s[1].wait, 6);
  const r = ctx.evaluate(ctx.example());
  assert.equal(r.ranked[0].burst.id, 'b1');
  assert.equal(r.notDemo.length, 1);
  assert.ok(r.combo.prob.p85 < r.real.p85);
});

// Worked example done by hand on the example data (see PR): 62 items / 1 per day = 62 d wait,
// 13.5 d process, LT 75.5 d, FE 17.9 %; burst "WIP limit" 25 -> 9 gives LT 59.5 d, P85 170 x 59.5 / 75.5 = 134.0 d.
test('example data matches the hand-computed future-state map', () => {
  const r = ctx.evaluate(ctx.example());
  near(r.now.wt, 62, 1e-9, 'total wait');
  near(r.now.pt, 13.5, 1e-9, 'total process');
  near(r.now.lt, 75.5, 1e-9, 'VSM lead time');
  near(r.now.fe, 0.1788, 0.0005, 'flow efficiency');
  const b1 = r.ranked.find(x => x.burst.id === 'b1').proj.prob;
  near(b1.lt, 59.5, 1e-9, 'future LT');
  near(b1.p85, 133.97, 0.01, 'projected P85');
  near(b1.gain85, 36.03, 0.01, 'P85 gain');
});
