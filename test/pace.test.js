// Spending pace analytics: expected numbers are worked out by hand from small, fully known data sets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStats, skewLabel, paceAnalysis, paceLines, paceAdvice, catAdvice, skewInsight, catInsight } from '../public/js/pace.js';

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
  assert.match(text, /out of reach this month/); assert.match(text, /best still possible is/);
});

test('the two dashboard lines use the requested wording and precise figures', () => {
  const data = { categories: cats, budgets: [], transactions: [...flat('2026-10', 31, 2000), tx('income', '2026-10-02', 300000), ...flat('2026-11', 10, 1500)] };
  const a = paceAnalysis(data, '2026-11-10'), lines = paceLines(a, fmt), text = lines.map((l) => l.parts.map((p) => (Array.isArray(p) ? p[1] : p)).join(''));
  assert.equal(lines.length, 2);
  assert.match(text[0], /^Based on previous months' trend you spend about \$20\.00 per day and would save \$/);
  assert.match(text[0], /\(\d+\.\d%\) this month\.$/);
  assert.match(text[1], /^Based on this month's trend your everyday spending is \$15\.00 per day\. To reach [\d.]+% savings, your best so far \(October\), keep everyday spending to about \$/);
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

// ---- fixed payments, one-offs and what is still to come ------------------------------------------------------------------------------------
const cat3 = [{ id: 1, name: 'Housing', icon: '🏠' }, { id: 2, name: 'Food', icon: '🍽️' }, { id: 3, name: 'Loans', icon: '🏦' }, { id: 4, name: 'Bills', icon: '💡' }];
const on = (key, d) => `${key}-${String(d).padStart(2, '0')}`;
const base = (extra = []) => [tx('income', '2026-09-02', 500000), tx('income', '2026-10-02', 500000),
  tx('expense', '2026-09-01', 80000, 1, 'Rent'), tx('expense', '2026-10-01', 80000, 1, 'Rent'), tx('expense', '2026-09-15', 30000, 3, 'Car EMI'), tx('expense', '2026-10-15', 30000, 3, 'Car EMI'),
  ...flat('2026-09', 30, 1000, 2), ...flat('2026-10', 31, 1000, 2), ...extra];

test('rent paid on the 1st is counted once, not spread over the days left', () => {
  const data = { categories: cat3, budgets: [], transactions: base([tx('expense', '2026-11-01', 80000, 1, 'Rent'), ...flat('2026-11', 10, 1000, 2)]) };
  const a = paceAnalysis(data, '2026-11-10'), rent = a.commit.items.find((c) => c.name === 'Rent');
  assert.equal(rent.status, 'paid'); assert.equal(rent.day, 1);
  near(a.now.fixedPaid, 80000, 1e-9); near(a.now.everydayPerDay, 1000, 1e-9);
  // spent 80000 + 10000; EMI of 30000 still due on the 15th; 20 everyday days at 1000
  near(a.now.spent, 90000, 1e-9); near(a.now.upcoming, 30000, 1e-9);
  near(a.now.projSpend, 90000 + 30000 + 20 * 1000, 1);
  const naive = (a.now.spent / 10) * 30; assert.ok(a.now.projSpend < naive - 20000, 'a naive per-day projection would overshoot');
});

test('a payment that has not happened yet is added on its own date, as a step in the projection', () => {
  const data = { categories: cat3, budgets: [], transactions: base([tx('expense', '2026-11-01', 80000, 1, 'Rent'), ...flat('2026-11', 10, 1000, 2)]) };
  const a = paceAnalysis(data, '2026-11-10'), emi = a.commit.items.find((c) => c.name === 'Car EMI');
  assert.equal(emi.status, 'upcoming'); assert.equal(emi.day, 15); assert.equal(emi.dueIn, 5);
  const p = a.cum.proj; near(p[14] - p[13], 1000 + 30000, 1, 'jump on the 15th'); near(p[13] - p[12], 1000, 1, 'ordinary day before it');
  const adv = paceAdvice(a, fmt).map((x) => `${x.title}: ${x.text}`).join(' | ');
  assert.match(adv, /Car EMI \$300\.00 on the 15th \(in 5 days\)/); assert.match(adv, /Already paid, not repeated: \$800\.00 of fixed payments \(Rent/);
  // the everyday spend needed leaves room for the EMI
  const t = a.target; near(t.perDayNeeded, (t.spend - 90000 - 30000 - a.now.reserve) / 20, 1e-6);
});

test('the analysis updates as spends occur: paying the EMI moves it from due to paid and the projection stays consistent', () => {
  const rows = base([tx('expense', '2026-11-01', 80000, 1, 'Rent'), ...flat('2026-11', 10, 1000, 2)]);
  const before = paceAnalysis({ categories: cat3, budgets: [], transactions: rows }, '2026-11-10');
  const after = paceAnalysis({ categories: cat3, budgets: [], transactions: [...rows, ...flat('2026-11', 5, 1000, 2).map((t, i) => ({ ...t, date: on('2026-11', 11 + i), id: id++ })), tx('expense', '2026-11-15', 30000, 3, 'Car EMI')] }, '2026-11-15');
  assert.equal(after.commit.items.find((c) => c.name === 'Car EMI').status, 'paid'); assert.equal(after.commit.upcoming.length, 0); near(after.now.upcoming, 0);
  assert.ok(Math.abs(after.now.projSpend - before.now.projSpend) < 1500, `projection should barely move when the spend lands as expected (${before.now.projSpend} -> ${after.now.projSpend})`);
});

test('an expected payment that has not appeared by its date is flagged late but still counted', () => {
  const data = { categories: cat3, budgets: [], transactions: base([tx('expense', '2026-11-01', 80000, 1, 'Rent'), ...flat('2026-11', 18, 1000, 2)]) };
  const a = paceAnalysis(data, '2026-11-18'), emi = a.commit.items.find((c) => c.name === 'Car EMI');
  assert.equal(emi.status, 'late'); near(a.now.upcoming, 30000);
  assert.match(paceAdvice(a, fmt).map((x) => x.text).join(' '), /expected around the 15th, not seen yet/);
});

test('a single previous month is enough when a payment carries a recurring tag', () => {
  const rows = [tx('income', '2026-10-02', 500000), tx('expense', '2026-10-05', 40000, 4, 'Internet'), ...flat('2026-10', 31, 1000, 2)]; rows[1].recurring_id = 9;
  const a = paceAnalysis({ categories: cat3, budgets: [], transactions: [...rows, ...flat('2026-11', 3, 1000, 2)] }, '2026-11-03');
  const c = a.commit.items.find((x) => x.name === 'Internet'); assert.ok(c && c.source === 'recurring' && c.status === 'upcoming' && c.day === 5);
  const without = paceAnalysis({ categories: cat3, budgets: [], transactions: [...rows.map((r) => ({ ...r, recurring_id: null })), ...flat('2026-11', 3, 1000, 2)] }, '2026-11-03');
  assert.equal(without.commit.items.length, 0, 'one month of a plain payment is not enough to call it recurring');
});

test('a one-off purchase is excluded from the daily pace, and a reserve covers the ones that usually come later', () => {
  const oct = [...flat('2026-10', 31, 1000, 2), tx('expense', '2026-10-20', 25000, 2, 'Phone'), tx('income', '2026-10-02', 500000)];
  const now = [...flat('2026-11', 10, 1000, 2), tx('expense', '2026-11-04', 30000, 2, 'Laptop')];
  const a = paceAnalysis({ categories: cat3, budgets: [], transactions: [...oct, ...now] }, '2026-11-10');
  near(a.now.everydayPerDay, 1000 * 10 / 10 + 0, 50); assert.equal(a.commit.lumps.length, 1); near(a.commit.lumps[0].amount, 30000);
  assert.ok(a.now.reserve === 0, 'this month already had a bigger one-off than usual, so no more is reserved');
  assert.match(paceAdvice(a, fmt).map((x) => x.text).join(' '), /Laptop\) on the 4th/);
  const early = paceAnalysis({ categories: cat3, budgets: [], transactions: [...oct, ...flat('2026-11', 10, 1000, 2)] }, '2026-11-10');
  assert.ok(early.now.reserve > 0, 'nothing big yet this month, so some room is set aside for the usual late one');
});

test("the household's own recurring rules say what is coming even with no history", () => {
  const data = { categories: cat3, budgets: [], recurring: [{ id: 1, active: true, type: 'expense', category_id: 4, amount_cents: 50000, frequency: 'monthly', next_date: '2026-11-22', note: 'Insurance' }], transactions: [...flat('2026-10', 31, 1000, 2), tx('income', '2026-10-02', 500000), ...flat('2026-11', 5, 1000, 2)] };
  const a = paceAnalysis(data, '2026-11-05'), c = a.commit.items.find((x) => x.name === 'Insurance');
  assert.ok(c && c.status === 'upcoming' && c.day === 22 && c.amount === 50000); near(a.now.upcoming, 50000);
});

test('category view: the loan category carries its own due date and the budget room left for everyday spending', () => {
  const data = { categories: cat3, transactions: base([tx('expense', '2026-11-01', 80000, 1, 'Rent'), ...flat('2026-11', 10, 1000, 2)]) };
  const budgets = { items: [{ category_id: 3, period: 'monthly', limit_cents: 40000 }, { category_id: 2, period: 'monthly', limit_cents: 40000 }], overall: null };
  const a = paceAnalysis(data, '2026-11-10', { budgets }), loan = a.cats.find((c) => c.id === 3), food = a.cats.find((c) => c.id === 2), house = a.cats.find((c) => c.id === 1);
  assert.equal(loan.upcoming.length, 1); near(loan.proj, 30000, 1e-9); assert.equal(loan.status, 'ok');
  near(house.fixedPaid, 80000); near(house.proj, 80000, 1e-9, 'rent is not extrapolated');
  near(food.proj, 10000 + 20 * 1000, 1e-6); assert.equal(food.status, 'ok');
  assert.match(catAdvice(loan, fmt, a).map((x) => x.text).join(' '), /Car EMI \$300\.00 on the 15th \(in 5 days\)/);
  assert.match(catAdvice(house, fmt, a).map((x) => x.text).join(' '), /Rent \$800\.00 on the 1st already paid/);
});
