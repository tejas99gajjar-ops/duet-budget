// Pure budget / analytics logic over in-memory rows (ported from the original SQL-backed server so the maths is unchanged).
// data = { space, members:[{id,name,email,color}], wallets, categories, transactions, budgets, recurring, investments, activity }
import * as Dt from './dates.js';

const total = (rows, type) => rows.reduce((s, t) => s + (t.type === type ? t.amount_cents : 0), 0);
const between = (data, from, to) => data.transactions.filter((t) => t.date >= from && t.date <= to);
const catMap = (data) => new Map(data.categories.map((c) => [c.id, c]));
const sumBy = (rows, key, type) => { const m = new Map(); for (const t of rows) if (t.type === type) m.set(t[key], (m.get(t[key]) || 0) + t.amount_cents); return m; };
export const sortTx = (rows) => [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.time < b.time ? 1 : a.time > b.time ? -1 : b.id - a.id));

const signed = (t, walletId) => t.type === 'income' ? t.amount_cents : t.type === 'expense' ? -t.amount_cents : (t.wallet_id === walletId ? -t.amount_cents : t.amount_cents);

export function walletBalances(data) {
  const wallets = data.wallets.filter((w) => !w.archived);
  const bal = new Map(wallets.map((w) => [w.id, { balance: w.initial_cents, count: 0 }]));
  for (const t of data.transactions) {
    const a = bal.get(t.wallet_id); if (a) { a.balance += signed(t, t.wallet_id); a.count++; }
    if (t.type === 'transfer') { const b = bal.get(t.to_wallet_id); if (b) { b.balance += signed(t, t.to_wallet_id); b.count++; } }
  }
  return wallets.map((w) => ({ id: w.id, name: w.name, type: w.type, color: w.color, initial_cents: w.initial_cents, balance_cents: bal.get(w.id).balance, tx_count: bal.get(w.id).count }));
}

export function shapeTx(data, t) {
  const c = data.categories.find((x) => x.id === t.category_id), w = data.wallets.find((x) => x.id === t.wallet_id), w2 = data.wallets.find((x) => x.id === t.to_wallet_id);
  return { id: t.id, type: t.type, amount_cents: t.amount_cents, wallet_id: t.wallet_id, to_wallet_id: t.to_wallet_id, category_id: t.category_id, note: t.note, tags: t.tags || [],
    date: t.date, time: t.time, status: t.status, created_by: t.created_by, recurring_id: t.recurring_id, pending_sync: !!t.pending_sync,
    category: c ? { name: c.name, icon: c.icon, color: c.color } : null, wallet_name: w?.name, to_wallet_name: w2?.name, user_name: data.members.find((m) => m.id === t.created_by)?.name };
}

export function evalBudget(data, b, today, mode = 'period', weekStart = 0) {
  const cat = data.categories.find((c) => c.id === b.category_id);
  const spentIn = (from, to) => { const r = data.transactions.filter((t) => t.type === 'expense' && t.category_id === b.category_id && t.date >= from && t.date <= to); return { s: r.reduce((a, t) => a + t.amount_cents, 0), c: r.length }; };
  let limit = b.amount_cents, win, left = null, safe = null;
  if (mode === 'all') { limit = b.amount_cents * Dt.periodsElapsed(b.period, b.start_date, today); win = { start: b.start_date, end: today }; }
  else {
    win = Dt.periodWindow(b.period, today, weekStart);
    if (b.rollover) { const pw = Dt.previousWindow(b.period, win); if (pw.end >= b.start_date) limit += Math.max(0, b.amount_cents - spentIn(pw.start, pw.end).s); }
    left = Dt.daysLeft(b.period, today, win);
  }
  const { s: spent, c: count } = spentIn(win.start, win.end);
  const remaining = limit - spent;
  if (left) safe = remaining > 0 ? Math.round(remaining / left) : 0;
  const pct = limit ? spent / limit : 0;
  return { id: b.id, category_id: b.category_id, category: cat ? { name: cat.name, icon: cat.icon, color: cat.color } : null, period: b.period, rollover: !!b.rollover, start_date: b.start_date,
    base_cents: b.amount_cents, limit_cents: limit, spent_cents: spent, remaining_cents: remaining, pct, tx_count: count, days_left: left, safe_per_day_cents: safe,
    status: pct > 1 ? 'over' : pct >= 0.8 ? 'warning' : 'ok', window: win };
}

