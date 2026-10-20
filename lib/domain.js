import * as D from './dates.js';

export const DEFAULT_EXPENSE_CATS = [
  ['Food & Drinks', '🍔', '#F5A623'], ['Groceries', '🛒', '#1DDB97'], ['Transport', '🚇', '#3B82F6'],
  ['Bills & Utilities', '⚡', '#7C5FE6'], ['Entertainment', '🎬', '#E879A0'], ['Travel', '✈️', '#38BDF8'],
  ['Health', '🏥', '#F04444'], ['Shopping', '🛍️', '#F472B6'], ['Home', '🏠', '#A3E635'], ['Other', '📦', '#8B97B3'],
];
export const DEFAULT_INCOME_CATS = [
  ['Salary', '💼', '#1DDB97'], ['Freelance', '💻', '#3B82F6'], ['Gift', '🎁', '#E879A0'], ['Interest', '🏦', '#F5A623'], ['Other income', '💰', '#8B97B3'],
];

const signed = (t, walletId) =>
  t.type === 'income' ? t.amount_cents : t.type === 'expense' ? -t.amount_cents : (t.wallet_id === walletId ? -t.amount_cents : t.amount_cents);

export function walletBalances(db, spaceId) {
  const wallets = db.prepare('SELECT * FROM wallets WHERE space_id=? AND archived=0 ORDER BY id').all(spaceId);
  const rows = db.prepare('SELECT type,amount_cents,wallet_id,to_wallet_id FROM transactions WHERE space_id=?').all(spaceId);
  const bal = new Map(wallets.map((w) => [w.id, { balance: w.initial_cents, count: 0 }]));
  for (const t of rows) {
    const a = bal.get(t.wallet_id); if (a) { a.balance += signed(t, t.wallet_id); a.count++; }
    if (t.type === 'transfer') { const b = bal.get(t.to_wallet_id); if (b) { b.balance += signed(t, t.to_wallet_id); b.count++; } }
  }
  return wallets.map((w) => ({ id: w.id, name: w.name, type: w.type, color: w.color, initial_cents: w.initial_cents, balance_cents: bal.get(w.id).balance, tx_count: bal.get(w.id).count }));
}

const sumBy = (rows, key, type) => {
  const m = new Map();
  for (const t of rows) if (t.type === type) m.set(t[key], (m.get(t[key]) || 0) + t.amount_cents);
  return m;
};
const total = (rows, type) => rows.reduce((s, t) => s + (t.type === type ? t.amount_cents : 0), 0);
const between = (db, spaceId, from, to) =>
  db.prepare('SELECT * FROM transactions WHERE space_id=? AND date>=? AND date<=?').all(spaceId, from, to);

