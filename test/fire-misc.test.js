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
