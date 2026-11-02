// Spending-pace analytics, computed on the device from the household's own transactions (no model, no network).
// Cheap by design: one pass over the last few months of transactions, then arithmetic on at most ~31 values per month per category.
//
// The idea: money leaves in three different ways, and they must not be projected the same way.
//  - FIXED payments (rent, EMIs, bills, anything that comes at about the same amount on about the same date every month, or is tagged recurring).
//    Once one is paid this month it is done: it is NOT spread over the remaining days. One that has not come yet is added as a known cost on its expected date.
//  - ONE-OFFS (single purchases far larger than a normal day that do not repeat on a schedule). Once spent they are left out of the daily pace; a small reserve covers
//    the ones that usually turn up later in the month.
//  - EVERYDAY spending (the rest). Only this is turned into a "per day" figure and projected over the days left.
//  Month-end = spent so far + fixed payments still due + one-off reserve + everyday pace x days left. It updates with every transaction.
//
// Also: a recency-weighted "usual" month, the best savings rate so far and the everyday spend that would repeat it, and the shape of spending days (skewness,
// median "typical day", spike days) computed on variable spending, so a rent day does not make a steady spender look spiky.
import * as Dt from './dates.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const WEIGHT_DECAY = 0.75;
const MIN_DAYS = 7;                       // a previous month needs at least this many covered days to count
const AMOUNT_TOL = 0.15;                  // same payment if the amount is within 15%...
const DAY_TOL = 3;                        // ...and falls within 3 days of the usual date
const MATCH_TOL = 0.3;                    // a payment this month matches an expected one if within 30%
const norm = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** "Car Loan", "Car loan EMI" and "car loan payment" are the same payment: equal, one contains the other, or they share most of their words. */
const sameName = (a, b) => { const x = norm(a), y = norm(b); if (!x || !y) return false; if (x === y || x.includes(y) || y.includes(x)) return true; const tx = new Set(x.split(' ')), ty = new Set(y.split(' ')); let k = 0; for (const t of tx) if (ty.has(t)) k++; return k / Math.max(tx.size, ty.size) >= 0.5; };
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Describes a list of daily amounts (cents). */
export function dayStats(vals) {
  const n = vals.length; if (!n) return null;
  const total = sum(vals), mean = total / n, sorted = [...vals].sort((a, b) => a - b);
  const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
  const med = q(0.5), q1 = q(0.25), q3 = q(0.75);
  let m2 = 0, m3 = 0; for (const v of vals) { const d = v - mean; m2 += d * d; m3 += d * d * d; } m2 /= n; m3 /= n;
  const sd = Math.sqrt(m2), g1 = m2 > 1e-9 ? m3 / Math.pow(m2, 1.5) : 0;
  const skew = n > 2 ? (g1 * Math.sqrt(n * (n - 1))) / (n - 2) : g1;         // adjusted Fisher-Pearson coefficient
  const fence = Math.max(q3 + 1.5 * (q3 - q1), mean + 1.5 * sd);              // a spike day sits well above both the quartile fence and the usual spread
  const spikes = vals.filter((v) => v > fence && v > 0), spikeSum = sum(spikes), zero = vals.filter((v) => v === 0).length;
  return { n, total, mean, median: med, q1, q3, sd, skew, fence, reliable: n >= 10, spikeDays: spikes.length, spikeSum, spikeShare: total ? spikeSum / total : 0, spikeMean: spikes.length ? spikeSum / spikes.length : 0, zeroDays: zero, zeroShare: zero / n, max: sorted[n - 1] };
}
export const skewLabel = (s) => (!s || !s.reliable ? 'steady' : s.skew >= 1 ? 'spiky' : s.skew >= 0.5 ? 'leaning spiky' : s.skew <= -0.5 ? 'big-day heavy' : 'steady');

const weighted = (items, f) => { let w = 0, t = 0; items.forEach((it, i) => { const k = Math.pow(WEIGHT_DECAY, i), v = f(it); if (v != null && Number.isFinite(v)) { w += k; t += k * v; } }); return w ? t / w : null; };
const startDay = (key, first) => (first && first.slice(0, 7) === key ? Dt.parse(first).d : 1);

/** One pass: expense transactions and income by month for the last `nMonths` full months plus the current one. */
function collect(data, today, nMonths) {
  const curKey = Dt.monthOf(today), firstKey = Dt.addMonthKey(curKey, -nMonths), from = firstKey + '-01';
  let first = null; for (const t of data.transactions) if (!first || t.date < first) first = t.date;
  const months = new Map();
  const month = (key) => { let m = months.get(key); if (!m) { const { y, m: mm } = Dt.parse(key + '-01'); m = { key, dim: Dt.daysInMonth(y, mm), income: 0, expense: 0, daily: null, txs: [] }; m.daily = new Float64Array(m.dim); months.set(key, m); } return m; };
  for (const t of data.transactions) {
    if (t.date < from || t.date > today) continue;
    if (t.type !== 'expense' && t.type !== 'income') continue;
    const m = month(Dt.monthOf(t.date));
    if (t.type === 'income') { m.income += t.amount_cents; continue; }
    m.expense += t.amount_cents; m.daily[Dt.parse(t.date).d - 1] += t.amount_cents; m.txs.push(t);
  }
  return { curKey, first, months };
}