/** One budget evaluated for the current period (or all-time since its start date). */
/** One budget evaluated for the current period (or all-time since its start date). */
export function evalBudget(db, spaceId, b, today, mode = 'period', weekStart = 0) {
  const cat = db.prepare('SELECT * FROM categories WHERE id=?').get(b.category_id);
  const spentIn = (from, to) => db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) s, COUNT(*) c FROM transactions WHERE space_id=? AND type='expense' AND category_id=? AND date>=? AND date<=?`)
    .get(spaceId, b.category_id, from, to);
  let limit = b.amount_cents, win, left = null, safe = null, spent, count;
  if (mode === 'all') {
    limit = b.amount_cents * D.periodsElapsed(b.period, b.start_date, today);
    win = { start: b.start_date, end: today };
  } else {
    win = D.periodWindow(b.period, today, weekStart);
    if (b.rollover) {
      const pw = D.previousWindow(b.period, win);
      if (pw.end >= b.start_date) limit += Math.max(0, b.amount_cents - spentIn(pw.start, pw.end).s);
    }
    left = D.daysLeft(b.period, today, win);
  }
  ({ s: spent, c: count } = spentIn(win.start, win.end));
  const remaining = limit - spent;
  if (left) safe = remaining > 0 ? Math.round(remaining / left) : 0;
  const pct = limit ? spent / limit : 0;
  return {
    id: b.id, category_id: b.category_id, category: cat ? { name: cat.name, icon: cat.icon, color: cat.color } : null,
    period: b.period, rollover: !!b.rollover, start_date: b.start_date, base_cents: b.amount_cents,
    limit_cents: limit, spent_cents: spent, remaining_cents: remaining, pct, tx_count: count,
    days_left: left, safe_per_day_cents: safe, status: pct > 1 ? 'over' : pct >= 0.8 ? 'warning' : 'ok', window: win,
  };
}

export function budgetsOverview(db, spaceId, today, mode = 'period', weekStart = 0) {
  const rows = db.prepare('SELECT * FROM budgets WHERE space_id=? ORDER BY id').all(spaceId);
  const items = rows.map((b) => evalBudget(db, spaceId, b, today, mode, weekStart));
  // The overall budget is the sum of monthly category limits, measured against ALL expenses (as in the reference UI).
  const monthly = items.filter((i) => i.period === 'monthly');
  const win = D.periodWindow('monthly', today);
  const from = mode === 'all' ? (monthly.map((i) => i.start_date).sort()[0] || win.start) : win.start;
  const to = mode === 'all' ? today : win.end;
  const spent = total(between(db, spaceId, from, to), 'expense');
  const limit = monthly.reduce((s, i) => s + i.limit_cents, 0);
  const left = mode === 'all' ? null : D.daysLeft('monthly', today, win);
  const overall = limit ? {
    limit_cents: limit, spent_cents: spent, remaining_cents: limit - spent, pct: spent / limit, days_left: left,
    safe_per_day_cents: left && limit - spent > 0 ? Math.round((limit - spent) / left) : left ? 0 : null,
    status: spent > limit ? 'over' : spent / limit >= 0.8 ? 'warning' : 'ok', month_label: today.slice(0, 7),
  } : null;
  return { overall, items, mode };
}

function monthSeries(db, spaceId, endKey, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = D.addMonthKey(endKey, -i);
    const rows = between(db, spaceId, k + '-01', D.monthEnd(k + '-01'));
    out.push({ month: k, income_cents: total(rows, 'income'), expense_cents: total(rows, 'expense') });
  }
  return out;
}

export function summary(db, space, today) {
  const sid = space.id, mkey = D.monthOf(today);
  const wallets = walletBalances(db, sid);
  const rows = between(db, sid, mkey + '-01', D.monthEnd(today));
  const income = total(rows, 'income'), expense = total(rows, 'expense');
  const budgets = budgetsOverview(db, sid, today, 'period', space.week_start);
  const recent = db.prepare(`SELECT t.*,c.name cat_name,c.icon cat_icon,c.color cat_color,w.name wallet_name,u.name user_name
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN wallets w ON w.id=t.wallet_id LEFT JOIN users u ON u.id=t.created_by
    WHERE t.space_id=? ORDER BY t.date DESC,t.time DESC,t.id DESC LIMIT 8`).all(sid);
  return {
    today, month: mkey,
    net_worth_cents: wallets.reduce((s, w) => s + w.balance_cents, 0),
    income_cents: income, expense_cents: expense,
    savings_rate: income > 0 ? (income - expense) / income : null,
    budgets, recent: recent.map(shapeTx), insights: insights(db, space, today, budgets, rows, income, expense),
  };
}

/**
 * Rule-based tips. This is plain arithmetic over your own transactions: no LLM, no machine-learning model,
 * and nothing is sent off the server.
 */
export function insights(db, space, today, budgets, monthRows, income, expense) {
  const out = [], fmt = (c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: space.currency }).format(c / 100);
  const hot = budgets.items.filter((i) => i.pct >= 0.8 && i.period === 'monthly').sort((a, b) => b.pct - a.pct)[0];
  if (hot?.status === 'over') out.push({ tone: 'bad', icon: '⚠️', text: `You are over your ${hot.category?.name} budget by ${fmt(hot.spent_cents - hot.limit_cents)}.` });
  else if (hot) out.push({ tone: 'warn', icon: '⚠️', text: `You've spent ${Math.round(hot.pct * 100)}% of your ${hot.category?.name} budget with ${hot.days_left} days left (safe pace ${fmt(hot.safe_per_day_cents)}/day).` });
  const { y: ty, m: tm, d: dom } = D.parse(today), dim = D.daysInMonth(ty, tm);
  if (dom >= 5 && expense > 0) {
    const projected = Math.round((expense / dom) * dim), o = budgets.overall;
    out.push({ tone: o && projected > o.limit_cents ? 'warn' : 'info', icon: '📈', text: `At this pace you'll spend about ${fmt(projected)} this month${o ? (projected > o.limit_cents ? `, ${fmt(projected - o.limit_cents)} over your ${fmt(o.limit_cents)} budget` : `, within your ${fmt(o.limit_cents)} budget`) : ''}.` });
  }
  const prevKey = D.addMonthKey(D.monthOf(today), -1), prev = between(db, space.id, prevKey + '-01', D.monthEnd(prevKey + '-01'));
  const byCat = (rows) => sumBy(rows, 'category_id', 'expense'); const cur = byCat(monthRows), old = byCat(prev);
  let best = null;
  for (const [id, c] of cur) { const o = old.get(id) || 0; const grow = c - o; if (o > 0 && grow > 2000 && c / o >= 1.25 && (!best || grow > best.grow)) best = { id, grow, pct: c / o - 1 }; }
  if (best) { const cat = db.prepare('SELECT name FROM categories WHERE id=?').get(best.id); out.push({ tone: 'info', icon: '🔍', text: `${cat?.name || 'A category'} is up ${Math.round(best.pct * 100)}% (${fmt(best.grow)}) versus last month's total.` }); }
  if (income > 0) out.push({ tone: expense / income > 0.9 ? 'warn' : 'good', icon: '💰', text: `You've kept ${Math.max(0, Math.round((1 - expense / income) * 100))}% of this month's income so far.` });
  return out.slice(0, 3);
}

