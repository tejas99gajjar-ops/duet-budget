// Spending-pace analytics, computed on the device from the household's own transactions (no model, no network).
// Cheap by design: one pass over the last few months of transactions, then arithmetic on at most ~31 values per month per category.
//
// What it works out
//  - A "usual" daily spend from previous full months, weighted so recent months count more (weights 1, .75, .56, ...), and the savings that implies.
//  - This month's daily spend so far, a month-end projection that leans on history early in the month and on this month later (credibility weight d / (d + 10)).
//  - The highest savings rate of any previous month, and the daily spend needed from now on to match it.
//  - The shape of the days: skewness (adjusted Fisher-Pearson), the median "typical day", and Tukey-style spike days, so a few very big days are told apart from a steady habit.
//  - The same for every category, with a +/- range (daily standard deviation x sqrt(days left)) and the budget they sit against.
import * as Dt from './dates.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const WEIGHT_DECAY = 0.75;
const MIN_DAYS = 7;                       // a previous month needs at least this many covered days to count

/** Describes a list of daily amounts (cents). */
export function dayStats(vals) {
  const n = vals.length; if (!n) return null;
  const total = sum(vals), mean = total / n, sorted = [...vals].sort((a, b) => a - b);
  const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
  const median = q(0.5), q1 = q(0.25), q3 = q(0.75);
  let m2 = 0, m3 = 0; for (const v of vals) { const d = v - mean; m2 += d * d; m3 += d * d * d; } m2 /= n; m3 /= n;
  const sd = Math.sqrt(m2), g1 = m2 > 1e-9 ? m3 / Math.pow(m2, 1.5) : 0;
  const skew = n > 2 ? (g1 * Math.sqrt(n * (n - 1))) / (n - 2) : g1;         // adjusted Fisher-Pearson coefficient
  const fence = Math.max(q3 + 1.5 * (q3 - q1), mean + 1.5 * sd);              // a spike day sits well above both the quartile fence and the usual spread
  const spikes = vals.filter((v) => v > fence && v > 0), spikeSum = sum(spikes), zero = vals.filter((v) => v === 0).length;
  return { n, total, mean, median, q1, q3, sd, skew, fence, reliable: n >= 10, spikeDays: spikes.length, spikeSum, spikeShare: total ? spikeSum / total : 0, spikeMean: spikes.length ? spikeSum / spikes.length : 0, zeroDays: zero, zeroShare: zero / n, max: sorted[n - 1] };
}
export const skewLabel = (s) => (!s || !s.reliable ? 'steady' : s.skew >= 1 ? 'spiky' : s.skew >= 0.5 ? 'leaning spiky' : s.skew <= -0.5 ? 'big-day heavy' : 'steady');

const weighted = (items, f) => { let w = 0, t = 0; items.forEach((it, i) => { const k = Math.pow(WEIGHT_DECAY, i), v = f(it); if (v != null && Number.isFinite(v)) { w += k; t += k * v; } }); return w ? t / w : null; };

/** One pass: per-month and per-category daily series for the last `nMonths` full months plus the current one. */
function collect(data, today, nMonths) {
  const curKey = Dt.monthOf(today), firstKey = Dt.addMonthKey(curKey, -nMonths), from = firstKey + '-01';
  let first = null; for (const t of data.transactions) if (!first || t.date < first) first = t.date;
  const months = new Map(), cats = new Map(), curTx = new Map();
  const month = (key) => { let m = months.get(key); if (!m) { const { y, m: mm } = Dt.parse(key + '-01'); m = { key, dim: Dt.daysInMonth(y, mm), income: 0, expense: 0, daily: null }; m.daily = new Float64Array(m.dim); months.set(key, m); } return m; };
  for (const t of data.transactions) {
    if (t.date < from || t.date > today) continue;
    if (t.type !== 'expense' && t.type !== 'income') continue;
    const key = Dt.monthOf(t.date), m = month(key);
    if (t.type === 'income') { m.income += t.amount_cents; continue; }
    const day = Dt.parse(t.date).d - 1; m.expense += t.amount_cents; m.daily[day] += t.amount_cents;
    const id = t.category_id ?? 0; let c = cats.get(id); if (!c) { c = new Map(); cats.set(id, c); }
    let arr = c.get(key); if (!arr) { arr = new Float64Array(m.dim); c.set(key, arr); } arr[day] += t.amount_cents;
    if (key === curKey) { let l = curTx.get(id); if (!l) { l = []; curTx.set(id, l); } l.push(t); }
  }
  return { curKey, first, months, cats, curTx };
}
const startDay = (key, first) => (first && first.slice(0, 7) === key ? Dt.parse(first).d : 1);

