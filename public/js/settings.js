import * as S from './store.js';
import { downloadCsv, h, html, raw, get, api, bind, loadBoot, state, space, me, wallets, money, parseCents, I, iconBtn, toast, confirmSheet, sheet, avatar, niceDate, initials, pref, setPref, applyTheme, DATE_FORMATS, COLORS, swatches } from './core.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FALLBACK_CCY = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD', 'AED', 'ZAR', 'BRL', 'MXN', 'SEK', 'NOK', 'NZD'];
// Option lists come from the browser's built-in ISO 4217 / IANA data (Intl), so they are complete and need no network.
const currencies = () => { const codes = Intl.supportedValuesOf?.('currency') || FALLBACK_CCY; const dn = new Intl.DisplayNames(['en'], { type: 'currency' });
  return codes.map((c) => { let n = c; try { n = dn.of(c); } catch {} return [c, n]; }).sort((a, b) => a[1].localeCompare(b[1])); };
const zones = () => ['UTC', ...(Intl.supportedValuesOf?.('timeZone') || [])].filter((z, i, a) => a.indexOf(z) === i);
const opt = (v, label, cur) => h`<option value="${v}" ${String(v) === String(cur) ? raw('selected') : ''}>${label}</option>`;
const prefRow = (icon, label, control, hint = '') => h`<div class="list-row" style="align-items:flex-start"><span class="ico" style="width:38px;height:38px;font-size:17px">${icon}</span><div class="grow"><label class="f" style="letter-spacing:0;text-transform:none;font-size:14px;color:var(--text);font-weight:600">${label}${control}</label>${hint ? h`<div class="muted small" style="margin-top:4px">${hint}</div>` : ''}</div></div>`;
const sel = (name, options, cur) => h`<select class="input" name="${name}" data-act="pref" data-name="${name}" style="padding:11px 36px 11px 14px;font-size:15px">${options}</select>`;

