// Screen: Spending pace. The two Smart-tip lines in full, a month-so-far chart, the shape of your spending days, and budget-by-budget predictions with a drill-down.
// Layout rules used throughout: every figure sits in its own cell (label above value, value never wraps), rows are grids with minmax(0, 1fr) columns, and headline amounts are
// shown without decimals so they always fit. The two sentences keep the full precision.
import { h, html, raw, get, bind, money, I, sheet, qs } from './core.js';
import { barColor } from './charts.js';
import { paceLines, paceAdvice, catAdvice, skewInsight, monthName, ordinal, whenText } from './pace.js';

const m0 = (c) => money(c, { decimals: false });
const mc = (c) => money(c, { compact: true, decimals: false });
const nice = (v) => { const p = 10 ** Math.floor(Math.log10(Math.max(v, 1))); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p; return 10 * p; };
const part = (p) => (Array.isArray(p) ? h`<b class="${{ b: '', ok: 'pos', pos: 'pos', neg: 'neg' }[p[0].trim()] ?? ''}">${p[1]}</b>` : p);
const pc1 = (x) => `${(x * 100).toFixed(1)}%`;
let scope = 'now';                       // which month the day-shape card shows

// a labelled figure: label on top, value below, never wrapping
const cell = (label, value, cls = '') => h`<div class="pk"><span>${label}</span><b class="${cls}">${value}</b></div>`;

