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
  const text = paceLines(a, fmt).map((l) => l.parts.map((p) => (Array.isArray(p) ? p[1] : p)).join('') + ' ' + (l.detail || []).join(' ')).join(' | ');
  assert.match(text, /out of reach this month/); assert.match(text, /best still possible is/);
});

test('the two dashboard lines use the requested wording and precise figures', () => {
  const data = { categories: cats, budgets: [], transactions: [...flat('2026-10', 31, 2000), tx('income', '2026-10-02', 300000), ...flat('2026-11', 10, 1500)] };
  const a = paceAnalysis(data, '2026-11-10'), lines = paceLines(a, fmt), text = lines.map((l) => l.parts.map((p) => (Array.isArray(p) ? p[1] : p)).join(''));
  assert.equal(lines.length, 2);
  assert.match(text[0], /^Based on previous months' trend you spend about \$20\.00 per day and would save \$/);
  assert.match(text[0], /\(\d+\.\d%\) this month\.$/);
  assert.match(text[1], /^Based on this month's trend you are spending \$15\.00 per day so far\. To reach [\d.]+% savings, your best so far \(October\), spend about \$/);
  assert.match(text[1], /on everyday costs for the remaining 20 days\./);
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

// ---- subscriptions and loans must be counted once a month, however small or however much the date drifts ------------------------------------------------------
const cat5 = [{ id: 1, name: 'Housing' }, { id: 2, name: 'Food' }, { id: 3, name: 'Loans' }, { id: 5, name: 'Subscriptions' }];
const daily5 = (key, days) => Array.from({ length: days }, (_, i) => tx('expense', `${key}-${String(i + 1).padStart(2, '0')}`, 500000, 2));   // ₹5,000 a day: far bigger than a ₹649 plan
const subs = (rows) => [tx('income', '2026-09-02', 18000000), tx('income', '2026-10-02', 18000000), ...daily5('2026-09', 30), ...daily5('2026-10', 31), ...rows];

test('a small monthly subscription is one payment, not part of the daily spend', () => {
  const rows = subs([tx('expense', '2026-09-05', 64900, 5, 'Netflix'), tx('expense', '2026-10-05', 64900, 5, 'Netflix'), tx('expense', '2026-11-05', 64900, 5, 'Netflix'), ...daily5('2026-11', 10)]);
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: rows }, '2026-11-10'), n = a.commit.items.filter((c) => c.name === 'Netflix');
  assert.equal(n.length, 1); assert.equal(n[0].status, 'paid'); near(a.now.fixedPaid, 64900); near(a.now.everydayPerDay, 500000, 1e-6, 'Netflix is not in the daily figure');
  assert.equal(a.commit.upcoming.length, 0);
});

test('a charge that lands on different days each month is still one payment, and once paid it is not also "due"', () => {
  // Netflix on the 5th, 12th, then paid on the 9th this month; Claude billed in a slightly different amount each month
  const rows = subs([tx('expense', '2026-09-05', 64900, 5, 'Netflix'), tx('expense', '2026-10-12', 64900, 5, 'Netflix'), tx('expense', '2026-11-09', 64900, 5, 'Netflix'),
    tx('expense', '2026-09-03', 195000, 5, 'Claude'), tx('expense', '2026-10-04', 205000, 5, 'Claude'), tx('expense', '2026-11-04', 201000, 5, 'Claude'), ...daily5('2026-11', 10)]);
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: rows }, '2026-11-10');
  for (const name of ['Netflix', 'Claude']) { const items = a.commit.items.filter((c) => c.name === name); assert.equal(items.length, 1, `${name} should appear once`); assert.equal(items[0].status, 'paid'); }
  assert.equal(a.commit.upcoming.length, 0, 'nothing should be left as due'); near(a.now.upcoming, 0);
  near(a.now.fixedPaid, 64900 + 201000, 1e-9);
});