/** Everything the dashboard tips and the pace screen need. `budgets` is the result of budgetsOverview (optional). */
export function paceAnalysis(data, today, { budgets = null, months = 6 } = {}) {
  const { y: ty, m: tm, d: day } = Dt.parse(today), dim = Dt.daysInMonth(ty, tm), left = dim - day;
  const { curKey, first, months: M, cats: C, curTx } = collect(data, today, months);
  const out = { ok: false, today, curKey, dim, day, left, prior: [] };
  if (!first) return out;

  // previous full months that have enough days of history to be trusted
  for (let i = 1; i <= months; i++) {
    const key = Dt.addMonthKey(curKey, -i), m = M.get(key); if (!m || key < first.slice(0, 7)) continue;
    const s0 = startDay(key, first), covered = m.dim - s0 + 1; if (covered < MIN_DAYS || m.expense <= 0) continue;
    out.prior.push({ key, income: m.income, expense: m.expense, days: covered, offset: s0 - 1, perDay: m.expense / covered, savings: m.income - m.expense, rate: m.income > 0 ? (m.income - m.expense) / m.income : null, daily: Array.from(m.daily.slice(s0 - 1)) });
  }
  const cur = M.get(curKey) || { income: 0, expense: 0, daily: new Float64Array(dim) }, s0 = startDay(curKey, first), covered = Math.max(1, day - s0 + 1);
  const curDaily = Array.from(cur.daily.slice(s0 - 1, day));
  out.curDays = covered;
  if (!out.prior.length && cur.expense <= 0) return out;
  out.ok = true; out.hasPrior = out.prior.length > 0; out.lowConfidence = covered < 5;

  // ---- 1. the usual month
  const estPerDay = weighted(out.prior, (p) => p.perDay), estIncome = weighted(out.prior.filter((p) => p.income > 0), (p) => p.income);
  if (estPerDay != null) {
    const spend = estPerDay * dim, saves = estIncome != null ? estIncome - spend : null;
    out.usual = { perDay: estPerDay, income: estIncome, spend, saves, rate: estIncome ? saves / estIncome : null, months: out.prior.length };
  }
  // ---- 2. this month so far
  const perDayNow = cur.expense / covered, w = covered / (covered + 10), blend = estPerDay != null ? w * perDayNow + (1 - w) * estPerDay : perDayNow;
  const projSpend = cur.expense + blend * left, expIncome = Math.max(cur.income, estIncome || 0), incomeBasis = cur.income >= (estIncome || 0) && cur.income > 0 ? 'received' : 'typical';
  out.now = { spent: cur.expense, income: cur.income, perDay: perDayNow, blendPerDay: blend, projSpend, expIncome, incomeBasis, projSaves: expIncome ? expIncome - projSpend : null, projRate: expIncome ? (expIncome - projSpend) / expIncome : null };
  // ---- 3. the best savings rate so far and what it takes to repeat it
  const rated = out.prior.filter((p) => p.rate != null && p.income > 0); let best = null; for (const p of rated) if (!best || p.rate > best.rate) best = p;
  if (best && expIncome > 0) {
    const targetSpend = expIncome * (1 - best.rate), allowance = targetSpend - cur.expense, needed = left > 0 ? allowance / left : null;
    out.best = { rate: best.rate, key: best.key };
    out.target = { spend: targetSpend, allowance, perDayNeeded: needed, status: allowance <= 0 ? 'passed' : needed != null && perDayNow <= needed ? 'on-track' : 'tight', bestNowRate: (expIncome - cur.expense) / expIncome };
  }
  // ---- 4. the shape of the days
  const priorVals = out.prior.flatMap((p) => p.daily);
  out.dailyPrior = priorVals; out.dailyNow = curDaily;
  out.skewPrior = dayStats(priorVals); out.skewNow = dayStats(curDaily);
  const pool = dayStats([...priorVals, ...curDaily]); out.skewAll = pool;
  if (pool && pool.spikeDays && left > 0) { const rate = pool.spikeDays / pool.n, expect = Math.round(rate * left); out.spikePlan = { expected: expect, mean: pool.spikeMean }; if (out.target && out.target.allowance > 0 && left > expect) out.spikePlan.ordinaryCap = Math.max(0, (out.target.allowance - expect * pool.spikeMean) / (left - expect)); }
  // ---- 5. cumulative curves for the chart (index 0 = day 1)
  const priorCum = []; const padded = out.prior.map((p) => [...new Array(p.offset).fill(0), ...p.daily]);   // line each month up by day of month, even a first month that began part-way
  for (let d = 0; d < dim; d++) { let t = 0, k = 0; for (const p of padded) if (d < p.length) { t += sum(p.slice(0, d + 1)); k++; } priorCum.push(k ? t / k : null); }
  const curCum = []; let run = 0; for (let d = 0; d < dim; d++) { if (d < day) { run += cur.daily[d]; curCum.push(run); } else curCum.push(null); }
  out.cum = { prior: priorCum, cur: curCum, projEnd: projSpend, targetEnd: out.target ? out.target.spend : null };

  // ---- 6. category by category
  const bmap = new Map(); if (budgets) for (const b of budgets.items) if (b.period === 'monthly' && b.category_id != null) bmap.set(b.category_id, b);
  const catInfo = new Map(data.categories.map((c) => [c.id, c]));
  out.cats = [];
  for (const [id, byMonth] of C) {
    const info = catInfo.get(id) || { name: 'Other', icon: '🏷️', color: '#8B97B3' };
    const priorDaily = out.prior.map((p) => { const a = byMonth.get(p.key); const s = startDay(p.key, first); return a ? Array.from(a.slice(s - 1)) : new Array(p.days).fill(0); });
    const priorPer = out.prior.map((p, i) => sum(priorDaily[i]) / p.days), usualPer = out.prior.length ? weighted(priorPer.map((v) => ({ v })), (x) => x.v) : null;
    const ca = byMonth.get(curKey), cd = ca ? Array.from(ca.slice(s0 - 1, day)) : new Array(covered).fill(0), spent = sum(cd), perNow = spent / covered;
    if (spent <= 0 && !(usualPer > 0)) continue;
    const rate = usualPer != null ? w * perNow + (1 - w) * usualPer : perNow, proj = spent + rate * left;
    const st = dayStats([...priorDaily.flat(), ...cd]), se = (st ? st.sd : 0) * Math.sqrt(Math.max(0, left));
    const b = bmap.get(id), limit = b ? b.limit_cents : null;
    const status = limit == null ? 'none' : spent > limit ? 'over' : proj > limit ? 'over' : proj > 0.85 * limit ? 'watch' : 'ok';
    const prevAvg = []; for (let d = 0; d < dim; d++) { const vs = priorDaily.filter((a) => d < a.length).map((a) => a[d]); prevAvg.push(vs.length ? sum(vs) / vs.length : null); }
    const top = (curTx.get(id) || []).slice().sort((x, y) => y.amount_cents - x.amount_cents).slice(0, 3).map((t) => ({ date: t.date, note: t.note, amount: t.amount_cents }));
    out.cats.push({ id, name: info.name, icon: info.icon, color: info.color, spent, perDayNow: perNow, perDayUsual: usualPer, change: usualPer > 0 && covered >= 5 ? perNow / usualPer - 1 : null, proj, low: Math.max(spent, proj - se), high: proj + se,
      limit, status, overBy: limit != null ? Math.max(0, proj - limit) : 0, safePerDay: limit != null && left > 0 ? Math.max(0, (limit - spent) / left) : null, stats: st, label: skewLabel(st), daily: cd, prevAvg, top });
  }
  const rank = { over: 0, watch: 1, ok: 2, none: 3 };
  out.cats.sort((a, b) => rank[a.status] - rank[b.status] || b.overBy - a.overBy || b.proj - a.proj);
  return out;
}

