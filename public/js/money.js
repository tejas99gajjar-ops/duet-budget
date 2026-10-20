import { downloadCsv, h, html, raw, get, api, qs, bind, loadBoot, state, space, cats, money, parseCents, centsToInput, pct, niceDate, monthName, currencySymbol,
  I, iconBtn, toast, confirmSheet, sheet, swatches, COLORS, WALLET_ICON, byChip, memberById } from './core.js';
import { ring, stack, bar } from './charts.js';
import { groupedRows, txRow, header } from './tx.js';

const reload = async () => { await loadBoot(); };
const pageHead = (title, left = '', right = '') => h`<div class="page-head"><div>${left}<h1>${title}</h1></div><div class="row">${right}</div></div>`;

// ---------- wallets ----------
export async function wallets(root, q) {
  const [s] = await Promise.all([get('/summary'), reload()]);
  const ws = state.boot.wallets, total = ws.reduce((a, w) => a + w.balance_cents, 0);
  html(root, h`${header()}
    <div class="page-head"><div><h1>Your Wallets</h1><div class="sub">Manage cash, bank accounts, savings and shared funds</div></div><button class="btn small" data-act="add">${I.plus} Add</button></div>
    <div class="card row between"><div><div class="eyebrow">Total balance</div><div class="big pos" style="font-size:32px">${money(total)}</div></div>
      <div class="small muted" style="text-align:right">${ws.length} wallet${ws.length === 1 ? '' : 's'} · ${space().currency}<br><span class="${s.income_cents - s.expense_cents >= 0 ? 'pos' : 'neg'}" style="font-weight:600">${money(s.income_cents - s.expense_cents, { sign: true })} this month</span></div></div>
    ${ws.length ? h`<div class="grid g2">${ws.map((w) => h`<a class="wallet" href="#/wallet/${w.id}" style="--c:${w.color}"><div class="row between"><span class="wi">${WALLET_ICON[w.type]}</span><span class="badge">${w.type}</span></div>
        <b class="ellipsis" style="margin-top:6px">${w.name}</b><div class="bal">${money(w.balance_cents)}</div><div class="row between small muted"><span>${w.tx_count} transaction${w.tx_count === 1 ? '' : 's'}</span><span>${space().currency}</span></div></a>`)}</div>`
      : h`<div class="empty card"><span class="e">👛</span>No wallets yet. Add your bank account, cash or a savings pot.</div>`}
    <div class="card"><div class="grid g3">
      <a class="inner center" href="#/tx/new?type=transfer" style="padding:16px 4px"><div class="pos" style="font-size:20px">⇄</div><b class="small">Transfer</b></a>
      <a class="inner center" href="#/portfolio" style="padding:16px 4px"><div class="pos" style="font-size:20px">📈</div><b class="small">Portfolio</b></a>
      <button class="inner center" data-act="csv" style="padding:16px 4px"><div class="pos" style="font-size:20px">⬇</div><b class="small">Export CSV</b></button></div></div>`);
  bind(root, { click: { add: () => walletSheet(), csv: () => downloadCsv() } });
  if (q.add) walletSheet();
}
export function walletSheet(w) {
  let color = w?.color || COLORS[0], type = w?.type || 'bank';
  const body = () => h`<div class="row between"><div><h1 style="font-size:22px">${w ? 'Edit Wallet' : 'Add New Wallet'}</h1><div class="muted small">${w ? 'Rename or recolor this wallet' : 'Track a new account or fund'}</div></div><button class="iconbtn" data-act="close" aria-label="Close">${I.close}</button></div>
    <form class="col" data-act="save" style="gap:16px"><label class="f">Wallet name<input class="input" name="name" value="${w?.name || ''}" placeholder="My New Wallet" maxlength="40" required></label>
      <div><div class="eyebrow" style="margin-bottom:8px">Wallet type</div><div class="grid g4">${['bank', 'cash', 'savings', 'shared'].map((t) => h`<button type="button" class="tile ${t === type ? 'on' : ''}" data-act="type" data-v="${t}"><span class="e">${WALLET_ICON[t]}</span><span>${t[0].toUpperCase() + t.slice(1)}</span></button>`)}</div></div>
      <div class="grid" style="grid-template-columns:2fr 1fr"><label class="f">${w ? 'Starting balance' : 'Initial balance'}<input class="input" name="balance" inputmode="decimal" value="${centsToInput(w?.initial_cents || 0)}"></label>
        <label class="f">Currency<input class="input" value="${space().currency}" disabled></label></div>
      <div><div class="eyebrow" style="margin-bottom:8px">Wallet color</div>${swatches(color)}</div>
      <div class="err-msg" id="err"></div><div class="row"><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">${w ? 'Save' : 'Create Wallet'}</button></div>
      ${w ? h`<button type="button" class="btn danger" data-act="del">Delete wallet</button>` : ''}</form>`;
  const s = sheet(body(), { click: {
    type: (el) => { type = el.dataset.v; redraw(); }, swatch: (el) => { color = el.dataset.v; redraw(); },
    del: async () => { s.close(); if (await confirmSheet('Delete wallet?', 'Wallets with transactions are archived and kept in history.')) { const r = await api('DELETE', '/wallets/' + w.id); toast(r.archived ? 'Archived' : 'Deleted'); await reload(); location.hash = '#/wallets'; } },
  }, submit: { save: async (el) => {
    const d = Object.fromEntries(new FormData(el)); const bal = parseCents(d.balance || '0'); const err = s.el.querySelector('#err');
    if (Number.isNaN(bal)) { err.textContent = 'Enter a valid balance'; return; }
    try { const body = { name: d.name, type, color, initial_cents: bal }; w ? await api('PATCH', '/wallets/' + w.id, body) : await api('POST', '/wallets', body); await reload(); s.close(); toast(w ? 'Saved' : 'Wallet created'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
    catch (e) { err.textContent = e.message; } } } });
  const redraw = () => { const name = s.el.querySelector('[name=name]').value, bal = s.el.querySelector('[name=balance]').value; s.el.querySelector('.sheet').innerHTML = `<div class="grab"></div>${body().s}`; s.el.querySelector('[name=name]').value = name; s.el.querySelector('[name=balance]').value = bal; };
}
export async function walletDetail(root, { id }) {
  await reload(); const w = state.boot.wallets.find((x) => x.id === Number(id)); if (!w) { location.hash = '#/wallets'; return; }
  const r = await get('/transactions' + qs({ wallet: id, limit: 60 }));
  html(root, h`<div class="page-head"><a class="iconbtn" href="#/wallets" aria-label="Back">${I.back}</a><h1 style="font-size:20px">${w.name}</h1>${iconBtn('edit', I.edit, 'Edit wallet')}</div>
    <div class="card center" style="border-top:4px solid ${w.color}"><div class="eyebrow">${w.type} balance</div><div class="big" style="color:${w.color}">${money(w.balance_cents)}</div>
      <div class="row" style="justify-content:center;margin-top:12px"><a class="btn small" href="#/tx/new?wallet=${w.id}">${I.plus} Add</a><a class="btn small ghost" href="#/tx/new?type=transfer&wallet=${w.id}">⇄ Transfer</a></div></div>
    <div class="card">${r.items.length ? groupedRows(r.items) : h`<div class="empty"><span class="e">🧾</span>No transactions in this wallet yet.</div>`}</div>`);
  bind(root, { click: { edit: () => walletSheet(w) } });
}

// ---------- budgets ----------
export async function budgets(root) {
  let mode = 'period', data = null;
  const draw = async () => {
    const [b] = await Promise.all([get('/budgets' + qs({ mode })), cats().length ? 0 : reload()]);
    data = b; const o = b.overall, label = monthName(b.today, true);
    const stCls = (s) => s === 'over' ? 'neg' : s === 'warning' ? 'warn' : 'pos';
    html(root, h`<div class="page-head"><h1>Budgets</h1><div class="seg small"><button class="${mode === 'period' ? 'on' : ''}" data-act="mode" data-v="period">This Month</button><button class="${mode === 'all' ? 'on' : ''}" data-act="mode" data-v="all">All Time</button></div></div>
      ${o ? h`<div class="card row" style="gap:18px">${ring(o.pct, o.status)}<div class="grow"><b>${mode === 'all' ? 'All-time budget' : label + ' Budget'}</b><div class="big" style="font-size:30px;margin:2px 0">${money(o.spent_cents)}</div><div class="muted small">of ${money(o.limit_cents)} budget</div>
          <span class="pill" style="margin-top:8px;white-space:normal;${o.remaining_cents < 0 ? 'color:var(--red);background:transparent' : ''}">${o.remaining_cents < 0 ? money(-o.remaining_cents) + ' over' : money(o.remaining_cents) + ' remaining'}${o.days_left ? ` · ${o.days_left} days left` : ''}</span></div></div>`
        : h`<div class="card empty"><span class="e">🎯</span>Set a limit for a category to see your monthly pacing here.</div>`}
      <div class="card"><div class="row between" style="margin-bottom:14px"><h2 style="font-size:18px">Category Budgets</h2><button class="btn small ghost" data-act="add" style="color:var(--accent)">${I.plus} Add Budget</button></div>
        <div class="col" style="gap:18px">${b.items.length ? b.items.map((i) => h`<button class="col" style="gap:6px;text-align:left" data-act="edit" data-id="${i.id}">
          <div class="row"><span class="ico" style="width:40px;height:40px">${i.category?.icon}</span><div class="grow"><b>${i.category?.name}</b><div class="muted small">${i.tx_count ? `${i.tx_count} transaction${i.tx_count === 1 ? '' : 's'}` : 'No transactions yet'} · ${i.period}${i.rollover ? ' · rollover' : ''}</div></div>
            <div style="text-align:right"><b>${money(i.spent_cents, { decimals: false })} / ${money(i.limit_cents, { decimals: false })}</b><div class="small ${stCls(i.status)}">${pct(i.pct)} spent</div></div></div>
          ${bar(i.pct)}
          <div class="row between small"><span class="${i.status === 'ok' ? 'muted' : stCls(i.status)}">${i.status === 'over' ? `⚠ Over by ${money(-i.remaining_cents)}` : i.status === 'warning' ? `⚠ Almost over budget · ${money(i.remaining_cents)} left` : `${money(i.remaining_cents)} remaining`}</span>
            <span class="${i.status === 'ok' ? 'pos' : 'muted'}">${i.safe_per_day_cents != null ? `Safe: ${money(i.safe_per_day_cents)}/day` : ''}</span></div></button>`)
          : h`<div class="empty"><span class="e">🧮</span>No category budgets yet.</div>`}</div></div>`);
  };
  bind(root, { click: { mode: (el) => { mode = el.dataset.v; draw(); }, add: () => budgetSheet(undefined, new Set(data.items.map((x) => x.category_id))), edit: (el) => budgetSheet(data.items.find((x) => x.id === Number(el.dataset.id))) } });
  await draw();
}
function budgetSheet(b, taken = new Set()) {
  const free = cats('expense').filter((c) => !taken.has(c.id)); let catId = b?.category_id ?? null, period = b?.period || 'monthly', roll = !!b?.rollover;
  const body = () => h`<div class="row between"><div><h1 style="font-size:22px">${b ? 'Edit Budget' : 'Add New Budget'}</h1><div class="muted small">Set a spending limit for a category</div></div><button class="iconbtn" data-act="close" aria-label="Close">${I.close}</button></div>
    <form class="col" data-act="save" style="gap:16px"><div><div class="eyebrow" style="margin-bottom:8px">Category</div>${b ? h`<div class="inner row"><span class="ico">${b.category.icon}</span><b>${b.category.name}</b></div>`
      : h`<div class="chips" id="cats">${free.length ? '' : h`<span class="muted small">Every category already has a budget.</span>`}${free.map((c) => h`<button type="button" class="chip ${c.id === catId ? 'on' : ''}" data-act="cat" data-v="${c.id}">${c.icon} ${c.name}</button>`)}</div>`}</div>
      <label class="f">Budget amount<div class="row input" style="gap:8px"><b class="muted">${currencySymbol()}</b><input name="amount" inputmode="decimal" value="${b ? centsToInput(b.base_cents) : ''}" placeholder="450.00" style="background:none;border:0;outline:0;font-size:22px;font-weight:700;width:100%;color:var(--text)" required></div></label>
      <div><div class="eyebrow" style="margin-bottom:8px">Period</div><div class="grid g3">${['monthly', 'weekly', 'daily'].map((p) => h`<button type="button" class="tile ${p === period ? 'on' : ''}" data-act="period" data-v="${p}" style="padding:14px"><span style="font-size:14px">${p[0].toUpperCase() + p.slice(1)}</span></button>`)}</div></div>
      <div class="card row between" style="padding:14px 16px"><div><b>Rollover unused</b><div class="muted small">Carry leftover budget to the next period</div></div><button type="button" class="switch ${roll ? 'on' : ''}" data-act="roll" role="switch" aria-checked="${roll}" aria-label="Rollover"></button></div>
      <div class="err-msg" id="err"></div><div class="row"><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">${b ? 'Save' : 'Create Budget'}</button></div>
      ${b ? h`<button type="button" class="btn danger" data-act="del">Delete budget</button>` : ''}</form>`;
  const s = sheet(body(), { click: {
    cat: (el) => { catId = Number(el.dataset.v); redraw(); }, period: (el) => { period = el.dataset.v; redraw(); }, roll: () => { roll = !roll; redraw(); },
    del: async () => { s.close(); if (await confirmSheet('Delete budget?', 'Your transactions are not affected.')) { await api('DELETE', '/budgets/' + b.id); toast('Budget deleted'); window.dispatchEvent(new HashChangeEvent('hashchange')); } },
  }, submit: { save: async (el) => {
    const err = s.el.querySelector('#err'); const amt = parseCents(new FormData(el).get('amount'));
    if (!b && !catId) { err.textContent = 'Choose a category'; return; } if (!(amt > 0)) { err.textContent = 'Enter an amount greater than zero'; return; }
    try { b ? await api('PATCH', '/budgets/' + b.id, { amount_cents: amt, period, rollover: roll }) : await api('POST', '/budgets', { category_id: catId, amount_cents: amt, period, rollover: roll });
      s.close(); toast('Budget saved'); window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { err.textContent = e.message; } } } });
  const redraw = () => { const a = s.el.querySelector('[name=amount]').value; s.el.querySelector('.sheet').innerHTML = `<div class="grab"></div>${body().s}`; s.el.querySelector('[name=amount]').value = a; };
}

// ---------- portfolio ----------
const KIND_COLOR = { stock: 'var(--accent)', crypto: 'var(--blue)', etf: 'var(--amber)', bond: 'var(--purple)', other: 'var(--pink)' };
const KIND_ICON = { stock: '📈', crypto: '🪙', etf: '🧺', bond: '📜', other: '💼' };
export async function portfolio(root) {
  const p = await get('/portfolio');
  html(root, h`<div class="page-head"><div><a class="iconbtn" href="#/wallets" aria-label="Back" style="margin-bottom:8px">${I.back}</a><h1>Portfolio</h1><div class="sub">Prices are entered by hand — no market feed</div></div><button class="btn small ghost" data-act="add" style="color:var(--accent)">${I.plus} Add</button></div>
    <div class="card glow"><div class="muted">Total Portfolio Value</div><div class="big" style="margin:4px 0 10px">${money(p.total_value_cents)}</div>
      <div class="row" style="flex-wrap:wrap"><span class="pill ${p.day_change_cents < 0 ? '' : ''}" style="${p.day_change_cents < 0 ? 'color:var(--red);border-color:var(--red);background:transparent' : ''}">${p.day_change_cents >= 0 ? '▲' : '▼'} ${money(p.day_change_cents, { sign: true })} last update</span>
        <span class="muted small">${money(p.total_gain_cents, { sign: true })} vs cost</span></div></div>
    ${p.items.length ? h`<div class="card"><h2 style="margin-bottom:12px">Asset Allocation</h2>${stack(p.allocation.map((a) => ({ value: a.cents, color: KIND_COLOR[a.kind] })))}
      <div class="grid g2 small" style="margin-top:12px">${p.allocation.map((a) => h`<span class="row gap6"><i style="width:10px;height:10px;border-radius:3px;background:${raw(KIND_COLOR[a.kind])}"></i>${a.kind[0].toUpperCase() + a.kind.slice(1)} ${pct(a.share)}</span>`)}</div></div>
      <div class="card"><div class="row between"><h2 style="font-size:18px">Holdings</h2><span class="muted small">${p.items.length} position${p.items.length === 1 ? '' : 's'}</span></div>
        ${p.items.map((i) => h`<button class="list-row" data-act="edit" data-id="${i.id}"><span class="ico">${KIND_ICON[i.kind]}</span><span class="grow"><b>${i.symbol}</b><div class="muted small ellipsis">${i.quantity} · ${i.name || i.kind}</div></span>
          <span style="text-align:right"><b>${money(i.value_cents)}</b><div class="small ${i.day_change_cents < 0 ? 'neg' : i.day_change_cents > 0 ? 'pos' : 'muted'}">${i.day_change_cents < 0 ? '▼' : i.day_change_cents > 0 ? '▲' : ''} ${(i.day_change_pct * 100).toFixed(1)}%</div></span></button>`)}</div>`
      : h`<div class="card empty"><span class="e">📈</span>Track stocks, ETFs, crypto or bonds you both hold.</div>`}
    <button class="btn ghost" data-act="add" style="border-style:dashed">${I.plus} Add Investment</button>`);
  bind(root, { click: { add: () => investSheet(), edit: (el) => investSheet(p.items.find((x) => x.id === Number(el.dataset.id))) } });
}
function investSheet(i) {
  let kind = i?.kind || 'stock';
  const body = () => h`<div class="row between"><div><h1 style="font-size:22px">${i ? 'Edit Holding' : 'Add Investment'}</h1><div class="muted small">${i ? 'Update the latest price to track the change' : 'Record what you hold'}</div></div><button class="iconbtn" data-act="close" aria-label="Close">${I.close}</button></div>
    <form class="col" data-act="save"><div class="grid g2"><label class="f">Symbol<input class="input" name="symbol" value="${i?.symbol || ''}" maxlength="12" required autocapitalize="characters"></label><label class="f">Name<input class="input" name="name" value="${i?.name || ''}" maxlength="60"></label></div>
      <div class="chips">${['stock', 'etf', 'crypto', 'bond', 'other'].map((k) => h`<button type="button" class="chip ${k === kind ? 'on' : ''}" data-act="kind" data-v="${k}">${k}</button>`)}</div>
      <div class="grid g2"><label class="f">Quantity<input class="input" name="qty" inputmode="decimal" value="${i?.quantity ?? ''}" required></label><label class="f">Price per unit<input class="input" name="price" inputmode="decimal" value="${i ? centsToInput(i.price_cents) : ''}" required></label></div>
      <label class="f">Total cost paid (optional)<input class="input" name="cost" inputmode="decimal" value="${i ? centsToInput(i.cost_cents) : ''}"></label>
      <div class="err-msg" id="err"></div><button class="btn">${i ? 'Save' : 'Add Investment'}</button>${i ? h`<button type="button" class="btn danger" data-act="del">Remove</button>` : ''}</form>`;
  const s = sheet(body(), { click: { kind: (el) => { kind = el.dataset.v; const f = Object.fromEntries(new FormData(s.el.querySelector('form'))); s.el.querySelector('.sheet').innerHTML = `<div class="grab"></div>${body().s}`; for (const [k, v] of Object.entries(f)) { const inp = s.el.querySelector(`[name=${k}]`); if (inp) inp.value = v; } },
      del: async () => { s.close(); if (await confirmSheet('Remove holding?', 'This only removes it from your portfolio view.', 'Remove')) { await api('DELETE', '/investments/' + i.id); window.dispatchEvent(new HashChangeEvent('hashchange')); } } },
    submit: { save: async (el) => { const d = Object.fromEntries(new FormData(el)); const err = s.el.querySelector('#err'); const price = parseCents(d.price), cost = d.cost ? parseCents(d.cost) : 0, qty = Number(d.qty);
      if (!(price > 0) || !(qty > 0) || Number.isNaN(cost)) { err.textContent = 'Enter a valid quantity and price'; return; }
      const body = { symbol: d.symbol, name: d.name, kind, quantity: qty, price_cents: price, cost_cents: cost };
      try { i ? await api('PATCH', '/investments/' + i.id, body) : await api('POST', '/investments', body); s.close(); toast('Saved'); window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { err.textContent = e.message; } } } });
}