test('a loan whose date drifts by a week is one payment: paid this month means nothing more is due', () => {
  const rows = subs([tx('expense', '2026-09-03', 2468700, 3, 'Car loan EMI'), tx('expense', '2026-10-10', 2468700, 3, 'Car loan EMI'), tx('expense', '2026-11-07', 2468700, 3, 'Car loan EMI'), ...daily5('2026-11', 12)]);
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: rows }, '2026-11-12');
  assert.equal(a.commit.items.filter((c) => /EMI/.test(c.name)).length, 1); assert.equal(a.commit.upcoming.length, 0);
  const emi = a.cats.find((c) => c.id === 3); near(emi.proj, 2468700, 1e-9, 'the EMI is counted once in the month');
});

test('two different subscriptions of similar size in the same month stay separate', () => {
  const both = (m) => [tx('expense', `${m}-05`, 64900, 5, 'Netflix'), tx('expense', `${m}-20`, 59900, 5, 'Spotify')];
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: subs([...both('2026-09'), ...both('2026-10'), tx('expense', '2026-11-05', 64900, 5, 'Netflix'), ...daily5('2026-11', 10)]) }, '2026-11-10');
  assert.equal(a.commit.items.length, 2); assert.equal(a.commit.upcoming.length, 1); assert.equal(a.commit.upcoming[0].name, 'Spotify'); near(a.now.upcoming, 59900, 5000);
});

test('everyday small buys are not mistaken for subscriptions', () => {
  const coffee = (m, n) => Array.from({ length: n }, (_, i) => tx('expense', `${m}-${String(3 + i * 2).padStart(2, '0')}`, 15000, 2, 'Coffee'));
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: subs([...coffee('2026-09', 10), ...coffee('2026-10', 10), ...coffee('2026-11', 4)]) }, '2026-11-10');
  assert.equal(a.commit.items.length, 0);
});

// ---- the same payment entered twice (by hand and by a recurring rule) ---------------------------------------------------------------------------------
test('a payment entered twice in one month (by hand and by its recurring rule) is counted once and flagged', () => {
  const rows = subs([tx('expense', '2026-10-08', 64900, 5, 'Netflix'), tx('expense', '2026-11-08', 64900, 5, 'Netflix'), tx('expense', '2026-11-09', 64900, 5, 'Netflix'), ...daily5('2026-11', 10)]); rows[rows.length - 11].recurring_id = 7; rows[rows.length - 12].recurring_id = 7; rows[rows.length - 13].recurring_id = 7;
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: rows }, '2026-11-10');
  assert.equal(a.commit.items.filter((c) => c.name === 'Netflix').length, 1); near(a.now.fixedPaid, 64900, 1e-9, 'counted once');
  assert.equal(a.commit.dups.length, 1); near(a.now.spent, 10 * 500000 + 64900, 1e-9, 'the extra entry is left out of the spend');
  assert.match(paceAdvice(a, fmt).map((x) => `${x.title} ${x.text}`).join(' | '), /A payment looks entered twice[\s\S]*Netflix \$649\.00 on the 9th/);
});

test('a duplicate in a previous month does not inflate the usual daily spend', () => {
  const clean = subs([tx('expense', '2026-09-08', 64900, 5, 'Netflix'), tx('expense', '2026-10-08', 64900, 5, 'Netflix')]);
  const twice = subs([tx('expense', '2026-09-08', 64900, 5, 'Netflix'), tx('expense', '2026-10-08', 64900, 5, 'Netflix'), tx('expense', '2026-10-09', 64900, 5, 'Netflix')]);
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: [...clean, ...daily5('2026-11', 3)] }, '2026-11-03'), b = paceAnalysis({ categories: cat5, budgets: [], transactions: [...twice, ...daily5('2026-11', 3)] }, '2026-11-03');
  near(b.usual.perDay, a.usual.perDay, 1e-6); assert.equal(b.commit.dupsPrior.length, 1);
});

test('payments in the same category are matched by name, so two subscriptions never swap', () => {
  const rows = subs([tx('expense', '2026-09-05', 64900, 5, 'Netflix'), tx('expense', '2026-10-05', 64900, 5, 'Netflix'), tx('expense', '2026-09-20', 62000, 5, 'Hotstar'), tx('expense', '2026-10-20', 62000, 5, 'Hotstar'), tx('expense', '2026-11-20', 62000, 5, 'Hotstar'), ...daily5('2026-11', 22)]);
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: rows }, '2026-11-22');
  assert.equal(a.commit.items.find((c) => c.name === 'Hotstar').status, 'paid'); assert.equal(a.commit.items.find((c) => c.name === 'Netflix').status, 'late');
});