// ---------------------------------------------------------------------------------------------------- words
const pc1 = (x) => `${(x * 100).toFixed(1)}%`;
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (key) => MON[Number(key.slice(5)) - 1];

/** The two dashboard lines as structured parts (so they can be styled) plus the plain text. fmt: cents -> string. */
export function paceLines(a, fmt) {
  const lines = [];
  if (!a?.ok) return lines;
  if (a.usual) {
    const u = a.usual;
    lines.push({ id: 'usual', icon: '🗓️', parts: u.saves != null
      ? [`Based on previous months' trend you spend about `, ['b', `${fmt(u.perDay)} per day`], ` and would save `, [u.saves >= 0 ? 'pos' : 'neg', `${fmt(u.saves)} (${pc1(u.rate)})`], ` this month.`]
      : [`Based on previous months' trend you spend about `, ['b', `${fmt(u.perDay)} per day`], `. Log your income to see what that saves.`] });
  }
  const n = a.now, t = a.target;
  if (t && a.best) {
    const when = `${pc1(a.best.rate)} savings, your best so far (${monthName(a.best.key)})`;
    const head = [`Based on this month's trend you are spending `, ['b', `${fmt(n.perDay)} per day`], `. `];
    if (t.status === 'passed') lines.push({ id: 'now', icon: '⏱️', parts: [...head, `You have already spent ${fmt(n.spent)} of the ${fmt(t.spend)} that ${when} allows, so that rate is out of reach this month. The best still possible is `, ['b', pc1(Math.max(0, t.bestNowRate))], ` if you spend nothing more.`] });
    else if (a.left === 0) lines.push({ id: 'now', icon: '⏱️', parts: [...head, `This is the last day of the month: you will finish at about `, ['b', pc1(n.projRate ?? 0)], ` savings against your best of ${pc1(a.best.rate)}.`] });
    else lines.push({ id: 'now', icon: '⏱️', parts: [...head, `To reach ${when}, spend about `, ['b', `${fmt(t.perDayNeeded)} per day`], ` for the remaining ${a.left} day${a.left === 1 ? '' : 's'}.`, t.status === 'on-track' ? [' ok', ` You are already under that.`] : ''] });
  } else if (a.now && a.hasPrior === false) {
    lines.push({ id: 'now', icon: '⏱️', parts: [`This month you are spending `, ['b', `${fmt(n.perDay)} per day`], `. Once you have a full previous month, we will compare it with your best savings rate.`] });
  }
  return lines;
}

