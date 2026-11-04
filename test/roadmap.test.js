import test from 'node:test';
import assert from 'node:assert/strict';
import { samplePlan } from './harness/sample-plan.js';
import { defaultPlan, normalizePlan } from '../public/js/fire/defaults.js';
import { roadmap, roadmapScenarios, splitRow, runPlan } from '../public/js/fire/engine.js';

const T = '2026-11-04';
const mk = (mut) => { const p = normalizePlan({ ...defaultPlan({ today: T }), ...samplePlan() }); p.spending.retirement = { ...(p.spending.retirement || {}), monthly: 450000 }; mut?.(p); return p; };   // a bigger retirement lifestyle, so there is a gap to close
const plans = { sample: mk(), withPartnerScenario: mk((p) => { p.scenarios = [...(p.scenarios || []), { id: 'pw', name: 'Partner works more', icon: '👩', overrides: { partnerWorks: { startYear: 2029, monthly: 40000, growthPct: 5 }, incomeGrowthDeltaPct: 1 } }]; }) };

test('the amount the roadmap gives really closes the gap, in every scenario and for every start year', () => {
  for (const [pname, plan] of Object.entries(plans)) for (const { scenario, R } of roadmapScenarios(plan, { today: T })) {
    if (R.gap <= 0) continue;
    const ok = R.rows.filter((r) => r.extra != null); assert.ok(ok.length >= 3, `${pname}/${scenario.id}: rows`);
    for (let i = 1; i < ok.length; i++) assert.ok(ok[i].extra > ok[i - 1].extra, `${pname}/${scenario.id}: later start must need more`);
    for (const r of ok) {
      const res = runPlan(plan, { today: T, scenarioId: scenario.id, overrides: { extraMonthly: r.extra / Math.pow(1 + R.st, r.k), extraStartYears: r.k } });
      assert.ok(Math.abs(res.gap.amount) < Math.max(5000, R.gap * 0.002), `${pname}/${scenario.id} start +${r.k}y leaves gap ${res.gap.amount}`);
    }
  }
});

test('the spending cut closes the gap too', () => {
  for (const { scenario, R } of roadmapScenarios(plans.sample, { today: T })) {
    if (R.gap <= 0 || R.spendCut == null) continue;
    const res = runPlan(plans.sample, { today: T, scenarioId: scenario.id, overrides: { spendCutMonthly: R.spendCut } });
    assert.ok(Math.abs(res.gap.amount) < Math.max(5000, R.gap * 0.002), `${scenario.id}: ${res.gap.amount}`);
  }
});

test('splitting between people never changes the household total', () => {
  const R = roadmap(plans.sample, { today: T });
  for (const row of R.rows) for (const shares of [undefined, { p1: 1, p2: 0 }, { p1: 0.25, p2: 0.75 }, { p1: 0, p2: 1 }]) {
    const rows = row.persons.length === 2 || !shares ? splitRow(row, shares) : null; if (!rows) continue;
    assert.ok(Math.abs(rows.reduce((s, x) => s + x.extra, 0) - row.extra) < 1e-6);
    assert.ok(Math.abs(rows.reduce((s, x) => s + x.spendCut, 0) - row.spendCut) < 1e-6);
    assert.ok(Math.abs(rows.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
  }
  const d = splitRow(R.rows[0]), pay = R.rows[0].persons.map((p) => p.pay), tot = pay[0] + pay[1];
  assert.ok(Math.abs(d[0].share - pay[0] / tot) < 1e-9, 'default split follows pay');
});

test('pay and SIP figures match what the engine itself uses, year by year', () => {
  // the engine's household income also counts passive income (rent, dividends) before retirement; "pay" here is work income only, so compare on a plan without passive income
  for (const [pname, plan0] of Object.entries(plans)) for (const sid of ['base', 'pw']) {
    const plan = JSON.parse(JSON.stringify(plan0)); for (const i of plan.incomes) if (i.type === 'passive' || i.continuesPostRetirement) i.include = false;
    const res = runPlan(plan, { today: T, scenarioId: sid }), R = roadmap(plan, { today: T, scenarioId: sid }), M = res.model, f0 = (12 - (Number(T.slice(5, 7)) - 1)) / 12;
    const k0 = R.at(0), meta = res.meta;
    assert.ok(Math.abs(k0.sipThen - meta.sipNow) < 0.5, `${pname}/${sid}: SIPs today ${k0.sipThen} vs ${meta.sipNow}`);
    for (let k = 1; k <= Math.min(R.maxYears, 12); k++) {
      const row = R.at(k), nom = Math.pow(1 + M.infl, f0 + k - 0.5) / 12;
      const eng = M.holdings.filter((x) => !x.virtual).reduce((s, x) => s + x.contribReal[k], 0) * nom;
      assert.ok(Math.abs(row.sipThen - eng) <= Math.max(1, eng * 0.003), `${pname}/${sid} year +${k}: SIP ${row.sipThen} vs engine ${eng}`);
      const engPay = M.incomeReal[k] * nom;   // engine household income of the year (active pay)
      assert.ok(Math.abs(row.income - engPay) <= Math.max(1, engPay * 0.003), `${pname}/${sid} year +${k}: pay ${row.income} vs engine ${engPay}`);
    }
  }
});