export async function main(root) {
  await loadBoot();
  const sp = space(), u = me(), isOwner = sp.owner_id === u.id, full = sp.members.length >= sp.max_members;
  const inviteUrl = `${location.origin}${location.pathname}#/signup?invite=${sp.invite_code}`;
  const ws = sp.week_start, weekEnd = WEEKDAYS[(ws + 6) % 7];
  html(root, h`<h1>Settings</h1>
    <a class="card row" href="#/profile" aria-label="Edit profile"><span class="avatar" style="width:64px;height:64px;font-size:22px;border-radius:20px;background:${sp.members.find((m) => m.id === u.id)?.color || 'var(--accent)'}">${initials(u.name)}</span><div class="grow"><b style="font-size:18px">${u.name}</b><div class="muted small ellipsis">${u.email}</div></div><span class="btn small ghost">Edit profile</span></a>

    <div class="card"><div class="row between" style="margin-bottom:6px"><div class="eyebrow">People on “${sp.name}”</div><span class="muted small">${sp.members.length} of ${sp.max_members}</span></div>
      ${sp.members.map((m) => h`<div class="list-row">${avatar(m)}<span class="grow"><b>${m.name}${m.id === u.id ? ' (you)' : ''}</b>${m.id === sp.owner_id ? h` <span class="tag">owner</span>` : ''}<div class="muted small">${m.email}</div></span>
        ${isOwner && m.id !== u.id ? h`<button class="iconbtn" data-act="remove" data-id="${m.id}" data-name="${m.name}" aria-label="Remove ${m.name}" style="color:var(--red)">${I.trash}</button>` : ''}</div>`)}
      ${full ? h`<div class="muted small" style="padding-top:8px">This account is full.${isOwner ? ' Remove someone to add another person.' : ''}</div>` : h`<div class="inner" style="margin-top:10px"><div class="eyebrow">Invite code</div>
        <div class="row between" style="margin:6px 0"><span class="code">${sp.invite_code}</span><button class="btn small ghost" data-act="copy" data-v="${inviteUrl}">Copy link</button></div>
        <div class="muted small">Share this link or code. Anyone who signs up with it joins this account and instantly sees everything.</div>
        <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="link" data-act="regen">New code</button></div></div>`}
      ${sp.members.length === 1 ? h`<button class="link" data-act="join" style="margin-top:10px">Already have a code? Join their account instead</button>` : ''}</div>

    <div class="card row" style="gap:12px"><span style="font-size:22px">🔄</span><div class="grow"><b>Live sync</b> <span class="pill" id="syncpill" style="margin-left:6px">${S.state.live ? '● live' : S.state.online ? 'connecting…' : 'offline'}</span>
      <div class="muted small" style="margin-top:2px">Open the app on as many phones and computers as you like. Every change is saved in the cloud and pushed to all open devices within about a second. With no signal, entries are kept on this device and sent when you're back online.</div></div></div>

    <div class="sec-title">Preferences</div><div class="card" style="padding:4px 18px">
      ${prefRow('💵', 'Currency (shared)', sel('currency', currencies().map(([c, n]) => opt(c, `${c} — ${n}`, sp.currency)), sp.currency), 'Existing amounts are not converted.')}
      ${prefRow('🕐', 'Time zone (shared)', sel('tz', zones().map((z) => opt(z, z.replace(/_/g, ' '), sp.tz)), sp.tz), 'Decides what “today” and each month mean.')}
      ${prefRow('📅', 'Week starts on (shared)', sel('week_start', WEEKDAYS.map((d, i) => opt(i, d, ws)), ws), `Your weeks run ${WEEKDAYS[ws]} → ${weekEnd}. Used by weekly budgets and weekly analytics.`)}
      ${prefRow('🗓️', 'Date format (this device)', sel('dateFmt', Object.entries(DATE_FORMATS).map(([k, v]) => opt(k, v, pref('dateFmt', 'mdy'))), pref('dateFmt', 'mdy')))}
      ${prefRow('🌓', 'Theme (this device)', sel('theme', [['system', 'Match my device'], ['dark', 'Dark'], ['light', 'Light']].map(([k, v]) => opt(k, v, pref('theme', 'system'))), pref('theme', 'system')))}
      ${prefRow('👛', 'Default wallet (this device)', sel('defaultWallet', [opt('', 'Ask me each time', pref('defaultWallet')), ...state.boot.wallets.map((w) => opt(w.id, w.name, pref('defaultWallet')))], pref('defaultWallet')))}
      <button class="list-row" data-act="rename"><span class="ico" style="width:38px;height:38px">🏷️</span><span class="grow">Account name</span><span class="muted ellipsis" style="max-width:150px">${sp.name}</span><span class="dim">${I.chev}</span></button></div>

    <div class="sec-title">Data</div><div class="card" style="padding:4px 18px">
      <button class="list-row" data-act="recurring"><span class="ico" style="width:38px;height:38px">🔁</span><span class="grow">Recurring transactions</span><span class="dim">${I.chev}</span></button>
      <button class="list-row" data-act="activity"><span class="ico" style="width:38px;height:38px">🧾</span><span class="grow">Activity log</span><span class="dim">${I.chev}</span></button>
      <button class="list-row" data-act="csv"><span class="ico" style="width:38px;height:38px">📤</span><span class="grow">Download backup (CSV)</span><span class="dim">${I.chev}</span></button>
      ${isOwner ? h`<button class="list-row" data-act="wipe"><span class="ico" style="width:38px;height:38px">🗑️</span><span class="grow neg">Delete all data</span></button>` : ''}</div>
    <button class="btn danger" data-act="logout">Sign Out</button><p class="center dim small">Duet Budget 1.2 · Supabase</p>`);

  const refresh = async () => { await loadBoot(); window.dispatchEvent(new HashChangeEvent('hashchange')); };
  const prompt = (title, fields, onSave, cta = 'Save') => { const s = sheet(h`<h1 style="font-size:20px">${title}</h1><form class="col" data-act="f">${fields}<div class="err-msg" id="err"></div><button class="btn">${cta}</button></form>`,
    { submit: { f: async (el) => { try { await onSave(Object.fromEntries(new FormData(el))); s.close(); } catch (e) { s.el.querySelector('#err').textContent = e.message; } } } }); };
  const saveSpace = async (patch, msg) => { await api('PATCH', '/space', patch); toast(msg); await refresh(); };
  bind(root, {
    change: { pref: async (el) => {
      const v = el.value, n = el.dataset.name;
      if (n === 'currency') return saveSpace({ currency: v }, `Currency set to ${v}`);
      if (n === 'tz') return saveSpace({ tz: v }, 'Time zone saved');
      if (n === 'week_start') return saveSpace({ week_start: Number(v) }, `Weeks now start on ${WEEKDAYS[Number(v)]}`);
      setPref(n, v); if (n === 'theme') applyTheme(); toast('Saved'); await refresh();
    } },
    click: {
      copy: async (el) => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Invite link copied'); } catch { prompt('Copy this invite link', h`<input class="input" value="${el.dataset.v}" readonly autofocus>`, async () => {}, 'Done'); } },
      regen: async () => { if (await confirmSheet('New invite code?', 'The old code stops working.', 'Generate')) { await api('POST', '/space/invite/regenerate'); await refresh(); } },
      join: () => prompt('Join a shared account', h`<label class="f">Invite code<input class="input" name="code" autocapitalize="characters" required></label>`, async (d) => { await api('POST', '/space/join', { code: d.code }); toast('Joined!'); await refresh(); }, 'Join'),
      remove: async (el) => { if (await confirmSheet(`Remove ${el.dataset.name}?`, 'They are signed out and moved to their own empty account. Everything they added stays here.', 'Remove')) { await api('DELETE', '/space/members/' + el.dataset.id); toast('Removed'); await refresh(); } },
      rename: () => prompt('Account name', h`<label class="f">Name<input class="input" name="name" value="${sp.name}" maxlength="60" required></label>`, async (d) => { await api('PATCH', '/space', { name: d.name }); await refresh(); }),
      csv: () => downloadCsv(), recurring: () => { location.hash = '#/recurring'; }, activity: () => { location.hash = '#/activity'; },
      wipe: async () => { if (await confirmSheet('Delete all data?', 'Wallets, transactions, budgets, investments and the activity log are removed for EVERYONE on this account. Export a CSV first. This cannot be undone.', 'Delete everything')) { await api('DELETE', '/space/data'); toast('All data deleted'); await refresh(); } },
      logout: async () => { await api('POST', '/auth/logout'); state.boot = null; location.hash = '#/welcome'; },
    } });
}