export function budgetsOverview(data, today, mode = 'period', weekStart = 0) {
  const items = [...data.budgets].sort((a, b) => a.id - b.id).map((b) => evalBudget(data, b, today, mode, weekStart));
  const monthly = items.filter((i) => i.period === 'monthly');
  const win = Dt.periodWindow('monthly', today);
  const from = mode === 'all' ? (monthly.map((i) => i.start_date).sort()[0] || win.start) : win.start, to = mode === 'all' ? today : win.end;
  const spent = total(between(data, from, to), 'expense'), limit = monthly.reduce((s, i) => s + i.limit_cents, 0);
  const left = mode === 'all' ? null : Dt.daysLeft('monthly', today, win);
  const overall = limit ? { limit_cents: limit, spent_cents: spent, remaining_cents: limit - spent, pct: spent / limit, days_left: left,
    safe_per_day_cents: left && limit - spent > 0 ? Math.round((limit - spent) / left) : left ? 0 : null, status: spent > limit ? 'over' : spent / limit >= 0.8 ? 'warning' : 'ok', month_label: today.slice(0, 7) } : null;
  return { overall, items, mode };
}

/** Rule-based tips: plain arithmetic on your own data. No LLM, no ML model, nothing leaves the device. */
export function insights(data, today, budgets, monthRows, income, expense) {
  const sp = data.space, out = [], fmt = (c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: sp.currency }).format(c / 100);
  const hot = budgets.items.filter((i) => i.pct >= 0.8 && i.period === 'monthly').sort((a, b) => b.pct - a.pct)[0];
  if (hot?.status === 'over') out.push({ tone: 'bad', icon: '⚠️', text: `You are over your ${hot.category?.name} budget by ${fmt(hot.spent_cents - hot.limit_cents)}.` });
  else if (hot) out.push({ tone: 'warn', icon: '⚠️', text: `You've spent ${Math.round(hot.pct * 100)}% of your ${hot.category?.name} budget with ${hot.days_left} days left (safe pace ${fmt(hot.safe_per_day_cents)}/day).` });
  const { y: ty, m: tm, d: dom } = Dt.parse(today), dim = Dt.daysInMonth(ty, tm);
  if (dom >= 5 && expense > 0) {
    const projected = Math.round((expense / dom) * dim), o = budgets.overall;
    out.push({ tone: o && projected > o.limit_cents ? 'warn' : 'info', icon: '📈', text: `At this pace you'll spend about ${fmt(projected)} this month${o ? (projected > o.limit_cents ? `, ${fmt(projected - o.limit_cents)} over your ${fmt(o.limit_cents)} budget` : `, within your ${fmt(o.limit_cents)} budget`) : ''}.` });
  }
  const prevKey = Dt.addMonthKey(Dt.monthOf(today), -1), prev = between(data, prevKey + '-01', Dt.monthEnd(prevKey + '-01'));
  const cur = sumBy(monthRows, 'category_id', 'expense'), old = sumBy(prev, 'category_id', 'expense'); let best = null;
  for (const [id, c] of cur) { const o = old.get(id) || 0, grow = c - o; if (o > 0 && grow > 2000 && c / o >= 1.25 && (!best || grow > best.grow)) best = { id, grow, pct: c / o - 1 }; }
  if (best) { const cat = data.categories.find((c) => c.id === best.id); out.push({ tone: 'info', icon: '🔍', text: `${cat?.name || 'A category'} is up ${Math.round(best.pct * 100)}% (${fmt(best.grow)}) versus last month's total.` }); }
  if (income > 0) out.push({ tone: expense / income > 0.9 ? 'warn' : 'good', icon: '💰', text: `You've kept ${Math.max(0, Math.round((1 - expense / income) * 100))}% of this month's income so far.` });
  return out.slice(0, 3);
}

