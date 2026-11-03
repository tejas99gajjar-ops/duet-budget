// Coherence checks: every number the app shows about pace must agree with every other number, on many different households.
// A small seeded generator builds realistic histories (rent, EMIs, subscriptions, groceries, one-offs, income) and checks identities, not just examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paceAnalysis, paceLines, paceAdvice, catAdvice } from '../public/js/pace.js';

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const cats = [{ id: 1, name: 'Housing', icon: '🏠' }, { id: 2, name: 'Food', icon: '🍽️' }, { id: 3, name: 'Loans', icon: '🏦' }, { id: 4, name: 'Bills', icon: '💡' }, { id: 5, name: 'Subscriptions', icon: '📺' }, { id: 6, name: 'Shopping', icon: '🛍️' }];
const pad = (n) => String(n).padStart(2, '0');
function household(seed, today) {
  const r = rng(seed), rows = []; let id = 1;
  const tx = (type, date, c, cat, note = '', rid = null) => rows.push({ id: id++, type, date, amount_cents: Math.round(c), category_id: cat, note, recurring_id: rid, time: '12:00', tags: [] });
  const [ty, tm] = today.split('-').map(Number), dom = Number(today.slice(8));
  const monthsBack = 1 + Math.floor(r() * 4), rent = 800000 + Math.floor(r() * 1e6), emi = 1500000 + Math.floor(r() * 2e6), netflix = 30000 + Math.floor(r() * 50000);
  const rentDay = 1 + Math.floor(r() * 5), emiDay = 5 + Math.floor(r() * 20), subDay = 3 + Math.floor(r() * 25), salary = 15000000 + Math.floor(r() * 10000000);
  for (let b = monthsBack; b >= 0; b--) {
    const d0 = new Date(Date.UTC(ty, tm - 1 - b, 1)), y = d0.getUTCFullYear(), m = d0.getUTCMonth() + 1, dim = new Date(Date.UTC(y, m, 0)).getUTCDate(), key = `${y}-${pad(m)}`;
    const last = b === 0 ? dom : dim, on = (d) => d <= last;
    if (on(1)) tx('income', `${key}-02`, salary, 1);
    if (on(rentDay)) tx('expense', `${key}-${pad(rentDay)}`, rent, 1, 'Rent');
    if (on(emiDay + Math.floor(r() * 3))) tx('expense', `${key}-${pad(Math.min(dim, emiDay + Math.floor(r() * 3)))}`, emi, 3, 'Car loan');
    if (on(subDay)) tx('expense', `${key}-${pad(subDay)}`, netflix * (1 + (r() - 0.5) * 0.04), 5, 'Netflix');
    for (let d = 1; d <= last; d++) { if (r() < 0.7) tx('expense', `${key}-${pad(d)}`, 20000 + r() * 90000, 2, 'Groceries'); if (r() < 0.12) tx('expense', `${key}-${pad(d)}`, 100000 + r() * 400000, 6, 'Shopping'); }
  }
  return rows;
}
const budgets = { items: [{ category_id: 2, period: 'monthly', limit_cents: 3000000 }, { category_id: 6, period: 'monthly', limit_cents: 1200000 }, { category_id: 1, period: 'monthly', limit_cents: 3000000 }], overall: null };
let FAILS = new Map(); const near = (a, b, tol, m) => { if (!(Math.abs(a - b) <= tol)) { const k = m.replace(/^seed \d+ \S+ /, ''); FAILS.set(k, (FAILS.get(k) || 0) + 1); if (!FAILS.has('first ' + k)) FAILS.set('first ' + k, `${m}: ${a} vs ${b}`); } };
const okk = (c, m) => { if (!c) { const k = m.replace(/^seed \d+ \S+ /, ''); FAILS.set(k, (FAILS.get(k) || 0) + 1); if (!FAILS.has('first ' + k)) FAILS.set('first ' + k, m); } };
const TODAYS = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-02-27', '2026-03-31'];