export async function profile(root) {
  await loadBoot();
  const u = me(), mine = space().members.find((m) => m.id === u.id); let color = mine.color;
  html(root, h`<div class="page-head"><a class="iconbtn" href="#/settings" aria-label="Back">${I.back}</a><h1 style="font-size:20px">Edit profile</h1><span style="width:36px"></span></div>
    <form class="col" data-act="save" style="gap:16px" novalidate>
      <div class="center"><span class="avatar" id="av" style="width:84px;height:84px;font-size:30px;border-radius:26px;margin:0 auto;background:${color}">${initials(u.name)}</span></div>
      <div><div class="eyebrow" style="margin-bottom:8px">Your colour (shown next to what you add)</div>${swatches(color)}</div>
      <label class="f">Name<input class="input" name="name" value="${u.name}" maxlength="60" required></label>
      <label class="f">Email<input class="input" type="email" name="email" value="${u.email}" readonly style="opacity:.7"></label>
      <div class="card col" style="gap:12px"><div class="eyebrow">Change password</div>
        <label class="f">Current password<input class="input" type="password" name="current_password" autocomplete="current-password"></label>
        <label class="f">New password (leave empty to keep)<input class="input" type="password" name="new_password" minlength="8" autocomplete="new-password"></label></div>
      <div class="err-msg" id="err" role="alert"></div><button class="btn" id="go">Save changes</button></form>`);
  bind(root, { click: { swatch: (el) => { color = el.dataset.v; root.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b === el)); root.querySelector('#av').style.background = color; } },
    submit: { save: async (el) => {
      const d = Object.fromEntries(new FormData(el)), err = root.querySelector('#err'), go = root.querySelector('#go'); err.textContent = ''; go.disabled = true;
      try { await api('PATCH', '/me', { name: d.name, email: d.email, color, current_password: d.current_password, new_password: d.new_password || undefined });
        await loadBoot(); toast('Profile saved'); location.hash = '#/settings'; } catch (e) { err.textContent = e.message; go.disabled = false; } } } });
}