export function summary(data, today) {
  const mkey = Dt.monthOf(today), rows = between(data, mkey + '-01', Dt.monthEnd(today));
  const income = total(rows, 'income'), expense = total(rows, 'expense'), wallets = walletBalances(data);
  const budgets = budgetsOverview(data, today, 'period', data.space.week_start);
  return { today, month: mkey, net_worth_cents: wallets.reduce((s, w) => s + w.balance_cents, 0), income_cents: income, expense_cents: expense,
    savings_rate: income > 0 ? (income - expense) / income : null, budgets, recent: sortTx(data.transactions).slice(0, 8).map((t) => shapeTx(data, t)), insights: insights(data, today, budgets, rows, income, expense) };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function buckets(data, period, anchor, weekStart, today) {
  const make = (start, end, label, key) => { const rows = between(data, start, end); return { key, label, start, end, income_cents: total(rows, 'income'), expense_cents: total(rows, 'expense'), future: start > today }; };
  const out = [];
  if (period === 'day') for (let i = 6; i >= 0; i--) { const d = Dt.addDays(anchor, -i); out.push(make(d, d, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Dt.weekday(d)], d)); }
  else if (period === 'week') { const ws = Dt.weekStartOf(anchor, weekStart); for (let i = 7; i >= 0; i--) { const s = Dt.addDays(ws, -7 * i); out.push(make(s, Dt.addDays(s, 6), `${Dt.parse(s).m}/${Dt.parse(s).d}`, s)); } }
  else if (period === 'month') { const k = Dt.monthOf(anchor); for (let i = 5; i >= 0; i--) { const mk = Dt.addMonthKey(k, -i); out.push(make(mk + '-01', Dt.monthEnd(mk + '-01'), MON[Number(mk.slice(5)) - 1], mk + '-01')); } }
  else { const y = anchor.slice(0, 4); for (let m = 1; m <= 12; m++) { const s = `${y}-${String(m).padStart(2, '0')}-01`; out.push(make(s, Dt.monthEnd(s), MON[m - 1][0], s)); } }
  return out;
}

export function analytics(data, today, { period = 'month', date, kind = 'expense', category, member } = {}) {
  const ws = data.space.week_start ?? 0;
  period = ['day', 'week', 'month', 'year'].includes(period) ? period : 'month';
  const anchor = Dt.isDate(date) ? date : today, win = Dt.periodWindow(period, anchor, ws);
  const prevWin = period === 'day' ? { start: Dt.addDays(win.start, -1), end: Dt.addDays(win.start, -1) } : period === 'week' ? { start: Dt.addDays(win.start, -7), end: Dt.addDays(win.start, -1) }
    : period === 'month' ? Dt.periodWindow('month', Dt.addMonths(win.start, -1)) : { start: `${Number(anchor.slice(0, 4)) - 1}-01-01`, end: `${Number(anchor.slice(0, 4)) - 1}-12-31` };
  const rowsAll = between(data, win.start, win.end), prevRows = between(data, prevWin.start, prevWin.end), cats = catMap(data);
  const type = kind === 'income' ? 'income' : 'expense';
  const income = total(rowsAll, 'income'), expense = total(rowsAll, 'expense'), pIncome = total(prevRows, 'income'), pExpense = total(prevRows, 'expense');
  const change = (cur, prev) => (prev ? (cur - prev) / prev : null);
  const kindRows = rowsAll.filter((t) => t.type === type), totalCents = kindRows.reduce((s, t) => s + t.amount_cents, 0);
  const byCat = [...sumBy(kindRows, 'category_id', type)].map(([id, cents]) => { const c = cats.get(id); return { category_id: id, name: c?.name || 'Uncategorised', icon: c?.icon || '•', color: c?.color || '#8B97B3', cents, share: totalCents ? cents / totalCents : 0 }; }).sort((a, b) => b.cents - a.cents);
  const byMember = data.members.map((m) => { const cents = kindRows.filter((t) => t.created_by === m.id).reduce((s, t) => s + t.amount_cents, 0); return { user_id: m.id, name: m.name, color: m.color, cents, share: totalCents ? cents / totalCents : 0 }; });
  let listRows = kind === 'net' ? rowsAll.filter((t) => t.type !== 'transfer') : kindRows;
  if (category) listRows = listRows.filter((t) => t.category_id === Number(category));
  if (member) listRows = listRows.filter((t) => t.created_by === member);
  listRows = [...listRows].sort((a, b) => b.amount_cents - a.amount_cents || (b.date < a.date ? -1 : 1));
  const listTotal = listRows.reduce((s, t) => s + t.amount_cents, 0); let cum = 0;
  const budgetFor = new Map(data.budgets.map((b) => [b.category_id, b]));
  const items = listRows.map((t) => { cum += t.amount_cents; const c = cats.get(t.category_id), b = budgetFor.get(t.category_id);
    return { id: t.id, type: t.type, note: t.note, amount_cents: t.amount_cents, date: t.date, by: t.created_by, category: c ? { id: c.id, name: c.name, icon: c.icon, color: c.color } : null,
      share: listTotal ? t.amount_cents / listTotal : 0, cumulative_share: listTotal ? cum / listTotal : 0, pct_of_income: t.type === 'expense' && income ? t.amount_cents / income : null,
      pct_of_budget: t.type === 'expense' && b && b.period === 'monthly' ? t.amount_cents / b.amount_cents : null }; });
  const upTo = win.end < today ? win.end : (win.start > today ? win.start : today);
  const days = Math.max(1, Dt.diffDays(win.start, upTo) + 1);
  const perDay = new Map(); for (const t of rowsAll) if (t.type === 'expense') perDay.set(t.date, (perDay.get(t.date) || 0) + t.amount_cents);
  const busiest = [...perDay].sort((a, b) => b[1] - a[1])[0];
  const weekdayTotals = Array(7).fill(0); for (const t of kindRows) weekdayTotals[Dt.weekday(t.date)] += t.amount_cents;
  const trend = buckets(data, period, anchor, ws, today);
  if (period === 'month') { const last3 = trend.slice(-3), nk = Dt.addMonthKey(Dt.monthOf(anchor), 1); trend.push({ key: nk + '-01', label: MON[Number(nk.slice(5)) - 1], projected: true, income_cents: Math.round(last3.reduce((s, m) => s + m.income_cents, 0) / 3), expense_cents: Math.round(last3.reduce((s, m) => s + m.expense_cents, 0) / 3) }); }
  return { period, kind, anchor, range: win, prev_range: prevWin, label: period === 'day' ? win.start : `${win.start} → ${win.end}`, week_start: ws, income_cents: income, expense_cents: expense, net_cents: income - expense,
    tx_count: rowsAll.filter((t) => t.type !== 'transfer').length, prev: { income_cents: pIncome, expense_cents: pExpense, net_cents: pIncome - pExpense }, change: { income: change(income, pIncome), expense: change(expense, pExpense) },
    total_cents: totalCents, avg_per_day_cents: Math.round((type === 'income' ? income : expense) / days), days,
    no_spend_days: Math.max(0, Math.min(days, Dt.diffDays(win.start, win.end < today ? win.end : today) + 1) - perDay.size),
    busiest_day: busiest ? { date: busiest[0], cents: busiest[1] } : null, weekday_cents: weekdayTotals, by_category: byCat, by_member: byMember, items, items_total_cents: listTotal,
    top3_share: listTotal ? items.slice(0, 3).reduce((s, i) => s + i.amount_cents, 0) / listTotal : 0, filters: { category: category ? Number(category) : null, member: member || null }, trend };
}

