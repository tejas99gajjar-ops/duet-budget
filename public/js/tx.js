import { bar } from './charts.js';
import { paceLines, skewInsight, ordinal, whenText } from './pace.js';
import { pref, h, html, raw, get, api, qs, bind, state, APP_VERSION, space, me, wallets, walletById, cats, catById, memberById, money, parseCents, centsToInput, pct, niceDate, time12, dayLabel,
  avatar, byChip, I, iconBtn, toast, errToast, confirmSheet, sheet, txIcon, currencySymbol } from './core.js';

// ---------- shared row renderers ----------
export function txRow(t, href) {
  const amt = t.type === 'income' ? h`<span class="amt pos">${money(t.amount_cents, { sign: true })}</span>`
    : t.type === 'expense' ? h`<span class="amt neg">-${money(t.amount_cents)}</span>` : h`<span class="amt" style="color:var(--blue)">${money(t.amount_cents)}</span>`;
  const title = t.note || t.category?.name || (t.type === 'transfer' ? 'Transfer' : 'Transaction');
  const where = t.type === 'transfer' ? `${t.wallet_name} → ${t.to_wallet_name}` : t.wallet_name;
  return h`<a class="tx" href="${typeof href === 'function' ? href(t) : `#/tx/${t.id}`}"><span class="ico">${txIcon(t)}</span><span class="grow"><div class="t ellipsis">${title}</div>
    <div class="s">${byChip(t.created_by)}${where}${t.recurring_id ? ' · 🔁' : ''}${t.status === 'pending' ? ' · pending' : ''}</div>
    ${t.tags.length ? h`<div style="margin-top:4px">${t.tags.map((g) => h`<span class="tag">#${g}</span>`)}</div>` : ''}</span>${amt}</a>`;
}
export function groupedRows(items, href) {
  const days = new Map(); for (const t of items) (days.get(t.date) || days.set(t.date, []).get(t.date)).push(t);
  return [...days].map(([d, rows]) => {
    const spent = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount_cents, 0);
    return h`<div class="day"><span>${dayLabel(d)}</span>${spent ? h`<b>${money(spent)}</b>` : ''}</div>${rows.map((t) => txRow(t, href))}`;
  });
}
export const header = (extra = '') => {
  const m = space().members;
  return h`<div class="top"><div class="logo"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg></div>
    <div class="brand grow"><b>Duet Budget</b><small>${space().name.toUpperCase().slice(0, 26)}</small></div>
    <button class="tb-av" data-menu aria-label="Account and settings, shared with ${m.map((x) => x.name).join(' and ')}"><span class="avatars">${m.map(avatar)}</span></button></div>`;
};