test('a note that repeats many times a month (groceries) is a habit, not a bill', () => {
  const groc = (m) => Array.from({ length: 14 }, (_, i) => tx('expense', `${m}-${String(2 + i * 2).padStart(2, '0')}`, 90000 + (i % 3) * 20000, 2, 'Groceries'));
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: [tx('income', '2026-10-02', 18000000), tx('income', '2026-09-02', 18000000), ...groc('2026-09'), ...groc('2026-10'), ...groc('2026-11').slice(0, 2)] }, '2026-11-05');
  assert.equal(a.commit.items.length, 0);
});

// ---- the entries are the truth: dates and names come from what was really logged ---------------------------------------------------------------------
test('a recurring rule decides when and how much is still to come, and a disagreement with past entries is flagged', () => {
  const cats = [{ id: 2, name: 'Food' }, { id: 3, name: 'Loans' }, { id: 6, name: 'Electricity' }, { id: 5, name: 'Subscriptions' }];
  const rows = [tx('income', '2026-10-02', 18000000), tx('income', '2026-09-02', 18000000), ...daily5('2026-09', 30), ...daily5('2026-10', 31),
    ...['2026-09', '2026-10'].flatMap((m) => [tx('expense', `${m}-10`, 2468700, 3, 'Car Loan payment'), tx('expense', `${m}-09`, 222200, 6, 'Claude'), tx('expense', `${m}-08`, 49900, 5, 'Netflix')]), ...daily5('2026-11', 2)];
  const rule = (i, cat, amt, note, next) => ({ id: i, active: true, type: 'expense', category_id: cat, amount_cents: amt, frequency: 'monthly', next_date: next, note });
  // the rules are set for the 21st (wrong) for the loan and the subscription, and correctly for the 9th for Claude
  const rules = [rule(1, 3, 2468700, 'Car Loan', '2026-11-21'), rule(2, 6, 222200, 'Claude', '2026-11-09'), rule(3, 5, 49900, 'Netflix', '2026-11-21')];
  const a = paceAnalysis({ categories: cats, budgets: [], recurring: rules, transactions: rows }, '2026-11-02'), by = (n) => a.commit.items.find((c) => c.name === n);
  assert.equal(by('Car Loan payment').day, 21, 'the rule is what will create the entry'); assert.equal(by('Car Loan payment').ruleInfo.conflict, true); assert.equal(by('Car Loan payment').ruleInfo.historyDay, 10);
  assert.equal(by('Claude').day, 9); assert.ok(!by('Claude').ruleInfo.conflict);
  assert.match(paceAdvice(a, fmt).map((x) => `${x.title} ${x.text}`).join(' | '), /rule is set for the 21st but your past entries landed on the 10th/);
  // once the rule is edited to the 10th the conflict goes away
  const fixed = paceAnalysis({ categories: cats, budgets: [], recurring: [rule(1, 3, 2468700, 'Car Loan', '2026-11-10'), rules[1], rule(3, 5, 49900, 'Netflix', '2026-11-08')], transactions: rows }, '2026-11-02');
  assert.equal(fixed.commit.items.find((c) => c.name === 'Car Loan payment').day, 10); assert.ok(!fixed.commit.items.some((c) => c.ruleInfo?.conflict));
});

test('a payment with no note takes its name from its tag, then its category', () => {
  const cats = [{ id: 2, name: 'Food' }, { id: 6, name: 'Electricity' }];
  const mk = (m) => { const t = tx('expense', `${m}-09`, 222200, 6, ''); t.tags = ['claude']; return t; };
  const a = paceAnalysis({ categories: cats, budgets: [], transactions: [tx('income', '2026-10-02', 18000000), ...daily5('2026-09', 30), ...daily5('2026-10', 31), mk('2026-09'), mk('2026-10'), ...daily5('2026-11', 2)] }, '2026-11-02');
  assert.equal(a.commit.items[0].name, 'Claude'); assert.equal(a.commit.items[0].day, 9);
});