test('across many households and dates, the numbers add up and agree', () => {
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) for (const today of TODAYS) {
    const a = paceAnalysis({ categories: cats, recurring: [], transactions: household(seed, today) }, today, { budgets });
    if (!a.ok) continue; checked++; const n = a.now, tag = `seed ${seed} ${today}`;
    // the month-end figure is exactly what is shown as its parts
    near(n.projSpend, n.spent + n.upcoming + n.reserve + n.blendPerDay * a.left, 1, `${tag} projection identity`);
    // spent splits cleanly
    near(n.fixedPaid + n.oneOffs + n.everydaySpent, n.spent, 1, `${tag} spent = fixed + one-offs + everyday`);
    // budget by budget adds up to the overall month-end, spent and still-due figures
    near(a.cats.reduce((s, c) => s + c.proj, 0), n.projSpend, 1, `${tag} categories add up to the projection`);
    near(a.cats.reduce((s, c) => s + c.spent, 0), n.spent, 1, `${tag} categories add up to spent`);
    near(a.cats.reduce((s, c) => s + c.upcomingSum, 0), n.upcoming, 1, `${tag} categories add up to still due`);
    near(a.cats.reduce((s, c) => s + c.reserve, 0), n.reserve, 1, `${tag} categories add up to the reserve`);
    // the chart ends where the numbers say
    near(a.cum.proj[a.dim - 1], n.projSpend, 1, `${tag} projection path ends at the projection`); if (a.left > 0) near(a.cum.proj[a.day - 1], n.spent, 1, `${tag} projection path starts at spent`);
    if (a.usual && a.cum.prior[a.dim - 1] != null) near(a.cum.prior[a.dim - 1], a.usual.spend, 1, `${tag} usual-month curve ends at the usual month`);
    // status agrees with savings: on track exactly when the projected savings reach the best rate
    if (a.target) { const reaches = n.projSpend <= a.target.spend + 1; if (a.target.status === 'on-track') okk(reaches, `${tag} on-track must reach the best rate`); if (a.target.status === 'tight') okk(!reaches, `${tag} tight must fall short`); if (a.target.status === 'passed') okk(a.target.afterBills <= 0, `${tag} passed means no room left`);
      if (a.target.perDayNeeded != null && a.left > 0) { near(a.target.perDayNeeded * a.left, a.target.allowance > 0 ? a.target.allowance : a.target.afterBills, 1, `${tag} per-day times days = room`); } }
    // never negative, never NaN
    for (const v of [n.spent, n.upcoming, n.reserve, n.projSpend, n.everydayPerDay, n.blendPerDay]) okk(Number.isFinite(v) && v >= -1e-6, `${tag} finite and not negative: ${v}`);
    for (const c of a.cats) { okk(c.low <= c.proj + 1 && c.high >= c.proj - 1, `${tag} range surrounds the projection`); okk(c.proj >= c.spent - 1, `${tag} cannot project below what is already spent`); }
  }
  assert.ok(checked > 150, `only ${checked} cases were checked`);
  const report = [...FAILS.entries()].filter(([k]) => !k.startsWith('first ')).map(([k, n]) => `${n}x ${k} (e.g. ${FAILS.get('first ' + k)})`);
  assert.equal(report.length, 0, '\n' + report.join('\n'));
});

test('every number in the sentences is the same number the screen shows', () => {
  const money = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const nums = (t) => [...t.matchAll(/\$([\d,]+\.\d\d)/g)].map((m) => Math.round(Number(m[1].replace(/,/g, '')) * 100));
  const has = (text, v, label) => assert.ok(nums(text).some((x) => Math.abs(x - Math.round(v)) <= 1), `${label}: ${money(v)} should appear in "${text}"`);
  for (const [seed, today] of [[3, '2026-11-09'], [8, '2026-11-02'], [12, '2026-11-20'], [21, '2026-11-14']]) {
    const a = paceAnalysis({ categories: cats, recurring: [], transactions: household(seed, today) }, today, { budgets }); if (!a.ok) continue;
    const text = paceLines(a, money).map((l) => l.parts.map((p) => (Array.isArray(p) ? p[1] : p)).join('') + ' ' + (l.detail || []).join(' '));
    if (a.usual) { has(text[0], a.usual.perDay, 'usual per day'); if (a.usual.everyday < a.usual.perDay - 1) has(text[0], a.usual.everyday, 'usual everyday per day'); if (a.usual.saves != null) has(text[0], a.usual.saves, 'usual savings'); }
    if (a.target && text[1]) { has(text[1], a.now.perDay, 'spending per day so far'); if (a.now.fixedPaid + a.now.oneOffs > 0) has(text[1], a.now.everydayPerDay, 'everyday per day'); if (a.target.status !== 'passed' && a.left > 0) has(text[1], a.now.blendPerDay, 'expected everyday pace'); if (a.target.status !== 'passed' && a.left > 0) assert.match(text[1], new RegExp(`${(a.now.projRate * 100).toFixed(1)}%`)); if (a.target.status !== 'passed' && a.left > 0) has(text[1], a.target.perDayNeeded, 'needed per day'); if (a.now.fixedPaid > 0) has(text[1], a.now.fixedPaid, 'fixed paid'); if (a.now.upcoming > 0 && a.target.status !== 'passed') has(text[1], a.now.upcoming, 'still due'); }
    const adv = paceAdvice(a, money).find((x) => /heading/.test(x.title)); if (adv) { has(adv.text, a.now.spent, 'spent'); has(adv.text, a.now.projSpend, 'projected spend'); has(adv.text, a.now.blendPerDay * a.left + a.now.reserve, 'still to come'); if (a.now.upcoming > 0) has(adv.text, a.now.upcoming, 'still due in heading'); }
    for (const c of a.cats.slice(0, 3)) { const t = catAdvice(c, money, a).map((x) => x.text).join(' '); if (c.limit != null) has(t, c.limit, `${c.name} budget`); if (c.status === 'over') has(t, c.overBy, `${c.name} over by`); }
  }
});

test('dates and wording about what is due are right: days away, status and ordering', () => {
  for (let seed = 1; seed <= 30; seed++) for (const today of ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-26']) {
    const a = paceAnalysis({ categories: cats, recurring: [], transactions: household(seed, today) }, today, { budgets }); if (!a.ok) continue;
    for (const c of a.commit.items) {
      if (c.status === 'paid') continue;
      assert.equal(c.dueIn, c.day - a.day, `${c.name}: days away`);
      assert.equal(c.status, c.dueIn > 0 ? 'upcoming' : c.dueIn === 0 ? 'today' : 'late', `${c.name} status for ${c.dueIn} days`);
      assert.ok(c.date.startsWith(a.curKey) && Number(c.date.slice(8)) === Math.min(c.day, a.dim), `${c.name}: date matches its day`);
    }
    const days = a.commit.items.map((c) => c.day); assert.deepEqual(days, [...days].sort((x, y) => x - y), 'payments are listed in date order');
  }
});