// ---------- dashboard ----------
const tipsList = (list) => h`<div class="col" style="gap:10px;margin-top:10px">${list.map((t) => h`<div class="row" style="gap:10px;align-items:flex-start"><span style="font-size:18px">${t.icon}</span><div style="font-size:14px">${t.text}</div></div>`)}</div>`;
const tipPart = (p) => (Array.isArray(p) ? h`<b class="${{ b: '', ok: 'pos', pos: 'pos', neg: 'neg' }[p[0].trim()] ?? ''}">${p[1]}</b>` : p);
export async function dashboard(root) {
  const s = await get('/summary');
  const b = s.budgets, top = [...b.items].sort((a, c) => c.pct - a.pct).slice(0, 2);
  const pace = (i, name, icon) => h`<div ${i.id ? raw(`data-act="bud" data-id="${i.id}" role="link" tabindex="0" style="cursor:pointer"`) : raw('')}><div class="row between" style="margin-bottom:5px"><span class="row gap6"><span>${icon}</span><b style="font-size:13px">${name}</b></span>
      <span class="muted small">${money(i.spent_cents)} / ${money(i.limit_cents)}</span></div>
    ${bar(i.pct)}
    <div class="row between small" style="margin-top:4px"><span class="muted">${pct(i.pct)} spent (${money(Math.max(0, i.remaining_cents))} left)</span>
      <span class="${i.status === 'ok' ? 'pos' : i.status === 'warning' ? 'warn' : 'neg'}">${i.status === 'over' ? 'Over budget' : i.everyday_safe_cents != null ? `Everyday: ${money(i.everyday_safe_cents)}/day` : i.scheduled_only ? '' : i.safe_per_day_cents != null ? `Safe: ${money(i.safe_per_day_cents)}/day` : ''}</span></div>
    ${i.proj_cents != null ? h`<div class="small ${i.pace_status === 'over' ? 'neg' : i.pace_status === 'watch' ? 'warn' : 'muted'}" style="margin-top:3px">On course for ${money(i.proj_cents, { decimals: false })} by month-end${i.due_cents > 0 ? ` · ${money(i.due_cents, { decimals: false })} still due` : ''}</div>` : ''}</div>`;
  const tipLines = paceLines(s.pace, (c) => money(c)), sk = s.pace?.ok && s.pace.skewAll && s.pace.hasPrior ? skewInsight(s.pace.skewAll, (c) => money(c), s.pace.spikePlan) : null;
  const dueList = s.pace?.ok ? s.pace.commit.upcoming.filter((c) => c.status !== 'late').slice(0, 3) : [], coming = dueList.length ? dueList.map((c) => `${c.name} ${money(c.amount, { decimals: false })} on the ${ordinal(c.day)} (${whenText(c.dueIn)})`).join(' · ') + (s.pace.commit.upcoming.length > dueList.length ? ` · +${s.pace.commit.upcoming.length - dueList.length} more` : '') : '';
  const shape = sk && sk.title !== 'Too early to tell' ? { ...sk, first: sk.text.split(/(?<=\.)\s/)[0] } : null;
  const ov = b.overall, over = b.items.filter((i) => i.status === 'over').sort((x, y) => y.pct - x.pct), warn = b.items.filter((i) => i.status === 'warning');
  const ring = (frac, color, txt) => { const r = 40, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0)); return h`<svg class="hring" viewBox="0 0 100 100" role="img" aria-label="${txt}"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--inner)" stroke-width="10"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${raw(color)}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 50 50)"/><text x="50" y="55" text-anchor="middle" class="hring-t">${txt}</text></svg>`; };
  const tone = (st) => (st === 'over' ? 'var(--red)' : st === 'warning' ? 'var(--amber)' : 'var(--accent)');
  // "Needs attention": only things that call for action, each one tap away from the screen that fixes it
  const att = [];
  over.slice(0, 2).forEach((i) => att.push({ href: `#/budget/${i.id}`, icon: i.category?.icon || '⚠️', tone: 'neg', title: `${i.category?.name || 'Budget'} is over budget`, sub: `${money(Math.max(0, -i.remaining_cents))} over · ${money(i.spent_cents)} of ${money(i.limit_cents)}` }));
  if (ov && ov.status !== 'over' && ov.pace_status === 'over') att.push({ href: '#/budgets', icon: '📈', tone: 'warn', title: 'On course to overspend', sub: `About ${money(ov.proj_cents, { decimals: false })} by month-end vs ${money(ov.limit_cents, { decimals: false })} budget` });
  warn.slice(0, 1).forEach((i) => att.push({ href: `#/budget/${i.id}`, icon: i.category?.icon || '⚠️', tone: 'warn', title: `${i.category?.name || 'Budget'} is nearing its limit`, sub: `${pct(i.pct)} spent · ${money(Math.max(0, i.remaining_cents))} left` }));
  dueList.slice(0, 2).forEach((c) => att.push({ href: '#/pace', icon: '📅', tone: 'warn', title: `${c.name} due ${whenText(c.dueIn)}`, sub: `${money(c.amount, { decimals: false })} on the ${ordinal(c.day)}` }));
  if (shape) att.push({ href: '#/pace', icon: shape.icon, tone: shape.tone === 'good' ? 'pos' : 'warn', title: shape.title, sub: shape.first });
  const attRow = (a) => h`<a class="arow" href="${a.href}"><span class="arow-i">${a.icon}</span><span class="grow"><b>${a.title}</b><div class="small muted">${a.sub}</div></span><span class="arow-c ${a.tone}">›</span></a>`;
  const tipsBody = h`${tipLines.length ? h`<div class="col" style="gap:8px">${tipLines.map((l) => h`<a class="tipline" href="#/pace" data-act="close"><span class="ic">${l.icon}</span><span class="grow">${l.parts.map(tipPart)}${l.detail?.length ? h`<span class="tipdetail">${l.detail.join(' ')}</span>` : ''}</span>${I.chev}</a>`)}${coming ? h`<a class="tipshape warn" href="#/pace" data-act="close"><span>📅</span><span class="grow"><b>Coming up.</b> ${coming}</span></a>` : ''}${shape ? h`<a class="tipshape ${shape.tone}" href="#/pace" data-act="close"><span>${shape.icon}</span><span class="grow"><b>${shape.title}.</b> ${shape.first}</span></a>` : ''}</div>` : h`<div class="tipline"><span class="ic">🗓️</span><span class="grow">Log a few days of expenses and income to see your daily spend and savings forecast here.</span></div>`}
    ${s.insights.length ? (tipLines.length ? h`<details class="moretips"><summary>More tips (${s.insights.length})</summary>${tipsList(s.insights)}</details>` : tipsList(s.insights)) : ''}`;
  const tipTotal = tipLines.length + s.insights.length;
  html(root, h`${header()}
    <a class="card glow hcard" href="#/wallets" aria-label="Net worth, open wallets"><div class="row between"><div class="eyebrow">Net worth · all wallets</div><span class="hgo">›</span></div><div class="big" style="margin:6px 0 10px">${money(s.net_worth_cents)}</div>
      ${s.savings_rate != null ? h`<span class="pill">Savings rate ${pct(Math.max(0, s.savings_rate))}</span>` : h`<span class="pill">No income logged this month</span>`}</a>
    <div class="card hcard" role="button" tabindex="0" data-act="month" aria-label="This month, open the budget pacing detail"><div class="row between"><div class="eyebrow">This month</div><span class="hgo">›</span></div>
      <div class="row" style="gap:16px;margin-top:10px;align-items:center">${ov ? ring(ov.pct, tone(ov.status), pct(ov.pct)) : ring(0, 'var(--line)', '–')}
        <div class="grow col" style="gap:4px;min-width:0">${ov ? h`<div class="hnum">${money(ov.spent_cents)}<small> of ${money(ov.limit_cents)}</small></div>
          <div class="small ${ov.remaining_cents < 0 ? 'neg' : 'muted'}">${ov.remaining_cents < 0 ? `${money(-ov.remaining_cents)} over budget` : `${money(ov.remaining_cents)} left`}</div>
          ${ov.proj_cents != null ? h`<div class="small ${ov.pace_status === 'over' ? 'neg' : ov.pace_status === 'watch' ? 'warn' : 'muted'}">On course for ${money(ov.proj_cents, { decimals: false })}</div>` : ''}`
          : h`<div class="hnum" style="font-size:18px">No budget yet</div><a class="link" href="#/budgets">Create your first budget</a>`}</div></div>
      <div class="row" style="margin-top:14px;gap:10px"><div class="inner grow"><div class="eyebrow">Income</div><div class="pos hfig">${money(s.income_cents, { sign: true })}</div></div>
        <div class="inner grow"><div class="eyebrow">Expenses</div><div class="neg hfig">${s.expense_cents ? '-' : ''}${money(s.expense_cents)}</div></div></div></div>
    <div class="card hcard"><div class="row between" style="margin-bottom:6px"><h2>Needs attention</h2>${att.length ? h`<span class="pill bad">${att.length}</span>` : ''}</div>
      <div class="col" style="gap:8px" id="attn">${att.length ? att.slice(0, 4).map(attRow) : h`<div class="arow calm"><span class="arow-i">✅</span><span class="grow"><b>All clear</b><div class="small muted">Nothing needs your attention right now.</div></span></div>`}</div></div>
    <button class="tiprow" data-act="tips" aria-label="Open smart tips"><span class="eyebrow" style="color:var(--amber)">Smart tips${tipTotal ? ` · ${tipTotal}` : ''}</span><span class="tipsum">${tipLines[0] ? tipLines[0].parts.map((p) => (Array.isArray(p) ? p[1] : p)).join('') : 'Log a few days to see forecasts'}</span><span class="tipchev" style="transform:rotate(-90deg)" aria-hidden="true">⌄</span></button>
    <div class="card hcard"><div class="row between" style="margin-bottom:8px"><h2 style="font-size:18px">Latest transactions</h2><a class="link" href="#/transactions">See all →</a></div>
      <form class="row" data-act="search" style="margin-bottom:6px"><input class="input" name="q" placeholder="Search transactions" style="padding:10px 14px;font-size:14px" aria-label="Search"><button class="iconbtn" aria-label="Search">${I.search}</button></form>
      ${s.recent.length ? groupedRows(s.recent.slice(0, 5)) : h`<div class="empty"><span class="e">🧾</span>No transactions yet.<br>Tap <b>+</b> to add your first one.</div>`}</div>`);
  const openMonth = () => {
    const sh = sheet(h`<div class="row between"><h1 style="font-size:20px">Budget pacing</h1><a class="link" href="#/budgets" data-act="close">All budgets →</a></div>
      ${ov ? h`<div class="col" style="gap:16px">${pace(ov, 'Overall Monthly Budget', '🕒')}${[...b.items].sort((x, y) => y.pct - x.pct).map((i) => pace(i, i.category?.name, i.category?.icon))}</div>` : h`<div class="empty"><span class="e">🎯</span>No budgets yet.<br><a class="link" href="#/budgets" data-act="close">Create your first budget</a></div>`}
      <button class="btn ghost" data-act="close">Close</button>`, { click: { bud: (el) => { sh.close(); location.hash = `#/budget/${el.dataset.id}`; } } });
  };
  const openTips = () => { sheet(h`<div class="row between"><h1 style="font-size:20px">Smart tips</h1><button class="link" data-act="why" style="font-size:11px">How are these made?</button></div>${tipsBody}<button class="btn ghost" data-act="close">Close</button>`, { click: { why: () => sheet(h`<h1 style="font-size:20px">How smart tips work</h1><p class="muted">They are plain arithmetic on your own transactions and budgets (spend pace, budget %, month-over-month change, share of income kept). <b>No AI model, LLM or machine learning is used</b>, and nothing leaves your server.</p><p class="muted" style="font-size:11px">App version ${APP_VERSION}</p><button class="btn" data-act="close">Got it</button>`) } }); };
  root.addEventListener('keydown', (e) => { const el = e.target.closest?.('[data-act=month]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMonth(); } });
  bind(root, { submit: { search: (el) => { location.hash = '#/transactions' + qs({ q: new FormData(el).get('q') }); } },
    click: { month: openMonth, tips: openTips } });
  // The plan's status joins "Needs attention" once the planner has loaded in the background (it never blocks the page)
  planRow().then((r) => { const box = root.querySelector('#attn'); if (r && box && box.isConnected) { box.querySelector('.calm')?.remove(); box.insertAdjacentHTML('beforeend', attRow(r).s); } }).catch(() => {});
}
/** One row about the FIRE plan (only when it is off track or has no plan yet). */
async function planRow() {
  const FS = await import('./fire/store.js'); await FS.load(); if (!FS.fs.plan) return null;
  const X = await import('./fire/ctx.js'), g = X.run().gap, p = Math.round((g.pct || 0) * 100);
  return g.pct >= 1 ? null : { href: '#/fire', icon: '🎯', tone: g.pct >= 0.8 ? 'warn' : 'neg', title: 'Retirement plan is behind', sub: `${p}% funded · tap to see how to close the gap` };
}

// ---------- full list with filters ----------
export async function list(root, q) {
  const f = { q: q.q || '', type: q.type || '', wallet: q.wallet || '', member: q.member || '', category: q.category || '' };
  const items = []; let more = false, loading = false;
  const FILTERS = [['type', 'Type', () => [['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']]], ['wallet', 'Wallet', () => wallets().map((w) => [String(w.id), w.name])],
    ['member', 'Person', () => space().members.map((m) => [String(m.id), m.name])], ['category', 'Category', () => cats().map((c) => [String(c.id), `${c.icon} ${c.name}`])]];
  const labelOf = (k, v) => (FILTERS.find((x) => x[0] === k)[2]().find((o) => o[0] === v) || [v, v])[1];
  const activeKeys = () => FILTERS.map((x) => x[0]).filter((k) => f[k]);
  const draw = () => html(root, h`<form class="row" data-act="filter" style="gap:8px"><input class="input grow" name="q" value="${f.q}" placeholder="Search notes, tags, categories" type="search" style="padding:11px 14px;font-size:15px">
      <button type="button" class="iconbtn fbtn ${activeKeys().length ? 'on' : ''}" data-act="filters" aria-label="Filters">${I.filter || '⚙'}${activeKeys().length ? h`<i class="fbadge">${activeKeys().length}</i>` : ''}</button></form>
    ${activeKeys().length ? h`<div class="chips" style="margin-top:-2px">${activeKeys().map((k) => h`<button type="button" class="chip on" data-act="clear" data-k="${k}">${labelOf(k, f[k])} ✕</button>`)}<button type="button" class="chip" data-act="clearall">Clear all</button></div>` : ''}
    <div id="rows">${items.length ? groupedRows(items) : h`<div class="empty"><span class="e">🔎</span>Nothing matches.</div>`}</div>
    ${more ? h`<button class="btn ghost" data-act="more">Load more</button>` : ''}`);
  const filterSheet = () => {
    const sh = sheet(h`<div class="row between"><h1 style="font-size:20px">Filter transactions</h1><button class="iconbtn" data-act="close" aria-label="Close">${I.close}</button></div>
      <form class="col" data-act="apply" style="gap:12px">${FILTERS.map(([k, label, opts]) => h`<label class="f">${label}<select class="input" name="${k}"><option value="">All</option>${opts().map(([v, t]) => h`<option value="${v}" ${f[k] === v ? raw('selected') : ''}>${t}</option>`)}</select></label>`)}
      <div class="row"><button type="button" class="btn ghost" data-act="reset">Clear</button><button class="btn">Show results</button></div></form>`, { submit: { apply: (el) => { Object.assign(f, Object.fromEntries(new FormData(el))); sh.close(); return fetchPage(true); } },
      click: { reset: () => { FILTERS.forEach(([k]) => { f[k] = ''; }); sh.close(); return fetchPage(true); } } });
  };
  const fetchPage = async (reset) => {
    if (loading) return; loading = true;
    if (reset) items.length = 0;
    const r = await get('/transactions' + qs({ ...f, limit: 40, offset: items.length })); items.push(...r.items); more = r.has_more; loading = false; draw();
  };
  bind(root, { submit: { filter: (el) => { f.q = String(new FormData(el).get('q') || ''); return fetchPage(true); } },
    click: { more: () => fetchPage(false), filters: filterSheet, clear: (el) => { f[el.dataset.k] = ''; return fetchPage(true); }, clearall: () => { FILTERS.forEach(([k]) => { f[k] = ''; }); return fetchPage(true); } } });
  await fetchPage(true);
}

// ---------- detail ----------
export async function detail(root, { id }) {
  const t = await get('/transactions/' + id);
  const big = t.type === 'income' ? 'pos' : t.type === 'expense' ? 'neg' : '';
  const row = (icon, label, value) => h`<div class="list-row"><span class="ico" style="width:36px;height:36px;font-size:16px">${icon}</span><span class="muted grow">${label}</span><b style="text-align:right">${value}</b></div>`;
  html(root, h`<div class="page-head"><a class="iconbtn" href="#/dashboard" data-act="back" aria-label="Back">${I.back}</a><h1 style="font-size:20px">Transaction</h1>
      <span class="row">${iconBtn('edit', I.edit, 'Edit')}${iconBtn('del', I.trash, 'Delete', 'style="color:var(--red)"')}</span></div>
    <div class="card center glow" style="padding:28px 18px"><div class="ico" style="width:62px;height:62px;font-size:30px;margin:0 auto 10px;background:var(--inner)">${txIcon(t)}</div>
      <div class="muted">${t.category?.name || (t.type === 'transfer' ? 'Transfer' : 'Uncategorised')}</div>
      <div class="big ${big}" style="margin:4px 0">${t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}${money(t.amount_cents)}</div>
      <div style="font-weight:600">${t.note || ''}</div><span class="pill" style="margin-top:10px">● ${t.status === 'pending' ? 'Pending' : 'Cleared'}</span></div>
    <div class="card" style="padding:6px 18px"><div class="eyebrow" style="padding:14px 0 4px">Details</div>
      ${row('📅', 'Date & Time', `${niceDate(t.date)} · ${time12(t.time)}`)}
      ${row('👛', t.type === 'transfer' ? 'From → To' : 'Wallet', t.type === 'transfer' ? `${t.wallet_name} → ${t.to_wallet_name}` : t.wallet_name)}
      ${row('🧑', 'Added by', t.user_name || '—')}
      ${t.budget_impact ? row('🎯', 'Budget impact', `${pct(t.budget_impact.before_pct)} → ${pct(t.budget_impact.after_pct)} of budget`) : ''}
      ${t.tags.length ? row('🏷️', 'Tags', t.tags.map((g) => '#' + g).join(' ')) : ''}${t.recurring_id ? row('🔁', 'Repeats', 'Recurring') : ''}</div>
    ${t.note ? h`<div class="card"><div class="eyebrow">Note</div><p style="margin-top:8px">${t.note}</p></div>` : ''}
    ${t.similar.length ? h`<div class="card"><div class="eyebrow" style="margin-bottom:6px">Similar transactions</div>${t.similar.map(txRow)}</div>` : ''}
    <a class="btn ghost" href="#/tx/${t.id}/edit">Edit Transaction</a>`);
  bind(root, { click: {
    back: (el, e) => { e.preventDefault(); history.length > 1 ? history.back() : (location.hash = '#/dashboard'); },
    edit: () => { location.hash = `#/tx/${t.id}/edit`; },
    del: async () => { if (await confirmSheet('Delete transaction?', 'This updates wallet balances and budgets for both of you.')) { await api('DELETE', '/transactions/' + t.id); toast('Deleted'); location.hash = '#/dashboard'; } } } });
}

// ---------- add / edit ----------
export async function form(root, q) {
  const editing = q.id ? await get('/transactions/' + q.id) : null;
  const st = editing ? { type: editing.type, amount: centsToInput(editing.amount_cents), category_id: editing.category_id, wallet_id: editing.wallet_id, to_wallet_id: editing.to_wallet_id,
      date: editing.date, time: editing.time, note: editing.note, tags: [...editing.tags], recurring: '', status: editing.status }
    : { type: ['income', 'transfer'].includes(q.type) ? q.type : 'expense', amount: '', category_id: null, wallet_id: Number(q.wallet) || (wallets().some((w) => w.id === Number(pref('defaultWallet'))) ? Number(pref('defaultWallet')) : wallets()[0]?.id), to_wallet_id: null,
      date: state.boot.today, time: new Date().toTimeString().slice(0, 5), note: '', tags: [], recurring: '', status: 'cleared' };
  if (!wallets().length) { html(root, h`<div class="page-head"><a class="iconbtn" href="#/dashboard">${I.back}</a><h1 style="font-size:20px">New Transaction</h1><span style="width:36px"></span></div><div class="empty"><span class="e">👛</span>Create a wallet first so we know where the money lives.<br><br><a class="btn small" href="#/wallets?add=1">Add a wallet</a></div>`); return; }
  const col = () => st.type === 'expense' ? 'var(--red)' : st.type === 'income' ? 'var(--accent)' : 'var(--blue)';
  const pickCat = () => { const list = cats(st.type); if (!list.some((c) => c.id === st.category_id)) st.category_id = null; return list; };
  const draw = () => {
    const list = st.type === 'transfer' ? [] : pickCat();
    html(root, h`<div class="page-head"><a class="iconbtn" href="#/dashboard" data-act="cancel" aria-label="Back">${I.back}</a><h1 style="font-size:20px">${editing ? 'Edit Transaction' : 'New Transaction'}</h1><span style="width:36px"></span></div>
      <div class="seg ${st.type === 'expense' ? 'exp' : st.type === 'transfer' ? 'xfer' : ''}">${['expense', 'income', 'transfer'].map((t) => h`<button type="button" class="${st.type === t ? 'on' : ''}" data-act="type" data-v="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`)}</div>
      <form data-act="save" class="col" novalidate>
        <div class="center"><div class="eyebrow">Amount</div><div class="row" style="justify-content:center;color:${raw(col())}"><span style="font-size:26px;font-weight:700">${currencySymbol()}</span>
          <input class="amount-in" name="amount" inputmode="decimal" placeholder="0.00" value="${st.amount}" style="color:${raw(col())};width:70%" autocomplete="off" aria-label="Amount" data-act="amount"></div></div>
        ${st.type === 'transfer' ? '' : h`<div><div class="eyebrow" style="margin-bottom:8px">Category</div><div class="grid g5">${list.map((c) => h`<button type="button" class="tile ${c.id === st.category_id ? 'on' : ''}" data-act="cat" data-v="${c.id}"><span class="e">${c.icon}</span><span>${c.name.split(' ')[0]}</span></button>`)}
          <button type="button" class="tile" data-act="newcat"><span class="e">＋</span><span>New</span></button></div></div>`}
        <label class="f">${st.type === 'transfer' ? 'From wallet' : 'Wallet'}<select class="input" name="wallet_id">${wallets().map((w) => h`<option value="${w.id}" ${w.id === st.wallet_id ? raw('selected') : ''}>${w.name} · ${money(w.balance_cents)}</option>`)}</select></label>
        ${st.type === 'transfer' ? h`<label class="f">To wallet<select class="input" name="to_wallet_id"><option value="">Choose…</option>${wallets().filter((w) => w.id !== st.wallet_id).map((w) => h`<option value="${w.id}" ${w.id === st.to_wallet_id ? raw('selected') : ''}>${w.name}</option>`)}</select></label>` : ''}
        <div class="grid g2"><label class="f">Date<input class="input" type="date" name="date" value="${st.date}" required></label><label class="f">Time<input class="input" type="time" name="time" value="${st.time}" required></label></div>
        <label class="f">Note<input class="input" name="note" value="${st.note}" maxlength="500" placeholder="What was it for?"></label>
        <div><div class="eyebrow" style="margin-bottom:8px">Tags</div><div class="chips">${st.tags.map((g, i) => h`<span class="chip on">#${g} <button type="button" data-act="rmtag" data-v="${i}" aria-label="Remove tag ${g}">✕</button></span>`)}
          <input class="input" name="tag" placeholder="+ Add tag" style="width:130px;padding:8px 12px;font-size:13px;border-radius:20px" data-act="tag" maxlength="24"></div></div>
        ${editing ? '' : h`<div class="card row between" style="padding:14px 16px"><div><b>Recurring</b><div class="muted small">Repeat this transaction</div></div>
          <div class="row">${st.recurring ? h`<select class="input" name="recurring" style="width:auto;padding:8px 30px 8px 12px;font-size:13px">${['daily', 'weekly', 'monthly', 'yearly'].map((f) => h`<option value="${f}" ${st.recurring === f ? raw('selected') : ''}>${f}</option>`)}</select>` : ''}
          <button type="button" class="switch ${st.recurring ? 'on' : ''}" data-act="recur" role="switch" aria-checked="${!!st.recurring}" aria-label="Recurring"></button></div></div>`}
        <div class="err-msg" id="err" role="alert"></div>
        <button class="btn" id="go" style="background:${raw(col())};color:${raw(st.type === 'income' ? 'var(--on-accent)' : '#fff')}">${editing ? 'Save Changes' : 'Save Transaction'}</button></form>`);
  };
  const sync = () => { const f = root.querySelector('form'); if (!f) return; const d = Object.fromEntries(new FormData(f));
    Object.assign(st, { amount: d.amount ?? st.amount, wallet_id: Number(d.wallet_id) || st.wallet_id, to_wallet_id: d.to_wallet_id ? Number(d.to_wallet_id) : st.to_wallet_id, date: d.date, time: d.time, note: d.note, recurring: d.recurring ?? st.recurring }); };
  const addTag = () => { const i = root.querySelector('[name=tag]'); const v = i?.value.trim().replace(/^#/, ''); if (v && !st.tags.includes(v)) { sync(); st.tags.push(v); draw(); root.querySelector('[name=tag]').focus(); } else if (i) i.value = ''; };
  draw();
  bind(root, {
    click: {
      cancel: (el, e) => { e.preventDefault(); history.length > 1 ? history.back() : (location.hash = '#/dashboard'); },
      type: (el) => { sync(); st.type = el.dataset.v; draw(); }, cat: (el) => { sync(); st.category_id = Number(el.dataset.v); draw(); },
      rmtag: (el) => { sync(); st.tags.splice(Number(el.dataset.v), 1); draw(); },
      recur: () => { sync(); st.recurring = st.recurring ? '' : 'monthly'; draw(); },
      newcat: () => { sync(); const s = sheet(h`<h1 style="font-size:20px">New ${st.type} category</h1><form class="col" data-act="mk"><label class="f">Emoji<input class="input" name="icon" value="🏷️" maxlength="4"></label><label class="f">Name<input class="input" name="name" required maxlength="30"></label><button class="btn">Add category</button></form>`,
        { submit: { mk: async (el) => { const d = Object.fromEntries(new FormData(el)); const r = await api('POST', '/categories', { ...d, kind: st.type }); await (await import('./core.js')).loadBoot(); st.category_id = r.id; s.close(); draw(); } } }); },
    },
    change: { tag: addTag },
    submit: { save: async () => {
      sync(); const err = root.querySelector('#err'), go = root.querySelector('#go'); err.textContent = '';
      const amount = parseCents(st.amount); if (!(amount > 0)) { err.textContent = 'Enter an amount greater than zero'; return; }
      if (st.type === 'transfer' && !st.to_wallet_id) { err.textContent = 'Choose the wallet to transfer to'; return; }
      const body = { type: st.type, amount_cents: amount, wallet_id: st.wallet_id, to_wallet_id: st.type === 'transfer' ? st.to_wallet_id : null, category_id: st.type === 'transfer' ? null : st.category_id,
        note: st.note, tags: st.tags, date: st.date, time: st.time, status: st.status, ...(st.recurring ? { recurring: st.recurring } : {}) };
      go.disabled = true;
      try { if (editing) await api('PATCH', '/transactions/' + editing.id, body); else await api('POST', '/transactions', body);
        toast(editing ? 'Saved' : 'Transaction added'); history.length > 1 && editing ? history.back() : (location.hash = '#/dashboard'); }
      catch (e) { err.textContent = e.message; go.disabled = false; } } },
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.name === 'tag') { e.preventDefault(); addTag(); } });
  root.addEventListener('change', (e) => { if (e.target.name === 'wallet_id' && st.type === 'transfer') { sync(); draw(); } });
}