export function portfolio(data) {
  const items = [...data.investments].sort((a, b) => a.id - b.id).map((r) => {
    const value = Math.round(r.quantity * r.price_cents), prevValue = Math.round(r.quantity * r.prev_price_cents);
    return { id: r.id, symbol: r.symbol, name: r.name, kind: r.kind, quantity: Number(r.quantity), cost_cents: r.cost_cents, price_cents: r.price_cents, value_cents: value, day_change_cents: value - prevValue,
      day_change_pct: prevValue ? (value - prevValue) / prevValue : 0, gain_cents: value - r.cost_cents, price_updated_at: r.price_updated_at };
  });
  const totalValue = items.reduce((s, i) => s + i.value_cents, 0), cost = items.reduce((s, i) => s + i.cost_cents, 0), alloc = {};
  for (const i of items) alloc[i.kind] = (alloc[i.kind] || 0) + i.value_cents;
  return { items, total_value_cents: totalValue, total_cost_cents: cost, total_gain_cents: totalValue - cost, day_change_cents: items.reduce((s, i) => s + i.day_change_cents, 0),
    allocation: Object.entries(alloc).map(([kind, cents]) => ({ kind, cents, share: totalValue ? cents / totalValue : 0 })).sort((a, b) => b.cents - a.cents) };
}

export function csv(data) {
  const esc = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [...data.transactions].sort((a, b) => (a.date + a.time + String(a.id).padStart(12, '0')).localeCompare(b.date + b.time + String(b.id).padStart(12, '0'))).map((t) => shapeTx(data, t));
  return ['date,time,type,amount,wallet,to_wallet,category,note,tags,by', ...rows.map((t) => [t.date, t.time, t.type, (t.amount_cents / 100).toFixed(2), t.wallet_name, t.to_wallet_name, t.category?.name, t.note, t.tags.join(' '), t.user_name].map(esc).join(','))].join('\n');
}
