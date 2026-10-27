// Reads the shared Duet data (income, expenses, wallets, budgets, investments) and turns it into planner inputs.
// Read-only: nothing here writes to Duet. Duet stores amounts in paise/cents, so everything is divided by 100.
import { state as app } from '../store.js';
import { walletBalances } from '../domain.js';
import { SPEND_BUCKETS } from './defaults.js';

const monthOf = (d) => d.slice(0, 7);
const addMonthKey = (key, n) => { const [y, m] = key.split('-').map(Number); const i = y * 12 + m - 1 + n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
export const hasDuet = () => !!app.data?.space;
export const duetCurrency = () => app.data?.space?.currency || 'INR';

export const categoryNames = () => [...new Set((app.data?.categories || []).filter((c) => c.kind === 'expense' && !c.archived).map((c) => c.name))].sort();
export function bucketOf(plan, catName) {
  const map = plan.spending?.mapping || {};
  if (map[catName]) return map[catName];
  return SPEND_BUCKETS.find((b) => b.duet.includes(catName))?.id || 'leisure';
}
export function investWalletIds(plan) {
  const set = plan.settings?.investWalletIds;
  if (Array.isArray(set)) return new Set(set.map(Number));
  return new Set((app.data?.wallets || []).filter((w) => w.type === 'savings').map((w) => w.id));
}

function monthsForPeriod(today, period) {
  const cur = monthOf(today), y = today.slice(0, 4);
  if (period === 'q') { const m = Number(cur.slice(5)); const q0 = Math.floor((m - 1) / 3) * 3 + 1; return Array.from({ length: m - q0 + 1 }, (_, i) => `${y}-${String(q0 + i).padStart(2, '0')}`); }
  if (period === 'ytd') return Array.from({ length: Number(cur.slice(5)) }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  if (period === '12m') return Array.from({ length: 12 }, (_, i) => addMonthKey(cur, i - 11));
  return [cur];
}

/** Per-month income, expenses and invested amounts, in rupees, for the chosen period. */
export function duetStats(plan, today, period = 'm') {
  const data = app.data; if (!data) return { months: [], totals: { income: 0, expense: 0, invested: 0, byBucket: {} }, avg: { income: 0, expense: 0, invested: 0, byBucket: {} }, hasData: false };
  const keys = monthsForPeriod(today, period), inv = investWalletIds(plan);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const months = keys.map((key) => ({ key, income: 0, expense: 0, invested: 0, byBucket: {}, byIncomeCat: {} }));
  const idx = new Map(months.map((m, i) => [m.key, i]));
  for (const t of data.transactions) {
    const i = idx.get(monthOf(t.date)); if (i == null) continue; const m = months[i], r = t.amount_cents / 100;
    if (t.type === 'income') { m.income += r; const n = cats.get(t.category_id)?.name || 'Other income'; m.byIncomeCat[n] = (m.byIncomeCat[n] || 0) + r; }
    else if (t.type === 'expense') { m.expense += r; const b = bucketOf(plan, cats.get(t.category_id)?.name || 'Other'); m.byBucket[b] = (m.byBucket[b] || 0) + r; }
    else if (t.type === 'transfer' && inv.has(t.to_wallet_id) && !inv.has(t.wallet_id)) m.invested += r;
  }
  const sum = (f) => months.reduce((s, m) => s + f(m), 0);
  const withData = months.filter((m) => m.income || m.expense || m.invested);
  const n = Math.max(1, withData.length || 1);
  const bucketTotals = {}; for (const m of months) for (const [b, v] of Object.entries(m.byBucket)) bucketTotals[b] = (bucketTotals[b] || 0) + v;
  const incomeCats = {}; for (const m of months) for (const [c, v] of Object.entries(m.byIncomeCat)) incomeCats[c] = (incomeCats[c] || 0) + v;
  const totals = { income: sum((m) => m.income), expense: sum((m) => m.expense), invested: sum((m) => m.invested), byBucket: bucketTotals, byIncomeCat: incomeCats };
  const avg = { income: totals.income / n, expense: totals.expense / n, invested: totals.invested / n, byBucket: Object.fromEntries(Object.entries(bucketTotals).map(([b, v]) => [b, v / n])), byIncomeCat: Object.fromEntries(Object.entries(incomeCats).map(([c, v]) => [c, v / n])) };
  return { months, totals, avg, monthsWithData: withData.length, savingsRate: totals.income ? (totals.income - totals.expense) / totals.income : null, hasData: withData.length > 0 };
}

/** Average over the last N completed months (falls back to this month so far). */
export function duetAverage(plan, today, n = 3) {
  const cur = monthOf(today); const keys = Array.from({ length: n }, (_, i) => addMonthKey(cur, -(i + 1)));
  const st = duetStats(plan, `${keys[0]}-15`, '12m'); const picked = st.months.filter((m) => keys.includes(m.key) && (m.income || m.expense));
  if (!picked.length) { const m = duetStats(plan, today, 'm'); return { ...m.avg, months: m.monthsWithData }; }
  const k = picked.length, sum = (f) => picked.reduce((s, m) => s + f(m), 0), byBucket = {}, byIncomeCat = {};
  for (const m of picked) { for (const [b, v] of Object.entries(m.byBucket)) byBucket[b] = (byBucket[b] || 0) + v / k; for (const [c, v] of Object.entries(m.byIncomeCat)) byIncomeCat[c] = (byIncomeCat[c] || 0) + v / k; }
  return { income: sum((m) => m.income) / k, expense: sum((m) => m.expense) / k, invested: sum((m) => m.invested) / k, byBucket, byIncomeCat, months: k };
}

export const duetWallets = () => (app.data ? walletBalances(app.data).map((w) => ({ id: w.id, name: w.name, type: w.type, balance: w.balance_cents / 100, color: w.color })) : []);
export const duetInvestments = () => (app.data?.investments || []).map((i) => ({ id: i.id, symbol: i.symbol, name: i.name || i.symbol, kind: i.kind, quantity: Number(i.quantity), price: i.price_cents / 100, value: Math.round(Number(i.quantity) * i.price_cents) / 100, cost: i.cost_cents / 100 }));
export function duetBudgets(plan) {
  const cats = new Map((app.data?.categories || []).map((c) => [c.id, c])); const out = {};
  for (const b of app.data?.budgets || []) { if (b.period !== 'monthly') continue; const bucket = bucketOf(plan, cats.get(b.category_id)?.name || 'Other'); out[bucket] = (out[bucket] || 0) + b.amount_cents / 100; }
  return out;
}
export function savingsTrend(plan, today, n = 10) {
  const st = duetStats(plan, today, '12m'); const rows = st.months.slice(-n);
  return rows.map((m) => ({ key: m.key, label: 'JFMAMJJASOND'[Number(m.key.slice(5)) - 1], rate: m.income ? (m.income - m.expense) / m.income : null }));
}

/** Changes the planner could take from Duet, as {group,label,from,to,apply(plan)} so the person picks what to apply. */
export function proposals(plan, today) {
  if (!hasDuet()) return [];
  const out = [], av = duetAverage(plan, today, 3), rs = (v) => Math.round(v);
  // income
  for (const inc of plan.incomes || []) {
    if (!inc.duetCategory) continue; const to = rs(av.byIncomeCat?.[inc.duetCategory] || 0); if (!to || to === Number(inc.takeHome)) continue;
    out.push({ id: 'inc_' + inc.id, group: 'Income', label: `${inc.label} take-home`, from: inc.takeHome, to, apply: (p) => { const i = p.incomes.find((x) => x.id === inc.id); if (i) { i.takeHome = to; i.source = 'duet'; } } });
  }
  if (!(plan.incomes || []).length && av.income > 0) out.push({ id: 'inc_new', group: 'Income', label: 'Monthly take-home (from Duet income)', from: 0, to: rs(av.income), apply: (p) => { p.incomes.push({ id: 'inc_' + Date.now().toString(36), person: p.profile.people[0].id, label: 'Salary', type: 'active', takeHome: rs(av.income), growthPct: p.assumptions.salaryGrowth ?? 8, source: 'duet', sourceTag: 'Salary' }); } });
  // spending by bucket
  const cur = Object.fromEntries((plan.spending.categories || []).map((c) => [c.id, c]));
  for (const b of SPEND_BUCKETS) {
    const to = rs(av.byBucket?.[b.id] || 0); const old = cur[b.id]; if (!to && !old) continue; if (old && old.source === 'manual') continue; if (old && rs(old.monthly) === to) continue;
    out.push({ id: 'sp_' + b.id, group: 'Spending', label: b.name, from: old?.monthly ?? 0, to, apply: (p) => { const list = p.spending.categories; const i = list.findIndex((c) => c.id === b.id); const row = { id: b.id, name: b.name, icon: b.icon, group: b.group, color: b.color, monthly: to, source: 'duet' }; if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row); p.spending.currentMonthly = list.reduce((s, c) => s + (Number(c.monthly) || 0), 0); } });
  }
  // linked assets
  const wallets = duetWallets(), invs = duetInvestments();
  for (const h of plan.holdings || []) {
    if (h.linkedWalletId != null) { const w = wallets.find((x) => x.id === h.linkedWalletId); const to = w ? rs(w.balance) : null; if (to != null && to !== rs(h.value)) out.push({ id: 'hw_' + h.id, group: 'Assets', label: `${h.name} (wallet ${w.name})`, from: h.value, to, apply: (p) => { const x = p.holdings.find((y) => y.id === h.id); if (x) x.value = to; } }); }
    if (h.linkedInvestmentId != null) { const i = invs.find((x) => x.id === h.linkedInvestmentId); const to = i ? rs(i.value) : null; if (to != null && to !== rs(h.value)) out.push({ id: 'hi_' + h.id, group: 'Assets', label: `${h.name} (Portfolio ${i.symbol})`, from: h.value, to, apply: (p) => { const x = p.holdings.find((y) => y.id === h.id); if (x) { x.value = to; x.invested = rs(i.cost); } } }); }
  }
  return out;
}
export const applyProposals = (plan, list) => { const p = JSON.parse(JSON.stringify(plan)); for (const x of list) x.apply(p); return p; };
