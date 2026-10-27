// Monte Carlo: deterministic limits, reproducibility and sanity of the distribution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan } from '../public/js/fire/defaults.js';
import { buildModel, runPlan } from '../public/js/fire/engine.js';
import { runMonteCarlo, successByAge, rng } from '../public/js/fire/mc.js';

function plan(value, patch = {}) {
  const p = defaultPlan({ today: '2026-01-01' });
  p.profile.people[0] = { ...p.profile.people[0], birthYear: 1996, retireAge: 36 }; p.profile.horizonAge = 66;
  p.assumptions.inflation = { general: 0, medical: 0, education: 0, housing: 0 }; p.assumptions.taxPct = 0; p.assumptions.inflationVol = 0;
  p.assumptions.returns = { ...p.assumptions.returns, equity: 10, debt: 5 }; p.assumptions.retirementAllocation = { debt: 100 };
  p.spending = { currentMonthly: 0, categories: [], mapping: {}, retirement: { monthly: 10000, shares: { general: 1, medical: 0, education: 0, housing: 0 } } };
  p.holdings = [{ id: 'h', name: 'Equity', kind: 'mf', assetClass: 'equity', value, sips: [] }];
  return Object.assign(p, patch);
}
const M = (p, o = {}) => buildModel(p, { today: '2026-01-01', ...o });
const quiet = { paths: 400, seed: 7, includeEvents: false, sequenceRisk: true };

test('with no randomness the answer is all-or-nothing and matches the deterministic plan', () => {
  for (const [value, expectOk] of [[4000000, true], [300000, false]]) {
    const p = plan(value); for (const k of Object.keys(p.assumptions.vol)) p.assumptions.vol[k] = 0;
    const det = runPlan(p, { today: '2026-01-01' });
    const r = runMonteCarlo(M(p), quiet);
    assert.equal(r.success, expectOk ? 1 : 0, `value ${value}`);
    assert.equal(det.post.runsOutAge == null, expectOk);
  }
});

test('same seed gives identical results; a different seed gives a different path set', () => {
  const p = plan(2000000);
  const a = runMonteCarlo(M(p), { ...quiet, seed: 5 }), b = runMonteCarlo(M(p), { ...quiet, seed: 5 }), c = runMonteCarlo(M(p), { ...quiet, seed: 6 });
  assert.equal(a.success, b.success); assert.equal(a.corpusAtRetirement.p50, b.corpusAtRetirement.p50);
  assert.notEqual(a.corpusAtRetirement.p50, c.corpusAtRetirement.p50);
});

test('more starting money means a higher chance of success', () => {
  const s = [1000000, 2000000, 4000000].map((v) => runMonteCarlo(M(plan(v)), { ...quiet, paths: 1500 }).success);
  assert.ok(s[0] < s[1] && s[1] < s[2] + 1e-9, `success rates ${s}`); assert.ok(s[2] > 0.9);
});

test('percentiles are ordered and the median sits below the mean-return projection (volatility drag)', () => {
  const p = plan(2000000), r = runMonteCarlo(M(p), { ...quiet, paths: 2000 }), c = r.corpusAtRetirement;
  assert.ok(c.p10 <= c.p25 && c.p25 <= c.p50 && c.p50 <= c.p75 && c.p75 <= c.p90);
  assert.ok(c.p50 < runPlan(p, { today: '2026-01-01' }).gap.projected, 'median below deterministic');
  assert.equal(r.fan.p50.length, r.fan.years.length); assert.ok(r.fan.p10.every((v, i) => v <= r.fan.p90[i] + 1e-3));
});

test('higher equity volatility widens the spread', () => {
  const p = plan(2000000), a = runMonteCarlo(M(p), { ...quiet, paths: 1500, equityVol: 8 }), b = runMonteCarlo(M(p), { ...quiet, paths: 1500, equityVol: 25 });
  assert.ok(b.corpusAtRetirement.p90 - b.corpusAtRetirement.p10 > a.corpusAtRetirement.p90 - a.corpusAtRetirement.p10);
});

test('random medical shocks lower the success rate; sequence-risk switch is accepted', () => {
  const p = plan(2300000); const off = runMonteCarlo(M(p), { ...quiet, paths: 2000 }), on = runMonteCarlo(M(p), { ...quiet, paths: 2000, includeEvents: true });
  assert.ok(on.success <= off.success + 0.02);
  const noSeq = runMonteCarlo(M(p), { ...quiet, paths: 500, sequenceRisk: false }); assert.ok(noSeq.success >= 0 && noSeq.success <= 1);
});

test('success rises with retirement age and 10,000 paths run in a few seconds', () => {
  const p = plan(2000000); p.profile.people[0].birthYear = 1990;
  const t0 = Date.now(); const big = runMonteCarlo(M(p, { retireAge: 45 }), { paths: 10000, seed: 3, includeEvents: true, sequenceRisk: true }); const ms = Date.now() - t0;
  assert.ok(ms < 20000, `10k paths took ${ms}ms`);
  const s = successByAge(p, { today: '2026-01-01' }, { seed: 4, includeEvents: false, pathsPerAge: 600 }, 45, 52);
  assert.ok(s[s.length - 1].success >= s[0].success, 'later retirement is at least as safe');
  assert.ok(big.paths === 10000);
});

test('seeded generator is uniform enough', () => {
  const r = rng(42); let s = 0; for (let i = 0; i < 100000; i++) s += r(); assert.ok(Math.abs(s / 100000 - 0.5) < 0.01);
});