/** Bucketed income/expense series used for the trend chart. */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function buckets(db, sid, period, anchor, weekStart, today) {
  const make = (start, end, label, key) => {
    const rows = between(db, sid, start, end);
    return { key, label, start, end, income_cents: total(rows, 'income'), expense_cents: total(rows, 'expense'), future: start > today };
  };
  const out = [];
  if (period === 'day') for (let i = 6; i >= 0; i--) { const d = D.addDays(anchor, -i); out.push(make(d, d, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][D.weekday(d)], d)); }
  else if (period === 'week') { const ws = D.weekStartOf(anchor, weekStart); for (let i = 7; i >= 0; i--) { const s = D.addDays(ws, -7 * i); out.push(make(s, D.addDays(s, 6), `${D.parse(s).m}/${D.parse(s).d}`, s)); } }
  else if (period === 'month') { const k = D.monthOf(anchor); for (let i = 5; i >= 0; i--) { const mk = D.addMonthKey(k, -i); out.push(make(mk + '-01', D.monthEnd(mk + '-01'), MON[Number(mk.slice(5)) - 1], mk + '-01')); } }
  else { const y = anchor.slice(0, 4); for (let m = 1; m <= 12; m++) { const s = `${y}-${String(m).padStart(2, '0')}-01`; out.push(make(s, D.monthEnd(s), MON[m - 1][0], s)); } }
  return out;
}

