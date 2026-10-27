import { bar } from './charts.js';
import { pref, h, html, raw, get, api, qs, bind, state, space, me, wallets, walletById, cats, catById, memberById, money, parseCents, centsToInput, pct, niceDate, time12, dayLabel,
  avatar, byChip, I, iconBtn, toast, errToast, confirmSheet, sheet, txIcon, currencySymbol } from './core.js';

// ---------- shared row renderers ----------
export function txRow(t) {
  const amt = t.type === 'income' ? h`<span class="amt pos">${money(t.amount_cents, { sign: true })}</span>`
    : t.type === 'expense' ? h`<span class="amt neg">-${money(t.amount_cents)}</span>` : h`<span class="amt" style="color:var(--blue)">${money(t.amount_cents)}</span>`;
  const title = t.note || t.category?.name || (t.type === 'transfer' ? 'Transfer' : 'Transaction');
  const where = t.type === 'transfer' ? `${t.wallet_name} → ${t.to_wallet_name}` : t.wallet_name;
  return h`<a class="tx" href="#/tx/${t.id}"><span class="ico">${txIcon(t)}</span><span class="grow"><div class="t ellipsis">${title}</div>
    <div class="s">${byChip(t.created_by)}${where}${t.recurring_id ? ' · 🔁' : ''}${t.status === 'pending' ? ' · pending' : ''}</div>
    ${t.tags.length ? h`<div style="margin-top:4px">${t.tags.map((g) => h`<span class="tag">#${g}</span>`)}</div>` : ''}</span>${amt}</a>`;
}
export function groupedRows(items) {
  const days = new Map(); for (const t of items) (days.get(t.date) || days.set(t.date, []).get(t.date)).push(t);
  return [...days].map(([d, rows]) => {
    const spent = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount_cents, 0);
    return h`<div class="day"><span>${dayLabel(d)}</span>${spent ? h`<b>${money(spent)}</b>` : ''}</div>${rows.map(txRow)}`;
  });
}
export const header = (extra = '') => {
  const m = space().members;
  return h`<div class="top"><div class="logo"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg></div>
    <div class="brand grow"><b>Duet Budget</b><small>${space().name.toUpperCase().slice(0, 26)}</small></div>
    <a class="avatars" href="#/settings" aria-label="Shared with ${m.map((x) => x.name).join(' and ')}">${m.map(avatar)}</a>
    <button class="iconbtn" data-theme-toggle aria-label="Toggle theme">${I.sun}</button>
    <a class="iconbtn" href="#/settings" aria-label="Settings">${I.gear}</a></div>`;
};

// ---------- dashboard ----------
export async function dashboard(root) {
  const s = await get('/summary');
  const b = s.budgets, top = [...b.items].sort((a, c) => c.pct - a.pct).slice(0, 2);
  const pace = (i, name, icon) => h`<div><div class="row between" style="margin-bottom:5px"><span class="row gap6"><span>${icon}</span><b style="font-size:13px">${name}</b></span>
      <span class="muted small">${money(i.spent_cents)} / ${money(i.limit_cents)}</span></div>
    ${bar(i.pct)}
    <div class="row between small" style="margin-top:4px"><span class="muted">${pct(i.pct)} spent (${money(Math.max(0, i.remaining_cents))} left)</span>
      <span class="${i.status === 'ok' ? 'pos' : i.status === 'warning' ? 'warn' : 'neg'}">${i.status === 'over' ? 'Over budget' : i.safe_per_day_cents != null ? `Safe: ${money(i.safe_per_day_cents)}/day` : ''}</span></div></div>`;
  html(root, h`${header()}
    <div class="card glow"><div class="eyebrow">Total net worth (all wallets)</div><div class="big" style="margin:4px 0 10px">${money(s.net_worth_cents)}</div>
      ${s.savings_rate != null ? h`<span class="pill">Savings rate: ${pct(Math.max(0, s.savings_rate))}</span>` : h`<span class="pill">No income logged this month</span>`}
      <div class="row" style="margin-top:14px;align-items:stretch">
        <div class="inner grow"><div class="eyebrow">Income (this month)</div><div class="pos" style="font-size:18px;font-weight:700;margin-top:6px">${money(s.income_cents, { sign: true })}</div></div>
        <div class="inner grow"><div class="eyebrow">Expenses (this month)</div><div class="neg" style="font-size:18px;font-weight:700;margin-top:6px">${s.expense_cents ? '-' : ''}${money(s.expense_cents)}</div></div></div></div>
    <a class="card row" href="#/fire" style="gap:14px;background:linear-gradient(135deg,color-mix(in srgb,#7C5FE6 30%,var(--card)),var(--card))"><span style="font-size:30px">🔥</span><span class="grow"><b style="font-size:16px">FIRE Planner</b><div class="muted small" style="margin-top:2px">Plan your path to financial independence</div></span><span class="dim">${I.chev}</span></a>
    <div class="card"><div class="row between" style="margin-bottom:14px"><h2>Active Budget Pacing</h2><a class="link" href="#/budgets">View Details →</a></div>
      ${b.overall ? h`<div class="col" style="gap:14px">${pace(b.overall, 'Overall Monthly Budget', '🕒')}${top.map((i) => pace(i, i.category?.name, i.category?.icon))}</div>`
        : h`<div class="empty" style="padding:8px"><span class="e">🎯</span>No budgets yet.<br><a class="link" href="#/budgets">Create your first budget</a></div>`}</div>
    ${s.insights.length ? h`<div class="card"><div class="row between"><div class="eyebrow" style="color:var(--amber)">Smart tips</div><button class="link" data-act="why" style="font-size:11px">How are these made?</button></div>
      <div class="col" style="gap:10px;margin-top:10px">${s.insights.map((t) => h`<div class="row" style="gap:10px;align-items:flex-start"><span style="font-size:18px">${t.icon}</span><div style="font-size:14px">${t.text}</div></div>`)}</div></div>` : ''}
    <div class="card"><div class="row between" style="margin-bottom:8px"><h2 style="font-size:18px">Recent Transactions</h2><a class="link" href="#/transactions">See all →</a></div>
      <form class="row" data-act="search" style="margin-bottom:6px"><input class="input" name="q" placeholder="Search transactions" style="padding:10px 14px;font-size:14px" aria-label="Search"><button class="iconbtn" aria-label="Search">${I.search}</button></form>
      ${s.recent.length ? groupedRows(s.recent) : h`<div class="empty"><span class="e">🧾</span>No transactions yet.<br>Tap <b>+</b> to add your first one.</div>`}</div>`);
  bind(root, { submit: { search: (el) => { location.hash = '#/transactions' + qs({ q: new FormData(el).get('q') }); } },
    click: { why: () => { const sh = sheet(h`<h1 style="font-size:20px">How smart tips work</h1><p class="muted">They are plain arithmetic on your own transactions and budgets (spend pace, budget %, month-over-month change, share of income kept). <b>No AI model, LLM or machine learning is used</b>, and nothing leaves your server.</p><button class="btn" data-act="close">Got it</button>`); } } });
}