/** Skewness in plain words. Returns {tone, icon, title, text}. */
export function skewInsight(s, fmt, plan = null) {
  if (!s || s.n < 5) return { tone: 'info', icon: '🌱', title: 'Too early to tell', text: 'A few more days of spending and the shape of your days will show here.' };
  const label = skewLabel(s), zero = s.zeroShare >= 0.25 ? ` ${s.zeroDays} no-spend days (${Math.round(s.zeroShare * 100)}%) are helping.` : '';
  if (label === 'spiky' || label === 'leaning spiky') {
    const strong = label === 'spiky';
    return { tone: strong ? 'warn' : 'info', icon: '🎢', title: strong ? 'Spending comes in bursts' : 'Slightly bursty', text: `${s.spikeDays} big day${s.spikeDays === 1 ? '' : 's'} ${s.spikeDays === 1 ? 'makes' : 'make'} up ${Math.round(s.spikeShare * 100)}% of spend (about ${fmt(s.spikeMean)} each) while ${s.median > 0 ? `a typical day is only ${fmt(s.median)}` : 'most days have no spending at all'}. ${strong ? 'A few controlled big purchases will move your savings more than trimming small daily costs.' : 'Watch the occasional large day.'}${zero}${plan && plan.expected ? ` To hold your target, expect about ${plan.expected} big day${plan.expected === 1 ? '' : 's'} and keep ordinary days to ${plan.ordinaryCap != null ? fmt(plan.ordinaryCap) : 'less than usual'}.` : ''}` };
  }
  if (label === 'big-day heavy') return { tone: 'info', icon: '🧱', title: 'Many large days, few small ones', text: `Most days are on the high side (typical ${fmt(s.median)}, average ${fmt(s.mean)}), so lowering the everyday level is what will help.${zero}` };
  return { tone: 'good', icon: '✅', title: 'Steady spender', text: `Most days land near ${fmt(s.median)} (average ${fmt(s.mean)}), so your daily level, not one-off splurges, decides your savings.${zero}` };
}

/** One-line reading of a category. */
export function catInsight(c, fmt, left) {
  const bits = [];
  if (c.limit != null) bits.push(c.status === 'over' ? `On this pace you will pass the ${fmt(c.limit)} budget by ${fmt(c.overBy)}.` : c.status === 'watch' ? `Close to the ${fmt(c.limit)} budget: about ${fmt(c.safePerDay ?? 0)} per day keeps you inside.` : `Comfortably inside the ${fmt(c.limit)} budget.`);
  if (c.change != null && Math.abs(c.change) >= 0.15) bits.push(`${c.change > 0 ? 'Up' : 'Down'} ${Math.round(Math.abs(c.change) * 100)}% on your usual ${fmt(c.perDayUsual)} a day.`);
  if (c.label === 'spiky' && c.stats) bits.push(`${c.stats.spikeDays} big day${c.stats.spikeDays === 1 ? '' : 's'} ${c.stats.spikeDays === 1 ? 'makes' : 'make'} ${Math.round(c.stats.spikeShare * 100)}% of it, so one purchase can swing the month.`);
  else if (c.label === 'steady' && c.stats?.reliable) bits.push('Steady from day to day.');
  void left; return bits.join(' ') || 'Not enough history yet.';
}