export function analytics(db, space, today, { period = 'month', date, kind = 'expense', category, member } = {}) {
  const sid = space.id, ws = space.week_start ?? 0;
  period = ['day', 'week', 'month', 'year'].includes(period) ? period : 'month';
  const anchor = D.isDate(date) ? date : today;
  const win = D.periodWindow(period, anchor, ws);
  const prevWin = period === 'day' ? { start: D.addDays(win.start, -1), end: D.addDays(win.start, -1) }
    : period === 'week' ? { start: D.addDays(win.start, -7), end: D.addDays(win.start, -1) }
    : period === 'month' ? D.periodWindow('month', D.addMonths(win.start, -1)) : { start: `${Number(anchor.slice(0, 4)) - 1}-01-01`, end: `${Number(anchor.slice(0, 4)) - 1}-12-31` };
  const rowsAll = between(db, sid, win.start, win.end), prevRows = between(db, sid, prevWin.start, prevWin.end);
  const cats = new Map(db.prepare('SELECT * FROM categories WHERE space_id=?').all(sid).map((c) => [c.id, c]));
  const members = db.prepare('SELECT m.user_id,u.name,m.color FROM members m JOIN users u ON u.id=m.user_id WHERE m.space_id=?').all(sid);
  const type = kind === 'income' ? 'income' : 'expense';
  const income = total(rowsAll, 'income'), expense = total(rowsAll, 'expense');
  const pIncome = total(prevRows, 'income'), pExpense = total(prevRows, 'expense');
  const change = (cur, prev) => (prev ? (cur - prev) / prev : null);

  // Breakdowns are always for the chosen kind; drill-down filters apply to the item list only.
  const kindRows = rowsAll.filter((t) => t.type === type);
  const totalCents = kindRows.reduce((s, t) => s + t.amount_cents, 0);
  const byCat = [...sumBy(kindRows, 'category_id', type)].map(([id, cents]) => {
    const c = cats.get(id); return { category_id: id, name: c?.name || 'Uncategorised', icon: c?.icon || '•', color: c?.color || '#8B97B3', cents, share: totalCents ? cents / totalCents : 0 };
  }).sort((a, b) => b.cents - a.cents);
  const byMember = members.map((m) => { const cents = kindRows.filter((t) => t.created_by === m.user_id).reduce((s, t) => s + t.amount_cents, 0); return { user_id: m.user_id, name: m.name, color: m.color, cents, share: totalCents ? cents / totalCents : 0 }; });

  let listRows = kind === 'net' ? rowsAll.filter((t) => t.type !== 'transfer') : kindRows;
  if (category) listRows = listRows.filter((t) => t.category_id === Number(category));
  if (member) listRows = listRows.filter((t) => t.created_by === Number(member));
  listRows = [...listRows].sort((a, b) => b.amount_cents - a.amount_cents || (b.date < a.date ? -1 : 1));
  const listTotal = listRows.reduce((s, t) => s + t.amount_cents, 0);
  let cum = 0;
  const budgetFor = new Map(db.prepare('SELECT category_id,amount_cents,period FROM budgets WHERE space_id=?').all(sid).map((b) => [b.category_id, b]));
  const items = listRows.map((t) => {
    cum += t.amount_cents; const c = cats.get(t.category_id), b = budgetFor.get(t.category_id);
    return { id: t.id, type: t.type, note: t.note, amount_cents: t.amount_cents, date: t.date, by: t.created_by, category: c ? { id: c.id, name: c.name, icon: c.icon, color: c.color } : null,
      share: listTotal ? t.amount_cents / listTotal : 0, cumulative_share: listTotal ? cum / listTotal : 0,
      pct_of_income: t.type === 'expense' && income ? t.amount_cents / income : null,
      pct_of_budget: t.type === 'expense' && b && b.period === 'monthly' ? t.amount_cents / b.amount_cents : null };
  });
  const days = Math.max(1, D.diffDays(win.start, win.end < today ? win.end : (win.start > today ? win.start : today)) + 1);
  const perDay = new Map(); for (const t of rowsAll) if (t.type === 'expense') perDay.set(t.date, (perDay.get(t.date) || 0) + t.amount_cents);
  const busiest = [...perDay].sort((a, b) => b[1] - a[1])[0];
  const weekdayTotals = Array(7).fill(0); for (const t of kindRows) weekdayTotals[D.weekday(t.date)] += t.amount_cents;
  const trend = buckets(db, sid, period, anchor, ws, today);
  if (period === 'month') { const last3 = trend.slice(-3); trend.push({ key: D.addMonthKey(D.monthOf(anchor), 1) + '-01', label: MON[Number(D.addMonthKey(D.monthOf(anchor), 1).slice(5)) - 1], projected: true, income_cents: Math.round(last3.reduce((s, m) => s + m.income_cents, 0) / 3), expense_cents: Math.round(last3.reduce((s, m) => s + m.expense_cents, 0) / 3) }); }
  const label = period === 'day' ? win.start : `${win.start} → ${win.end}`;
  return {
    period, kind, anchor, range: win, prev_range: prevWin, label, week_start: ws,
    income_cents: income, expense_cents: expense, net_cents: income - expense, tx_count: rowsAll.filter((t) => t.type !== 'transfer').length,
    prev: { income_cents: pIncome, expense_cents: pExpense, net_cents: pIncome - pExpense },
    change: { income: change(income, pIncome), expense: change(expense, pExpense) },
    total_cents: totalCents, avg_per_day_cents: Math.round((type === 'income' ? income : expense) / days), days,
    no_spend_days: Math.max(0, Math.min(days, D.diffDays(win.start, win.end < today ? win.end : today) + 1) - perDay.size),
    busiest_day: busiest ? { date: busiest[0], cents: busiest[1] } : null, weekday_cents: weekdayTotals,
    by_category: byCat, by_member: byMember, items, items_total_cents: listTotal,
    top3_share: listTotal ? items.slice(0, 3).reduce((s, i) => s + i.amount_cents, 0) / listTotal : 0,
    filters: { category: category ? Number(category) : null, member: member ? Number(member) : null }, trend,
  };
}