test('the expected amount is the latest one, so a price rise is followed', () => {
  const a = paceAnalysis({ categories: cat5, budgets: [], transactions: subs([tx('expense', '2026-09-08', 44900, 5, 'Netflix'), tx('expense', '2026-10-08', 49900, 5, 'Netflix'), ...daily5('2026-11', 2)]) }, '2026-11-02');
  near(a.commit.items[0].amount, 49900, 1e-9);
});

// ---- recurring rules with periods: daily, weekly, custom ----------------------------------------------------------------------------------------------------
import { occurrencesIn } from '../public/js/pace.js';
test('a rule fires on its own schedule: weekly, every 2 weeks, every 3 months', () => {
  const r = (frequency, every, next) => ({ frequency, every, next_date: next });
  assert.deepEqual(occurrencesIn(r('weekly', 1, '2026-11-05'), '2026-11-01', '2026-11-30'), ['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26']);
  assert.deepEqual(occurrencesIn(r('weekly', 2, '2026-11-05'), '2026-11-01', '2026-11-30'), ['2026-11-05', '2026-11-19']);
  assert.deepEqual(occurrencesIn(r('monthly', 3, '2026-12-08'), '2026-11-01', '2026-11-30'), [], 'next due in December: nothing this month');
  assert.deepEqual(occurrencesIn(r('monthly', 1, '2026-11-30'), '2026-11-01', '2026-11-30'), ['2026-11-30']);
  assert.equal(occurrencesIn(r('daily', 1, '2026-11-10'), '2026-11-01', '2026-11-30').length, 21);
  assert.deepEqual(occurrencesIn(r('daily', 10, '2026-11-02'), '2026-11-01', '2026-11-30'), ['2026-11-02', '2026-11-12', '2026-11-22']);
});

test('a weekly rule adds every remaining occurrence, a paid one is found through its link, and nothing is due when the rule has moved on', () => {
  const rule = { id: 4, active: true, type: 'expense', category_id: 5, amount_cents: 20000, frequency: 'weekly', every: 1, next_date: '2026-11-12', note: 'Tuition' };
  const paid = tx('expense', '2026-11-05', 20000, 5, 'Tuition'); paid.recurring_id = 4;
  const a = paceAnalysis({ categories: cat5, budgets: [], recurring: [rule], transactions: subs([paid, ...daily5('2026-11', 8)]) }, '2026-11-08'), c = a.commit.items.find((x) => x.name === 'Tuition');
  assert.equal(c.count, 3); assert.deepEqual(c.pending, ['2026-11-12', '2026-11-19', '2026-11-26']); assert.equal(c.paidCount, 1); near(a.now.upcoming, 3 * 20000);
  const p = a.cum.proj; near(p[11] - p[10], 500000 + 20000, 1, 'a step on each due day'); near(p[18] - p[17], 500000 + 20000, 1);
  // a monthly rule that already created this month's entry has moved to next month: paid, nothing due
  const monthly = { id: 5, active: true, type: 'expense', category_id: 5, amount_cents: 49900, frequency: 'monthly', every: 1, next_date: '2026-12-05', note: 'Netflix' };
  const made = tx('expense', '2026-11-05', 49900, 5, 'Netflix'); made.recurring_id = 5;
  const b = paceAnalysis({ categories: cat5, budgets: [], recurring: [monthly], transactions: subs([made, ...daily5('2026-11', 8)]) }, '2026-11-08');
  assert.equal(b.commit.items.find((x) => x.name === 'Netflix').status, 'paid'); near(b.now.upcoming, 0);
  // and a rule moved away from this month leaves nothing to count
  const moved = paceAnalysis({ categories: cat5, budgets: [], recurring: [{ ...monthly, next_date: '2026-12-20' }], transactions: subs(daily5('2026-11', 8)) }, '2026-11-08');
  assert.ok(!moved.commit.items.some((x) => x.name === 'Netflix'));
});
