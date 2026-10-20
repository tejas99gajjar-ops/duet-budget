import { h, html, raw, get, qs, bind, state, space, money, pct, niceDate, monthName, I, avatar, memberById } from './core.js';
import { donut, cashflowBars, stack, bar, barColor } from './charts.js';

// ---- small date helpers (wall-clock YYYY-MM-DD) ----
const P = (d) => d.split('-').map(Number);
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (d, n) => { const [y, m, dd] = P(d); const t = new Date(Date.UTC(y, m - 1, dd + n)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
const addMonths = (d, n) => { const [y, m, dd] = P(d); const i = y * 12 + m - 1 + n, ny = Math.floor(i / 12), nm = (i % 12) + 1; return ymd(ny, nm, Math.min(dd, new Date(Date.UTC(ny, nm, 0)).getUTCDate())); };
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const wdOf = (d) => { const [y, m, dd] = P(d); return (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; };
const shiftAnchor = (period, d, n) => period === 'day' ? addDays(d, n) : period === 'week' ? addDays(d, 7 * n) : period === 'month' ? addMonths(d, n) : addMonths(d, 12 * n);
const short = (d) => { const [y, m, dd] = P(d); return `${monthName(d)} ${dd}`; };

const TITLE = { expense: 'Expenses', income: 'Income', net: 'Net cash' };
const label = (a) => a.period === 'day' ? `${WD[wdOf(a.range.start)]}, ${niceDate(a.range.start)}` : a.period === 'week' ? `${short(a.range.start)} – ${short(a.range.end)}, ${a.range.end.slice(0, 4)}`
  : a.period === 'month' ? `${monthName(a.range.start, true)} ${a.range.start.slice(0, 4)}` : a.range.start.slice(0, 4);
const prevWord = { day: 'yesterday', week: 'last week', month: 'last month', year: 'last year' };
const delta = (cur, prev, goodWhenDown) => {
  if (!prev) return '';
  const d = (cur - prev) / prev, up = d >= 0, good = goodWhenDown ? !up : up;
  return h`<span class="pill" style="${good ? '' : 'color:var(--red);border-color:color-mix(in srgb,var(--red) 35%,transparent);background:color-mix(in srgb,var(--red) 10%,transparent)'}">${up ? '▲' : '▼'} ${Math.round(Math.abs(d) * 100)}% vs ${prevWord[st?.period] || 'previous'}</span>`;
};
let st, last; // current view state (module scoped so delta() can read the period, and a live refresh keeps your selection)

export async function analytics(root, q) {
  st = (!q.period && !q.date && last) ? last : { period: q.period || 'month', anchor: q.date || state.boot.today, kind: q.kind || 'expense', category: null, member: null, mode: 'tx', expanded: false, a: null };
  last = st;
  const isToday = () => { const t = state.boot.today; return st.a && st.a.range.start <= t && t <= st.a.range.end; };

  const draw = async () => {
    const a = st.a = await get('/analytics' + qs({ period: st.period, date: st.anchor, kind: st.kind, category: st.category, member: st.member }));
    const net = st.kind === 'net', income = st.kind === 'income';
    const headline = net ? a.net_cents : income ? a.income_cents : a.expense_cents;
    const bars = a.trend.map((m) => ({ key: m.projected || m.future ? null : m.start, label: m.label, income: m.income_cents, expense: m.expense_cents, projected: m.projected, current: m.start === a.trend.find((t) => t.start <= a.anchor && a.anchor <= t.end)?.start }));
    const sel = a.by_category.find((c) => c.category_id === a.filters.category), selM = a.by_member.find((m) => m.user_id === a.filters.member);
    const cum80 = a.items.findIndex((i) => i.cumulative_share >= 0.8) + 1;
    const maxItem = a.items[0]?.amount_cents || 1;
    const wdStart = a.week_start, wdOrder = [...Array(7).keys()].map((i) => (i + wdStart) % 7), wdMax = Math.max(1, ...a.weekday_cents);
    const shown = st.expanded ? a.items : a.items.slice(0, 12);
    html(root, h`<div class="page-head"><h1>Analytics</h1></div>
      <div class="seg" role="tablist">${['day', 'week', 'month', 'year'].map((p) => h`<button class="${st.period === p ? 'on' : ''}" data-act="period" data-v="${p}" role="tab">${p[0].toUpperCase() + p.slice(1)}</button>`)}</div>
      <div class="row between"><button class="iconbtn" data-act="prev" aria-label="Previous ${st.period}">${I.back}</button>
        <div class="center grow"><button data-act="pickopen" style="font-weight:700;font-size:15px">${label(a)} <span class="dim">▾</span></button>
          <input type="date" id="picker" value="${st.anchor}" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px" aria-label="Pick a date" data-act="pick">
          ${!isToday() ? h`<div><button class="link" data-act="today">Jump to today</button></div>` : ''}</div>
        <button class="iconbtn" data-act="next" aria-label="Next ${st.period}" style="transform:scaleX(-1)">${I.back}</button></div>
      <div class="seg ${st.kind === 'expense' ? 'exp' : ''}" role="tablist">${['expense', 'income', 'net'].map((k) => h`<button class="${st.kind === k ? 'on' : ''}" data-act="kind" data-v="${k}" role="tab">${TITLE[k]}</button>`)}</div>
      <div class="card glow"><div class="eyebrow">${TITLE[st.kind]} · ${label(a)}</div><div class="big ${net ? (headline >= 0 ? 'pos' : 'neg') : income ? 'pos' : ''}" style="margin:4px 0 8px">${net ? money(headline, { sign: true }) : money(headline)}</div>
        ${net ? '' : delta(headline, income ? a.prev.income_cents : a.prev.expense_cents, !income)}${net && a.prev.net_cents ? h`<span class="muted small">${money(a.prev.net_cents, { sign: true })} ${prevWord[a.period]}</span>` : ''}
        <div class="grid g2" style="margin-top:14px"><div class="inner"><div class="eyebrow">Income</div><b class="pos">${money(a.income_cents)}</b></div><div class="inner"><div class="eyebrow">Expenses</div><b class="neg">${money(a.expense_cents)}</b></div>
          <div class="inner"><div class="eyebrow">Avg / day</div><b>${money(a.avg_per_day_cents)}</b></div><div class="inner"><div class="eyebrow">Transactions</div><b>${a.tx_count}</b></div>
          ${a.period !== 'day' && a.busiest_day ? h`<button class="inner" data-act="gotoday" data-v="${a.busiest_day.date}" style="text-align:left"><div class="eyebrow">Biggest spend day</div><b>${money(a.busiest_day.cents)}</b> <span class="muted small">${short(a.busiest_day.date)}</span></button>` : ''}
          ${a.period !== 'day' ? h`<div class="inner"><div class="eyebrow">No-spend days</div><b>${a.no_spend_days}</b> <span class="muted small">of ${a.days}</span></div>` : ''}</div></div>
      <div class="card"><div class="row between" style="margin-bottom:8px"><h2>${{ day: 'Last 7 days', week: 'Last 8 weeks', month: 'Last 6 months', year: 'Each month' }[a.period]}</h2><span class="muted small">tap a bar to open it</span></div>${cashflowBars(bars, (c) => money(c, { compact: true }))}
        <div class="row small muted" style="gap:14px;margin-top:6px"><span><b class="pos">■</b> Income</span><span><b class="neg">■</b> Expenses</span>${a.period === 'month' ? h`<span>▢ Projected</span>` : ''}</div></div>
      ${net ? '' : h`<div class="card"><div class="row between" style="margin-bottom:12px"><h2>${TITLE[st.kind]} by category</h2>${st.category ? h`<button class="chip on" data-act="clearcat">${sel?.icon} ${sel?.name} ✕</button>` : ''}</div>
        ${a.by_category.length ? h`<div class="donut-wrap">${donut(a.by_category.map((c) => ({ value: c.cents, color: c.color, id: c.category_id, dim: st.category && c.category_id !== st.category })), [money(a.total_cents, { compact: true }), 'total'], { size: 170, stroke: 24 })}
          <div class="legend" style="width:100%">${a.by_category.map((c) => h`<button style="display:contents" data-act="cat" data-id="${c.category_id}"><i style="background:${c.color}"></i><span class="ellipsis" style="text-align:left;${st.category === c.category_id ? 'font-weight:800' : ''}">${c.icon} ${c.name}</span><b class="small">${pct(c.share)} · ${money(c.cents)}</b></button>`)}</div></div>`
          : h`<div class="empty"><span class="e">📭</span>Nothing recorded for this period.</div>`}</div>`}
      ${a.by_member.length > 1 && a.total_cents ? h`<div class="card"><h2 style="margin-bottom:10px">Who ${income ? 'earned' : 'spent'}</h2>${stack(a.by_member.map((m) => ({ value: m.cents, color: m.color })))}
        <div class="col" style="gap:6px;margin-top:10px">${a.by_member.map((m) => h`<button class="row between" data-act="member" data-id="${m.user_id}" style="padding:6px 0;${st.member === m.user_id ? 'font-weight:800' : ''}"><span class="row gap6"><span class="avatar" style="background:${m.color};width:24px;height:24px;font-size:9px">${m.name[0]}</span>${m.name}</span><b>${money(m.cents)} <span class="muted small">${pct(m.share)}</span></b></button>`)}</div>
        ${st.member ? h`<button class="chip on" data-act="clearmember" style="margin-top:8px">Showing ${selM?.name} only ✕</button>` : h`<div class="muted small" style="margin-top:6px">Tap a person to see only their ${income ? 'income' : 'spending'}.</div>`}</div>` : ''}
      ${a.period !== 'day' && !net && a.total_cents ? h`<div class="card"><h2 style="margin-bottom:10px">By day of week</h2><div class="row" style="align-items:flex-end;height:90px;gap:8px">${wdOrder.map((d) => h`<div class="grow center" title="${WD[d]}: ${money(a.weekday_cents[d])}"><div style="height:${Math.max(3, (a.weekday_cents[d] / wdMax) * 64)}px;border-radius:6px;background:${barColor(a.weekday_cents[d] / wdMax * 0.5)};opacity:${a.weekday_cents[d] ? 1 : .25}"></div><div class="muted small" style="margin-top:4px">${WD[d][0]}</div></div>`)}</div></div>` : ''}
      <div class="card"><div class="row between" style="margin-bottom:6px"><h2>All ${net ? 'transactions' : TITLE[st.kind].toLowerCase()}</h2>${net ? '' : h`<div class="seg small"><button class="${st.mode === 'tx' ? 'on' : ''}" data-act="mode" data-v="tx">Items</button><button class="${st.mode === 'cat' ? 'on' : ''}" data-act="mode" data-v="cat">Categories</button></div>`}</div>
        ${a.items.length ? h`<div class="inner" style="margin:8px 0 12px;font-size:13px">${st.mode === 'tx' ? h`<b>${cum80}</b> of <b>${a.items.length}</b> ${a.items.length === 1 ? 'item makes' : 'items make'} up <b>80%</b> of ${net ? 'activity' : income ? 'income' : 'spending'} (${money(a.items_total_cents)} total). Top 3 = <b>${pct(a.top3_share)}</b>.` : h`<b>${sel ? sel.name : a.by_category[0]?.name}</b> leads with <b>${pct((sel || a.by_category[0])?.share || 0)}</b> of the total.`}</div>` : ''}
        ${st.mode === 'cat' && !net ? a.by_category.map((c, i) => h`<button class="list-row" data-act="cat" data-id="${c.category_id}"><span class="dim small" style="width:18px">${i + 1}</span><span class="ico" style="width:38px;height:38px">${c.icon}</span><span class="grow"><b>${c.name}</b><div style="height:6px;border-radius:4px;background:var(--inner);margin-top:6px"><i style="display:block;height:100%;width:${(c.cents / a.by_category[0].cents) * 100}%;border-radius:4px;background:${c.color}"></i></div></span><span style="text-align:right"><b>${money(c.cents)}</b><div class="muted small">${pct(c.share)}${!income && a.income_cents ? ` · ${pct(c.cents / a.income_cents)} of income` : ''}</div></span></button>`)
          : shown.map((t, i) => h`<a class="list-row" href="#/tx/${t.id}" style="flex-direction:column;align-items:stretch;gap:8px">
            <span class="row"><span class="dim small" style="width:18px">${i + 1}</span><span class="ico" style="width:38px;height:38px">${t.category?.icon || '•'}</span>
              <span class="grow"><b class="ellipsis" style="display:block">${t.note || t.category?.name || 'Transaction'}</b><span class="muted small">${t.category?.name || ''} · ${niceDate(t.date)}</span></span>
              <b class="${t.type === 'income' ? 'pos' : 'neg'}" style="white-space:nowrap">${t.type === 'income' ? '+' : '-'}${money(t.amount_cents)}</b></span>
            <span style="height:6px;border-radius:4px;background:var(--inner);display:block"><i style="display:block;height:100%;width:${(t.amount_cents / maxItem) * 100}%;border-radius:4px;background:${t.type === 'income' ? 'var(--accent)' : 'var(--red)'}"></i></span>
            <span class="row small" style="flex-wrap:wrap;gap:6px"><span class="tag">${pct(t.share)} of total</span><span class="tag">Σ ${pct(t.cumulative_share)}</span>${t.pct_of_income != null ? h`<span class="tag">${(t.pct_of_income * 100).toFixed(1)}% of income</span>` : ''}${t.pct_of_budget != null ? h`<span class="tag" style="color:${raw(barColor(t.pct_of_budget))}">${pct(t.pct_of_budget)} of budget</span>` : ''}</span></a>`)}
        ${st.mode === 'tx' && a.items.length > 12 ? h`<button class="btn small ghost" data-act="more" style="margin-top:10px">${st.expanded ? 'Show fewer' : `Show all ${a.items.length}`}</button>` : ''}
        ${!a.items.length ? h`<div class="empty"><span class="e">🧾</span>No transactions in this period.</div>` : ''}</div>`);
  };

  bind(root, { click: {
    period: (el) => { st.period = el.dataset.v; st.category = st.member = null; st.expanded = false; return draw(); },
    kind: (el) => { st.kind = el.dataset.v; st.category = st.member = null; st.mode = 'tx'; return draw(); },
    prev: () => { st.anchor = shiftAnchor(st.period, st.anchor, -1); return draw(); },
    next: () => { st.anchor = shiftAnchor(st.period, st.anchor, 1); return draw(); },
    today: () => { st.anchor = state.boot.today; return draw(); },
    pickopen: () => { const i = root.querySelector('#picker'); i.style.pointerEvents = 'auto'; try { i.showPicker(); } catch { i.focus(); i.click(); } },
    bucket: (el) => { st.anchor = el.dataset.key; return draw(); },
    gotoday: (el) => { st.period = 'day'; st.anchor = el.dataset.v; return draw(); },
    cat: (el) => { const id = Number(el.dataset.id); st.category = st.category === id ? null : id; st.mode = 'tx'; return draw(); },
    member: (el) => { const id = el.dataset.id; st.member = st.member === id ? null : id; return draw(); },
    clearcat: () => { st.category = null; return draw(); }, clearmember: () => { st.member = null; return draw(); },
    mode: (el) => { st.mode = el.dataset.v; return draw(); }, more: () => { st.expanded = !st.expanded; return draw(); },
  }, change: { pick: (el) => { if (el.value) { st.anchor = el.value; return draw(); } } } });
  await draw();
}
