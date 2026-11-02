// Screen: Spending pace. The two Smart-tip lines in full, a month-so-far chart, the shape of your spending days, and budget-by-budget predictions with a drill-down.
import { h, html, raw, get, bind, money, pct, I, sheet, qs } from './core.js';
import { barColor } from './charts.js';
import { paceLines, skewInsight, catInsight, monthName, skewLabel } from './pace.js';

const compact = (c) => money(c, { compact: true, decimals: false });
const nice = (v) => { const p = 10 ** Math.floor(Math.log10(Math.max(v, 1))); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p; return 10 * p; };
const part = (p) => (Array.isArray(p) ? h`<b class="${{ b: '', ok: 'pos', pos: 'pos', neg: 'neg' }[p[0].trim()] ?? ''}">${p[1]}</b>` : p);
let scope = 'now';                       // which month the day-shape card shows

// ---------------------------------------------------------------------------------------------- charts (inline SVG, no libraries)
function cumChart(a) {
  const W = 340, H = 210, L = 46, R = 10, T = 14, B = 26, iw = W - L - R, ih = H - T - B, dim = a.dim, day = a.day;
  const all = [...a.cum.prior, ...a.cum.cur, a.cum.projEnd, a.cum.targetEnd].filter((v) => v != null), max = nice(Math.max(...all, 1));
  const X = (d) => L + (d / Math.max(1, dim - 1)) * iw, Y = (v) => T + ih - (v / max) * ih;
  const path = (arr) => { let p = '', open = false; arr.forEach((v, i) => { if (v == null) { open = false; return; } p += `${open ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; open = true; }); return p; };
  const grid = [0, 1 / 3, 2 / 3, 1].map((g) => `<line x1="${L}" x2="${W - R}" y1="${Y(max * g)}" y2="${Y(max * g)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${L - 6}" y="${Y(max * g) + 3.5}" text-anchor="end" font-size="9.5" fill="var(--dim)">${compact(max * g)}</text>`).join('');
  const xl = [1, Math.round(dim / 4), Math.round(dim / 2), Math.round((3 * dim) / 4), dim].map((d) => `<text x="${X(d - 1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--dim)">${d}</text>`).join('');
  const cur = a.cum.cur[day - 1] ?? 0, proj = `M${X(day - 1)} ${Y(cur)}L${X(dim - 1)} ${Y(a.cum.projEnd)}`, tgt = a.cum.targetEnd != null ? `M${X(day - 1)} ${Y(cur)}L${X(dim - 1)} ${Y(a.cum.targetEnd)}` : '';
  const endLab = (v, col, dy, t) => `<text x="${W - R}" y="${Y(v) + dy}" text-anchor="end" font-size="10" font-weight="700" fill="${col}">${t}</text>`;
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Spending this month compared with a usual month">${grid}${xl}
    <line x1="${X(day - 1)}" x2="${X(day - 1)}" y1="${T}" y2="${T + ih}" stroke="var(--muted)" stroke-dasharray="2 3" opacity=".6"/>
    <path d="${path(a.cum.prior)}" fill="none" stroke="var(--muted)" stroke-width="2" opacity=".75"/>
    ${tgt ? `<path d="${tgt}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
    <path d="${proj}" fill="none" stroke="var(--amber)" stroke-width="2" stroke-dasharray="5 4"/>
    <path d="${path(a.cum.cur)}" fill="none" stroke="var(--text)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${X(day - 1)}" cy="${Y(cur)}" r="4.5" fill="var(--text)"/>
    ${endLab(a.cum.projEnd, 'var(--amber)', a.cum.targetEnd != null && a.cum.targetEnd > a.cum.projEnd ? 12 : -5, `pace ${compact(a.cum.projEnd)}`)}${a.cum.targetEnd != null ? endLab(a.cum.targetEnd, 'var(--accent)', a.cum.targetEnd > a.cum.projEnd ? -5 : 12, `target ${compact(a.cum.targetEnd)}`) : ''}</svg>`);
}
const spark = (vals, fence, w = 72, hgt = 24) => { const mx = Math.max(...vals, 1), bw = w / Math.max(vals.length, 1); return raw(`<svg viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" aria-hidden="true">${vals.map((v, i) => { const bh = v > 0 ? Math.max(2, (v / mx) * (hgt - 2)) : 1; return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(hgt - bh).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${v > fence && v > 0 ? 'var(--red)' : v === 0 ? 'var(--line)' : 'var(--accent)'}"/>`; }).join('')}</svg>`); };
function dayBars(c, a) {
  const W = 340, H = 170, L = 38, R = 8, T = 10, B = 22, iw = W - L - R, ih = H - T - B, dim = a.dim, st = c.stats;
  const mx = nice(Math.max(...c.daily, ...c.prevAvg.filter((v) => v != null), c.limit ? c.limit / dim : 0, 1)), Y = (v) => T + ih - (v / mx) * ih, slot = iw / dim, bw = Math.max(2, slot - 1.5), fence = st ? st.fence : Infinity;
  const bars = c.daily.map((v, i) => (v > 0 ? `<rect x="${(L + i * slot).toFixed(1)}" y="${Y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(T + ih - Y(v)).toFixed(1)}" rx="2" fill="${v > fence ? 'var(--red)' : 'var(--accent)'}"><title>Day ${i + 1}: ${money(v)}</title></rect>` : '')).join('');
  let p = '', open = false; c.prevAvg.forEach((v, i) => { if (v == null) { open = false; return; } p += `${open ? 'L' : 'M'}${(L + i * slot + bw / 2).toFixed(1)} ${Y(v).toFixed(1)}`; open = true; });
  const grid = [0, 0.5, 1].map((g) => `<line x1="${L}" x2="${W - R}" y1="${Y(mx * g)}" y2="${Y(mx * g)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${L - 5}" y="${Y(mx * g) + 3.5}" text-anchor="end" font-size="9.5" fill="var(--dim)">${compact(mx * g)}</text>`).join('');
  const xl = [1, Math.round(dim / 2), dim].map((d) => `<text x="${L + (d - 1) * slot + bw / 2}" y="${H - 7}" text-anchor="middle" font-size="10" fill="var(--dim)">${d}</text>`).join('');
  const lim = c.limit ? `<line x1="${L}" x2="${W - R}" y1="${Y(c.limit / dim)}" y2="${Y(c.limit / dim)}" stroke="var(--amber)" stroke-dasharray="5 4" stroke-width="1.6"/>` : '';
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Daily spending in ${c.name}">${grid}${xl}${bars}<path d="${p}" fill="none" stroke="var(--muted)" stroke-width="1.8" opacity=".85"/>${lim}</svg>`);
}
/** Day-size histogram: how many days fall into each size, and how much of the money those days carry. */
function shape(st) {
  if (!st || !st.n) return null;
  const ref = st.median > 0 ? st.median : st.mean || 1, fence = Math.max(st.fence, 1.5 * ref);
  const defs = [['No spend', (v) => v === 0, '#1DDB97'], ['Small', (v) => v > 0 && v <= 0.5 * ref, '#4C8DF6'], ['Typical', (v) => v > 0.5 * ref && v <= 1.5 * ref, '#8B97B3'], ['High', (v) => v > 1.5 * ref && v <= fence, '#F5A623'], ['Big spike', (v) => v > fence, '#F04444']];
  return { ref, fence, defs };
}

// ---------------------------------------------------------------------------------------------- screen
export async function screen(root) {
  const s = await get('/summary'), a = s.pace, fmt = (c) => money(c);
  const head = h`<div class="page-head"><a class="iconbtn" href="#/dashboard" aria-label="Back">${I.back}</a><h1 style="font-size:22px">Spending pace</h1><a class="iconbtn" data-act="how" aria-label="How this is calculated" style="font-weight:800">?</a></div>`;
  if (!a?.ok) { html(root, h`${head}<div class="card"><div class="empty"><span class="e">📊</span>Add a few days of income and expenses and your spending pace will appear here.</div></div>`); return bind(root, { click: { how: howSheet } }); }
  const lines = paceLines(a, fmt), n = a.now, u = a.usual, t = a.target, sk = a.skewAll && a.hasPrior ? skewInsight(a.skewAll, fmt, a.spikePlan) : null, skNow = a.skewNow ? skewInsight(a.skewNow, fmt, a.spikePlan) : null;
  const status = t ? { 'on-track': ['pos', 'On track'], tight: ['warn', 'Tight'], passed: ['neg', 'Out of reach'] }[t.status] : null;
  const drawShape = () => {
    const st = scope === 'now' ? a.skewNow : a.skewPrior, sh = shape(st);
    if (!sh) return h`<div class="muted small">Not enough days yet.</div>`;
    const days = scope === 'now' ? a.dailyNow : a.dailyPrior, rows = sh.defs.map(([label, test, col]) => { const sel = days.filter(test), amt = sel.reduce((x, y) => x + y, 0); return { label, col, n: sel.length, share: st.total ? amt / st.total : 0, dayShare: sel.length / days.length }; });
    return h`<div class="col" style="gap:9px">${rows.map((r) => h`<div><div class="row between small"><span class="row gap6"><i style="width:9px;height:9px;border-radius:3px;background:${r.col};display:inline-block"></i><b>${r.label}</b></span><span class="muted">${r.n} day${r.n === 1 ? '' : 's'} · ${Math.round(r.share * 100)}% of spend</span></div>
      <div class="pbar" style="margin-top:4px"><i style="width:${Math.max(r.n ? 3 : 0, r.dayShare * 100)}%;background:${r.col}"></i></div></div>`)}</div>`;
  };
  const catRow = (c) => {
    const base = c.limit ?? (c.perDayUsual != null ? c.perDayUsual * a.dim : null), fracSpent = base ? Math.min(1, c.spent / base) : 0, fracProj = base ? Math.min(1.25, c.proj / base) : 0, col = c.limit ? barColor(Math.min(1, c.proj / c.limit)) : 'var(--muted)';
    const chip = c.status === 'over' ? h`<span class="neg" style="font-weight:700">${c.limit != null && c.spent > c.limit ? 'Over budget' : `Over by ${fmt(c.overBy)}`}</span>` : c.status === 'watch' ? h`<span class="warn" style="font-weight:700">Watch</span>` : c.status === 'ok' ? h`<span class="pos" style="font-weight:700">On track</span>` : h`<span class="muted">No budget</span>`;
    return h`<button class="catrow" data-act="cat" data-id="${c.id}"><div class="row between"><span class="row gap6" style="min-width:0"><span>${c.icon}</span><b class="ellipsis">${c.name}</b></span><span style="text-align:right"><b>${fmt(c.proj)}</b><div class="muted" style="font-size:11px">projected</div></span></div>
      <div class="pbar tall" style="margin:8px 0 6px"><i class="ghost" style="width:${Math.min(100, fracProj * 100)}%;background:${col}"></i><i style="width:${Math.min(100, fracSpent * 100)}%;background:${col}"></i>${c.limit && fracProj > 1 ? '<em class="over">▲</em>' : ''}</div>
      <div class="row between small" style="gap:8px"><span class="muted">${fmt(c.spent)} so far · ${fmt(c.perDayNow)}/day${c.perDayUsual > 0 ? ` vs ${fmt(c.perDayUsual)} usual` : ' · new this month'}</span>${chip}</div>
      <div class="row between small" style="margin-top:6px;gap:8px"><span class="row gap6" style="flex-wrap:wrap">${c.label !== 'steady' ? h`<span class="pill ${c.label === 'spiky' ? 'bad' : ''}">${c.label === 'spiky' ? '🎢 spiky' : c.label === 'big-day heavy' ? '🧱 big days' : '🎢 leaning spiky'}</span>` : h`<span class="pill">〰️ steady</span>`}${c.change != null && Math.abs(c.change) >= 0.15 ? h`<span class="pill ${c.change > 0 ? 'bad' : ''}">${c.change > 0 ? '↑' : '↓'} ${Math.round(Math.abs(c.change) * 100)}%</span>` : ''}</span>${spark(c.daily, c.stats ? c.stats.fence : Infinity)}</div></button>`;
  };
  const over = a.cats.filter((c) => c.status === 'over').length, watch = a.cats.filter((c) => c.status === 'watch').length, ok = a.cats.filter((c) => c.status === 'ok').length;
  const draw = () => {
  html(root, h`${head}
    <div class="card glow"><div class="row between"><div class="eyebrow">${monthName(a.curKey)} · day ${a.day} of ${a.dim}</div>${status ? h`<span class="pill ${status[0] === 'neg' ? 'bad' : ''}"><span class="${status[0]}">${status[1]}</span></span>` : ''}</div>
      <div class="grid g2" style="margin-top:12px;align-items:stretch">
        <div class="inner"><div class="eyebrow">Your usual month</div>${u ? h`<div class="big2">${fmt(u.perDay)}<small>/day</small></div><div class="small" style="margin-top:4px">${u.saves != null ? h`saves <b class="${u.saves >= 0 ? 'pos' : 'neg'}">${fmt(u.saves)}</b> · <b class="${u.saves >= 0 ? 'pos' : 'neg'}">${((u.rate ?? 0) * 100).toFixed(1)}%</b>` : 'log income to see savings'}</div><div class="muted" style="font-size:11px;margin-top:4px">from ${u.months} previous month${u.months === 1 ? '' : 's'}</div>` : h`<div class="muted small" style="margin-top:8px">Needs one full previous month.</div>`}</div>
        <div class="inner"><div class="eyebrow">This month so far</div><div class="big2">${fmt(n.perDay)}<small>/day</small></div><div class="small" style="margin-top:4px">${n.projRate != null ? h`on pace to save <b class="${n.projSaves >= 0 ? 'pos' : 'neg'}">${fmt(n.projSaves)}</b> · <b class="${n.projSaves >= 0 ? 'pos' : 'neg'}">${(n.projRate * 100).toFixed(1)}%</b>` : `${fmt(n.spent)} spent`}</div><div class="muted" style="font-size:11px;margin-top:4px">${n.incomeBasis === 'received' ? 'income received this month' : 'using your typical income'}${a.lowConfidence ? ' · early in the month, figures will settle' : ''}</div></div></div>
      ${t ? h`<div class="inner" style="margin-top:10px"><div class="row between"><span class="small">Best month so far: <b>${monthName(a.best.key)}</b> at <b class="pos">${(a.best.rate * 100).toFixed(1)}%</b> saved</span></div>
        ${t.status === 'passed' ? h`<div class="small neg" style="margin-top:6px">That rate is out of reach this month. Best still possible: <b>${(Math.max(0, t.bestNowRate) * 100).toFixed(1)}%</b>.</div>` : h`<div class="row between" style="margin-top:8px"><span class="small">Spend about <b>${fmt(t.perDayNeeded)}</b> a day to repeat it</span><span class="small muted">now ${fmt(n.perDay)}</span></div><div class="pbar tall" style="margin-top:6px"><i style="width:${Math.min(100, (n.perDay / (t.perDayNeeded || 1)) * 100)}%;background:${barColor(Math.min(1, n.perDay / (t.perDayNeeded || 1)))}"></i></div>`}</div>` : ''}
      <div class="col" style="gap:8px;margin-top:12px">${lines.map((l) => h`<div class="row" style="gap:10px;align-items:flex-start;font-size:13.5px"><span>${l.icon}</span><span>${l.parts.map(part)}</span></div>`)}</div></div>

    <div class="card"><div class="eyebrow" style="margin-bottom:6px">Money out, day by day</div>
      <div class="chart">${cumChart(a)}</div>
      <div class="plegend"><span><i style="background:var(--text)"></i>This month</span><span><i style="background:var(--muted)"></i>A usual month</span><span><i class="dash" style="border-color:var(--amber)"></i>On this pace</span>${t ? h`<span><i class="dash" style="border-color:var(--accent)"></i>To hit ${(a.best.rate * 100).toFixed(0)}% saved</span>` : ''}</div></div>

    <div class="card"><div class="row between" style="margin-bottom:10px"><div class="eyebrow">The shape of your spending days</div>
      <div class="seg small" role="tablist" aria-label="Which days"><button class="${scope === 'now' ? 'on' : ''}" data-act="scope" data-k="now" role="tab">This month</button>${a.hasPrior ? h`<button class="${scope === 'prior' ? 'on' : ''}" data-act="scope" data-k="prior" role="tab">Usual</button>` : ''}</div></div>
      <div id="shape">${drawShape()}</div>
      ${(scope === 'now' ? skNow : sk) ? h`<div class="insight ${(scope === 'now' ? skNow : sk).tone}"><span class="ic">${(scope === 'now' ? skNow : sk).icon}</span><div><b>${(scope === 'now' ? skNow : sk).title}</b><div class="small" style="margin-top:2px;line-height:1.45">${(scope === 'now' ? skNow : sk).text}</div></div></div>` : ''}
      ${(scope === 'now' ? a.skewNow : a.skewPrior)?.n >= 5 ? h`<div class="muted" style="font-size:11px;margin-top:8px;line-height:1.4">Skew ${(scope === 'now' ? a.skewNow : a.skewPrior).skew.toFixed(2)}: above 1 means a few big days pull the average up; near 0 means steady; below −0.5 means a few very light days pull it down.</div>` : ''}</div>

    <div class="card"><div class="row between"><h2 style="font-size:18px">Budget by budget</h2><a class="link" href="#/budgets">Budgets →</a></div>
      <div class="row small" style="gap:12px;margin:8px 0 12px;flex-wrap:wrap"><span class="neg"><b>${over}</b> will go over</span><span class="warn"><b>${watch}</b> to watch</span><span class="pos"><b>${ok}</b> on track</span></div>
      <div class="col" style="gap:10px">${a.cats.map(catRow)}${!a.cats.length ? h`<div class="muted small">No spending recorded yet this month.</div>` : ''}</div>
      <div class="muted" style="font-size:11px;margin-top:10px;line-height:1.4">Tap a row to drill down. The faint bar is the projected month-end, the solid bar is what you have spent.</div></div>`);
  };
  draw();
  bind(root, { click: { how: howSheet, scope: (el) => { scope = el.dataset.k; draw(); }, cat: (el) => drill(a, Number(el.dataset.id)) } });
}

function drill(a, id) {
  const c = a.cats.find((x) => x.id === id); if (!c) return; const fmt = (x) => money(x);
  const sk = c.stats && c.stats.n >= 5 ? skewInsight(c.stats, fmt) : null;
  sheet(h`<div class="row between"><h1 style="font-size:20px">${c.icon} ${c.name}</h1><button class="iconbtn" data-act="close" aria-label="Close">${I.close || ''}</button></div>
    <div class="grid g2"><div class="inner"><div class="eyebrow">Projected month-end</div><div class="big2">${fmt(c.proj)}</div><div class="muted" style="font-size:11px;margin-top:2px">likely ${fmt(c.low)} to ${fmt(c.high)}</div></div>
      <div class="inner"><div class="eyebrow">${c.limit != null ? 'Budget' : 'Spent so far'}</div><div class="big2">${fmt(c.limit != null ? c.limit : c.spent)}</div><div class="muted" style="font-size:11px;margin-top:2px">${c.limit != null ? `${fmt(c.spent)} spent · ${c.safePerDay != null ? `${fmt(c.safePerDay)}/day keeps you inside` : 'month over'}` : 'no budget set'}</div></div></div>
    <div><div class="eyebrow" style="margin-bottom:4px">Day by day this month</div><div class="chart">${dayBars(c, a)}</div><div class="plegend"><span><i style="background:var(--accent)"></i>Day</span><span><i style="background:var(--red)"></i>Big day</span><span><i style="background:var(--muted)"></i>Usual</span>${c.limit != null ? h`<span><i class="dash" style="border-color:var(--amber)"></i>Budget a day</span>` : ''}</div></div>
    <div class="insight ${c.status === 'over' ? 'warn' : 'good'}"><span class="ic">${c.status === 'over' ? '⚠️' : c.status === 'watch' ? '👀' : '✅'}</span><div class="small" style="line-height:1.45">${catInsight(c, fmt, a.left)}</div></div>
    ${sk ? h`<div class="insight ${sk.tone}"><span class="ic">${sk.icon}</span><div><b>${sk.title}</b><div class="small" style="margin-top:2px;line-height:1.45">${sk.text}</div></div></div>` : ''}
    ${c.top.length ? h`<div><div class="eyebrow" style="margin-bottom:6px">Biggest this month</div>${c.top.map((t) => h`<div class="row between small" style="padding:6px 0;border-top:1px solid var(--line)"><span>${t.note || 'No note'} <span class="muted">· ${t.date.slice(8)}/${t.date.slice(5, 7)}</span></span><b>${fmt(t.amount)}</b></div>`)}</div>` : ''}
    <div class="row" style="gap:10px"><a class="btn ghost" href="#/transactions${qs({ category: c.id })}" data-act="close" style="flex:1;text-align:center">See transactions</a><button class="btn" data-act="close" style="flex:1">Done</button></div>`);
}

function howSheet() {
  sheet(h`<h1 style="font-size:20px">How this is worked out</h1>
    <p class="muted" style="line-height:1.5">Plain arithmetic on your own entries, on this device. No AI model, and nothing leaves your account.</p>
    <div class="col" style="gap:12px;font-size:14px;line-height:1.5">
      <div><b>Usual daily spend.</b> Each previous full month's spend divided by its days, then averaged with recent months counting more (1, ¾, ½ and so on). A month needs at least a week of history.</div>
      <div><b>Savings.</b> Usual income minus usual daily spend times the days in this month.</div>
      <div><b>This month.</b> Spend so far divided by days so far. The month-end projection leans on your history early in the month and on this month as it goes on.</div>
      <div><b>Best savings rate.</b> The highest share of income kept in any previous month, and the daily spend that would repeat it over the days left.</div>
      <div><b>Spiky or steady.</b> We measure skewness: whether a few very large days pull the average up. A spike day is one well above both the usual spread and the upper quartile. The typical day is the median, which big days cannot distort.</div>
      <div><b>Likely range.</b> Daily ups and downs add up over the days left, so the range is the projection give or take that combined swing.</div></div>
    <button class="btn" data-act="close">Got it</button>`);
}
export { raw, skewLabel };