// ---------- full list with filters ----------
export async function list(root, q) {
  const f = { q: q.q || '', type: q.type || '', wallet: q.wallet || '', member: q.member || '', category: q.category || '' };
  const items = []; let more = false, loading = false;
  const draw = () => html(root, h`<div class="page-head"><a class="iconbtn" href="#/dashboard" aria-label="Back">${I.back}</a><h1 style="font-size:22px">Transactions</h1><span style="width:36px"></span></div>
    <form class="col" data-act="filter" style="gap:8px"><input class="input" name="q" value="${f.q}" placeholder="Search notes, tags, categories" type="search">
      <div class="grid g2"><select class="input" name="type" style="padding:10px 14px;font-size:14px"><option value="">All types</option>${['expense', 'income', 'transfer'].map((t) => h`<option value="${t}" ${f.type === t ? raw('selected') : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`)}</select>
      <select class="input" name="wallet" style="padding:10px 14px;font-size:14px"><option value="">All wallets</option>${wallets().map((w) => h`<option value="${w.id}" ${String(w.id) === f.wallet ? raw('selected') : ''}>${w.name}</option>`)}</select>
      <select class="input" name="member" style="padding:10px 14px;font-size:14px"><option value="">Everyone</option>${space().members.map((m) => h`<option value="${m.id}" ${String(m.id) === f.member ? raw('selected') : ''}>${m.name}</option>`)}</select>
      <select class="input" name="category" style="padding:10px 14px;font-size:14px"><option value="">All categories</option>${cats().map((c) => h`<option value="${c.id}" ${String(c.id) === f.category ? raw('selected') : ''}>${c.icon} ${c.name}</option>`)}</select></div></form>
    <div id="rows">${items.length ? groupedRows(items) : h`<div class="empty"><span class="e">🔎</span>Nothing matches.</div>`}</div>
    ${more ? h`<button class="btn ghost" data-act="more">Load more</button>` : ''}`);
  const fetchPage = async (reset) => {
    if (loading) return; loading = true;
    if (reset) items.length = 0;
    const r = await get('/transactions' + qs({ ...f, limit: 40, offset: items.length })); items.push(...r.items); more = r.has_more; loading = false; draw();
  };
  bind(root, { submit: { filter: (el) => { Object.assign(f, Object.fromEntries(new FormData(el))); return fetchPage(true); } },
    change: { filter: (el) => { if (el.tagName !== 'FORM') return; } }, click: { more: () => fetchPage(false) } });
  root.addEventListener('change', (e) => { if (e.target.matches('select')) { Object.assign(f, Object.fromEntries(new FormData(root.querySelector('form')))); fetchPage(true); } });
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
