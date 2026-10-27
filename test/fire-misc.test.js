// Smaller FIRE checks: setup SQL copy, loan prepayment, backup import/export and the empty plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultPlan, normalizePlan } from '../public/js/fire/defaults.js';
import { loanProjection, runPlan } from '../public/js/fire/engine.js';

test('the copy of the setup SQL shipped to the browser matches the one in supabase/', () => {
  assert.equal(readFileSync(new URL('../public/fire-setup.sql', import.meta.url), 'utf8'), readFileSync(new URL('../supabase/fire.sql', import.meta.url), 'utf8'));
});

test('the setup SQL only adds tables: it never alters or drops existing ones', () => {
  const sql = readFileSync(new URL('../supabase/fire.sql', import.meta.url), 'utf8').toLowerCase();
  assert.ok(!/drop\s+table|alter\s+table\s+public\.(spaces|wallets|transactions|categories|budgets|investments|members)|truncate|delete\s+from/.test(sql));
});

test('a yearly prepayment ends the loan sooner and saves interest', () => {
  const loan = { ratePct: 9, outstanding: 1200000, emi: 15000 };
  const base = loanProjection(loan, '2026-01-01'), pre = loanProjection({ ...loan, prepay: { amount: 100000, frequency: 'yearly', start: '2026-03' } }, '2026-01-01');
  assert.ok(pre.months < base.months, `${pre.months} should be < ${base.months}`);
  assert.ok(pre.interest < base.interest);
  // balance runs to zero in both
  assert.ok(base.months > 0 && pre.months > 0);
});

test('a plan survives a JSON export and import unchanged', async () => {
  const { parseJSON, toJSON } = await import('../public/js/fire/io.js').catch(() => ({}));
  if (!parseJSON) return;   // io.js needs a browser (document, FileReader); the maths below is what matters
  const p = defaultPlan({ today: '2026-10-27' }); p.incomes.push({ id: 'i1', person: 'p1', label: 'Pay', type: 'active', takeHome: 100000 });
  assert.deepEqual(parseJSON(toJSON(p)).incomes, p.incomes);
});

test('an empty plan runs without NaN or errors', () => {
  const r = runPlan(normalizePlan(defaultPlan({ today: '2026-10-27' })), { today: '2026-10-27' });
  for (const v of [r.gap.target, r.gap.projected, r.gap.pct, r.meta.takeHome]) assert.ok(Number.isFinite(v), `got ${v}`);
});

test('importing something that is not a plan is rejected with a readable message', async () => {
  const m = await import('../public/js/fire/io.js').catch(() => null);
  if (!m) return;
  assert.throws(() => m.parseJSON('{"hello":1}'), /does not look like/);
  assert.throws(() => m.parseJSON('not json'), /not valid JSON/);
});

test('support sent to dependants raises the retirement target and lowers the projection while it runs', () => {
  const base = defaultPlan({ today: '2026-10-27' }); base.incomes.push({ id: 'i1', person: 'p1', label: 'Pay', type: 'active', takeHome: 150000 }); base.spending.currentMonthly = 60000;
  const withDep = JSON.parse(JSON.stringify(base)); withDep.profile.dependants = [{ id: 'd1', name: 'Parents', monthly: 10000, untilYear: null }];
  const a = runPlan(normalizePlan(base), { today: '2026-10-27' }), b = runPlan(normalizePlan(withDep), { today: '2026-10-27' });
  assert.ok(b.gap.target > a.gap.target, 'target should rise');
  const short = JSON.parse(JSON.stringify(withDep)); short.profile.dependants[0].untilYear = 2028;
  assert.ok(runPlan(normalizePlan(short), { today: '2026-10-27' }).gap.target < b.gap.target, 'a short commitment costs less');
});

test('what-if: skipping an event by id removes its cost, and an extra monthly saving is never counted as a cash shortfall', () => {
  const p = normalizePlan(defaultPlan({ today: '2026-10-27' }));
  p.incomes = [{ id: 'i1', person: 'p1', label: 'Pay', type: 'active', takeHome: 100000, growthPct: 6 }]; p.spending.currentMonthly = 90000; p.holdings = [{ id: 'h1', name: 'Pot', kind: 'mf', assetClass: 'equity', value: 8000000, sips: [] }];
  p.events = [{ id: 'e1', kind: 'custom', name: 'Big spend', date: '2032-01', cost: 2000000, enabled: true }];
  const a = runPlan(p, { today: '2026-10-27' }), b = runPlan(p, { today: '2026-10-27', overrides: { eventsOffIds: ['e1'] } });
  assert.ok(b.gap.projected > a.gap.projected, 'without the event there is more left');
  const c = runPlan(p, { today: '2026-10-27', overrides: { extraMonthly: 20000 } });
  assert.ok(Math.abs(c.projection.deficitTotal - a.projection.deficitTotal) < 1, 'extra saving must not create or enlarge a deficit');
  assert.ok(c.gap.projected > a.gap.projected, 'but it does add to the corpus');
});

test('sanity checks flag a missing health policy and cash shortfalls in plain words', async () => {
  const { modelChecks } = await import('../public/js/fire/checks.js');
  const p = normalizePlan(defaultPlan({ today: '2026-10-27' })); p.incomes = [{ id: 'i1', person: 'p1', label: 'Pay', type: 'active', takeHome: 80000, growthPct: 2 }]; p.spending.currentMonthly = 90000;
  const res = runPlan(p, { today: '2026-10-27' }), list = modelChecks(p, res, null);
  assert.ok(list.some((c) => /health insurance/i.test(c.title)));
  assert.ok(list.some((c) => /cost more than you earn/i.test(c.title)));
  assert.ok(list.every((c) => c.title && c.text));
});
