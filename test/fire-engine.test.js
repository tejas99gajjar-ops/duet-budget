// FIRE engine: every expected number below is worked out by hand (or by a closed-form formula) independently of the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan } from '../public/js/fire/defaults.js';
import { runPlan, buildModel, loanProjection, emiFor, nper, closeGap, ageGrid, earliestAge, sensitivity, compareScenarios, eventImpacts, targetFromModel } from '../public/js/fire/engine.js';

const near = (a, b, tol = 1, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} got ${a} (diff ${a - b})`);
const ZERO_INFL = { general: 0, medical: 0, education: 0, housing: 0 };

/** A plan with no inflation so the arithmetic is checkable with a calculator. Retire at 36 in 2032, horizon 66. */
function simplePlan(patch = {}) {
  const p = defaultPlan({ today: '2026-01-01' });
  p.profile.people[0] = { ...p.profile.people[0], birthYear: 1996, retireAge: 36 };
  p.profile.horizonAge = 66;
  p.assumptions.inflation = { ...ZERO_INFL };
  p.assumptions.returns = { ...p.assumptions.returns, debt: 5, equity: 10 };
  p.assumptions.retirementAllocation = { debt: 100 };
  p.assumptions.taxPct = 0; p.assumptions.redirectFreedEmi = false;
  p.spending = { currentMonthly: 0, categories: [], mapping: {}, retirement: { monthly: 10000, shares: { general: 1, medical: 0, education: 0, housing: 0 } }, oneOffsExcluded: [] };
  p.holdings = [{ id: 'h1', name: 'Equity', kind: 'mf', assetClass: 'equity', value: 1000000, returnPct: 10, sips: [] }];
  return Object.assign(p, patch);
}
const run = (p, o = {}) => runPlan(p, { today: '2026-01-01', ...o });

test('projected corpus compounds a lump sum: 10 lakh at 10% for 6 years', () => {
  const r = run(simplePlan());
  near(r.gap.projected, 1000000 * Math.pow(1.1, 6), 0.5);
  assert.equal(r.meta.retireYear, 2032); assert.equal(r.meta.yearsToRet, 6);
});

test('target corpus = present value of 30 years of withdrawals (annuity due) at the retirement real return', () => {
  const r = run(simplePlan());
  const expected = 120000 * ((1 - Math.pow(1.05, -30)) / 0.05) * 1.05;
  near(r.target.total, expected, 1);
  assert.equal(r.target.rows.length, 30); assert.equal(r.target.rows[0].age, 36);
  near(r.target.classic[3.5], 120000 / 0.035, 1);
});

test('SIP contributions follow the end-of-year-plus-half-year formula (no inflation)', () => {
  const p = simplePlan(); p.holdings = [{ id: 'h1', name: 'SIP', kind: 'mf', assetClass: 'equity', value: 0, returnPct: 12, sips: [{ id: 's1', amount: 10000, frequency: 'monthly', start: '2026-01', status: 'active' }] }];
  const r = run(p);
  const expected = 120000 * Math.pow(1.12, 0.5) * ((Math.pow(1.12, 6) - 1) / 0.12);
  near(r.gap.projected, expected, 1);
});

test('SIP step-up grows each year; a paused SIP adds nothing', () => {
  const p = simplePlan(); p.holdings = [{ id: 'h1', name: 'SIP', kind: 'mf', assetClass: 'equity', value: 0, returnPct: 0, sips: [{ id: 's1', amount: 1000, start: '2026-01', stepUpPct: 10, status: 'active' }] }];
  near(run(p).gap.projected, 12000 * (1 + 1.1 + 1.21 + 1.331 + 1.4641 + 1.61051), 1);
  p.holdings[0].sips[0].status = 'paused'; assert.equal(run(p).gap.projected, 0);
});

test('inflation: nominal returns are deflated to real terms', () => {
  const p = simplePlan(); p.assumptions.inflation = { general: 6, medical: 6, education: 6, housing: 6 }; p.holdings[0].returnPct = 12;
  near(run(p).gap.projected, 1000000 * Math.pow(1.12 / 1.06, 6), 1);
});

test('partial first year: July start has half a year of SIP months', () => {
  const p = simplePlan(); p.holdings = [{ id: 'h1', kind: 'mf', assetClass: 'equity', value: 0, returnPct: 0, sips: [{ id: 's', amount: 10000, start: '2026-01' }] }];
  const r = runPlan(p, { today: '2026-07-01' });
  assert.equal(r.model.contribReal ?? 0, 0);
  near(r.model.holdings[0].contribReal[0], 60000, 0.01);        // Jul..Dec = 6 months
  near(r.model.holdings[0].contribReal[1], 120000, 0.01);
});

test('household deficit before retirement is drawn from the retirement corpus', () => {
  const p = simplePlan(); p.holdings[0].returnPct = 0; p.spending.currentMonthly = 10000; p.incomes = [{ id: 'i0', person: 'p1', label: 'None', takeHome: 0, growthPct: 0 }];   // income modelled but zero
  const r = run(p); near(r.gap.projected, 1000000 - 6 * 120000, 1); near(r.projection.deficitTotal, 720000, 1);
});

test('surplus is only counted when "invest surplus" is on', () => {
  const p = simplePlan(); p.holdings[0].returnPct = 0; p.incomes = [{ id: 'i1', person: 'p1', label: 'Salary', takeHome: 20000, growthPct: 0 }]; p.spending.currentMonthly = 10000;
  near(run(p).gap.projected, 1000000, 1);                         // idle surplus ignored
  p.assumptions.investSurplus = true; near(run(p).gap.projected, 1000000 + 6 * 120000, 1);
});

test('loan maths: EMI formula, months to repay, interest, moratorium', () => {
  const emi = emiFor(1000000, 12, 12); near(emi, 88848.79, 0.01);
  near(nper(0.01, emi, 1000000), 12, 1e-6);
  const lp = loanProjection({ outstanding: 1000000, ratePct: 12, emi }, '2026-01-01');
  assert.equal(lp.months, 12); assert.equal(lp.end, '2026-12'); near(lp.interest, emi * 12 - 1000000, 1);
  // interest-only payment during a 12-month moratorium: balance stays at principal when payment equals interest
  const mo = loanProjection({ outstanding: 1000000, ratePct: 12, currentPayment: 10000, emiStart: '2027-01', tenureMonths: 12 }, '2026-01-01');
  near(mo.balanceAtEmiStart, 1000000, 0.01); assert.equal(mo.moratoriumMonths, 12); near(mo.emi, emiFor(1000000, 12, 12), 0.01);
});

test('loan EMI is an outflow and a freed EMI is redirected into saving when it ends', () => {
  const p = simplePlan(); p.holdings[0].returnPct = 0; p.assumptions.redirectFreedEmi = true; p.assumptions.returns.equity = 0;
  p.incomes = [{ id: 'i1', person: 'p1', label: 'Salary', takeHome: 50000, growthPct: 0 }];
  p.loans = [{ id: 'l1', name: 'Car', outstanding: 120000, ratePct: 0, emi: 10000, status: 'active' }];       // 12 payments: Jan..Dec 2026
  const m = buildModel(p, { today: '2026-01-01' });
  near(m.loanReal[0], 120000, 0.01); near(m.loanReal[1], 0, 0.01);
  near(m.freedReal[0], 0, 0.01); near(m.freedReal[1], 120000, 0.01);        // 2027 onwards the EMI is invested
});

test('goals: funded share, status and required monthly saving', () => {
  const p = simplePlan(); p.holdings = [{ id: 'h1', kind: 'mf', assetClass: 'equity', value: 500000, returnPct: 0, goalSplit: { g_edu: 100 }, sips: [] }];
  p.goals.push({ id: 'g_edu', kind: 'education', name: 'College', target: 1000000, date: '2036-01', inflationGroup: 'education', priority: 2 });
  const g = run(p).goals.find((x) => x.id === 'g_edu');
  near(g.needed, 1000000, 0.5); near(g.funded, 500000, 0.5); near(g.pct, 0.5, 1e-9); assert.equal(g.status, 'behind');
  near(g.requiredMonthly, 500000 / 120 / 1, 4000, 'roughly 4.2k a month over 10 years at a modest return');
  assert.equal(run(p).goals.find((x) => x.kind === 'retirement').funded, 0, 'earmarked money is not double counted in retirement');
});

test('emergency fund target is buffer months of spending and is funded by cash', () => {
  const p = simplePlan(); p.spending.currentMonthly = 20000; p.assumptions.bufferMonths = 6;
  p.holdings = [{ id: 'c', kind: 'cash', assetClass: 'cash', value: 60000, sips: [] }];
  p.goals.push({ id: 'g_em', kind: 'emergency', name: 'Emergency fund', priority: 3 });
  const g = run(p).goals.find((x) => x.kind === 'emergency'); near(g.needed, 120000, 0.5); near(g.funded, 60000, 0.5); near(g.pct, 0.5, 1e-9);
});

test('closeGap: each lever closes the gap when applied', () => {
  const p = simplePlan(); p.holdings[0].value = 600000; p.incomes = [{ id: 'i1', person: 'p1', label: 'Salary', takeHome: 80000, growthPct: 0 }]; p.spending.currentMonthly = 30000;
  const base = run(p); assert.ok(base.gap.amount > 0, 'plan starts with a shortfall');
  const c = closeGap(p, { today: '2026-01-01' });
  near(run(p, { overrides: { extraMonthly: c.extraMonthly } }).gap.amount, 0, 2, 'extra monthly saving');
  near(run(p, { overrides: { spendCutMonthly: c.lowerSpend } }).gap.amount, 0, 2, 'lower spending');
  assert.ok(c.laterAge > base.meta.retireAge); assert.ok(run(p, { retireAge: c.laterAge }).gap.amount <= 0); assert.ok(run(p, { retireAge: c.laterAge - 1 }).gap.amount > 0);
  const p2 = { ...p, holdings: [{ ...p.holdings[0], sips: [{ id: 's', amount: 5000, start: '2026-01', stepUpPct: 0 }] }] };
  const c2 = closeGap(p2, { today: '2026-01-01' }); if (c2.earnMoreDelta != null) assert.ok(run(p2, { overrides: { incomeGrowthDeltaPct: c2.earnMoreDelta } }).gap.amount <= 1);
});

test('retirement-age grid: later age means a smaller gap; earliest working age is found', () => {
  const p = simplePlan(); p.holdings[0].value = 2000000; p.profile.people[0].birthYear = 1990; p.profile.people[0].retireAge = 45; p.profile.horizonAge = 85;
  const g = ageGrid(p, { today: '2026-01-01' }, 45, 60);
  for (let i = 1; i < g.length; i++) assert.ok(g[i].gap < g[i - 1].gap, 'gap shrinks as retirement is delayed');
  const e = earliestAge(g); if (e) { assert.ok(g.find((x) => x.age === e).gap <= 0); }
});

test('scenarios: pessimistic is worse than base, optimistic is better', () => {
  const p = simplePlan(); p.holdings[0].sips = [{ id: 's', amount: 20000, start: '2026-01', stepUpPct: 8 }]; p.incomes = [{ id: 'i1', person: 'p1', label: 'Salary', takeHome: 100000, growthPct: 8 }]; p.spending.currentMonthly = 40000;
  const s = Object.fromEntries(compareScenarios(p, { today: '2026-01-01' }).map((x) => [x.scenario.id, x]));
  assert.ok(s.pessimistic.gap > s.base.gap, 'pessimistic gap larger'); assert.ok(s.optimistic.gap < s.base.gap, 'optimistic gap smaller');
});

test('sensitivity ranks levers by swing and event impacts are signed', () => {
  const p = simplePlan(); p.holdings[0].sips = [{ id: 's', amount: 20000, start: '2026-01' }]; p.incomes = [{ id: 'i1', person: 'p1', label: 'Salary', takeHome: 100000, growthPct: 0 }]; p.spending.currentMonthly = 40000;
  p.events = [{ id: 'e1', kind: 'custom', name: 'Big purchase', date: '2029-06', cost: 500000, enabled: true }];
  const t = sensitivity(p, { today: '2026-01-01' }); for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].swing >= t[i].swing);
  const imp = eventImpacts(p, { today: '2026-01-01' })[0]; assert.ok(imp.impact < 0, 'a cost event lowers the corpus');
});

test('life event toggles: disabling a cost event removes its outflow', () => {
  const p = simplePlan(); p.holdings[0].returnPct = 0; p.incomes = [{ id: 'i1', person: 'p1', label: 'S', takeHome: 50000, growthPct: 0 }]; p.assumptions.investSurplus = true;
  p.events = [{ id: 'e1', kind: 'custom', date: '2028-03', cost: 100000, enabled: true }];
  const on = run(p).gap.projected; p.events[0].enabled = false; const off = run(p).gap.projected; near(off - on, 100000, 1);
});

test('passive income (rent) offsets retirement spending', () => {
  const p = simplePlan(); p.incomes = [{ id: 'r', person: 'p1', label: 'Rent', takeHome: 5000, growthPct: 0, type: 'passive' }];
  const t = targetFromModel(buildModel(p, { today: '2026-01-01' }));
  near(t.rows[0].passive, 60000, 0.01); near(t.rows[0].net, 120000 - 60000, 0.01);
});

test('tax gross-up raises withdrawals: 30% tax on 35% gain share = 10.5%', () => {
  const p = simplePlan(); p.assumptions.taxPct = 30; p.assumptions.gainSharePct = 35;
  const t = targetFromModel(buildModel(p, { today: '2026-01-01' })); near(t.rows[0].gross, 120000 * 1.105, 0.01);
});

test('"money runs out" age is reported after retirement', () => {
  const p = simplePlan(); p.holdings[0].value = 500000; p.holdings[0].returnPct = 0;
  const r = run(p); assert.ok(r.post.runsOutAge > 36 && r.post.runsOutAge < 66);
});