export function portfolio(db, spaceId) {
  const rows = db.prepare('SELECT * FROM investments WHERE space_id=? ORDER BY id').all(spaceId);
  const items = rows.map((r) => {
    const value = Math.round(r.quantity * r.price_cents), prevValue = Math.round(r.quantity * r.prev_price_cents);
    return { id: r.id, symbol: r.symbol, name: r.name, kind: r.kind, quantity: r.quantity, cost_cents: r.cost_cents, price_cents: r.price_cents,
      value_cents: value, day_change_cents: value - prevValue, day_change_pct: prevValue ? (value - prevValue) / prevValue : 0,
      gain_cents: value - r.cost_cents, price_updated_at: r.price_updated_at };
  });
  const totalValue = items.reduce((s, i) => s + i.value_cents, 0), cost = items.reduce((s, i) => s + i.cost_cents, 0);
  const alloc = {};
  for (const i of items) alloc[i.kind] = (alloc[i.kind] || 0) + i.value_cents;
  return { items, total_value_cents: totalValue, total_cost_cents: cost, total_gain_cents: totalValue - cost,
    day_change_cents: items.reduce((s, i) => s + i.day_change_cents, 0),
    allocation: Object.entries(alloc).map(([kind, cents]) => ({ kind, cents, share: totalValue ? cents / totalValue : 0 })).sort((a, b) => b.cents - a.cents) };
}

export function shapeTx(t) {
  return { id: t.id, type: t.type, amount_cents: t.amount_cents, wallet_id: t.wallet_id, to_wallet_id: t.to_wallet_id, category_id: t.category_id,
    note: t.note, tags: JSON.parse(t.tags || '[]'), date: t.date, time: t.time, status: t.status, created_by: t.created_by, recurring_id: t.recurring_id,
    category: t.cat_name ? { name: t.cat_name, icon: t.cat_icon, color: t.cat_color } : null, wallet_name: t.wallet_name, to_wallet_name: t.to_wallet_name, user_name: t.user_name };
}

/** Materialise due recurring rules up to `today`. Returns how many transactions were created. */
export function runRecurring(db, spaceId, today) {
  const rules = db.prepare('SELECT * FROM recurring WHERE space_id=? AND active=1 AND next_date<=?').all(spaceId, today);
  let n = 0;
  const ins = db.prepare(`INSERT INTO transactions(space_id,type,amount_cents,wallet_id,to_wallet_id,category_id,note,tags,date,time,created_by,recurring_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rules) {
    let d = r.next_date, guard = 0;
    while (d <= today && guard++ < 400) {
      ins.run(spaceId, r.type, r.amount_cents, r.wallet_id, r.to_wallet_id, r.category_id, r.note, r.tags, d, r.time, r.created_by, r.id); n++;
      d = r.frequency === 'daily' ? D.addDays(d, 1) : r.frequency === 'weekly' ? D.addDays(d, 7) : r.frequency === 'yearly' ? D.addMonths(d, 12) : D.addMonths(r.next_date, guard);
    }
    db.prepare('UPDATE recurring SET next_date=? WHERE id=?').run(d, r.id);
  }
  return n;
}