// ---------------------------------------------------------------------------------------------------- fixed payments
/** Finds payments that repeat monthly: same category, similar amount, similar day, in at least two previous months (or tagged recurring). */
function findCommitments(priorMonths, rules, meanDaily, catName, today, dim) {
  const minAmt = Math.max(1.5 * meanDaily, 1), clusters = [];
  // a note that turns up many times a month (Groceries, Coffee) is a habit, not a bill, unless the entries carry a recurring tag
  const freq = new Map(); for (const m of priorMonths) { const c = new Map(); for (const t of m.txs) { const k = `${t.category_id ?? 0}|${norm(t.note)}`; c.set(k, (c.get(k) || 0) + 1); } for (const [k, n] of c) freq.set(k, Math.max(freq.get(k) || 0, n)); }
  const all = []; for (const m of priorMonths) for (const t of m.txs) { if (t.recurring_id == null && norm(t.note) && (freq.get(`${t.category_id ?? 0}|${norm(t.note)}`) || 0) > 3) continue; all.push({ t, month: m.key, day: Dt.parse(t.date).d }); }   // small subscriptions (a streaming plan, an AI tool) repeat too, so every expense is a candidate
  all.sort((a, b) => b.t.amount_cents - a.t.amount_cents);
  for (const c of all) {
    const cat = c.t.category_id ?? 0, label = c.t.note || c.t.tags?.[0] || '', nn = norm(label); let hit = null;   // a tag stands in for a missing note
    // the same payment can land a few days earlier or later each month (weekends, billing cycles) and its amount can drift a little (price rises, exchange rates),
    // so when the note is the same it is the same payment, whatever the exact day
    for (const cl of clusters) if (cl.cat === cat) { const med = median(cl.amounts), same = nn && [...cl.names].some((n) => sameName(n, nn));
      if (Math.abs(c.t.amount_cents - med) <= (same ? 0.25 : AMOUNT_TOL) * med && Math.abs(c.day - median(cl.days)) <= (same ? 12 : DAY_TOL)) { hit = cl; break; } }
    if (!hit) { hit = { cat, amounts: [], days: [], dates: [], items: [], perMonth: new Map(), tag: false, notes: new Map(), names: new Set() }; clusters.push(hit); }
    hit.items.push({ date: c.t.date, amount: c.t.amount_cents, note: c.t.note || '', tags: c.t.tags || [], month: c.month }); hit.dates.push(c.t.date); hit.amounts.push(c.t.amount_cents); hit.days.push(c.day); hit.perMonth.set(c.month, (hit.perMonth.get(c.month) || 0) + 1); if (c.t.recurring_id != null) hit.tag = true;
    if (nn) hit.names.add(nn); if (label) hit.notes.set(label, (hit.notes.get(label) || 0) + 1);
  }
  // a monthly payment shows up once a month: two groups that never appear in the same month and look alike are one payment whose date drifted
  for (let i = 0; i < clusters.length; i++) for (let j = clusters.length - 1; j > i; j--) {
    const A = clusters[i], B = clusters[j]; if (A.cat !== B.cat) continue;
    const disjoint = ![...B.perMonth.keys()].some((k) => A.perMonth.has(k)), near = Math.abs(median(A.amounts) - median(B.amounts)) <= 0.25 * Math.max(median(A.amounts), median(B.amounts));
    const sameNm = [...B.names].some((n) => [...A.names].some((m) => sameName(n, m))), close = Math.abs(median(A.days) - median(B.days)) <= 12;
    if (disjoint && near && (sameNm || (!A.names.size || !B.names.size) && close)) { A.amounts.push(...B.amounts); A.days.push(...B.days); A.dates.push(...B.dates); A.items.push(...B.items); for (const [k, v] of B.perMonth) A.perMonth.set(k, v); for (const [k, v] of B.notes) A.notes.set(k, (A.notes.get(k) || 0) + v); for (const n of B.names) A.names.add(n); A.tag ||= B.tag; clusters.splice(j, 1); }
  }
  const out = [];
  for (const cl of clusters) {
    const months = cl.perMonth.size, maxPer = Math.max(...cl.perMonth.values());
    // a payment smaller than a normal day must be proven more: the same note in two months, or any look-alike in three (so everyday small buys are not mistaken for bills)
    const small = median(cl.amounts) < minAmt, proven = !small || (cl.names.size > 0 && months >= 2) || months >= 3;
    if (maxPer > 2 || !((months >= 2 && proven) || (cl.tag && months >= 1))) continue;
    const note = [...cl.notes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    // what really happened decides when and how much: the day is the median of the last three months' entries, the amount is the latest month's
    const byMonth = new Map(); for (const it of cl.items) { if (!byMonth.has(it.month)) byMonth.set(it.month, []); byMonth.get(it.month).push(it); }
    const keys = [...byMonth.keys()].sort(), recent = keys.slice(-3), day = Math.round(median(recent.map((k) => median(byMonth.get(k).map((it) => Dt.parse(it.date).d))))), last = byMonth.get(keys[keys.length - 1]), amount = sum(last.map((it) => it.amount)) / last.length;
    const tags = new Map(); for (const it of cl.items) for (const t of it.tags) tags.set(t, (tags.get(t) || 0) + 1); const tag = [...tags.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    out.push({ key: `p${cl.cat}-${Math.round(amount)}`, catId: cl.cat, name: note ? (note === note.toLowerCase() ? note[0].toUpperCase() + note.slice(1) : note) : catName(cl.cat), day, amount, months, monthSet: keys, hasNote: !!note, seen: [...cl.dates].sort(), seenItems: [...cl.items].sort((x, y) => (x.date < y.date ? -1 : 1)), source: cl.tag ? 'recurring' : 'pattern' });
  }
  // the household's own recurring rules are the most reliable source of what is coming
  const { y, m } = Dt.parse(today); const mk = Dt.monthOf(today);
  for (const r of rules) {
    const cat = r.category_id ?? 0, nd = r.next_date, nm = Dt.monthOf(nd);
    const add = (day) => {
      const rn = norm(r.note), info = { frequency: r.frequency, next: r.next_date, day };
      const dup = out.find((o) => o.catId === cat && Math.abs(o.amount - r.amount_cents) <= 0.25 * Math.max(o.amount, r.amount_cents) && (rn && o.hasNote ? sameName(o.name, r.note) : Math.abs(o.day - day) <= 12));
      if (dup) { dup.rule = true; dup.source = 'recurring'; info.conflict = dup.months >= 1 && Math.abs(day - dup.day) > 3; dup.ruleInfo = info; if (dup.months === 0) { dup.day = day; dup.amount = r.amount_cents; } }
      else out.push({ key: `r${r.id}-${day}`, catId: cat, name: r.note || catName(cat), hasNote: !!r.note, day, amount: r.amount_cents, months: 0, monthSet: [], seen: [], seenItems: [], source: 'recurring', rule: true, ruleInfo: info });
    };
    if (r.frequency === 'monthly') add(Math.min(dim, Dt.parse(nd).d));
    else if (r.frequency === 'weekly') { for (let d = nd; Dt.monthOf(d) === mk || d < today; d = Dt.addDays(d, 7)) { if (Dt.monthOf(d) === mk) add(Dt.parse(d).d); if (d > Dt.monthEnd(today)) break; } }
    else if (r.frequency === 'yearly' && nm === mk) add(Dt.parse(nd).d);
  }
  void y; void m;
  return out;
}
/** Does this transaction look like that payment? Same note: up to 30% apart in amount. A different note: no. No note on one side: within 15%. */
const matches = (c, t) => { if ((t.category_id ?? 0) !== c.catId) return false; const tn = norm(t.note), diff = Math.abs(t.amount_cents - c.amount);
  if (c.hasNote && tn) return sameName(tn, c.name) && diff <= MATCH_TOL * c.amount;
  return diff <= (c.hasNote || tn ? 0.15 : MATCH_TOL) * c.amount; };

// ---------------------------------------------------------------------------------------------------- main analysis
/** Everything the dashboard tips and the pace screen need. `budgets` is the result of budgetsOverview (optional). */
export function paceAnalysis(data, today, { budgets = null, months = 6 } = {}) {
  const { y: ty, m: tm, d: day } = Dt.parse(today), dim = Dt.daysInMonth(ty, tm), left = dim - day;
  const { curKey, first, months: M } = collect(data, today, months);
  const out = { ok: false, today, curKey, dim, day, left, prior: [] };
  if (!first) return out;
  const catInfo = new Map(data.categories.map((c) => [c.id, c])), catName = (id) => catInfo.get(id)?.name || 'Other';

  // previous full months that have enough days of history to be trusted
  for (let i = 1; i <= months; i++) {
    const key = Dt.addMonthKey(curKey, -i), m = M.get(key); if (!m || key < first.slice(0, 7)) continue;
    const s0 = startDay(key, first), covered = m.dim - s0 + 1; if (covered < MIN_DAYS || m.expense <= 0) continue;
    out.prior.push({ key, income: m.income, expense: m.expense, days: covered, dim: m.dim, offset: s0 - 1, perDay: m.expense / covered, savings: m.income - m.expense, rate: m.income > 0 ? (m.income - m.expense) / m.income : null, daily: Array.from(m.daily.slice(s0 - 1)), txs: m.txs });
  }
  let cur = M.get(curKey) || { income: 0, expense: 0, daily: new Float64Array(dim), txs: [] }, s0 = startDay(curKey, first), covered = Math.max(1, day - s0 + 1);
  const curDaily = Array.from(cur.daily.slice(s0 - 1, day)); out.curDays = covered;
  if (!out.prior.length && cur.expense <= 0) return out;
  out.ok = true; out.hasPrior = out.prior.length > 0; out.lowConfidence = covered < 5;

  // ---- fixed payments: what repeats, what is paid, what is still to come
  const rules = (data.recurring || []).filter((r) => r.active && r.type === 'expense');
  const roughDaily = weighted(out.prior, (p) => p.perDay) ?? (cur.expense / covered);
  let commits = findCommitments(out.prior, rules, roughDaily, catName, today, dim);
  // the same monthly payment entered twice in one month (for example by hand and by a recurring rule) is one payment: the extra entry is left out of every figure and flagged
  const dupsPrior = [];
  for (const p of out.prior) for (const c of commits.filter((x) => x.months > 0)) {
    const hits = p.txs.filter((t) => matches(c, t)).sort((x, y) => Math.abs(Dt.parse(x.date).d - c.day) - Math.abs(Dt.parse(y.date).d - c.day));
    for (const extra of hits.slice(1)) if (Math.abs(extra.amount_cents - hits[0].amount_cents) <= 0.05 * hits[0].amount_cents && (c.hasNote || extra.recurring_id != null)) { p.txs = p.txs.filter((t) => t !== extra); p.expense -= extra.amount_cents; const di = Dt.parse(extra.date).d - 1 - p.offset; if (di >= 0 && di < p.daily.length) p.daily[di] -= extra.amount_cents; p.perDay = p.expense / p.days; p.savings = p.income - p.expense; p.rate = p.income > 0 ? p.savings / p.income : null; dupsPrior.push({ name: c.name, date: extra.date, amount: extra.amount_cents }); }
  }
  // ---- usual month (totals, as in the first tip line)
  const estPerDay = weighted(out.prior, (p) => p.perDay), estIncome = weighted(out.prior.filter((p) => p.income > 0), (p) => p.income);
  if (estPerDay != null) { const spend = estPerDay * dim, saves = estIncome != null ? estIncome - spend : null; out.usual = { perDay: estPerDay, income: estIncome, spend, saves, rate: estIncome ? saves / estIncome : null, months: out.prior.length }; }
  const baseDaily = estPerDay != null ? estPerDay : cur.expense / covered, lumpMin = Math.max(4 * baseDaily, 1);
  let curExpense = cur.txs.slice(); const used = new Set();
  for (const c of commits) {
    const cand = curExpense.filter((t) => !used.has(t.id) && matches(c, t)).sort((a, b) => Math.abs(Dt.parse(a.date).d - c.day) - Math.abs(Dt.parse(b.date).d - c.day))[0];
    if (cand) { used.add(cand.id); c.status = 'paid'; c.paidDate = cand.date; c.paidAmount = cand.amount_cents; c.txId = cand.id; }
    else c.status = c.day > day ? 'upcoming' : c.day === day ? 'today' : 'late';
    c.dueIn = c.day - day; c.date = Dt.ymd(ty, tm, Math.min(c.day, dim));
  }
  // extra entries of a payment already made this month (same note or recurring tag, nearly the same amount) are duplicates, not second payments
  const dupsNow = [];
  for (const c of commits.filter((x) => x.status === 'paid')) for (const t of curExpense) {
    if (used.has(t.id) || t.id === c.txId || !matches(c, t) || Math.abs(t.amount_cents - c.paidAmount) > 0.05 * c.paidAmount || !(c.hasNote || t.recurring_id != null)) continue;
    dupsNow.push({ name: c.name, date: t.date, amount: t.amount_cents, id: t.id }); (c.dups ||= []).push({ date: t.date, amount: t.amount_cents, id: t.id });
  }
  if (dupsNow.length) { const drop = new Set(dupsNow.map((d) => d.id)); curExpense = curExpense.filter((t) => !drop.has(t.id)); cur = { ...cur, expense: cur.expense - sum(dupsNow.map((d) => d.amount)), daily: Float64Array.from(cur.daily) }; for (const d of dupsNow) cur.daily[Dt.parse(d.date).d - 1] -= d.amount; for (let i = curDaily.length - 1; i >= 0; i--) curDaily[i] = cur.daily[s0 - 1 + i]; }
  for (const c of commits) { c.thisMonth = c.status === 'paid' ? { date: c.paidDate, amount: c.paidAmount } : null; }
  // a monthly payment is made once: if one has been paid this month, a lookalike still marked as due is the same payment under another date or amount, not a second charge
  const paidC = commits.filter((c) => c.status === 'paid'), disjoint = (x, y) => x.length && y.length && !x.some((k) => y.includes(k));
  const nameOk = (u, p) => !u.hasNote || !p.hasNote || sameName(u.name, p.name), sameAs = (u, p) => u.catId === p.catId && nameOk(u, p) && (sameName(u.name, p.name) || (disjoint(u.monthSet || [], p.monthSet || []) && Math.abs(u.amount - p.amount) <= 0.25 * Math.max(u.amount, p.amount)) || (u.rule && Math.abs(u.amount - p.amount) <= 0.15 * p.amount && Math.abs(u.day - p.day) <= 12));
  commits = commits.filter((u, i) => u.status === 'paid' || !(paidC.some((p) => sameAs(u, p)) || commits.slice(0, i).some((v) => v.status !== 'paid' && v.catId === u.catId && sameName(v.name, u.name))));
  const taggedNow = curExpense.filter((t) => t.recurring_id != null && !used.has(t.id));
  const isFixedNow = (t) => used.has(t.id) || t.recurring_id != null;
  const fixedPaidTx = curExpense.filter(isFixedNow);
  // previous months: which transactions were fixed (match a repeating payment, or carry a recurring tag)
  const isFixedPrior = (t) => t.recurring_id != null || commits.some((c) => c.months > 0 && (t.category_id ?? 0) === c.catId && Math.abs(t.amount_cents - c.amount) <= MATCH_TOL * c.amount && Math.abs(Dt.parse(t.date).d - c.day) <= DAY_TOL + 4);

  const split = (txs, fixedFn, from = 1, to = 31) => { const r = { fixed: 0, lump: 0, flex: 0, lumps: [], byCat: new Map(), varDaily: new Float64Array(31) };
    for (const t of txs) { const d = Dt.parse(t.date).d; if (d < from || d > to) continue; const cat = t.category_id ?? 0; let c = r.byCat.get(cat); if (!c) { c = { fixed: 0, lump: 0, flex: 0, lumps: [] }; r.byCat.set(cat, c); }
      if (fixedFn(t)) { r.fixed += t.amount_cents; c.fixed += t.amount_cents; continue; }
      r.varDaily[d - 1] += t.amount_cents;
      if (t.amount_cents >= lumpMin) { r.lump += t.amount_cents; c.lump += t.amount_cents; r.lumps.push({ date: t.date, note: t.note, amount: t.amount_cents, catId: cat }); c.lumps.push({ date: t.date, note: t.note, amount: t.amount_cents }); }
      else { r.flex += t.amount_cents; c.flex += t.amount_cents; } }
    return r; };
  const priorSplit = out.prior.map((p) => ({ p, s: split(p.txs, isFixedPrior, p.offset + 1) }));
  const nowSplit = split(curExpense, isFixedNow, s0, day);

  // ---- this month, in three buckets
  const flexUsual = weighted(priorSplit, ({ p, s }) => s.flex / p.days), lumpUsual = weighted(priorSplit, ({ s }) => s.lump) || 0;
  const flexNow = nowSplit.flex / covered, w = covered / (covered + 10), flexBlend = flexUsual != null ? w * flexNow + (1 - w) * flexUsual : flexNow;
  const upcoming = commits.filter((c) => c.status !== 'paid'), upcomingSum = sum(upcoming.map((c) => c.amount)), reserve = Math.max(0, lumpUsual - nowSplit.lump) * (left / dim);
  const projSpend = cur.expense + upcomingSum + reserve + flexBlend * left;
  const perDayNow = cur.expense / covered, expIncome = Math.max(cur.income, estIncome || 0), incomeBasis = cur.income >= (estIncome || 0) && cur.income > 0 ? 'received' : 'typical';
  out.now = { spent: cur.expense, income: cur.income, perDay: perDayNow, everydayPerDay: flexNow, blendPerDay: flexBlend, fixedPaid: nowSplit.fixed, oneOffs: nowSplit.lump, everydaySpent: nowSplit.flex, upcoming: upcomingSum, reserve, projSpend, expIncome, incomeBasis, projSaves: expIncome ? expIncome - projSpend : null, projRate: expIncome ? (expIncome - projSpend) / expIncome : null, usualEveryday: flexUsual };
  out.commit = { dups: dupsNow, dupsPrior, items: commits.sort((a, b) => a.day - b.day), paid: commits.filter((c) => c.status === 'paid'), upcoming, taggedNow: taggedNow.length, lumps: nowSplit.lumps.sort((a, b) => b.amount - a.amount), lumpMin, lumpUsual };

  // ---- best savings rate so far, and the everyday spend that repeats it
  const rated = out.prior.filter((p) => p.rate != null && p.income > 0); let best = null; for (const p of rated) if (!best || p.rate > best.rate) best = p;
  if (best && expIncome > 0) {
    const targetSpend = expIncome * (1 - best.rate), afterBills = targetSpend - cur.expense - upcomingSum, allowance = afterBills - reserve;
    // the reserve for unplanned big purchases is an estimate: if only that makes the goal unreachable, say the goal needs those to stay away rather than call it impossible
    const usable = allowance > 0 ? allowance : afterBills > 0 ? afterBills : null, needed = left > 0 && usable != null ? usable / left : null;
    out.best = { rate: best.rate, key: best.key };
    out.target = { spend: targetSpend, allowance, perDayNeeded: needed, reserveDropped: allowance <= 0 && afterBills > 0, status: afterBills <= 0 ? 'passed' : needed != null && flexBlend <= needed ? 'on-track' : 'tight', bestNowRate: (expIncome - cur.expense - upcomingSum) / expIncome, afterBills };
  }
  // ---- shape of the days, on variable spending (fixed payments removed so a rent day is not read as a spike)
  const priorVar = priorSplit.flatMap(({ p, s }) => Array.from(s.varDaily.slice(p.offset, p.offset + p.days)));
  out.dailyPrior = priorVar; out.dailyNow = Array.from(nowSplit.varDaily.slice(s0 - 1, day));
  out.skewPrior = dayStats(priorVar); out.skewNow = dayStats(out.dailyNow);
  const pool = dayStats([...priorVar, ...out.dailyNow]); out.skewAll = pool;
  if (pool && pool.spikeDays && left > 0) { const rate = pool.spikeDays / pool.n, expect = Math.round(rate * left); out.spikePlan = { expected: expect, mean: pool.spikeMean }; if (out.target && out.target.allowance > 0 && left > expect) out.spikePlan.ordinaryCap = Math.max(0, (out.target.allowance - expect * pool.spikeMean) / (left - expect)); }

  // ---- curves for the chart (index 0 = day 1): a usual month, this month, and the projection with each known payment as a step on its day
  const padded = out.prior.map((p) => [...new Array(p.offset).fill(0), ...p.daily]), priorCum = [];
  for (let d = 0; d < dim; d++) { let t = 0, k = 0; for (const p of padded) if (d < p.length) { t += sum(p.slice(0, d + 1)); k++; } priorCum.push(k ? t / k : null); }
  const curCum = []; let run = 0; for (let d = 0; d < dim; d++) { if (d < day) { run += cur.daily[d]; curCum.push(run); } else curCum.push(null); }
  const path = new Array(dim).fill(null); let acc = run; path[day - 1] = acc;
  for (let d = day; d < dim; d++) { acc += flexBlend + (left ? reserve / left : 0) + sum(upcoming.filter((c) => Math.min(c.day, dim) === d + 1 || (c.status === 'late' && d === day)).map((c) => c.amount)); path[d] = acc; }
  out.cum = { prior: priorCum, cur: curCum, proj: path, projEnd: projSpend, targetEnd: out.target ? out.target.spend : null };

  // ---- category by category
  const bmap = new Map(); if (budgets) for (const b of budgets.items) if (b.period === 'monthly' && b.category_id != null) bmap.set(b.category_id, b);
  const catIds = new Set([...nowSplit.byCat.keys(), ...priorSplit.flatMap(({ s }) => [...s.byCat.keys()]), ...commits.map((c) => c.catId)]);
  out.cats = [];
  for (const id of catIds) {
    const info = catInfo.get(id) || { name: 'Other', icon: '🏷️', color: '#8B97B3' };
    const nowC = nowSplit.byCat.get(id) || { fixed: 0, lump: 0, flex: 0, lumps: [] }, spent = nowC.fixed + nowC.lump + nowC.flex;
    const priorC = priorSplit.map(({ p, s }) => ({ p, c: s.byCat.get(id) || { fixed: 0, lump: 0, flex: 0 } }));
    const flexUsualC = priorC.length ? weighted(priorC, ({ p, c }) => c.flex / p.days) : null, lumpUsualC = priorC.length ? weighted(priorC, ({ c }) => c.lump) || 0 : 0, totalUsualC = priorC.length ? weighted(priorC, ({ p, c }) => (c.fixed + c.lump + c.flex) / p.days) : null;
    const myCommits = commits.filter((c) => c.catId === id), up = myCommits.filter((c) => c.status !== 'paid'), upSum = sum(up.map((c) => c.amount));
    if (spent <= 0 && !(totalUsualC > 0) && !up.length) continue;
    const flexNowC = nowC.flex / covered, rateC = flexUsualC != null ? w * flexNowC + (1 - w) * flexUsualC : flexNowC, resC = Math.max(0, lumpUsualC - nowC.lump) * (left / dim);
    const proj = spent + upSum + resC + rateC * left;
    // spread: daily swings of the variable part, over the days left
    const varDaily = [...priorC.flatMap(({ p }) => { const arr = new Array(p.days).fill(0); for (const t of p.txs) { if ((t.category_id ?? 0) === id && !isFixedPrior(t)) { const dd = Dt.parse(t.date).d - 1 - p.offset; if (dd >= 0 && dd < p.days) arr[dd] += t.amount_cents; } } return arr; }), ...(() => { const arr = new Array(covered).fill(0); for (const t of curExpense) if ((t.category_id ?? 0) === id && !isFixedNow(t)) { const dd = Dt.parse(t.date).d - s0; if (dd >= 0 && dd < covered) arr[dd] += t.amount_cents; } return arr; })()];
    const st = dayStats(varDaily), se = (st ? st.sd : 0) * Math.sqrt(Math.max(0, left));
    const b = bmap.get(id), limit = b ? b.limit_cents : null;
    const status = limit == null ? 'none' : proj > limit ? 'over' : proj > 0.85 * limit ? 'watch' : 'ok';
    const total = Array.from({ length: dim }, () => 0), prevAvg = [];
    for (const t of curExpense) if ((t.category_id ?? 0) === id) total[Dt.parse(t.date).d - 1] += t.amount_cents;
    for (let d = 0; d < dim; d++) { const vs = priorC.map(({ p }) => { let v = 0; for (const t of p.txs) if ((t.category_id ?? 0) === id && Dt.parse(t.date).d - 1 === d) v += t.amount_cents; return d - p.offset >= 0 && d < p.dim ? v : null; }).filter((v) => v != null); prevAvg.push(vs.length ? sum(vs) / vs.length : null); }
    const safeFlex = limit != null && left > 0 ? Math.max(0, (limit - spent - upSum - resC) / left) : null;
    out.cats.push({ id, name: info.name, icon: info.icon, color: info.color, spent, fixedPaid: nowC.fixed, oneOffs: nowC.lump, lumps: nowC.lumps.sort((a, c2) => c2.amount - a.amount), everydaySpent: nowC.flex,
      perDayNow: spent / covered, perDayEveryday: flexNowC, perDayUsual: totalUsualC, everydayUsual: flexUsualC, change: flexUsualC > 0 && covered >= 5 ? flexNowC / flexUsualC - 1 : null,
      upcoming: up.map((c) => ({ name: c.name, day: Math.min(c.day, dim), date: c.date, amount: c.amount, status: c.status, dueIn: c.dueIn })), upcomingSum: upSum, paid: myCommits.filter((c) => c.status === 'paid').map((c) => ({ name: c.name, date: c.paidDate, amount: c.paidAmount })), reserve: resC,
      proj, low: Math.max(spent + upSum, proj - se), high: proj + se, limit, status, overBy: limit != null ? Math.max(0, proj - limit) : 0, safePerDay: limit != null && left > 0 ? Math.max(0, (limit - spent) / left) : null, safeEveryday: safeFlex,
      stats: st, label: skewLabel(st), daily: total.slice(s0 - 1, day), prevAvg, top: curExpense.filter((t) => (t.category_id ?? 0) === id).sort((a, c2) => c2.amount_cents - a.amount_cents).slice(0, 3).map((t) => ({ date: t.date, note: t.note, amount: t.amount_cents })) });
  }
  const rank = { over: 0, watch: 1, ok: 2, none: 3 };
  out.cats.sort((a, b) => rank[a.status] - rank[b.status] || b.overBy - a.overBy || b.proj - a.proj);
  for (const p of out.prior) delete p.txs;                  // keep the result light
  return out;
}

// ---------------------------------------------------------------------------------------------------- words
const pc1 = (x) => `${(x * 100).toFixed(1)}%`;
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (key) => MON[Number(key.slice(5)) - 1];
export const ordinal = (d) => `${d}${d % 100 >= 11 && d % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][d % 10]}`;
export const whenText = (dueIn) => (dueIn === 0 ? 'today' : dueIn === 1 ? 'tomorrow' : dueIn > 1 ? `in ${dueIn} days` : dueIn === -1 ? 'yesterday' : `${-dueIn} days ago`);
const nameList = (items, n = 2) => { const l = items.slice(0, n).map((c) => `${c.name} on the ${ordinal(c.day)}`).join(', '), more = items.length - n; return more > 0 ? `${l} and ${more} more` : l; };

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
  const n = a.now, t = a.target, up = a.commit.upcoming;
  const everyday = [`Based on this month's trend your everyday spending is `, ['b', `${fmt(n.everydayPerDay)} per day`], n.fixedPaid > 0 ? ` (not counting ${fmt(n.fixedPaid)} of fixed payments already made)` : '', `. `];
  if (t && a.best) {
    const when = `${pc1(a.best.rate)} savings, your best so far (${monthName(a.best.key)})`;
    if (t.status === 'passed') lines.push({ id: 'now', icon: '⏱️', parts: [...everyday, `Between what is spent and what is still due, the ${fmt(t.spend)} that ${when} allows is already used up, so that rate is out of reach this month. The best still possible is `, ['b', pc1(Math.max(0, t.bestNowRate))], `.`] });
    else if (a.left === 0) lines.push({ id: 'now', icon: '⏱️', parts: [...everyday, `This is the last day of the month: you will finish at about `, ['b', pc1(n.projRate ?? 0)], ` savings against your best of ${pc1(a.best.rate)}.`] });
    else lines.push({ id: 'now', icon: '⏱️', parts: [...everyday, `To reach ${when}, keep everyday spending to about `, ['b', `${fmt(t.perDayNeeded)} per day`], ` for the remaining ${a.left} day${a.left === 1 ? '' : 's'}`, up.length ? `, after setting aside ${fmt(a.now.upcoming)} for ${nameList(up)}` : '', `.`, t.reserveDropped ? ' That only works if no unplanned big purchase turns up.' : '', t.status === 'on-track' ? [' ok', ` At the pace we expect (${fmt(n.blendPerDay)} per day, blending your usual with this month so far) you are under that.`] : ` At the pace we expect (${fmt(n.blendPerDay)} per day, blending your usual with this month so far) you would be over it.`] });
  } else if (a.hasPrior === false) {
    lines.push({ id: 'now', icon: '⏱️', parts: [`This month your everyday spending is `, ['b', `${fmt(n.everydayPerDay)} per day`], n.fixedPaid > 0 ? ` (not counting ${fmt(n.fixedPaid)} of fixed payments already made)` : '', `. Once you have a full previous month, we will compare it with your best savings rate.`] });
  }
  return lines;
}

/** Plain-words guidance for the whole month, most useful first. Each item: {tone, icon, title, text}. */
export function paceAdvice(a, fmt) {
  const out = [], n = a.now, t = a.target, c = a.commit, up = c.upcoming, paid = c.paid;
  if (!a.ok) return out;
  // 0. the same payment entered twice
  if (c.dups && c.dups.length) out.push({ tone: 'warn', icon: '👯', title: 'A payment looks entered twice', text: `${c.dups.map((d) => `${d.name} ${fmt(d.amount)} on the ${ordinal(Dt.parse(d.date).d)}`).join('; ')} ${c.dups.length === 1 ? 'matches' : 'match'} a payment already made this month. We count each of these payments once and leave the extra entry out of every figure. If it really is a second charge, ignore this; if not, delete the extra entry in Transactions.` });
  // 0b. a recurring rule set for a different day than the entries really land on
  const off = c.items.filter((x) => x.ruleInfo?.conflict); if (off.length) out.push({ tone: 'warn', icon: '🔁', title: 'A recurring rule is set for a different day', text: `${off.map((x) => `${x.name}: the rule says the ${ordinal(x.ruleInfo.day)}, but your entries land on the ${ordinal(x.day)}`).slice(0, 3).join('; ')}. We follow your entries. Change the rule's date in Settings → Recurring, otherwise it may add an extra entry on the wrong day.` });
  // 1. where the month is heading
  if (n.projRate != null) {
    const gap = a.best ? n.projRate - a.best.rate : null;
    out.push({ tone: gap != null && gap < -0.02 ? 'warn' : 'good', icon: gap != null && gap < -0.02 ? '📉' : '📈', title: 'Where this month is heading',
      text: `With ${fmt(n.spent)} spent, ${fmt(n.upcoming)} still due and about ${fmt(n.blendPerDay * a.left + n.reserve)} of everyday and one-off spending to come, you are on course to spend ${fmt(n.projSpend)} and save ${pc1(n.projRate)}${a.best ? ` (your best is ${pc1(a.best.rate)})` : ''}.` });
  }
  // 2. what is still coming, with the date
  if (up.length) {
    const next = up[0], soon = up.filter((x) => x.dueIn >= 0 && x.dueIn <= 3);
    out.push({ tone: soon.length ? 'warn' : 'info', icon: '📅', title: up.length === 1 ? 'A payment is still due' : `${up.length} payments are still due`,
      text: `${up.map((x) => `${x.name} ${fmt(x.amount)} ${x.status === 'late' ? `(expected around the ${ordinal(x.day)}, not seen yet)` : `on the ${ordinal(x.day)} (${whenText(x.dueIn)})`}`).slice(0, 3).join('; ')}${up.length > 3 ? ` and ${up.length - 3} more` : ''}. Expect a jump on ${next.status === 'late' ? 'the day it lands' : `the ${ordinal(next.day)}`}${t && t.perDayNeeded != null && a.left > 0 ? `; on the other days keep everyday spending to about ${fmt(Math.max(0, t.perDayNeeded))} to stay on your savings goal` : ''}.` });
  } else if (a.left > 0 && (paid.length || c.items.length)) out.push({ tone: 'good', icon: '✅', title: 'Nothing fixed is left to pay', text: 'Every regular payment we expected this month has been made, so the rest of the month is everyday spending only.' });
  // 3. already paid, not extrapolated
  if (paid.length || n.fixedPaid > 0) out.push({ tone: 'info', icon: '🧾', title: 'Already paid, not repeated', text: `${fmt(n.fixedPaid)} of fixed payments${paid.length ? ` (${paid.slice(0, 3).map((x) => `${x.name} ${fmt(x.paidAmount)} on the ${ordinal(Dt.parse(x.paidDate).d)}`).join(', ')}${paid.length > 3 ? ` and ${paid.length - 3} more` : ''})` : ''} are done for the month. They are counted once and are not spread over the days left, so they do not inflate your daily pace.` });
  // 4. one-offs
  if (c.lumps.length) out.push({ tone: 'info', icon: '🛍️', title: 'One-off spending left out of the daily pace', text: `${c.lumps.slice(0, 2).map((x) => `${fmt(x.amount)}${x.note ? ` (${x.note})` : ''} on the ${ordinal(Dt.parse(x.date).d)}`).join(' and ')}${c.lumps.length > 2 ? ` and ${c.lumps.length - 2} more` : ''} were single big purchases, so they are not repeated each day.` });
  if (n.reserve > 0) out.push({ tone: 'info', icon: '🧯', title: 'Room for the unexpected', text: `Past months had about ${fmt(c.lumpUsual)} of unplanned big purchases. ${fmt(n.reserve)} of that is set aside for the days left; spend less than that and your savings improve.` });
  // 5. the shape of everyday days
  const sk = a.skewAll && a.hasPrior ? skewInsight(a.skewAll, fmt, a.spikePlan) : null; if (sk && sk.title !== 'Too early to tell') out.push(sk);
  return out;
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
  if (s.median === 0 && s.zeroShare >= 0.3) return { tone: 'good', icon: '✅', title: 'Steady, on some days only', text: `You spend on about ${s.n - s.zeroDays} of every ${s.n} days, averaging ${fmt(s.mean / (1 - s.zeroShare))} on those days (${fmt(s.mean)} a day overall). That regular rhythm, rather than one-off splurges, decides your savings.` };
  return { tone: 'good', icon: '✅', title: 'Steady spender', text: `Most days land near ${fmt(s.median)} (average ${fmt(s.mean)}), so your daily level, not one-off splurges, decides your savings.${zero}` };
}

/** What to know about one category: what is paid, what is due, what repeats and what to do about it. */
export function catAdvice(c, fmt, a) {
  const out = [];
  if (c.limit != null) out.push({ tone: c.status === 'over' ? 'warn' : c.status === 'watch' ? 'info' : 'good', icon: c.status === 'over' ? '⚠️' : c.status === 'watch' ? '👀' : '✅',
    text: c.status === 'over' ? `On this pace you will pass the ${fmt(c.limit)} budget by ${fmt(c.overBy)}.` : c.status === 'watch' ? `Close to the ${fmt(c.limit)} budget.` : `Comfortably inside the ${fmt(c.limit)} budget.` });
  if (c.paid.length) out.push({ tone: 'info', icon: '🧾', text: `${c.paid.map((x) => `${x.name} ${fmt(x.amount)} on the ${ordinal(Dt.parse(x.date).d)}`).join(', ')} already paid. It is not spread over the days left.` });
  if (c.upcoming.length) out.push({ tone: 'warn', icon: '📅', text: `Still to come: ${c.upcoming.map((x) => `${x.name} ${fmt(x.amount)} ${x.status === 'late' ? `(expected around the ${ordinal(x.day)})` : `on the ${ordinal(x.day)} (${whenText(x.dueIn)})`}`).join('; ')}. Spend may jump that day.` });
  if (c.oneOffs > 0) out.push({ tone: 'info', icon: '🛍️', text: `${c.lumps.slice(0, 2).map((x) => `${fmt(x.amount)}${x.note ? ` (${x.note})` : ''} on the ${ordinal(Dt.parse(x.date).d)}`).join(' and ')} counted once, not repeated daily.` });
  if (c.safeEveryday != null && a.left > 0) out.push({ tone: 'info', icon: '🎯', text: `${c.upcoming.length ? 'After the payment' + (c.upcoming.length > 1 ? 's' : '') + ' due, ' : ''}keep everyday spending here to about ${fmt(c.safeEveryday)} per day to stay inside the budget.` });
  if (c.change != null && Math.abs(c.change) >= 0.15) out.push({ tone: c.change > 0 ? 'warn' : 'good', icon: c.change > 0 ? '↑' : '↓', text: `Everyday spending is ${c.change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(c.change) * 100)}% on your usual ${fmt(c.everydayUsual)} a day.` });
  if (c.label === 'spiky' && c.stats) out.push({ tone: 'info', icon: '🎢', text: `${c.stats.spikeDays} big day${c.stats.spikeDays === 1 ? '' : 's'} make ${Math.round(c.stats.spikeShare * 100)}% of the variable spending, so one purchase can swing the month.` });
  else if (c.label === 'steady' && c.stats?.reliable) out.push({ tone: 'good', icon: '〰️', text: 'Everyday spending here is steady from day to day.' });
  return out.length ? out : [{ tone: 'info', icon: '🌱', text: 'Not enough history yet.' }];
}
/** Kept for older callers: one line of the same reading. */
export function catInsight(c, fmt, a) { return catAdvice(c, fmt, a || { left: 0 }).map((x) => x.text).join(' '); }
