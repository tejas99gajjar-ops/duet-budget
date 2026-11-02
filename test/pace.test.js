// Spending pace analytics: expected numbers are worked out by hand from small, fully known data sets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStats, skewLabel, paceAnalysis, paceLines, skewInsight, catInsight } from '../public/js/pace.js';

const near = (a, b, tol = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} expected ${b} got ${a}`);
const fmt = (c) => `$${(c / 100).toFixed(2)}`;
let id = 1;
const tx = (type, date, cents, category_id = 1, note = '') => ({ id: id++, type, date, amount_cents: cents, category_id, note, time: '12:00' });
const cats = [{ id: 1, name: 'Food', icon: '🍽️', color: '#f90' }, { id: 2, name: 'Fun', icon: '🎭', color: '#09f' }];
/** Spends `perDay` cents on each day 1..days of a month. */
const flat = (key, days, perDay, cat = 1) => Array.from({ length: days }, (_, i) => tx('expense', `${key}-${String(i + 1).padStart(2, '0')}`, perDay, cat));

test('day statistics: mean, median, skew sign and spike detection', () => {
  const steady = dayStats([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
  near(steady.mean, 100); near(steady.median, 100); near(steady.skew, 0); assert.equal(steady.spikeDays, 0); assert.equal(skewLabel(steady), 'steady');
  const spiky = dayStats([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 500, 500]);
  assert.ok(spiky.skew > 1, `skew ${spiky.skew}`); assert.equal(spiky.spikeDays, 2); near(spiky.spikeShare, 1000 / 1180, 1e-9); assert.equal(spiky.median, 10); assert.equal(skewLabel(spiky), 'spiky');
  const low = dayStats([500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 10, 10]);
  assert.ok(low.skew < -1, 'a few very low days give negative skew');
  assert.equal(dayStats([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50]).zeroDays, 10);
  assert.equal(dayStats([]), null);
});

test('usual month: recency-weighted per-day spend, income and the savings it implies', () => {
  // today = 2026-11-10. Previous months: Oct (31 days) $20/day, income $3000; Sep (30 days) $10/day, income $2000.
  const data = { categories: cats, budgets: [], transactions: [...flat('2026-10', 31, 2000), ...flat('2026-09', 30, 1000), tx('income', '2026-10-02', 300000), tx('income', '2026-09-02', 200000)] };
  const a = paceAnalysis(data, '2026-11-10');
  assert.equal(a.prior.length, 2); assert.equal(a.prior[0].key, '2026-10');
  // weights: Oct 1, Sep .75  ->  (20 + 7.5) / 1.75 per day
  near(a.usual.perDay, ((2000 + 0.75 * 1000) / 1.75), 1e-9);
  near(a.usual.income, (300000 + 0.75 * 200000) / 1.75, 1e-6);
  near(a.usual.spend, a.usual.perDay * 30, 1e-6);                  // November has 30 days
  near(a.usual.saves, a.usual.income - a.usual.spend, 1e-6); near(a.usual.rate, a.usual.saves / a.usual.income, 1e-12);
});

test('best savings rate so far, and the daily spend that repeats it', () => {
  // Oct: spend 20*31=620 (cents*100) income 3000 -> rate (3000-620)/3000 ; Sep: 10*30=300, income 2000 -> 0.85 (best)
  const data = { categories: cats, budgets: [], transactions: [...flat('2026-10', 31, 2000), ...flat('2026-09', 30, 1000), tx('income', '2026-10-02', 300000), tx('income', '2026-09-02', 200000), ...flat('2026-11', 10, 1500)] };
  const a = paceAnalysis(data, '2026-11-10');
  assert.equal(a.best.key, '2026-09'); near(a.best.rate, 0.85, 1e-12);
  assert.equal(a.left, 20); near(a.now.perDay, 1500, 1e-9); near(a.now.spent, 15000, 1e-9);
  const expIncome = a.usual.income;                                // no income yet this month, so the typical income is used
  near(a.now.expIncome, expIncome, 1e-6); assert.equal(a.now.incomeBasis, 'typical');
  const targetSpend = expIncome * 0.15; near(a.target.spend, targetSpend, 1e-6);
  near(a.target.perDayNeeded, (targetSpend - 15000) / 20, 1e-6);
  assert.equal(a.target.status, a.now.perDay <= a.target.perDayNeeded ? 'on-track' : 'tight');
});

test('when the best rate is already out of reach the line says so and gives the best still possible', () => {
  const data = { categories: cats, budgets: [], transactions: [...flat('2026-10', 31, 1000), tx('income', '2026-10-02', 100000), ...flat('2026-11', 12, 9000)] };   // Oct saves 69%; Nov already spent 1080
  const a = paceAnalysis(data, '2026-11-12'); assert.equal(a.target.status, 'passed');
  const text = paceLines(a, fmt).map((l) => l.parts.map((p) => (Array.isArray(p) ? p[1] : p)).join('')).join(' | ');
  assert.match(text, /out of reach this month/); assert.match(text, /spend nothing more/);
});

test('the two dashboard lines use the requested wording and precise figures', () => {
  const data = { categories: cats, budgets: [], transactions: [...flat('2026-10', 31, 2000), tx('income', '2026-10-02', 300000), ...flat('2026-11', 10, 1500)] };
  const a = paceAnalysis(data, '2026-11-10'), lines = paceLines(a, fmt), text = lines.map((l) => l.parts.map((p) => (Array.isArray(p) ? p[1] : p)).join(''));
  assert.equal(lines.length, 2);
  assert.match(text[0], /^Based on previous months' trend you spend about \$20\.00 per day and would save \$/);
  assert.match(text[0], /\(\d+\.\d%\) this month\.$/);
  assert.match(text[1], /^Based on this month's trend you are spending \$15\.00 per day\. To reach [\d.]+% savings, your best so far \(October\), spend about \$/);
  assert.match(text[1], /for the remaining 20 days\./);
});

test('the first, part-covered month only counts the days the app was in use', () => {
  // app first used on Oct 21: Oct covers 11 days ($10/day), so per day must be $10, not $10*11/31
  const data = { categories: cats, budgets: [], transactions: [...flat('2026-10', 31, 1000).slice(20)] };
  const a = paceAnalysis(data, '2026-11-05'); assert.equal(a.prior[0].days, 11); near(a.prior[0].perDay, 1000, 1e-9);
});

test('a spiky month is told apart from a steady one and the plan reserves room for the big days', () => {
  const spikes = []; for (let d = 1; d <= 30; d++) spikes.push(tx('expense', `2026-10-${String(d).padStart(2, '0')}`, d === 8 || d === 22 ? 60000 : 500, 2));
  const data = { categories: cats, budgets: [], transactions: [...spikes, tx('income', '2026-10-02', 400000), ...flat('2026-11', 5, 800, 2)] };
  const a = paceAnalysis(data, '2026-11-05'); assert.ok(a.skewPrior.skew > 1); assert.equal(skewLabel(a.skewPrior), 'spiky');
  const ins = skewInsight(a.skewPrior, fmt, a.spikePlan); assert.equal(ins.icon, '🎢'); assert.match(ins.text, /big days? makes? up \d+%/);
  const steady = paceAnalysis({ categories: cats, budgets: [], transactions: [...flat('2026-10', 31, 1000), tx('income', '2026-10-02', 300000)] }, '2026-11-05');
  assert.equal(skewInsight(steady.skewPrior, fmt).icon, '✅');
});

test('categories: projection, range, budget status and ranking', () => {
  // Food usual $10/day (Oct), this month $30/day for 10 days -> credibility w = 10/20 = .5 -> rate .5*3000+.5*1000 = 2000 -> proj 30000 + 2000*20
  const data = { categories: cats, transactions: [...flat('2026-10', 31, 1000, 1), ...flat('2026-10', 31, 100, 2), tx('income', '2026-10-02', 300000), ...flat('2026-11', 10, 3000, 1), ...flat('2026-11', 10, 100, 2)] };
  const budgets = { items: [{ category_id: 1, period: 'monthly', limit_cents: 60000 }, { category_id: 2, period: 'monthly', limit_cents: 9000 }], overall: null };
  const a = paceAnalysis(data, '2026-11-10', { budgets }), food = a.cats.find((c) => c.id === 1), fun = a.cats.find((c) => c.id === 2);
  near(food.proj, 30000 + 2000 * 20, 1e-6); assert.equal(food.status, 'over'); near(food.overBy, 70000 - 60000, 1e-6);
  assert.equal(fun.status, 'ok'); assert.equal(a.cats[0].id, 1, 'the category that will overshoot ranks first');
  assert.ok(food.high >= food.proj && food.low <= food.proj && food.low >= food.spent);
  near(food.change, 3000 / 1000 - 1, 1e-9); assert.match(catInsight(food, fmt, a.left), /pass the \$600\.00 budget by \$100\.00/);
  near(fun.safePerDay, (9000 - 1000) / 20, 1e-9);
});

test('no history, no crash', () => {
  assert.equal(paceAnalysis({ categories: [], transactions: [] }, '2026-11-10').ok, false);
  const onlyNow = paceAnalysis({ categories: cats, budgets: [], transactions: flat('2026-11', 4, 500) }, '2026-11-04');
  assert.equal(onlyNow.ok, true); assert.equal(onlyNow.hasPrior, false); assert.equal(onlyNow.usual, undefined);
  assert.equal(paceLines(onlyNow, fmt).length, 1);
});

test('speed: a large history is analysed in a few milliseconds', () => {
  const rows = []; for (let m = 1; m <= 10; m++) for (let d = 1; d <= 28; d++) for (let k = 0; k < 6; k++) rows.push(tx(k === 0 ? 'income' : 'expense', `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 500 + ((d * k * 37) % 4000), 1 + (k % 2)));
  const t0 = performance.now(); const a = paceAnalysis({ categories: cats, budgets: [], transactions: rows }, '2026-10-20'); const ms = performance.now() - t0;
  assert.ok(a.ok && ms < 60, `took ${ms.toFixed(1)} ms for ${rows.length} transactions`);
});