// ---------------------------------------------------------------------------------------------- charts (inline SVG, no libraries)
function cumChart(a) {
  const W = 340, H = 200, L = 44, R = 10, T = 12, B = 24, iw = W - L - R, ih = H - T - B, dim = a.dim, day = a.day;
  const all = [...a.cum.prior, ...a.cum.cur, a.cum.projEnd, a.cum.targetEnd].filter((v) => v != null), max = nice(Math.max(...all, 1));
  const X = (d) => L + (d / Math.max(1, dim - 1)) * iw, Y = (v) => T + ih - (v / max) * ih;
  const path = (arr) => { let p = '', open = false; arr.forEach((v, i) => { if (v == null) { open = false; return; } p += `${open ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; open = true; }); return p; };
  const grid = [0, 1 / 3, 2 / 3, 1].map((g) => `<line x1="${L}" x2="${W - R}" y1="${Y(max * g)}" y2="${Y(max * g)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${L - 6}" y="${Y(max * g) + 3.5}" text-anchor="end" font-size="9.5" fill="var(--dim)">${mc(max * g)}</text>`).join('');
  const xl = [1, Math.round(dim / 4), Math.round(dim / 2), Math.round((3 * dim) / 4), dim].map((d) => `<text x="${X(d - 1)}" y="${H - 7}" text-anchor="middle" font-size="10" fill="var(--dim)">${d}</text>`).join('');
  const cur = a.cum.cur[day - 1] ?? 0, proj = path(a.cum.proj), tgt = a.cum.targetEnd != null ? `M${X(day - 1)} ${Y(cur)}L${X(dim - 1)} ${Y(a.cum.targetEnd)}` : '';
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Spending this month compared with a usual month">${grid}${xl}
    <line x1="${X(day - 1)}" x2="${X(day - 1)}" y1="${T}" y2="${T + ih}" stroke="var(--muted)" stroke-dasharray="2 3" opacity=".6"/>
    <path d="${path(a.cum.prior)}" fill="none" stroke="var(--muted)" stroke-width="2" opacity=".75"/>
    ${tgt ? `<path d="${tgt}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
    <path d="${proj}" fill="none" stroke="var(--amber)" stroke-width="2" stroke-dasharray="5 4"/>
    <path d="${path(a.cum.cur)}" fill="none" stroke="var(--text)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${a.commit.upcoming.filter((c) => c.status !== 'late' && a.cum.proj[Math.min(c.day, dim) - 1] != null).map((c) => `<circle cx="${X(Math.min(c.day, dim) - 1)}" cy="${Y(a.cum.proj[Math.min(c.day, dim) - 1])}" r="4" fill="var(--bg)" stroke="var(--amber)" stroke-width="2"/>`).join('')}
    <circle cx="${X(day - 1)}" cy="${Y(cur)}" r="4.5" fill="var(--text)"/></svg>`);
}
const spark = (vals, fence, w = 64, hgt = 22) => { const mx = Math.max(...vals, 1), bw = w / Math.max(vals.length, 1); return raw(`<svg viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" aria-hidden="true">${vals.map((v, i) => { const bh = v > 0 ? Math.max(2, (v / mx) * (hgt - 2)) : 1; return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(hgt - bh).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${v > fence && v > 0 ? 'var(--red)' : v === 0 ? 'var(--line)' : 'var(--accent)'}"/>`; }).join('')}</svg>`); };
function dayBars(c, a) {
  const W = 340, H = 170, L = 40, R = 8, T = 10, B = 22, iw = W - L - R, ih = H - T - B, dim = a.dim, st = c.stats;
  const mx = nice(Math.max(...c.daily, ...c.prevAvg.filter((v) => v != null), c.limit ? c.limit / dim : 0, 1)), Y = (v) => T + ih - (v / mx) * ih, slot = iw / dim, bw = Math.max(2, slot - 1.5), fence = st ? st.fence : Infinity;
  const bars = c.daily.map((v, i) => (v > 0 ? `<rect x="${(L + i * slot).toFixed(1)}" y="${Y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(T + ih - Y(v)).toFixed(1)}" rx="2" fill="${v > fence ? 'var(--red)' : 'var(--accent)'}"><title>Day ${i + 1}: ${m0(v)}</title></rect>` : '')).join('');
  let p = '', open = false; c.prevAvg.forEach((v, i) => { if (v == null) { open = false; return; } p += `${open ? 'L' : 'M'}${(L + i * slot + bw / 2).toFixed(1)} ${Y(v).toFixed(1)}`; open = true; });
  const grid = [0, 0.5, 1].map((g) => `<line x1="${L}" x2="${W - R}" y1="${Y(mx * g)}" y2="${Y(mx * g)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${L - 5}" y="${Y(mx * g) + 3.5}" text-anchor="end" font-size="9.5" fill="var(--dim)">${mc(mx * g)}</text>`).join('');
  const xl = [1, Math.round(dim / 2), dim].map((d) => `<text x="${L + (d - 1) * slot + bw / 2}" y="${H - 7}" text-anchor="middle" font-size="10" fill="var(--dim)">${d}</text>`).join('');
  const lim = c.limit ? `<line x1="${L}" x2="${W - R}" y1="${Y(c.limit / dim)}" y2="${Y(c.limit / dim)}" stroke="var(--amber)" stroke-dasharray="5 4" stroke-width="1.6"/>` : '';
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Daily spending in ${c.name}">${grid}${xl}${bars}<path d="${p}" fill="none" stroke="var(--muted)" stroke-width="1.8" opacity=".85"/>${lim}</svg>`);
}
/** Day-size buckets: how many days fall into each size, and how much of the money those days carry. */
function buckets(st) {
  if (!st || !st.n) return null;
  const ref = st.median > 0 ? st.median : st.mean || 1, fence = Math.max(st.fence, 1.5 * ref);
  return [['No spend', (v) => v === 0, '#1DDB97'], ['Small', (v) => v > 0 && v <= 0.5 * ref, '#4C8DF6'], ['Typical', (v) => v > 0.5 * ref && v <= 1.5 * ref, '#8B97B3'], ['High', (v) => v > 1.5 * ref && v <= fence, '#F5A623'], ['Big spike', (v) => v > fence, '#F04444']];
}

/** A month strip: today, and each fixed payment as a dot on its day (green = paid, amber = still due, red = expected earlier). */
function monthStrip(a) {
  const W = 340, H = 62, L = 12, R = 12, y = 26, dim = a.dim, X = (d) => L + ((d - 1) / Math.max(1, dim - 1)) * (W - L - R);
  const dots = a.commit.items.map((c) => { const d = c.status === 'paid' ? Math.min(Dt_d(c.paidDate), dim) : Math.min(c.day, dim), col = c.status === 'paid' ? 'var(--accent)' : c.status === 'late' ? 'var(--red)' : 'var(--amber)';
    return `<circle cx="${X(d)}" cy="${y}" r="7" fill="${c.status === 'paid' ? col : 'var(--bg)'}" stroke="${col}" stroke-width="2.5"><title>${c.name}: day ${d}</title></circle><text x="${X(d)}" y="${y + 22}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${d}</text>`; }).join('');
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Fixed payments across the month"><line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="3" stroke-linecap="round"/><line x1="${L}" x2="${X(a.day)}" y1="${y}" y2="${y}" stroke="var(--muted)" stroke-width="3" stroke-linecap="round" opacity=".5"/>
    <path d="M${X(a.day)} ${y - 16}l-5 -8h10z" fill="var(--text)"/>${dots}</svg>`);
}
const Dt_d = (date) => Number(String(date).slice(8, 10));
const tone = (t) => (t === 'warn' ? 'warn' : t === 'good' ? 'good' : '');

// ---------------------------------------------------------------------------------------------- screen
export async function screen(root) {
  const s = await get('/summary'), a = s.pace, fmt = (c) => money(c);
  const head = h`<div class="page-head"><a class="iconbtn" href="#/dashboard" aria-label="Back">${I.back}</a><h1 style="font-size:22px">Spending pace</h1><button class="iconbtn" data-act="how" aria-label="How this is calculated" style="font-weight:800">?</button></div>`;
  if (!a?.ok) { html(root, h`${head}<div class="card"><div class="empty"><span class="e">📊</span>Add a few days of income and expenses and your spending pace will appear here.</div></div>`); return bind(root, { click: { how: howSheet } }); }
  const lines = paceLines(a, fmt), n = a.now, u = a.usual, t = a.target;
  const sk = a.skewAll && a.hasPrior ? skewInsight(a.skewAll, fmt, a.spikePlan) : null, skNow = a.skewNow ? skewInsight(a.skewNow, fmt, a.spikePlan) : null;
  const status = t ? { 'on-track': ['pos', 'On track'], tight: ['warn', 'Tight'], passed: ['neg', 'Out of reach'] }[t.status] : null;
  const usualEnd = a.cum.prior[a.dim - 1], advice = paceAdvice(a, fmt);

  const shapeCard = () => {
    const st = scope === 'now' ? a.skewNow : a.skewPrior, defs = buckets(st), days = scope === 'now' ? a.dailyNow : a.dailyPrior, ins = scope === 'now' ? skNow : sk;
    const rows = defs ? defs.map(([label, test, col]) => { const sel = days.filter(test), amt = sel.reduce((x, y) => x + y, 0); return { label, col, n: sel.length, share: st.total ? amt / st.total : 0, dayShare: sel.length / days.length }; }) : [];
    return h`<div class="card"><div class="ph"><div class="eyebrow">The shape of your everyday spending</div>
        <div class="seg small" role="tablist" aria-label="Which days"><button class="${scope === 'now' ? 'on' : ''}" data-act="scope" data-k="now" role="tab">This month</button>${a.hasPrior ? h`<button class="${scope === 'prior' ? 'on' : ''}" data-act="scope" data-k="prior" role="tab">Usual</button>` : ''}</div></div>
      ${rows.length ? h`<div class="shape"><div class="shead"><span></span><span>Days</span><span>Of spend</span></div>${rows.map((r) => h`<div class="srow"><span class="sl"><i style="background:${r.col}"></i>${r.label}</span><b>${r.n}</b><b>${Math.round(r.share * 100)}%</b><div class="pbar sbar"><i style="width:${Math.max(r.n ? 3 : 0, r.dayShare * 100)}%;background:${r.col}"></i></div></div>`)}</div>` : h`<div class="muted small">Not enough days yet.</div>`}
      ${ins ? h`<div class="insight ${ins.tone}"><span class="ic">${ins.icon}</span><div class="grow"><b>${ins.title}</b><div class="itext">${ins.text}</div></div></div>` : ''}
      ${st && st.n >= 5 ? h`<div class="note" style="margin-top:10px">Fixed payments like rent are left out. Skew ${st.skew.toFixed(2)}. Above 1: a few big days pull the average up. Near 0: steady. Below −0.5: a few very light days pull it down.</div>` : ''}</div>`;
  };
  const catNote = (c) => { const next = c.upcoming[0]; return next ? h`<div class="cr-note warn">📅 ${next.name} ${m0(next.amount)} ${next.status === 'late' ? `expected around the ${ordinal(next.day)}` : `on the ${ordinal(next.day)} (${whenText(next.dueIn)})`}${c.upcoming.length > 1 ? ` +${c.upcoming.length - 1} more` : ''}</div>` : c.fixedPaid > 0 && c.everydaySpent === 0 && c.oneOffs === 0 ? h`<div class="cr-note">🧾 Paid · nothing more expected this month</div>` : c.fixedPaid > 0 ? h`<div class="cr-note">🧾 ${m0(c.fixedPaid)} fixed already paid, not repeated</div>` : ''; };
  const catRow = (c) => {
    const base = c.limit ?? (c.perDayUsual > 0 ? c.perDayUsual * a.dim : null), fracSpent = base ? Math.min(1, c.spent / base) : 0, fracProj = base ? Math.min(1.25, c.proj / base) : 0, col = c.limit ? barColor(Math.min(1, c.proj / c.limit)) : 'var(--muted)';
    const st = c.status === 'over' ? ['neg', c.limit != null && c.spent > c.limit ? 'Over budget' : `Over by ${m0(c.overBy)}`] : c.status === 'watch' ? ['warn', 'Watch'] : c.status === 'ok' ? ['pos', 'On track'] : ['muted', 'No budget'];
    return h`<button class="catrow" data-act="cat" data-id="${c.id}">
      <div class="cr-top"><span class="cr-name"><span class="cr-ic">${c.icon}</span><b>${c.name}</b></span><span class="cr-proj"><b>${m0(c.proj)}</b><small>projected</small></span></div>
      <div class="pbar tall"><i class="ghost" style="width:${Math.min(100, fracProj * 100)}%;background:${col}"></i><i style="width:${Math.min(100, fracSpent * 100)}%;background:${col}"></i>${c.limit && fracProj > 1 ? h`<em class="over">▲</em>` : ''}</div>
      <div class="cr-grid">${cell('So far', m0(c.spent))}${cell('Everyday / day', m0(c.perDayEveryday))}${cell('Still due', c.upcomingSum > 0 ? m0(c.upcomingSum) : '—', c.upcomingSum > 0 ? 'warn' : '')}${cell('Budget', c.limit != null ? m0(c.limit) : 'None')}</div>
      ${catNote(c)}
      <div class="cr-foot"><span class="cr-tags"><b class="${st[0]}">${st[1]}</b>${c.label !== 'steady' ? h`<span class="pill ${c.label === 'spiky' ? 'bad' : ''}">${c.label === 'spiky' ? '🎢 spiky' : c.label === 'big-day heavy' ? '🧱 big days' : '🎢 leaning spiky'}</span>` : h`<span class="pill">〰️ steady</span>`}${c.change != null && Math.abs(c.change) >= 0.15 ? h`<span class="pill ${c.change > 0 ? 'bad' : ''}">${c.change > 0 ? '↑' : '↓'} ${Math.round(Math.abs(c.change) * 100)}%</span>` : ''}</span>${spark(c.daily, c.stats ? c.stats.fence : Infinity)}</div></button>`;
  };
  const over = a.cats.filter((c) => c.status === 'over').length, watch = a.cats.filter((c) => c.status === 'watch').length, ok = a.cats.filter((c) => c.status === 'ok').length;

  const draw = () => html(root, h`${head}
    <div class="card glow"><div class="ph"><div class="eyebrow">${monthName(a.curKey)} · day ${a.day} of ${a.dim}</div>${status ? h`<span class="pill ${status[0] === 'neg' ? 'bad' : ''}"><span class="${status[0]}">${status[1]}</span></span>` : ''}</div>
      <div class="pgrid">
        <div class="pstat"><div class="eyebrow">Usual month</div>${u ? h`<div class="pbig">${m0(u.perDay)}<small>/day</small></div>${u.saves != null ? h`<div class="pkv">${cell('Saves', m0(u.saves), u.saves >= 0 ? 'pos' : 'neg')}${cell('Rate', pc1(u.rate ?? 0), u.saves >= 0 ? 'pos' : 'neg')}</div>` : h`<div class="note">Log income to see savings.</div>`}<div class="note">From ${u.months} previous month${u.months === 1 ? '' : 's'}</div>` : h`<div class="note" style="margin-top:8px">Needs one full previous month.</div>`}</div>
        <div class="pstat"><div class="eyebrow">This month, everyday</div><div class="pbig">${m0(n.everydayPerDay)}<small>/day</small></div>${n.projRate != null ? h`<div class="pkv">${cell('On pace to save', m0(n.projSaves), n.projSaves >= 0 ? 'pos' : 'neg')}${cell('Rate', pc1(n.projRate), n.projSaves >= 0 ? 'pos' : 'neg')}</div>` : h`<div class="pkv">${cell('Spent', m0(n.spent))}</div>`}<div class="note">Fixed ${m0(n.fixedPaid)} paid · ${m0(n.upcoming)} still due. ${n.incomeBasis === 'received' ? 'Income received.' : 'Typical income used.'}${a.lowConfidence ? ' Early in the month, figures will settle.' : ''}</div></div></div>
      ${t ? h`<div class="pbox"><div class="pkv wide">${cell('Best month so far', `${monthName(a.best.key).slice(0, 3)} · ${pc1(a.best.rate)}`, 'pos')}${t.status === 'passed' ? cell('Best still possible', pc1(Math.max(0, t.bestNowRate)), 'neg') : cell('Everyday spend to repeat it', m0(t.perDayNeeded))}${t.status === 'passed' ? '' : cell('Everyday now', m0(n.blendPerDay))}</div>
        ${t.status === 'passed' ? h`<div class="note neg" style="margin-top:8px">That rate is out of reach this month.</div>` : h`<div class="pbar tall" style="margin-top:12px"><i style="width:${Math.min(100, (n.blendPerDay / (t.perDayNeeded || 1)) * 100)}%;background:${barColor(Math.min(1, n.blendPerDay / (t.perDayNeeded || 1)))}"></i></div>`}</div>` : ''}
      <div class="plines">${lines.map((l) => h`<div class="pl"><span class="ic">${l.icon}</span><span class="grow">${l.parts.map(part)}</span></div>`)}</div></div>

    <div class="card"><div class="eyebrow" style="margin-bottom:2px">What to do from today</div><div class="note" style="margin-bottom:6px">Day ${a.day} of ${a.dim}: ${a.left} day${a.left === 1 ? '' : 's'} left. Updates with every entry you add.</div>
      ${advice.map((x) => h`<div class="insight ${tone(x.tone)}"><span class="ic">${x.icon}</span><div class="grow"><b>${x.title}</b><div class="itext">${x.text}</div></div></div>`)}</div>

    ${a.commit.items.length || a.commit.lumps.length ? h`<div class="card"><div class="ph"><div class="eyebrow">Payments this month</div><span class="note">${a.commit.paid.length} paid · ${a.commit.upcoming.length} due · tap for details</span></div>
      ${a.commit.items.length ? h`<div class="chart">${monthStrip(a)}</div>` : ''}
      <div class="col" style="gap:2px;margin-top:6px">${a.commit.items.map((c, i) => h`<button class="payrow" data-act="pay" data-i="${i}"><span class="pdot ${c.status}"></span><span class="grow"><b>${c.name}</b><div class="note">${c.status === 'paid' ? `Paid on the ${ordinal(Number(c.paidDate.slice(8)))} · not repeated` : c.status === 'late' ? `Expected around the ${ordinal(c.day)}, not seen yet` : c.status === 'today' ? 'Due today' : `Due on the ${ordinal(c.day)} · ${whenText(c.dueIn)}`}</div></span><span class="payamt"><b class="${c.status === 'paid' ? '' : c.status === 'late' ? 'neg' : 'warn'}">${m0(c.status === 'paid' ? c.paidAmount : c.amount)}</b>${c.dups?.length ? h`<small class="neg">entered twice</small>` : ''}</span></button>`)}
        ${a.commit.lumps.map((l) => h`<div class="payrow"><span class="pdot oneoff"></span><span class="grow"><b>${l.note || 'One-off purchase'}</b><div class="note">One-off on the ${ordinal(Number(l.date.slice(8)))} · left out of the daily pace</div></span><b>${m0(l.amount)}</b></div>`)}</div></div>` : ''}

    <div class="card"><div class="eyebrow" style="margin-bottom:6px">Money out, day by day</div>
      <div class="chart">${cumChart(a)}</div>
      <div class="plegend"><span><i style="background:var(--text)"></i>This month</span><span><i style="background:var(--muted)"></i>A usual month</span><span><i class="dash" style="border-color:var(--amber)"></i>On this pace</span>${t ? h`<span><i class="dash" style="border-color:var(--accent)"></i>To repeat ${pc1(a.best.rate)}</span>` : ''}</div>
      <div class="pkv wide" style="margin-top:12px">${usualEnd != null ? cell('Usual month-end', m0(usualEnd)) : ''}${cell('On this pace', m0(n.projSpend), 'warn')}${t ? cell('Target', m0(t.spend), 'pos') : ''}</div></div>

    ${shapeCard()}

    <div class="card"><div class="ph"><h2 style="font-size:18px">Budget by budget</h2><a class="link" href="#/budgets">Budgets →</a></div>
      <div class="pcount"><span class="neg"><b>${over}</b> will go over</span><span class="warn"><b>${watch}</b> to watch</span><span class="pos"><b>${ok}</b> on track</span></div>
      <div class="col" style="gap:10px">${a.cats.map(catRow)}${!a.cats.length ? h`<div class="muted small">No spending recorded yet this month.</div>` : ''}</div>
      <div class="note" style="margin-top:12px">Tap a row to drill down. The faint bar is the projected month-end; the solid bar is what you have spent.</div></div>`);
  draw();
  bind(root, { click: { how: howSheet, scope: (el) => { scope = el.dataset.k; draw(); }, cat: (el) => drill(a, Number(el.dataset.id)), pay: (el) => payDetail(a, Number(el.dataset.i)) } });
}

const shortDate = (d) => `${monthName(d.slice(0, 7)).slice(0, 3)} ${Number(d.slice(8, 10))}`;
/** "How we counted this": the evidence behind one payment, so a wrong guess is easy to spot and fix. */
function payDetail(a, i) {
  const c = a.commit.items[i]; if (!c) return; const fmt = (x) => money(x);
  const why = [c.ruleInfo ? `You set it to repeat ${c.ruleInfo.frequency}${c.ruleInfo.next ? `; its next date is ${shortDate(c.ruleInfo.next)}` : ''}.` : null, c.seen?.length ? `Seen in earlier months on ${c.seen.map(shortDate).join(', ')}.` : 'Not seen in earlier months yet.', c.source === 'recurring' && !c.ruleInfo ? 'Those entries carry your recurring tag.' : null].filter(Boolean);
  sheet(h`<div class="ph"><h1 style="font-size:20px">${c.name}</h1><button class="iconbtn" data-act="close" aria-label="Close">${I.close}</button></div>
    <div class="pgrid"><div class="pstat"><div class="eyebrow">${c.status === 'paid' ? 'Paid this month' : 'Expected'}</div><div class="pbig">${m0(c.status === 'paid' ? c.paidAmount : c.amount)}</div><div class="note">${c.status === 'paid' ? `On ${shortDate(c.paidDate)}` : `Around the ${ordinal(c.day)} · ${c.status === 'late' ? 'not seen yet' : whenText(c.dueIn)}`}</div></div>
      <div class="pstat"><div class="eyebrow">Usual amount</div><div class="pbig">${m0(c.amount)}</div><div class="note">${c.months ? `${c.months} previous month${c.months === 1 ? '' : 's'}` : 'From your recurring rule'}</div></div></div>
    <div><div class="eyebrow" style="margin-bottom:6px">Why this counts as a regular payment</div>${why.map((w) => h`<div class="insight"><span class="ic">🔎</span><div class="grow itext">${w}</div></div>`)}</div>
    <div class="insight good"><span class="ic">1️⃣</span><div class="grow itext"><b>Counted once a month.</b> ${c.status === 'paid' ? 'It is already paid, so it is not spread over the days left.' : 'It is added on its date, not spread over the days.'}</div></div>
    ${c.dups?.length ? h`<div class="insight warn"><span class="ic">👯</span><div class="grow itext"><b>Entered again.</b> ${c.dups.map((d) => `${fmt(d.amount)} on ${shortDate(d.date)}`).join(', ')} looks like the same payment. It is left out of every figure here. If it is a second charge, ignore this; otherwise delete the extra entry.</div></div>` : ''}
    <div class="row" style="gap:10px"><a class="btn ghost" href="#/transactions${qs({ q: c.name })}" data-act="close" style="flex:1;text-align:center">See entries</a><button class="btn" data-act="close" style="flex:1">Done</button></div>`);
}

function drill(a, id) {
  const c = a.cats.find((x) => x.id === id); if (!c) return; const fmt = (x) => money(x), adv = catAdvice(c, fmt, a);
  const sk = c.stats && c.stats.n >= 5 ? skewInsight(c.stats, fmt) : null;
  sheet(h`<div class="ph"><h1 style="font-size:20px">${c.icon} ${c.name}</h1><button class="iconbtn" data-act="close" aria-label="Close">${I.close}</button></div>
    <div class="pgrid"><div class="pstat"><div class="eyebrow">Projected month-end</div><div class="pbig">${m0(c.proj)}</div><div class="note">Likely ${m0(c.low)} to ${m0(c.high)}</div></div>
      <div class="pstat"><div class="eyebrow">${c.limit != null ? 'Budget' : 'Spent so far'}</div><div class="pbig">${m0(c.limit != null ? c.limit : c.spent)}</div><div class="note">${c.limit != null ? `${m0(c.spent)} spent${c.safeEveryday != null ? ` · ${m0(c.safeEveryday)}/day everyday keeps you inside` : ''}` : 'No budget set'}</div></div></div>
    <div class="pkv wide"><div class="pk"><span>Fixed paid</span><b>${m0(c.fixedPaid)}</b></div><div class="pk"><span>Still due</span><b class="${c.upcomingSum > 0 ? 'warn' : ''}">${c.upcomingSum > 0 ? m0(c.upcomingSum) : '—'}</b></div><div class="pk"><span>One-offs</span><b>${m0(c.oneOffs)}</b></div><div class="pk"><span>Everyday so far</span><b>${m0(c.everydaySpent)}</b></div></div>
    <div><div class="eyebrow" style="margin-bottom:4px">Day by day this month</div><div class="chart">${dayBars(c, a)}</div><div class="plegend"><span><i style="background:var(--accent)"></i>Day</span><span><i style="background:var(--red)"></i>Big day</span><span><i style="background:var(--muted)"></i>Usual</span>${c.limit != null ? h`<span><i class="dash" style="border-color:var(--amber)"></i>Budget a day</span>` : ''}</div></div>
    ${adv.map((x) => h`<div class="insight ${tone(x.tone)}"><span class="ic">${x.icon}</span><div class="grow itext">${x.text}</div></div>`)}
    ${sk ? h`<div class="insight ${sk.tone}"><span class="ic">${sk.icon}</span><div class="grow"><b>${sk.title}</b><div class="itext">${sk.text}</div></div></div>` : ''}
    ${c.top.length ? h`<div><div class="eyebrow" style="margin-bottom:6px">Biggest this month</div>${c.top.map((t) => h`<div class="toprow"><span class="grow ellipsis">${t.note || 'No note'}</span><span class="muted">${t.date.slice(8)}/${t.date.slice(5, 7)}</span><b>${m0(t.amount)}</b></div>`)}</div>` : ''}
    <div class="row" style="gap:10px"><a class="btn ghost" href="#/transactions${qs({ category: c.id })}" data-act="close" style="flex:1;text-align:center">See transactions</a><button class="btn" data-act="close" style="flex:1">Done</button></div>`);
}

function howSheet() {
  sheet(h`<h1 style="font-size:20px">How this is worked out</h1>
    <p class="muted" style="line-height:1.5">Plain arithmetic on your own entries, on this device. No AI model, and nothing leaves your account.</p>
    <div class="col" style="gap:12px;font-size:14px;line-height:1.5">
      <div><b>Fixed, one-off and everyday.</b> Rent, EMIs and bills that repeat (about the same amount, about the same date, or tagged recurring) are counted once: paid ones are done, and ones still to come are added on their date. Single big purchases are counted once and not spread over the days. Only everyday spending becomes a per-day figure.</div>
      <div><b>Usual daily spend.</b> Each previous full month's spend divided by its days, then averaged with recent months counting more (1, ¾, ½ and so on). A month needs at least a week of history.</div>
      <div><b>Savings.</b> Usual income minus usual daily spend times the days in this month.</div>
      <div><b>This month.</b> Spend so far divided by days so far. The month-end projection leans on your history early in the month and on this month as it goes on.</div>
      <div><b>Best savings rate.</b> The highest share of income kept in any previous month, and the daily spend that would repeat it over the days left.</div>
      <div><b>Spiky or steady.</b> We measure skewness: whether a few very large days pull the average up. A spike day is one well above both the usual spread and the upper quartile. The typical day is the median, which big days cannot distort.</div>
      <div><b>Likely range.</b> Daily ups and downs add up over the days left, so the range is the projection give or take that combined swing.</div></div>
    <button class="btn" data-act="close">Got it</button>`);
}