export async function activity(root) {
  const { items } = await get('/activity'); await loadBoot();
  html(root, h`<div class="page-head"><a class="iconbtn" href="#/settings" aria-label="Back">${I.back}</a><h1 style="font-size:20px">Activity</h1><span style="width:36px"></span></div>
    <div class="card">${items.length ? items.map((a) => h`<div class="list-row"><span class="grow">${a.text}</span><span class="muted small">${a.ts.slice(5, 16).replace('T', ' ')}</span></div>`) : h`<div class="empty">No activity yet.</div>`}</div>`);
}
// ---------- recurring rules: view, edit and delete ----------
const UNITS = [['daily', 'day'], ['weekly', 'week'], ['monthly', 'month'], ['yearly', 'year']];
/** "Monthly, next 21 Nov", "Every 2 weeks, next 12 Nov" */
export const scheduleText = (r) => { const n = r.every || 1, unit = (UNITS.find((u) => u[0] === r.frequency) || [0, 'month'])[1];
  return `${n === 1 ? { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[r.frequency] : `Every ${n} ${unit}s`} · next ${niceDate(r.next_date)}`; };

export async function recurring(root) {
  const { items } = await get('/recurring'); await loadBoot();
  const catOf = (id) => state.boot?.categories?.find?.((c) => c.id === id) || (S.state.data?.categories || []).find((c) => c.id === id);
  const row = (r) => { const c = catOf(r.category_id); return h`<button class="list-row recrow" data-act="edit" data-id="${r.id}"><span class="grow" style="min-width:0"><b>${r.note || c?.name || r.type}</b><div class="muted small">${scheduleText(r)}</div>
      <div class="row small" style="gap:6px;flex-wrap:wrap;margin-top:4px">${c ? h`<span class="pill">${c.icon} ${c.name}</span>` : ''}${(r.tags || []).map((t) => h`<span class="pill">#${t}</span>`)}</div></span>
      <span style="text-align:right;flex:none"><b class="${r.type === 'income' ? 'pos' : 'neg'}">${money(r.amount_cents)}</b><div class="muted" style="font-size:11px">${r.type}</div></span>${I.chev}</button>`; };
  html(root, h`<div class="page-head"><a class="iconbtn" href="#/settings" aria-label="Back">${I.back}</a><h1 style="font-size:20px">Recurring</h1><span style="width:36px"></span></div>
    <div class="note-card"><b>Tap a recurring entry to change it.</b> Changes apply from its next occurrence onwards. Entries already logged stay exactly as they are. The spending pace and Smart tips use these rules to know what is coming and when.</div>
    <div class="card">${items.length ? items.map(row) : h`<div class="empty"><span class="e">🔁</span>No recurring transactions.<br>Turn on “Recurring” when adding one.</div>`}</div>`);
  bind(root, { click: { edit: (el) => recurringSheet(items.find((r) => r.id === Number(el.dataset.id)), items) } });
}

/** Edit one recurring rule: name, amount, category, tags, period (daily, weekly, monthly, yearly or custom "every N ...") and the next date. */
export function recurringSheet(r, items = []) {
  if (!r) return;
  const supportsEvery = items.some((x) => 'every' in x) || 'every' in r;
  const cats = (S.state.data?.categories || []).filter((c) => c.kind === r.type && !c.archived);
  let period = (r.every || 1) > 1 ? 'custom' : r.frequency, unit = r.frequency, every = r.every || 1;
  const today = S.today();
  const nextHint = () => ({ daily: 'every day', weekly: 'every week', monthly: 'every month', yearly: 'every year', custom: `every ${every} ${(UNITS.find((u) => u[0] === unit) || [0, 'month'])[1]}${every === 1 ? '' : 's'}` }[period]);
  const body = () => h`<div class="row between"><div><h1 style="font-size:22px">Edit recurring</h1><div class="muted small">${r.type[0].toUpperCase() + r.type.slice(1)} · applies from the next occurrence</div></div><button class="iconbtn" data-act="close" aria-label="Close">${I.close}</button></div>
    <form class="col" data-act="save" style="gap:16px" novalidate>
      <label class="f">Name<input class="input" name="note" value="${r.note || ''}" maxlength="80" placeholder="e.g. Netflix"></label>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><label class="f">Amount<input class="input" name="amount" inputmode="decimal" value="${(r.amount_cents / 100).toFixed(2)}" required></label>
        ${r.type === 'transfer' ? '' : h`<label class="f">Category<select class="input" name="category"><option value="">None</option>${cats.map((c) => h`<option value="${c.id}" ${c.id === r.category_id ? raw('selected') : ''}>${c.icon} ${c.name}</option>`)}</select></label>`}</div>
      <label class="f">Tags<input class="input" name="tags" value="${(r.tags || []).map((t) => '#' + t).join(' ')}" placeholder="#subscription #ai"><div class="muted" style="font-size:11px;margin-top:4px">Separate with spaces or commas</div></label>
      <div><div class="eyebrow" style="margin-bottom:8px">Repeats</div>
        <div class="seg" role="tablist" aria-label="Repeat period" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr))">${[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly'], ['custom', 'Custom']].map(([k, l]) => h`<button type="button" role="tab" class="${period === k ? 'on' : ''}" data-act="period" data-k="${k}" style="padding:9px 2px;font-size:12.5px">${l}</button>`)}</div>
        ${period === 'custom' ? h`<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);margin-top:10px"><label class="f">Every<input class="input" name="every" inputmode="numeric" value="${every}"></label>
          <label class="f">Unit<select class="input" name="unit">${UNITS.map(([k, l]) => h`<option value="${k}" ${k === unit ? raw('selected') : ''}>${l}s</option>`)}</select></label></div>
          ${supportsEvery ? '' : h`<div class="note-card warn" style="margin-top:10px"><b>One-time update needed.</b> Custom periods need a small database update. <button type="button" class="link" data-act="sql">Copy the update</button>, paste it in Supabase → SQL Editor → Run, then reopen the app.</div>`}` : ''}</div>
      <label class="f">Next occurrence<input class="input" type="date" name="next" value="${r.next_date}" min="${today}" required><div class="muted" style="font-size:11px;margin-top:4px">Then ${nextHint()}. Pick today or a later date.</div></label>
      <div class="err-msg" id="err" role="alert"></div>
      <div class="row"><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn" ${period === 'custom' && !supportsEvery ? 'disabled' : ''}>Save changes</button></div>
      <button type="button" class="btn danger" data-act="del">Delete this recurring entry</button></form>`;
  const redraw = () => { const f = s.el.querySelector('form'), keep = f ? Object.fromEntries(new FormData(f)) : {}; if (keep.every) every = Number(keep.every) || every; if (keep.unit) unit = keep.unit; s.el.querySelector('.sheet').innerHTML = `<div class="grab"></div>${body().s}`; const g = s.el.querySelector('form'); for (const k of ['note', 'amount', 'tags', 'next', 'category']) if (keep[k] !== undefined && g.elements[k]) g.elements[k].value = keep[k]; };
  const s = sheet(body(), {
    click: {
      period: (el) => { period = el.dataset.k; if (period !== 'custom') unit = period; redraw(); },
      sql: async () => { try { await navigator.clipboard.writeText(await (await fetch('recurring-edit.sql')).text()); toast('Copied. Paste it in the Supabase SQL Editor.'); } catch { toast('Could not copy. Open supabase/recurring-edit.sql from the project.', true); } },
      del: async () => { s.close(); if (await confirmSheet('Delete this recurring entry?', 'No new entries will be created. Entries already logged stay.', 'Delete')) { try { await api('DELETE', '/recurring/' + r.id); toast('Deleted'); window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { toast(e.message, true); } } },
    },
    submit: { save: async (el) => {
      const d = Object.fromEntries(new FormData(el)), err = s.el.querySelector('#err'), amt = parseCents(d.amount || '');
      if (Number.isNaN(amt) || amt <= 0) { err.textContent = 'Enter a valid amount'; return; }
      const freq = period === 'custom' ? d.unit : period, n = period === 'custom' ? Number(d.every) : 1;
      if (period === 'custom' && (!Number.isInteger(n) || n < 1 || n > 365)) { err.textContent = 'Repeat every must be a whole number from 1 to 365'; return; }
      const body = { note: d.note, amount_cents: amt, tags: String(d.tags || '').split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean), frequency: freq, next_date: d.next };
      if (r.type !== 'transfer') body.category_id = d.category ? Number(d.category) : null;
      if (supportsEvery) body.every = n;
      try { await api('PATCH', '/recurring/' + r.id, body); s.close(); toast('Saved. Applies from the next occurrence'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
      catch (e) { err.textContent = e.message; } } },
  });
}
